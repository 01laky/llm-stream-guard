import type { ByteTransform, GuardContext } from "./types.js";

function flattenByteResult(result: Uint8Array | Uint8Array[], out: Uint8Array[]): void {
	if (Array.isArray(result)) {
		out.push(...result);
		return;
	}
	out.push(result);
}

/** Compose byte transforms left-to-right. Zero args → identity pass-through. */
export function pipeGuard(...transforms: ByteTransform[]): ByteTransform {
	if (transforms.length === 0) {
		return (chunk) => chunk;
	}

	return (chunk: Uint8Array, ctx: GuardContext) => {
		let parts: Uint8Array[] = [chunk];

		for (const transform of transforms) {
			const next: Uint8Array[] = [];
			for (const part of parts) {
				flattenByteResult(transform(part, ctx), next);
			}
			parts = next;
		}

		if (parts.length === 1) {
			return parts[0]!;
		}
		return parts;
	};
}
