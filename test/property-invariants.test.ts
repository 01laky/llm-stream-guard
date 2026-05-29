/**
 * LSG-PROP01–PROP50 — seeded property invariants.
 */
import { describe, expect, it } from "vitest";
import { createByteGuard } from "../src/create-byte-guard.js";
import { compilePolicy, guardEvents, redactSecrets } from "../src/index.js";
import { eventsFrom } from "./helpers/sample-events.js";
import { pipeThroughByteGuard } from "./helpers/guard-bytes.js";
import {
	bytesEqual,
	collectBytes,
	createSeededRng,
	randomSplitIndices,
	readableFromChunks,
	splitAtIndices,
	utf8,
	utf8String,
} from "./helpers/streams.js";

const SEED = 42;
const SK = "sk-test123456789012345678901234567890";

function randomAscii(len: number, rand: () => number): string {
	let s = "";
	for (let i = 0; i < len; i++) s += String.fromCharCode(32 + Math.floor(rand() * 95));
	return s;
}

describe("LSG-PROP01: property invariants", () => {
	for (let n = 1; n <= 50; n++) {
		it(`PROP${String(n).padStart(2, "0")}: invariant case ${n}`, async () => {
			const caseRng = createSeededRng(SEED + n);
			const payload = utf8(randomAscii(8 + (n % 80), caseRng));
			const indices = randomSplitIndices(payload.length, caseRng, 8 + (n % 8));
			const chunks = splitAtIndices(payload, indices);

			if (n <= 10) {
				const out = await pipeThroughByteGuard(payload, chunks, {});
				expect(bytesEqual(out, payload)).toBe(true);
				return;
			}

			if (n <= 20) {
				const secretPayload = utf8(`${randomAscii(6, caseRng)} ${SK} ${randomAscii(6, caseRng)}`);
				const secretChunks = splitAtIndices(
					secretPayload,
					randomSplitIndices(secretPayload.length, caseRng, 6),
				);
				const out = await pipeThroughByteGuard(secretPayload, secretChunks, {
					redactSecrets: true,
				});
				expect(utf8String(out)).not.toContain(SK);
				expect(utf8String(out)).toContain("[REDACTED]");
				return;
			}

			if (n <= 30) {
				const text = `token ${SK} tail-${n}`;
				const once: unknown[] = [];
				for await (const e of guardEvents(
					eventsFrom([{ type: "text", phase: "done", text }]),
					redactSecrets(),
				)) {
					once.push(e);
				}
				const twice: unknown[] = [];
				for await (const e of guardEvents(eventsFrom(once as never), redactSecrets())) {
					twice.push(e);
				}
				expect(twice).toEqual(once);
				return;
			}

			if (n <= 40) {
				const loaded = compilePolicy({
					version: "1",
					mode: n % 2 === 0 ? "block" : "audit",
					rules: [{ allowTools: { names: ["search"] } }],
				});
				const out: unknown[] = [];
				for await (const e of guardEvents(
					eventsFrom([
						{
							type: "tool_call",
							phase: "done",
							name: n % 3 === 0 ? "bash" : "search",
							id: String(n),
						},
					]),
					{ mode: loaded.mode, transforms: loaded.transforms },
				)) {
					out.push(e);
				}
				const blocked = out.some((e) => (e as { reason?: string }).reason === "policy_violation");
				if (n % 3 === 0 && loaded.mode !== "audit") {
					expect(blocked).toBe(true);
				} else {
					expect(blocked).toBe(false);
				}
				return;
			}

			const stream = readableFromChunks(chunks).pipeThrough(createByteGuard());
			const out = await collectBytes(stream);
			expect(bytesEqual(out, payload)).toBe(true);
		});
	}
});
