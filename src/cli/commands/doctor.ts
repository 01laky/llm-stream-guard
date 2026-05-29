import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifestFile } from "../../audit/validate-manifest.js";
import { PACKAGE_VERSION } from "../../version.js";
import { CliExit } from "../exit-codes.js";
import { cmdValidate } from "./validate.js";

function packageRoot(start: string): string {
	let dir = start;
	for (;;) {
		if (existsSync(join(dir, "package.json"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return start;
		dir = parent;
	}
}

const rootDir = packageRoot(dirname(fileURLToPath(import.meta.url)));

function resolveCheckPath(...segments: string[]): string {
	const cwdPath = join(process.cwd(), ...segments);
	if (existsSync(cwdPath)) return cwdPath;
	return join(rootDir, ...segments);
}

type Check = { name: string; ok: boolean; detail: string };

function nodeVersionOk(): Check {
	const major = Number(process.version.slice(1).split(".")[0]);
	return {
		name: "node",
		ok: major >= 18,
		detail: process.version,
	};
}

function distOk(): Check {
	const cli = join(rootDir, "dist/cli.js");
	const index = join(rootDir, "dist/index.js");
	const ok = existsSync(cli) && existsSync(index);
	return {
		name: "dist",
		ok,
		detail: ok ? "dist/cli.js + dist/index.js" : "missing dist — run pnpm build",
	};
}

export async function cmdDoctor(rest: string[], json: boolean): Promise<number> {
	const policy = rest[0] ?? resolveCheckPath("policies", "agent-gate.json");
	const checks: Check[] = [nodeVersionOk(), distOk()];

	if (checks[1]!.ok) {
		const validateCode = await cmdValidate([policy], false);
		checks.push({
			name: "policy",
			ok: validateCode === CliExit.ok,
			detail: policy,
		});
		const manifest = resolveCheckPath("tools", "manifest.json");
		const manifestErrors = validateManifestFile(manifest);
		checks.push({
			name: "manifest",
			ok: manifestErrors.length === 0,
			detail: manifest,
		});
	}

	checks.push({
		name: "version",
		ok: Boolean(PACKAGE_VERSION),
		detail: PACKAGE_VERSION,
	});

	const ok = checks.every((c) => c.ok);

	if (json) {
		console.log(JSON.stringify({ ok, checks }, null, 2));
	} else {
		for (const c of checks) {
			console.log(`${c.ok ? "OK" : "FAIL"} ${c.name}: ${c.detail}`);
		}
	}

	return ok ? CliExit.ok : CliExit.internal;
}
