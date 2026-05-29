/**
 * LSG-XEC0501–XEC1200 — byte passthrough, PII, pipeGuard, idempotency edge cases.
 */
import { describe, expect, it } from "vitest";
import { createByteGuard } from "../src/create-byte-guard.js";
import { createGuardContext, getGuardContextState } from "../src/create-guard-context.js";
import { guardEvents, pipeGuard, redactPII, redactSecrets, sanitizeErrors } from "../src/index.js";
import type { GuardEvent, GuardTransform } from "../src/types.js";
import { eventsFrom } from "./helpers/sample-events.js";
import {
	bytesEqual,
	collectBytes,
	readableFromChunks,
	splitAtByteIndex,
	utf8,
	utf8String,
} from "./helpers/streams.js";

const REDACTED = "[REDACTED]";

async function collectEvents(source: AsyncIterable<GuardEvent>): Promise<GuardEvent[]> {
	const out: GuardEvent[] = [];
	for await (const e of source) out.push(e);
	return out;
}

function buildUtf8Payloads(): string[] {
	const base = [
		"plain ascii stream",
		"unicode αβγδε ζηθ",
		"日本語テスト文字列",
		"🚀🔒 emoji boundary",
		"mixed α and 🌍",
		"CRLF\r\nline breaks",
		"tab\tseparated\tvalues",
		"null-\0-byte-safe-ish",
		"surrogate 🎉 pair test",
		"long-" + "x".repeat(128),
		"sk-not-secret-prefix only",
		"email-like not@redact user@example.com here",
		"phone-like 555-123-4567 embedded",
		'SSE data: {"x":1}\n\n',
		"Bearer not-a-real-token",
		'JSON {"key":"value","n":42}',
		'HTML <tag attr="value">text</tag>',
		"path /usr/local/bin:/bin",
		"backslash \\ escape \\ test",
		"quotes \"double\" and 'single'",
		"numbers 0123456789 repeated",
		"ZWJ family 👨‍👩‍👧‍👦",
		"combining e\u0301 acute",
		"rtl \u202e override",
		"zero-width \u200b joiner",
		"thai ภาษาไทย",
		"arabic العربية",
		"hebrew עברית",
		"cyrillic кириллица",
		"greek ελληνικά",
		"math ∑∫√∞",
		"brackets [{()}] nested",
		"percent %20 encoded feel",
		"underscore_snake_case_id",
	];
	while (base.length < 35) {
		base.push(`generated-payload-${base.length}-${"z".repeat(16 + base.length)}`);
	}
	return base.slice(0, 35);
}

const UTF8_PAYLOADS = buildUtf8Payloads();

describe("LSG-XEC0501: UTF-8 passthrough splits without redactSecrets", () => {
	let id = 501;
	for (const payload of UTF8_PAYLOADS) {
		const bytes = utf8(payload);
		for (let splitIdx = 1; splitIdx <= 10; splitIdx++) {
			const splitAt = Math.max(
				1,
				Math.min(bytes.length - 1, Math.floor((bytes.length * splitIdx) / 10)),
			);
			const caseId = id++;
			it(`XEC${caseId}: passthrough split ${splitIdx}/10 len=${bytes.length}`, async () => {
				const [a, b] = splitAtByteIndex(bytes, splitAt);
				const out = await collectBytes(readableFromChunks([a, b]).pipeThrough(createByteGuard()));
				expect(bytesEqual(out, bytes)).toBe(true);
				expect(utf8String(out)).toBe(payload);
			});
		}
	}
});

