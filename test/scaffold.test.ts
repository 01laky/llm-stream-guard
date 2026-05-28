import { execFileSync, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { applyGuardTransforms } from "../src/apply-guard-transforms.js";
import { createByteGuard } from "../src/create-byte-guard.js";
import { createGuardContext, getGuardContextState } from "../src/create-guard-context.js";
import { guardEvents } from "../src/guard-events.js";
import { pipeGuard } from "../src/pipe-guard.js";
import type { ByteTransform, GuardEvent, GuardTransform, Violation } from "../src/types.js";
import { eventsFrom, sampleEvents } from "./helpers/sample-events.js";
import {
	bytesEqual,
	collectBytes,
	readableFromChunks,
	splitAtByteIndex,
	splitUtf8String,
	utf8,
} from "./helpers/streams.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

beforeAll(() => {
	if (!existsSync(join(rootDir, "dist/index.d.ts"))) {
		execSync("pnpm build", { cwd: rootDir, stdio: "pipe" });
	}
});

async function collectEvents(source: AsyncIterable<GuardEvent>): Promise<GuardEvent[]> {
	const out: GuardEvent[] = [];
	for await (const event of source) out.push(event);
	return out;
}

describe("LSG-S01: build output", () => {
	it("produces ESM, CJS, and declaration artifacts", () => {
		expect(existsSync(join(rootDir, "dist/index.js"))).toBe(true);
		expect(existsSync(join(rootDir, "dist/index.cjs"))).toBe(true);
		expect(existsSync(join(rootDir, "dist/index.d.ts"))).toBe(true);
	});
});

describe("LSG-S02: guardEvents passthrough", () => {
	it("preserves event order and shape for mixed GuardEvent stream", async () => {
		const out = await collectEvents(guardEvents(eventsFrom(sampleEvents)));
		expect(out).toEqual(sampleEvents);
	});

	it("returns empty output for empty async iterable", async () => {
		const out = await collectEvents(guardEvents(eventsFrom([])));
		expect(out).toEqual([]);
	});

	it("accepts config object with transforms and executes identity transform", async () => {
		const noop: GuardTransform = (event) => event;
		const out = await collectEvents(
			guardEvents(eventsFrom([{ type: "text", phase: "delta", text: "x" }]), {
				mode: "audit",
				transforms: [noop],
				onViolation: () => {},
			}),
		);
		expect(out).toEqual([{ type: "text", phase: "delta", text: "x" }]);
	});

	it("accepts spread transform overload and executes transforms", async () => {
		const noop: GuardTransform = (event) => event;
		const out = await collectEvents(
			guardEvents(eventsFrom([{ type: "finish", reason: "stop" }]), noop, (e) => e),
		);
		expect(out).toEqual([{ type: "finish", reason: "stop" }]);
	});

	it("wiring: applyGuardTransforms with identity transform passes through when executeTransforms true", () => {
		const ctx = createGuardContext();
		const event: GuardEvent = { type: "text", phase: "delta", text: "wire" };
		const out = applyGuardTransforms(event, ctx, [(e) => e], true);
		expect(out).toEqual([event]);
	});

	it("wiring: applyGuardTransforms can drop events when transform returns null", () => {
		const ctx = createGuardContext();
		const event: GuardEvent = { type: "error", message: "drop me" };
		const out = applyGuardTransforms(event, ctx, [() => null], true);
		expect(out).toEqual([]);
	});

	it("wiring: applyGuardTransforms expands array results", () => {
		const ctx = createGuardContext();
		const event: GuardEvent = { type: "text", phase: "done", text: "one" };
		const out = applyGuardTransforms(
			event,
			ctx,
			[
				() => [
					{ type: "text", phase: "delta", text: "a" },
					{ type: "text", phase: "delta", text: "b" },
				],
			],
			true,
		);
		expect(out).toEqual([
			{ type: "text", phase: "delta", text: "a" },
			{ type: "text", phase: "delta", text: "b" },
		]);
	});
});

describe("LSG-S03: createByteGuard chunk boundaries", () => {
	it("preserves bytes split across two enqueued chunks", async () => {
		const input = utf8("data: sk-proj-abc\n\n");
		const [c1, c2] = splitAtByteIndex(input, 9);
		const guarded = readableFromChunks([c1, c2]).pipeThrough(createByteGuard());
		const out = await collectBytes(guarded);
		expect(bytesEqual(out, input)).toBe(true);
	});

	it("handles empty stream", async () => {
		const guarded = readableFromChunks([]).pipeThrough(createByteGuard());
		const out = await collectBytes(guarded);
		expect(out.length).toBe(0);
	});

	it("handles many small chunks (stress wiring)", async () => {
		const input = utf8("x".repeat(512));
		const chunks = Array.from({ length: 64 }, (_, i) => input.slice(i * 8, i * 8 + 8));
		const guarded = readableFromChunks(chunks).pipeThrough(createByteGuard());
		const out = await collectBytes(guarded);
		expect(bytesEqual(out, input)).toBe(true);
	});

	it("preserves UTF-8 bytes when split mid-codepoint (Phase 1 redaction prep)", async () => {
		const input = utf8("hello 🌍 world");
		const emojiStart = utf8("hello ").length;
		const [c1, c2] = splitAtByteIndex(input, emojiStart + 2);
		const guarded = readableFromChunks([c1, c2]).pipeThrough(createByteGuard());
		const out = await collectBytes(guarded);
		expect(bytesEqual(out, input)).toBe(true);
	});

	it("uses independent context per createByteGuard call", async () => {
		const a = readableFromChunks([utf8("a")]).pipeThrough(createByteGuard({ mode: "block" }));
		const b = readableFromChunks([utf8("b")]).pipeThrough(createByteGuard({ mode: "audit" }));
		expect(await collectBytes(a)).toEqual(utf8("a"));
		expect(await collectBytes(b)).toEqual(utf8("b"));
	});
});

describe("LSG-S04: verify-zero-deps", () => {
	it("exits 0", () => {
		expect(() => {
			execFileSync("node", ["scripts/verify-zero-deps.mjs"], { cwd: rootDir, stdio: "pipe" });
		}).not.toThrow();
	});
});

describe("LSG-S05: pipeGuard composition", () => {
	it("zero-arg pipeGuard is identity", () => {
		const ctx = createGuardContext();
		const transform = pipeGuard();
		const chunk = utf8("test");
		const out = transform(chunk, ctx);
		expect(out).toBe(chunk);
	});

	it("composes two identity byte transforms", () => {
		const ctx = createGuardContext();
		const identity: ByteTransform = (c) => c;
		const transform = pipeGuard(identity, identity);
		const chunk = utf8("composed");
		const result = transform(chunk, ctx);
		expect(Array.isArray(result) ? result[0] : result).toEqual(chunk);
	});

	it("flattens multi-chunk byte transform output", () => {
		const ctx = createGuardContext();
		const split: ByteTransform = (chunk) => [chunk.slice(0, 1), chunk.slice(1)];
		const transform = pipeGuard(split);
		const chunk = utf8("ab");
		const result = transform(chunk, ctx);
		expect(Array.isArray(result)).toBe(true);
		expect((result as Uint8Array[]).length).toBe(2);
	});
});

describe("LSG-S07: Violation JSON contract + context reset", () => {
	it("round-trips Violation with nested GuardEvent", () => {
		const violation: Violation = {
			rule: "test-rule",
			message: "test message",
			mode: "warn",
			event: { type: "tool_call", phase: "done", name: "bash", args: { cmd: "ls" } },
		};
		expect(JSON.parse(JSON.stringify(violation))).toEqual(violation);
	});

	it("reset() clears violations but preserves mode and onViolation", () => {
		const calls: Violation[] = [];
		const ctx = createGuardContext({
			mode: "block",
			onViolation: (v) => calls.push(v),
		});
		ctx.violations.push({ rule: "r", message: "m", mode: "block" });
		expect(ctx.violations).toHaveLength(1);

		ctx.reset();
		expect(ctx.violations).toHaveLength(0);
		expect(ctx.mode).toBe("block");
		expect(ctx.onViolation).toBeTypeOf("function");

		const state = getGuardContextState(ctx);
		expect(state.byteLookback.length).toBe(0);
		expect(state.pendingUtf8.length).toBe(0);
		expect(state.toolArgsBytesById.size).toBe(0);
	});
});

describe("LSG-E01: concurrent stream isolation", () => {
	it("separate guardEvents iterators do not share context state", async () => {
		const sourceA = eventsFrom([{ type: "text", phase: "delta", text: "A" }]);
		const sourceB = eventsFrom([{ type: "text", phase: "delta", text: "B" }]);
		const [outA, outB] = await Promise.all([
			collectEvents(guardEvents(sourceA)),
			collectEvents(guardEvents(sourceB)),
		]);
		expect(outA).toEqual([{ type: "text", phase: "delta", text: "A" }]);
		expect(outB).toEqual([{ type: "text", phase: "delta", text: "B" }]);
	});
});

describe("LSG-E02: UTF-8 string split helper edge cases", () => {
	it("splitUtf8String at boundaries", () => {
		const [a, b] = splitUtf8String("abc", 0);
		expect(a.length).toBe(0);
		expect(b).toEqual(utf8("abc"));
		const [c, d] = splitUtf8String("abc", 99);
		expect(c).toEqual(utf8("abc"));
		expect(d.length).toBe(0);
	});
});
