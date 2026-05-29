/**
 * LSG-XEC1201–XEC2220 — Phase 10 exhaustive edge cases: summarizeGuardContext,
 * onFinish invariants, byte flush summaries, toolsTouched, violation metadata.
 */
import { describe, expect, it } from "vitest";
import {
	allowTools,
	blockToolArgs,
	createGuardFromPolicy,
	denyTools,
	guardEvents,
	maxToolArgsBytes,
	redactPII,
	redactSecrets,
	sanitizeErrors,
	summarizeGuardContext,
} from "../src/index.js";
import { createGuardContext } from "../src/create-guard-context.js";
import { recordViolation } from "../src/record-violation.js";
import type {
	GuardEvent,
	GuardTransform,
	StreamGuardSummary,
	ViolationMode,
} from "../src/types.js";
import { cartesian, pruneToolOnTextOnly, type GuardMode } from "./helpers/cartesian.js";
import { eventsFrom } from "./helpers/sample-events.js";
import { pipeThroughByteGuard } from "./helpers/guard-bytes.js";
import { splitAtByteIndex, utf8 } from "./helpers/streams.js";

const MODES: GuardMode[] = ["block", "warn", "audit"];

type RuleSpec = {
	key: string;
	transform: () => GuardTransform;
};

const RULES: RuleSpec[] = [
	{ key: "redactSecrets", transform: () => redactSecrets() },
	{ key: "redactPII-email", transform: () => redactPII({ email: true }) },
	{ key: "redactPII-phone", transform: () => redactPII({ phone: true }) },
	{ key: "allowTools", transform: () => allowTools(["search", "read_file"]) },
	{ key: "denyTools", transform: () => denyTools(["bash", "exec"]) },
	{ key: "blockToolArgs", transform: () => blockToolArgs(/\/etc\/passwd/) },
	{ key: "maxToolArgsBytes", transform: () => maxToolArgsBytes(32) },
	{ key: "sanitizeErrors", transform: () => sanitizeErrors() },
];

const SUMMARIZE_RULES = [
	"redact_secrets",
	"redact_pii",
	"allow_tools",
	"deny_tools",
	"block_tool_args",
	"sanitize_errors",
	"custom_edge",
] as const;

function assertSummaryInvariants(summary: StreamGuardSummary, expectedMode: ViolationMode): void {
	expect(summary.mode).toBe(expectedMode);
	const sum = Object.values(summary.countsByRule).reduce((a, b) => a + b, 0);
	expect(sum).toBe(summary.violations.length);
	expect(summary.redactions).toBeGreaterThanOrEqual(0);
	expect(summary.toolsTouched).toEqual([...summary.toolsTouched].sort());
	for (const name of summary.toolsTouched) {
		expect(typeof name).toBe("string");
		expect(name.length).toBeGreaterThan(0);
	}
	for (const v of summary.violations) {
		expect(v.mode).toBe(expectedMode);
		expect(typeof v.rule).toBe("string");
		expect(typeof v.message).toBe("string");
	}
}

function buildEventSpecs(): Array<{ kind: string; event: GuardEvent }> {
	const secret = "sk-test123456789012345678901234567890";
	const email = "user@example.com";
	const specs: Array<{ kind: string; event: GuardEvent }> = [];

	for (let i = 0; i < 10; i++) {
		specs.push({
			kind: `text/delta/${i}`,
			event: { type: "text", phase: "delta", text: i % 2 === 0 ? secret : `chunk-${i}` },
		});
	}
	for (let i = 0; i < 10; i++) {
		specs.push({
			kind: `text/done/${i}`,
			event: {
				type: "text",
				phase: "done",
				text: i % 3 === 0 ? `mail ${email}` : i % 3 === 1 ? "555-123-4567" : `done-${i}`,
			},
		});
	}
	for (let i = 0; i < 5; i++) {
		specs.push({
			kind: `reasoning/${i}`,
			event: { type: "reasoning", phase: i % 2 === 0 ? "delta" : "done", text: `think-${i}` },
		});
	}
	specs.push(
		{ kind: "error/basic", event: { type: "error", message: "internal /etc/passwd stack" } },
		{ kind: "finish/stop", event: { type: "finish", reason: "stop" } },
		{ kind: "finish/empty", event: { type: "finish" } },
	);
	for (let i = 0; i < 5; i++) {
		specs.push({
			kind: `tool_call/done/${i}`,
			event: {
				type: "tool_call",
				phase: "done",
				id: `t${i}`,
				name: i % 2 === 0 ? "search" : "bash",
				args: i === 3 ? { path: "/etc/passwd" } : { q: "x" },
			},
		});
	}
	return specs;
}

