import { recordViolation } from "../record-violation.js";
import type { GuardContext, GuardEvent, GuardTransform } from "../types.js";
import { emailPattern, phonePattern } from "./patterns.js";
import { resolvePlaceholder, scanAndReplace } from "./redact-scan.js";

export type RedactPIIOptions = {
	email?: boolean;
	phone?: boolean;
};

function collectPatterns(options?: RedactPIIOptions): RegExp[] {
	const patterns: RegExp[] = [];
	if (options?.email) patterns.push(emailPattern());
	if (options?.phone) patterns.push(phonePattern());
	return patterns;
}

function scanPiiText(
	text: string,
	ctx: GuardContext,
	event: GuardEvent,
	patterns: RegExp[],
	placeholder: string,
): string {
	const { text: redacted, matchCount } = scanAndReplace(text, patterns, placeholder);
	if (matchCount > 0) {
		recordViolation(ctx, {
			rule: "redact_pii",
			message: `Redacted ${matchCount} PII match(es)`,
			event,
		});
	}
	return redacted;
}

/** Opt-in PII redaction — no flags enabled by default. */
export function redactPII(options?: RedactPIIOptions): GuardTransform {
	return (event, ctx) => {
		const patterns = collectPatterns(options);
		if (patterns.length === 0) return event;

		const placeholder = resolvePlaceholder();

		if (event.type === "text" || event.type === "reasoning") {
			const text = scanPiiText(event.text, ctx, event, patterns, placeholder);
			return text === event.text ? event : { ...event, text };
		}

		if (event.type === "tool_call" && event.phase === "done") {
			let next = event;
			let changed = false;

			if (typeof event.argsText === "string") {
				const text = scanPiiText(event.argsText, ctx, event, patterns, placeholder);
				if (text !== event.argsText) {
					next = { ...next, argsText: text };
					changed = true;
				}
			}

			if (event.args !== undefined) {
				try {
					const serialized = JSON.stringify(event.args);
					const text = scanPiiText(serialized, ctx, event, patterns, placeholder);
					if (text !== serialized) {
						const parsed = JSON.parse(text) as unknown;
						next = { ...next, args: parsed };
						changed = true;
					}
				} catch {
					/* keep original args */
				}
			}

			return changed ? next : event;
		}

		return event;
	};
}
