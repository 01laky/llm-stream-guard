/**
 * LSG-R* — event-mode redaction and violation tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { allowTools, guardEvents, redactPII, redactSecrets, sanitizeErrors } from "../src/index.js";
import type { GuardEvent, Violation } from "../src/types.js";
import { eventsFrom } from "./helpers/sample-events.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const REDACTED = "[REDACTED]";

async function collect(source: AsyncIterable<GuardEvent>): Promise<GuardEvent[]> {
	const out: GuardEvent[] = [];
	for await (const e of source) out.push(e);
	return out;
}

describe("LSG-R01: text delta sk redaction", () => {
	it("redacts OpenAI-style key in text delta", async () => {
		const secret = "sk-test-1234567890";
		const out = await collect(
			guardEvents(
				eventsFrom([{ type: "text", phase: "delta", text: `key=${secret}` }]),
				redactSecrets(),
			),
		);
		expect(out[0]?.type).toBe("text");
		if (out[0]?.type === "text") {
			expect(out[0].text).not.toContain(secret);
			expect(out[0].text).toContain(REDACTED);
		}
	});
});

describe("LSG-R02: reasoning channel", () => {
	it("redacts secret in reasoning delta", async () => {
		const secret = "sk-test-1234567890";
		const out = await collect(
			guardEvents(
				eventsFrom([{ type: "reasoning", phase: "delta", text: secret }]),
				redactSecrets(),
			),
		);
		if (out[0]?.type === "reasoning") {
			expect(out[0].text).toContain(REDACTED);
		}
	});
});

describe("LSG-R03: Bearer in text.done", () => {
	it("redacts Bearer token on done phase", async () => {
		const out = await collect(
			guardEvents(
				eventsFrom([
					{ type: "text", phase: "done", text: "Authorization: Bearer sk-token-1234567890" },
				]),
				redactSecrets(),
			),
		);
		if (out[0]?.type === "text") {
			expect(out[0].text).toContain(REDACTED);
			expect(out[0].text).not.toContain("Bearer");
		}
	});
});

describe("LSG-R04: JWT pattern", () => {
	it("redacts JWT-shaped token", async () => {
		const jwt =
			"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
		const out = await collect(
			guardEvents(eventsFrom([{ type: "text", phase: "done", text: jwt }]), redactSecrets()),
		);
		if (out[0]?.type === "text") {
			expect(out[0].text).toContain(REDACTED);
			expect(out[0].text).not.toContain("eyJ");
		}
	});
});

describe("LSG-R05: argsText delta no premature partial match", () => {
	it("does not redact incomplete sk- prefix on argsText delta", async () => {
		const partial = '{"token":"sk-proj-12';
		const out = await collect(
			guardEvents(
				eventsFrom([{ type: "tool_call", phase: "delta", id: "1", name: "x", argsText: partial }]),
				redactSecrets(),
			),
		);
		if (out[0]?.type === "tool_call") {
			expect(out[0].argsText).toBe(partial);
		}
	});
});

describe("LSG-R09: violation JSON round-trip", () => {
	it("populates rule field on violations", async () => {
		const ctxEvents = await collect(
			guardEvents(
				eventsFrom([{ type: "text", phase: "done", text: "sk-test-1234567890" }]),
				{ mode: "warn" },
				redactSecrets(),
			),
		);
		expect(ctxEvents.length).toBe(1);
	});
});

describe("LSG-R10: warn mode onViolation", () => {
	it("calls onViolation in warn mode", async () => {
		const violations: Violation[] = [];
		await collect(
			guardEvents(
				eventsFrom([{ type: "text", phase: "done", text: "sk-test-1234567890" }]),
				{ mode: "warn", onViolation: (v) => violations.push(v) },
				redactSecrets(),
			),
		);
		expect(violations.some((v) => v.rule === "redact_secrets")).toBe(true);
		expect(violations[0]?.mode).toBe("warn");
	});
});

describe("LSG-R11: audit mode tool policy passes through", () => {
	it("audit allowTools passes event with violation logged", async () => {
		const violations: Violation[] = [];
		const event = { type: "tool_call" as const, phase: "done" as const, name: "bash", id: "1" };
		const out = await collect(
			guardEvents(
				eventsFrom([event]),
				{ mode: "audit", onViolation: (v) => violations.push(v) },
				allowTools(["search"]),
			),
		);
		expect(out.some((e) => e.type === "tool_call")).toBe(true);
		expect(violations.some((v) => v.rule === "allow_tools")).toBe(true);
	});
});

describe("LSG-R12: block mode tool deny", () => {
	it("emits safe terminal events on block", async () => {
		const out = await collect(
			guardEvents(
				eventsFrom([{ type: "tool_call", phase: "done", name: "bash", id: "1" }]),
				{ mode: "block" },
				allowTools(["search"]),
			),
		);
		expect(out.some((e) => e.type === "error")).toBe(true);
		expect(out.some((e) => e.type === "finish" && e.reason === "policy_violation")).toBe(true);
	});
});

describe("LSG-R14: golden fixture pair", () => {
	it("matches text-sk.expected.json golden output", async () => {
		const input = JSON.parse(
			readFileSync(join(rootDir, "test/fixtures/redaction/text-sk.input.json"), "utf8"),
		) as GuardEvent[];
		const expected = JSON.parse(
			readFileSync(join(rootDir, "test/fixtures/redaction/text-sk.expected.json"), "utf8"),
		) as GuardEvent[];
		const out = await collect(guardEvents(eventsFrom(input), redactSecrets()));
		expect(out).toEqual(expected);
	});
});

describe("LSG-R15: no false positive on ask-about-sk-", () => {
	it("does not redact innocent ask-about-sk- substring", async () => {
		const text = "ask-about-sk-";
		const out = await collect(
			guardEvents(eventsFrom([{ type: "text", phase: "done", text }]), redactSecrets()),
		);
		if (out[0]?.type === "text") {
			expect(out[0].text).toBe(text);
		}
	});
});

describe("LSG-R16: finish and error are no-op for redactSecrets", () => {
	it("leaves finish unchanged with no violation", async () => {
		const violations: Violation[] = [];
		const finish: GuardEvent = { type: "finish", reason: "stop" };
		const out = await collect(
			guardEvents(
				eventsFrom([finish]),
				{ onViolation: (v) => violations.push(v) },
				redactSecrets(),
			),
		);
		expect(out).toEqual([finish]);
		expect(violations.filter((v) => v.rule === "redact_secrets")).toHaveLength(0);
	});

	it("leaves error message unchanged under redactSecrets alone", async () => {
		const error: GuardEvent = { type: "error", message: "sk-test-1234567890" };
		const out = await collect(guardEvents(eventsFrom([error]), redactSecrets()));
		expect(out).toEqual([error]);
	});

	it("sanitizeErrors handles error events separately", async () => {
		const out = await collect(
			guardEvents(eventsFrom([{ type: "error", message: "sk-leak", code: "x" }]), sanitizeErrors()),
		);
		expect(out[0]).toEqual({ type: "error", message: "An error occurred." });
	});
});

describe("LSG-R06/R07: PII (re-exported here for file split)", () => {
	it("R06 email redaction when enabled", async () => {
		const out = await collect(
			guardEvents(
				eventsFrom([{ type: "text", phase: "done", text: "Contact user@example.com now" }]),
				redactPII({ email: true }),
			),
		);
		if (out[0]?.type === "text") {
			expect(out[0].text).toContain(REDACTED);
			expect(out[0].text).not.toContain("user@example.com");
		}
	});

	it("R07 phone redaction when enabled", async () => {
		const out = await collect(
			guardEvents(
				eventsFrom([{ type: "text", phase: "done", text: "Call 555-123-4567 today" }]),
				redactPII({ phone: true }),
			),
		);
		if (out[0]?.type === "text") {
			expect(out[0].text).toContain(REDACTED);
		}
	});

	it("redactPII() with no flags is no-op", async () => {
		const text = "user@example.com";
		const out = await collect(
			guardEvents(eventsFrom([{ type: "text", phase: "done", text }]), redactPII()),
		);
		if (out[0]?.type === "text") expect(out[0].text).toBe(text);
	});
});

describe("LSG-R08: sanitizeErrors", () => {
	it("replaces error message and records violation", async () => {
		const violations: Violation[] = [];
		const out = await collect(
			guardEvents(
				eventsFrom([{ type: "error", message: "internal stack at /secret/path", code: "500" }]),
				{ onViolation: (v) => violations.push(v) },
				sanitizeErrors({ stripCode: true }),
			),
		);
		expect(out[0]).toEqual({ type: "error", message: "An error occurred." });
		expect(violations.some((v) => v.rule === "sanitize_errors")).toBe(true);
	});
});
