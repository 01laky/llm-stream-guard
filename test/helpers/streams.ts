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
	if (index <= 0) return [new Uint8Array(0), bytes];
	if (index >= bytes.length) return [bytes, new Uint8Array(0)];
	return [bytes.slice(0, index), bytes.slice(index)];
}

/** Split bytes at ascending byte indices (0 and length allowed as boundaries). */
export function splitAtIndices(bytes: Uint8Array, indices: number[]): Uint8Array[] {
	const sorted = [...indices].sort((a, b) => a - b);
	const chunks: Uint8Array[] = [];
	let prev = 0;
	for (const index of sorted) {
		const clamped = Math.max(0, Math.min(index, bytes.length));
		if (clamped > prev) chunks.push(bytes.slice(prev, clamped));
		prev = clamped;
	}
	if (prev < bytes.length) chunks.push(bytes.slice(prev));
	return chunks;
}

export function splitIntoFixedSizeChunks(bytes: Uint8Array, chunkSize: number): Uint8Array[] {
	if (chunkSize <= 0) throw new RangeError("chunkSize must be positive");
	const chunks: Uint8Array[] = [];
	for (let i = 0; i < bytes.length; i += chunkSize) {
		chunks.push(bytes.slice(i, i + chunkSize));
	}
	return chunks.length > 0 ? chunks : [new Uint8Array(0)];
}

/** Deterministic PRNG for reproducible fuzz splits (Mulberry32). */
export function createSeededRng(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Random partition of [1..length-1] for passthrough fuzz (always at least one chunk). */
export function randomSplitIndices(length: number, rng: () => number, maxSplits = 16): number[] {
	if (length <= 1) return [];
	const cap = Math.min(maxSplits, length - 1);
	const count = 1 + Math.floor(rng() * cap);
	const indices = new Set<number>();
	while (indices.size < count) {
		indices.add(1 + Math.floor(rng() * (length - 1)));
	}
	return [...indices].sort((a, b) => a - b);
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]!) return false;
	}
	return true;
}
