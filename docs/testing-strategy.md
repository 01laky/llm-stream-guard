# Testing strategy

**Status:** Phase 9 shipped — test fortress (**4157+** tests, LSG-XEC/PROP/PKG/SEC).

## Test ID prefixes

| Prefix       | Purpose                                                 |
| ------------ | ------------------------------------------------------- |
| **LSG-S**    | Scaffold smoke (build, deps, passthrough API)           |
| **LSG-B**    | Build artifacts and dist hygiene                        |
| **LSG-E**    | Extended edge-case wiring (LSG-E01–E38)                 |
| **LSG-C**    | Chunk-boundary byte redaction                           |
| **LSG-R**    | Redaction golden input → output                         |
| **LSG-T**    | Tool policy + transform ordering                        |
| **LSG-P**    | Performance smoke (local timing, not CI gate)           |
| **LSG-POL**  | Policy validate, merge, compile, load, diff, CLI        |
| **LSG-CBK**  | Integration cookbook docs, examples, behavioral recipes |
| **LSG-STA**  | Static manifest audit, drift, dangerous catalog, SARIF  |
| **LSG-ACT**  | GitHub Action composite, CI docs, dogfood workflow      |
| **LSG-REF**  | 0.6.0 refactor re-export / shared module edges          |
| **LSG-COV**  | 0.7.0 exhaustive coverage matrix + stretch goals        |
| **LSG-DOC**  | 0.8.0 documentation completeness + link integrity       |
| **LSG-REL**  | Release / publish readiness                             |
| **LSG-XEC**  | 0.9.0 exhaustive edge-case matrices                     |
| **LSG-PROP** | 0.9.0 property invariants                               |
| **LSG-PKG**  | 0.9.0 npm pack tarball smoke                            |
| **LSG-SEC**  | 0.9.0 security negative tests                           |

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

## Phase 4 coverage (static audit + GitHub Action)

### Static audit CLI (`audit static`, `audit drift`, `audit validate-manifest`)

- Manifest extractors: Guard v1, MCP-shaped JSON, OpenAPI `x-tools`, YAML (**LSG-STA02–04**, **LSG-STA19**).
- Drift: `DRIFT_ALLOW`, `DRIFT_DENY`, `DRIFT_POLICY_ONLY`; `--strict` promotion (**LSG-STA05–07**).
- Dangerous catalog **D001–D006**; `BLOCK_ARGS_STATIC` preview (**LSG-STA08–09**, **LSG-STA27–28**).
- Walk filters: skip `node_modules`, include/exclude prefixes (**LSG-STA13**, **LSG-STA32–33**).
- Exit codes 0–3, `--annotate`, SARIF preview (**LSG-STA10–12**, **LSG-STA34–35**).
- Extended edge cases: validate-manifest matrix, extractors, drift semantics, D004–D006, blockToolArgs contains/multi-rule, walk/include parent descent, quiet mode (**LSG-STA36–STA70** in `test/audit-edge-cases.test.ts`).
- Docs: [`docs/static-scanning.md`](./static-scanning.md) (**LSG-STA17**).

### 0.6.0 refactor modules (`shared/`, `scan/`, audit splits)

- Shared walk: `isManifestPath`, skip dirs, include/exclude, parent descent (**LSG-REF03–REF05**, **LSG-REF20**, **LSG-REF25**).
- `parseArgs` / `splitCommaList`, structured file reader (**LSG-REF01–REF02**, **LSG-REF06**).
- `blockToolArgsMatcher`, compile guard, static scan roundtrip (**LSG-REF07–REF08**, **LSG-REF22**).
- `loadPoliciesForScan`, `resolveManifestFiles`, `format-report` helpers (**LSG-REF09–REF11**, **LSG-REF18**).
- Scan engine: `buildScanReport`, `scanPaths`, SSE normalize, jsonl blanks (**LSG-REF12–REF13**, **LSG-REF24**).
- GitHub annotations, SARIF version fallback, `./audit` export smoke (**LSG-REF14–REF16**).
- CLI command routing post-refactor (**LSG-REF19**).
- Full suite: **LSG-REF01–REF25** in `test/refactor-edge-cases.test.ts` (77 tests).

