#!/usr/bin/env node
/**
 * Verify golden fixture outputs match live guard runs.
 * Usage: node scripts/check-redaction-fixtures.mjs --check | --write
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = join(rootDir, "test/fixtures");
const mode = process.argv.includes("--write") ? "write" : "check";

const { guardEvents, createByteGuard, redactSecrets, allowTools } = await import(
	join(rootDir, "dist/index.js")
);

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

async function collectEvents(source, ...transforms) {
	const out = [];
	for await (const event of guardEvents(source, ...transforms)) out.push(event);
	return out;
}

async function* eventsFrom(items) {
	for (const item of items) yield item;
}

function bytesEqual(a, b) {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

async function collectBytes(stream) {
	const reader = stream.getReader();
	const parts = [];
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) parts.push(value);
	}
	const total = parts.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

const cases = [
	{
		id: "LSG-R14",
		input: join(fixturesDir, "redaction/text-sk.input.json"),
		expected: join(fixturesDir, "redaction/text-sk.expected.json"),
		async run(inputPath) {
			const input = JSON.parse(readFileSync(inputPath, "utf8"));
			return collectEvents(eventsFrom(input), redactSecrets());
		},
		compare(actual, expectedPath) {
			const expected = JSON.parse(readFileSync(expectedPath, "utf8"));
			return JSON.stringify(actual) === JSON.stringify(expected);
		},
		serialize(data) {
			return `${JSON.stringify(data, null, 2)}\n`;
		},
	},
	{
		id: "LSG-T11",
		input: join(fixturesDir, "tool-policy/allow-blocked.input.json"),
		expected: join(fixturesDir, "tool-policy/allow-blocked.expected.json"),
		async run(inputPath) {
			const input = JSON.parse(readFileSync(inputPath, "utf8"));
			return collectEvents(eventsFrom(input), { mode: "block" }, allowTools(["search"]));
		},
		compare(actual, expectedPath) {
			const expected = JSON.parse(readFileSync(expectedPath, "utf8"));
			return JSON.stringify(actual) === JSON.stringify(expected);
		},
		serialize(data) {
			return `${JSON.stringify(data, null, 2)}\n`;
		},
	},
	{
		id: "LSG-C04",
		input: join(fixturesDir, "byte-sse/sk-mid-line.sse"),
		expected: join(fixturesDir, "byte-sse/sk-mid-line.expected.sse"),
		async run(inputPath) {
			const input = readFileSync(inputPath);
			const mid = textEncoder.encode('data: {"key":"sk-ab').length;
			const chunks = [input.subarray(0, mid), input.subarray(mid)];
			const stream = new ReadableStream({
				start(controller) {
					for (const chunk of chunks) controller.enqueue(chunk);
					controller.close();
				},
			});
			return collectBytes(stream.pipeThrough(createByteGuard({ redactSecrets: true })));
		},
		compare(actual, expectedPath) {
			const expected = readFileSync(expectedPath);
			return bytesEqual(actual, expected);
		},
		serialize(data) {
			return textDecoder.decode(data);
		},
	},
];

let failed = 0;

for (const fixture of cases) {
	const actual = await fixture.run(fixture.input);
	if (mode === "write") {
		writeFileSync(fixture.expected, fixture.serialize(actual));
		console.log(`WROTE ${fixture.expected}`);
		continue;
	}
	if (!fixture.compare(actual, fixture.expected)) {
		console.error(`FAIL ${fixture.id}: output drift — run with --write to regenerate`);
		console.error(`  expected: ${fixture.expected}`);
		failed++;
	} else {
		console.log(`OK ${fixture.id}`);
	}
}

if (failed > 0) process.exit(1);
