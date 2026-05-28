const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8(s: string): Uint8Array {
	return encoder.encode(s);
}

export function utf8String(bytes: Uint8Array): string {
	return decoder.decode(bytes);
}

export async function collectBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
	const reader = stream.getReader();
	const parts: Uint8Array[] = [];
	let total = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			parts.push(value);
			total += value.length;
		}
	}

	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

export function readableFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(chunk);
			controller.close();
		},
	});
}

export function splitUtf8String(s: string, index: number): [Uint8Array, Uint8Array] {
	const bytes = utf8(s);
	if (index <= 0) return [new Uint8Array(0), bytes];
	if (index >= bytes.length) return [bytes, new Uint8Array(0)];
	return [bytes.slice(0, index), bytes.slice(index)];
}

/** Split at arbitrary byte index — may bisect a UTF-8 code point (Phase 1 redaction target). */
export function splitAtByteIndex(bytes: Uint8Array, index: number): [Uint8Array, Uint8Array] {
	return [bytes.slice(0, index), bytes.slice(index)];
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]!) return false;
	}
	return true;
}
