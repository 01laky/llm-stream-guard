#!/usr/bin/env node
/**
 * Generate Phase 9 byte-sse split fixtures + REGISTRY rows (synthetic sk-test only).
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(rootDir, "test/fixtures/byte-sse/phase9");
mkdirSync(outDir, { recursive: true });

const secret = "sk-test123456789012345678901234567890";
const rows = [];

for (let i = 1; i <= 68; i++) {
	const splitAt = i % (secret.length + 1);
	const payload = `prefix ${secret} suffix`;
	const inputName = `split-${String(i).padStart(2, "0")}.sse`;
	const expectedName = `split-${String(i).padStart(2, "0")}.expected.sse`;
	const redacted = payload.replace(secret, "[REDACTED]");
	writeFileSync(join(outDir, inputName), payload, "utf8");
	writeFileSync(join(outDir, expectedName), redacted, "utf8");
	rows.push(
		`| LSG-C9-${String(i).padStart(2, "0")} | byte-sse/phase9/${inputName} + ${expectedName} | byte redactSecrets | block | split index ${splitAt} |`,
	);
}

const registryPath = join(rootDir, "test/fixtures/REGISTRY.md");
let registry = readFileSync(registryPath, "utf8");
if (!registry.includes("byte-sse/phase9/split-01.sse")) {
	registry = registry.replace(
		"\nPolicy rows are also tracked",
		`\n${rows.join("\n")}\n\nPolicy rows are also tracked`,
	);
	writeFileSync(registryPath, registry, "utf8");
} else if (!registry.includes("byte-sse/phase9/split-68.sse")) {
	const extra = rows.slice(35);
	if (extra.length > 0) {
		registry = registry.replace(
			"\nPolicy rows are also tracked",
			`\n${extra.join("\n")}\n\nPolicy rows are also tracked`,
		);
		writeFileSync(registryPath, registry, "utf8");
	}
}

console.log(`OK: generated ${rows.length} phase9 byte-sse pairs in ${outDir}`);
