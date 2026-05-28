import { applyGuardTransforms } from "./apply-guard-transforms.js";
import { createGuardContext } from "./create-guard-context.js";
import type { GuardEvent, GuardEventsConfig, GuardTransform } from "./types.js";

function isGuardEventsConfig(
	value: GuardEventsConfig | GuardTransform,
): value is GuardEventsConfig {
	return typeof value === "object" && value !== null;
}

function resolveGuardEventsArgs(
	configOrTransform: GuardEventsConfig | GuardTransform | undefined,
	extraTransforms: GuardTransform[],
): { config: GuardEventsConfig | undefined; transforms: GuardTransform[] } {
	if (configOrTransform === undefined) {
		return { config: undefined, transforms: extraTransforms };
	}
	if (typeof configOrTransform === "function") {
		return { config: undefined, transforms: [configOrTransform, ...extraTransforms] };
	}
	if (isGuardEventsConfig(configOrTransform)) {
		return {
			config: configOrTransform,
			transforms: [...(configOrTransform.transforms ?? []), ...extraTransforms],
		};
	}
	return { config: undefined, transforms: extraTransforms };
}

/** Guard parsed event streams. Phase 0: passthrough — transforms wired but not executed. */
export async function* guardEvents(
	source: AsyncIterable<GuardEvent>,
	configOrTransform?: GuardEventsConfig | GuardTransform,
	...extraTransforms: GuardTransform[]
): AsyncGenerator<GuardEvent> {
	const { config, transforms } = resolveGuardEventsArgs(configOrTransform, extraTransforms);
	const ctx = createGuardContext(config);

	for await (const event of source) {
		// Phase 1: flip executeTransforms to true
		for (const out of applyGuardTransforms(event, ctx, transforms, false)) {
			yield out;
		}
	}
}
