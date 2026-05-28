import { createByteGuard } from "../create-byte-guard.js";
import { guardEvents } from "../guard-events.js";
import { loadPolicy } from "./load.js";
import type { GuardFromPolicy, LoadedPolicy, LoadPolicyOptions } from "./types.js";
import type { GuardEvent } from "../types.js";

export function createGuardFromPolicy(
	policyOrPath: LoadedPolicy | string,
	options?: LoadPolicyOptions,
): GuardFromPolicy {
	const policy =
		typeof policyOrPath === "string" ? loadPolicy(policyOrPath, options) : policyOrPath;

	const eventConfig = {
		mode: policy.mode,
		transforms: policy.transforms,
	};

	return {
		mode: policy.mode,
		...(policy.policyVersion !== undefined ? { policyVersion: policy.policyVersion } : {}),
		transforms: policy.transforms,
		byteOptions: policy.byteOptions,
		eventConfig,
		guard(source: AsyncIterable<GuardEvent>) {
			return guardEvents(source, eventConfig);
		},
		createByteGuard() {
			return createByteGuard(policy.byteOptions);
		},
	};
}
