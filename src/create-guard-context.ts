import type {
	CreateGuardContextOptions,
	GuardContext,
	GuardContextState,
	Violation,
	ViolationMode,
} from "./types.js";

const defaultMode: ViolationMode = "warn";

function emptyBytes(): Uint8Array {
	return new Uint8Array(0);
}

export function createGuardContextState(policyVersion?: string): GuardContextState {
	return {
		byteLookback: emptyBytes(),
		pendingUtf8: emptyBytes(),
		sanitizeLookback: emptyBytes(),
		toolArgsBytesById: new Map(),
		redactions: 0,
		...(policyVersion !== undefined ? { policyVersion } : {}),
	};
}

/** @internal Phase 1 byte pipeline slots keyed by context instance. */
const contextState = new WeakMap<GuardContext, GuardContextState>();

export function getGuardContextState(ctx: GuardContext): GuardContextState {
	let state = contextState.get(ctx);
	if (!state) {
		state = createGuardContextState();
		contextState.set(ctx, state);
	}
	return state;
}

export function createGuardContext(options: CreateGuardContextOptions = {}): GuardContext {
	const mode = options.mode ?? defaultMode;
	const onViolation = options.onViolation;
	const policyVersion = options.policyVersion;
	const violations: Violation[] = [];

	const ctx: GuardContext = {
		get mode() {
			return mode;
		},
		get violations() {
			return violations;
		},
		get onViolation() {
			return onViolation;
		},
		reset() {
			violations.length = 0;
			const state = contextState.get(ctx);
			if (state) {
				state.byteLookback = emptyBytes();
				state.pendingUtf8 = emptyBytes();
				state.sanitizeLookback = emptyBytes();
				state.toolArgsBytesById.clear();
				state.redactions = 0;
				delete state.eventIndex;
			}
		},
	};

	contextState.set(ctx, createGuardContextState(policyVersion));
	return ctx;
}
