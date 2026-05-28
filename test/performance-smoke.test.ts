/**
 * LSG-P* — performance smoke tests (timing not gated in CI).
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createGuardContext, getGuardContextState } from "../src/create-guard-context.js";
import {
	BYTE_LOOKBACK_SIZE,
	byteRedactSecrets,
	flushByteRedactSecrets,
} from "../src/rules/byte/redact-secrets-byte.js";
import { pipeGuard } from "../src/pipe-guard.js";
import {
	collectBytes,
	readableFromChunks,
	splitIntoFixedSizeChunks,
	utf8,
	utf8String,
} from "./helpers/streams.js";
import { createByteGuard } from "../src/index.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("LSG-P01: 1 MiB byte redaction", () => {
	it("completes without leaking sk-bench tokens", async () => {
		const token = "sk-bench-1234567890";
		const chunk = token.repeat(32);
		const body = chunk.repeat(Math.ceil((1024 * 1024) / chunk.length)).slice(0, 1024 * 1024);
		const payload = utf8(body);
		const out = await collectBytes(
			readableFromChunks(splitIntoFixedSizeChunks(payload, 1024)).pipeThrough(
				createByteGuard({ redactSecrets: true }),
			),
		);
		expect(utf8String(out)).not.toContain("sk-bench");
	});
});

describe("LSG-P02: bench-smoke script", () => {
	it("bench-smoke.mjs exits 0", () => {
		expect(() => {
			execFileSync("node", ["scripts/bench-smoke.mjs"], { cwd: rootDir, stdio: "pipe" });
		}).not.toThrow();
	});
});

describe("LSG-P03: bounded lookback buffer", () => {
	it("lookback stays within BYTE_LOOKBACK_SIZE + max chunk", () => {
		const ctx = createGuardContext({ mode: "warn" });
		const transform = pipeGuard(byteRedactSecrets());
		const maxChunk = 4096;
		const payload = utf8(`x${"sk-bench-1234567890".repeat(64)}`.repeat(8000));
		let maxBuffer = 0;

		for (const chunk of splitIntoFixedSizeChunks(payload, maxChunk)) {
			transform(chunk, ctx);
			const state = getGuardContextState(ctx);
			maxBuffer = Math.max(maxBuffer, state.byteLookback.length + state.pendingUtf8.length);
		}
		flushByteRedactSecrets(ctx);
		expect(maxBuffer).toBeLessThanOrEqual(BYTE_LOOKBACK_SIZE + maxChunk);
	});
});
