# How llm-stream-guard compares

**Status:** **Stable 0.8.2** — MVP rules + declarative policy + CLI + static manifest audit + GitHub Action + integration cookbook. See [`proposal.MD`](./proposal.MD).

## At a glance

|                                | llm-stream-guard              | Enterprise middleware (ShieldStack, etc.) | llm-stream-assemble         | DIY regex proxy |
| ------------------------------ | ----------------------------- | ----------------------------------------- | --------------------------- | --------------- |
| **Question**                   | What may go downstream?       | Platform-specific                         | What did the provider send? | Ad hoc          |
| **Byte mode**                  | `createByteGuard()`           | Common                                    | N/A (parse first)           | Manual          |
| **Event mode**                 | `guardEvents()` + tool policy | Varies                                    | N/A (assembly only)         | Rare            |
| **Tool allowlist / arg block** | First-class                   | Varies                                    | Out of scope                | Manual          |
| **Runtime deps**               | Zero                          | Varies                                    | Zero                        | None            |
| **Static manifest audit**      | `audit static` + Action       | Varies                                    | N/A                         | Manual          |
| **Provider adapters**          | No (map events in app)        | Sometimes                                 | Yes (7 adapters)            | No              |

## When to use guard

- **LLM proxy** forwarding SSE to browsers — byte mode redaction + error sanitization.
- **Agent runtime** — event mode tool gate before execution.
- **Drop-in security layer** without an enterprise platform.

## When not to use guard

- **Parsing provider SSE** — use [llm-stream-assemble](https://github.com/01laky/llm-stream-assemble) or your parser first. New to streaming? [Getting started](./getting-started.md).
- **HTTP to provider, auth, retries** — your app or AI SDK.
- **Tool execution, memory, UI** — out of scope.

See [Threat model stub](./threat-model-stub.md) for security scope boundaries.

## Pairing with assemble

```
upstream.body → assembleStream(adapter) → map to GuardEvent → guardEvents() → client
```

No npm dependency required — see v0.3 integration cookbook.

## Related

- [llm-stream-assemble comparison](https://github.com/01laky/llm-stream-assemble/blob/main/docs/comparison.md)
- [Proposal — competition / positioning](./proposal.MD#competition--positioning)