### GitHub Action (`action/`)

- Composite `action.yml` + `run.mjs` wrapper (**LSG-ACT01–03**).
- `fail-on` modes, baseline `diff --check`, SARIF output (**LSG-ACT04**, **LSG-ACT09–10**, **LSG-ACT14–15**).
- Docs: matrix workflow + SARIF upload preview (**LSG-ACT05–06**, **LSG-ACT16**, **LSG-ACT18**).
- Diagram: `ci-action-flow.mmd` + SVG (**LSG-ACT11–12**).
- PR annotations (**LSG-ACT13**).
- Extended wrapper edge cases: `fail-on` matrix, GITHUB_OUTPUT, baseline gate, annotate off (**LSG-ACT19–ACT40** in `test/action-edge-cases.test.ts`).

### Phase 7 coverage (0.7.0)

Test-only release — closes coverage gaps with programmatic matrices, CLI unit tests, schema contracts, seeded fuzz, and CI dogfood parity. **1100** tests total.

| File                                      | IDs        | Focus                            |
| ----------------------------------------- | ---------- | -------------------------------- |
| `test/coverage-matrix.test.ts`            | COV01–25   | Cross-module integration         |
| `test/coverage-audit-exhaustive.test.ts`  | COV26–55   | Audit exhaustive                 |
| `test/coverage-cli-exhaustive.test.ts`    | COV56–80   | CLI exhaustive                   |
| `test/coverage-policy-exhaustive.test.ts` | COV81–105  | Policy E001–E010 matrix          |
| `test/coverage-scan-exhaustive.test.ts`   | COV106–130 | Scan detectFormat matrix         |
| `test/coverage-shared-exhaustive.test.ts` | COV131–150 | Shared walk/parse/annotation     |
| `test/edge-cases-rules.test.ts`           | COV151–165 | Residual rule/runtime gaps       |
| `test/coverage-refactor-parity.test.ts`   | COV166–175 | Re-export shim parity            |
| `test/coverage-schemas.test.ts`           | COV176–185 | Schema vs runtime validators     |
| `test/coverage-fuzz.test.ts`              | COV186–195 | Seeded fuzz (seed 42)            |
| `test/coverage-stretch.test.ts`           | COV196–220 | Env, formatters, SARIF lines, CI |
| `test/build-artifacts.test.ts`            | B10–15     | `dist/audit/*` hygiene           |
| `test/exports.test.ts`                    | S08–11     | `./audit` export surface         |
| `test/release-readiness.test.ts`          | REL25–29   | 0.7.0 release gates              |

Diagram: `docs/img/test-coverage.mmd` + SVG.

### Phase 8 documentation (0.8.0)

Beginner-friendly docs — **`LSG-DOC01–DOC20`** in `test/docs-readiness.test.ts` (planned), **`LSG-REL30–REL35`** release gates.

| Doc                             | Purpose                                 |
| ------------------------------- | --------------------------------------- |
| `docs/getting-started.md`       | First 15 minutes: byte + event examples |
| `docs/concepts-and-glossary.md` | SSE, GuardEvent, modes                  |
| `docs/policy-reference.md`      | Rules, E001–E011, profiles              |
| `docs/cli-reference.md`         | Commands, flags, exit codes             |
| `docs/docs-map.md`              | Persona learning paths                  |

New diagrams: `stream-anatomy`, `getting-started-journey`, `tool-call-lifecycle`, `policy-rules-map`, `static-audit-flow`. Prompt: `prompts/phase-8-documentation-prompt.md`.

### Phase 8.2 documentation completion (0.8.2)

