/**
 * Extended edge-case tests — Phase 0 pipeline wiring (passthrough).
 * LSG-E08+ — exhaustive union coverage, fuzz splits, context lifecycle, transform combinatorics.
 */
import { describe, expect, it } from "vitest";
import { applyGuardTransforms } from "../src/apply-guard-transforms.js";
import { createByteGuard } from "../src/create-byte-guard.js";
import { createGuardContext, getGuardContextState } from "../src/create-guard-context.js";
import { guardEvents } from "../src/guard-events.js";
import { pipeGuard } from "../src/pipe-guard.js";
import type { ByteTransform, GuardEvent, GuardTransform, ViolationMode } from "../src/types.js";
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
	splitUtf8String,
	utf8,
	utf8String,
} from "./helpers/streams.js";

async function collectEvents(source: AsyncIterable<GuardEvent>): Promise<GuardEvent[]> {
	const out: GuardEvent[] = [];
	for await (const event of source) out.push(event);
	return out;
}

async function expectBytePassthrough(payload: Uint8Array, chunks: Uint8Array[]): Promise<void> {
	const out = await collectBytes(readableFromChunks(chunks).pipeThrough(createByteGuard()));
	expect(bytesEqual(out, payload)).toBe(true);
}

describe("LSG-E08: Phase 0 transform non-execution", () => {
	it("guardEvents never calls transforms (config.transforms)", async () => {
		let calls = 0;
		const trap: GuardTransform = (event) => {
			calls++;
			return null;
		};
		const event: GuardEvent = { type: "text", phase: "delta", text: "x" };
		const out = await collectEvents(
			guardEvents(eventsFrom([event]), { mode: "block", transforms: [trap] }),
		);
		expect(calls).toBe(0);
		expect(out).toEqual([event]);
	});

	it("guardEvents never calls spread transform overload", async () => {
		let calls = 0;
		const trap: GuardTransform = () => {
			calls++;
			return null;
		};
		const event: GuardEvent = { type: "finish", reason: "stop" };
		const out = await collectEvents(guardEvents(eventsFrom([event]), trap, trap));
		expect(calls).toBe(0);
		expect(out).toEqual([event]);
	});

	it("applyGuardTransforms skips transform fn when executeTransforms false", () => {
		let calls = 0;
		const ctx = createGuardContext();
		const event: GuardEvent = { type: "error", message: "x" };
		const out = applyGuardTransforms(
			event,
			ctx,
			[
				() => {
					calls++;
					return null;
				},
			],
			false,
		);
		expect(calls).toBe(0);
		expect(out).toEqual([event]);
	});
});

describe("LSG-E09: GuardEvent union exhaustive passthrough", () => {
	const variants: GuardEvent[] = [
		{ type: "text", phase: "delta", text: "" },
		{ type: "text", phase: "done", text: "full" },
		{ type: "text", phase: "delta", text: "🌍\u200b\u202e mixed" },
		{ type: "tool_call", phase: "delta", argsText: "{" },
		{ type: "tool_call", phase: "done", name: "only_name" },
		{ type: "tool_call", phase: "done", id: "x", name: "n", args: null, argsText: "null" },
		{
			type: "tool_call",
			phase: "done",
			id: "deep",
			name: "nested",
			args: { a: { b: { c: [1, 2, 3] } } },
		},
		{ type: "reasoning", phase: "delta", text: "…" },
		{ type: "reasoning", phase: "done", text: "" },
		{ type: "error", message: "fail" },
		{ type: "error", message: "coded", code: "429" },
		{ type: "finish" },
		{ type: "finish", reason: "length" },
		{ type: "finish", reason: "policy_violation" },
	];

	for (const [index, event] of variants.entries()) {
		it(`variant ${index + 1}: ${event.type}${"phase" in event ? `/${event.phase}` : ""}`, async () => {
			const out = await collectEvents(guardEvents(eventsFrom([event])));
			expect(out).toEqual([event]);
		});
	}

	it("preserves object identity for passthrough events", async () => {
		const event: GuardEvent = { type: "text", phase: "delta", text: "same-ref" };
		const out = await collectEvents(guardEvents(eventsFrom([event])));
		expect(out[0]).toBe(event);
	});
});

