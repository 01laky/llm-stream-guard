/**
 * LSG-C9-G01 — validate Phase 9 byte-sse goldens via createByteGuard (split replay).
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createByteGuard } from "../src/create-byte-guard.js";
import { assertGoldenBytes, runByteGolden } from "./helpers/golden-runner.js";
import { collectBytes, readableFromChunks, splitAtByteIndex } from "./helpers/streams.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const phase9Dir = join(rootDir, "test/fixtures/byte-sse/phase9");

function listPairs(): Array<{ id: string; splitAt: number }> {
	const inputs = readdirSync(phase9Dir)
		.filter((n) => n.endsWith(".sse") && !n.includes(".expected."))
		.sort();
	return inputs.map((name) => {
		const id = name.replace(".sse", "");
		const n = Number(id.replace("split-", ""));
		const payload = readFileSync(join(phase9Dir, name));
		const splitAt = Math.max(1, Math.min(payload.length - 1, n % payload.length));
		return { id, splitAt };
	});
}

describe("LSG-C9-G01: phase9 byte-sse golden pairs", () => {
	const pairs = listPairs();

	for (const { id, splitAt } of pairs) {
		it(`C9-G01 ${id}: split at ${splitAt} matches expected`, async () => {
			const payload = readFileSync(join(phase9Dir, `${id}.sse`));
			const [c1, c2] = splitAtByteIndex(payload, splitAt);
			const actual = await collectBytes(
				readableFromChunks([c1, c2]).pipeThrough(
					createByteGuard({ redactSecrets: true, mode: "block" }),
				),
			);
			assertGoldenBytes(actual, `byte-sse/phase9/${id}.expected.sse`);
			const text = new TextDecoder().decode(actual);
			expect(text).not.toContain("sk-test123456789012345678901234567890");
		});
	}

	it(`validates ${pairs.length} phase9 pairs`, () => {
		expect(pairs.length).toBe(68);
	});
});

describe("LSG-C9-G02: golden-runner smoke", () => {
	it("runByteGolden reads fixture path", async () => {
		const actual = await runByteGolden("byte-sse/sk-mid-line.sse");
		expect(actual.length).toBeGreaterThan(0);
	});
});
