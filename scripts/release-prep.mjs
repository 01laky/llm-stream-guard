#!/usr/bin/env node
/**
 * Pre-release checks for llm-stream-guard.
 * Does not tag, publish, or mutate git — prints actionable next steps.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(path) {
	return readFileSync(join(rootDir, path), "utf8");
}

function ok(message) {
	console.log(`OK: ${message}`);
}

function warn(message) {
	console.warn(`WARN: ${message}`);
}

function npmLatestVersion() {
	try {
		return execFileSync("npm", ["view", "llm-stream-guard", "version"], {
			cwd: rootDir,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return null;
	}
}

function gitStatusPorcelain() {
	try {
		return execFileSync("git", ["status", "--porcelain"], {
			cwd: rootDir,
			encoding: "utf8",
		}).trim();
	} catch {
		return null;
	}
}

function gitHead() {
	try {
		return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
			cwd: rootDir,
			encoding: "utf8",
		}).trim();
	} catch {
		return "unknown";
	}
}

const pkg = JSON.parse(read("package.json"));
const version = pkg.version;
const tag = `v${version}`;
const readme = read("README.md");
const changelog = read("CHANGELOG.md");
const errors = [];

console.log(`Release prep for llm-stream-guard@${version} (git ${gitHead()})\n`);

if (pkg.private === true) {
	errors.push('package.json has "private": true — remove before npm publish');
} else {
	ok("package.json is not private");
}

if (!readme.includes(`Stable \`${version}\``)) {
	errors.push(`README.md missing Stable \`${version}\` status line`);
} else {
	ok(`README stable status references ${version}`);
}

const stableStatusBadge = `status-stable_${version}-brightgreen`;
if (!readme.includes(stableStatusBadge)) {
	errors.push(`README.md missing ${stableStatusBadge} status badge`);
} else {
	ok(`README status badge is stable green (${stableStatusBadge})`);
}

const coreBadge = `core-${version}-brightgreen`;
if (!readme.includes(coreBadge)) {
	errors.push(`README.md missing ${coreBadge} core badge`);
} else {
	ok(`README core badge matches version (${coreBadge})`);
}

if (/status-0\.|_scaffold-orange|core-0\.[0-9]+\.x-orange/i.test(readme)) {
	errors.push("README.md has scaffold-orange badges — use stable green for 0.2.0+");
}

if (!changelog.includes(`## [${version}]`)) {
	errors.push(`CHANGELOG.md missing ## [${version}]`);
} else {
	ok(`CHANGELOG has ## [${version}]`);
}

const distFiles = ["dist/index.js", "dist/index.cjs", "dist/index.d.ts"];
for (const file of distFiles) {
	if (!existsSync(join(rootDir, file))) {
		errors.push(`missing build artifact ${file} — run pnpm build`);
	}
}
if (errors.every((message) => !message.startsWith("missing build"))) {
	ok("dist build artifacts present");
}

if (Object.keys(pkg.dependencies ?? {}).length > 0) {
	errors.push("package.json must have zero runtime dependencies");
} else {
	ok("zero runtime dependencies");
}

const npmVersion = npmLatestVersion();
if (npmVersion === null) {
	warn("could not read npm registry version (offline or package unpublished)");
} else if (npmVersion === version) {
	warn(`npm already lists ${version} — skip publish unless republishing`);
} else {
	ok(`npm latest is ${npmVersion}; local is ${version}`);
}

function readmeTestsBadgeCount() {
	const match = readme.match(/tests-(\d+)_passing/);
	return match ? Number(match[1]) : null;
}

function vitestPassedCount() {
	try {
		const output = execFileSync("pnpm", ["test"], {
			cwd: rootDir,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		const match = output.match(/Tests\s+(\d+)\s+passed/);
		return match ? Number(match[1]) : null;
	} catch (error) {
		const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
		const match = output.match(/Tests\s+(\d+)\s+passed/);
		return match ? Number(match[1]) : null;
	}
}

const badgeCount = readmeTestsBadgeCount();
const passedCount = vitestPassedCount();
if (badgeCount === null) {
	errors.push("README.md missing tests-N_passing badge");
} else if (passedCount === null) {
	warn("could not parse vitest passed count from pnpm test output");
} else if (badgeCount !== passedCount) {
	errors.push(
		`README tests badge (${badgeCount}) does not match vitest passed count (${passedCount}) (LSG-REL04)`,
	);
} else {
	ok(`README tests badge matches vitest count (${passedCount}) (LSG-REL04)`);
}

const dirty = gitStatusPorcelain();
if (dirty) {
	warn(
		"working tree has uncommitted changes:\n" +
			dirty
				.split("\n")
				.map((line) => `  ${line}`)
				.join("\n"),
	);
} else {
	ok("git working tree clean");
}

try {
	const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
		cwd: rootDir,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	const [pack] = JSON.parse(output);
	const paths = pack.files.map((file) => file.path);
	for (const required of ["dist/index.js", "README.md", "LICENSE"]) {
		if (!paths.includes(required)) {
			errors.push(`npm pack missing ${required}`);
		}
	}
	if (errors.every((message) => !message.startsWith("npm pack missing"))) {
		ok(`npm pack dry-run includes ${paths.length} files`);
	}
	if (!paths.includes("schemas/README.md")) {
		errors.push("npm pack missing schemas/README.md");
	}
} catch (error) {
	errors.push(`npm pack --dry-run failed: ${error.message}`);
}

if (!existsSync(join(rootDir, "test/docs-readiness.test.ts"))) {
	errors.push("missing test/docs-readiness.test.ts (LSG-DOC suite)");
}
if (!readme.includes("docs/troubleshooting.md")) {
	errors.push("README.md must link docs/troubleshooting.md (REL43)");
}
if (!existsSync(join(rootDir, "SECURITY.md"))) {
	errors.push("missing SECURITY.md at repo root");
}
if (!existsSync(join(rootDir, "schemas/README.md"))) {
	errors.push("missing schemas/README.md");
}
const verifyScript = pkg.scripts?.verify ?? "";
if (!verifyScript.includes("doc:check-links")) {
	errors.push("package.json verify script must include doc:check-links");
} else {
	ok("doc gates (LSG-REL43): docs-readiness, troubleshooting link, SECURITY.md, schemas README");
}

if (!pkg.scripts?.["test:count-gate"]) {
	errors.push("missing test:count-gate script (REL51)");
}
if (!existsSync(join(rootDir, "scripts/test-count-gate.mjs"))) {
	errors.push("missing scripts/test-count-gate.mjs");
}
if (!existsSync(join(rootDir, "test/byte-split-matrix.test.ts"))) {
	errors.push("missing test/byte-split-matrix.test.ts (Phase 9)");
}
if (!existsSync(join(rootDir, "docs/img/test-fortress.mmd"))) {
	errors.push("missing docs/img/test-fortress.mmd");
}
for (const file of [
	"test/stream-reporting.test.ts",
	"test/sarif-stable.test.ts",
	"test/schema-contract.test.ts",
	"test/doctor.test.ts",
	"test/phase10-report-matrix.test.ts",
	"test/security-negative-b.test.ts",
	"docs/api-stability.md",
	"docs/threat-model.md",
	"docs/migration-0.x-to-1.0.md",
	"schemas/scan-report-v1.json",
	"schemas/static-scan-report-v1.json",
	"schemas/stream-guard-summary-v1.json",
	"scripts/grep-stable-gate.mjs",
	"scripts/check-policy-profiles.mjs",
]) {
	if (!existsSync(join(rootDir, file))) {
		errors.push(`missing ${file} (REL63–REL80 Phase 10)`);
	}
}
if (!pkg.scripts?.["gate:stable-language"]) {
	errors.push("missing gate:stable-language script (REL67)");
}
if (!pkg.scripts?.["fixtures:check-profiles"]) {
	errors.push("missing fixtures:check-profiles script (REL68)");
}

if (errors.length > 0) {
	console.error("\nRelease prep failed:");
	for (const message of errors) console.error(`  - ${message}`);
	process.exitCode = 1;
} else {
	console.log("\nRelease prep passed.");
}

console.log(`
Next steps (manual):
  1. pnpm verify
  2. git tag ${tag} && git push origin ${tag}
  3. npm publish
  4. GitHub Release from CHANGELOG ## [${version}]
     Draft: .local-playground/release-${version}.md (if present)
  5. npm view llm-stream-guard version
`);

if (process.exitCode === 1) process.exit(1);
