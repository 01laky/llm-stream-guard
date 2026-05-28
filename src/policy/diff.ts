import type { PolicyDiff, PolicyDiffEntry, PolicyDocument } from "./types.js";

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function ruleKey(entry: Record<string, unknown>): string {
	return Object.keys(entry)[0] ?? "";
}

function rulesMap(doc: PolicyDocument): Map<string, Record<string, unknown>> {
	const map = new Map<string, Record<string, unknown>>();
	for (const entry of doc.rules ?? []) {
		map.set(ruleKey(entry as Record<string, unknown>), entry);
	}
	return map;
}

function deepEqual(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

export function diffPolicies(a: PolicyDocument, b: PolicyDocument): PolicyDiff {
	const entries: PolicyDiffEntry[] = [];

	if (a.mode !== b.mode) {
		entries.push({ kind: "changed", path: "mode", before: a.mode, after: b.mode });
	}
	if (a.policyVersion !== b.policyVersion) {
		entries.push({
			kind: "changed",
			path: "policyVersion",
			before: a.policyVersion,
			after: b.policyVersion,
		});
	}
	if (a.extends !== b.extends) {
		entries.push({
			kind: "changed",
			path: "extends",
			before: a.extends,
			after: b.extends,
		});
	}
	if (!deepEqual(a.byte ?? {}, b.byte ?? {})) {
		entries.push({ kind: "changed", path: "byte", before: a.byte, after: b.byte });
	}

	const mapA = rulesMap(a);
	const mapB = rulesMap(b);
	for (const key of mapA.keys()) {
		if (!mapB.has(key)) {
			entries.push({ kind: "removed", path: `rules.${key}`, before: mapA.get(key) });
		} else if (!deepEqual(mapA.get(key), mapB.get(key))) {
			entries.push({
				kind: "changed",
				path: `rules.${key}`,
				before: mapA.get(key),
				after: mapB.get(key),
			});
		}
	}
	for (const key of mapB.keys()) {
		if (!mapA.has(key)) {
			entries.push({ kind: "added", path: `rules.${key}`, after: mapB.get(key) });
		}
	}

	return { changed: entries.length > 0, entries };
}
