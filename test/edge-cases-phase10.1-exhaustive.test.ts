/**
 * LSG-XEC2231–XEC2830 — Phase 10.1 audit-fix exhaustive edge matrices:
 * byte sanitizeErrors splits, reset/redactions, blockToolArgs safety,
 * policyVersion propagation, tool_call argsText PII deltas, combined byte guards.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createByteGuard } from "../src/create-byte-guard.js";
import { createGuardContext } from "../src/create-guard-context.js";
import { recordViolation } from "../src/record-violation.js";
import { countStaticErrors } from "../src/audit/format-report.js";
import { runStaticScan } from "../src/audit/static-scan.js";
import {
	blockToolArgs,
	guardEvents,
	redactPII,
	redactSecrets,
	summarizeGuardContext,
} from "../src/index.js";
import type { GuardMode, StreamGuardSummary, ViolationMode } from "../src/types.js";
import { cartesian } from "./helpers/cartesian.js";
import { eventsFrom } from "./helpers/sample-events.js";
import { pipeThroughByteGuard } from "./helpers/guard-bytes.js";
import {
	collectBytes,
	readableFromChunks,
	splitAtByteIndex,
	utf8,
	utf8String,
} from "./helpers/streams.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODES: GuardMode[] = ["block", "warn", "audit"];
const REDACTION_RULES = ["redact_secrets", "redact_pii"] as const;
const EMAIL = "user@example.com";
const PHONE = "555-123-4567";

const SANITIZE_PAYLOADS = [
	'data: {"error":{"message":"internal /etc/passwd leak"}}\n\n',
	'{"message":"stack at file:///secret/path"}\n',
	'{"type":"error","message":"Bearer sk-test123456789012345678901234567890"}\n',
	"plain stream without error keyword",
	'{"message":"An error occurred."}\n',
	'{"error":{"message":"unicode αβγ path"}}\n',
	'{"error":{"message":"日本語エラー"}}\n',
	'{"error":{"message":"' + "x".repeat(64) + '"}}\n',
	'event: error\ndata: {"message":"nested"}\n\n',
	'{"message":"http://127.0.0.1:8080/admin"}\n',
	'{"message":"C:\\\\Windows\\\\System32"}\n',
	'{"message":"\\u002fetc\\u002fpasswd"}\n',
	'{"message":"multi\\nline\\nstack"}\n',
];

function assertSummaryInvariants(summary: StreamGuardSummary, mode: ViolationMode): void {
	expect(summary.mode).toBe(mode);
	const sum = Object.values(summary.countsByRule).reduce((a, b) => a + b, 0);
	expect(sum).toBe(summary.violations.length);
	expect(summary.redactions).toBeGreaterThanOrEqual(0);
}

describe("LSG-XEC2231: byte sanitizeErrors split matrix", () => {
	let id = 2231;
	for (const payload of SANITIZE_PAYLOADS) {
		for (const mode of MODES) {
			for (let splitIdx = 1; splitIdx <= 7; splitIdx++) {
				const caseId = id++;
				if (caseId > 2545) break;
				it(`XEC${caseId}: sanitize ${mode} split ${splitIdx}`, async () => {
					const bytes = utf8(payload);
					if (bytes.length <= 1) return;
					const splitAt = Math.max(
						1,
						Math.min(bytes.length - 1, Math.floor((bytes.length * splitIdx) / 8)),
					);
					const [c1, c2] = splitAtByteIndex(bytes, splitAt);
					const out = await collectBytes(
						readableFromChunks([c1, c2]).pipeThrough(
							createByteGuard({ sanitizeErrors: true, mode }),
						),
					);
					const text = utf8String(out);
					if (payload.includes("/etc/passwd") || payload.includes("file:///secret")) {
						expect(text).not.toContain("/etc/passwd");
						expect(text).not.toContain("file:///secret");
					}
					if (payload.includes('"message"') && payload.includes("internal")) {
						expect(text).toContain("An error occurred.");
					}
				});
			}
		}
	}
	it("registers sanitize split matrix cases", () => {
		expect(id - 2231).toBe(273);
	});
});

describe("LSG-XEC2546: reset redaction tally matrix", () => {
	const matrix = cartesian({
		mode: MODES,
		rule: REDACTION_RULES,
		cycle: [0, 1, 2, 3, 4] as const,
	});
	for (let i = 0; i < matrix.length; i++) {
		const row = matrix[i]!;
		const id = 2546 + i;
		it(`XEC${id}: reset ${row.mode} ${row.rule} cycle ${row.cycle}`, () => {
			const ctx = createGuardContext({ mode: row.mode });
			for (let c = 0; c <= row.cycle; c++) {
				recordViolation(ctx, { rule: row.rule, message: `m-${c}` });
				if (c % 2 === 1) ctx.reset();
			}
			const s = summarizeGuardContext(ctx);
			if (row.cycle % 2 === 1) {
				expect(s.redactions).toBe(0);
				expect(s.violations).toHaveLength(0);
			} else {
				expect(s.redactions).toBeGreaterThan(0);
			}
		});
	}
});

describe("LSG-XEC2581: blockToolArgs non-serializable matrix", () => {
	const badArgs: unknown[] = [
		(() => {
			const o: { self?: unknown } = {};
			o.self = o;
			return o;
		})(),
		{ n: BigInt(42) },
		{ fn: () => 1 },
		{ sym: Symbol("x") },
		{ a: new Map([["k", 1]]) },
		{ a: new Set([1]) },
		{ buf: new ArrayBuffer(8) },
		undefined,
		null,
		"string-args",
		42,
		[{ nested: true }],
	];

	for (let i = 0; i < badArgs.length; i++) {
		for (const matcher of [/\/secret/, "needle"] as const) {
			const id = 2581 + i * 2 + (matcher === "needle" ? 1 : 0);
			if (id > 2606) break;
			it(`XEC${id}: blockToolArgs safe args shape ${i}`, async () => {
				const args = badArgs[i];
				let count = 0;
				for await (const _ of guardEvents(
					eventsFrom([
						{
							type: "tool_call",
							phase: "done",
							name: "read_file",
							args,
							...(typeof args === "object" && args !== null ? {} : { argsText: String(args) }),
						},
					]),
					{
						transforms: [blockToolArgs(typeof matcher === "string" ? matcher : matcher)],
					},
				)) {
					count += 1;
				}
				expect(count).toBe(1);
			});
		}
	}
});

describe("LSG-XEC2607: policyVersion propagation matrix", () => {
	const versions = ["", "v1", "team-gate-2024", "unicode-日本", "x".repeat(32)] as const;
	for (let i = 0; i < versions.length; i++) {
		for (let m = 0; m < MODES.length; m++) {
			const id = 2607 + i * MODES.length + m;
			const pv = versions[i]!;
			const mode = MODES[m]!;
			it(`XEC${id}: policyVersion ${i} ${mode} byte`, async () => {
				let summary: StreamGuardSummary | undefined;
				const payload = utf8("sk-proj-abcdefghijklmnopqrstuvwxyz1234567890");
				await pipeThroughByteGuard(payload, [payload], {
					mode,
					redactSecrets: true,
					policyVersion: pv,
					onFinish: (s) => {
						summary = s;
					},
				});
				expect(summary!.policyVersion).toBe(pv);
				if (pv !== "") expect(summary!.violations[0]?.policyVersion).toBe(pv);
			});
			it(`XEC${id}a: policyVersion ${i} ${mode} event`, async () => {
				let summary: StreamGuardSummary | undefined;
				for await (const _ of guardEvents(
					eventsFrom([{ type: "tool_call", phase: "done", name: "bash", args: {} }]),
					{
						mode,
						policyVersion: pv,
						transforms: [blockToolArgs(/never-match-xyz/)],
						onFinish: (s) => {
							summary = s;
						},
					},
				)) {
					/* drain */
				}
				expect(summary!.policyVersion).toBe(pv);
			});
		}
	}
});

