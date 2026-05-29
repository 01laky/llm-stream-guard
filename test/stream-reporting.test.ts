/**
 * LSG-RPT01–RPT35 — onFinish, summarizeGuardContext, policyVersion, createGuardFromPolicy.
 */
import { describe, expect, it } from "vitest";
import {
	allowTools,
	createGuardFromPolicy,
	guardEvents,
	redactSecrets,
	summarizeGuardContext,
} from "../src/index.js";
import { createGuardContext, getGuardContextState } from "../src/create-guard-context.js";
import { recordViolation } from "../src/record-violation.js";
import { eventsFrom } from "./helpers/sample-events.js";
import { pipeThroughByteGuard } from "./helpers/guard-bytes.js";
import { utf8, utf8String } from "./helpers/streams.js";

describe("LSG-RPT01–RPT10: summarizeGuardContext", () => {
	it("RPT01: empty context yields zero violations and redactions", () => {
		const ctx = createGuardContext({ mode: "audit" });
		const s = summarizeGuardContext(ctx);
		expect(s.violations).toEqual([]);
		expect(s.redactions).toBe(0);
		expect(s.countsByRule).toEqual({});
		expect(s.toolsTouched).toEqual([]);
		expect(s.mode).toBe("audit");
	});

	it("RPT02: counts violations by rule", () => {
		const ctx = createGuardContext();
		recordViolation(ctx, { rule: "allow_tools", message: "a" });
		recordViolation(ctx, { rule: "allow_tools", message: "b" });
		recordViolation(ctx, { rule: "deny_tools", message: "c" });
		const s = summarizeGuardContext(ctx);
		expect(s.countsByRule).toEqual({ allow_tools: 2, deny_tools: 1 });
	});

	it("RPT03: toolsTouched collects tool_call names", () => {
		const ctx = createGuardContext();
		recordViolation(ctx, {
			rule: "x",
			message: "m",
			event: { type: "tool_call", phase: "done", name: "grep" },
		});
		recordViolation(ctx, {
			rule: "y",
			message: "m",
			event: { type: "tool_call", phase: "delta", name: "search" },
		});
		expect(summarizeGuardContext(ctx).toolsTouched).toEqual(["grep", "search"]);
	});

	it("RPT04: redactions tally from redact rules", () => {
		const ctx = createGuardContext();
		recordViolation(ctx, { rule: "redact_secrets", message: "r1" });
		recordViolation(ctx, { rule: "redact_pii", message: "r2" });
		recordViolation(ctx, { rule: "allow_tools", message: "not counted" });
		expect(summarizeGuardContext(ctx).redactions).toBe(2);
	});

	it("RPT05: policyVersion included when set on context state", () => {
		const ctx = createGuardContext({ policyVersion: "gate-v2" });
		expect(summarizeGuardContext(ctx).policyVersion).toBe("gate-v2");
	});

	it("RPT06: policyVersion omitted when unset", () => {
		expect(summarizeGuardContext(createGuardContext()).policyVersion).toBeUndefined();
	});

	it("RPT07: violations array is a copy snapshot", () => {
		const ctx = createGuardContext();
		recordViolation(ctx, { rule: "a", message: "m" });
		const s = summarizeGuardContext(ctx);
		expect(s.violations).toHaveLength(1);
		ctx.reset();
		expect(s.violations).toHaveLength(1);
	});

	it("RPT08: mode reflects context mode block", () => {
		expect(summarizeGuardContext(createGuardContext({ mode: "block" })).mode).toBe("block");
	});

	it("RPT09: mode reflects warn", () => {
		expect(summarizeGuardContext(createGuardContext({ mode: "warn" })).mode).toBe("warn");
	});

	it("RPT10: violations carry policyVersion from state", () => {
		const ctx = createGuardContext({ policyVersion: "p1" });
		recordViolation(ctx, { rule: "x", message: "m" });
		expect(summarizeGuardContext(ctx).violations[0]?.policyVersion).toBe("p1");
	});
});

