import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
const cliPath = join(rootDir, "dist/cli.js");

export type CliResult = {
	status: number | null;
	stdout: string;
	stderr: string;
};

export function ensureCliBuilt(): void {
	if (!existsSync(cliPath)) {
		execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
	}
}

export function runCli(args: string[], input?: string): CliResult {
	ensureCliBuilt();
	const r = spawnSync(process.execPath, [cliPath, ...args], {
		cwd: rootDir,
		encoding: "utf8",
		input,
		env: { ...process.env, FORCE_COLOR: "0" },
	});
	return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

export function runCliJson(args: string[]): { status: number | null; json: unknown } {
	const r = runCli([...args, "--json"]);
	return { status: r.status, json: JSON.parse(r.stdout) };
}

export function parseCliJson(stdout: string): unknown {
	return JSON.parse(stdout);
}
