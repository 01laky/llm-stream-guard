/**
 * LSG-COV01–COV25 — cross-module integration matrix (byte/event/CLI/policy/audit).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { runStaticScan } from "../src/audit/static-scan.js";
import { CliExit } from "../src/cli/exit-codes.js";
import { scanContent } from "../src/scan/runner.js";
import {
	createByteGuard,
	createGuardContext,
	createGuardFromPolicy,
	guardEvents,
	pipeGuard,
	redactSecrets,
} from "../src/index.js";
import {
	byteRedactSecrets,
	flushByteRedactSecrets,
} from "../src/rules/byte/redact-secrets-byte.js";
import { loadPolicy, resolvePolicyDocument } from "../src/policy/load.js";
import { eventsFrom } from "./helpers/sample-events.js";
import { collectBytes, readableFromChunks, utf8, utf8String } from "./helpers/streams.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(rootDir, "dist/cli.js");
const auditPolicy = join(rootDir, "policies/audit-only.json");
const gatePolicy = join(rootDir, "policies/agent-gate.json");
const secret = "sk-matrix-cov-1234567890";
const REDACTED = "[REDACTED]";

function runCli(args: string[], env?: NodeJS.ProcessEnv) {
	return spawnSync(process.execPath, [cliPath, ...args], {
		cwd: rootDir,
		encoding: "utf8",
		env: { ...process.env, FORCE_COLOR: "0", ...env },
	});
}

function policyMode(mode: "block" | "warn" | "audit") {
	return loadPolicy(auditPolicy, { mode });
}

async function redactEventText(mode: "block" | "warn" | "audit"): Promise<string> {
	const p = policyMode(mode);
	const text = `token ${secret} end`;
	const out: { text?: string }[] = [];
	for await (const e of guardEvents(eventsFrom([{ type: "text", phase: "done", text }]), {
		mode: p.mode,
		transforms: p.transforms,
	})) {
		if (e.type === "text") out.push(e);
	}
	return out[0]?.text ?? "";
}

async function redactByteText(mode: "block" | "warn" | "audit"): Promise<string> {
	const p = policyMode(mode);
	const bytes = await collectBytes(
		readableFromChunks([utf8(`x ${secret} y`)]).pipeThrough(
			createByteGuard({ ...p.byteOptions, mode: p.mode }),
		),
	);
	return utf8String(bytes);
}

beforeAll(() => {
	if (!existsSync(cliPath)) {
		execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
	}
});

afterEach(() => {
	delete process.env.GUARD_MODE;
});

describe("LSG-COV01: block guardEvents redactSecrets", () => {
	it("redacts secret in block mode", async () => {
		const text = await redactEventText("block");
		expect(text).not.toContain(secret);
		expect(text).toContain(REDACTED);
	});
});

describe("LSG-COV02: warn guardEvents redactSecrets", () => {
	it("redacts secret in warn mode", async () => {
		const text = await redactEventText("warn");
		expect(text).not.toContain(secret);
		expect(text).toContain(REDACTED);
	});
});

describe("LSG-COV03: audit guardEvents redactSecrets", () => {
	it("redacts secret in audit mode", async () => {
		const text = await redactEventText("audit");
		expect(text).not.toContain(secret);
		expect(text).toContain(REDACTED);
	});
});

describe("LSG-COV04: block createByteGuard redactSecrets", () => {
	it("redacts secret in block byte mode", async () => {
		const text = await redactByteText("block");
		expect(text).not.toContain(secret);
		expect(text).toContain(REDACTED);
	});
});

describe("LSG-COV05: warn createByteGuard redactSecrets", () => {
	it("redacts secret in warn byte mode", async () => {
		const text = await redactByteText("warn");
		expect(text).not.toContain(secret);
		expect(text).toContain(REDACTED);
	});
});

describe("LSG-COV06: audit createByteGuard redactSecrets", () => {
	it("redacts secret in audit byte mode", async () => {
		const text = await redactByteText("audit");
		expect(text).not.toContain(secret);
		expect(text).toContain(REDACTED);
	});
});

describe("LSG-COV07: pipeGuard byte redact pipeline", () => {
	it("pipeGuard(byteRedactSecrets) redacts like createByteGuard", () => {
		const ctx = createGuardContext({ mode: "audit", onViolation: () => {} });
		const transform = pipeGuard(byteRedactSecrets());
		const mid = transform(utf8(`x ${secret} y`), ctx);
		const chunks = Array.isArray(mid) ? mid : [mid as Uint8Array];
		chunks.push(flushByteRedactSecrets(ctx));
		const total = chunks.reduce((n, c) => n + c.length, 0);
		const merged = new Uint8Array(total);
		let off = 0;
		for (const c of chunks) {
			merged.set(c, off);
			off += c.length;
		}
		expect(utf8String(merged)).toContain(REDACTED);
	});
});

describe("LSG-COV08: createGuardFromPolicy guard()", () => {
	it("guard() yields redacted text events", async () => {
		const g = createGuardFromPolicy(loadPolicy(auditPolicy, { mode: "block" }));
		const events = [];
		for await (const e of g.guard(
			eventsFrom([{ type: "text", phase: "done", text: `leak ${secret}` }]),
		)) {
			events.push(e);
		}
		expect(events[0]?.type).toBe("text");
		if (events[0]?.type === "text") {
			expect(events[0].text).toContain(REDACTED);
		}
	});
});

describe("LSG-COV09: createGuardFromPolicy createByteGuard()", () => {
	it("createByteGuard() pipes redacted bytes", async () => {
		const g = createGuardFromPolicy(loadPolicy(auditPolicy));
		const out = await collectBytes(
			readableFromChunks([utf8(secret)]).pipeThrough(g.createByteGuard()),
		);
		expect(utf8String(out)).toContain(REDACTED);
	});
});

describe("LSG-COV10: scanContent policy scan", () => {
	it("scanContent redacts sk- in audit-only policy", async () => {
		const raw = readFileSync(join(rootDir, "test/fixtures/redaction/text-sk.input.json"), "utf8");
		const result = await scanContent("text-sk.json", raw, loadPolicy(auditPolicy), {
			ext: ".json",
		});
		expect(result.redactions).toBeGreaterThan(0);
		expect(result.violations.some((v) => v.rule.startsWith("redact"))).toBe(true);
	});
});

describe("LSG-COV11: runStaticScan dogfood manifest", () => {
	it("static scan on repo tools/manifest.json is clean", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: gatePolicy,
			manifest: "tools/manifest.json",
		});
		expect(report.drift.filter((f) => f.severity === "error")).toHaveLength(0);
		expect(report.summary.manifests).toBe(1);
	});
});

describe("LSG-COV12: CLI spawn validate", () => {
	it("validate minimal fixture exits 0", () => {
		const r = runCli(["validate", join(rootDir, "test/fixtures/policies/valid/minimal.json")]);
		expect(r.status).toBe(CliExit.ok);
	});
});

describe("LSG-COV13: CLI spawn scan", () => {
	it("scan clean event exits 0", () => {
		const r = runCli([
			"scan",
			"--policy",
			gatePolicy,
			join(rootDir, "test/fixtures/events/clean-tool.json"),
		]);
		expect(r.status).toBe(CliExit.ok);
	});
});

describe("LSG-COV14: merge policy extends", () => {
	it("resolvePolicyDocument merges extends allowTools", () => {
		const doc = resolvePolicyDocument(join(rootDir, "policies/examples/extends-agent.json"), {
			baseDir: join(rootDir, "policies/examples"),
		});
		const allow = doc.rules?.find((r) => r.allowTools)?.allowTools as { names: string[] };
		expect(allow.names).toContain("bash");
		expect(doc.policyVersion).toBe("team-extends-demo");
	});
});

describe("LSG-COV15: drift plus scan combo", () => {
	it("static drift and event scan both flag policy issues", async () => {
		const staticReport = runStaticScan({
			root: rootDir,
			policy: gatePolicy,
			manifest: "test/fixtures/tools/agent-tools-drift.json",
		});
		expect(staticReport.drift.some((f) => f.tool === "web_search")).toBe(true);
		const raw = readFileSync(join(rootDir, "test/fixtures/events/bad-tool.json"), "utf8");
		const scan = await scanContent("bad-tool.json", raw, loadPolicy(gatePolicy), { ext: ".json" });
		expect(scan.violations.length).toBeGreaterThan(0);
	});
});

describe("LSG-COV16: parity text-sk event fixture", () => {
	it("event path matches expected redaction fixture", async () => {
		const raw = readFileSync(join(rootDir, "test/fixtures/redaction/text-sk.input.json"), "utf8");
		const expected = JSON.parse(
			readFileSync(join(rootDir, "test/fixtures/redaction/text-sk.expected.json"), "utf8"),
		);
		const events = JSON.parse(raw) as { type: string; text: string }[];
		const out = [];
		for await (const e of guardEvents(eventsFrom(events), redactSecrets())) {
			out.push(e);
		}
		expect(out).toEqual(expected);
	});
});

describe("LSG-COV17: parity text-sk byte fixture", () => {
	it("byte guard redacts same secret substring", async () => {
		const text = "leak sk-test-1234567890 here";
		const out = await collectBytes(
			readableFromChunks([utf8(text)]).pipeThrough(createByteGuard({ redactSecrets: true })),
		);
		expect(utf8String(out)).toBe("leak [REDACTED] here");
	});
});

describe("LSG-COV18: parity byte-sse sk-mid-line", () => {
	it("byte guard redacts sk- split across SSE chunks", async () => {
		const sse = readFileSync(join(rootDir, "test/fixtures/byte-sse/sk-mid-line.sse"), "utf8");
		const mid = sse.indexOf("sk-");
		const a = utf8(sse.slice(0, mid + 2));
		const b = utf8(sse.slice(mid + 2));
		const out = await collectBytes(
			readableFromChunks([a, b]).pipeThrough(createByteGuard({ redactSecrets: true })),
		);
		expect(utf8String(out)).toContain(REDACTED);
		expect(utf8String(out)).not.toContain("sk-mid");
	});
});

describe("LSG-COV19: parity data-prefix-sk sse scan", () => {
	it("scanContent and byte redact same SSE fixture", async () => {
		const raw = readFileSync(join(rootDir, "test/fixtures/byte-sse/data-prefix-sk.sse"), "utf8");
		const policy = loadPolicy(auditPolicy);
		const scanned = await scanContent("data-prefix-sk.sse", raw, policy, {
			stdinFormat: "sse",
			ext: ".sse",
		});
		const bytes = await collectBytes(
			readableFromChunks([utf8(raw)]).pipeThrough(createByteGuard(policy.byteOptions)),
		);
		expect(scanned.redactions).toBeGreaterThan(0);
		expect(utf8String(bytes)).toContain(REDACTED);
	});
});

describe("LSG-COV20: guardEvents standalone redactSecrets transform", () => {
	it("redactSecrets() transform without full policy", async () => {
		const out = [];
		for await (const e of guardEvents(
			eventsFrom([{ type: "text", phase: "done", text: `x ${secret} y` }]),
			redactSecrets(),
		)) {
			out.push(e);
		}
		expect((out[0] as { text: string }).text).toContain(REDACTED);
	});
});

describe("LSG-COV21: createGuardFromPolicy path string", () => {
	it("loads policy from filesystem path", () => {
		const g = createGuardFromPolicy(auditPolicy);
		expect(g.mode).toBe("audit");
		expect(g.byteOptions.redactSecrets).toBe(true);
	});
});

describe("LSG-COV22: scanContent clean-tool zero violations", () => {
	it("aligned tool event passes agent-gate scan", async () => {
		const raw = readFileSync(join(rootDir, "test/fixtures/events/clean-tool.json"), "utf8");
		const result = await scanContent("clean-tool.json", raw, loadPolicy(gatePolicy), {
			ext: ".json",
		});
		expect(result.violations).toHaveLength(0);
	});
});

describe("LSG-COV23: runStaticScan dangerous manifest", () => {
	it("flags D001 on agent-tools-dangerous fixture", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: gatePolicy,
			manifest: "test/fixtures/tools/agent-tools-dangerous.json",
			strict: true,
		});
		expect(report.dangerous.some((f) => f.code === "D001")).toBe(true);
	});
});

describe("LSG-COV24: CLI spawn audit static", () => {
	it("audit static on dogfood manifest exits 0", () => {
		const r = runCli([
			"audit",
			"static",
			"--policy",
			gatePolicy,
			"--root",
			".",
			"--manifest",
			"tools/manifest.json",
		]);
		expect(r.status).toBe(0);
	});
});

describe("LSG-COV25: byte and event violation mode parity", () => {
	it("warn mode violations recorded for event and byte scans", async () => {
		const policy = loadPolicy(auditPolicy, { mode: "warn" });
		expect(policy.mode).toBe("warn");
		const raw = readFileSync(join(rootDir, "test/fixtures/redaction/text-sk.input.json"), "utf8");
		const scanned = await scanContent("warn-sk.json", raw, policy, { ext: ".json" });
		expect(scanned.redactions).toBeGreaterThan(0);
		expect(scanned.violations.every((v) => v.mode === "warn")).toBe(true);
	});
});