Closes Phase 8 debt — **`LSG-DOC01–DOC35`**, **`LSG-REL31–REL43`**, **`pnpm doc:check-links`**. Prompt: `prompts/phase-8.2-documentation-completion-prompt.md`.

| Area                             | IDs                  | Focus                                                          |
| -------------------------------- | -------------------- | -------------------------------------------------------------- |
| `test/docs-readiness.test.ts`    | DOC01–35, DOC-E01–08 | Docs, links, status lint, personas                             |
| `test/docs-edge-cases.test.ts`   | DOC-E09–E55          | Troubleshooting anchors, Action parity, link checker negatives |
| `test/release-readiness.test.ts` | REL31–43             | CHANGELOG, npm pack schema README, Action pins                 |
| `scripts/check-doc-links.mjs`    | DOC30                | Relative link integrity in verify                              |
| `scripts/release-prep.mjs`       | REL43                | Pre-tag doc gates                                              |

New docs: `troubleshooting.md`, `security-reporting.md`, `upgrade-guide.md`, `threat-model-stub.md`, `schemas/README.md`, `SECURITY.md`.

### Phase 9 test fortress (0.9.0)

Closes coverage debt toward **≥4000** Vitest tests — programmatic matrices, property invariants, golden-runner fixtures, count gate. Prompt: `prompts/phase-9.0-test-fortress-prompt.md`.

| Area                                   | IDs          | Focus                              |
| -------------------------------------- | ------------ | ---------------------------------- |
| `test/byte-split-matrix.test.ts`       | XEC1201–1600 | Byte secret split enumeration      |
| `test/edge-cases-exhaustive.test.ts`   | XEC001–0500  | Event/tool cartesian               |
| `test/edge-cases-exhaustive-b.test.ts` | XEC0501–1200 | PII, UTF-8, pipeGuard, idempotency |
| `test/policy-matrix.test.ts`           | XEC1601–1850 | Policy validate/YAML               |
| `test/cli-matrix.test.ts`              | XEC1851–2100 | CLI argv/exit                      |
| `test/audit-matrix.test.ts`            | XEC2101–2350 | Static audit                       |
| `test/action-matrix.test.ts`           | XEC2351–2545 | GitHub Action                      |
| `test/cross-mode-golden.test.ts`       | XEC2546–2795 | Profile×fixture parity             |
| `test/property-invariants.test.ts`     | PROP01–50    | Formal invariants                  |
| `test/json-regression.test.ts`         | COV451–490   | CLI `--json` hash regression       |
| `test/package-tarball.test.ts`         | PKG01–18     | npm pack smoke                     |
| `test/security-negative.test.ts`       | SEC01–20     | Bypass documentation               |
| `scripts/test-count-gate.mjs`          | REL51        | Min 4000 tests                     |
| `scripts/audit-test-coverage-map.mjs`  | REL53        | Export→test refs                   |
| `test/helpers/golden-runner.ts`        | REL54        | Fixture golden runner              |

**CI timing:** target **≤8 min** for `pnpm test` on `ubuntu-latest`; use `pnpm vitest run --shard=1/2` and `--shard=2/2` if exceeded (full count gate runs once pre-release).

```bash
pnpm test
pnpm test:count-gate      # fails if < 4000
pnpm test:coverage-map    # export reference audit
pnpm test:timing          # informational WARN locally
```

Diagram: `docs/img/test-fortress.mmd` + SVG (19 diagrams total).

### Test files (Phase 4)

| File                               | IDs          | Focus                            |
| ---------------------------------- | ------------ | -------------------------------- |
| `test/static-audit.test.ts`        | LSG-STA01–35 | Static audit CLI core            |
| `test/audit-edge-cases.test.ts`    | LSG-STA36–70 | Static audit extended edges      |
| `test/github-action.test.ts`       | LSG-ACT01–18 | Action wrapper + CI docs         |
| `test/action-edge-cases.test.ts`   | LSG-ACT19–30 | Action wrapper edge cases        |
| `test/refactor-edge-cases.test.ts` | LSG-REF01–25 | 0.6.0 shared/scan/audit refactor |

