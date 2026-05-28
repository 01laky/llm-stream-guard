/**
 * LSG-E18+ — Phase 1 rule edge cases: patterns, modes, combinatorics, fuzz.
 */
import { describe, expect, it } from "vitest";
import { createGuardContext, getGuardContextState } from "../src/create-guard-context.js";
import { createByteGuard } from "../src/create-byte-guard.js";
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
import type { GuardEvent, Violation } from "../src/types.js";
import { pipeThroughByteGuard } from "./helpers/guard-bytes.js";
import { eventsFrom } from "./helpers/sample-events.js";
import {
	bytesEqual,
	collectBytes,
	createSeededRng,
	randomSplitIndices,
	readableFromChunks,
	splitAtByteIndex,
	splitAtIndices,
	splitIntoFixedSizeChunks,
	utf8,
	utf8String,
} from "./helpers/streams.js";

const REDACTED = "[REDACTED]";
const byteRedact = { redactSecrets: true as const };

async function collect(source: AsyncIterable<GuardEvent>): Promise<GuardEvent[]> {
	const out: GuardEvent[] = [];
	for await (const e of source) out.push(e);
	return out;
}

function expectNoLeak(out: string | Uint8Array, secret: string): void {
	const text = typeof out === "string" ? out : utf8String(out);
	expect(text).not.toContain(secret);
}

async function expectRedactedByteSplit(payload: Uint8Array, splitAt: number): Promise<void> {
	const [a, b] = splitAtByteIndex(payload, splitAt);
	const out = await pipeThroughByteGuard(payload, [a, b], byteRedact);
	expectNoLeak(
		out,
		utf8String(payload)
			.replace(/[^\x20-\x7e]/g, "")
			.slice(0, 32),
	);
}

describe("LSG-E18: built-in secret patterns (event + byte)", () => {
	const cases: Array<{ id: string; text: string; leak: string }> = [
		{ id: "sk-proj", text: "key=sk-proj-1234567890ab", leak: "sk-proj-1234567890ab" },
		{ id: "bearer", text: "Authorization: Bearer sk-token-1234567890", leak: "Bearer" },
		{
			id: "jwt",
			text: "tok=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
			leak: "eyJhbGci",
		},
		{ id: "ghp", text: "ghp_1234567890abcdefghij1234567890ab", leak: "ghp_1234567890" },
		{
			id: "github_pat",
			text: "github_pat_1234567890abcdefghij1234567890ab",
			leak: "github_pat_",
		},
		{ id: "aws", text: "AKIAIOSFODNN7EXAMPLE", leak: "AKIAIOSFODNN7EXAMPLE" },
	];

	for (const { id, text, leak } of cases) {
		it(`event redacts ${id}`, async () => {
			const out = await collect(
				guardEvents(eventsFrom([{ type: "text", phase: "done", text }]), redactSecrets()),
			);
			if (out[0]?.type === "text") {
				expect(out[0].text).not.toContain(leak);
				expect(out[0].text).toContain(REDACTED);
			}
		});

		it(`byte redacts ${id} split at mid-string`, async () => {
			const payload = utf8(text);
			const splitAt = Math.max(1, Math.floor(payload.length / 2));
			const [a, b] = splitAtByteIndex(payload, splitAt);
			const out = await pipeThroughByteGuard(payload, [a, b], byteRedact);
			expectNoLeak(out, leak);
			expect(utf8String(out)).toContain(REDACTED);
		});
	}
});

describe("LSG-E19: redactSecrets options", () => {
	it("custom placeholder", async () => {
		const out = await collect(
			guardEvents(
				eventsFrom([{ type: "text", phase: "done", text: "sk-test-1234567890" }]),
				redactSecrets({ placeholder: "***" }),
			),
		);
		if (out[0]?.type === "text") {
			expect(out[0].text).toContain("***");
			expect(out[0].text).not.toContain("[REDACTED]");
		}
	});

	it("merges custom patterns with built-ins", async () => {
		const out = await collect(
			guardEvents(
				eventsFrom([{ type: "text", phase: "done", text: "CUSTOM-SECRET-TOKEN-XYZ" }]),
				redactSecrets({ patterns: [/CUSTOM-SECRET-TOKEN-[A-Z]+/g] }),
			),
		);
		if (out[0]?.type === "text") {
			expect(out[0].text).toContain(REDACTED);
			expect(out[0].text).not.toContain("CUSTOM-SECRET");
		}
	});
});

