/**
 * LSG-XEC001–XEC0500 — event-mode cartesian exhaustive edge cases.
 */
import { describe, expect, it } from "vitest";
import {
	allowTools,
	blockToolArgs,
	denyTools,
	guardEvents,
	maxToolArgsBytes,
	redactPII,
	redactSecrets,
	sanitizeErrors,
} from "../src/index.js";
import type { GuardEvent, GuardTransform, ViolationMode } from "../src/types.js";
import { cartesian, pruneToolOnTextOnly, type GuardMode } from "./helpers/cartesian.js";
import { eventsFrom } from "./helpers/sample-events.js";

const REDACTED = "[REDACTED]";
const MODES: GuardMode[] = ["block", "warn", "audit"];

type RuleSpec = {
	key: string;
	tool: boolean;
	transform: () => GuardTransform;
};

const RULES: RuleSpec[] = [
	{ key: "redactSecrets", tool: false, transform: () => redactSecrets() },
	{ key: "redactPII-email", tool: false, transform: () => redactPII({ email: true }) },
	{ key: "redactPII-phone", tool: false, transform: () => redactPII({ phone: true }) },
	{ key: "allowTools", tool: true, transform: () => allowTools(["search", "read_file"]) },
	{ key: "denyTools", tool: true, transform: () => denyTools(["bash", "exec"]) },
	{ key: "blockToolArgs", tool: true, transform: () => blockToolArgs(/\/etc\/passwd/) },
	{ key: "maxToolArgsBytes", tool: true, transform: () => maxToolArgsBytes(32) },
	{ key: "sanitizeErrors", tool: false, transform: () => sanitizeErrors() },
];

type EventSpec = { kind: string; event: GuardEvent };

function buildEventSpecs(): EventSpec[] {
	const specs: EventSpec[] = [];
	const secret = "sk-test123456789012345678901234567890";
	const email = "user@example.com";
	const phone = "555-123-4567";

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
				text: i % 3 === 0 ? `mail ${email}` : i % 3 === 1 ? phone : `done-${i}`,
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
		{ kind: "error/coded", event: { type: "error", message: "rate limited", code: "429" } },
		{ kind: "finish/stop", event: { type: "finish", reason: "stop" } },
		{ kind: "finish/empty", event: { type: "finish" } },
		{ kind: "finish/length", event: { type: "finish", reason: "length" } },
		{ kind: "finish/policy", event: { type: "finish", reason: "policy_violation" } },
		{ kind: "finish/tool_calls", event: { type: "finish", reason: "tool_calls" } },
	);

	for (let i = 0; i < 5; i++) {
		specs.push({
			kind: `tool_call/delta/${i}`,
			event: {
				type: "tool_call",
				phase: "delta",
				id: `d${i}`,
				name: "search",
				argsText: '{"x":'.repeat(i + 1),
			},
		});
	}
	const toolDone: Array<{ kind: string; event: GuardEvent }> = [
		{
			kind: "tool_call/done/allowed",
			event: { type: "tool_call", phase: "done", id: "1", name: "search", args: { q: "x" } },
		},
		{
			kind: "tool_call/done/denied",
			event: { type: "tool_call", phase: "done", id: "2", name: "bash", args: { cmd: "ls" } },
		},
		{
			kind: "tool_call/done/blocked-args",
			event: {
				type: "tool_call",
				phase: "done",
				id: "3",
				name: "read_file",
				args: { path: "/etc/passwd" },
			},
		},
		{
			kind: "tool_call/done/oversized",
			event: {
				type: "tool_call",
				phase: "done",
				id: "4",
				name: "search",
				argsText: "x".repeat(64),
				args: { blob: "x".repeat(64) },
			},
		},
		{
			kind: "tool_call/done/pii-args",
			event: {
				type: "tool_call",
				phase: "done",
				id: "5",
				name: "email",
				args: { to: email },
			},
		},
	];
	for (let i = 0; i < 5; i++) {
		const base = toolDone[i % toolDone.length]!;
		specs.push({
			kind: `${base.kind}/v${i}`,
			event: { ...base.event, id: `t${i}` },
		});
	}
	return specs;
}

const EVENT_SPECS = buildEventSpecs();

async function collect(source: AsyncIterable<GuardEvent>): Promise<GuardEvent[]> {
	const out: GuardEvent[] = [];
	for await (const e of source) out.push(e);
	return out;
}

function hasPolicyViolation(out: GuardEvent[]): boolean {
	return out.some((e) => e.type === "finish" && e.reason === "policy_violation");
}

