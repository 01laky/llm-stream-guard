#!/usr/bin/env node
/**
 * Audit examples/ TypeScript against dist types and examples/README.md registry.
 * Wired into pnpm verify as cookbook:check-examples (LSG-CBK15 / LSG-CBK33).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const examplesDir = join(rootDir, "examples");
const readmePath = join(examplesDir, "README.md");
const checkOnly = process.argv.includes("--check");

function walkTs(dir) {
	const out = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) {
			if (name === "minimal-node" || name === "node_modules" || name === "types") continue;
			out.push(...walkTs(path));
		} else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) {
			out.push(relative(examplesDir, path));
		}
	}
	return out;
}

const errors = [];
const tsFiles = walkTs(examplesDir);
const readme = readFileSync(readmePath, "utf8");

for (const file of tsFiles) {
	if (!readme.includes(file)) {
		errors.push(`missing from examples/README.md: ${file}`);
	}
}

for (const file of tsFiles) {
	const text = readFileSync(join(examplesDir, file), "utf8");
	if (/from\s+['"]llm-stream-assemble['"]/.test(text) && !text.includes("import type")) {
		errors.push(`runtime assemble import in ${file}`);
	}
}

if (!existsSync(join(rootDir, "dist/index.d.ts"))) {
	errors.push("dist/index.d.ts missing — run pnpm build first");
}

if (errors.length === 0) {
	try {
		execFileSync("pnpm", ["exec", "tsc", "--noEmit", "-p", "examples/tsconfig.json"], {
			cwd: rootDir,
			stdio: "pipe",
		});
	} catch (err) {
		errors.push(`tsc failed: ${err.stderr?.toString() ?? err.message}`);
	}
}

if (errors.length > 0) {
	console.error("cookbook:check-examples failed:");
	for (const message of errors) console.error(`  - ${message}`);
	process.exit(1);
}

console.log(`OK: ${tsFiles.length} example file(s) typecheck + registry audit`);
if (!checkOnly) process.exit(0);
