import { createByteGuard } from "../../src/create-byte-guard.js";
import type { ByteGuardOptions } from "../../src/types.js";
import { collectBytes, readableFromChunks } from "./streams.js";

export async function pipeThroughByteGuard(
	payload: Uint8Array,
	chunks: Uint8Array[],
	options: ByteGuardOptions = {},
): Promise<Uint8Array> {
	const out = await collectBytes(readableFromChunks(chunks).pipeThrough(createByteGuard(options)));
	if (chunks.length === 0 && payload.length === 0) return out;
	return out;
}
