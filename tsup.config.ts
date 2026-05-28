import { defineConfig } from "tsup";
import { cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const shared = {
	format: ["esm", "cjs"] as ("esm" | "cjs")[],
	dts: true,
	sourcemap: true,
	splitting: false,
	treeshake: true,
	target: "es2022" as const,
	outDir: "dist",
};

export default defineConfig([
	{
		...shared,
		entry: { index: "src/index.ts" },
		clean: true,
		onSuccess: async () => {
			const dest = join("dist", "policy", "profiles");
			mkdirSync(dest, { recursive: true });
			cpSync("src/policy/profiles", dest, { recursive: true });
		},
	},
	{
		...shared,
		entry: { "audit/index": "src/audit/index.ts" },
		clean: false,
	},
	{
		...shared,
		entry: { cli: "src/cli/main.ts" },
		clean: false,
		banner: { js: "#!/usr/bin/env node" },
	},
]);