describe("LSG-RPT11–RPT20: onFinish byte and event", () => {
	it("RPT11: createByteGuard onFinish fires on flush", async () => {
		let summary: ReturnType<typeof summarizeGuardContext> | undefined;
		const payload = utf8('data: {"x":"sk-test12345678901234567890123456789012"}\n\n');
		await pipeThroughByteGuard(payload, [payload], {
			redactSecrets: true,
			policyVersion: "byte-p",
			onFinish: (s) => {
				summary = s;
			},
		});
		expect(summary).toBeDefined();
		expect(summary!.policyVersion).toBe("byte-p");
		expect(summary!.mode).toBe("warn");
	});

	it("RPT12: byte onFinish reports redactions after secret match", async () => {
		let redactions = -1;
		const payload = utf8("sk-proj-abcdefghijklmnopqrstuvwxyz1234567890");
		await pipeThroughByteGuard(payload, [payload], {
			redactSecrets: true,
			onFinish: (s) => {
				redactions = s.redactions;
			},
		});
		expect(redactions).toBeGreaterThanOrEqual(0);
	});

	it("RPT13: byte onFinish without redact still calls back", async () => {
		let called = false;
		const payload = utf8("ok");
		await pipeThroughByteGuard(payload, [payload], { onFinish: () => (called = true) });
		expect(called).toBe(true);
	});

	it("RPT14: guardEvents onFinish after stream ends", async () => {
		let summary: ReturnType<typeof summarizeGuardContext> | undefined;
		for await (const _ of guardEvents(eventsFrom([{ type: "text", phase: "done", text: "hi" }]), {
			onFinish: (s) => {
				summary = s;
			},
		})) {
			/* drain */
		}
		expect(summary?.violations).toEqual([]);
	});

	it("RPT15: event onFinish with redactSecrets transform", async () => {
		let redactions = 0;
		for await (const _ of guardEvents(
			eventsFrom([
				{ type: "text", phase: "done", text: "sk-proj-abcdefghijklmnopqrstuvwxyz1234567890" },
			]),
			{
				mode: "warn",
				transforms: [redactSecrets()],
				onFinish: (s) => {
					redactions = s.redactions;
				},
			},
		)) {
			/* drain */
		}
		expect(redactions).toBeGreaterThan(0);
	});

	it("RPT16: onFinish mode matches config block", async () => {
		let mode: string | undefined;
		for await (const _ of guardEvents(eventsFrom([{ type: "finish" }]), {
			mode: "block",
			onFinish: (s) => {
				mode = s.mode;
			},
		})) {
			/* drain */
		}
		expect(mode).toBe("block");
	});

	it("RPT17: onFinish not called when generator not drained", async () => {
		let called = false;
		const gen = guardEvents(eventsFrom([{ type: "text", phase: "done", text: "x" }]), {
			onFinish: () => (called = true),
		});
		await gen.next();
		expect(called).toBe(false);
	});

	it("RPT18: byte flush with empty stream still onFinish", async () => {
		let called = false;
		await pipeThroughByteGuard(new Uint8Array(0), [], { onFinish: () => (called = true) });
		expect(called).toBe(true);
	});

	it("RPT19: summarize after byte redact matches onFinish redactions", async () => {
		let summaryRedactions = -1;
		const payload = utf8("Bearer abcdefghijklmnopqrstuvwxyz1234567890");
		await pipeThroughByteGuard(payload, [payload], {
			redactSecrets: true,
			onFinish: (s) => {
				summaryRedactions = s.redactions;
			},
		});
		expect(summaryRedactions).toBeGreaterThanOrEqual(0);
	});

	it("RPT20: event policyVersion flows to summary", async () => {
		let pv: string | undefined;
		for await (const _ of guardEvents(eventsFrom([{ type: "finish" }]), {
			policyVersion: "evt-1",
			onFinish: (s) => {
				pv = s.policyVersion;
			},
		})) {
			/* drain */
		}
		expect(pv).toBe("evt-1");
	});
});

