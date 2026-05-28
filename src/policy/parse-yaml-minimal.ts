export class PolicyYamlError extends Error {
	constructor(message: string) {
		super(`YAML feature not supported in policy files: ${message} Use JSON instead.`);
		this.name = "PolicyYamlError";
	}
}

type YamlValue = null | boolean | number | string | YamlValue[] | { [key: string]: YamlValue };

function stripComment(line: string): string {
	const idx = line.indexOf("#");
	return idx === -1 ? line : line.slice(0, idx);
}

function indentOf(line: string): number {
	let n = 0;
	for (const ch of line) {
		if (ch === " ") n++;
		else if (ch === "\t") throw new PolicyYamlError("tabs for indentation");
		else break;
	}
	return n;
}

function nextNonEmptyLine(lines: string[], start: number): number {
	let j = start;
	while (j < lines.length && stripComment(lines[j] ?? "").trim() === "") j++;
	return j;
}

function childIndent(lines: string[], start: number, parentIndent: number): number {
	const j = nextNonEmptyLine(lines, start);
	return j < lines.length ? indentOf(stripComment(lines[j] ?? "")) : parentIndent + 2;
}

function parseScalar(raw: string): YamlValue {
	const s = raw.trim();
	if (s === "" || s === "~" || s === "null") return null;
	if (s === "true") return true;
	if (s === "false") return false;
	if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
		return s.slice(1, -1);
	}
	if (s.includes("&") || s.includes("*")) throw new PolicyYamlError("anchors or aliases");
	if (s.includes("|") || s.includes(">")) throw new PolicyYamlError("multiline blocks");
	if (/^-?\d+$/.test(s)) return Number(s);
	if (/^-?\d+\.\d+$/.test(s)) return Number(s);
	if (s.startsWith("[") && s.endsWith("]")) {
		const inner = s.slice(1, -1).trim();
		if (!inner) return [];
		return inner.split(",").map((part) => parseScalar(part.trim()));
	}
	return s;
}

function parseNode(lines: string[], start: number, indent: number): [YamlValue, number] {
	let i = start;
	while (i < lines.length && stripComment(lines[i] ?? "").trim() === "") i++;
	if (i >= lines.length) return [{}, i];

	const first = stripComment(lines[i] ?? "").trimEnd();
	const firstIndent = indentOf(first);
	if (firstIndent < indent) return [{}, i];

	if (first.trimStart().startsWith("-")) {
		const items: YamlValue[] = [];
		while (i < lines.length) {
			const line = stripComment(lines[i] ?? "").trimEnd();
			if (line.trim() === "") {
				i++;
				continue;
			}
			if (indentOf(line) < indent) break;
			if (indentOf(line) > indent) throw new PolicyYamlError("inconsistent list indent");
			const trimmed = line.trim();
			if (!trimmed.startsWith("-")) break;
			const itemText = trimmed.slice(1).trim();
			if (itemText === "") {
				const childInd = childIndent(lines, i + 1, indent);
				const [child, next] = parseNode(lines, i + 1, childInd);
				items.push(child);
				i = next;
				continue;
			}
			if (itemText.includes(":")) {
				const colon = itemText.indexOf(":");
				const key = itemText.slice(0, colon).trim();
				const rest = itemText.slice(colon + 1).trim();
				if (rest === "") {
					const childInd = childIndent(lines, i + 1, indent);
					const [child, next] = parseNode(lines, i + 1, childInd);
					items.push({ [key]: child });
					i = next;
				} else {
					items.push({ [key]: parseScalar(rest) });
					i++;
				}
				continue;
			}
			items.push(parseScalar(itemText));
			i++;
		}
		return [items, i];
	}

	const obj: Record<string, YamlValue> = {};
	while (i < lines.length) {
		const line = stripComment(lines[i] ?? "").trimEnd();
		if (line.trim() === "") {
			i++;
			continue;
		}
		if (indentOf(line) < indent) break;
		if (indentOf(line) > indent) throw new PolicyYamlError("inconsistent mapping indent");
		const trimmed = line.trim();
		if (trimmed.startsWith("-")) break;
		const colon = trimmed.indexOf(":");
		if (colon === -1) throw new PolicyYamlError(`expected key:value at line ${i + 1}`);
		const key = trimmed.slice(0, colon).trim();
		const rest = trimmed.slice(colon + 1).trim();
		if (rest === "") {
			const childInd = childIndent(lines, i + 1, indent);
			const [child, next] = parseNode(lines, i + 1, childInd);
			obj[key] = child;
			i = next;
		} else {
			obj[key] = parseScalar(rest);
			i++;
		}
	}
	return [obj, i];
}

/** Minimal YAML subset for policy files only. */
export function parsePolicyYaml(text: string): unknown {
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	const [value] = parseNode(lines, 0, 0);
	return value;
}

export function parsePolicyFile(text: string, filename?: string): unknown {
	const ext = filename?.split(".").pop()?.toLowerCase();
	if (ext === "yaml" || ext === "yml") return parsePolicyYaml(text);
	const trimmed = text.trimStart();
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		return JSON.parse(text) as unknown;
	}
	if (/^\s*[a-zA-Z_][\w-]*\s*:/m.test(text) && !trimmed.startsWith("{")) {
		return parsePolicyYaml(text);
	}
	return JSON.parse(text) as unknown;
}
