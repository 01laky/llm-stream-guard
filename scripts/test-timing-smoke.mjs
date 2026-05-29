#!/usr/bin/env node
/**
 * LSG-REL52 — informational CI timing budget for full test suite.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const warnOnly = process.argv.includes("--warn-only");
const maxIdx = process.argv.indexOf("--max-ms");
const maxMs = maxIdx === -1 ? 480_000 : Number(process.argv[maxIdx + 1]);
const ci = process.env.CI === "true" || process.env.CI === "1";

const start = Date.now();
try {
	execFileSync("pnpm", ["test"], { cwd: rootDir, stdio: "inherit" });
} catch {
	process.exit(1);
}
const elapsed = Date.now() - start;

console.log(`test-timing-smoke: ${elapsed}ms (budget ${maxMs}ms)`);

if (elapsed > maxMs) {
	const msg = `test suite exceeded ${maxMs}ms (${elapsed}ms) — consider vitest --shard`;
	if (warnOnly && !ci) {
		console.warn(`WARN: ${msg}`);
	} else if (ci) {
		console.warn(`WARN: ${msg}`);
	} else {
		console.warn(`WARN: ${msg}`);
	}
}
