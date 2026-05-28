import { recordViolation } from "../record-violation.js";
import type { GuardTransform } from "../types.js";

export type SanitizeErrorsOptions = {
	message?: string;
	stripCode?: boolean;
};

const DEFAULT_SAFE_MESSAGE = "An error occurred.";

/** Replace upstream error messages with a safe generic string. */
export function sanitizeErrors(options?: SanitizeErrorsOptions): GuardTransform {
	const safeMessage = options?.message ?? DEFAULT_SAFE_MESSAGE;
	const stripCode = options?.stripCode ?? true;

	return (event, ctx) => {
		if (event.type !== "error") return event;

		recordViolation(ctx, {
			rule: "sanitize_errors",
			message: "Sanitized upstream error event",
			event,
		});

		return {
			type: "error",
			message: safeMessage,
			...(stripCode ? {} : event.code !== undefined ? { code: event.code } : {}),
		};
	};
}

export { DEFAULT_SAFE_MESSAGE };
