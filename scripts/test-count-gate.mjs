#!/usr/bin/env node
/**
 * LSG-REL51 — enforce minimum Vitest test count before release.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
const minIdx = process.argv.indexOf("--min");
const min = minIdx === -1 ? 4000 : Number(process.argv[minIdx + 1]);

if (!Number.isFinite(min) || min < 1) {
	console.error("Invalid --min value");
	process.exit(1);
}

function parseVitestJson(text) {
	const raw = String(text ?? "").trim();
	if (!raw) return null;
	try {
		return JSON.parse(raw);
	} catch {
		const marker = '{"numTotalTestSuites"';
		const idx = raw.indexOf(marker);
		if (idx >= 0) {
			try {
				return JSON.parse(raw.slice(idx));
			} catch {
				return null;
			}
		}
	}
	return null;
}

let total;
try {
	const out = execFileSync("pnpm", ["exec", "vitest", "run", "--reporter=json"], {
		cwd: rootDir,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		maxBuffer: 64 * 1024 * 1024,
	});
	const json = parseVitestJson(out);
	total = json?.numTotalTests ?? 0;
} catch (err) {
	const combined = `${err.stdout ?? ""}${err.stderr ?? ""}`;
	const json = parseVitestJson(combined);
	if (json) {
		total = json.numTotalTests ?? 0;
	} else {
		console.error("test-count-gate: failed to parse vitest JSON output", err.message);
		process.exit(1);
	}
}

if (total < min) {
	console.error(`test-count-gate: ${total} tests < minimum ${min}`);
	if (checkOnly) process.exit(1);
	process.exitCode = 1;
} else {
	console.log(`OK: ${total} tests (min ${min})`);
}