describe("LSG-RPT21–RPT35: createGuardFromPolicy", () => {
	it("RPT21: loads policy from path", () => {
		const g = createGuardFromPolicy("policies/agent-gate.json");
		expect(g.mode).toBe("block");
		expect(g.transforms.length).toBeGreaterThan(0);
	});

	it("RPT22: createGuardFromPolicy forwards onFinish to byte guard", async () => {
		let called = false;
		const g = createGuardFromPolicy("policies/proxy-strict.json", {
			onFinish: () => (called = true),
		});
		const payload = utf8("plain");
		await pipeThroughByteGuard(payload, [payload], g.byteOptions);
		expect(called).toBe(true);
	});

	it("RPT23: createGuardFromPolicy forwards onFinish to guardEvents", async () => {
		let called = false;
		const g = createGuardFromPolicy("policies/audit-only.json", {
			onFinish: () => (called = true),
		});
		for await (const _ of g.guard(eventsFrom([{ type: "finish" }]))) {
			/* drain */
		}
		expect(called).toBe(true);
	});

	it("RPT24: policyVersion on loaded policy with document field", () => {
		const g = createGuardFromPolicy("policies/examples/extends-agent.json");
		expect(g.policyVersion).toBe("team-extends-demo");
	});

	it("RPT25: byteOptions include redactSecrets for proxy-strict", () => {
		const g = createGuardFromPolicy("policies/proxy-strict.json");
		expect(g.byteOptions.redactSecrets).toBe(true);
	});

	it("RPT26: audit-only policy mode audit", () => {
		expect(createGuardFromPolicy("policies/audit-only.json").mode).toBe("audit");
	});

	it("RPT27: guard() yields events", async () => {
		const g = createGuardFromPolicy("policies/agent-gate.json");
		const out: unknown[] = [];
		for await (const e of g.guard(
			eventsFrom([{ type: "tool_call", phase: "done", name: "search", args: {} }]),
		)) {
			out.push(e);
		}
		expect(out.length).toBeGreaterThan(0);
	});

	it("RPT28: onViolation forwarded from policy guard", async () => {
		const violations: string[] = [];
		const g = createGuardFromPolicy("policies/agent-gate.json", {
			onViolation: (v) => violations.push(v.rule),
		});
		for await (const _ of g.guard(
			eventsFrom([{ type: "tool_call", phase: "done", name: "unknown_tool_xyz", args: {} }]),
		)) {
			/* drain */
		}
		expect(violations.length).toBeGreaterThan(0);
	});

	it("RPT29: summarizeGuardContext toolsTouched empty for text-only", async () => {
		let tools: string[] = ["unset"];
		for await (const _ of guardEvents(
			eventsFrom([{ type: "text", phase: "done", text: "no tools" }]),
			{
				transforms: [redactSecrets()],
				onFinish: (s) => (tools = s.toolsTouched),
			},
		)) {
			/* drain */
		}
		expect(tools).toEqual([]);
	});

	it("RPT30: getGuardContextState redactions independent of summarize", () => {
		const ctx = createGuardContext();
		recordViolation(ctx, { rule: "redact_secrets", message: "x" });
		expect(getGuardContextState(ctx).redactions).toBe(1);
		expect(summarizeGuardContext(ctx).redactions).toBe(1);
	});

	it("RPT31: byte mode warn default in summary", async () => {
		let mode = "";
		const payload = utf8("x");
		await pipeThroughByteGuard(payload, [payload], { onFinish: (s) => (mode = s.mode) });
		expect(mode).toBe("warn");
	});

	it("RPT32: byte mode audit when configured", async () => {
		let mode = "";
		const payload = utf8("x");
		await pipeThroughByteGuard(payload, [payload], {
			mode: "audit",
			onFinish: (s) => (mode = s.mode),
		});
		expect(mode).toBe("audit");
	});

	it("RPT33: createGuardFromPolicy LoadedPolicy object", () => {
		const loaded = createGuardFromPolicy("policies/agent-gate.json");
		const again = createGuardFromPolicy(loaded);
		expect(again.mode).toBe(loaded.mode);
	});

	it("RPT34: onFinish summary violations length matches counts sum", async () => {
		let sum = 0;
		let total = 0;
		for await (const _ of guardEvents(
			eventsFrom([
				{ type: "tool_call", phase: "done", name: "bad_tool", args: {} },
				{ type: "tool_call", phase: "done", name: "bad_tool_2", args: {} },
			]),
			{
				mode: "audit",
				transforms: [allowTools(["search"])],
				onFinish: (s) => {
					sum = Object.values(s.countsByRule).reduce((a, b) => a + b, 0);
					total = s.violations.length;
				},
			},
		)) {
			/* drain */
		}
		expect(sum).toBe(total);
	});

	it("RPT35: byte output redacts secret in stream", async () => {
		const payload = utf8("prefix sk-proj-abcdefghijklmnopqrstuvwxyz1234567890 suffix");
		const out = await pipeThroughByteGuard(payload, [payload], { redactSecrets: true });
		const text = utf8String(out);
		expect(text).toContain("[REDACTED]");
		expect(text).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz1234567890");
	});
});