describe("LSG-E10: guardEvents stress and source shapes", () => {
	it("handles 2000 sequential text deltas", async () => {
		const events: GuardEvent[] = Array.from({ length: 2000 }, (_, i) => ({
			type: "text" as const,
			phase: "delta" as const,
			text: String(i),
		}));
		const out = await collectEvents(guardEvents(eventsFrom(events)));
		expect(out).toEqual(events);
		expect(out).toHaveLength(2000);
	});

	it("handles async generator with await between each yield", async () => {
		async function* staggered() {
			for (let i = 0; i < 50; i++) {
				await new Promise((r) => setTimeout(r, 0));
				yield { type: "text", phase: "delta", text: `t${i}` } satisfies GuardEvent;
			}
		}
		const out = await collectEvents(guardEvents(staggered()));
		expect(out).toHaveLength(50);
		expect(out[0]).toEqual({ type: "text", phase: "delta", text: "t0" });
		expect(out[49]).toEqual({ type: "text", phase: "delta", text: "t49" });
	});

	it("propagates errors thrown by source mid-stream", async () => {
		async function* failing() {
			yield { type: "text", phase: "delta", text: "before" } satisfies GuardEvent;
			throw new Error("source exploded");
		}
		const collected = collectEvents(guardEvents(failing()));
		await expect(collected).rejects.toThrow("source exploded");
	});

	it("accepts all ViolationMode values on config", async () => {
		const event: GuardEvent = { type: "text", phase: "delta", text: "m" };
		for (const mode of ["block", "warn", "audit"] satisfies ViolationMode[]) {
			const ctx = createGuardContext({ mode });
			expect(ctx.mode).toBe(mode);
			const out = await collectEvents(guardEvents(eventsFrom([event]), { mode }));
			expect(out).toEqual([event]);
		}
	});
});

describe("LSG-E11: applyGuardTransforms combinatorics", () => {
	it("returns [event] when executeTransforms true but transforms empty", () => {
		const ctx = createGuardContext();
		const event: GuardEvent = { type: "text", phase: "delta", text: "x" };
		expect(applyGuardTransforms(event, ctx, [], true)).toEqual([event]);
	});

	it("empty array result from transform removes event from pipeline", () => {
		const ctx = createGuardContext();
		const event: GuardEvent = { type: "text", phase: "delta", text: "gone" };
		const out = applyGuardTransforms(event, ctx, [() => []], true);
		expect(out).toEqual([]);
	});

	it("chains expand → drop → expand", () => {
		const ctx = createGuardContext();
		const event: GuardEvent = { type: "text", phase: "delta", text: "seed" };
		const out = applyGuardTransforms(
			event,
			ctx,
			[
				() => [
					{ type: "text", phase: "delta", text: "a" },
					{ type: "text", phase: "delta", text: "b" },
				],
				(e) => (e.text === "a" ? null : e),
				(e) => [e, { type: "finish", reason: "stop" }],
			],
			true,
		);
		expect(out).toEqual([
			{ type: "text", phase: "delta", text: "b" },
			{ type: "finish", reason: "stop" },
		]);
	});

	it("applies each transform to every expanded event (cartesian step)", () => {
		const ctx = createGuardContext();
		const tags: string[] = [];
		const tag =
			(label: string): GuardTransform =>
			(e) => {
				tags.push(label);
				return e;
			};
		applyGuardTransforms(
			{ type: "text", phase: "delta", text: "x" },
			ctx,
			[
				() => [
					{ type: "text", phase: "delta", text: "1" },
					{ type: "text", phase: "delta", text: "2" },
				],
				tag("second"),
			],
			true,
		);
		expect(tags).toEqual(["second", "second"]);
	});

	it("passes shared context to every transform invocation", () => {
		const ctx = createGuardContext({ mode: "audit" });
		const seen: unknown[] = [];
		applyGuardTransforms(
			{ type: "text", phase: "delta", text: "x" },
			ctx,
			[
				(_, c) => {
					seen.push(c);
					return _;
				},
				(_, c) => {
					seen.push(c);
					return _;
				},
			],
			true,
		);
		expect(seen).toEqual([ctx, ctx]);
	});
});

