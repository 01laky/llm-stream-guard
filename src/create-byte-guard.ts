import { createGuardContext } from "./create-guard-context.js";
import { pipeGuard } from "./pipe-guard.js";
import type { ByteGuardOptions } from "./types.js";

function enqueueByteResults(
	controller: TransformStreamDefaultController<Uint8Array>,
	result: Uint8Array | Uint8Array[],
): void {
	const outputs = Array.isArray(result) ? result : [result];
	for (const chunk of outputs) {
		controller.enqueue(chunk);
	}
}

/** Byte-mode guard as a Web Streams TransformStream. Phase 0: identity pass-through. */
export function createByteGuard(
	options: ByteGuardOptions = {},
): TransformStream<Uint8Array, Uint8Array> {
	const ctx = createGuardContext(options);
	const byteTransform = pipeGuard();

	return new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			enqueueByteResults(controller, byteTransform(chunk, ctx));
		},
	});
}
