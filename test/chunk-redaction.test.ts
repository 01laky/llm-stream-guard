/**
 * LSG-C* — byte-mode chunk boundary redaction tests.
 */
import { describe, expect, it } from "vitest";
import { createByteGuard } from "../src/create-byte-guard.js";
import { BYTE_LOOKBACK_SIZE } from "../src/rules/byte/redact-secrets-byte.js";
import type { Violation } from "../src/types.js";
import { pipeThroughByteGuard } from "./helpers/guard-bytes.js";
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
const byteOpts = { redactSecrets: true as const };

function expectNoSecret(out: Uint8Array, secret: string): void {
	expect(utf8String(out)).not.toContain(secret);
}

describe("LSG-C01: split at byte 3", () => {
	it("redacts sk-test secret split at byte 3", async () => {
		const secret = "sk-test-1234567890";
		const payload = utf8(`prefix ${secret} suffix`);
		const [a, b] = splitAtByteIndex(payload, 3);
		const out = await pipeThroughByteGuard(payload, [a, b], byteOpts);
		expectNoSecret(out, secret);
		expect(utf8String(out)).toContain(REDACTED);
	});
});

describe("LSG-C02: every-byte split on 32-byte secret payload", () => {
	const secret = "sk-test-123456789012345678901234";
	const payload = utf8(secret);

	for (let splitAt = 1; splitAt < payload.length; splitAt++) {
		it(`split at ${splitAt}/${payload.length - 1}`, async () => {
			const [a, b] = splitAtByteIndex(payload, splitAt);
			const out = await pipeThroughByteGuard(payload, [a, b], byteOpts);
			expectNoSecret(out, secret);
		});
	}
});

describe("LSG-C03: UTF-8 emoji + secret mid-codepoint split", () => {
	it("redacts secret when split mid-codepoint and mid-secret", async () => {
		const secret = "sk-test-1234567890";
		const text = `αβγ 🚀🔒 ${secret} 中文`;
		const payload = utf8(text);
		const emojiSplit = utf8("αβγ ").length + 2;
		const [a, b] = splitAtByteIndex(payload, emojiSplit);
		const out = await pipeThroughByteGuard(payload, [a, b], byteOpts);
		expectNoSecret(out, secret);
	});
});

describe("LSG-C04: SSE split inside token", () => {
	it("redacts sk- inside SSE data line when split mid-token", async () => {
		const payload = utf8('data: {"key":"sk-abc1234567890"}\n\n');
		const splitAt = utf8('data: {"key":"sk-ab').length;
		const [a, b] = splitAtByteIndex(payload, splitAt);
		const out = await pipeThroughByteGuard(payload, [a, b], byteOpts);
		expect(utf8String(out)).not.toMatch(/sk-abc1234567890/);
	});
});

describe("LSG-C05: random split fuzz", () => {
	const secret = "sk-proj-fuzz1234567890";
	const payload = utf8(`noise ${secret} tail`);

	for (const seed of [1, 42, 99, 12345]) {
		it(`seed ${seed} never leaks secret`, async () => {
			const rng = createSeededRng(seed);
			const indices = randomSplitIndices(payload.length, rng, 24);
			const chunks = splitAtIndices(payload, indices);
			const out = await pipeThroughByteGuard(payload, chunks, byteOpts);
			expectNoSecret(out, secret);
		});
	}
});

describe("LSG-C06: two secrets straddling lookback window", () => {
	it("redacts both secrets near lookback boundary", async () => {
		const pad = "x".repeat(BYTE_LOOKBACK_SIZE - 10);
		const s1 = "sk-test-1111111111";
		const s2 = "sk-test-2222222222";
		const payload = utf8(`${pad}${s1}${s2}`);
		const splitAt = utf8(pad).length + utf8(s1).length - 5;
		const [a, b] = splitAtByteIndex(payload, splitAt);
		const out = await pipeThroughByteGuard(payload, [a, b], byteOpts);
		expectNoSecret(out, s1);
		expectNoSecret(out, s2);
	});
});

