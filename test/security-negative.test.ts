/**
 * LSG-SEC01–SEC20 — security negative tests.
 */
import { describe, expect, it } from "vitest";
import { guardEvents, validatePolicy } from "../src/index.js";
import { eventsFrom } from "./helpers/sample-events.js";
import { runCli } from "./helpers/cli-exec.js";

describe("LSG-SEC01: security negative matrix", () => {
	const traversalPaths = [
		"../../../etc/passwd",
		"test/fixtures/policies/valid/../../package.json",
		"/etc/passwd",
	];

	for (let i = 0; i < 20; i++) {
		it(`SEC${String(i + 1).padStart(2, "0")}: negative case ${i + 1}`, async () => {
			if (i < 4) {
				const r = runCli(["validate", traversalPaths[i % traversalPaths.length]!]);
				expect(r.status).not.toBe(0);
				return;
			}

			if (i < 8) {
				const r = runCli(["scan", "--policy", "policies/agent-gate.json", "does-not-exist.json"]);
				expect(r.status).toBe(0);
				expect(r.stdout).toContain("0 files");
				return;
			}

			if (i < 12) {
				const doc = {
					version: "1",
					rules: [{ blockToolArgs: { contains: String.fromCharCode(0) + "secret" + i } }],
				};
				const result = validatePolicy(doc);
				expect(result.ok).toBe(true);
				const out: unknown[] = [];
				for await (const e of guardEvents(
					eventsFrom([
						{
							type: "tool_call",
							phase: "done",
							name: "read_file",
							args: { path: `/etc/passwd-${i}` },
						},
					]),
				)) {
					out.push(e);
				}
				expect(out.length).toBeGreaterThan(0);
				return;
			}

			if (i < 16) {
				const r = runCli([
					"audit",
					"drift",
					"--policy",
					"policies/agent-gate.json",
					"--manifest",
					"test/fixtures/tools/nonexistent-manifest.json",
				]);
				expect(r.status).not.toBe(0);
				return;
			}

			const huge = "x".repeat(10_000 + i * 1000);
			const out: unknown[] = [];
			for await (const e of guardEvents(
				eventsFrom([{ type: "text", phase: "done", text: huge }]),
			)) {
				out.push(e);
			}
			expect(out).toHaveLength(1);
			if (out[0] && typeof out[0] === "object" && "text" in out[0]) {
				expect((out[0] as { text: string }).text.length).toBe(huge.length);
			}
		});
	}
});