describe("LSG-E12: pipeGuard byte transform edge cases", () => {
	it("returns empty array when transform drops all byte parts", () => {
		const ctx = createGuardContext();
		const drop: ByteTransform = () => [];
		expect(pipeGuard(drop)(utf8("data"), ctx)).toEqual([]);
	});

	it("composes five transforms left-to-right", () => {
		const ctx = createGuardContext();
		const append =
			(suffix: string): ByteTransform =>
			(chunk) => {
				const out = new Uint8Array(chunk.length + suffix.length);
				out.set(chunk);
				out.set(utf8(suffix), chunk.length);
				return out;
			};
		const result = pipeGuard(
			append("b"),
			append("c"),
			append("d"),
			append("e"),
			append("f"),
		)(utf8("a"), ctx);
		expect(utf8String(result as Uint8Array)).toBe("abcdef");
	});

	it("receives same GuardContext across composed transforms", () => {
		const ctx = createGuardContext();
		const seen: unknown[] = [];
		const record: ByteTransform = (chunk, c) => {
			seen.push(c);
			return chunk;
		};
		pipeGuard(record, record, record)(utf8("x"), ctx);
		expect(seen).toEqual([ctx, ctx, ctx]);
	});

	it("flatten nested multi-chunk outputs from one transform", () => {
		const ctx = createGuardContext();
		const splitEvery: ByteTransform = (chunk) => {
			const parts: Uint8Array[] = [];
			for (let i = 0; i < chunk.length; i++) parts.push(chunk.slice(i, i + 1));
			return parts;
		};
		const result = pipeGuard(splitEvery)(utf8("abcd"), ctx);
		expect(Array.isArray(result)).toBe(true);
		expect((result as Uint8Array[]).map((p) => utf8String(p)).join("")).toBe("abcd");
	});
});

describe("LSG-E13: createByteGuard split matrices", () => {
	const emojiPayload = utf8("αβγ 🚀🔒 sk-live-abc123 中文");

	for (let splitAt = 1; splitAt < emojiPayload.length; splitAt++) {
		it(`every-byte split at ${splitAt}/${emojiPayload.length - 1} preserves payload`, async () => {
			const [a, b] = splitAtByteIndex(emojiPayload, splitAt);
			await expectBytePassthrough(emojiPayload, [a, b]);
		});
	}

	it("passes through binary non-UTF-8 bytes", async () => {
		const binary = new Uint8Array([0, 255, 127, 0x80, 0xc3, 0x28, 1]);
		await expectBytePassthrough(binary, splitIntoFixedSizeChunks(binary, 2));
	});

	it("passes through CRLF SSE frames", async () => {
		const crlf = utf8('data: {"x":1}\r\n\r\ndata: [DONE]\r\n\r\n');
		const splits = splitAtIndices(crlf, [5, 12, 20, crlf.length - 3]);
		await expectBytePassthrough(crlf, splits);
	});

	it("passes through 1-byte chunk stress (256 bytes)", async () => {
		const payload = utf8("x".repeat(256));
		await expectBytePassthrough(payload, splitIntoFixedSizeChunks(payload, 1));
	});

	it("passes through chained createByteGuard instances", async () => {
		const payload = utf8("chain-me");
		const stream = readableFromChunks(splitIntoFixedSizeChunks(payload, 3))
			.pipeThrough(createByteGuard({ mode: "warn" }))
			.pipeThrough(createByteGuard({ mode: "block" }));
		expect(bytesEqual(await collectBytes(stream), payload)).toBe(true);
	});

	it("accepts byte options without applying redaction (Phase 0)", async () => {
		const secret = utf8("Authorization: Bearer sk-secret-xyz");
		const out = await collectBytes(
			readableFromChunks([secret]).pipeThrough(
				createByteGuard({ redactSecrets: true, sanitizeErrors: true, mode: "block" }),
			),
		);
		expect(bytesEqual(out, secret)).toBe(true);
	});
});