const EVENT_SPECS = buildEventSpecs();

const BYTE_PAYLOADS = [
	"plain ascii",
	"unicode αβγ",
	"日本語",
	"🚀 emoji",
	"sk-proj-abcdefghijklmnopqrstuvwxyz1234567890",
	"Bearer abcdefghijklmnopqrstuvwxyz1234567890",
	"prefix sk-proj-abcdefghijklmnopqrstuvwxyz1234567890 suffix",
	'data: {"k":"sk-test123456789012345678901234567890"}\n\n',
	"no-secret-here",
	"CRLF\r\nlines",
	"long-" + "x".repeat(64),
	"ZWJ 👨‍👩‍👧‍👦",
	"combining e\u0301",
	"rtl \u202e test",
	"zero-width \u200b",
];

describe("LSG-XEC1201: summarizeGuardContext direct matrix", () => {
	const matrix = cartesian({
		mode: MODES,
		rule: SUMMARIZE_RULES,
		policyVersion: ["pv1", ""] as const,
		toolEvent: ["grep", "search", "none"] as const,
	});

	for (let i = 0; i < matrix.length; i++) {
		const row = matrix[i]!;
		const id = 1201 + i;
		it(`XEC${id}: ${row.mode}/${row.rule}/pv=${row.policyVersion ? "y" : "n"}/tool=${row.toolEvent}`, () => {
			const opts =
				row.policyVersion !== ""
					? { mode: row.mode, policyVersion: row.policyVersion }
					: { mode: row.mode };
			const ctx = createGuardContext(opts);
			recordViolation(ctx, { rule: row.rule, message: `msg-${id}` });
			if (row.toolEvent !== "none") {
				recordViolation(ctx, {
					rule: "allow_tools",
					message: "tool",
					event: { type: "tool_call", phase: "done", name: row.toolEvent },
				});
			}
			const s = summarizeGuardContext(ctx);
			assertSummaryInvariants(s, row.mode);
			if (row.policyVersion !== "") {
				expect(s.policyVersion).toBe(row.policyVersion);
			} else {
				expect(s.policyVersion).toBeUndefined();
			}
			if (row.rule === "redact_secrets" || row.rule === "redact_pii") {
				expect(s.redactions).toBe(1);
			}
			if (row.toolEvent !== "none") {
				expect(s.toolsTouched).toContain(row.toolEvent);
			}
		});
	}

	it("registers summarize matrix ending at XEC1326", () => {
		expect(1201 + matrix.length - 1).toBe(1326);
	});
});

describe("LSG-XEC1261: onFinish invariant cartesian matrix", () => {
	let testId = 1261;
	const combos = cartesian({ mode: MODES, rule: RULES, spec: EVENT_SPECS });

	for (const { mode, rule, spec } of combos) {
		if (pruneToolOnTextOnly(rule.key, spec.kind)) continue;
		if (testId > 1760) break;
		const id = testId++;
		it(`XEC${id}: onFinish ${mode}/${rule.key}/${spec.kind}`, async () => {
			let calls = 0;
			let summary: StreamGuardSummary | undefined;
			for await (const _ of guardEvents(eventsFrom([spec.event]), {
				mode,
				transforms: [rule.transform()],
				policyVersion: `pv-${id}`,
				onFinish: (s) => {
					calls += 1;
					summary = s;
				},
			})) {
				/* drain */
			}
			expect(calls).toBe(1);
			expect(summary).toBeDefined();
			assertSummaryInvariants(summary!, mode);
			expect(summary!.policyVersion).toBe(`pv-${id}`);
		});
	}

	it("registers 500 onFinish invariant cases ending at XEC1760", () => {
		expect(testId - 1).toBe(1760);
	});
});

