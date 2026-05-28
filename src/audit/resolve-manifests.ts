import { statSync } from "node:fs";
import { resolve } from "node:path";
import { walkManifestFiles } from "../shared/walk.js";
import type { StaticScanOptions } from "./static-scan.js";

const DEFAULT_EXCLUDE_PREFIXES = ["test/fixtures/policies/invalid"];

function mergeExclude(opts: StaticScanOptions): string[] {
	return [...DEFAULT_EXCLUDE_PREFIXES, ...(opts.exclude ?? [])];
}

/** Resolve manifest file paths for static scan (explicit path or directory walk). */
export function resolveManifestFiles(opts: StaticScanOptions): string[] {
	if (opts.manifest) {
		const m = resolve(opts.manifest);
		try {
			if (statSync(m).isFile()) return [m];
		} catch {
			return [];
		}
	}
	return walkManifestFiles({
		root: resolve(opts.root),
		...(opts.include ? { include: opts.include } : {}),
		exclude: mergeExclude(opts),
	});
}