describe("LSG-E14: deterministic random split fuzz", () => {
	const payloads = [
		utf8('data: {"key":"sk-abc"}\n\n'),
		utf8("event: message\ndata: hello\n\n"),
		utf8("prefix sk-proj-12345 suffix"),
		utf8("日本語 🔐 token"),
	];

	for (const [payloadIndex, payload] of payloads.entries()) {
		for (const seed of [1, 42, 99, 12345, 999_999]) {
			it(`payload ${payloadIndex + 1} seed ${seed} preserves bytes`, async () => {
				const rng = createSeededRng(seed);
				const indices = randomSplitIndices(payload.length, rng, 24);
				const chunks = splitAtIndices(payload, indices);
				await expectBytePassthrough(payload, chunks);
			});
		}
	}
});

describe("LSG-E15: createGuardContext lifecycle", () => {
	it("isolates violations arrays between contexts", () => {
		const a = createGuardContext();
		const b = createGuardContext();
		a.violations.push({ rule: "a", message: "a", mode: "warn" });
		expect(b.violations).toHaveLength(0);
	});

	it("reset is idempotent and clears byte slots", () => {
		const ctx = createGuardContext({ mode: "block" });
		const state = getGuardContextState(ctx);
		state.byteLookback = utf8("leftover");
		state.pendingUtf8 = utf8("pending");
		ctx.violations.push({ rule: "r", message: "m", mode: "block" });

		ctx.reset();
		ctx.reset();

		expect(ctx.violations).toHaveLength(0);
		expect(getGuardContextState(ctx).byteLookback.length).toBe(0);
		expect(getGuardContextState(ctx).pendingUtf8.length).toBe(0);
	});

	it("retains onViolation callback after reset", () => {
		const violations: unknown[] = [];
		const ctx = createGuardContext({ onViolation: (v) => violations.push(v) });
		ctx.reset();
		expect(ctx.onViolation).toBeTypeOf("function");
	});

	it("byte state is not shared between contexts", () => {
		const a = createGuardContext();
		const b = createGuardContext();
		getGuardContextState(a).byteLookback = utf8("a");
		expect(getGuardContextState(b).byteLookback.length).toBe(0);
	});
});

describe("LSG-E16: stream helper edge cases", () => {
	it("splitAtByteIndex clamps at 0 and length", () => {
		const bytes = utf8("abc");
		const [a0, b0] = splitAtByteIndex(bytes, 0);
		expect(a0.length).toBe(0);
		expect(bytesEqual(b0, bytes)).toBe(true);

		const [aEnd, bEnd] = splitAtByteIndex(bytes, bytes.length);
		expect(bytesEqual(aEnd, bytes)).toBe(true);
		expect(bEnd.length).toBe(0);

		const [aOver, bOver] = splitAtByteIndex(bytes, bytes.length + 50);
		expect(bytesEqual(aOver, bytes)).toBe(true);
		expect(bOver.length).toBe(0);
	});

	it("splitAtIndices with empty list returns single chunk", () => {
		const bytes = utf8("whole");
		expect(splitAtIndices(bytes, [])).toEqual([bytes]);
	});

	it("splitUtf8String mid-emoji is valid UTF-8 when rejoined", () => {
		const str = "a🌍b";
		const bytes = utf8(str);
		const mid = splitUtf8String(str, 2)[0].length;
		const [left, right] = splitAtByteIndex(bytes, mid);
		const rejoined = new TextDecoder().decode(new Uint8Array([...left, ...right]));
		expect(rejoined).toBe(str);
	});

	it("bytesEqual handles empty arrays", () => {
		expect(bytesEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true);
		expect(bytesEqual(utf8("a"), new Uint8Array(0))).toBe(false);
	});
});

describe("LSG-E17: large payload smoke", () => {
	it("1 MiB passthrough with 1024-byte chunks", async () => {
		const oneMiB = 1024 * 1024;
		const payload = new Uint8Array(oneMiB);
		for (let i = 0; i < oneMiB; i++) payload[i] = i & 0xff;

		const chunks = splitIntoFixedSizeChunks(payload, 1024);
		expect(chunks.length).toBe(1024);

		const out = await collectBytes(readableFromChunks(chunks).pipeThrough(createByteGuard()));
		expect(out.length).toBe(oneMiB);
		expect(bytesEqual(out, payload)).toBe(true);
	}, 30_000);
});
