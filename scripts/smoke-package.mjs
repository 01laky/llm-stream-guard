import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const temp = mkdtempSync(join(tmpdir(), "llm-stream-guard-smoke-"));
const forbidden = ["src/", "test/", "prompts/", ".cursor/", ".github/", "docs/", ".githooks/"];

try {
	execFileSync("npm", ["pack", "--pack-destination", temp], { cwd: root, stdio: "pipe" });
	const tarball = readdirSync(temp).find((file) => file.endsWith(".tgz"));
	if (!tarball) throw new Error("npm pack did not produce a tarball");

	const listing = execFileSync("tar", ["-tzf", join(temp, tarball)], { encoding: "utf8" });
	const paths = listing.split("\n").filter(Boolean);

	for (const path of paths) {
		const normalized = path.replace(/^package\//, "");
		if (normalized === "package.json") continue;
		if (normalized === "LICENSE" || normalized === "README.md") continue;
		if (normalized.startsWith("dist/")) continue;
		if (normalized.startsWith("schemas/")) continue;
		throw new Error(`unexpected file in npm pack: ${path}`);
	}

	for (const prefix of forbidden) {
		if (paths.some((path) => path.includes(prefix))) {
			throw new Error(`forbidden path prefix in npm pack: ${prefix}`);
		}
	}

	writeFileSync(
		join(temp, "package.json"),
		JSON.stringify({ type: "module", dependencies: {} }, null, 2),
	);

	execFileSync("npm", ["install", "--ignore-scripts", join(temp, tarball)], {
		cwd: temp,
		stdio: "pipe",
	});

	writeFileSync(
		join(temp, "esm.mjs"),
		`
import { guardEvents, createByteGuard, createGuardContext, pipeGuard } from "llm-stream-guard";
if (typeof guardEvents !== "function") throw new Error("guardEvents ESM import failed");
if (typeof createByteGuard !== "function") throw new Error("createByteGuard ESM import failed");
if (typeof createGuardContext !== "function") throw new Error("createGuardContext ESM import failed");
if (typeof pipeGuard !== "function") throw new Error("pipeGuard ESM import failed");
`,
	);

	writeFileSync(
		join(temp, "cjs.cjs"),
		`
const { guardEvents, createByteGuard, createGuardContext, pipeGuard } = require("llm-stream-guard");
if (typeof guardEvents !== "function") throw new Error("guardEvents CJS import failed");
if (typeof createByteGuard !== "function") throw new Error("createByteGuard CJS import failed");
if (typeof createGuardContext !== "function") throw new Error("createGuardContext CJS import failed");
if (typeof pipeGuard !== "function") throw new Error("pipeGuard CJS import failed");
`,
	);

	execFileSync("node", ["esm.mjs"], { cwd: temp, stdio: "pipe" });
	execFileSync("node", ["cjs.cjs"], { cwd: temp, stdio: "pipe" });

	const cliPath = join(temp, "node_modules", "llm-stream-guard", "dist", "cli.js");
	execFileSync(
		process.execPath,
		[cliPath, "validate", join(root, "test/fixtures/policies/valid/minimal.json")],
		{ stdio: "pipe" },
	);

	const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	if (!Array.isArray(pkg.files) || !pkg.files.includes("dist")) {
		throw new Error('package.json "files" must include dist');
	}

	console.log("OK: package smoke test passed");
} finally {
	rmSync(temp, { recursive: true, force: true });
}
