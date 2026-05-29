import type {
	ByteGuardOptions,
	GuardEventsConfig,
	GuardTransform,
	StreamGuardSummary,
	Violation,
	ViolationMode,
} from "../types.js";

export type PolicyByteSection = {
	redactSecrets?: boolean;
	sanitizeErrors?: boolean;
};

export type NormalizedRule = {
	key: string;
	params: Record<string, unknown>;
};

export type PolicyDocument = {
	version?: string;
	policyVersion?: string;
	extends?: string;
	mode?: ViolationMode;
	byte?: PolicyByteSection;
	rules?: PolicyRuleEntry[];
};

export type PolicyRuleEntry = Record<string, Record<string, unknown>>;

export type LoadedPolicy = {
	version: string;
	policyVersion?: string;
	mode: ViolationMode;
	byteOptions: ByteGuardOptions;
	transforms: GuardTransform[];
	profile?: string;
	rules: NormalizedRule[];
};

export type LoadPolicyOptions = {
	mode?: ViolationMode;
	noExtends?: boolean;
	baseDir?: string;
	onFinish?: (summary: StreamGuardSummary) => void;
	onViolation?: (violation: Violation) => void;
};

export type CompileOptions = LoadPolicyOptions;

export type PolicyDiffEntry = {
	kind: "added" | "removed" | "changed";
	path: string;
	before?: unknown;
	after?: unknown;
};

export type PolicyDiff = {
	changed: boolean;
	entries: PolicyDiffEntry[];
};

export type GuardFromPolicy = {
	readonly mode: ViolationMode;
	readonly policyVersion?: string;
	readonly transforms: GuardTransform[];
	readonly byteOptions: ByteGuardOptions;
	readonly eventConfig: GuardEventsConfig;
	guard(
		source: AsyncIterable<import("../types.js").GuardEvent>,
	): AsyncGenerator<import("../types.js").GuardEvent>;
	createByteGuard(): TransformStream<Uint8Array, Uint8Array>;
};

export type { PolicyValidationError, PolicyValidationResult } from "./error-codes.js";
