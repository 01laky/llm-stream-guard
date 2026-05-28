import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { Readable } from "node:stream";
import { createByteGuard } from "../create-byte-guard.js";
import { guardEvents } from "../guard-events.js";
import type { LoadedPolicy } from "../policy/types.js";
import type { GuardEvent, Violation } from "../types.js";
import { normalizeSseToBytes } from "./sse-normalize.js";
import { buildScanReport, violationToScan, type ScanReport, type ScanViolation } from "./types.js";

async function* eventsFromArray(events: GuardEvent[]): AsyncGenerator<GuardEvent> {
	for (const event of events) yield event;
}

function parseEventJson(text: string): GuardEvent[] {
	const parsed = JSON.parse(text) as unknown;
	if (Array.isArray(parsed)) return parsed as GuardEvent[];
	if (
		typeof parsed === "object" &&
		parsed !== null &&
		Array.isArray((parsed as { events?: GuardEvent[] }).events)
	) {
		return (parsed as { events: GuardEvent[] }).events;
	}
	throw new Error("JSON must be GuardEvent[] or { events: [] }");
}

function parseEventJsonl(text: string): GuardEvent[] {
	const events: GuardEvent[] = [];
	for (const line of text.split("\n")) {
		const t = line.trim();
		if (!t) continue;
		events.push(JSON.parse(t) as GuardEvent);
	}
	return events;
}

function isBinary(buf: Buffer): boolean {
	for (let i = 0; i < Math.min(buf.length, 512); i++) {
		if (buf[i] === 0) return true;
	}
	return false;
}

async function collectBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
	const reader = stream.getReader();
	const parts: Uint8Array[] = [];
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) parts.push(value);
	}
	const total = parts.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const p of parts) {
		out.set(p, offset);
		offset += p.length;
	}
	return out;
}

function prepareBytePayload(text: string, format: string): Uint8Array {
	if (format === "sse") return normalizeSseToBytes(text);
	return new TextEncoder().encode(text);
}

async function runEventScan(
	label: string,
	events: GuardEvent[],
	policy: LoadedPolicy,
	collect: ScanViolation[],
	onRedact: () => void,
): Promise<void> {
	const onViolation = (v: Violation) => {
		if (v.rule.startsWith("redact")) onRedact();
		collect.push(violationToScan(label, v, policy.policyVersion));
	};
	for await (const _ of guardEvents(eventsFromArray(events), {
		mode: policy.mode,
		transforms: policy.transforms,
		onViolation,
	})) {
		/* drain */
	}
}

async function runByteScan(
	label: string,
	bytes: Uint8Array,
	policy: LoadedPolicy,
	collect: ScanViolation[],
	onRedact: () => void,
): Promise<void> {
	const onViolation = (v: Violation) => {
		if (v.rule.startsWith("redact")) onRedact();
		collect.push(violationToScan(label, v, policy.policyVersion));
	};
	const guard = createByteGuard({ ...policy.byteOptions, mode: policy.mode, onViolation });
	const readable = Readable.from([Buffer.from(bytes)]);
	const web = Readable.toWeb(readable) as ReadableStream<Uint8Array>;
	await collectBytes(web.pipeThrough(guard));
}

function detectFormat(ext: string, content: string, stdinFormat?: string): string {
	if (stdinFormat) return stdinFormat;
	if (ext === ".jsonl") return "jsonl";
	if (ext === ".json") {
		const t = content.trimStart();
		if (t.startsWith("[") || t.startsWith("{")) return "json";
	}
	if (ext === ".sse") return "sse";
	return "text";
}

export async function scanContent(
	label: string,
	content: string,
	policy: LoadedPolicy,
	options?: { stdinFormat?: string; ext?: string },
): Promise<{ violations: ScanViolation[]; redactions: number; skipped: boolean }> {
	const ext = options?.ext ?? extname(label).toLowerCase();
	const buf = Buffer.from(content, "utf8");
	if (isBinary(buf)) {
		return { violations: [], redactions: 0, skipped: true };
	}

	const violations: ScanViolation[] = [];
	let redactions = 0;
	const onRedact = () => {
		redactions++;
	};

	const format = detectFormat(ext, content, options?.stdinFormat);

	if (format === "json") {
		await runEventScan(label, parseEventJson(content), policy, violations, onRedact);
		return { violations, redactions, skipped: false };
	}
	if (format === "jsonl") {
		await runEventScan(label, parseEventJsonl(content), policy, violations, onRedact);
		return { violations, redactions, skipped: false };
	}

	const bytes = prepareBytePayload(content, format === "sse" ? "sse" : "text");
	await runByteScan(label, bytes, policy, violations, onRedact);
	return { violations, redactions, skipped: false };
}

export async function scanFile(
	file: string,
	policy: LoadedPolicy,
	options?: { stdinFormat?: string },
): Promise<{ violations: ScanViolation[]; redactions: number; skipped: boolean }> {
	const content = readFileSync(file, "utf8");
	return scanContent(file, content, policy, { ...options, ext: extname(file).toLowerCase() });
}

export async function scanPaths(
	files: string[],
	policy: LoadedPolicy,
	options?: { stdinFormat?: string },
): Promise<ScanReport> {
	const allViolations: ScanViolation[] = [];
	let redactions = 0;
	let scanned = 0;

	for (const file of files) {
		const result = await scanFile(file, policy, options);
		if (!result.skipped) scanned++;
		allViolations.push(...result.violations);
		redactions += result.redactions;
	}

	return buildScanReport(policy, allViolations, scanned, redactions);
}

export async function scanStdin(policy: LoadedPolicy, stdinFormat: string): Promise<ScanReport> {
	const content = readFileSync(0, "utf8");
	const result = await scanContent("-", content, policy, { stdinFormat });
	return buildScanReport(policy, result.violations, 1, result.redactions);
}
