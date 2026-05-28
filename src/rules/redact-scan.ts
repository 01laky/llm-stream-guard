import { DEFAULT_REDACT_PLACEHOLDER } from "../constants.js";
import { builtInSecretPatterns } from "./patterns.js";

export type RedactScanOptions = {
	patterns?: RegExp[];
	placeholder?: string;
};

export function resolveSecretPatterns(options?: RedactScanOptions): RegExp[] {
	const extra = options?.patterns ?? [];
	return [...builtInSecretPatterns(), ...extra];
}

export function resolvePlaceholder(options?: RedactScanOptions): string {
	return options?.placeholder ?? DEFAULT_REDACT_PLACEHOLDER;
}

export function scanAndReplace(
	text: string,
	patterns: RegExp[],
	placeholder: string,
): { text: string; matchCount: number } {
	if (!text) return { text, matchCount: 0 };

	let result = text;
	let matchCount = 0;

	for (const source of patterns) {
		const flags = source.flags.includes("g") ? source.flags : `${source.flags}g`;
		const pattern = new RegExp(source.source, flags);
		result = result.replace(pattern, () => {
			matchCount++;
			return placeholder;
		});
	}

	return { text: result, matchCount };
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
	const total = parts.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

/** Last index in [0, maxExclusive) that ends on a complete UTF-8 code point boundary. */
export function lastUtf8Boundary(bytes: Uint8Array, maxExclusive: number): number {
	const limit = Math.min(maxExclusive, bytes.length);
	if (limit <= 0) return 0;

	let index = limit;
	while (index > 0) {
		const byte = bytes[index - 1]!;
		if ((byte & 0xc0) === 0x80) {
			index--;
			continue;
		}
		const need = utf8CodePointLength(byte);
		if (index - need >= 0 && isValidUtf8Sequence(bytes, index - need, need)) {
			return index;
		}
		index--;
	}
	return 0;
}

function utf8CodePointLength(firstByte: number): number {
	if ((firstByte & 0x80) === 0) return 1;
	if ((firstByte & 0xe0) === 0xc0) return 2;
	if ((firstByte & 0xf0) === 0xe0) return 3;
	if ((firstByte & 0xf8) === 0xf0) return 4;
	return 1;
}

function isValidUtf8Sequence(bytes: Uint8Array, start: number, length: number): boolean {
	if (start < 0 || start + length > bytes.length) return false;
	for (let i = 1; i < length; i++) {
		if ((bytes[start + i]! & 0xc0) !== 0x80) return false;
	}
	return true;
}

const SECRET_PREFIXES = ["sk-proj-", "sk-", "Bearer ", "github_pat_", "ghp_", "eyJ", "AKIA"];

/** Hold trailing bytes that may be an incomplete secret prefix across chunk boundaries. */
export function secretPrefixHoldLength(text: string): number {
	let hold = 0;
	for (const start of SECRET_PREFIXES) {
		for (let len = 1; len < start.length; len++) {
			const prefix = start.slice(0, len);
			if (text.endsWith(prefix)) hold = Math.max(hold, prefix.length);
		}
	}
	if (text.endsWith("sk")) hold = Math.max(hold, 2);
	if (text.endsWith("s")) hold = Math.max(hold, 1);

	const skSuffix = text.match(/(sk-(?:proj-)?[A-Za-z0-9_-]*)$/);
	if (skSuffix) {
		const suffix = skSuffix[1]!;
		if (!/^sk-(?:proj-)?[A-Za-z0-9_-]{8,}$/.test(suffix)) {
			hold = Math.max(hold, suffix.length);
		}
	}

	const bearerSuffix = text.match(/(Bearer(?:\s+\S*)?)$/);
	if (bearerSuffix) {
		const suffix = bearerSuffix[1]!;
		if (!/^Bearer\s+\S+$/.test(suffix)) {
			hold = Math.max(hold, suffix.length);
		}
	}

	return hold;
}

export function adjustEmitEndForSecretPrefix(bytes: Uint8Array, safeEnd: number): number {
	if (safeEnd <= 0) return 0;
	let head = "";
	for (let i = 0; i < safeEnd; i++) head += String.fromCharCode(bytes[i]!);
	const holdChars = secretPrefixHoldLength(head);
	if (holdChars === 0) return safeEnd;
	return Math.max(0, safeEnd - holdChars);
}
