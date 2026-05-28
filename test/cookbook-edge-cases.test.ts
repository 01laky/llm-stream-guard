/**
 * LSG-CBK35–CBK43 — extended edge cases for cookbook examples and integration recipes.
 * Complements LSG-CBK01–34 (docs/layout/smoke) with exhaustive behavioral coverage.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapAiSdkPart, mapAiSdkStream } from "../examples/ai-sdk-mapper/map-stream-part.js";
import {
	mapAssembleStream,
	streamEventToGuardEvent,
} from "../examples/assemble-mapper/stream-event-to-guard.js";
import { runDualStreamAudit } from "../examples/dual-stream/audit-side-channel.js";
import { USER_FACING_ERRORS, runAgentLoop } from "../examples/event-gate/agent-loop.js";
import {
	createPolicyDrivenGuard,
	drainPolicyGuardedEvents,
} from "../examples/event-gate/policy-driven.js";
import type { StubStreamEvent } from "../examples/types/stub-events.js";
import type { StubTextStreamPart } from "../examples/types/stub-events.js";
import { guardEvents, redactSecrets, allowTools } from "../src/index.js";
import type { GuardEvent } from "../src/types.js";
import { collectBytes, splitAtByteIndex, utf8 } from "./helpers/streams.js";
import { eventsFrom, sampleEvents } from "./helpers/sample-events.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("LSG-CBK35: assemble mapper exhaustive", () => {
	const cases: Array<{ input: StubStreamEvent; expected: GuardEvent | null }> = [
		{
			input: { type: "text.delta", text: "a" },
			expected: { type: "text", phase: "delta", text: "a" },
		},
		{
			input: { type: "text.done", text: "done" },
			expected: { type: "text", phase: "done", text: "done" },
		},
		{
			input: { type: "reasoning.delta", text: "think" },
			expected: { type: "reasoning", phase: "delta", text: "think" },
		},
		{
			input: { type: "reasoning.done", text: "done" },
			expected: { type: "reasoning", phase: "done", text: "done" },
		},
		{
			input: { type: "tool_call.delta", id: "1", name: "search", argsText: "{" },
			expected: {
				type: "tool_call",
				phase: "delta",
				id: "1",
				name: "search",
				argsText: "{",
			},
		},
		{
			input: { type: "tool_call.done", id: "1", name: "search", args: { q: "x" } },
			expected: {
				type: "tool_call",
				phase: "done",
				id: "1",
				name: "search",
				args: { q: "x" },
			},
		},
		{
			input: { type: "error", message: "fail" },
			expected: { type: "error", message: "fail" },
		},
		{
			input: { type: "error", message: "fail", code: "429" },
			expected: { type: "error", message: "fail", code: "429" },
		},
		{
			input: { type: "finish", reason: "stop" },
			expected: { type: "finish", reason: "stop" },
		},
		{
			input: { type: "finish" },
			expected: { type: "finish" },
		},
	];

	for (const { input, expected } of cases) {
		it(`maps ${input.type} → GuardEvent`, () => {
			expect(streamEventToGuardEvent(input)).toEqual(expected);
		});
	}

	it("mapAssembleStream preserves order and skips unmapped entries", async () => {
		const stream: StubStreamEvent[] = [
			{ type: "text.delta", text: "hi" },
			{ type: "tool_call.done", id: "1", name: "search", args: {} },
			{ type: "finish", reason: "stop" },
		];
		const out: GuardEvent[] = [];
		for await (const e of mapAssembleStream(eventsFrom(stream))) out.push(e);
		expect(out.map((e) => e.type)).toEqual(["text", "tool_call", "finish"]);
	});

	it("mapAssembleStream handles empty source", async () => {
		const out: GuardEvent[] = [];
		for await (const e of mapAssembleStream(eventsFrom([]))) out.push(e);
		expect(out).toEqual([]);
	});
});

describe("LSG-CBK36: AI SDK mapper exhaustive", () => {
	const cases: Array<{ input: StubTextStreamPart; expected: GuardEvent | null }> = [
		{
			input: { type: "text-delta", textDelta: "x" },
			expected: { type: "text", phase: "delta", text: "x" },
		},
		{
			input: { type: "text", text: "full" },
			expected: { type: "text", phase: "done", text: "full" },
		},
		{
			input: { type: "tool-call-streaming-start", toolCallId: "1", toolName: "search" },
			expected: {
				type: "tool_call",
				phase: "delta",
				id: "1",
				name: "search",
				argsText: "",
			},
		},
		{
			input: { type: "tool-call-delta", toolCallId: "1", argsTextDelta: '{"q":' },
			expected: {
				type: "tool_call",
				phase: "delta",
				id: "1",
				name: "",
				argsText: '{"q":',
			},
		},
		{
			input: {
				type: "tool-call",
				toolCallId: "1",
				toolName: "search",
				args: { q: "y" },
			},
			expected: {
				type: "tool_call",
				phase: "done",
				id: "1",
				name: "search",
				args: { q: "y" },
			},
		},
		{
			input: { type: "finish", finishReason: "stop" },
			expected: { type: "finish", reason: "stop" },
		},
		{
			input: { type: "finish" },
			expected: { type: "finish" },
		},
	];

	for (const { input, expected } of cases) {
		it(`maps ${input.type} → GuardEvent`, () => {
			expect(mapAiSdkPart(input)).toEqual(expected);
		});
	}

	it("mapAiSdkStream preserves order across mixed parts", async () => {
		const parts: StubTextStreamPart[] = [
			{ type: "text-delta", textDelta: "a" },
			{ type: "tool-call", toolCallId: "1", toolName: "search", args: {} },
			{ type: "finish", finishReason: "tool-calls" },
		];
		const out: GuardEvent[] = [];
		for await (const e of mapAiSdkStream(eventsFrom(parts))) out.push(e);
		expect(out.map((e) => `${e.type}/${"phase" in e ? e.phase : ""}`)).toEqual([
			"text/delta",
			"tool_call/done",
			"finish/",
		]);
	});
});

describe("LSG-CBK37: agent loop edge cases", () => {
	it("executes allowed tool on clean args", async () => {
		const executed: string[] = [];
		const result = await runAgentLoop(
			eventsFrom([{ type: "tool_call", phase: "done", name: "search", id: "1", args: { q: "x" } }]),
			{
				mode: "block",
				allowedTools: ["search"],
				executeTool: async (name) => {
					executed.push(name);
				},
			},
		);
		expect(executed).toEqual(["search"]);
		expect(result.executed).toEqual(["search"]);
	});

	it("warn mode blocks disallowed tool like block", async () => {
		let executed = false;
		const result = await runAgentLoop(
			eventsFrom([
				{ type: "tool_call", phase: "done", name: "bash", id: "1", args: { cmd: "ls" } },
			]),
			{
				mode: "warn",
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

	it("audit mode logs violation but still executes disallowed tool (example semantics)", async () => {
		let executed = false;
		const result = await runAgentLoop(
			eventsFrom([
				{ type: "tool_call", phase: "done", name: "bash", id: "1", args: { cmd: "ls" } },
			]),
			{
				mode: "audit",
				allowedTools: ["search"],
				executeTool: async () => {
					executed = true;
				},
			},
		);
		expect(result.violations.length).toBeGreaterThan(0);
		expect(executed).toBe(true);
		expect(result.executed).toContain("bash");
	});

	it("blockToolArgs prevents execute on dangerous args", async () => {
		let executed = false;
		const result = await runAgentLoop(
			eventsFrom([
				{
					type: "tool_call",
					phase: "done",
					name: "search",
					id: "1",
					args: { cmd: "rm -rf /" },
				},
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
		expect(result.violations.some((v) => v.rule === "block_tool_args")).toBe(true);
	});

	it("redacts secrets in text before downstream handling", async () => {
		const result = await runAgentLoop(
			eventsFrom([
				{ type: "text", phase: "delta", text: "key sk-test12345678901234567890123456789012" },
			]),
			{
				mode: "block",
				allowedTools: ["search"],
				executeTool: async () => {},
			},
		);
		const text = result.events.find((e) => e.type === "text");
		expect(text && "text" in text ? text.text : "").not.toContain("sk-test");
		expect(text && "text" in text ? text.text : "").toContain("[REDACTED]");
	});

	it("does not execute after policy_violation finish", async () => {
		const executed: string[] = [];
		await runAgentLoop(
			eventsFrom([
				{
					type: "tool_call",
					phase: "done",
					name: "search",
					id: "1",
					args: { cmd: "rm -rf /" },
				},
				{ type: "tool_call", phase: "done", name: "search", id: "2", args: { q: "ok" } },
			]),
			{
				mode: "block",
				allowedTools: ["search"],
				executeTool: async (name) => {
					executed.push(name);
				},
			},
		);
		expect(executed).toEqual([]);
	});

	it("empty stream yields empty result", async () => {
		const result = await runAgentLoop(eventsFrom([]), {
			mode: "block",
			allowedTools: ["search"],
			executeTool: async () => {},
		});
		expect(result.events).toEqual([]);
		expect(result.violations).toEqual([]);
		expect(result.executed).toEqual([]);
	});

	it("USER_FACING_ERRORS covers primary violation reasons", () => {
		expect(USER_FACING_ERRORS.policy_violation).toBeTruthy();
		expect(USER_FACING_ERRORS.allow_tools).toBeTruthy();
		expect(USER_FACING_ERRORS.block_tool_args).toBeTruthy();
	});
});

describe("LSG-CBK38: dual-stream audit edge cases", () => {
	it("allowed tool produces no audit violations", async () => {
		const result = await runDualStreamAudit(
			eventsFrom([{ type: "tool_call", phase: "done", name: "search", id: "1", args: { q: "x" } }]),
			["search"],
		);
		expect(result.auditLog).toEqual([]);
		expect(result.clientEvents.some((e) => e.type === "tool_call")).toBe(true);
	});

	it("accumulates multiple violations without dropping client events", async () => {
		const result = await runDualStreamAudit(
			eventsFrom([
				{ type: "tool_call", phase: "done", name: "bash", id: "1", args: {} },
				{ type: "tool_call", phase: "done", name: "shell", id: "2", args: {} },
			]),
			["search"],
		);
		expect(result.auditLog.length).toBeGreaterThanOrEqual(2);
		expect(result.clientEvents.filter((e) => e.type === "tool_call")).toHaveLength(2);
	});

	it("preserves non-tool events in client stream", async () => {
		const result = await runDualStreamAudit(
			eventsFrom([
				{ type: "text", phase: "delta", text: "hello" },
				{ type: "finish", reason: "stop" },
			]),
			["search"],
		);
		expect(result.clientEvents.map((e) => e.type)).toEqual(["text", "finish"]);
		expect(result.auditLog).toEqual([]);
	});

	it("empty stream returns empty arrays", async () => {
		const result = await runDualStreamAudit(eventsFrom([]), ["search"]);
		expect(result.clientEvents).toEqual([]);
		expect(result.auditLog).toEqual([]);
	});
});

describe("LSG-CBK39: policy-driven guard edge cases", () => {
	const agentGate = join(rootDir, "policies/agent-gate.json");
	const proxyStrict = join(rootDir, "policies/proxy-strict.json");

	it("blocks disallowed tool via agent-gate policy", async () => {
		const out = await drainPolicyGuardedEvents(
			eventsFrom([
				{ type: "tool_call", phase: "done", name: "bash", id: "1", args: { cmd: "ls" } },
			]),
			agentGate,
		);
		expect(out.some((e) => e.type === "finish" && e.reason === "policy_violation")).toBe(true);
	});

	it("allows search tool from agent-gate allowlist", async () => {
		const out = await drainPolicyGuardedEvents(
			eventsFrom([{ type: "tool_call", phase: "done", name: "search", id: "1", args: { q: "x" } }]),
			agentGate,
		);
		expect(out.some((e) => e.type === "tool_call" && e.name === "search")).toBe(true);
		expect(out.some((e) => e.type === "finish" && e.reason === "policy_violation")).toBe(false);
	});

	it("createPolicyDrivenGuard exposes guard and byte factories", async () => {
		const guard = createPolicyDrivenGuard(proxyStrict);
		expect(guard.transforms.length).toBeGreaterThan(0);
		expect(guard.byteOptions.redactSecrets).toBe(true);

		const payload = utf8("token sk-test12345678901234567890123456789012");
		const [a, b] = splitAtByteIndex(payload, 8);
		const stream = new ReadableStream<Uint8Array>({
			start(c) {
				c.enqueue(a);
				c.enqueue(b);
				c.close();
			},
		});
		const out = await collectBytes(stream.pipeThrough(guard.createByteGuard()));
		expect(new TextDecoder().decode(out)).not.toContain("sk-test");
	});

	it("guard.guard() drains heterogeneous sample stream without throw", async () => {
		const guard = createPolicyDrivenGuard(agentGate);
		const out: GuardEvent[] = [];
		for await (const e of guard.guard(eventsFrom(sampleEvents.slice(0, 4)))) out.push(e);
		expect(out.length).toBeGreaterThan(0);
	});
});

describe("LSG-CBK40: mapper + guard integration pipelines", () => {
	it("assemble stream → guardEvents redacts secrets", async () => {
		const assembleStream: StubStreamEvent[] = [
			{ type: "text.delta", text: "sk-test12345678901234567890123456789012" },
		];
		const mapped: GuardEvent[] = [];
		for await (const e of mapAssembleStream(eventsFrom(assembleStream))) mapped.push(e);

		const out: GuardEvent[] = [];
		for await (const e of guardEvents(eventsFrom(mapped), { mode: "block" }, redactSecrets())) {
			out.push(e);
		}
		const text = out.find((e) => e.type === "text");
		expect(text && "text" in text ? text.text : "").toContain("[REDACTED]");
	});

	it("AI SDK stream → guardEvents enforces allowTools", async () => {
		const parts: StubTextStreamPart[] = [
			{ type: "tool-call", toolCallId: "1", toolName: "bash", args: {} },
		];
		const mapped: GuardEvent[] = [];
		for await (const e of mapAiSdkStream(eventsFrom(parts))) mapped.push(e);

		const out: GuardEvent[] = [];
		for await (const e of guardEvents(
			eventsFrom(mapped),
			{ mode: "block" },
			allowTools(["search"]),
		)) {
			out.push(e);
		}
		expect(out.some((e) => e.type === "finish" && e.reason === "policy_violation")).toBe(true);
	});
});

describe("LSG-CBK41: byte proxy example exports", () => {
	it("createHonoByteProxyApp is exported from hono example", () => {
		const text = readFileSync(join(rootDir, "examples/byte-proxy/hono.ts"), "utf8");
		expect(text).toContain("export function createHonoByteProxyApp");
		expect(text).toContain("createByteGuard");
	});

	it("registerExpressByteProxy is exported from express example", () => {
		const text = readFileSync(join(rootDir, "examples/byte-proxy/express.ts"), "utf8");
		expect(text).toContain("export function registerExpressByteProxy");
		expect(text).toMatch(/Readable\.fromWeb/);
	});

	it("workers default export exposes fetch handler", async () => {
		const mod = await import("../examples/byte-proxy/workers.js");
		expect(typeof mod.default.fetch).toBe("function");
	});
});

describe("LSG-CBK42: blockToolArgs via argsText on done", () => {
	it("agent loop blocks when argsText matches pattern without args object", async () => {
		let executed = false;
		const result = await runAgentLoop(
			eventsFrom([
				{
					type: "tool_call",
					phase: "done",
					name: "search",
					id: "1",
					argsText: '{"cmd":"rm -rf /"}',
				},
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
		expect(result.violations.some((v) => v.rule === "block_tool_args")).toBe(true);
	});
});

describe("LSG-CBK43: migration + doc cross-links sanity", () => {
	it("migration doc mentions all four upgrade steps", () => {
		const doc = readFileSync(join(rootDir, "docs/migration-from-regex.md"), "utf8");
		for (const step of ["Step 1", "Step 2", "Step 3", "Step 4"]) {
			expect(doc).toContain(step);
		}
	});

	it("MCP recipe documents tool_call.done mapping", () => {
		const doc = readFileSync(join(rootDir, "docs/mcp-tool-gate-recipe.md"), "utf8");
		expect(doc).toMatch(/tool_call.*done|phase.*done/i);
	});

	it("troubleshooting section lists blockToolArgs delta guidance", () => {
		const doc = readFileSync(join(rootDir, "docs/integration-cookbook.md"), "utf8");
		const section = doc.split("## 13. Troubleshooting")[1] ?? "";
		expect(section.toLowerCase()).toMatch(/blocktoolargs|delta/);
	});
});
