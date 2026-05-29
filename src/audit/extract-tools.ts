import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { parseStructuredText, readStructuredFile } from "../shared/structured-file.js";
import type { ParsedManifest } from "./types.js";

function lineOf(text: string, index: number): number {
	return text.slice(0, index).split("\n").length;
}

function collectStrings(obj: unknown, prefix: string, out: ParsedManifest["strings"]): void {
	if (typeof obj === "string") {
		out.push({ field: prefix, value: obj });
		return;
	}
	if (Array.isArray(obj)) {
		obj.forEach((v, i) => collectStrings(v, `${prefix}[${i}]`, out));
		return;
	}
	if (obj && typeof obj === "object") {
		for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
			collectStrings(v, prefix ? `${prefix}.${k}` : k, out);
		}
	}
}

function pushTool(
	tools: string[],
	strings: ParsedManifest["strings"],
	name: unknown,
	toolObj: Record<string, unknown>,
): void {
	if (typeof name === "string" && name.length > 0) tools.push(name);
	collectStrings(toolObj.description, "description", strings);
	collectStrings(toolObj.examples, "examples", strings);
	collectStrings(toolObj.args, "args", strings);
	if (toolObj.inputSchema && typeof toolObj.inputSchema === "object") {
		collectStrings(
			(toolObj.inputSchema as Record<string, unknown>).default,
			"inputSchema.default",
			strings,
		);
	}
}

function extractFromToolsArray(doc: Record<string, unknown>): {
	tools: string[];
	strings: ParsedManifest["strings"];
} {
	const tools: string[] = [];
	const strings: ParsedManifest["strings"] = [];
	const arr = doc.tools;
	if (!Array.isArray(arr)) return { tools, strings };
	for (const entry of arr) {
		if (!entry || typeof entry !== "object") continue;
		const t = entry as Record<string, unknown>;
		const name = t.name ?? (t.function as Record<string, unknown> | undefined)?.name;
		pushTool(tools, strings, name, t);
	}
	return { tools, strings };
}

function extractOpenApiTools(doc: Record<string, unknown>): {
	tools: string[];
	strings: ParsedManifest["strings"];
} {
	const tools: string[] = [];
	const strings: ParsedManifest["strings"] = [];
	const components = doc.components as Record<string, unknown> | undefined;
	const xTools = components?.["x-tools"];
	if (Array.isArray(xTools)) {
		for (const entry of xTools) {
			if (entry && typeof entry === "object") {
				pushTool(
					tools,
					strings,
					(entry as Record<string, unknown>).name,
					entry as Record<string, unknown>,
				);
			}
		}
	}
	const paths = doc.paths as Record<string, unknown> | undefined;
	if (paths) {
		for (const pathItem of Object.values(paths)) {
			if (!pathItem || typeof pathItem !== "object") continue;
			for (const method of Object.values(pathItem as Record<string, unknown>)) {
				if (!method || typeof method !== "object") continue;
				const xt = (method as Record<string, unknown>)["x-tools"];
				if (Array.isArray(xt)) {
					for (const entry of xt) {
						if (entry && typeof entry === "object") {
							pushTool(
								tools,
								strings,
								(entry as Record<string, unknown>).name,
								entry as Record<string, unknown>,
							);
						}
					}
				}
			}
		}
	}
	return { tools, strings };
}

function enrichStringLines(strings: ParsedManifest["strings"], rawText: string): void {
	let searchFrom = 0;
	for (const entry of strings) {
		const idx = rawText.indexOf(entry.value, searchFrom);
		if (idx >= 0) {
			entry.line = lineOf(rawText, idx);
			searchFrom = idx + entry.value.length;
		}
	}
}

function parseManifestDocument(filePath: string, doc: unknown, rawText?: string): ParsedManifest {
	if (!doc || typeof doc !== "object") {
		throw new Error(`Invalid manifest document: ${filePath}`);
	}
	const record = doc as Record<string, unknown>;
	let { tools, strings } = extractFromToolsArray(record);
	if (tools.length === 0) {
		const oa = extractOpenApiTools(record);
		tools = oa.tools;
		strings = strings.concat(oa.strings);
	}
	if (rawText) enrichStringLines(strings, rawText);
	return { file: filePath, tools, strings };
}

/** Parse manifest file → tool names + scannable strings. */
export function parseManifestFile(filePath: string): ParsedManifest {
	const rawText = readFileSync(filePath, "utf8");
	return parseManifestDocument(filePath, readStructuredFile(filePath), rawText);
}

/** Parse manifest text with path hint for extension detection. */
export function parseManifestText(filePath: string, text: string): ParsedManifest {
	return parseManifestDocument(filePath, parseStructuredText(text, filePath), text);
}

export { lineOf };
