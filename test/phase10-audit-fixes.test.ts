/**
 * Phase 10.1 audit fixes — behavior tests for reset, blockToolArgs, manifest parse, PII delta, policyVersion.
 */
import { describe, expect, it } from "vitest";
import { createByteGuard } from "../src/create-byte-guard.js";
import { createGuardContext } from "../src/create-guard-context.js";
import { recordViolation } from "../src/record-violation.js";
import { runStaticScan } from "../src/audit/static-scan.js";
import { scanBlockToolArgsStatic } from "../src/audit/block-tool-args-static.js";
import { countStaticErrors } from "../src/audit/format-report.js";
import {
	allowTools,
	blockToolArgs,
	guardEvents,
	redactPII,
	summarizeGuardContext,
} from "../src/index.js";
import { eventsFrom } from "./helpers/sample-events.js";
import { pipeThroughByteGuard } from "./helpers/guard-bytes.js";
import {
	collectBytes,
	readableFromChunks,
	splitAtByteIndex,
	utf8,
	utf8String,
} from "./helpers/streams.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("LSG-AUD01: GuardContext.reset clears redactions", () => {
	it("AUD01: redactions zero after reset", () => {
		const ctx = createGuardContext();
		recordViolation(ctx, { rule: "redact_secrets", message: "r" });
		expect(summarizeGuardContext(ctx).redactions).toBe(1);
		ctx.reset();
		expect(summarizeGuardContext(ctx).redactions).toBe(0);
	});
});

describe("LSG-AUD02: blockToolArgs non-serializable args", () => {
	it("AUD02: circular args do not throw", async () => {
		const circular: { self?: unknown } = {};
		circular.self = circular;
		const out: unknown[] = [];
		for await (const e of guardEvents(
			eventsFrom([{ type: "tool_call", phase: "done", name: "read_file", args: circular }]),
			{ transforms: [blockToolArgs(/secret/)] },
		)) {
			out.push(e);
		}
		expect(out.length).toBeGreaterThan(0);
	});

	it("AUD03: BigInt args do not throw", async () => {
		let count = 0;
		for await (const _ of guardEvents(
			eventsFrom([
				{
					type: "tool_call",
					phase: "done",
					name: "read_file",
					args: { n: BigInt(1) },
				},
			]),
			{ transforms: [blockToolArgs("1")] },
		)) {
			count += 1;
		}
		expect(count).toBe(1);
	});
});

describe("LSG-AUD04: manifest parse errors surface", () => {
	it("AUD04: corrupt manifest yields MANIFEST_PARSE_ERROR", () => {
		expect(typeof scanBlockToolArgsStatic).toBe("function");
		const report = runStaticScan({
			root: rootDir,
			policy: "policies/agent-gate.json",
			manifest: "test/fixtures/tools/corrupt-manifest.raw",
		});
		expect(report.dangerous.some((f) => f.code === "MANIFEST_PARSE_ERROR")).toBe(true);
		expect(countStaticErrors(report, false)).toBeGreaterThan(0);
	});
});

describe("LSG-AUD05: redactPII on tool_call delta", () => {
	it("AUD05: email redacted in argsText delta", async () => {
		const out: string[] = [];
		for await (const e of guardEvents(
			eventsFrom([
				{
					type: "tool_call",
					phase: "delta",
					name: "email",
					argsText: '{"to":"user@example.com"}',
				},
			]),
			{ transforms: [redactPII({ email: true })] },
		)) {
			if (e.type === "tool_call" && e.argsText) out.push(e.argsText);
		}
		expect(out.join("")).not.toContain("user@example.com");
		expect(out.join("")).toContain("[REDACTED]");
	});
});

describe("LSG-AUD06: byte sanitizeErrors split survival", () => {
	it("AUD06: split error message is sanitized on flush", async () => {
		const payload = utf8('data: {"error":{"message":"internal /etc/passwd leak"}}\n\n');
		const [a, b] = splitAtByteIndex(payload, 14);
		const out = await collectBytes(
			readableFromChunks([a, b]).pipeThrough(createByteGuard({ sanitizeErrors: true })),
		);
		expect(utf8String(out)).not.toContain("/etc/passwd");
		expect(utf8String(out)).toContain("An error occurred.");
	});
});

describe("LSG-AUD07: policyVersion empty string propagation", () => {
	it("AUD07: summarize includes empty policyVersion", () => {
		const ctx = createGuardContext({ policyVersion: "" });
		recordViolation(ctx, { rule: "x", message: "m" });
		expect(summarizeGuardContext(ctx).policyVersion).toBe("");
	});

	it("AUD08: onFinish violations carry policyVersion", async () => {
		let pv: string | undefined;
		const payload = utf8("sk-proj-abcdefghijklmnopqrstuvwxyz1234567890");
		await pipeThroughByteGuard(payload, [payload], {
			redactSecrets: true,
			policyVersion: "on-finish-pv",
			onFinish: (s) => {
				pv = s.violations[0]?.policyVersion;
			},
		});
		expect(pv).toBe("on-finish-pv");
	});

	it("AUD09: event onFinish violations carry policyVersion", async () => {
		let pv: string | undefined;
		for await (const _ of guardEvents(
			eventsFrom([{ type: "tool_call", phase: "done", name: "bash", args: {} }]),
			{
				mode: "audit",
				policyVersion: "evt-pv",
				transforms: [allowTools(["search"])],
				onFinish: (s) => {
					if (s.violations[0]) pv = s.violations[0].policyVersion;
				},
			},
		)) {
			/* drain */
		}
		expect(pv).toBe("evt-pv");
	});
});
