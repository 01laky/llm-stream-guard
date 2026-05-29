#!/usr/bin/env node
/**
 * onFinish summary example — run after pnpm build.
 */
import { createByteGuard } from "../../dist/index.js";

const enc = new TextEncoder();
let summary;

const guard = createByteGuard({
	redactSecrets: true,
	policyVersion: "smoke-1.0",
	mode: "audit",
	onFinish: (s) => {
		summary = s;
	},
});

const { writable, readable } = guard;
const writer = writable.getWriter();
await writer.write(enc.encode("data: sk-proj-abcdefghijklmnopqrstuvwxyz1234567890\n\n"));
await writer.close();

const reader = readable.getReader();
while (true) {
	const { done } = await reader.read();
	if (done) break;
}

console.log(JSON.stringify(summary, null, 2));
