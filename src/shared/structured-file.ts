import { readFileSync } from "node:fs";
import { parsePolicyFile } from "../policy/parse-yaml-minimal.js";

/** Read JSON or YAML file into a parsed object (uses policy YAML parser for both). */
export function readStructuredFile(path: string): unknown {
	const text = readFileSync(path, "utf8");
	return parsePolicyFile(text, path);
}

/** Parse JSON or YAML text with a path hint for extension detection. */
export function parseStructuredText(text: string, pathHint: string): unknown {
	return parsePolicyFile(text, pathHint);
}
