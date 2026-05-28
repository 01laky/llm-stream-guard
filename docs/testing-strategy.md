# Testing strategy

**Status:** Phase 3 shipped — integration cookbook, runnable examples, **580** tests.

## Test ID prefixes

| Prefix      | Purpose                                                 |
| ----------- | ------------------------------------------------------- |
| **LSG-S**   | Scaffold smoke (build, deps, passthrough API)           |
| **LSG-B**   | Build artifacts and dist hygiene                        |
| **LSG-E**   | Extended edge-case wiring (LSG-E01–E38)                 |
| **LSG-C**   | Chunk-boundary byte redaction                           |
| **LSG-R**   | Redaction golden input → output                         |
| **LSG-T**   | Tool policy + transform ordering                        |
| **LSG-P**   | Performance smoke (local timing, not CI gate)           |
| **LSG-POL** | Policy validate, merge, compile, load, diff, CLI        |
| **LSG-CBK** | Integration cookbook docs, examples, behavioral recipes |
| **LSG-REL** | Release / publish readiness                             |

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
- `pnpm fixtures:check-policies` — policy fixture drift (`scripts/check-policy-fixtures.mjs`).
- `pnpm fixtures:audit-policy-registry` — policy REGISTRY parity.

## Phase 2 coverage (policy + CLI)

### Policy loader (`loadPolicy`, `compilePolicy`)

- Schema validation with stable codes **POLICY_E001–E011** (**LSG-POL01–POL15**).
- `extends` merge (profiles + parent policies), depth cap, replace semantics for duplicate rule keys (**LSG-POL16–POL21**).
- Compile to `GuardTransform[]` + byte flags; `createGuardFromPolicy()` (**LSG-POL22–POL28**).
- Minimal YAML subset (`parsePolicyYaml`) — indentation, lists, quoted strings (**LSG-POL29–POL30**).
- Rule conflicts: overlapping allow/deny (**POLICY_E009**), empty allowlist + block mode (**POLICY_E010** / **POLICY_E008**) (**LSG-POL31**).
- Diff effective policies (**LSG-POL32**).
- Extended edge cases: all validation codes **E001–E010**, YAML/SSE/merge/scan/diff/CLI (**LSG-POL33–POL48**).

### CLI (`llm-stream-guard`)

- `validate`, `resolve`, `diff`, `profiles list|show`, `scan` on files/dirs/stdin.
- JSON event files vs raw byte/SSE paths; `--json` report with `policyVersion` and effective `mode`.
- SSE `data:` prefix normalization before byte scan.

## Phase 3 coverage (integration cookbook)

### Docs and examples

- 13-section cookbook with byte/event/policy/migration/CI/troubleshooting recipes (**LSG-CBK01–20**).
- Runnable `examples/` tree typechecked against `dist/index.d.ts` (**LSG-CBK11–15**, **LSG-CBK28**).
- Supplementary guides: MCP tool gate, LiteLLM gateway hook, migration from regex (**LSG-CBK29–32**).
- `scripts/check-cookbook-examples.mjs` — registry parity vs `examples/README.md` (**LSG-CBK33**).

### Behavioral recipes (in tests)

- Agent loop block vs audit modes (**LSG-CBK21–22**).
- Policy-driven guard from file (**LSG-CBK23**).
- Dual-stream audit side channel (**LSG-CBK24**).
- Assemble mapper fixture (**LSG-CBK25**).
- Workers example portability (**LSG-CBK26**).
- Policy CI scan script on clean fixture (**LSG-CBK27**).
- Troubleshooting table ≥5 rows (**LSG-CBK34**).

### Extended cookbook edge cases (**LSG-CBK35–CBK43**)

- Assemble + AI SDK mapper exhaustive mapping and async streams (**LSG-CBK35–36**).
- Agent loop: execute path, warn/audit semantics, blockToolArgs, post-violation halt (**LSG-CBK37**, **LSG-CBK42**).
- Dual-stream audit: clean vs disallowed tools, ordering, empty stream (**LSG-CBK38**).
- Policy-driven guard: agent-gate/proxy-strict, `guard()` + `createByteGuard()` (**LSG-CBK39**).
- Mapper → `guardEvents` integration pipelines (**LSG-CBK40**).
- Byte proxy export sanity + doc cross-links (**LSG-CBK41**, **LSG-CBK43**).

### Policy extended edge cases (**LSG-POL49–POL52**)

- `applyModeOverride` invalid `GUARD_MODE` fallback (**LSG-POL49**).
- `createGuardFromPolicy` byte + event factory parity (**LSG-POL50**).
- `compilePolicy` empty rules / default byte flags (**LSG-POL51**).
- `scanContent` on clean vs bad tool fixtures (**LSG-POL52**).

### Release readiness extensions

- README 0.4.0 badges and documentation links (**LSG-REL17**, **LSG-REL19**).
- CHANGELOG `## [0.4.0]` cookbook bullets (**LSG-REL18**).

## Test files

| File                               | IDs              | Focus                           |
| ---------------------------------- | ---------------- | ------------------------------- |
| `test/chunk-redaction.test.ts`     | LSG-C\*          | Byte chunk redaction            |
| `test/redact-secrets.test.ts`      | LSG-R\*          | Event redaction + violations    |
| `test/tool-policy.test.ts`         | LSG-T\*          | Tool policy                     |
| `test/idempotency.test.ts`         | LSG-R13          | Double-pass redaction           |
| `test/cross-mode-parity.test.ts`   | LSG-C13          | Event vs byte parity            |
| `test/transform-ordering.test.ts`  | LSG-T08          | Transform order contract        |
| `test/performance-smoke.test.ts`   | LSG-P\*          | 1 MiB smoke + bounded buffer    |
| `test/scaffold.test.ts`            | LSG-S\*, E01–E02 | Core smoke                      |
| `test/edge-cases.test.ts`          | LSG-E03–E07      | SSE splits, transform order     |
| `test/edge-cases-extended.test.ts` | LSG-E08–E17      | Extended edge cases             |
| `test/edge-cases-rules.test.ts`    | LSG-E18–E38      | Rule edge cases + fuzz          |
| `test/build-artifacts.test.ts`     | LSG-B\*          | dist hygiene                    |
| `test/exports.test.ts`             | LSG-S06          | public export surface           |
| `test/policy-load.test.ts`         | LSG-POL01–31     | Policy validate, merge, compile |
| `test/policy-cli.test.ts`          | LSG-POL16–32     | CLI validate, scan, diff        |
| `test/policy-edge-cases.test.ts`   | LSG-POL33–52     | Policy/CLI extended edge cases  |
| `test/cookbook-recipes.test.ts`    | LSG-CBK01–34     | Cookbook docs + example recipes |
| `test/cookbook-edge-cases.test.ts` | LSG-CBK35–43     | Cookbook behavioral edge cases  |
| `test/release-readiness.test.ts`   | LSG-REL\*        | publish prep gates              |

## Running tests

```bash
pnpm verify                      # format + typecheck + build + test + fixtures + smoke
pnpm test                        # vitest only
pnpm fixtures:check-redaction    # golden drift check
pnpm fixtures:audit-registry     # REGISTRY.md parity
pnpm fixtures:check-policies       # policy golden drift
pnpm fixtures:audit-policy-registry
pnpm examples:typecheck            # cookbook examples vs dist types
pnpm cookbook:check-examples       # examples README registry parity
pnpm examples:smoke                # minimal-node smoke
pnpm bench:smoke                 # local MB/s timing (informational)
```

See [CONTRIBUTING.md](../CONTRIBUTING.md) and [proposal.MD](./proposal.MD#test-strategy).
