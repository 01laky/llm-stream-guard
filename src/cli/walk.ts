import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist"]);

export function walkFiles(paths: string[]): string[] {
	const files: string[] = [];
	for (const p of paths) {
		collect(p, files);
	}
	return files;
}

function collect(path: string, files: string[]): void {
	let st;
	try {
		st = statSync(path);
	} catch {
		return;
	}
	if (st.isFile()) {
		files.push(path);
		return;
	}
	if (!st.isDirectory()) return;
	for (const name of readdirSync(path)) {
		if (SKIP_DIRS.has(name)) continue;
		collect(join(path, name), files);
	}
}