## Test files

| File                                      | IDs              | Focus                           |
| ----------------------------------------- | ---------------- | ------------------------------- |
| `test/chunk-redaction.test.ts`            | LSG-C\*          | Byte chunk redaction            |
| `test/redact-secrets.test.ts`             | LSG-R\*          | Event redaction + violations    |
| `test/tool-policy.test.ts`                | LSG-T\*          | Tool policy                     |
| `test/idempotency.test.ts`                | LSG-R13          | Double-pass redaction           |
| `test/cross-mode-parity.test.ts`          | LSG-C13          | Event vs byte parity            |
| `test/transform-ordering.test.ts`         | LSG-T08          | Transform order contract        |
| `test/performance-smoke.test.ts`          | LSG-P\*          | 1 MiB smoke + bounded buffer    |
| `test/scaffold.test.ts`                   | LSG-S\*, E01–E02 | Core smoke                      |
| `test/edge-cases.test.ts`                 | LSG-E03–E07      | SSE splits, transform order     |
| `test/edge-cases-extended.test.ts`        | LSG-E08–E17      | Extended edge cases             |
| `test/edge-cases-rules.test.ts`           | LSG-E18–E38      | Rule edge cases + fuzz          |
| `test/build-artifacts.test.ts`            | LSG-B\*          | dist hygiene                    |
| `test/exports.test.ts`                    | LSG-S06          | public export surface           |
| `test/policy-load.test.ts`                | LSG-POL01–31     | Policy validate, merge, compile |
| `test/policy-cli.test.ts`                 | LSG-POL16–32     | CLI validate, scan, diff        |
| `test/policy-edge-cases.test.ts`          | LSG-POL33–52     | Policy/CLI extended edge cases  |
| `test/cookbook-recipes.test.ts`           | LSG-CBK01–34     | Cookbook docs + example recipes |
| `test/cookbook-edge-cases.test.ts`        | LSG-CBK35–43     | Cookbook behavioral edge cases  |
| `test/static-audit.test.ts`               | LSG-STA01–35     | Static manifest audit core      |
| `test/audit-edge-cases.test.ts`           | LSG-STA36–70     | Static audit extended edges     |
| `test/github-action.test.ts`              | LSG-ACT01–18     | GitHub Action + CI docs         |
| `test/action-edge-cases.test.ts`          | LSG-ACT19–40     | Action wrapper edge cases       |
| `test/refactor-edge-cases.test.ts`        | LSG-REF01–25     | 0.6.0 refactor module edges     |
| `test/coverage-matrix.test.ts`            | LSG-COV01–25     | Cross-module integration        |
| `test/coverage-audit-exhaustive.test.ts`  | LSG-COV26–55     | Audit exhaustive                |
| `test/coverage-cli-exhaustive.test.ts`    | LSG-COV56–80     | CLI exhaustive                  |
| `test/coverage-policy-exhaustive.test.ts` | LSG-COV81–105    | Policy exhaustive               |
| `test/coverage-scan-exhaustive.test.ts`   | LSG-COV106–130   | Scan exhaustive                 |
| `test/coverage-shared-exhaustive.test.ts` | LSG-COV131–150   | Shared module exhaustive        |
| `test/coverage-refactor-parity.test.ts`   | LSG-COV166–175   | Re-export parity                |
| `test/coverage-schemas.test.ts`           | LSG-COV176–185   | Schema contracts                |
| `test/coverage-fuzz.test.ts`              | LSG-COV186–195   | Seeded fuzz                     |
| `test/coverage-stretch.test.ts`           | LSG-COV196–220   | Stretch (env, SARIF, CI)        |
| `test/release-readiness.test.ts`          | LSG-REL\*        | publish prep gates              |

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
