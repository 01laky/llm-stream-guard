/**
 * Hono byte-mode proxy — pipes upstream SSE through createByteGuard (LSG-CBK02 / LSG-CBK12).
 * Install hono in your app; this repo uses stub types only.
 */
import { Hono } from "hono";
import { createByteGuard } from "llm-stream-guard";
import type { Violation } from "llm-stream-guard";

/** Audit hook — forward violations to your logger or metrics backend. */
function logViolation(v: Violation): void {
	console.error(`[guard] ${v.rule}: ${v.message}`);
}

/**
 * GET /chat/stream — fetch upstream provider SSE and redact secrets in flight.
 * Policy equivalent: policies/proxy-strict.json (byte.redactSecrets + sanitizeErrors).
 */
export function createHonoByteProxyApp(
	providerUrl: string,
	apiKey: string,
): ReturnType<typeof Hono> {
	const app = Hono();

	app.get("/chat/stream", async (c) => {
		const upstream = await fetch(providerUrl, {
			headers: { Authorization: `Bearer ${apiKey}` },
		});

		if (!upstream.ok || !upstream.body) {
			return c.json({ error: "upstream failed" }, 502);
		}

		const guarded = upstream.body.pipeThrough(
			createByteGuard({
				redactSecrets: true,
				sanitizeErrors: true,
				mode: "warn",
				onViolation: logViolation,
			}),
		);

		return new Response(guarded, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
			},
		});
	});

	return app;
}
