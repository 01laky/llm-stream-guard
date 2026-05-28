#!/usr/bin/env node
import { appendFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const actionDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(actionDir, "..");

function parseCli(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith("--")) {
			const key = a.slice(2);
			const next = argv[i + 1];
			if (next && !next.startsWith("--")) {
				out[key] = next;
				i++;
			} else {
				out[key] = "true";
			}
		}
	}
	return out;
}

function input(name, cli, env = process.env) {
	const cliVal = cli[name];
	if (cliVal !== undefined) return String(cliVal);
	const envKey = `INPUT_${name.replace(/-/g, "_").toUpperCase()}`;
	return env[envKey] ?? "";
}

function setOutput(name, value) {
	const file = process.env.GITHUB_OUTPUT;
	if (!file) return;
	appendFileSync(file, `${name}=${value}\n`);
}

function resolveCli() {
	if (existsSync(join(repoRoot, "dist/cli.js"))) {
		return [process.execPath, [join(repoRoot, "dist/cli.js")]];
	}
	return ["npx", ["--yes", "llm-stream-guard@0.5.0"]];
}

function runGuard(args, cwd = repoRoot) {
	const [cmd, prefix] = resolveCli();
	const r = spawnSync(cmd, [...prefix, ...args], { cwd, encoding: "utf8", env: process.env });
	return r;
}

function annotate(text, severity = "error") {
	if (!text) return;
	for (const line of text.split("\n")) {
		const m = line.match(/@ ([^:]+): (.+)$/);
		if (m) console.log(`::${severity} file=${m[1]},line=1::${m[2]}`);
	}
}

function main() {
	const cli = parseCli(process.argv.slice(2));
	const policy = input("policy", cli);
	const policyDir = input("policy-dir", cli);
	const baselinePolicy = input("baseline-policy", cli);
	const scanPaths = input("scan-paths", cli);
	const staticRoot = input("static-root", cli) || ".";
	const manifest = input("manifest", cli);
	const include = input("include", cli);
	const exclude = input("exclude", cli);
	const failOn = input("fail-on", cli) || "any";
	const annotateEnabled = input("annotate", cli);
	const sarifOut = input("sarif-out", cli);
	const mode = input("mode", cli);

	if (mode) process.env.GUARD_MODE = mode;

	let violations = 0;
	let driftCount = 0;
	let staticFindings = 0;
	let policyChanged = "false";
	let failed = false;

	if (baselinePolicy && policy) {
		const diff = runGuard([
			"diff",
			resolve(repoRoot, baselinePolicy),
			resolve(repoRoot, policy),
			"--check",
		]);
		policyChanged = diff.status === 0 ? "false" : "true";
		if (diff.status !== 0 && (failOn === "any" || failOn === "drift")) failed = true;
	}

	if (scanPaths && policy) {
		const paths = scanPaths
			.split(/[,\n]/)
			.map((p) => p.trim())
			.filter(Boolean);
		const scan = runGuard([
			"scan",
			"--policy",
			resolve(repoRoot, policy),
			"--json",
			...paths.map((p) => resolve(repoRoot, p)),
		]);
		if (scan.stdout) {
			try {
				const report = JSON.parse(scan.stdout);
				violations = report.summary?.violations ?? 0;
			} catch {
				violations = scan.status === 1 ? 1 : 0;
			}
		}
		if (scan.status !== 0 && scan.status !== 1) {
			console.error(scan.stderr || scan.stdout);
			process.exit(3);
		}
		if (violations > 0 && (failOn === "any" || failOn === "violations")) failed = true;
	}

	const staticArgs = ["audit", "static", "--root", resolve(repoRoot, staticRoot)];
	if (policy) staticArgs.push("--policy", resolve(repoRoot, policy));
	if (policyDir) staticArgs.push("--policy-dir", resolve(repoRoot, policyDir));
	if (manifest) staticArgs.push("--manifest", resolve(repoRoot, manifest));
	if (include) staticArgs.push("--include", include);
	if (exclude) staticArgs.push("--exclude", exclude);
	if (sarifOut) staticArgs.push("--sarif-out", resolve(repoRoot, sarifOut));
	staticArgs.push("--json");

	const staticRun = runGuard(staticArgs);
	let staticReport = null;
	try {
		staticReport = JSON.parse(staticRun.stdout);
	} catch {
		/* text output */
	}

	if (staticReport?.summary) {
		driftCount = staticReport.summary.drift ?? 0;
		staticFindings =
			(staticReport.summary.drift ?? 0) +
			(staticReport.summary.dangerous ?? 0) +
			(staticReport.summary.blockToolArgs ?? 0);
	} else if (staticRun.status === 1) {
		staticFindings = 1;
		driftCount = 1;
	}

	if (annotateEnabled === "true" || annotateEnabled === "") {
		if (staticReport) {
			for (const f of [
				...(staticReport.drift ?? []),
				...(staticReport.dangerous ?? []),
				...(staticReport.blockToolArgs ?? []),
			]) {
				console.log(
					`::${f.severity === "error" ? "error" : "warning"} file=${f.file},line=${f.line ?? 1}::${f.message}`,
				);
			}
		} else {
			annotate(staticRun.stdout);
		}
	} else if (staticRun.stdout && !staticReport) {
		process.stdout.write(staticRun.stdout);
	}

	if (
		staticRun.status === 1 &&
		failOn !== "none" &&
		(failOn === "any" || failOn === "static" || failOn === "drift")
	) {
		failed = true;
	}
	if (staticRun.status !== 0 && staticRun.status !== 1) {
		console.error(staticRun.stderr || staticRun.stdout);
		process.exit(3);
	}

	setOutput("violations", String(violations));
	setOutput("drift-count", String(driftCount));
	setOutput("static-findings", String(staticFindings));
	setOutput("policy-changed", policyChanged);
	if (sarifOut) setOutput("sarif-path", resolve(repoRoot, sarifOut));

	if (failOn === "none") process.exit(0);
	process.exit(failed ? 1 : 0);
}

main();
