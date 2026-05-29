/**
 * LSG-CBK* — integration cookbook docs, examples, and behavioral recipes.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { streamEventToGuardEvent } from "../examples/assemble-mapper/stream-event-to-guard.js";
import { runAgentLoop } from "../examples/event-gate/agent-loop.js";
import { createPolicyDrivenGuard } from "../examples/event-gate/policy-driven.js";
import { runDualStreamAudit } from "../examples/dual-stream/audit-side-channel.js";
import type { GuardEvent } from "../src/types.js";
import { eventsFrom } from "./helpers/sample-events.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const cookbook = readFileSync(join(rootDir, "docs/integration-cookbook.md"), "utf8");
const examplesReadme = readFileSync(join(rootDir, "examples/README.md"), "utf8");

async function* asyncFrom<T>(items: T[]): AsyncGenerator<T> {
	for (const item of items) yield item;
}

describe("LSG-CBK01–20: cookbook docs and layout", () => {
	const headings = [
		"## 1. Prerequisites",
		"## 2. Byte mode proxies",
		"## 3. Event mode tool gate",
		"## 4. Policy-driven setup",
		"## 5. Transform ordering",
		"## 6. Assemble + guard",
		"## 7. Vercel AI SDK",
		"## 8. Dual-stream audit",
		"## 9. MCP tool gate",
		"## 10. LiteLLM / gateway",
		"## 11. CI & GitHub Action",
		"## 12. Migration",
		"## 13. Troubleshooting",
	];

	for (const h of headings) {
		it(`cookbook contains ${h}`, () => {
			expect(cookbook).toContain(h);
		});
	}

	it("LSG-CBK02: Hono createByteGuard", () => {
		expect(cookbook).toContain("createByteGuard");
		expect(cookbook.toLowerCase()).toContain("hono");
	});

	it("LSG-CBK03: Express byte proxy + stream conversion", () => {
		expect(cookbook.toLowerCase()).toContain("express");
		expect(cookbook).toMatch(/Readable\.fromWeb|stream conversion/i);
	});

	it("LSG-CBK04: Workers byte proxy", () => {
		expect(cookbook.toLowerCase()).toContain("cloudflare workers");
	});

	it("LSG-CBK05: guard-before-execute", () => {
		expect(cookbook).toContain("executeTool");
		expect(cookbook).toContain("policy_violation");
	});

	it("LSG-CBK06: createGuardFromPolicy + loadPolicy", () => {
		expect(cookbook).toContain("createGuardFromPolicy");
		expect(cookbook).toContain("loadPolicy");
	});

	it("LSG-CBK07: assemble mapper separate install", () => {
		expect(cookbook).toContain("llm-stream-assemble");
	});

	it("LSG-CBK08: dual-stream audit", () => {
		expect(cookbook).toContain("Dual-stream audit");
		expect(cookbook).toContain("onViolation");
	});

	it("LSG-CBK09: CI yaml validate and scan", () => {
		expect(cookbook).toContain("```yaml");
		expect(cookbook).toContain("llm-stream-guard validate");
		expect(cookbook).toContain("llm-stream-guard scan");
	});

	it("LSG-CBK10: migration doc linked", () => {
		expect(cookbook).toContain("migration-from-regex.md");
		expect(existsSync(join(rootDir, "docs/migration-from-regex.md"))).toBe(true);
	});

	it("LSG-CBK11: examples README lists subdirs", () => {
		for (const dir of [
			"byte-proxy",
			"event-gate",
			"assemble-mapper",
			"ai-sdk-mapper",
			"dual-stream",
			"policy-ci",
			"minimal-node",
		]) {
			expect(examplesReadme).toContain(dir);
		}
	});

	it("LSG-CBK12: hono.ts exports handler", () => {
		expect(existsSync(join(rootDir, "examples/byte-proxy/hono.ts"))).toBe(true);
		expect(readFileSync(join(rootDir, "examples/byte-proxy/hono.ts"), "utf8")).toContain(
			"createHonoByteProxyApp",
		);
	});

	it("LSG-CBK14: no runtime assemble import", () => {
		const text = readFileSync(
			join(rootDir, "examples/assemble-mapper/stream-event-to-guard.ts"),
			"utf8",
		);
		expect(text).not.toMatch(/from\s+['"]llm-stream-assemble['"]/);
	});

	it("LSG-CBK16: new diagram SVGs exist", () => {
		for (const name of ["agent-gate-loop.svg", "dual-stream.svg", "migration-path.svg"]) {
			expect(existsSync(join(rootDir, "docs/img", name))).toBe(true);
		}
	});

	it("LSG-CBK17: build-diagrams includes new mmd", () => {
		const script = readFileSync(join(rootDir, "scripts/build-diagrams.mjs"), "utf8");
		expect(script).toContain("agent-gate-loop.mmd");
		expect(script).toContain("dual-stream.mmd");
		expect(script).toContain("migration-path.mmd");
	});

	it("LSG-CBK18: README links cookbook and examples", () => {
		const readme = readFileSync(join(rootDir, "README.md"), "utf8");
		expect(readme).toContain("integration-cookbook.md");
		expect(readme).toContain("examples/README.md");
	});

	it("LSG-CBK19: FAQ runnable examples", () => {
		const faq = readFileSync(join(rootDir, "docs/faq.md"), "utf8");
		expect(faq.toLowerCase()).toMatch(/runnable examples|examples\/readme/i);
	});

	it("LSG-CBK20: testing-strategy LSG-CBK prefix", () => {
		const doc = readFileSync(join(rootDir, "docs/testing-strategy.md"), "utf8");
		expect(doc).toContain("LSG-CBK");
	});
});

describe("LSG-CBK21–28: behavioral recipes", () => {
	it("LSG-CBK21: block mode skips execute on disallowed tool", async () => {
		let executed = false;
		const result = await runAgentLoop(
			eventsFrom([
				{ type: "tool_call", phase: "done", name: "bash", id: "1", args: { cmd: "ls" } },
			]),
			{
				mode: "block",
				allowedTools: ["search"],
				executeTool: async () => {
					executed = true;
				},
			},
		);
		expect(executed).toBe(false);
		expect(result.events.some((e) => e.type === "finish" && e.reason === "policy_violation")).toBe(
			true,
		);
	});

	it("LSG-CBK22: audit mode passes tool + onViolation", async () => {
		const result = await runAgentLoop(
			eventsFrom([
				{ type: "tool_call", phase: "done", name: "bash", id: "1", args: { cmd: "ls" } },
			]),
			{
				mode: "audit",
				allowedTools: ["search"],
				executeTool: async () => {},
			},
		);
		expect(result.violations.length).toBeGreaterThan(0);
		expect(result.events.some((e) => e.type === "tool_call" && e.name === "bash")).toBe(true);
	});

	it("LSG-CBK23: policy path resolves", () => {
		const guard = createPolicyDrivenGuard(join(rootDir, "policies/agent-gate.json"));
		expect(guard.transforms.length).toBeGreaterThan(0);
	});

	it("LSG-CBK24: dual-stream audit collects violations", async () => {
		const result = await runDualStreamAudit(
			eventsFrom([
				{ type: "tool_call", phase: "done", name: "bash", id: "1", args: {} },
			] as GuardEvent[]),
			["search"],
		);
		expect(result.auditLog.length).toBeGreaterThan(0);
		expect(result.clientEvents.some((e) => e.type === "tool_call")).toBe(true);
	});

	it("LSG-CBK25: assemble mapper fixture", () => {
		const mapped = streamEventToGuardEvent({
			type: "tool_call.done",
			id: "1",
			name: "search",
			args: { q: "x" },
		});
		expect(mapped).toEqual({
			type: "tool_call",
			phase: "done",
			id: "1",
			name: "search",
			args: { q: "x" },
		});
	});

	it("LSG-CBK26: workers example no node-only imports", () => {
		const text = readFileSync(join(rootDir, "examples/byte-proxy/workers.ts"), "utf8");
		expect(text).not.toContain("node:fs");
		expect(text).not.toContain("node:child_process");
	});

	it("LSG-CBK27: policy-ci scan script exits 0", () => {
		if (!existsSync(join(rootDir, "dist/cli.js"))) {
			execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
		}
		const r = spawnSync("bash", [join(rootDir, "examples/policy-ci/scan-fixtures.sh")], {
			cwd: rootDir,
			encoding: "utf8",
		});
		expect(r.status).toBe(0);
	});
});

describe("LSG-CBK29–34: §15 enhancements", () => {
	it("LSG-CBK29: AI SDK mapper file exists", () => {
		expect(existsSync(join(rootDir, "examples/ai-sdk-mapper/map-stream-part.ts"))).toBe(true);
		expect(examplesReadme).toContain("ai-sdk-mapper/map-stream-part.ts");
		const pkg = readFileSync(join(rootDir, "package.json"), "utf8");
		expect(pkg).not.toContain("@ai-sdk");
	});

	it("LSG-CBK30: MCP recipe doc", () => {
		const doc = readFileSync(join(rootDir, "docs/mcp-tool-gate-recipe.md"), "utf8");
		expect(doc).toContain("tool_call");
		expect(cookbook).toContain("mcp-tool-gate-recipe.md");
	});

	it("LSG-CBK31: LiteLLM hook doc", () => {
		const doc = readFileSync(join(rootDir, "docs/litellm-gateway-hook.md"), "utf8");
		expect(doc).toContain("createByteGuard");
		expect(readFileSync(join(rootDir, "package.json"), "utf8")).not.toContain('"litellm"');
	});

	it("LSG-CBK32: migration four steps", () => {
		const doc = readFileSync(join(rootDir, "docs/migration-from-regex.md"), "utf8");
		expect(doc).toContain("Step 1");
		expect(doc).toContain("Step 2");
		expect(doc).toContain("Step 3");
		expect(doc).toContain("Step 4");
		expect(existsSync(join(rootDir, "docs/img/migration-path.svg"))).toBe(true);
	});

	it("LSG-CBK33: registry lists at least 8 example paths", () => {
		const matches = examplesReadme.match(/\.ts`|\.sh`|\.mjs`/g) ?? [];
		expect(matches.length).toBeGreaterThanOrEqual(8);
	});

	it("LSG-CBK34: troubleshooting guide has symptom table rows", () => {
		const doc = readFileSync(join(rootDir, "docs/troubleshooting.md"), "utf8");
		const table = doc.split("## Quick symptom index")[1]?.split("\n---\n")[0] ?? "";
		const rows = table.match(/^\| [^|]/gm) ?? [];
		expect(rows.length).toBeGreaterThanOrEqual(8);
		expect(cookbook).toContain("troubleshooting.md");
	});
});

describe("LSG-CBK13–15: scripts", () => {
	it("LSG-CBK15: check-cookbook-examples exits 0", () => {
		if (!existsSync(join(rootDir, "dist/index.d.ts"))) {
			execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
		}
		const r = spawnSync("node", ["scripts/check-cookbook-examples.mjs", "--check"], {
			cwd: rootDir,
			encoding: "utf8",
		});
		expect(r.status).toBe(0);
	});
});
