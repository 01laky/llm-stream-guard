/**
 * Cloudflare Workers byte proxy — no Node-only APIs (LSG-CBK04 / LSG-CBK26).
 */
import { createByteGuard } from "llm-stream-guard";

export interface Env {
	PROVIDER_URL: string;
	PROVIDER_KEY: string;
}

/**
 * Workers fetch handler: guard upstream SSE at the edge before returning to the browser.
 */
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname !== "/chat/stream") {
			return new Response("Not found", { status: 404 });
		}

		const upstream = await fetch(env.PROVIDER_URL, {
			headers: { Authorization: `Bearer ${env.PROVIDER_KEY}` },
		});

		if (!upstream.ok || !upstream.body) {
			return new Response("upstream error", { status: 502 });
		}

		const guarded = upstream.body.pipeThrough(
			createByteGuard({ redactSecrets: true, sanitizeErrors: true, mode: "warn" }),
		);

		return new Response(guarded, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
			},
		});
	},
};