describe("LSG-XEC0851: redactPII email and phone matrix", () => {
	const emails = [
		"user@example.com",
		"admin@corp.io",
		"a.b+c@sub.domain.co.uk",
		"123@test.org",
		"team@mail.co.uk",
	];
	const phones = [
		"555-123-4567",
		"555-987-6543",
		"+1-555-111-2222",
		"555-555-1234",
		"555-111-2222",
	];

	let id = 851;

	for (let variant = 0; variant < 20; variant++) {
		const email = emails[variant % emails.length]!;
		const phone = phones[variant % phones.length]!;
		const text = `Contact ${email} or ${phone} for case ${variant}`;

		it(`XEC${id++}: redactPII email+phone event variant ${variant}`, async () => {
			const out = await collectEvents(
				guardEvents(
					eventsFrom([{ type: "text", phase: "done", text }]),
					redactPII({ email: true, phone: true }),
				),
			);
			const result = out[0];
			expect(result?.type).toBe("text");
			if (result?.type === "text") {
				expect(result.text).not.toContain(email);
				expect(result.text).not.toContain(phone);
				expect(result.text).toContain(REDACTED);
			}
		});
	}

	for (let variant = 0; variant < 20; variant++) {
		const email = emails[(variant + 2) % emails.length]!;
		it(`XEC${id++}: redactPII email-only variant ${variant}`, async () => {
			const text = `Write to ${email} please`;
			const out = await collectEvents(
				guardEvents(
					eventsFrom([{ type: "text", phase: "done", text }]),
					redactPII({ email: true }),
				),
			);
			if (out[0]?.type === "text") {
				expect(out[0].text).not.toContain(email);
				expect(out[0].text).toContain(REDACTED);
			}
		});
	}

	for (let variant = 0; variant < 20; variant++) {
		const phone = phones[(variant + 1) % phones.length]!;
		it(`XEC${id++}: redactPII phone-only variant ${variant}`, async () => {
			const text = `Call ${phone} now`;
			const out = await collectEvents(
				guardEvents(
					eventsFrom([{ type: "text", phase: "done", text }]),
					redactPII({ phone: true }),
				),
			);
			if (out[0]?.type === "text") {
				expect(out[0].text).not.toContain(phone);
				expect(out[0].text).toContain(REDACTED);
			}
		});
	}

	for (let variant = 0; variant < 20; variant++) {
		const email = emails[variant % emails.length]!;
		it(`XEC${id++}: redactPII tool args email variant ${variant}`, async () => {
			const out = await collectEvents(
				guardEvents(
					eventsFrom([
						{
							type: "tool_call",
							phase: "done",
							id: String(variant),
							name: "email",
							args: { to: email },
						},
					]),
					redactPII({ email: true }),
				),
			);
			expect(JSON.stringify(out)).not.toContain(email);
		});
	}

	for (let variant = 0; variant < 20; variant++) {
		const phone = phones[variant % phones.length]!;
		it(`XEC${id++}: redactPII delta chunks phone variant ${variant}`, async () => {
			const text = `SMS ${phone} tail-${variant}`;
			const splitAt = 3 + (variant % Math.max(1, text.length - 3));
			const events: GuardEvent[] = [
				{ type: "text", phase: "delta", text: text.slice(0, splitAt) },
				{ type: "text", phase: "done", text },
			];
			const out = await collectEvents(guardEvents(eventsFrom(events), redactPII({ phone: true })));
			expect(JSON.stringify(out)).not.toContain(phone);
		});
	}

	for (let variant = 0; variant < 20; variant++) {
		const email = emails[(variant + 3) % emails.length]!;
		it(`XEC${id++}: redactPII delta chunks email variant ${variant}`, async () => {
			const text = `msg ${email} end`;
			const splitAt = 2 + (variant % Math.max(1, text.length - 2));
			const events: GuardEvent[] = [
				{ type: "text", phase: "delta", text: text.slice(0, splitAt) },
				{ type: "text", phase: "done", text },
			];
			const out = await collectEvents(guardEvents(eventsFrom(events), redactPII({ email: true })));
			expect(JSON.stringify(out)).not.toContain(email);
		});
	}

	for (let variant = 0; variant < 20; variant++) {
		const email = emails[variant % emails.length]!;
		it(`XEC${id++}: redactPII reasoning email variant ${variant}`, async () => {
			const out = await collectEvents(
				guardEvents(
					eventsFrom([{ type: "reasoning", phase: "done", text: `think ${email}` }]),
					redactPII({ email: true }),
				),
			);
			if (out[0]?.type === "reasoning") {
				expect(out[0].text).not.toContain(email);
			}
		});
	}

	for (let variant = 0; variant < 20; variant++) {
		const phone = phones[(variant + 2) % phones.length]!;
		it(`XEC${id++}: redactPII finish passthrough phone variant ${variant}`, async () => {
			const out = await collectEvents(
				guardEvents(eventsFrom([{ type: "finish", reason: "stop" }]), redactPII({ phone: true })),
			);
			expect(out[0]).toEqual({ type: "finish", reason: "stop" });
			expect(JSON.stringify(out)).not.toContain(phone);
		});
	}

	for (let variant = 0; variant < 20; variant++) {
		const email = emails[variant % emails.length]!;
		it(`XEC${id++}: redactPII combined delta email variant ${variant}`, async () => {
			const text = `reach ${email} today`;
			const out = await collectEvents(
				guardEvents(
					eventsFrom([
						{ type: "text", phase: "delta", text: text.slice(0, 6) },
						{ type: "text", phase: "done", text },
					]),
					redactPII({ email: true, phone: true }),
				),
			);
			expect(JSON.stringify(out)).not.toContain(email);
		});
	}

	for (let variant = 0; variant < 20; variant++) {
		const phone = phones[(variant + 1) % phones.length]!;
		it(`XEC${id++}: redactPII combined delta phone variant ${variant}`, async () => {
			const text = `call ${phone} now`;
			const out = await collectEvents(
				guardEvents(
					eventsFrom([
						{ type: "text", phase: "delta", text: text.slice(0, 5) },
						{ type: "text", phase: "done", text },
					]),
					redactPII({ email: true, phone: true }),
				),
			);
			expect(JSON.stringify(out)).not.toContain(phone);
		});
	}

	it("registers 200 PII matrix cases ending at XEC1050", () => {
		expect(id - 1).toBe(1050);
	});
});

