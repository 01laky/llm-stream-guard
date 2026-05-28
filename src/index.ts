export { DEFAULT_REDACT_PLACEHOLDER } from "./constants.js";
export { createByteGuard } from "./create-byte-guard.js";
export { createGuardContext } from "./create-guard-context.js";
export { guardEvents } from "./guard-events.js";
export { pipeGuard } from "./pipe-guard.js";
export {
	allowTools,
	blockToolArgs,
	denyTools,
	maxToolArgsBytes,
	redactPII,
	redactSecrets,
	sanitizeErrors,
	type BlockToolArgsMatcher,
	type RedactPIIOptions,
	type RedactSecretsOptions,
	type SanitizeErrorsOptions,
} from "./rules/index.js";
export type {
	ByteGuardOptions,
	ByteTransform,
	CreateGuardContextOptions,
	GuardErrorEvent,
	GuardEvent,
	GuardEventsConfig,
	GuardFinishEvent,
	GuardPhase,
	GuardReasoningEvent,
	GuardTextEvent,
	GuardToolCallEvent,
	GuardTransform,
	GuardContext,
	Violation,
	ViolationMode,
} from "./types.js";