describe("LSG-E20: redactPII edge cases", () => {
	it("email + phone together when both enabled", async () => {
		const text = "Contact user@example.com or 555-123-4567";
		const out = await collect(
			guardEvents(
				eventsFrom([{ type: "text", phase: "done", text }]),
				redactPII({ email: true, phone: true }),
			),
		);
		if (out[0]?.type === "text") {
			expect(out[0].text).not.toContain("user@example.com");
			expect(out[0].text).not.toContain("555-123-4567");
			expect(out[0].text).toMatch(/\[REDACTED\].*\[REDACTED\]/);
		}
	});

	it("does not redact version-like strings without email", async () => {
		const text = "version 1.2.3 is stable";
		const out = await collect(
			guardEvents(eventsFrom([{ type: "text", phase: "done", text }]), redactPII({ email: true })),
		);
		if (out[0]?.type === "text") expect(out[0].text).toBe(text);
	});

	it("redacts PII in tool_call args on done", async () => {
		const out = await collect(
			guardEvents(
				eventsFrom([
					{
						type: "tool_call",
						phase: "done",
						name: "email",
						args: { to: "admin@corp.com" },
					},
				]),
				redactPII({ email: true }),
			),
		);
		const tc = out[0];
		if (tc?.type === "tool_call") {
			expect(JSON.stringify(tc.args)).not.toContain("admin@corp.com");
		}
	});
});

describe("LSG-E21: sanitizeErrors edge cases", () => {
	it("byte mode sanitizes SSE error message substring", async () => {
		const payload = utf8('data: {"error":{"message":"internal /etc/passwd leak"}}\n\n');
		const out = await collectBytes(
			readableFromChunks([payload]).pipeThrough(createByteGuard({ sanitizeErrors: true })),
		);
		expect(utf8String(out)).not.toContain("/etc/passwd");
		expect(utf8String(out)).toContain("An error occurred.");
	});

	it("byte sanitizeErrors is best-effort per chunk (split may miss)", async () => {
		const payload = utf8('data: {"error":{"message":"internal leak"}}\n\n');
		const [a, b] = splitAtByteIndex(payload, 12);
		const out = await collectBytes(
			readableFromChunks([a, b]).pipeThrough(createByteGuard({ sanitizeErrors: true })),
		);
		expect(out.length).toBeGreaterThan(0);
	});

	it("custom safe message on event error", async () => {
		const out = await collect(
			guardEvents(
				eventsFrom([{ type: "error", message: "stack at secret/path", code: "500" }]),
				sanitizeErrors({ message: "Safe.", stripCode: false }),
			),
		);
		expect(out[0]).toEqual({ type: "error", message: "Safe.", code: "500" });
	});

	it("compose byte redactSecrets + sanitizeErrors", async () => {
		const secret = "sk-test-1234567890";
		const payload = utf8(`data: {"error":{"message":"${secret}"}}\n\n`);
		const out = await collectBytes(
			readableFromChunks([payload]).pipeThrough(
				createByteGuard({ redactSecrets: true, sanitizeErrors: true }),
			),
		);
		const text = utf8String(out);
		expect(text).not.toContain(secret);
	});
});

