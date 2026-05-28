/** Policy rule keys — keep in sync with schemas/policy-v1.json */
export const RULE_KEYS = [
	"redactSecrets",
	"redactPII",
	"allowTools",
	"denyTools",
	"blockToolArgs",
	"maxToolArgsBytes",
	"sanitizeErrors",
] as const;

export type RuleKey = (typeof RULE_KEYS)[number];

export function isRuleKey(key: string): key is RuleKey {
	return (RULE_KEYS as readonly string[]).includes(key);
}
