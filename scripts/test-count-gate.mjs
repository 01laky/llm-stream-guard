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

const META_TEST_SUFFIXES = [
	"docs-readiness.test.ts",
	"docs-edge-cases.test.ts",
	"release-readiness.test.ts",
];

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

function countMeta(json) {
	let meta = 0;
	for (const file of json.testResults ?? []) {
		const name = String(file.name ?? "");
		if (META_TEST_SUFFIXES.some((suffix) => name.endsWith(suffix))) {
			meta +=
				file.assertionResults?.length ?? (file.numPassingTests ?? 0) + (file.numFailingTests ?? 0);
		}
	}
	return meta;
}

let json;
try {
	const out = execFileSync("pnpm", ["exec", "vitest", "run", "--reporter=json"], {
		cwd: rootDir,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		maxBuffer: 64 * 1024 * 1024,
	});
	json = parseVitestJson(out);
} catch (err) {
	const combined = `${err.stdout ?? ""}${err.stderr ?? ""}`;
	json = parseVitestJson(combined);
	if (!json) {
		console.error("test-count-gate: failed to parse vitest JSON output", err.message);
		process.exit(1);
	}
}

const total = json?.numTotalTests ?? 0;
const meta = countMeta(json);
const behavioral = total - meta;

if (total < min) {
	console.error(`test-count-gate: ${total} tests < minimum ${min}`);
	if (checkOnly) process.exit(1);
	process.exitCode = 1;
} else {
	console.log(`OK: ${total} tests (${behavioral} behavioral, ${meta} meta; min ${min})`);
}
