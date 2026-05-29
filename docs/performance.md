# Performance

**Status:** **1.0.0** — orientation for proxy and agent pipelines. Numbers are smoke-tier, not production SLAs.

---

## Local smoke budget

Run:

```bash
pnpm bench:smoke
```

Typical dev-machine results (order of magnitude, not guarantees):

| Scenario                       | Budget (smoke) |
| ------------------------------ | -------------- |
| Byte redact 1 MB synthetic SSE | < 500 ms wall  |
| Event guard 10k text deltas    | < 300 ms wall  |
| Static audit default repo root | < 2 s wall     |

CI does not fail on bench regressions today (`bench:smoke` is maintainer-local). See [testing-strategy.md](./testing-strategy.md#phase-10-release).

---

## Design choices that affect latency

- **Zero runtime dependencies** — no ajv/Zod on hot paths; validators are hand-written.
- **Byte lookback cap** — 128-byte rolling buffer for split secrets (bounded memory).
- **Sync transforms only** — no `await` per chunk in `guardEvents` or byte pipeline.
- **WeakMap context state** — O(1) per-stream overhead without polluting public `GuardContext`.

---

## When to use byte vs event

| Workload                  | Recommendation                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| High-throughput proxy     | Byte mode on raw body — skip JSON parse                                                      |
| Agent gate with few tools | Event mode — precise `tool_call.done` policy                                                 |
| Dual path                 | Byte to client, event side-channel for audit metrics ([cookbook](./integration-cookbook.md)) |

---

## Tuning

- Prefer `audit` mode when violations should not block hot paths but must be counted in `onFinish`.
- Batch offline scans with `llm-stream-guard scan --json` instead of in-process guards when latency is irrelevant.