describe("LSG-E22: allowTools / denyTools edge cases", () => {
	it("empty allowlist denies every tool", async () => {
		const out = await collect(
			guardEvents(
				eventsFrom([{ type: "tool_call", phase: "done", name: "search", id: "1" }]),
				{ mode: "block" },
				allowTools([]),
			),
		);
		expect(out.some((e) => e.type === "finish" && e.reason === "policy_violation")).toBe(true);
	});

	it("tool names are case-sensitive", async () => {
		const out = await collect(
			guardEvents(
				eventsFrom([{ type: "tool_call", phase: "done", name: "Search", id: "1" }]),
				{ mode: "block" },
				allowTools(["search"]),
			),
		);
		expect(out.some((e) => e.type === "error")).toBe(true);
	});

	it("denyTools audit passes tool through", async () => {
		const violations: Violation[] = [];
		const event = { type: "tool_call" as const, phase: "done" as const, name: "bash", id: "1" };
		const out = await collect(
			guardEvents(
				eventsFrom([event]),
				{ mode: "audit", onViolation: (v) => violations.push(v) },
				denyTools(["bash"]),
			),
		);
		expect(out).toEqual([event]);
		expect(violations.some((v) => v.rule === "deny_tools")).toBe(true);
	});

	it("warn mode blocks tool like block", async () => {
		const out = await collect(
			guardEvents(
				eventsFrom([{ type: "tool_call", phase: "done", name: "bash", id: "1" }]),
				{ mode: "warn" },
				allowTools(["read"]),
			),
		);
		expect(out.some((e) => e.type === "finish" && e.reason === "policy_violation")).toBe(true);
	});
});

describe("LSG-E23: blockToolArgs matchers", () => {
	it("string matcher on serialized args", async () => {
		const out = await collect(
			guardEvents(
				eventsFrom([
					{
						type: "tool_call",
						phase: "done",
						name: "run",
						args: { cmd: "curl evil.com" },
					},
				]),
				{ mode: "block" },
				blockToolArgs("evil.com"),
			),
		);
		expect(out.some((e) => e.type === "finish" && e.reason === "policy_violation")).toBe(true);
	});

	it("function matcher receives args and context", async () => {
		let ctxMode: string | undefined;
		const out = await collect(
			guardEvents(
				eventsFrom([{ type: "tool_call", phase: "done", name: "x", args: { n: 42 } }]),
				{ mode: "block" },
				blockToolArgs((args, ctx) => {
					ctxMode = ctx.mode;
					return typeof args === "object" && args !== null && "n" in args;
				}),
			),
		);
		expect(ctxMode).toBe("block");
		expect(out.some((e) => e.type === "error")).toBe(true);
	});

	it("parses argsText on done when args missing", async () => {
		const out = await collect(
			guardEvents(
				eventsFrom([
					{
						type: "tool_call",
						phase: "done",
						name: "bash",
						argsText: '{"cmd":"rm -rf /tmp"}',
					},
				]),
				{ mode: "block" },
				blockToolArgs(/rm\s+-rf/),
			),
		);
		expect(out.some((e) => e.type === "finish" && e.reason === "policy_violation")).toBe(true);
	});

	it("audit mode records violation but passes tool_call", async () => {
		const violations: Violation[] = [];
		const event = {
			type: "tool_call" as const,
			phase: "done" as const,
			name: "bash",
			args: { cmd: "rm -rf /" },
		};
		const out = await collect(
			guardEvents(
				eventsFrom([event]),
				{ mode: "audit", onViolation: (v) => violations.push(v) },
				blockToolArgs(/rm\s+-rf/),
			),
		);
		expect(out).toEqual([event]);
		expect(violations.some((v) => v.rule === "block_tool_args")).toBe(true);
	});
});

