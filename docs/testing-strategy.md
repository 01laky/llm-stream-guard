# Testing strategy

**Status:** Phase 1 shipped — MVP rules, golden fixtures, fixture audit scripts, **350+** tests.

## Test ID prefixes

| Prefix      | Purpose                                       |
| ----------- | --------------------------------------------- |
| **LSG-S**   | Scaffold smoke (build, deps, passthrough API) |
| **LSG-B**   | Build artifacts and dist hygiene              |
| **LSG-E**   | Extended edge-case wiring (LSG-E01–E38)       |
| **LSG-C**   | Chunk-boundary byte redaction                 |
| **LSG-R**   | Redaction golden input → output               |
| **LSG-T**   | Tool policy + transform ordering              |
| **LSG-P**   | Performance smoke (local timing, not CI gate) |
| **LSG-REL** | Release / publish readiness                   |

## Phase 1 coverage

### Byte mode (`createByteGuard`)

- Rolling 128 B lookback + incomplete-prefix holdback; latin1-preserving scan; `flush` on stream close (**LSG-C01–C14**).
- Cross-mode parity with event `redactSecrets()` (**LSG-C13**).
- Byte `audit` mode: secrets redacted + `onViolation` fired (**LSG-C14**).
- 1 MiB streams, random split fuzz, binary preservation (**LSG-C05, C09, C10, LSG-P**).

### Event mode (`guardEvents`)

- Rule factories: secrets, PII (opt-in), tool allow/deny, arg block, max args bytes, error sanitize (**LSG-R**, **LSG-T**).
- Transform execution when provided; passthrough when no transforms (**LSG-E08**).
- Idempotency — no `[REDACTED][REDACTED]` (**LSG-R13**).
- `redactSecrets` no-op on `finish` / `error` (**LSG-R16**).

### Fixtures

- Golden pairs under `test/fixtures/` with `REGISTRY.md`.
- `pnpm fixtures:check-redaction` — drift check in `pnpm verify`.
- `pnpm fixtures:audit-registry` — every fixture file listed in REGISTRY.

## Test files

| File                               | IDs              | Focus                        |
| ---------------------------------- | ---------------- | ---------------------------- |
| `test/chunk-redaction.test.ts`     | LSG-C\*          | Byte chunk redaction         |
| `test/redact-secrets.test.ts`      | LSG-R\*          | Event redaction + violations |
| `test/tool-policy.test.ts`         | LSG-T\*          | Tool policy                  |
| `test/idempotency.test.ts`         | LSG-R13          | Double-pass redaction        |
| `test/cross-mode-parity.test.ts`   | LSG-C13          | Event vs byte parity         |
| `test/transform-ordering.test.ts`  | LSG-T08          | Transform order contract     |
| `test/performance-smoke.test.ts`   | LSG-P\*          | 1 MiB smoke + bounded buffer |
| `test/scaffold.test.ts`            | LSG-S\*, E01–E02 | Core smoke                   |
| `test/edge-cases.test.ts`          | LSG-E03–E07      | SSE splits, transform order  |
| `test/edge-cases-extended.test.ts` | LSG-E08–E17      | Extended edge cases          |
| `test/edge-cases-rules.test.ts`    | LSG-E18–E38      | Rule edge cases + fuzz       |
| `test/build-artifacts.test.ts`     | LSG-B\*          | dist hygiene                 |
| `test/exports.test.ts`             | LSG-S06          | public export surface        |
| `test/release-readiness.test.ts`   | LSG-REL\*        | publish prep gates           |

## Running tests

```bash
pnpm verify                      # format + typecheck + build + test + fixtures + smoke
pnpm test                        # vitest only
pnpm fixtures:check-redaction    # golden drift check
pnpm fixtures:audit-registry     # REGISTRY.md parity
pnpm bench:smoke                 # local MB/s timing (informational)
```

See [CONTRIBUTING.md](../CONTRIBUTING.md) and [proposal.MD](./proposal.MD#test-strategy).
