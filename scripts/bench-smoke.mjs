#!/usr/bin/env node
/**
 * Local maintainer timing smoke — not a CI gate.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const { createByteGuard, guardEvents, redactSecrets } = await import(
	join(rootDir, "dist/index.js")
);

const textEncoder = new TextEncoder();

async function collectBytes(stream) {
	const reader = stream.getReader();
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) total += value.length;
	}
	return total;
}

async function* eventsFrom(items) {
	for (const item of items) yield item;
}

const token = "sk-bench-1234567890";
const body = token.repeat(Math.ceil((1024 * 1024) / token.length)).slice(0, 1024 * 1024);
const payload = textEncoder.encode(body);
const chunkSize = 1024;
const chunks = [];
for (let i = 0; i < payload.length; i += chunkSize) {
	chunks.push(payload.subarray(i, i + chunkSize));
}

const byteStart = performance.now();
const stream = new ReadableStream({
	start(controller) {
		for (const chunk of chunks) controller.enqueue(chunk);
		controller.close();
	},
});
const byteOut = await collectBytes(
	stream.pipeThrough(createByteGuard({ redactSecrets: true, mode: "warn" })),
);
const byteMs = performance.now() - byteStart;
const byteMbps = byteOut / (1024 * 1024) / (byteMs / 1000);

const events = Array.from({ length: 5000 }, (_, i) => ({
	type: "text",
	phase: i % 2 === 0 ? "delta" : "done",
	text: `line ${i} sk-bench-1234567890`,
}));

const eventStart = performance.now();
let eventCount = 0;
for await (const _ of guardEvents(eventsFrom(events), redactSecrets())) eventCount++;
const eventMs = performance.now() - eventStart;
const eventsPerSec = eventCount / (eventMs / 1000);

console.log(
	`byte: ${byteMs.toFixed(1)} ms, ${byteMbps.toFixed(1)} MB/s processed, ${byteOut} bytes out`,
);
console.log(
	`events: ${eventMs.toFixed(1)} ms, ${eventsPerSec.toFixed(0)} events/s, ${eventCount} events`,
);
