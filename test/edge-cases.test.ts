/**
 * Extended edge-case tests — Phase 0 pipeline wiring (passthrough).
 * See also test/edge-cases-extended.test.ts (LSG-E08–E17).
 * Redaction/policy golden tests land in Phase 1 (LSG-C*, LSG-R*, LSG-T*).
 */
import { describe, expect, it } from "vitest";
import { applyGuardTransforms } from "../src/apply-guard-transforms.js";
import { createByteGuard } from "../src/create-byte-guard.js";
import { createGuardContext } from "../src/create-guard-context.js";
import { guardEvents } from "../src/guard-events.js";
import type { GuardEvent } from "../src/types.js";
import { eventsFrom } from "./helpers/sample-events.js";
import {
	bytesEqual,
	collectBytes,
	readableFromChunks,
	splitAtByteIndex,
	utf8,
} from "./helpers/streams.js";

async function collectEvents(source: AsyncIterable<GuardEvent>): Promise<GuardEvent[]> {
	const out: GuardEvent[] = [];
	for await (const event of source) out.push(event);
	return out;
}

describe("LSG-E03: guardEvents source edge cases", () => {
	it("handles async generator that yields after microtask delay", async () => {
		async function* delayed() {
			await Promise.resolve();
			yield { type: "text", phase: "delta", text: "late" } satisfies GuardEvent;
		}
		const out = await collectEvents(guardEvents(delayed()));
		expect(out).toEqual([{ type: "text", phase: "delta", text: "late" }]);
	});

	it("preserves optional fields on tool_call events", async () => {
		const event: GuardEvent = {
			type: "tool_call",
			phase: "done",
			id: "id-1",
			name: "read_file",
			args: { path: "/tmp/x" },
			argsText: '{"path":"/tmp/x"}',
		};
		const out = await collectEvents(guardEvents(eventsFrom([event])));
		expect(out[0]).toEqual(event);
	});

	it("preserves error events without code", async () => {
		const event: GuardEvent = { type: "error", message: "generic" };
		const out = await collectEvents(guardEvents(eventsFrom([event])));
		expect(out).toEqual([event]);
	});
});

describe("LSG-E04: byte guard SSE-shaped payloads", () => {
	const sse = utf8('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n');

	it("passes through single-chunk SSE payload", async () => {
		const out = await collectBytes(readableFromChunks([sse]).pipeThrough(createByteGuard()));
		expect(bytesEqual(out, sse)).toBe(true);
	});

	it("passes through SSE split inside JSON string", async () => {
		const splitAt = 18;
		const [a, b] = splitAtByteIndex(sse, splitAt);
		const out = await collectBytes(readableFromChunks([a, b]).pipeThrough(createByteGuard()));
		expect(bytesEqual(out, sse)).toBe(true);
	});

	it("passes through SSE split at newline boundary", async () => {
		const idx = sse.indexOf(10) + 1;
		const [a, b] = splitAtByteIndex(sse, idx);
		const out = await collectBytes(readableFromChunks([a, b]).pipeThrough(createByteGuard()));
		expect(bytesEqual(out, sse)).toBe(true);
	});
});

describe("LSG-E05: transform pipeline ordering (executeTransforms true)", () => {
	it("runs transforms in order and composes expansions", () => {
		const ctx = createGuardContext();
		const steps: string[] = [];
		const out = applyGuardTransforms(
			{ type: "text", phase: "delta", text: "x" },
			ctx,
			[
				(e) => {
					steps.push("first");
					return e;
				},
				(e) => {
					steps.push("second");
					return [e, { type: "finish", reason: "policy_violation" }];
				},
			],
			true,
		);
		expect(steps).toEqual(["first", "second"]);
		expect(out).toHaveLength(2);
		expect(out[1]).toEqual({ type: "finish", reason: "policy_violation" });
	});

	it("short-circuits to empty when middle transform drops", () => {
		const ctx = createGuardContext();
		const out = applyGuardTransforms(
			{ type: "reasoning", phase: "delta", text: "hidden" },
			ctx,
			[(e) => e, () => null, (e) => e],
			true,
		);
		expect(out).toEqual([]);
	});
});

describe("LSG-E06: createGuardContext mode defaults", () => {
	it("defaults mode to warn", () => {
		expect(createGuardContext().mode).toBe("warn");
	});

	it("honors explicit block mode", () => {
		expect(createGuardContext({ mode: "block" }).mode).toBe("block");
	});
});

describe("LSG-E07: random byte split matrix (passthrough invariant)", () => {
	const payload = utf8("Bearer sk-test-token-12345");

	for (const splitAt of [1, 7, 13, 19, payload.length - 1]) {
		it(`split at byte ${splitAt} preserves output`, async () => {
			const [a, b] = splitAtByteIndex(payload, splitAt);
			const out = await collectBytes(readableFromChunks([a, b]).pipeThrough(createByteGuard()));
			expect(bytesEqual(out, payload)).toBe(true);
		});
	}
});
