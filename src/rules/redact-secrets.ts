import { recordViolation } from "../record-violation.js";
import type { GuardContext, GuardEvent, GuardTransform } from "../types.js";
import {
	resolvePlaceholder,
	resolveSecretPatterns,
	scanAndReplace,
	type RedactScanOptions,
} from "./redact-scan.js";

export type RedactSecretsOptions = RedactScanOptions;

function scanEventText(
	event: GuardEvent,
	ctx: GuardContext,
	options: RedactSecretsOptions | undefined,
): GuardEvent | null {
	const patterns = resolveSecretPatterns(options);
	const placeholder = resolvePlaceholder(options);

	if (event.type === "text" || event.type === "reasoning") {
		const { text, matchCount } = scanAndReplace(event.text, patterns, placeholder);
		if (matchCount === 0) return event;
		recordViolation(ctx, {
			rule: "redact_secrets",
			message: `Redacted ${matchCount} secret match(es) in ${event.type}`,
			event,
		});
		return { ...event, text };
	}

	if (event.type === "tool_call") {
		if (event.phase === "done") {
			let changed = false;
			let next: GuardEvent = event;
			let totalMatches = 0;

			if (typeof event.argsText === "string") {
				const { text, matchCount } = scanAndReplace(event.argsText, patterns, placeholder);
				if (matchCount > 0) {
					changed = true;
					totalMatches += matchCount;
					next = { ...(next as typeof event), argsText: text };
				}
			}

			if (event.args !== undefined) {
				const serialized = safeStringify(event.args);
				if (serialized) {
					const { text, matchCount } = scanAndReplace(serialized, patterns, placeholder);
					if (matchCount > 0) {
						changed = true;
						totalMatches += matchCount;
						const parsed = tryParseJson(text);
						next = { ...(next as typeof event), args: parsed ?? text };
					}
				}
			}

			if (!changed) return event;
			recordViolation(ctx, {
				rule: "redact_secrets",
				message: `Redacted ${totalMatches} secret match(es) in tool_call args`,
				event,
			});
			return next;
		}

		if (event.phase === "delta" && typeof event.argsText === "string") {
			const { text, matchCount } = scanAndReplace(event.argsText, patterns, placeholder);
			if (matchCount === 0) return event;
			recordViolation(ctx, {
				rule: "redact_secrets",
				message: `Redacted ${matchCount} secret match(es) in tool_call argsText delta`,
				event,
			});
			return { ...event, argsText: text };
		}
	}

	return event;
}

function safeStringify(value: unknown): string | null {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value);
	} catch {
		return null;
	}
}

function tryParseJson(text: string): unknown | null {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return null;
	}
}

/** Redact built-in secret patterns from text, reasoning, and tool args. */
export function redactSecrets(options?: RedactSecretsOptions): GuardTransform {
	return (event, ctx) => {
		if (event.type === "error" || event.type === "finish") {
			return event;
		}
		return scanEventText(event, ctx, options);
	};
}

export { DEFAULT_REDACT_PLACEHOLDER } from "../constants.js";