describe("LSG-E24: maxToolArgsBytes edge cases", () => {
	it("passes when exactly at byte limit", async () => {
		const body = "x".repeat(10);
		const out = await collect(
			guardEvents(
				eventsFrom([
					{ type: "tool_call", phase: "delta", id: "1", name: "x", argsText: body },
					{ type: "tool_call", phase: "done", id: "1", name: "x", args: {} },
				]),
				{ mode: "block" },
				maxToolArgsBytes(10),
			),
		);
		expect(out.filter((e) => e.type === "tool_call")).toHaveLength(2);
	});

	it("blocks oversized argsText for tool without id", async () => {
		const out = await collect(
			guardEvents(
				eventsFrom([
					{ type: "tool_call", phase: "delta", name: "a", argsText: "12345678901" },
					{ type: "tool_call", phase: "done", name: "a", args: {} },
				]),
				{ mode: "block" },
				maxToolArgsBytes(10),
			),
		);
		expect(out.some((e) => e.type === "finish" && e.reason === "policy_violation")).toBe(true);
	});

	it("parallel ids stay isolated when ids provided", async () => {
		const out = await collect(
			guardEvents(
				eventsFrom([
					{ type: "tool_call", phase: "delta", id: "a", name: "x", argsText: "123456789012345" },
					{ type: "tool_call", phase: "delta", id: "b", name: "x", argsText: "12345" },
					{ type: "tool_call", phase: "done", id: "a", name: "x", args: {} },
					{ type: "tool_call", phase: "done", id: "b", name: "x", args: {} },
				]),
				{ mode: "block" },
				maxToolArgsBytes(10),
			),
		);
		expect(out.some((e) => e.type === "finish" && e.reason === "policy_violation")).toBe(true);
		expect(out.some((e) => e.type === "tool_call" && e.id === "b" && e.phase === "done")).toBe(
			true,
		);
	});

	it("audit mode logs violation but allows oversized args", async () => {
		const violations: Violation[] = [];
		const event = {
			type: "tool_call" as const,
			phase: "delta" as const,
			id: "1",
			name: "x",
			argsText: "x".repeat(100),
		};
		const done = {
			type: "tool_call" as const,
			phase: "done" as const,
			id: "1",
			name: "x",
			args: {},
		};
		const out = await collect(
			guardEvents(
				eventsFrom([event, done]),
				{ mode: "audit", onViolation: (v) => violations.push(v) },
				maxToolArgsBytes(10),
			),
		);
		expect(out.filter((e) => e.type === "tool_call")).toHaveLength(2);
		expect(violations.some((v) => v.rule === "max_tool_args_bytes")).toBe(true);
	});
});

describe("LSG-E25: violation mode matrix with redactSecrets", () => {
	const secret = "sk-test-1234567890";
	const modes = ["block", "warn", "audit"] as const;

	for (const mode of modes) {
		it(`${mode}: always redacts secrets in text`, async () => {
			const violations: Violation[] = [];
			const out = await collect(
				guardEvents(
					eventsFrom([{ type: "text", phase: "done", text: secret }]),
					{ mode, onViolation: (v) => violations.push(v) },
					redactSecrets(),
				),
			);
			if (out[0]?.type === "text") {
				expect(out[0].text).toContain(REDACTED);
				expect(out[0].text).not.toContain(secret);
			}
			expect(violations.some((v) => v.rule === "redact_secrets")).toBe(true);
		});
	}
});

describe("LSG-E26: mixed stream full rule stack", () => {
	it("processes heterogeneous stream without throwing", async () => {
		const secret = "sk-test-1234567890";
		const stream: GuardEvent[] = [
			{ type: "text", phase: "delta", text: `hello ${secret}` },
			{ type: "reasoning", phase: "delta", text: "think" },
			{ type: "tool_call", phase: "delta", id: "1", name: "search", argsText: "{" },
			{ type: "tool_call", phase: "done", id: "1", name: "search", args: { q: "ok" } },
			{ type: "tool_call", phase: "done", id: "2", name: "bash", args: { cmd: "ls" } },
			{ type: "error", message: "upstream", code: "500" },
			{ type: "finish", reason: "stop" },
		];
		const violations: Violation[] = [];
		const out = await collect(
			guardEvents(
				eventsFrom(stream),
				{ mode: "block", onViolation: (v) => violations.push(v) },
				redactSecrets(),
				allowTools(["search"]),
				sanitizeErrors(),
			),
		);
		expect(out.some((e) => e.type === "text" && e.text?.includes(REDACTED))).toBe(true);
		expect(out.some((e) => e.type === "error" && e.message === "An error occurred.")).toBe(true);
		expect(out.some((e) => e.type === "finish" && e.reason === "policy_violation")).toBe(true);
		expect(violations.length).toBeGreaterThan(0);
	});
});

