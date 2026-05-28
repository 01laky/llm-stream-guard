/**
 * LSG-C13 — cross-mode parity between event and byte redaction.
 */
import { describe, expect, it } from "vitest";
import { createByteGuard, guardEvents, redactSecrets } from "../src/index.js";
import { eventsFrom } from "./helpers/sample-events.js";
import { collectBytes, readableFromChunks, utf8, utf8String } from "./helpers/streams.js";

const REDACTED = "[REDACTED]";

describe("LSG-C13: cross-mode parity", () => {
	it("event and byte paths redact the same secret identically", async () => {
		const secret = "sk-parity-test-12345";
		const text = `Hello ${secret} world`;

		const eventOut = [];
		for await (const e of guardEvents(
			eventsFrom([{ type: "text", phase: "done", text }]),
			redactSecrets(),
		)) {
			eventOut.push(e);
		}

		const byteOut = await collectBytes(
			readableFromChunks([utf8(text)]).pipeThrough(createByteGuard({ redactSecrets: true })),
		);

		expect(eventOut[0]?.type).toBe("text");
		if (eventOut[0]?.type !== "text") return;

		expect(eventOut[0].text).not.toContain(secret);
		expect(eventOut[0].text).toContain(REDACTED);

		const byteText = utf8String(byteOut);
		expect(byteText).not.toContain(secret);
		expect(byteText).toContain(REDACTED);
		expect(byteText).toBe(eventOut[0].text);
	});
});
