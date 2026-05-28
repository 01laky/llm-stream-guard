/**
 * LSG-R13 — idempotent redaction (no double placeholders).
 */
import { describe, expect, it } from "vitest";
import { guardEvents, redactSecrets } from "../src/index.js";
import type { GuardEvent } from "../src/types.js";
import { eventsFrom } from "./helpers/sample-events.js";

async function collect(source: AsyncIterable<GuardEvent>): Promise<GuardEvent[]> {
	const out: GuardEvent[] = [];
	for await (const e of source) out.push(e);
	return out;
}

describe("LSG-R13: idempotency", () => {
	it("second pass does not double-redact placeholders", async () => {
		const source = eventsFrom([{ type: "text", phase: "delta", text: "sk-leak-1234567890" }]);
		const once: GuardEvent[] = [];
		for await (const e of guardEvents(source, redactSecrets())) once.push(e);

		const twice: GuardEvent[] = [];
		for await (const e of guardEvents(eventsFrom(once), redactSecrets())) twice.push(e);

		expect(twice[0]?.type).toBe("text");
		if (twice[0]?.type === "text") {
			expect(twice[0].text).not.toContain("sk-leak");
			expect(twice[0].text).not.toMatch(/\[REDACTED\]\[REDACTED\]/);
		}
	});
});
