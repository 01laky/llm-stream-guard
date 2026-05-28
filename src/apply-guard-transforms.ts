import type { GuardContext, GuardEvent, GuardTransform } from "./types.js";

function flattenTransformResult(result: GuardEvent | GuardEvent[] | null, out: GuardEvent[]): void {
	if (result === null) return;
	if (Array.isArray(result)) {
		out.push(...result);
		return;
	}
	out.push(result);
}

/**
 * Apply an ordered transform pipeline to one event.
 * Phase 0: when executeTransforms is false, returns [event] without calling transforms.
 */
export function applyGuardTransforms(
	event: GuardEvent,
	ctx: GuardContext,
	transforms: GuardTransform[],
	executeTransforms: boolean,
): GuardEvent[] {
	if (!executeTransforms || transforms.length === 0) {
		return [event];
	}

	let current: GuardEvent[] = [event];

	for (const transform of transforms) {
		const next: GuardEvent[] = [];
		for (const item of current) {
			flattenTransformResult(transform(item, ctx), next);
		}
		current = next;
	}

	return current;
}