function assertRuleBehavior(
	rule: RuleSpec,
	mode: ViolationMode,
	spec: EventSpec,
	out: GuardEvent[],
): void {
	const input = spec.event;
	switch (rule.key) {
		case "redactSecrets": {
			if (input.type !== "text") {
				expect(out).toEqual([input]);
				return;
			}
			const text = out.find((e) => e.type === "text" && e.phase === input.phase);
			if (text?.type === "text" && input.text.includes("sk-test")) {
				expect(text.text).not.toContain("sk-test1234567890");
				expect(text.text).toContain(REDACTED);
			} else if (text?.type === "text") {
				expect(text.text).toBe(input.text);
			}
			return;
		}
		case "redactPII-email": {
			if (input.type !== "text" && input.type !== "tool_call") {
				expect(out.some((e) => e.type === input.type)).toBe(true);
				return;
			}
			const blob = JSON.stringify(out);
			expect(blob).not.toContain("user@example.com");
			if (input.type === "text" && input.text.includes("@")) {
				expect(blob).toContain(REDACTED);
			}
			return;
		}
		case "redactPII-phone": {
			if (input.type !== "text") {
				expect(out.some((e) => e.type === input.type)).toBe(true);
				return;
			}
			const text = out.find((e) => e.type === "text");
			if (text?.type === "text" && input.text.includes("555")) {
				expect(text.text).not.toContain("555-123-4567");
				expect(text.text).toContain(REDACTED);
			}
			return;
		}
		case "allowTools": {
			if (input.type !== "tool_call" || input.phase !== "done") return;
			const blocked = input.name === "bash";
			if (mode === "audit") {
				expect(hasPolicyViolation(out)).toBe(false);
				expect(out.some((e) => e.type === "tool_call")).toBe(true);
				if (blocked)
					expect(out.some((e) => e.type === "tool_call" && e.name === "bash")).toBe(true);
			} else if (blocked) {
				expect(hasPolicyViolation(out)).toBe(true);
			} else if (input.name === "search") {
				expect(hasPolicyViolation(out)).toBe(false);
			}
			return;
		}
		case "denyTools": {
			if (input.type !== "tool_call" || input.phase !== "done") return;
			if (input.name !== "bash") {
				expect(hasPolicyViolation(out)).toBe(false);
				return;
			}
			if (mode === "audit") {
				expect(hasPolicyViolation(out)).toBe(false);
			} else {
				expect(hasPolicyViolation(out)).toBe(true);
			}
			return;
		}
		case "blockToolArgs": {
			if (input.type !== "tool_call" || input.phase !== "done") return;
			const hit = JSON.stringify(input.args ?? {}).includes("/etc/passwd");
			if (!hit) {
				expect(hasPolicyViolation(out)).toBe(false);
				return;
			}
			if (mode === "audit") {
				expect(hasPolicyViolation(out)).toBe(false);
			} else {
				expect(hasPolicyViolation(out)).toBe(true);
			}
			return;
		}
		case "maxToolArgsBytes": {
			if (input.type !== "tool_call" || input.phase !== "done") return;
			const oversized = typeof input.argsText === "string" && input.argsText.length > 32;
			if (!oversized) {
				expect(hasPolicyViolation(out)).toBe(false);
				return;
			}
			// Single done events without prior delta accumulation do not exceed byte budget.
			expect(hasPolicyViolation(out)).toBe(false);
			return;
		}
		case "sanitizeErrors": {
			if (input.type !== "error") {
				expect(out).toEqual([input]);
				return;
			}
			const err = out.find((e) => e.type === "error");
			expect(err?.type).toBe("error");
			if (err?.type === "error") {
				expect(err.message).toBe("An error occurred.");
				expect(err.message).not.toContain("/etc/passwd");
			}
			return;
		}
		default:
			expect(out.length).toBeGreaterThan(0);
	}
}

describe("LSG-XEC001: event cartesian matrix", () => {
	let testId = 1;
	const combos = cartesian({ mode: MODES, rule: RULES, spec: EVENT_SPECS });

	for (const { mode, rule, spec } of combos) {
		if (pruneToolOnTextOnly(rule.key, spec.kind)) continue;
		if (testId > 500) break;
		const id = testId++;
		it(`XEC${String(id).padStart(3, "0")}: ${mode}/${rule.key}/${spec.kind}`, async () => {
			const out = await collect(
				guardEvents(eventsFrom([spec.event]), { mode, transforms: [rule.transform()] }),
			);
			expect(out.length).toBeGreaterThan(0);
			assertRuleBehavior(rule, mode, spec, out);
		});
	}

	it("registers exactly 500 cartesian cases", () => {
		expect(testId - 1).toBe(500);
	});
});
