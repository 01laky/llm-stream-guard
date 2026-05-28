import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { parsePolicyYaml } from "../policy/parse-yaml-minimal.js";
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

/** Extract tools from Guard manifest / MCP JSON shape. */
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

/** Extract from OpenAPI components.x-tools or paths.*.post.x-tools. */
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

/** Parse manifest file → tool names + scannable strings. */
export function parseManifestFile(filePath: string): ParsedManifest {
	const text = readFileSync(filePath, "utf8");
	const ext = extname(filePath).toLowerCase();
	let doc: unknown;
	if (ext === ".yaml" || ext === ".yml") {
		doc = parsePolicyYaml(text);
	} else {
		doc = JSON.parse(text) as unknown;
	}
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
	return { file: filePath, tools, strings };
}

/** Validate manifest JSON text only (for line tracking). */
export function parseManifestText(filePath: string, text: string): ParsedManifest {
	const ext = extname(filePath).toLowerCase();
	let doc: unknown;
	if (ext === ".yaml" || ext === ".yml") {
		doc = parsePolicyYaml(text);
	} else {
		doc = JSON.parse(text) as unknown;
	}
	if (!doc || typeof doc !== "object") throw new Error(`Invalid manifest: ${filePath}`);
	const record = doc as Record<string, unknown>;
	const { tools, strings } = extractFromToolsArray(record);
	const oa = tools.length === 0 ? extractOpenApiTools(record) : { tools: [], strings: [] };
	return {
		file: filePath,
		tools: tools.length > 0 ? tools : oa.tools,
		strings: strings.concat(oa.strings),
	};
}

export { lineOf };
