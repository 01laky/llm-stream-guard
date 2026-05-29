import { createHash } from "node:crypto";

export function normalizeCliJson(value: unknown): unknown {
	if (value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map(normalizeCliJson);
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	const out: Record<string, unknown> = {};
	for (const k of keys) {
		if (k === "generatedAt" || k === "timestamp") continue;
		out[k] = normalizeCliJson(obj[k]);
	}
	return out;
}

export function hashCliJson(value: unknown): string {
	const normalized = normalizeCliJson(value);
	return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