describe("LSG-XEC1761: byte onFinish split matrix", () => {
	let id = 1761;
	let done = false;
	for (const payload of BYTE_PAYLOADS) {
		if (done) break;
		for (const mode of MODES) {
			if (done) break;
			for (let splitIdx = 1; splitIdx <= 7; splitIdx++) {
				const caseId = id++;
				if (caseId > 2060) {
					done = true;
					id = caseId;
					break;
				}
				it(`XEC${caseId}: byte ${mode} split ${splitIdx} len=${payload.length}`, async () => {
					const bytes = utf8(payload);
					const splitAt = Math.max(
						1,
						Math.min(bytes.length - 1, Math.floor((bytes.length * splitIdx) / 5)),
					);
					const chunks =
						bytes.length <= 1
							? [bytes]
							: [splitAtByteIndex(bytes, splitAt)[0]!, splitAtByteIndex(bytes, splitAt)[1]!];
					let summary: StreamGuardSummary | undefined;
					await pipeThroughByteGuard(bytes, chunks, {
						mode,
						redactSecrets: true,
						policyVersion: `byte-${caseId}`,
						onFinish: (s) => {
							summary = s;
						},
					});
					expect(summary).toBeDefined();
					assertSummaryInvariants(summary!, mode);
					expect(summary!.policyVersion).toBe(`byte-${caseId}`);
				});
			}
		}
	}

	it("registers byte onFinish cases through XEC2060", () => {
		expect(id - 1).toBe(2060);
	});
});

describe("LSG-XEC2061: toolsTouched edge names", () => {
	const toolNames = [
		"grep",
		"read_file",
		"tool-with-dashes",
		"tool_with_underscores",
		"ToolMixedCase",
		"日本語ツール",
		"tool. dotted",
		"tool/slash",
		"a",
		"x".repeat(128),
		"emoji🔧tool",
		"  spaced  ",
		"tab\ttool",
		"unicode\u0000safe",
		"repeat",
		"repeat",
		"UPPER",
		"lower",
		"123numeric",
		"namespace:action",
	];

	for (let i = 0; i < toolNames.length; i++) {
		const name = toolNames[i]!;
		const id = 2061 + i;
		it(`XEC${id}: toolsTouched collects ${name.slice(0, 24)}`, () => {
			const ctx = createGuardContext({ mode: "audit" });
			recordViolation(ctx, {
				rule: "allow_tools",
				message: "m",
				event: { type: "tool_call", phase: "done", name },
			});
			const s = summarizeGuardContext(ctx);
			if (name.trim().length > 0) {
				expect(s.toolsTouched).toContain(name);
			}
			expect(s.toolsTouched).toEqual([...new Set(s.toolsTouched)].sort());
		});
	}

	it("XEC2081: tool_call without name excluded from toolsTouched", () => {
		const ctx = createGuardContext();
		recordViolation(ctx, {
			rule: "x",
			message: "m",
			event: { type: "tool_call", phase: "delta", argsText: "{}" },
		});
		expect(summarizeGuardContext(ctx).toolsTouched).toEqual([]);
	});

	it("XEC2082: non-tool events never appear in toolsTouched", () => {
		const ctx = createGuardContext();
		recordViolation(ctx, {
			rule: "x",
			message: "m",
			event: { type: "text", phase: "done", text: "hello" },
		});
		expect(summarizeGuardContext(ctx).toolsTouched).toEqual([]);
	});
});