describe("LSG-XEC1051: pipeGuard composition and createGuardContext isolation", () => {
	let id = 1051;

	for (let depth = 1; depth <= 25; depth++) {
		it(`XEC${id++}: pipeGuard depth ${depth} preserves bytes`, () => {
			const ctx = createGuardContext();
			const append =
				(ch: string) =>
				(chunk: Uint8Array): Uint8Array => {
					const out = new Uint8Array(chunk.length + ch.length);
					out.set(chunk);
					out.set(utf8(ch), chunk.length);
					return out;
				};
			const fns = Array.from({ length: depth }, (_, i) => append(String(i % 10)));
			const composed = pipeGuard(...fns);
			const input = utf8("a");
			const result = composed(input, ctx);
			expect(Array.isArray(result)).toBe(false);
			expect((result as Uint8Array).length).toBeGreaterThan(input.length);
		});
	}

	for (let i = 0; i < 25; i++) {
		it(`XEC${id++}: context isolation pair ${i}`, () => {
			const a = createGuardContext({ mode: "block" });
			const b = createGuardContext({ mode: "audit" });
			a.violations.push({ rule: `a-${i}`, message: "a", mode: "block" });
			getGuardContextState(a).byteLookback = utf8(`lookback-${i}`);
			expect(b.violations).toHaveLength(0);
			expect(getGuardContextState(b).byteLookback.length).toBe(0);
			expect(a.mode).toBe("block");
			expect(b.mode).toBe("audit");
		});
	}

	for (let i = 0; i < 25; i++) {
		it(`XEC${id++}: pipeGuard shared context ${i}`, () => {
			const ctx = createGuardContext();
			const seen: unknown[] = [];
			const record = (chunk: Uint8Array, c: typeof ctx) => {
				seen.push(c);
				return chunk;
			};
			pipeGuard(record, record, record)(utf8(`x${i}`), ctx);
			expect(seen).toEqual([ctx, ctx, ctx]);
		});
	}

	it("registers 75 pipeGuard/context cases ending at XEC1125", () => {
		expect(id - 1).toBe(1125);
	});
});

describe("LSG-XEC1126: idempotency double pass", () => {
	const secrets = Array.from({ length: 25 }, (_, i) => `sk-idem-${i}-${"a".repeat(12 + i)}`);
	let id = 1126;

	for (const [i, secret] of secrets.entries()) {
		it(`XEC${id++}: redactSecrets idempotent pass ${i}`, async () => {
			const once = await collectEvents(
				guardEvents(
					eventsFrom([{ type: "text", phase: "done", text: `key ${secret}` }]),
					redactSecrets(),
				),
			);
			const twice = await collectEvents(guardEvents(eventsFrom(once), redactSecrets()));
			expect(twice).toEqual(once);
			if (twice[0]?.type === "text") {
				expect(twice[0].text).not.toContain("sk-idem");
				expect(twice[0].text).not.toMatch(/\[REDACTED\]\[REDACTED\]/);
			}
		});
	}

	for (let i = 0; i < 25; i++) {
		const email = `user${i}@example.com`;
		it(`XEC${id++}: redactPII idempotent pass ${i}`, async () => {
			const once = await collectEvents(
				guardEvents(
					eventsFrom([{ type: "text", phase: "done", text: email }]),
					redactPII({ email: true }),
				),
			);
			const twice = await collectEvents(guardEvents(eventsFrom(once), redactPII({ email: true })));
			expect(twice).toEqual(once);
		});
	}

	for (let i = 0; i < 25; i++) {
		it(`XEC${id++}: sanitizeErrors idempotent pass ${i}`, async () => {
			const transform: GuardTransform = sanitizeErrors({ message: "Safe.", stripCode: false });
			const input: GuardEvent = { type: "error", message: `leak-${i}`, code: "500" };
			const once = await collectEvents(guardEvents(eventsFrom([input]), transform));
			const twice = await collectEvents(guardEvents(eventsFrom(once), transform));
			expect(twice).toEqual(once);
			expect(twice[0]).toEqual({ type: "error", message: "Safe.", code: "500" });
		});
	}

	it("registers 75 idempotency cases ending at XEC1200", () => {
		expect(id - 1).toBe(1200);
	});
});
