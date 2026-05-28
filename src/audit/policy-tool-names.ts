import { blockToolArgsMatcherFromParams } from "../policy/block-tool-args-matcher.js";
import type { LoadedPolicy } from "../policy/types.js";

export type PolicyToolSets = {
	allow: Set<string>;
	deny: Set<string>;
	hasAllowRule: boolean;
	blockToolArgs: Array<{ pattern?: RegExp; contains?: string }>;
};

/** Extract allow/deny/blockToolArgs from compiled policy rules (post-loadPolicy). */
export function extractPolicyToolSets(policy: LoadedPolicy): PolicyToolSets {
	const allow = new Set<string>();
	const deny = new Set<string>();
	let hasAllowRule = false;
	const blockToolArgs: PolicyToolSets["blockToolArgs"] = [];

	for (const rule of policy.rules) {
		if (rule.key === "allowTools") {
			hasAllowRule = true;
			const names = rule.params.names;
			if (Array.isArray(names)) {
				for (const n of names) {
					if (typeof n === "string") allow.add(n);
				}
			}
		}
		if (rule.key === "denyTools") {
			const names = rule.params.names;
			if (Array.isArray(names)) {
				for (const n of names) {
					if (typeof n === "string") deny.add(n);
				}
			}
		}
		if (rule.key === "blockToolArgs") {
			const matcher = blockToolArgsMatcherFromParams(rule.params);
			if (matcher) blockToolArgs.push(matcher);
		}
	}

	return { allow, deny, hasAllowRule, blockToolArgs };
}
