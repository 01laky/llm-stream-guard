import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createByteGuard } from "../../src/create-byte-guard.js";
import type { ByteGuardOptions, GuardEvent, GuardMode, GuardTransform } from "../../src/types.js";
import { guardEvents } from "../../src/index.js";
import { collectBytes, readableFromChunks, utf8, utf8String } from "./streams.js";

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

export function assertNoSecretLeak(output: string | Uint8Array, secrets: string[]): void {
	const text = typeof output === "string" ? output : utf8String(output);
	for (const s of secrets) {
		if (text.includes(s)) throw new Error(`leak detected: ${s.slice(0, 12)}…`);
	}
}

export async function runByteGolden(
	inputPath: string,
	options: ByteGuardOptions = { redactSecrets: true },
): Promise<Uint8Array> {
	const abs = join(fixturesRoot, inputPath);
	const payload = readFileSync(abs);
	return collectBytes(readableFromChunks([payload]).pipeThrough(createByteGuard(options)));
}

export async function runEventGolden(
	inputPath: string,
	transforms: GuardTransform[],
	mode: GuardMode = "warn",
): Promise<GuardEvent[]> {
	const abs = join(fixturesRoot, inputPath);
	const events = JSON.parse(readFileSync(abs, "utf8")) as GuardEvent[];
	const out: GuardEvent[] = [];
	for await (const e of guardEvents(events, { mode }, ...transforms)) out.push(e);
	return out;
}

export function assertGoldenBytes(actual: Uint8Array, expectedPath: string): void {
	const expected = readFileSync(join(fixturesRoot, expectedPath));
	if (actual.length !== expected.length) {
		throw new Error(`byte length ${actual.length} !== ${expected.length}`);
	}
	for (let i = 0; i < actual.length; i++) {
		if (actual[i] !== expected[i]) throw new Error(`byte mismatch at ${i}`);
	}
}

export function assertGoldenEvents(actual: GuardEvent[], expectedPath: string): void {
	const expected = JSON.parse(readFileSync(join(fixturesRoot, expectedPath), "utf8"));
	expectJsonEqual(actual, expected);
}

function expectJsonEqual(a: unknown, b: unknown): void {
	if (JSON.stringify(a) !== JSON.stringify(b)) {
		throw new Error("event golden mismatch");
	}
}

export function assertContainsRedacted(output: Uint8Array | string): void {
	const text = typeof output === "string" ? output : utf8String(output);
	if (!text.includes("[REDACTED]")) throw new Error("expected [REDACTED]");
}

export { utf8 };
