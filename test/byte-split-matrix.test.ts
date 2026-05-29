/**
 * LSG-XEC1201–XEC1600 — byte secret split enumeration.
 * Count: sum(payload.length + 1) for 10 MATRIX_SECRETS + 20 SSE + 21 dual + 10 one-byte ≈ 400+.
 */
import { describe, it } from "vitest";
import { pipeThroughByteGuard } from "./helpers/guard-bytes.js";
import { byteSplitCases, splitIndicesForLength } from "./helpers/split-matrix.js";
import { splitAtByteIndex, splitIntoFixedSizeChunks, utf8 } from "./helpers/streams.js";
import { assertContainsRedacted, assertNoSecretLeak } from "./helpers/golden-runner.js";

describe("LSG-XEC1201: byte split matrix per secret pattern", () => {
	let caseNum = 1201;
	for (const c of byteSplitCases()) {
		for (const splitAt of splitIndicesForLength(c.payload.length)) {
			const id = caseNum++;
			const [a, b] = splitAtByteIndex(c.payload, splitAt);
			it(`XEC${id}: ${c.label} splitAt=${splitAt}`, async () => {
				const out = await pipeThroughByteGuard(c.payload, [a, b], { redactSecrets: true });
				assertNoSecretLeak(out, [c.leak]);
				assertContainsRedacted(out);
			});
		}
	}
});

describe("LSG-XEC1551: SSE data: prefix split redaction", () => {
	const secret = "sk-test123456789012345678901234567890";
	const bytes = utf8(`data: ${secret}\n\n`);
	for (let splitAt = 1; splitAt <= 20; splitAt++) {
		it(`XEC${1550 + splitAt}: SSE split at ${splitAt}`, async () => {
			const [a, b] = splitAtByteIndex(bytes, splitAt);
			const out = await pipeThroughByteGuard(bytes, [a, b], { redactSecrets: true });
			assertNoSecretLeak(out, [secret]);
		});
	}
});

describe("LSG-XEC1571: dual secret stream splits", () => {
	const s1 = "sk-test111111111111111111111111111111";
	const s2 = "ghp_1234567890abcdefghij1234567890ab";
	const bytes = utf8(`start ${s1} mid ${s2} end`);
	for (let splitAt = 5; splitAt <= 25; splitAt++) {
		it(`XEC${1570 + splitAt - 4}: dual secret split at ${splitAt}`, async () => {
			const [a, b] = splitAtByteIndex(bytes, splitAt);
			const out = await pipeThroughByteGuard(bytes, [a, b], { redactSecrets: true });
			assertNoSecretLeak(out, [s1, s2]);
		});
	}
});

describe("LSG-XEC1591: 1-byte chunk stress with secrets", () => {
	for (const [i, c] of byteSplitCases().slice(0, 10).entries()) {
		it(`XEC${1591 + i}: 1-byte chunks ${c.label}`, async () => {
			const chunks = splitIntoFixedSizeChunks(c.payload, 1);
			const out = await pipeThroughByteGuard(c.payload, chunks, { redactSecrets: true });
			assertNoSecretLeak(out, [c.leak]);
		});
	}
});
