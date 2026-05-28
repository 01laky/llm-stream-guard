# How llm-stream-guard compares

**Status:** **0.0.1 scaffold** — passthrough API; guard rules in **0.1.0**. See [`proposal.MD`](./proposal.MD).

## At a glance

|                                | llm-stream-guard              | Enterprise middleware (ShieldStack, etc.) | llm-stream-assemble         | DIY regex proxy |
| ------------------------------ | ----------------------------- | ----------------------------------------- | --------------------------- | --------------- |
| **Question**                   | What may go downstream?       | Platform-specific                         | What did the provider send? | Ad hoc          |
| **Byte mode**                  | `createByteGuard()`           | Common                                    | N/A (parse first)           | Manual          |
| **Event mode**                 | `guardEvents()` + tool policy | Varies                                    | N/A (assembly only)         | Rare            |
| **Tool allowlist / arg block** | First-class                   | Varies                                    | Out of scope                | Manual          |
| **Runtime deps**               | Zero                          | Varies                                    | Zero                        | None            |
| **Provider adapters**          | No (map events in app)        | Sometimes                                 | Yes (7 adapters)            | No              |

## When to use guard

- **LLM proxy** forwarding SSE to browsers — byte mode redaction + error sanitization.
- **Agent runtime** — event mode tool gate before execution.
- **Drop-in security layer** without an enterprise platform.

## When not to use guard

- **Parsing provider SSE** — use [llm-stream-assemble](https://github.com/01laky/llm-stream-assemble) or your parser first.
- **HTTP to provider, auth, retries** — your app or AI SDK.
- **Tool execution, memory, UI** — out of scope.

## Pairing with assemble

```
upstream.body → assembleStream(adapter) → map to GuardEvent → guardEvents() → client
```

No npm dependency required — see v0.3 integration cookbook.

## Related

- [llm-stream-assemble comparison](https://github.com/01laky/llm-stream-assemble/blob/main/docs/comparison.md)
- [Proposal — competition / positioning](./proposal.MD#competition--positioning)
