export type BlockToolArgsMatcher = {
	pattern?: RegExp;
	contains?: string;
};

/** Build a matcher from a single blockToolArgs rule params object. */
export function blockToolArgsMatcherFromParams(
	params: Record<string, unknown>,
): BlockToolArgsMatcher | null {
	if (typeof params.pattern === "string") {
		return { pattern: new RegExp(params.pattern) };
	}
	if (typeof params.contains === "string") {
		return { contains: params.contains };
	}
	return null;
}

/** Test whether a string matches any blockToolArgs matcher. */
export function matchesBlockToolArgs(value: string, matchers: BlockToolArgsMatcher[]): boolean {
	for (const rule of matchers) {
		if (rule.pattern?.test(value)) return true;
		if (rule.contains && value.includes(rule.contains)) return true;
	}
	return false;
}