describe("LSG-E27: byte redaction random split fuzz", () => {
	const secret = "sk-proj-fuzz1234567890";
	const payloads = [
		utf8(`data: {"key":"${secret}"}\n\n`),
		utf8(`prefix ${secret} suffix`),
		utf8(`Bearer ${secret} trailing`),
	];

	for (const [idx, payload] of payloads.entries()) {
		for (const seed of [1, 7, 42, 999, 12345]) {
			it(`payload ${idx + 1} seed ${seed} never leaks secret`, async () => {
				const rng = createSeededRng(seed);
				const indices = randomSplitIndices(payload.length, rng, 20);
				const chunks = splitAtIndices(payload, indices);
				const out = await pipeThroughByteGuard(payload, chunks, byteRedact);
				expectNoLeak(out, secret);
			});
		}
	}
});

describe("LSG-E28: E07-style splits with redaction enabled", () => {
	const payload = utf8("Bearer sk-test-token-1234567890");

	for (const splitAt of [1, 7, 13, 19, payload.length - 1]) {
		it(`split at byte ${splitAt} redacts without leak`, async () => {
			const [a, b] = splitAtByteIndex(payload, splitAt);
			const out = await pipeThroughByteGuard(payload, [a, b], byteRedact);
			expectNoLeak(out, "sk-test-token-1234567890");
			expect(utf8String(out)).toContain(REDACTED);
		});
	}
});

describe("LSG-E29: context reset during rule execution", () => {
	it("reset clears toolArgsBytesById and violations", () => {
		const ctx = createGuardContext({ mode: "warn" });
		const state = getGuardContextState(ctx);
		state.toolArgsBytesById.set("a", 999);
		ctx.violations.push({ rule: "x", message: "y", mode: "warn" });
		ctx.reset();
		expect(ctx.violations).toHaveLength(0);
		expect(state.toolArgsBytesById.size).toBe(0);
		expect(state.byteLookback.length).toBe(0);
	});
});