describe("LSG-XEC2662: tool_call argsText PII delta matrix", () => {
	const fragments = [
		`{"to":"${EMAIL}"}`,
		`{"phone":"${PHONE}"}`,
		`{"cc":["${EMAIL}","${PHONE}"]}`,
		`{"note":"reach ${EMAIL} today"}`,
		`{"dial":"${PHONE}"}`,
	];
	for (let i = 0; i < fragments.length; i++) {
		for (let split = 1; split <= 8; split++) {
			const id = 2662 + i * 8 + (split - 1);
			if (id > 2701) break;
			const frag = fragments[i]!;
			it(`XEC${id}: PII delta split ${split} frag ${i}`, async () => {
				const splitAt = Math.max(1, Math.min(frag.length - 1, split));
				const parts = [frag.slice(0, splitAt), frag.slice(splitAt)];
				const out: string[] = [];
				for await (const e of guardEvents(
					eventsFrom([
						{
							type: "tool_call",
							phase: "delta",
							name: "email",
							argsText: parts[0]!,
						},
						{
							type: "tool_call",
							phase: "delta",
							name: "email",
							argsText: parts[1] ?? "",
						},
					]),
					{ transforms: [redactPII({ email: true, phone: true })] },
				)) {
					if (e.type === "tool_call" && e.argsText) out.push(e.argsText);
				}
				const blob = out.join("");
				expect(blob).not.toContain(EMAIL);
				expect(blob).not.toContain(PHONE);
			});
		}
	}
});

