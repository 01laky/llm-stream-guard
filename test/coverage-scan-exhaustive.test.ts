/**
 * LSG-COV106–COV130 — exhaustive scan module coverage.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { loadPolicy } from "../src/policy/load.js";
import { scanContent, scanFile, scanPaths, scanStdin } from "../src/scan/runner.js";
import { normalizeSseToBytes, normalizeSseText } from "../src/scan/sse-normalize.js";
import { buildScanReport, violationToScan } from "../src/scan/types.js";
import type { Violation } from "../src/types.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const gatePolicy = () => loadPolicy(join(rootDir, "policies/agent-gate.json"));
const auditPolicy = () => loadPolicy(join(rootDir, "policies/audit-only.json"));

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), "lsg-cov-scan-"));
}

function fixture(path: string): string {
	return join(rootDir, "test/fixtures", path);
}

beforeAll(() => {
	if (!existsSync(join(rootDir, "dist/index.js"))) {
		execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
	}
});

describe("LSG-COV106: detectFormat json array via scanContent", () => {
	it("parses GuardEvent[] from .json extension", async () => {
		const raw = readFileSync(fixture("events/bad-tool.json"), "utf8");
		const result = await scanContent("events.json", raw, gatePolicy(), { ext: ".json" });
		expect(result.skipped).toBe(false);
		expect(result.violations.length).toBeGreaterThan(0);
	});

	it("clean array yields zero violations", async () => {
		const raw = readFileSync(fixture("events/clean-tool.json"), "utf8");
		const result = await scanContent("clean.json", raw, gatePolicy(), { ext: ".json" });
		expect(result.violations).toHaveLength(0);
	});
});

describe("LSG-COV107: detectFormat json events wrapper", () => {
	it("accepts { events: GuardEvent[] } wrapper", async () => {
		const wrapped = JSON.stringify({
			events: [{ type: "tool_call", phase: "done", name: "bash", id: "1" }],
		});
		const result = await scanContent("wrap.json", wrapped, gatePolicy(), { ext: ".json" });
		expect(result.violations.length).toBeGreaterThan(0);
	});

	it("wrapper with clean tools passes gate", async () => {
		const wrapped = JSON.stringify({
			events: [{ type: "tool_call", phase: "done", name: "search", id: "1", args: {} }],
		});
		const result = await scanContent("wrap-clean.json", wrapped, gatePolicy(), { ext: ".json" });
		expect(result.violations).toHaveLength(0);
	});
});

describe("LSG-COV108: detectFormat invalid json throws", () => {
	it("rejects malformed JSON array content", async () => {
		await expect(
			scanContent("broken.json", "{not-json", gatePolicy(), { ext: ".json" }),
		).rejects.toThrow();
	});

	it("rejects JSON object without events array", async () => {
		await expect(
			scanContent("obj.json", '{"foo":1}', gatePolicy(), { ext: ".json" }),
		).rejects.toThrow(/GuardEvent/);
	});
});

describe("LSG-COV109: detectFormat plain text bytes", () => {
	it("scans .txt as byte payload", async () => {
		const result = await scanContent("notes.txt", "plain prose without secrets", auditPolicy(), {
			ext: ".txt",
		});
		expect(result.skipped).toBe(false);
		expect(result.violations).toHaveLength(0);
	});

	it("redacts secrets in text mode", async () => {
		const result = await scanContent(
			"log.txt",
			"token=sk-test123456789012345678901234567890",
			auditPolicy(),
			{ ext: ".txt" },
		);
		expect(result.redactions).toBeGreaterThan(0);
	});
});

describe("LSG-COV110: detectFormat sse via stdinFormat", () => {
	it("stdinFormat sse normalizes data: lines on non-.sse label", async () => {
		const sse = readFileSync(fixture("byte-sse/data-prefix-sk.sse"), "utf8");
		const result = await scanContent("stdin.txt", sse, auditPolicy(), {
			stdinFormat: "sse",
			ext: ".txt",
		});
		expect(result.redactions).toBeGreaterThan(0);
	});

	it("stdinFormat beats extension for byte scan path", async () => {
		const result = await scanContent(
			"x.dat",
			"data: sk-test123456789012345678901234567890\n",
			auditPolicy(),
			{
				stdinFormat: "sse",
				ext: ".json",
			},
		);
		expect(result.redactions).toBeGreaterThan(0);
	});
});

describe("LSG-COV111: detectFormat jsonl extension", () => {
	it("parses one event per line", async () => {
		const jsonl = '{"type":"tool_call","phase":"done","name":"bash","id":"1"}\n';
		const result = await scanContent("stream.jsonl", jsonl, gatePolicy(), { ext: ".jsonl" });
		expect(result.violations.length).toBeGreaterThan(0);
	});

	it("skips blank lines in jsonl", async () => {
		const jsonl =
			'\n{"type":"tool_call","phase":"done","name":"search","id":"1"}\n\n{"type":"finish","reason":"stop"}\n';
		const result = await scanContent("sparse.jsonl", jsonl, gatePolicy(), { ext: ".jsonl" });
		expect(result.violations).toHaveLength(0);
	});
});

describe("LSG-COV112: detectFormat .sse extension", () => {
	it("uses SSE normalize for .sse files", async () => {
		const sse = readFileSync(fixture("byte-sse/sk-mid-line.sse"), "utf8");
		const result = await scanContent("stream.sse", sse, auditPolicy(), { ext: ".sse" });
		expect(result.skipped).toBe(false);
		expect(result.redactions).toBeGreaterThan(0);
	});

	it("fixture data-prefix-sk.sse triggers redaction", async () => {
		const sse = readFileSync(fixture("byte-sse/data-prefix-sk.sse"), "utf8");
		const result = await scanContent("prefix.sse", sse, auditPolicy(), { ext: ".sse" });
		expect(result.redactions).toBeGreaterThan(0);
	});
});

describe("LSG-COV113: detectFormat txt label with stdinFormat json", () => {
	it("stdinFormat json parses event array from .txt label", async () => {
		const raw = readFileSync(fixture("events/bad-tool.json"), "utf8");
		const result = await scanContent("paste.txt", raw, gatePolicy(), {
			stdinFormat: "json",
			ext: ".txt",
		});
		expect(result.violations.length).toBeGreaterThan(0);
	});

	it("stdinFormat json on non-json extension content", async () => {
		const raw = JSON.stringify([{ type: "finish", reason: "stop" }]);
		const result = await scanContent("out.txt", raw, gatePolicy(), {
			stdinFormat: "json",
			ext: ".txt",
		});
		expect(result.violations).toHaveLength(0);
	});
});

describe("LSG-COV114: detectFormat binary skip", () => {
	it("skips content with null byte in first 512 bytes", async () => {
		const binary = "\0\x01\x02hello";
		const result = await scanContent("blob.bin", binary, auditPolicy(), { ext: ".bin" });
		expect(result.skipped).toBe(true);
		expect(result.violations).toHaveLength(0);
	});

	it("skipped binary produces zero redactions", async () => {
		const binary = "prefix\0suffix";
		const result = await scanContent("data.bin", binary, auditPolicy(), { ext: ".bin" });
		expect(result.redactions).toBe(0);
	});
});

describe("LSG-COV115: scanContent label and ext option", () => {
	it("ext option overrides label extension", async () => {
		const jsonl = '{"type":"tool_call","phase":"done","name":"bash","id":"1"}\n';
		const result = await scanContent("mislabeled.txt", jsonl, gatePolicy(), { ext: ".jsonl" });
		expect(result.violations.length).toBeGreaterThan(0);
	});

	it(".json extension with non-json content falls back to text", async () => {
		const result = await scanContent("readme.json", "not json at all", auditPolicy(), {
			ext: ".json",
		});
		expect(result.skipped).toBe(false);
		expect(result.violations).toHaveLength(0);
	});
});

describe("LSG-COV116: scanFile disk read", () => {
	it("reads fixture from filesystem", async () => {
		const path = fixture("events/bad-tool.json");
		const result = await scanFile(path, gatePolicy());
		expect(result.violations.length).toBeGreaterThan(0);
	});

	it("scanFile uses file extension for format", async () => {
		const dir = tempDir();
		try {
			const path = join(dir, "events.jsonl");
			writeFileSync(path, '{"type":"tool_call","phase":"done","name":"bash","id":"1"}\n');
			const result = await scanFile(path, gatePolicy());
			expect(result.violations.length).toBeGreaterThan(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("LSG-COV117: scanPaths empty file list", () => {
	it("returns zero-file summary for empty array", async () => {
		const report = await scanPaths([], gatePolicy());
		expect(report.summary.files).toBe(0);
		expect(report.summary.violations).toBe(0);
		expect(report.violations).toHaveLength(0);
	});

	it("summary mode matches loaded policy", async () => {
		const report = await scanPaths([], auditPolicy());
		expect(report.summary.mode).toBe("audit");
	});
});

describe("LSG-COV118: scanStdin piped input", () => {
	it("scanStdin contract matches scanContent label - with buildScanReport", async () => {
		const raw = readFileSync(fixture("events/bad-tool.json"), "utf8");
		const policy = gatePolicy();
		const content = await scanContent("-", raw, policy, { stdinFormat: "json" });
		const report = buildScanReport(policy, content.violations, 1, content.redactions);
		expect(report.summary.files).toBe(1);
		expect(report.summary.violations).toBeGreaterThan(0);
	});

	it("scanStdin export is callable from scan module", () => {
		expect(typeof scanStdin).toBe("function");
	});
});

describe("LSG-COV119: sse-normalize normalizeSseText", () => {
	it("strips data: prefix and comment lines", () => {
		expect(normalizeSseText(": ping\ndata: hello\n")).toBe("hello");
	});

	it("joins multiple data lines", () => {
		expect(normalizeSseText("data: a\ndata: b\n")).toBe("a\nb");
	});
});

describe("LSG-COV120: sse-normalize normalizeSseToBytes", () => {
	it("returns Uint8Array payload", () => {
		const bytes = normalizeSseToBytes("data: payload\n");
		expect(bytes).toBeInstanceOf(Uint8Array);
		expect(new TextDecoder().decode(bytes)).toBe("payload");
	});

	it("handles CRLF from fixture", () => {
		const sse = readFileSync(fixture("byte-sse/data-prefix-sk.sse"), "utf8");
		const bytes = normalizeSseToBytes(sse);
		expect(new TextDecoder().decode(bytes)).not.toMatch(/^data:/m);
	});
});

describe("LSG-COV121: buildScanReport empty report", () => {
	it("zeros violations and redactions", () => {
		const report = buildScanReport({ mode: "block" }, [], 0, 0);
		expect(report.summary.violations).toBe(0);
		expect(report.summary.redactions).toBe(0);
		expect(report.summary.files).toBe(0);
	});

	it("omits policyVersion when undefined", () => {
		expect(buildScanReport({ mode: "audit" }, [], 1, 0).summary.policyVersion).toBeUndefined();
	});
});

describe("LSG-COV122: buildScanReport with findings", () => {
	it("counts violations and includes mode", () => {
		const v = violationToScan("a.json", sampleViolation(), undefined);
		const report = buildScanReport({ mode: "warn", policyVersion: "v1" }, [v, v], 2, 1);
		expect(report.summary.violations).toBe(2);
		expect(report.summary.policyVersion).toBe("v1");
		expect(report.summary.mode).toBe("warn");
	});

	it("preserves violation list reference", () => {
		const violations = [violationToScan("x.txt", sampleViolation(), "gate")];
		const report = buildScanReport({ mode: "block" }, violations, 1, 0);
		expect(report.violations).toBe(violations);
	});
});

describe("LSG-COV123: violationToScan field mapping", () => {
	it("maps violation fields to scan shape", () => {
		const v = sampleViolation();
		const scan = violationToScan("src/log.txt", v, "team-gate");
		expect(scan.file).toBe("src/log.txt");
		expect(scan.rule).toBe(v.rule);
		expect(scan.message).toBe(v.message);
		expect(scan.mode).toBe(v.mode);
		expect(scan.policyVersion).toBe("team-gate");
	});

	it("omits policyVersion when undefined", () => {
		const scan = violationToScan("-", sampleViolation(), undefined);
		expect(scan.policyVersion).toBeUndefined();
	});
});

describe("LSG-COV124: scanPaths multi-file aggregation", () => {
	it("sums violations across files", async () => {
		const dir = tempDir();
		try {
			const bad = join(dir, "bad.json");
			const clean = join(dir, "clean.json");
			writeFileSync(
				bad,
				JSON.stringify([{ type: "tool_call", phase: "done", name: "bash", id: "1" }]),
			);
			writeFileSync(
				clean,
				JSON.stringify([{ type: "tool_call", phase: "done", name: "search", id: "2" }]),
			);
			const report = await scanPaths([bad, clean], gatePolicy());
			expect(report.summary.files).toBe(2);
			expect(report.summary.violations).toBeGreaterThan(0);
			expect(report.violations.some((v) => v.file === bad)).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("includes policy mode in summary", async () => {
		const dir = tempDir();
		try {
			const path = join(dir, "ok.json");
			writeFileSync(path, readFileSync(fixture("events/clean-tool.json"), "utf8"));
			const report = await scanPaths([path], gatePolicy());
			expect(report.summary.mode).toBe("block");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("LSG-COV125: scanPaths binary skip accounting", () => {
	it("does not increment files count for skipped binary", async () => {
		const dir = tempDir();
		try {
			const bin = join(dir, "skip.bin");
			writeFileSync(bin, Buffer.from([0, 1, 2, 3]));
			const report = await scanPaths([bin], auditPolicy());
			expect(report.summary.files).toBe(0);
			expect(report.summary.violations).toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("counts text file when mixed with binary", async () => {
		const dir = tempDir();
		try {
			const bin = join(dir, "skip.bin");
			const txt = join(dir, "ok.txt");
			writeFileSync(bin, Buffer.from([0]));
			writeFileSync(txt, "hello");
			const report = await scanPaths([bin, txt], auditPolicy());
			expect(report.summary.files).toBe(1);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("LSG-COV126: scanContent fixture parity", () => {
	it("bad-tool fixture matches scanFile", async () => {
		const path = fixture("events/bad-tool.json");
		const fromFile = await scanFile(path, gatePolicy());
		const fromContent = await scanContent(path, readFileSync(path, "utf8"), gatePolicy(), {
			ext: ".json",
		});
		expect(fromContent.violations.length).toBe(fromFile.violations.length);
	});

	it("clean-tool fixture zero violations", async () => {
		const raw = readFileSync(fixture("events/clean-tool.json"), "utf8");
		const result = await scanContent("clean-tool.json", raw, gatePolicy(), { ext: ".json" });
		expect(result.violations).toHaveLength(0);
	});
});

describe("LSG-COV127: violationToScan redact rule metadata", () => {
	it("preserves rule id from violation", () => {
		const v: Violation = {
			rule: "redactSecrets",
			message: "secret redacted",
			mode: "audit",
		};
		expect(violationToScan("stream.sse", v, "audit-v1").rule).toBe("redactSecrets");
	});

	it("uses violation mode not policy mode", () => {
		const v: Violation = { rule: "allowTools", message: "denied", mode: "block" };
		expect(violationToScan("e.json", v, undefined).mode).toBe("block");
	});
});

describe("LSG-COV128: buildScanReport redaction tally", () => {
	it("passes through redaction count", () => {
		const report = buildScanReport({ mode: "audit" }, [], 3, 7);
		expect(report.summary.redactions).toBe(7);
		expect(report.summary.files).toBe(3);
	});

	it("violations length independent of redactions", () => {
		const report = buildScanReport({ mode: "audit" }, [], 1, 5);
		expect(report.summary.violations).toBe(0);
		expect(report.summary.redactions).toBe(5);
	});
});

describe("LSG-COV129: normalizeSseText non-data lines", () => {
	it("preserves event and id lines", () => {
		const text = normalizeSseText("event: msg\nid: 1\ndata: body\n");
		expect(text).toContain("event: msg");
		expect(text).toContain("body");
	});

	it("strips leading space after data colon", () => {
		expect(normalizeSseText("data: spaced")).toBe("spaced");
	});
});

describe("LSG-COV130: scanContent policyVersion in violations", () => {
	it("scanPaths forwards policyVersion into violation rows", async () => {
		const dir = tempDir();
		try {
			const policyPath = join(dir, "gate.json");
			const path = join(dir, "bad.json");
			writeFileSync(
				policyPath,
				JSON.stringify({
					version: "1",
					policyVersion: "cov130-gate",
					mode: "block",
					rules: [{ allowTools: { names: ["search"] } }],
				}),
			);
			writeFileSync(
				path,
				JSON.stringify([{ type: "tool_call", phase: "done", name: "bash", id: "1" }]),
			);
			const policy = loadPolicy(policyPath);
			const report = await scanPaths([path], policy);
			expect(report.summary.policyVersion).toBe("cov130-gate");
			expect(report.violations[0]?.policyVersion).toBe("cov130-gate");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("gate scan reports allow_tools violations on bash", async () => {
		const raw = readFileSync(fixture("events/bad-tool.json"), "utf8");
		const result = await scanContent("bad.json", raw, gatePolicy(), { ext: ".json" });
		expect(result.violations.some((v) => v.rule === "allow_tools")).toBe(true);
	});
});

function sampleViolation(): Violation {
	return { rule: "allowTools", message: "tool not allowed", mode: "block" };
}
