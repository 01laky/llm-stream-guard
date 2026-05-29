#!/usr/bin/env node
/**
 * Regenerate Phase 9 byte-sse goldens: split input at byte index, expected from createByteGuard.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createByteGuard } from "../dist/index.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(rootDir, "test/fixtures/byte-sse/phase9");
mkdirSync(outDir, { recursive: true });

const secret = "sk-test123456789012345678901234567890";
const payload = `prefix ${secret} suffix`;
const payloadBytes = new TextEncoder().encode(payload);

async function runGuard(chunks) {
	const guard = createByteGuard({ redactSecrets: true, mode: "block" });
	const stream = new ReadableStream({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(chunk);
			controller.close();
		},
	}).pipeThrough(guard);
	const out = [];
	for await (const chunk of stream) out.push(chunk);
	const total = out.reduce((n, c) => n + c.length, 0);
	const merged = new Uint8Array(total);
	let off = 0;
	for (const c of out) {
		merged.set(c, off);
		off += c.length;
	}
	return merged;
}

const rows = [];

for (let i = 1; i <= 68; i++) {
	const splitAt = Math.max(1, Math.min(payloadBytes.length - 1, i % payloadBytes.length));
	const c1 = payloadBytes.subarray(0, splitAt);
	const c2 = payloadBytes.subarray(splitAt);
	const expected = await runGuard([c1, c2]);
	const inputName = `split-${String(i).padStart(2, "0")}.sse`;
	const expectedName = `split-${String(i).padStart(2, "0")}.expected.sse`;
	writeFileSync(join(outDir, inputName), payload, "utf8");
	writeFileSync(join(outDir, expectedName), expected);
	rows.push(
		`| LSG-C9-${String(i).padStart(2, "0")} | byte-sse/phase9/${inputName} + ${expectedName} | byte redactSecrets | block | split at byte ${splitAt} |`,
	);
}

let registry = readFileSync(join(rootDir, "test/fixtures/REGISTRY.md"), "utf8");
const start = registry.indexOf("| LSG-C9-01 |");
const end = registry.indexOf("| LSG-SAR22 |");
if (start >= 0 && end > start) {
	registry = registry.slice(0, start) + `${rows.join("\n")}\n\n` + registry.slice(end);
	writeFileSync(join(rootDir, "test/fixtures/REGISTRY.md"), registry, "utf8");
}

console.log(`OK: regenerated ${rows.length} byte-sse phase9 golden pairs`);