describe("LSG-E30: multiple secrets per event", () => {
	it("redacts all matches in one text event", async () => {
		const s1 = "sk-test-1111111111";
		const s2 = "sk-test-2222222222";
		const out = await collect(
			guardEvents(
				eventsFrom([{ type: "text", phase: "done", text: `${s1} and ${s2}` }]),
				redactSecrets(),
			),
		);
		if (out[0]?.type === "text") {
			expect(out[0].text).not.toContain(s1);
			expect(out[0].text).not.toContain(s2);
			expect(out[0].text.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(2);
		}
	});
});

describe("LSG-E31: concurrent guardEvents with redactSecrets", () => {
	it("isolates violations and output per iterator", async () => {
		const secretA = "sk-test-aaaaaaaaaa";
		const secretB = "sk-test-bbbbbbbbbb";
		const [outA, outB] = await Promise.all([
			collect(
				guardEvents(eventsFrom([{ type: "text", phase: "done", text: secretA }]), redactSecrets()),
			),
			collect(
				guardEvents(eventsFrom([{ type: "text", phase: "done", text: secretB }]), redactSecrets()),
			),
		]);
		if (outA[0]?.type === "text" && outB[0]?.type === "text") {
			expect(outA[0].text).not.toContain(secretB);
			expect(outB[0].text).not.toContain(secretA);
		}
	});
});

describe("LSG-E32: every-byte split on AWS key payload", () => {
	const payload = utf8("key=AKIAIOSFODNN7EXAMPLE&region=us-east-1");

	for (let splitAt = 1; splitAt < payload.length; splitAt++) {
		it(`split at ${splitAt}/${payload.length - 1}`, async () => {
			const [a, b] = splitAtByteIndex(payload, splitAt);
			const out = await pipeThroughByteGuard(payload, [a, b], byteRedact);
			expectNoLeak(out, "AKIAIOSFODNN7EXAMPLE");
		});
	}
});

describe("LSG-E33: reasoning + tool_call secret paths", () => {
	it("redacts secret in reasoning.done", async () => {
		const secret = "sk-test-1234567890";
		const out = await collect(
			guardEvents(
				eventsFrom([{ type: "reasoning", phase: "done", text: secret }]),
				redactSecrets(),
			),
		);
		if (out[0]?.type === "reasoning") {
			expect(out[0].text).toContain(REDACTED);
		}
	});

	it("redacts stringified args object on tool_call done", async () => {
		const secret = "sk-test-1234567890";
		const out = await collect(
			guardEvents(
				eventsFrom([
					{
						type: "tool_call",
						phase: "done",
						name: "x",
						args: { token: secret },
					},
				]),
				redactSecrets(),
			),
		);
		const tc = out[0];
		if (tc?.type === "tool_call") {
			expect(JSON.stringify(tc.args)).not.toContain(secret);
		}
	});
});

describe("LSG-E34: guardEvents config.transforms + spread factories", () => {
	it("merges config.transforms before spread args", async () => {
		const calls: string[] = [];
		const tag = (name: string) => (e: GuardEvent) => {
			calls.push(name);
			return e;
		};
		await collect(
			guardEvents(
				eventsFrom([{ type: "text", phase: "delta", text: "x" }]),
				{ transforms: [tag("config")] },
				tag("spread"),
			),
		);
		expect(calls).toEqual(["config", "spread"]);
	});
});

describe("LSG-E35: large guarded event stream stress", () => {
	it("500 events with periodic secrets and tool policy", async () => {
		const events: GuardEvent[] = Array.from({ length: 500 }, (_, i) => {
			if (i % 50 === 0) {
				return {
					type: "text" as const,
					phase: "done" as const,
					text: `item ${i} sk-test-${String(i).padStart(10, "0")}`,
				};
			}
			if (i % 77 === 0) {
				return {
					type: "tool_call" as const,
					phase: "done" as const,
					id: String(i),
					name: i % 154 === 0 ? "bash" : "search",
					args: { i },
				};
			}
			return { type: "text" as const, phase: "delta" as const, text: String(i) };
		});

		const out = await collect(
			guardEvents(eventsFrom(events), { mode: "block" }, redactSecrets(), allowTools(["search"])),
		);
		expect(out.length).toBeGreaterThan(500);
		for (const event of out) {
			if (event.type === "text" && event.text?.includes("sk-test-")) {
				expect(event.text).not.toMatch(/sk-test-\d{10}/);
			}
		}
	}, 15_000);
});

describe("LSG-E36: byte flush edge cases", () => {
	it("empty stream with redactSecrets produces zero bytes", async () => {
		const out = await collectBytes(
			readableFromChunks([]).pipeThrough(createByteGuard({ redactSecrets: true })),
		);
		expect(out.length).toBe(0);
	});

	it("secret only in final lookback window is redacted on close", async () => {
		const secret = "sk-test-1234567890";
		const payload = utf8(`${"z".repeat(200)}${secret}`);
		const splitAt = payload.length - 8;
		const [a, b] = splitAtByteIndex(payload, splitAt);
		const out = await pipeThroughByteGuard(payload, [a, b], byteRedact);
		expectNoLeak(out, secret);
	});
});

describe("LSG-E37: violations accumulate on context", () => {
	it("multiple redaction hits append violations via onViolation", async () => {
		const violations: Violation[] = [];
		await collect(
			guardEvents(
				eventsFrom([
					{ type: "text", phase: "done", text: "sk-test-1111111111" },
					{ type: "text", phase: "done", text: "sk-test-2222222222" },
				]),
				{ onViolation: (v) => violations.push(v) },
				redactSecrets(),
			),
		);
		expect(violations.filter((v) => v.rule === "redact_secrets").length).toBeGreaterThanOrEqual(2);
	});
});

describe("LSG-E38: passthrough byte unchanged without flags", () => {
	it("E14 payloads still passthrough when redactSecrets false", async () => {
		const payload = utf8("prefix sk-proj-1234567890 suffix");
		const rng = createSeededRng(42);
		const chunks = splitAtIndices(payload, randomSplitIndices(payload.length, rng, 12));
		const out = await collectBytes(readableFromChunks(chunks).pipeThrough(createByteGuard()));
		expect(bytesEqual(out, payload)).toBe(true);
	});
});