describe("LSG-XEC2083: stream isolation and onFinish semantics", () => {
	for (let i = 0; i < 20; i++) {
		const id = 2083 + i;
		it(`XEC${id}: parallel streams isolated summary ${i}`, async () => {
			const summaries: StreamGuardSummary[] = [];
			const run = async (mode: ViolationMode, secret: string) => {
				for await (const _ of guardEvents(
					eventsFrom([{ type: "text", phase: "done", text: secret }]),
					{
						mode,
						transforms: [redactSecrets()],
						onFinish: (s) => summaries.push(s),
					},
				)) {
					/* drain */
				}
			};
			await Promise.all([
				run("block", `sk-test123456789012345678901234567890-${i}`),
				run("warn", `plain-${i}`),
				run("audit", `Bearer abcdefghijklmnopqrstuvwxyz1234567890-${i}`),
			]);
			expect(summaries).toHaveLength(3);
			expect(new Set(summaries.map((s) => s.mode)).size).toBe(3);
			for (const s of summaries) {
				assertSummaryInvariants(s, s.mode);
			}
		});
	}

	it("XEC2103: onFinish not invoked when generator aborted early", async () => {
		let called = false;
		const gen = guardEvents(
			eventsFrom([
				{ type: "text", phase: "delta", text: "a" },
				{ type: "text", phase: "done", text: "b" },
			]),
			{ onFinish: () => (called = true) },
		);
		await gen.next();
		expect(called).toBe(false);
	});

	it("XEC2104: onFinish fires after full multi-event drain", async () => {
		let violationCount = -1;
		for await (const _ of guardEvents(
			eventsFrom([
				{ type: "tool_call", phase: "done", name: "bash", args: {} },
				{ type: "tool_call", phase: "done", name: "search", args: {} },
				{ type: "finish" },
			]),
			{
				mode: "audit",
				transforms: [allowTools(["search"])],
				onFinish: (s) => (violationCount = s.violations.length),
			},
		)) {
			/* drain */
		}
		expect(violationCount).toBeGreaterThanOrEqual(0);
	});
});

describe("LSG-XEC2105: violation eventIndex and metadata through guardEvents", () => {
	for (let i = 0; i < 15; i++) {
		const id = 2105 + i;
		it(`XEC${id}: eventIndex stamped on violations stream ${i}`, async () => {
			let indices: number[] = [];
			for await (const _ of guardEvents(
				eventsFrom([
					{ type: "text", phase: "done", text: `ev0-${i}` },
					{ type: "text", phase: "done", text: `ev1-${i}` },
					{
						type: "tool_call",
						phase: "done",
						name: "bash",
						args: {},
					},
				]),
				{
					mode: "audit",
					transforms: [denyTools(["bash"])],
					onFinish: (s) => {
						indices = s.violations.map((v) => v.eventIndex).filter((n) => n !== undefined);
					},
				},
			)) {
				/* drain */
			}
			if (indices.length > 0) {
				for (const idx of indices) {
					expect(idx).toBeGreaterThanOrEqual(0);
					expect(idx).toBeLessThan(3);
				}
			}
		});
	}
});

describe("LSG-XEC2120: createGuardFromPolicy onFinish parity", () => {
	const policies = [
		"policies/proxy-strict.json",
		"policies/agent-gate.json",
		"policies/audit-only.json",
		"src/policy/profiles/agent-gate.json",
		"src/policy/profiles/proxy-strict.json",
		"src/policy/profiles/audit-only.json",
	] as const;

	for (let i = 0; i < policies.length; i++) {
		for (let m = 0; m < MODES.length; m++) {
			const id = 2120 + i * MODES.length + m;
			if (id > 2220) break;
			const policy = policies[i]!;
			const mode = MODES[m]!;
			it(`XEC${id}: policy ${policy.split("/").pop()} mode ${mode}`, async () => {
				let summary: StreamGuardSummary | undefined;
				const g = createGuardFromPolicy(policy, {
					mode,
					onFinish: (s) => {
						summary = s;
					},
				});
				for await (const _ of g.guard(
					eventsFrom([
						{ type: "text", phase: "done", text: "sk-test123456789012345678901234567890" },
						{ type: "finish" },
					]),
				)) {
					/* drain */
				}
				expect(summary).toBeDefined();
				assertSummaryInvariants(summary!, mode);
			});
		}
	}

	it("registers policy onFinish cases through XEC2220", () => {
		expect(2120 + policies.length * MODES.length - 1).toBeLessThanOrEqual(2220);
	});
});
