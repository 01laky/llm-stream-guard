# Testing strategy

**Status:** Phase 0 scaffold — passthrough pipeline tests. Phase 1 adds golden redaction and tool policy fixtures.

## Test ID prefixes

| Prefix    | Purpose                                                              |
| --------- | -------------------------------------------------------------------- |
| **LSG-S** | Scaffold smoke (build, deps, passthrough API)                        |
| **LSG-B** | Build artifacts and dist hygiene                                     |
| **LSG-E** | Extended edge-case wiring (chunk splits, pipeline order, SSE shapes) |
| **LSG-C** | Chunk-boundary byte redaction (Phase 1)                              |
| **LSG-R** | Redaction golden input → output (Phase 1)                            |
| **LSG-T** | Tool policy (Phase 1)                                                |

## Phase 0 coverage

### Event mode (`guardEvents`)

- Mixed `GuardEvent` union passthrough (text, tool_call, reasoning, error, finish).
- Empty source, config + spread transform overloads (transforms ignored until Phase 1).
- `applyGuardTransforms` wiring with `executeTransforms: true` in tests: identity, drop (`null`), expand (array).
- Concurrent iterators use independent contexts.

### Byte mode (`createByteGuard`)

- Two-chunk passthrough (TCP split wiring).
- Empty stream, 64-chunk stress, UTF-8 split mid-codepoint (bytes preserved; redaction in Phase 1).
- SSE-shaped payloads split at arbitrary byte indices (**LSG-E04**, **LSG-E07**).
- Independent `createByteGuard()` instances do not share state.

### Package hygiene

- `verify-zero-deps` — no runtime, optional, or peer dependencies.
- `smoke-package` — npm pack contains only `dist/`, `LICENSE`, `README.md`.
- **LSG-B** — `.d.ts` export surface, no leaked `../src` paths, ESM + CJS import smoke.

## Running tests

```bash
pnpm verify    # format + typecheck + build + test + smoke:package
pnpm test      # vitest only
```

## Phase 1 additions (planned)

- Golden fixtures under `test/fixtures/` with `REGISTRY.md`.
- Property-style random chunk split fuzz for secret patterns (**LSG-C**).
- Idempotency: double `guardEvents` must not double-redact.
- 1 MB byte smoke with bounded buffer growth.

See [CONTRIBUTING.md](../CONTRIBUTING.md) and [proposal.MD](./proposal.MD#test-strategy).
