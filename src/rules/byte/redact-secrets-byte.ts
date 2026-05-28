import { BYTE_LOOKBACK_SIZE } from "../../constants.js";
import { getGuardContextState } from "../../create-guard-context.js";
import { recordViolation } from "../../record-violation.js";
import type { ByteGuardOptions, ByteTransform, GuardContext } from "../../types.js";
import {
	adjustEmitEndForSecretPrefix,
	concatBytes,
	resolvePlaceholder,
	resolveSecretPatterns,
	scanAndReplace,
	type RedactScanOptions,
} from "../redact-scan.js";

function bytesToLatin1(bytes: Uint8Array): string {
	let text = "";
	for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]!);
	return text;
}

function latin1ToBytes(text: string): Uint8Array {
	const out = new Uint8Array(text.length);
	for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
	return out;
}

function processBuffer(
	buffer: Uint8Array,
	ctx: GuardContext,
	options: RedactScanOptions | undefined,
): { emit: Uint8Array; matchCount: number } {
	const patterns = resolveSecretPatterns(options);
	const placeholder = resolvePlaceholder(options);
	const text = bytesToLatin1(buffer);
	const { text: redacted, matchCount } = scanAndReplace(text, patterns, placeholder);
	if (matchCount > 0) {
		recordViolation(ctx, {
			rule: "redact_secrets",
			message: `Redacted ${matchCount} secret match(es) in byte stream`,
		});
	}
	return { emit: latin1ToBytes(redacted), matchCount };
}

function splitProcessable(buffer: Uint8Array): { processable: Uint8Array; retained: Uint8Array } {
	if (buffer.length <= BYTE_LOOKBACK_SIZE) {
		return { processable: new Uint8Array(0), retained: buffer };
	}

	let safeEnd = buffer.length - BYTE_LOOKBACK_SIZE;
	safeEnd = adjustEmitEndForSecretPrefix(buffer, safeEnd);

	return {
		processable: buffer.subarray(0, safeEnd),
		retained: buffer.subarray(safeEnd),
	};
}

export function byteRedactSecrets(_options?: ByteGuardOptions): ByteTransform {
	return (chunk, ctx) => {
		const state = getGuardContextState(ctx);
		const combined = concatBytes(state.byteLookback, state.pendingUtf8, chunk);
		state.pendingUtf8 = new Uint8Array(0);

		const { processable, retained } = splitProcessable(combined);
		state.byteLookback = retained;

		if (processable.length === 0) {
			return new Uint8Array(0);
		}

		return processBuffer(processable, ctx, undefined).emit;
	};
}

export function flushByteRedactSecrets(ctx: GuardContext, _options?: ByteGuardOptions): Uint8Array {
	const state = getGuardContextState(ctx);
	const combined = concatBytes(state.byteLookback, state.pendingUtf8);
	state.byteLookback = new Uint8Array(0);
	state.pendingUtf8 = new Uint8Array(0);

	if (combined.length === 0) return new Uint8Array(0);
	return processBuffer(combined, ctx, undefined).emit;
}

export { BYTE_LOOKBACK_SIZE };
