/**
 * LSG-T08 extended — transform ordering contract tests.
 */
import { describe, expect, it } from "vitest";
import { allowTools, blockToolArgs, guardEvents, redactSecrets } from "../src/index.js";
import type { Violation } from "../src/types.js";
import { eventsFrom } from "./helpers/sample-events.js";

async function collectViolations(
	events: Parameters<typeof guardEvents>[0],
	...transforms: Parameters<typeof guardEvents> extends [unknown, ...infer R] ? R : never
): Promise<Violation[]> {
	const violations: Violation[] = [];
	for await (const _ of guardEvents(
		events,
		{ mode: "block", onViolation: (v) => violations.push(v) },
		...(transforms as never[]),
	)) {
		/* drain */
	}
	return violations;
}

describe("LSG-T08 extended: transform ordering", () => {
	it("reversed order: allowTools before redactSecrets still blocks disallowed tool", async () => {
		const secret = "sk-test-1234567890";
		const violations = await collectViolations(
			eventsFrom([
				{
					type: "tool_call",
					phase: "done",
					name: "bash",
					id: "1",
					args: { token: secret },
				},
			]),
			allowTools(["search"]),
			redactSecrets(),
		);
		expect(violations.some((v) => v.rule === "allow_tools")).toBe(true);
	});

	it("recommended order: redactSecrets runs before allowTools on same stream", async () => {
		const secret = "sk-test-1234567890";
		const violations = await collectViolations(
			eventsFrom([
				{
					type: "tool_call",
					phase: "done",
					name: "search",
					id: "1",
					args: { token: secret, cmd: "rm -rf /" },
				},
			]),
			redactSecrets(),
			allowTools(["search"]),
			blockToolArgs(/rm\s+-rf/),
		);
		const rules = violations.map((v) => v.rule);
		expect(rules.indexOf("redact_secrets")).toBeLessThan(rules.indexOf("block_tool_args"));
	});
});
