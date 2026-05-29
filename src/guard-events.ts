import { createGuardContext, getGuardContextState } from "./create-guard-context.js";
import { applyGuardTransforms } from "./apply-guard-transforms.js";
import { summarizeGuardContext } from "./summarize-guard-context.js";
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

/** Guard parsed event streams with composable rule transforms. */
export async function* guardEvents(
	source: AsyncIterable<GuardEvent>,
	configOrTransform?: GuardEventsConfig | GuardTransform,
	...extraTransforms: GuardTransform[]
): AsyncGenerator<GuardEvent> {
	const { config, transforms } = resolveGuardEventsArgs(configOrTransform, extraTransforms);
	const ctx = createGuardContext({
		...(config?.mode !== undefined ? { mode: config.mode } : {}),
		...(config?.onViolation !== undefined ? { onViolation: config.onViolation } : {}),
		...(config?.policyVersion !== undefined ? { policyVersion: config.policyVersion } : {}),
	});
	const execute = transforms.length > 0;

	let eventIndex = 0;
	for await (const event of source) {
		getGuardContextState(ctx).eventIndex = eventIndex;
		eventIndex += 1;
		for (const out of applyGuardTransforms(event, ctx, transforms, execute)) {
			yield out;
		}
	}

	config?.onFinish?.(summarizeGuardContext(ctx));
}
