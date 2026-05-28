import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const DEFAULT_SKIP = new Set(["node_modules", ".git", "dist", "coverage", ".pnpm-store"]);

export type WalkFilterOptions = {
	root: string;
	include?: string[];
	exclude?: string[];
	skipDirs?: Set<string>;
};

function toPosix(p: string): string {
	return p.split(sep).join("/");
}

function matchesPrefix(rel: string, patterns: string[] | undefined): boolean {
	if (!patterns || patterns.length === 0) return false;
	const posix = toPosix(rel);
	return patterns.some((p) => {
		const norm = toPosix(p).replace(/\/$/, "");
		return posix === norm || posix.startsWith(`${norm}/`);
	});
}

function allowed(rel: string, include?: string[], exclude?: string[]): boolean {
	if (matchesPrefix(rel, exclude)) return false;
	if (include && include.length > 0) {
		const posix = toPosix(rel);
		return include.some((p) => {
			const norm = toPosix(p).replace(/\/$/, "");
			return posix === norm || posix.startsWith(`${norm}/`) || norm.startsWith(`${posix}/`);
		});
	}
	return true;
}

function isManifestPath(rel: string): boolean {
	const posix = toPosix(rel);
	if (posix === "tools/manifest.json" || posix.endsWith("/tools/manifest.json")) return true;
	if (posix.endsWith("agent.tools.yaml") || posix.endsWith("agent.tools.yml")) return true;
	if (/\/tools\/[^/]+\.(json|yaml|yml)$/.test(posix)) return true;
	if (/tools.*\.json$/i.test(posix) && posix.includes("tools")) return true;
	return false;
}

/** Walk root for manifest files with include/exclude prefix filters. */
export function walkManifestFiles(opts: WalkFilterOptions): string[] {
	const skip = opts.skipDirs ?? DEFAULT_SKIP;
	const out: string[] = [];

	function walk(dir: string): void {
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const name of entries) {
			const full = join(dir, name);
			let st;
			try {
				st = statSync(full);
			} catch {
				continue;
			}
			const rel = relative(opts.root, full);
			if (st.isDirectory()) {
				if (skip.has(name)) continue;
				if (!allowed(rel, opts.include, opts.exclude)) continue;
				walk(full);
			} else if (st.isFile() && isManifestPath(rel)) {
				if (!allowed(rel, opts.include, opts.exclude)) continue;
				out.push(full);
			}
		}
	}

	walk(opts.root);
	return out.sort();
}
