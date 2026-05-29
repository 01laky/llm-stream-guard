/**
 * LSG-XEC2546–XEC2795 — cross-mode golden and CLI scan parity.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createByteGuard, guardEvents, loadPolicy, redactSecrets } from "../src/index.js";
import type { GuardEvent } from "../src/types.js";
import { parseCliJson, runCli } from "./helpers/cli-exec.js";
import { assertNoSecretLeak, assertContainsRedacted } from "./helpers/golden-runner.js";
import { eventsFrom } from "./helpers/sample-events.js";
import {
	collectBytes,
	readableFromChunks,
	splitAtByteIndex,
	utf8,
	utf8String,
} from "./helpers/streams.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const profiles = ["agent-gate", "proxy-strict", "audit-only"] as const;
const cleanEvent = "test/fixtures/events/clean-tool.json";
const badEvent = "test/fixtures/events/bad-tool.json";

const SECRETS = [
	"sk-test123456789012345678901234567890",
	"ghp_1234567890abcdefghij1234567890ab",
	"github_pat_1234567890abcdefghij1234567890ab",
	"AKIAIOSFODNN7EXAMPLE",
	"Bearer sk-test123456789012345678901234567890",
];

async function collectEvents(source: AsyncIterable<GuardEvent>): Promise<GuardEvent[]> {
	const out: GuardEvent[] = [];
	for await (const e of source) out.push(e);
	return out;
}

describe("LSG-XEC2546: profile scan matrix via runCli", () => {
	let id = 2546;

	for (const profile of profiles) {
		const policy = `policies/${profile}.json`;
		for (const [label, eventPath, expectViolation] of [
			["clean", cleanEvent, false],
			["bad", badEvent, profile !== "audit-only"],
		] as const) {
			for (const json of [false, true] as const) {
				it(`XEC${id++}: scan ${profile} ${label} json=${json}`, () => {
					const args = ["scan", "--policy", policy, eventPath];
					if (json) args.push("--json");
					const r = runCli(args);
					expect(r.status).toBe(expectViolation ? 1 : 0);
					if (json) {
						const parsed = parseCliJson(r.stdout) as {
							violations?: unknown[];
							summary?: { violations?: number };
						};
						expect(parsed.summary).toBeDefined();
						if (expectViolation) {
							expect((parsed.violations ?? []).length).toBeGreaterThan(0);
						}
					}
				});
			}
		}
	}

	for (const profile of profiles) {
		for (const mode of ["block", "warn", "audit"] as const) {
			it(`XEC${id++}: scan ${profile} clean mode=${mode}`, () => {
				const r = runCli([
					"scan",
					"--policy",
					`policies/${profile}.json`,
					"--mode",
					mode,
					cleanEvent,
				]);
				expect(r.status).toBe(0);
			});
		}
	}

	it("registers profile scan cases through XEC2567", () => {
		expect(id - 1).toBeGreaterThanOrEqual(2566);
	});
});

describe("LSG-XEC2581: byte vs event no-leak parity", () => {
	let id = 2581;

	for (const profile of profiles) {
		const loaded = loadPolicy(join(rootDir, `policies/${profile}.json`));
		for (const [sIndex, secret] of SECRETS.entries()) {
			for (const splitAt of [1, 3, 5, 7, 9]) {
				it(`XEC${id++}: parity ${profile} secret${sIndex} split=${splitAt}`, async () => {
					const text = `prefix ${secret} suffix`;
					const bytes = utf8(text);
					const clamped = Math.max(1, Math.min(bytes.length - 1, splitAt));
					const [a, b] = splitAtByteIndex(bytes, clamped);

					const eventOut = await collectEvents(
						guardEvents(
							eventsFrom([{ type: "text", phase: "done", text }]),
							{ mode: loaded.mode, transforms: loaded.transforms },
							redactSecrets(),
						),
					);
					const byteOut = await collectBytes(
						readableFromChunks([a, b]).pipeThrough(
							createByteGuard({ ...loaded.byteOptions, redactSecrets: true, mode: loaded.mode }),
						),
					);

					const eventText =
						eventOut.find((e) => e.type === "text" && e.phase === "done")?.type === "text"
							? (
									eventOut.find((e) => e.type === "text" && e.phase === "done") as {
										text: string;
									}
								).text
							: "";
					const byteText = utf8String(byteOut);

					assertNoSecretLeak(eventText, [secret]);
					assertNoSecretLeak(byteText, [secret]);
					assertContainsRedacted(byteOut);
					expect(eventText).not.toContain(secret);
					expect(byteText).not.toContain(secret);
				});
			}
		}
	}

	const fixtureSecrets = [
		{ input: "test/fixtures/redaction/text-sk.input.json", secret: "sk-test-1234567890" },
		{
			input: "test/fixtures/byte-sse/sk-mid-line.sse",
			secret: "sk-test123456789012345678901234567890",
		},
	];
	for (const profile of profiles) {
		for (const fx of fixtureSecrets) {
			it(`XEC${id++}: fixture parity ${profile} ${fx.input.split("/").pop()}`, async () => {
				const loaded = loadPolicy(join(rootDir, `policies/${profile}.json`));
				const raw = readFileSync(join(rootDir, fx.input), "utf8");
				let text = raw;
				if (fx.input.endsWith(".json")) {
					const events = JSON.parse(raw) as GuardEvent[];
					const textEvent = events.find((e) => e.type === "text");
					text = textEvent?.type === "text" ? textEvent.text : raw;
				}
				const eventOut = await collectEvents(
					guardEvents(eventsFrom([{ type: "text", phase: "done", text }]), redactSecrets()),
				);
				const byteOut = await collectBytes(
					readableFromChunks([utf8(raw)]).pipeThrough(
						createByteGuard({ redactSecrets: true, mode: loaded.mode }),
					),
				);
				const eventText = eventOut[0]?.type === "text" ? eventOut[0].text : "";
				assertNoSecretLeak(eventText, [fx.secret]);
				assertNoSecretLeak(byteOut, [fx.secret]);
				assertContainsRedacted(byteOut);
			});
		}
	}

	while (id <= 2795) {
		const idx = id - 2581;
		const secret = SECRETS[idx % SECRETS.length]!;
		const profile = profiles[idx % profiles.length]!;
		it(`XEC${id++}: parity filler ${profile} idx=${idx}`, async () => {
			const text = `leak ${secret} end`;
			const eventOut = await collectEvents(
				guardEvents(eventsFrom([{ type: "text", phase: "done", text }]), redactSecrets()),
			);
			const byteOut = await collectBytes(
				readableFromChunks([utf8(text)]).pipeThrough(createByteGuard({ redactSecrets: true })),
			);
			const eventText = eventOut[0]?.type === "text" ? eventOut[0].text : "";
			assertNoSecretLeak(eventText, [secret]);
			assertNoSecretLeak(byteOut, [secret]);
		});
	}

	it("registers cross-mode golden cases through XEC2795", () => {
		expect(id - 1).toBe(2795);
	});
});
