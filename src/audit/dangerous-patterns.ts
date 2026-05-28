import type { StaticPatternFinding } from "./types.js";

/** Bundled dangerous-string catalog D001–D006 (zero-dep, static manifest scan). */
export const DANGEROUS_PATTERNS: Array<{
	id: string;
	re: RegExp;
	message: string;
}> = [
	{ id: "D001", re: /curl\s+[^\n|]*\|\s*sh\b/i, message: "Shell pipe to sh detected in tool text" },
	{ id: "D002", re: /rm\s+-rf\b/i, message: "Destructive rm -rf pattern in tool text" },
	{ id: "D003", re: /`[^`]+`/, message: "Backtick command execution pattern in tool text" },
	{ id: "D004", re: /\$\([^)]+\)/, message: "Subshell $() pattern in tool text" },
	{ id: "D005", re: /base64\s+-d|atob\s*\(/i, message: "Base64 decode pattern in tool text" },
	{
		id: "D006",
		re: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.|169\.254\.)/,
		message: "Private or link-local IP hint in tool text",
	},
];

/** Scan manifest string fields against D001–D006. */
export function scanDangerousStrings(
	file: string,
	strings: Array<{ field: string; value: string; line?: number }>,
): StaticPatternFinding[] {
	const out: StaticPatternFinding[] = [];
	for (const { field, value, line } of strings) {
		for (const pat of DANGEROUS_PATTERNS) {
			if (pat.re.test(value)) {
				out.push({
					code: pat.id,
					severity: "warning",
					file,
					field,
					message: pat.message,
					...(line !== undefined ? { line } : {}),
				});
			}
		}
	}
	return out;
}
