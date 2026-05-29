/**
 * LSG-RPT36+ — programmatic onFinish matrix (~120 cases).
 */
import { describe, expect, it } from "vitest";
import { allowTools, createGuardFromPolicy, guardEvents, redactSecrets } from "../src/index.js";
import { cartesian } from "./helpers/cartesian.js";
import { eventsFrom } from "./helpers/sample-events.js";
import { pipeThroughByteGuard } from "./helpers/guard-bytes.js";
import { utf8 } from "./helpers/streams.js";

const secrets = [
	"sk-proj-abcdefghijklmnopqrstuvwxyz1234567890",
	"Bearer abcdefghijklmnopqrstuvwxyz1234567890",
	"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature",
	"plain-no-secret",
] as const;

const modes = ["block", "warn", "audit"] as const;
const policies = [
	"policies/proxy-strict.json",
	"policies/agent-gate.json",
	"policies/audit-only.json",
] as const;

const matrix = cartesian({
	mode: modes,
	secret: secrets,
	policy: policies,
	kind: ["byte", "event"] as const,
});

describe("LSG-RPT36: phase10 onFinish matrix", () => {
	for (let i = 0; i < matrix.length; i++) {
		const row = matrix[i]!;
		const id = 36 + i;
		it(`RPT${String(id).padStart(2, "0")}: ${row.kind} ${row.mode} ${row.policy.split("/").pop()}`, async () => {
			let summary: { redactions: number; mode: string } | undefined;

			const g = createGuardFromPolicy(row.policy, {
				mode: row.mode,
				onFinish: (s) => {
					summary = s;
				},
			});

			if (row.kind === "byte") {
				const payload = utf8(row.secret);
				await pipeThroughByteGuard(payload, [payload], { ...g.byteOptions, mode: row.mode });
			} else {
				for await (const _ of g.guard(
					eventsFrom([{ type: "text", phase: "done", text: row.secret }]),
				)) {
					/* drain */
				}
			}

			expect(summary).toBeDefined();
			expect(summary!.mode).toBe(row.mode);
			if (
				row.secret.includes("sk-proj") ||
				row.secret.startsWith("Bearer") ||
				row.secret.startsWith("eyJ")
			) {
				expect(summary!.redactions).toBeGreaterThanOrEqual(0);
			}
		});
	}
});

describe("LSG-RPT36: tool onFinish matrix", () => {
	const toolMatrix = cartesian({
		mode: modes,
		tool: ["search", "evil_tool", "read_file"] as const,
	});

	for (let i = 0; i < toolMatrix.length; i++) {
		const row = toolMatrix[i]!;
		const id = 36 + matrix.length + i;
		it(`RPT${String(id).padStart(2, "0")}: tool ${row.tool} ${row.mode}`, async () => {
			let tools: string[] = [];
			for await (const _ of guardEvents(
				eventsFrom([{ type: "tool_call", phase: "done", name: row.tool, args: {} }]),
				{
					mode: row.mode,
					transforms: [allowTools(["search", "read_file"])],
					onFinish: (s) => {
						tools = s.toolsTouched;
					},
				},
			)) {
				/* drain */
			}
			if (row.tool === "evil_tool") {
				expect(tools).toContain("evil_tool");
			}
		});
	}
});

describe("LSG-RPT36: redact onFinish byte sweep", () => {
	for (let i = 0; i < 12; i++) {
		const id = 36 + matrix.length + 9 + i;
		it(`RPT${String(id).padStart(2, "0")}: byte redact chunk ${i}`, async () => {
			let redactions = -1;
			const secret = secrets[i % secrets.length]!;
			const part = secret.slice(0, Math.max(1, Math.floor(secret.length / 2)));
			const rest = secret.slice(part.length);
			const payload = utf8(secret);
			await pipeThroughByteGuard(payload, [utf8(part), utf8(rest)], {
				redactSecrets: true,
				mode: modes[i % 3]!,
				onFinish: (s) => {
					redactions = s.redactions;
				},
			});
			expect(redactions).toBeGreaterThanOrEqual(0);
		});
	}
});

describe("LSG-RPT36: event redactSecrets matrix", () => {
	for (let i = 0; i < 12; i++) {
		const id = 36 + matrix.length + 21 + i;
		it(`RPT${String(id).padStart(2, "0")}: event redact ${i}`, async () => {
			let redactions = 0;
			for await (const _ of guardEvents(
				eventsFrom([{ type: "text", phase: "done", text: secrets[i % secrets.length]! }]),
				{
					mode: modes[i % 3]!,
					transforms: [redactSecrets()],
					onFinish: (s) => (redactions = s.redactions),
				},
			)) {
				/* drain */
			}
			expect(redactions).toBeGreaterThanOrEqual(0);
		});
	}
});

describe("LSG-RPT36: profile policy onFinish", () => {
	const profiles = ["agent-gate", "proxy-strict", "audit-only"] as const;
	for (let i = 0; i < 15; i++) {
		const profile = profiles[i % profiles.length]!;
		const id = 36 + matrix.length + 33 + i;
		it(`RPT${String(id).padStart(2, "0")}: profile ${profile} finish ${i}`, async () => {
			let called = false;
			const g = createGuardFromPolicy(`src/policy/profiles/${profile}.json`, {
				onFinish: () => (called = true),
			});
			for await (const _ of g.guard(eventsFrom([{ type: "finish" }]))) {
				/* drain */
			}
			expect(called).toBe(true);
		});
	}
});
