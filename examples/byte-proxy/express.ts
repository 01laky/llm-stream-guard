/**
 * Express byte-mode proxy — Node 18+ Web Streams bridge (LSG-CBK03).
 * Prefer Hono/Fastify or raw fetch handlers when possible; Express needs Readable.fromWeb.
 */
import express from "express";
import { Readable } from "node:stream";
import type { Writable } from "node:stream";
import { createByteGuard } from "llm-stream-guard";

/**
 * Minimal Express route that guards upstream bytes before sending to the client.
 * Uses Readable.toWeb → TransformStream → Readable.fromWeb for Node stream compatibility.
 */
export function registerExpressByteProxy(
	app: ReturnType<typeof express>,
	providerUrl: string,
	apiKey: string,
): void {
	app.get("/chat/stream", async (_req, res) => {
		const upstream = await fetch(providerUrl, {
			headers: { Authorization: `Bearer ${apiKey}` },
		});

		if (!upstream.ok || !upstream.body) {
			res.status(502).json({ error: "upstream failed" });
			return;
		}

		const guarded = upstream.body.pipeThrough(
			createByteGuard({ redactSecrets: true, sanitizeErrors: true, mode: "block" }),
		);

		res.setHeader("Content-Type", "text/event-stream");
		res.setHeader("Cache-Control", "no-cache");

		// Node 18+: convert Web ReadableStream back to Node Readable for Express res.send/pipe.
		const nodeStream = Readable.fromWeb(guarded as import("node:stream/web").ReadableStream);
		// Express `res` is a Node Writable; stub types use a minimal Response shape for the recipe.
		nodeStream.pipe(res as unknown as Writable);
	});
}
