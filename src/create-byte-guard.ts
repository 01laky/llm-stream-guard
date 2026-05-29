import { createGuardContext } from "./create-guard-context.js";
import { summarizeGuardContext } from "./summarize-guard-context.js";
import { pipeGuard } from "./pipe-guard.js";
import { byteSanitizeErrors, flushByteSanitizeErrors } from "./rules/byte/sanitize-errors-byte.js";
import { byteRedactSecrets, flushByteRedactSecrets } from "./rules/byte/redact-secrets-byte.js";
import type { ByteGuardOptions } from "./types.js";

function enqueueByteResults(
	controller: TransformStreamDefaultController<Uint8Array>,
	result: Uint8Array | Uint8Array[],
): void {
	const outputs = Array.isArray(result) ? result : [result];
	for (const chunk of outputs) {
		if (chunk.length > 0) controller.enqueue(chunk);
	}
}

/** Byte-mode guard as a Web Streams TransformStream. */
export function createByteGuard(
	options: ByteGuardOptions = {},
): TransformStream<Uint8Array, Uint8Array> {
	const ctx = createGuardContext({
		...(options.mode !== undefined ? { mode: options.mode } : {}),
		...(options.onViolation !== undefined ? { onViolation: options.onViolation } : {}),
		...(options.policyVersion !== undefined ? { policyVersion: options.policyVersion } : {}),
	});
	const parts = [];
	if (options.redactSecrets) parts.push(byteRedactSecrets(options));
	if (options.sanitizeErrors) parts.push(byteSanitizeErrors());
	const byteTransform = parts.length > 0 ? pipeGuard(...parts) : pipeGuard();

	return new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			enqueueByteResults(controller, byteTransform(chunk, ctx));
		},
		flush(controller) {
			if (options.redactSecrets) {
				enqueueByteResults(controller, flushByteRedactSecrets(ctx, options));
			}
			if (options.sanitizeErrors) {
				enqueueByteResults(controller, flushByteSanitizeErrors(ctx));
			}
			options.onFinish?.(summarizeGuardContext(ctx));
		},
	});
}
