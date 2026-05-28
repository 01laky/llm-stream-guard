/** Strip SSE `data:` framing before byte scan. */
export function normalizeSseToBytes(input: string): Uint8Array {
	const lines = input.replace(/\r\n/g, "\n").split("\n");
	const out: string[] = [];
	for (const line of lines) {
		const trimmed = line.trimEnd();
		if (trimmed === "" || trimmed.startsWith(":")) continue;
		if (trimmed.startsWith("data:")) {
			const payload = trimmed.slice(5);
			out.push(payload.startsWith(" ") ? payload.slice(1) : payload);
		} else {
			out.push(trimmed);
		}
	}
	return new TextEncoder().encode(out.join("\n"));
}

export function normalizeSseText(input: string): string {
	return new TextDecoder().decode(normalizeSseToBytes(input));
}
