import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const fields = ["dependencies", "optionalDependencies", "peerDependencies"];

for (const field of fields) {
	const keys = Object.keys(pkg[field] ?? {});
	if (keys.length > 0) {
		console.error(`${field} must be empty:`, keys);
		process.exit(1);
	}
}

console.log("OK: zero runtime, optional, and peer dependencies");
