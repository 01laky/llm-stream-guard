import { defineConfig } from "tsup";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
		entry: { cli: "src/cli/main.ts" },
		clean: false,
		onSuccess: async () => {
			for (const file of ["dist/cli.js", "dist/cli.cjs"]) {
				const path = join(process.cwd(), file);
				try {
					const content = readFileSync(path, "utf8");
					if (!content.startsWith("#!")) {
						writeFileSync(path, `#!/usr/bin/env node\n${content}`);
					}
				} catch {
					/* ignore */
				}
			}
		},
	},
]);