describe("LSG-XEC2702: combined byte redact + sanitize onFinish", () => {
	const combos = cartesian({
		mode: MODES,
		redact: [true, false] as const,
		sanitize: [true, false] as const,
		split: [1, 2, 3, 4, 5] as const,
	});
	let n = 0;
	for (const row of combos) {
		if (!row.redact && !row.sanitize) continue;
		const id = 2702 + n;
		n += 1;
		if (id > 2780) break;
		it(`XEC${id}: combined r=${row.redact} s=${row.sanitize} ${row.mode}`, async () => {
			const payload = utf8(
				'data: {"error":{"message":"internal leak"},"text":"sk-proj-abcdefghijklmnopqrstuvwxyz1234567890"}\n\n',
			);
			const splitAt = Math.max(1, Math.min(payload.length - 1, row.split * 7));
			const [c1, c2] = splitAtByteIndex(payload, splitAt);
			let summary: StreamGuardSummary | undefined;
			await pipeThroughByteGuard(payload, [c1, c2], {
				mode: row.mode,
				redactSecrets: row.redact,
				sanitizeErrors: row.sanitize,
				onFinish: (s) => {
					summary = s;
				},
			});
			expect(summary).toBeDefined();
			assertSummaryInvariants(summary!, row.mode);
			if (row.redact) expect(summary!.redactions).toBeGreaterThan(0);
		});
	}
});

describe("LSG-XEC2781: MANIFEST_PARSE_ERROR matrix", () => {
	const corruptBodies = ["{", "{ not json", "", "undefined", "not-json-at-all", "{{", "{"];
	for (let i = 0; i < corruptBodies.length; i++) {
		const id = 2781 + i;
		it(`XEC${id}: corrupt manifest body ${i}`, () => {
			const dir = mkdtempSync(join(tmpdir(), "lsg-corrupt-"));
			const path = join(dir, `bad-${i}.json`);
			writeFileSync(path, corruptBodies[i]!);
			const report = runStaticScan({
				root: rootDir,
				policy: "policies/agent-gate.json",
				manifest: path,
			});
			rmSync(dir, { recursive: true, force: true });
			expect(report.dangerous.some((f) => f.code === "MANIFEST_PARSE_ERROR")).toBe(true);
			expect(countStaticErrors(report, false)).toBeGreaterThan(0);
		});
	}
	it("XEC2788: valid manifest has no parse error", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: "policies/agent-gate.json",
			manifest: "test/fixtures/tools/agent-tools.json",
		});
		expect(report.dangerous.some((f) => f.code === "MANIFEST_PARSE_ERROR")).toBe(false);
	});
});

describe("LSG-XEC2789: onFinish after reset via second stream", () => {
	for (let i = 0; i < 20; i++) {
		const id = 2789 + i;
		it(`XEC${id}: sequential streams isolated redactions ${i}`, async () => {
			const summaries: number[] = [];
			const run = async (secret: string) => {
				for await (const _ of guardEvents(
					eventsFrom([{ type: "text", phase: "done", text: secret }]),
					{
						mode: MODES[i % 3]!,
						transforms: [redactSecrets()],
						onFinish: (s) => summaries.push(s.redactions),
					},
				)) {
					/* drain */
				}
			};
			await run(`sk-test123456789012345678901234567890-${i}`);
			await run(`clean-${i}`);
			expect(summaries[0]).toBeGreaterThan(0);
			expect(summaries[1]).toBe(0);
		});
	}
});
