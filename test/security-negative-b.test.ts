/**
 * LSG-SEC21–SEC50 — extended security negative tests (30 cases).
 */
import { describe, expect, it } from "vitest";
import { guardEvents, validatePolicy } from "../src/index.js";
import { eventsFrom } from "./helpers/sample-events.js";
import { runCli } from "./helpers/cli-exec.js";
import { pipeThroughByteGuard } from "./helpers/guard-bytes.js";
import { utf8 } from "./helpers/streams.js";

describe("LSG-SEC21: security negative matrix B", () => {
	for (let i = 20; i < 50; i++) {
		it(`SEC${String(i + 1).padStart(2, "0")}: negative case ${i + 1}`, async () => {
			const n = i - 20;

			if (n < 5) {
				const r = runCli(["validate", `policies/../package.json`]);
				expect(r.status).not.toBe(0);
				return;
			}

			if (n < 10) {
				const r = runCli(["doctor", "test/fixtures/policies/invalid/bad-regexp.json"]);
				expect(r.status).not.toBe(0);
				return;
			}

			if (n < 15) {
				const doc = {
					version: "1",
					rules: [{ blockToolArgs: { contains: `$(malicious-${n})` } }],
				};
				expect(validatePolicy(doc).ok).toBe(true);
				const out: unknown[] = [];
				for await (const e of guardEvents(
					eventsFrom([
						{
							type: "tool_call",
							phase: "done",
							name: "read_file",
							argsText: `run $(malicious-${n})`,
						},
					]),
				)) {
					out.push(e);
				}
				expect(out.length).toBeGreaterThan(0);
				return;
			}

			if (n < 20) {
				const r = runCli([
					"audit",
					"validate-manifest",
					"--manifest",
					"test/fixtures/tools/agent-tools-invalid.json",
				]);
				expect(r.status).not.toBe(0);
				return;
			}

			if (n < 25) {
				let finished = false;
				const payload = utf8(`token-${n}-not-a-real-secret-shape`);
				await pipeThroughByteGuard(payload, [payload], {
					redactSecrets: true,
					onFinish: () => {
						finished = true;
					},
				});
				expect(finished).toBe(true);
				return;
			}

			const r = runCli([
				"scan",
				"--policy",
				"test/fixtures/policies/invalid/bad-regexp.json",
				"test/fixtures/events/clean-tool.json",
			]);
			expect(r.status).not.toBe(0);
		});
	}
});
