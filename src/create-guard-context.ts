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

export function createGuardContextState(): GuardContextState {
	return {
		byteLookback: emptyBytes(),
		pendingUtf8: emptyBytes(),
		toolArgsBytesById: new Map(),
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
				state.toolArgsBytesById.clear();
			}
		},
	};

	contextState.set(ctx, createGuardContextState());
	return ctx;
}
