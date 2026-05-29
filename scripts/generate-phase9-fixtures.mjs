#!/usr/bin/env node
/**
 * Generate Phase 9 byte-sse split fixtures + REGISTRY rows (synthetic sk-test only).
 * Runs createByteGuard on split chunks — see scripts/regenerate-phase9-byte-goldens.mjs.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "inherit" });
execFileSync("node", ["scripts/regenerate-phase9-byte-goldens.mjs"], {
	cwd: rootDir,
	stdio: "inherit",
});
