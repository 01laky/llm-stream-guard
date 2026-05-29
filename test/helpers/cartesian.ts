export type GuardMode = "block" | "warn" | "audit";

export function cartesian<T extends Record<string, readonly unknown[]>>(
	dimensions: T,
): Array<{ [K in keyof T]: T[K][number] }> {
	const keys = Object.keys(dimensions) as (keyof T)[];
	if (keys.length === 0) return [{}] as Array<{ [K in keyof T]: T[K][number] }>;

	const [first, ...rest] = keys;
	const out: Array<{ [K in keyof T]: T[K][number] }> = [];
	for (const value of dimensions[first]!) {
		const tail = cartesian(
			Object.fromEntries(rest.map((k) => [k, dimensions[k]])) as Record<string, readonly unknown[]>,
		);
		if (tail.length === 0) out.push({ [first]: value } as { [K in keyof T]: T[K][number] });
		else
			for (const t of tail) out.push({ [first]: value, ...t } as { [K in keyof T]: T[K][number] });
	}
	return out;
}

export function pruneToolOnTextOnly(rule: string, eventKind: string): boolean {
	if (eventKind.startsWith("text") || eventKind === "error" || eventKind === "finish") {
		return ["allowTools", "denyTools", "blockToolArgs", "maxToolArgsBytes"].includes(rule);
	}
	return false;
}
