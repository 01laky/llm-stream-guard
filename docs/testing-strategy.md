# Testing strategy

**Status:** Phase 0 scaffold — passthrough pipeline tests with exhaustive edge-case wiring. Phase 1 adds golden redaction and tool policy fixtures.

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
- Exhaustive variant matrix — empty text, unicode, nested args, optional fields (**LSG-E09**).
- Empty source, config + spread transform overloads; transforms **not invoked** in Phase 0 (**LSG-E08**).
- Stress: 2000 events, staggered async generator, source error propagation (**LSG-E10**).
- `applyGuardTransforms` wiring with `executeTransforms: true`: identity, drop (`null`), expand (array), empty-array drop, cartesian multi-step (**LSG-E05**, **LSG-E11**).
- Concurrent iterators use independent contexts (**LSG-E01**).

### Byte mode (`createByteGuard`)

- Two-chunk passthrough (TCP split wiring).
- Empty stream, 64-chunk stress, UTF-8 split mid-codepoint (bytes preserved; redaction in Phase 1).
- Every-byte split matrix on multi-script UTF-8 payload (**LSG-E13**).
- SSE-shaped payloads split at arbitrary byte indices (**LSG-E04**, **LSG-E07**).
- Binary non-UTF-8, CRLF frames, 1-byte chunks, chained guards (**LSG-E13**).
- Deterministic random split fuzz — 4 payloads × 5 seeds (**LSG-E14**).
- 1 MiB passthrough with 1024-byte chunks (**LSG-E17**).
- Independent `createByteGuard()` instances do not share state.

### `pipeGuard` / context

- Zero-arg identity, multi-transform compose, empty byte drop (**LSG-E12**).
- `createGuardContext` mode defaults, reset idempotency, WeakMap byte slot isolation (**LSG-E06**, **LSG-E15**).

### Package hygiene

- `verify-zero-deps` — no runtime, optional, or peer dependencies.
- `smoke-package` — npm pack contains only `dist/`, `LICENSE`, `README.md`.
- **LSG-B** — `.d.ts` export surface, no leaked `../src` paths, ESM + CJS import smoke.

## Test files

| File                               | IDs              | Focus                         |
| ---------------------------------- | ---------------- | ----------------------------- |
| `test/scaffold.test.ts`            | LSG-S\*, E01–E02 | Core smoke + concurrency      |
| `test/edge-cases.test.ts`          | LSG-E03–E07      | SSE splits, transform order   |
| `test/edge-cases-extended.test.ts` | LSG-E08–E17      | Exhaustive Phase 0 edge cases |
| `test/build-artifacts.test.ts`     | LSG-B\*          | dist hygiene                  |
| `test/exports.test.ts`             | LSG-S06          | public export surface         |

## Running tests

```bash
pnpm verify    # format + typecheck + build + test + smoke:package
pnpm test      # vitest only
```

## Phase 1 additions (planned)

- Golden fixtures under `test/fixtures/` with `REGISTRY.md`.
- Property-style random chunk split fuzz for secret patterns (**LSG-C**).
- Idempotency: double `guardEvents` must not double-redact.
- Redaction-specific every-byte splits on secret token boundaries.

See [CONTRIBUTING.md](../CONTRIBUTING.md) and [proposal.MD](./proposal.MD#test-strategy).
