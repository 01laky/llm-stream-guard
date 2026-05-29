import { BYTE_LOOKBACK_SIZE } from "../../constants.js";
import { getGuardContextState } from "../../create-guard-context.js";
import { recordViolation } from "../../record-violation.js";
import type { ByteTransform, GuardContext } from "../../types.js";
import { concatBytes } from "../redact-scan.js";
import { DEFAULT_SAFE_MESSAGE } from "../sanitize-errors.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: false });

const MESSAGE_FIELD_RE = /"message"\s*:\s*"([^"\\]|\\.)*"/g;

function sanitizeText(text: string, ctx: GuardContext): string {
	let changed = false;
	const sanitized = text.replace(MESSAGE_FIELD_RE, () => {
		changed = true;
		return `"message":"${DEFAULT_SAFE_MESSAGE}"`;
	});
	if (changed) {
		recordViolation(ctx, {
			rule: "sanitize_errors",
			message: "Sanitized error payload in byte stream",
		});
	}
	return sanitized;
}

function splitProcessable(buffer: Uint8Array): { processable: Uint8Array; retained: Uint8Array } {
	if (buffer.length <= BYTE_LOOKBACK_SIZE) {
		return { processable: new Uint8Array(0), retained: buffer };
	}

	let safeEnd = buffer.length - BYTE_LOOKBACK_SIZE;
	const tailText = decoder.decode(buffer.subarray(Math.max(0, safeEnd - 24)));
	const msgIdx = tailText.lastIndexOf('"message"');
	if (msgIdx >= 0) {
		const absolute = Math.max(0, safeEnd - 24) + msgIdx;
		if (absolute > 0 && absolute < safeEnd) safeEnd = absolute;
	}

	return {
		processable: buffer.subarray(0, safeEnd),
		retained: buffer.subarray(safeEnd),
	};
}

/** Best-effort SSE error message sanitization in opaque byte streams (rolling lookback). */
export function byteSanitizeErrors(): ByteTransform {
	return (chunk, ctx) => {
		const state = getGuardContextState(ctx);
		const combined = concatBytes(state.sanitizeLookback, chunk);
		const { processable, retained } = splitProcessable(combined);
		state.sanitizeLookback = retained;

		if (processable.length === 0) return new Uint8Array(0);

		const text = decoder.decode(processable);
		if (!text.includes('"message"') && !text.includes("error")) {
			return processable;
		}

		return encoder.encode(sanitizeText(text, ctx));
	};
}

export function flushByteSanitizeErrors(ctx: GuardContext): Uint8Array {
	const state = getGuardContextState(ctx);
	const combined = state.sanitizeLookback;
	state.sanitizeLookback = new Uint8Array(0);
	if (combined.length === 0) return new Uint8Array(0);
	const text = decoder.decode(combined);
	return encoder.encode(sanitizeText(text, ctx));
}

export { DEFAULT_SAFE_MESSAGE };
