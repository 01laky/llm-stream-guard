/**
 * LSG-COV186–COV195 — seeded fuzz coverage (seed 42, Mulberry32 LCG via createSeededRng).
 * Re-run with the same seed for reproducible chunk splits and random inputs.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { compilePolicy, guardEvents } from "../src/index.js";
import { normalizeSseToBytes } from "../src/scan/sse-normalize.js";
import {
	blockToolArgsMatcherFromParams,
	matchesBlockToolArgs,
} from "../src/policy/block-tool-args-matcher.js";
import { parseArgs, splitCommaList } from "../src/shared/parse-args.js";
import { eventsFrom } from "./helpers/sample-events.js";
import { pipeThroughByteGuard } from "./helpers/guard-bytes.js";
import {
	bytesEqual,
	createSeededRng,
	randomSplitIndices,
	splitAtIndices,
	utf8,
	utf8String,
} from "./helpers/streams.js";

const FUZZ_SEED = 42;
const rng = createSeededRng(FUZZ_SEED);
const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const SK_SECRET = "sk-test123456789012345678901234567890";
const GHP_SECRET = "ghp_abcdefghijklmnopqrstuvwxyz1234";

beforeAll(() => {
	if (!existsSync(join(rootDir, "dist/index.js"))) {
		execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
	}
});

function randomToolName(i: number): string {
	const base = "tool";
	return `${base}_${i}_${Math.floor(rng() * 1e6)}`;
}

function randomAscii(len: number): string {
	let s = "";
	for (let i = 0; i < len; i++) s += String.fromCharCode(32 + Math.floor(rng() * 95));
	return s;
}

describe("LSG-COV186: createByteGuard sk-test 200 splits", () => {
	it("never leaks sk-test secret across random chunk boundaries", async () => {
		const payload = utf8(`prefix ${SK_SECRET} suffix`);
		const indices = randomSplitIndices(payload.length, rng, 200);
		const chunks = splitAtIndices(payload, indices);
		const out = await pipeThroughByteGuard(payload, chunks, { redactSecrets: true });
		const text = utf8String(out);
		expect(text).not.toContain(SK_SECRET);
		expect(text).toContain("[REDACTED]");
	});
});

describe("LSG-COV187: ghp_ token 100 splits", () => {
	it("never leaks ghp_ token across random chunk boundaries", async () => {
		const payload = utf8(`token=${GHP_SECRET}&ok=1`);
		const indices = randomSplitIndices(payload.length, rng, 100);
		const chunks = splitAtIndices(payload, indices);
		const out = await pipeThroughByteGuard(payload, chunks, { redactSecrets: true });
		const text = utf8String(out);
		expect(text).not.toContain(GHP_SECRET);
		expect(text).toContain("[REDACTED]");
	});
});

describe("LSG-COV188: passthrough no redact equals input", () => {
	it("output bytes match input for 50 random splits without redactSecrets", async () => {
		for (let i = 0; i < 50; i++) {
			const payload = utf8(randomAscii(8 + Math.floor(rng() * 120)));
			const indices = randomSplitIndices(payload.length, rng, 12);
			const chunks = splitAtIndices(payload, indices);
			const out = await pipeThroughByteGuard(payload, chunks, {});
			expect(bytesEqual(out, payload)).toBe(true);
		}
	});
});

describe("LSG-COV189: allowTools block mode random names", () => {
	it("blocks 50 disallowed tool names in block mode", async () => {
		const allowed = "allowed_tool";
		const loaded = compilePolicy({
			version: "1",
			mode: "block",
			rules: [{ allowTools: { names: [allowed] } }],
		});
		for (let i = 0; i < 50; i++) {
			const name = i % 5 === 0 ? allowed : randomToolName(i);
			const out: unknown[] = [];
			for await (const e of guardEvents(
				eventsFrom([{ type: "tool_call", phase: "done", name, id: String(i) }]),
				{ mode: "block", transforms: loaded.transforms },
			)) {
				out.push(e);
			}
			if (name === allowed) {
				expect(out.some((e) => (e as { reason?: string }).reason === "policy_violation")).toBe(
					false,
				);
			} else {
				expect(out.some((e) => (e as { reason?: string }).reason === "policy_violation")).toBe(
					true,
				);
			}
		}
	});
});

describe("LSG-COV190: denyTools 50 cases", () => {
	it("blocks each randomly chosen denied tool name", async () => {
		for (let i = 0; i < 50; i++) {
			const denied = randomToolName(i);
			const other = randomToolName(i + 1000);
			const loaded = compilePolicy({
				version: "1",
				rules: [{ denyTools: { names: [denied] } }],
			});
			for (const [name, expectBlock] of [
				[denied, true],
				[other, false],
			] as const) {
				const out: unknown[] = [];
				for await (const e of guardEvents(
					eventsFrom([{ type: "tool_call", phase: "done", name, id: `${i}-${name}` }]),
					{ mode: "block", transforms: loaded.transforms },
				)) {
					out.push(e);
				}
				expect(out.some((e) => (e as { reason?: string }).reason === "policy_violation")).toBe(
					expectBlock,
				);
			}
		}
	});
});

describe("LSG-COV191: normalizeSseToBytes random strings", () => {
	it("handles 100 random strings without throwing", () => {
		for (let i = 0; i < 100; i++) {
			const input = randomAscii(Math.floor(rng() * 200));
			expect(() => normalizeSseToBytes(input)).not.toThrow();
			const bytes = normalizeSseToBytes(input);
			expect(bytes).toBeInstanceOf(Uint8Array);
		}
	});
});

describe("LSG-COV192: parseArgs shuffled argv", () => {
	it("parses 50 shuffled argv arrays without throwing", () => {
		const tokens = [
			"scan",
			"audit",
			"static",
			"--policy",
			"p.json",
			"--json",
			"--strict",
			"--mode",
			"block",
			"file-a.json",
			"file-b.json",
			"-",
		];
		for (let i = 0; i < 50; i++) {
			const argv = [...tokens];
			for (let j = argv.length - 1; j > 0; j--) {
				const k = Math.floor(rng() * (j + 1));
				[argv[j], argv[k]] = [argv[k]!, argv[j]!];
			}
			expect(() => parseArgs(argv)).not.toThrow();
		}
	});
});

describe("LSG-COV193: splitCommaList no empty strings", () => {
	it("returns no empty segments for 30 fuzzed comma inputs", () => {
		const inputs: unknown[] = [
			undefined,
			true,
			"",
			" a , , b ",
			",,,",
			"single",
			" x,y,z ",
			"  ",
			"one,two,three,four",
		];
		while (inputs.length < 30) {
			const parts = Array.from({ length: 1 + Math.floor(rng() * 6) }, () =>
				rng() > 0.3 ? randomAscii(1 + Math.floor(rng() * 8)).trim() : "",
			);
			inputs.push(parts.join(","));
		}
		for (const input of inputs) {
			const list = splitCommaList(input);
			if (list === undefined) continue;
			expect(list.every((s) => s.length > 0)).toBe(true);
		}
	});
});

describe("LSG-COV194: matchesBlockToolArgs vs manual", () => {
	it("matches manual pattern/contains checks for 50 random strings", () => {
		const matchers = [
			blockToolArgsMatcherFromParams({ pattern: "rm\\s+-rf" })!,
			blockToolArgsMatcherFromParams({ contains: "DROP TABLE" })!,
			blockToolArgsMatcherFromParams({ contains: "169.254.169.254" })!,
		];
		for (let i = 0; i < 50; i++) {
			const value = `${randomAscii(4)} ${i % 7 === 0 ? "rm -rf /" : ""} ${randomAscii(4)}`;
			const manual = matchers.some(
				(m) => m.pattern?.test(value) || (m.contains !== undefined && value.includes(m.contains)),
			);
			expect(matchesBlockToolArgs(value, matchers)).toBe(manual);
		}
	});
});

describe("LSG-COV195: fuzz seed documented", () => {
	it("uses FUZZ_SEED 42 for reproducible Mulberry32 splits", () => {
		expect(FUZZ_SEED).toBe(42);
		const a = createSeededRng(FUZZ_SEED);
		const b = createSeededRng(FUZZ_SEED);
		expect(a()).toBe(b());
		expect(a()).toBe(b());
	});
});
