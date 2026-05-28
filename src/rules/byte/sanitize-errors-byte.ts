import { recordViolation } from "../../record-violation.js";
import type { ByteTransform, GuardContext } from "../../types.js";
import { DEFAULT_SAFE_MESSAGE } from "../sanitize-errors.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: false });

/** Best-effort SSE error message sanitization in opaque byte streams. */
export function byteSanitizeErrors(): ByteTransform {
	return (chunk, ctx) => {
		const text = decoder.decode(chunk);
		if (!text.includes('"error"') && !text.includes("error")) {
			return chunk;
		}

		const sanitized = text.replace(
			/"message"\s*:\s*"([^"\\]|\\.)*"/g,
			'"message":"An error occurred."',
		);

		if (sanitized === text) return chunk;

		recordViolation(ctx, {
			rule: "sanitize_errors",
			message: "Sanitized error payload in byte stream",
		});

		return encoder.encode(sanitized);
	};
}

export function flushByteSanitizeErrors(_ctx: GuardContext): Uint8Array {
	return new Uint8Array(0);
}

export { DEFAULT_SAFE_MESSAGE };