describe("LSG-C07: empty chunk between non-empty chunks", () => {
	it("handles empty middle chunk", async () => {
		const secret = "sk-test-1234567890";
		const payload = utf8(`before ${secret} after`);
		const mid = Math.floor(payload.length / 2);
		const [a, b] = splitAtByteIndex(payload, mid);
		const out = await pipeThroughByteGuard(payload, [a, new Uint8Array(0), b], byteOpts);
		expectNoSecret(out, secret);
	});
});

describe("LSG-C08: flush redacts lookback tail", () => {
	it("redacts secret held in lookback on stream close", async () => {
		const secret = "sk-test-1234567890";
		const payload = utf8(`tail ${secret}`);
		const splitAt = payload.length - 5;
		const [a, b] = splitAtByteIndex(payload, splitAt);
		const out = await pipeThroughByteGuard(payload, [a, b], byteOpts);
		expectNoSecret(out, secret);
		expect(utf8String(out)).toContain(REDACTED);
	});
});

describe("LSG-C09: 1 MiB stream bounded lookback", () => {
	it("processes 1 MiB without leaking embedded secret", async () => {
		const secret = "sk-test-9999999999";
		const prefix = "a".repeat(512 * 1024);
		const suffix = "b".repeat(512 * 1024 - secret.length - 1);
		const payload = utf8(`${prefix}${secret}${suffix}`);
		const chunks = splitIntoFixedSizeChunks(payload, 4096);
		const out = await collectBytes(
			readableFromChunks(chunks).pipeThrough(createByteGuard(byteOpts)),
		);
		expect(out.length).toBeGreaterThan(0);
		expectNoSecret(out, secret);
	});
});

describe("LSG-C10: binary non-UTF-8 preserved outside matches", () => {
	it("preserves binary bytes outside ASCII secret matches", async () => {
		const binary = new Uint8Array([0, 255, 127, 0x80, 0xc3, 0x28, 1]);
		const secret = utf8(" sk-test-1234567890 ");
		const payload = new Uint8Array(binary.length + secret.length);
		payload.set(binary, 0);
		payload.set(secret, binary.length);
		const out = await pipeThroughByteGuard(payload, [binary, secret], byteOpts);
		expect(out[0]).toBe(0);
		expect(out[1]).toBe(255);
		expectNoSecret(out, "sk-test-1234567890");
	});
});

describe("LSG-C11: CRLF SSE frame split", () => {
	it("redacts secret in CRLF SSE when split", async () => {
		const secret = "sk-test-1234567890";
		const payload = utf8(`data: {"token":"${secret}"}\r\n\r\n`);
		const splits = splitAtIndices(payload, [5, 12, 20, payload.length - 8]);
		const out = await pipeThroughByteGuard(payload, splits, byteOpts);
		expectNoSecret(out, secret);
	});
});

describe("LSG-C12: concurrent createByteGuard instances", () => {
	it("independent redaction state per guard instance", async () => {
		const s1 = "sk-test-1111111111";
		const s2 = "sk-test-2222222222";
		const [outA, outB] = await Promise.all([
			pipeThroughByteGuard(utf8(s1), [utf8(s1)], byteOpts),
			pipeThroughByteGuard(utf8(s2), [utf8(s2)], byteOpts),
		]);
		expectNoSecret(outA, s1);
		expectNoSecret(outB, s2);
		expect(utf8String(outA)).toContain(REDACTED);
		expect(utf8String(outB)).toContain(REDACTED);
	});
});

describe("LSG-C14: byte audit mode", () => {
	it("redacts output and fires onViolation in audit mode", async () => {
		const secret = "sk-test-1234567890";
		const payload = utf8(`audit ${secret}`);
		const violations: Violation[] = [];
		const out = await pipeThroughByteGuard(payload, [payload], {
			redactSecrets: true,
			mode: "audit",
			onViolation: (v) => violations.push(v),
		});
		expectNoSecret(out, secret);
		expect(violations.length).toBeGreaterThanOrEqual(1);
		expect(violations[0]?.rule).toBe("redact_secrets");
	});
});
