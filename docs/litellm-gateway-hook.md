# LiteLLM / gateway byte hook

**Status:** **0.9.0** — attach byte guard on gateway streaming response.

LiteLLM and similar gateways expose the provider **response body** as a stream. Insert `createByteGuard()` on that body before returning to the client — same as any HTTP proxy.

## Pseudocode

```python
# Python gateway middleware (conceptual)
from litellm import completion

async def guarded_streaming_completion(...):
    response = await completion(..., stream=True)
    # Wrap the async byte iterator your gateway returns to clients with
    # an equivalent of createByteGuard({ redactSecrets: true, sanitizeErrors: true })
    return guard_transform(response.stream)
```

## TypeScript gateway (fetch-shaped)

```ts
import { createByteGuard } from "llm-stream-guard";

async function proxyChat(upstream: Response): Promise<Response> {
	if (!upstream.body) return upstream;
	return new Response(
		upstream.body.pipeThrough(
			createByteGuard({ redactSecrets: true, sanitizeErrors: true, mode: "warn" }),
		),
		{ headers: upstream.headers },
	);
}
```

**Policy equivalent:** `policies/proxy-strict.json` or `loadPolicy("./policies/proxy-strict.json")` + `createGuardFromPolicy().createByteGuard()`.

No `litellm` npm dependency in llm-stream-guard core.

See [integration cookbook §10](./integration-cookbook.md#10-litellm--gateway).
