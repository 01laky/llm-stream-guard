# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/); versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.8.1]

### Fixed

- **`package.json` bin path** — `bin.llm-stream-guard` uses `dist/cli.js` (not `./dist/cli.js`) so `npm publish` no longer strips the CLI entry; `llm-stream-guard` links correctly after `npm install`.
- **Version sync** — package metadata, README badges, and `src/version.ts` aligned with the 0.8.x documentation release track (0.8.0 GitHub release; first npm publish at 0.8.1).

## [0.8.0]

### Added

- **Beginner docs** — [`docs/getting-started.md`](./docs/getting-started.md) (install, byte + event first examples, mode decision, common mistakes), [`docs/concepts-and-glossary.md`](./docs/concepts-and-glossary.md) (SSE, GuardEvent, violation modes), [`docs/docs-map.md`](./docs/docs-map.md) (persona learning paths).
- **Reference docs** — [`docs/policy-reference.md`](./docs/policy-reference.md) (all `RULE_KEYS`, POLICY_E001–E011, profiles, `extends`), [`docs/cli-reference.md`](./docs/cli-reference.md) (every CLI command; separate CLI router vs audit exit-code tables).
- **Diagrams** — five new Mermaid/SVG pairs: `stream-anatomy`, `getting-started-journey`, `tool-call-lifecycle`, `policy-rules-map`, `static-audit-flow`; enhanced `pipeline`, `policy-compile`, `agent-gate-loop`, `guard-event` (18 total in `pnpm diagrams:build`).
- **README** — “New to LLM streams?” entry block and expanded Documentation table linking the new guides.

### Changed

- **FAQ** — beginner section; version history through 0.7.0; expanded Action/docs pointers.
- **Integration cookbook**, **static scanning**, **CI & GitHub Action** — status bumps and cross-links to getting-started / CLI reference.
- **`docs/testing-strategy.md`** — Phase 8 / documentation overhaul section.
- **`docs/img/README.md`** — diagram index grouped by core / policy / beginner / CI.

### Unchanged

- Public runtime API, CLI command surface, audit JSON report keys, GitHub Action inputs/outputs schema, zero runtime npm dependencies.

## [0.7.0]

### Added

- **Tests — LSG-COV01–COV220** — ten new coverage suites (`coverage-matrix`, `coverage-audit-exhaustive`, `coverage-cli-exhaustive`, `coverage-policy-exhaustive`, `coverage-scan-exhaustive`, `coverage-shared-exhaustive`, `coverage-refactor-parity`, `coverage-schemas`, `coverage-fuzz`, `coverage-stretch`); **LSG-COV151–165** rule residual gaps; **LSG-B10–B15** `./audit` dist hygiene; **LSG-S08–S11** audit export surface; **LSG-ACT31–ACT40** GitHub Action `GITHUB_OUTPUT` contract; **LSG-REL25–REL29** release gates. **1100** tests total.
- **Fixture** — `test/fixtures/tools/coverage/multiline-manifest.json` for SARIF `startLine` tests (COV212–214).
- **Docs** — Phase 7 section in `docs/testing-strategy.md`; `test-coverage` diagram.
- **Smoke** — `scripts/smoke-package.mjs` imports `llm-stream-guard/audit` from npm tarball (ESM + CJS).

### Fixed

- **Manifest line tracking** — `parseManifestFile` / `parseManifestText` now attach `line` metadata to scannable strings for dangerous-pattern findings and SARIF `region.startLine`.

### Unchanged

- Public runtime API, CLI command surface, audit report JSON keys, zero runtime npm dependencies.

## [0.6.0]

### Changed

- **Source refactor** — unified filesystem walking (`src/shared/walk.ts`), shared CLI arg parsing and structured file reader, scan engine moved to `src/scan/`, audit split into focused modules (`load-policies`, `resolve-manifests`, `format-report`), CLI commands extracted from monolithic `main.ts`.
- **`blockToolArgs` matcher** — shared `src/policy/block-tool-args-matcher.ts` used by policy compile, static audit, and drift tooling (no behavior change).
- **Package version** — centralized in `src/version.ts`; SARIF preview and GitHub Action `run.mjs` read from package metadata instead of hardcoded strings.
- **Exports** — new `./audit` subpath for programmatic static audit (`runStaticScan`, `walkManifestFiles`, etc.).

### Removed

- Dead helpers: `readPolicyRaw`, `readManifestRaw`, `validateManifestParsed` alias.

### Added

- **Tests** — **LSG-REF01–REF25** (77 refactor edge cases for `shared/`, `scan/`, audit splits); **782** tests total.

### Unchanged

- Public runtime API, CLI command surface, audit report JSON shapes, zero runtime npm dependencies.

## [0.5.0]

### Added

- **Static audit CLI** — `audit validate-manifest`, `audit drift`, `audit static` with `--strict`, `--include`/`--exclude`, `--quiet`, `--annotate`, `--sarif-out`, and unified exit codes 0–3 (**LSG-STA01–STA35**).
- **`src/audit/` module** — manifest extraction (Guard v1, MCP, YAML, OpenAPI `x-tools`), allowlist drift, dangerous pattern catalog D001–D006, `blockToolArgs` static preview (`BLOCK_ARGS_STATIC`), SARIF 2.1.0 preview serializer.
- **GitHub Action** — composite `action/` (`action.yml`, `run.mjs`, README) with baseline policy diff, stream scan, static audit, annotations, and SARIF output (**LSG-ACT01–ACT18**).
- **Repo conventions** — `tools/manifest.json` dogfood manifest, `schemas/tools-manifest-v1.json`, `policies/agent-gate.baseline.json`, `test/fixtures/tools/` + REGISTRY.
- **Docs** — `docs/ci-github-action.md`, `docs/static-scanning.md`, `docs/pre-commit-recipe.md`, `ci-action-flow` diagram; cookbook §11, migration Step 4, FAQ, testing-strategy, comparison, CONTRIBUTING updated.
- **CI** — `.github/workflows/guard-audit.yml` dogfood job; upgraded `examples/policy-ci/scan-fixtures.sh`.
- **Scripts** — `pnpm fixtures:audit-tools-registry`, `pnpm action:smoke`; wired into `pnpm verify`.
- **Tests** — **LSG-STA01–STA35**, **LSG-STA36–STA70** (extended audit edge cases), **LSG-ACT01–ACT30**, **LSG-REL20–REL22**; **703** tests total.

### Unchanged

- Core runtime API, existing `scan`/`diff`/`profiles` CLI, zero runtime npm dependencies.

## [0.4.0]

### Added

- **Integration cookbook** — 13-section [`docs/integration-cookbook.md`](./docs/integration-cookbook.md): byte proxies (Hono, Express, Workers), agent tool gate, policy-driven setup, transform ordering, assemble + AI SDK mappers, dual-stream audit, MCP, LiteLLM gateway hook, CI without Action, migration, troubleshooting (**LSG-CBK01–34**).
- **Runnable examples** — `examples/` tree (typechecked via `pnpm examples:typecheck`, smoke via `pnpm examples:smoke`): `byte-proxy/`, `event-gate/`, `assemble-mapper/`, `ai-sdk-mapper/`, `dual-stream/`, `policy-ci/`, `minimal-node/`; registry in [`examples/README.md`](./examples/README.md).
- **Migration guide** — [`docs/migration-from-regex.md`](./docs/migration-from-regex.md) + `migration-path` diagram (regex → rule factories → policy files → CLI scan).
- **MCP recipe** — [`docs/mcp-tool-gate-recipe.md`](./docs/mcp-tool-gate-recipe.md) (`tools/call` → `GuardEvent` mapping before execute).
- **LiteLLM hook** — [`docs/litellm-gateway-hook.md`](./docs/litellm-gateway-hook.md) (byte guard on gateway response body; no litellm npm dep).
- **Diagrams** — `agent-gate-loop`, `dual-stream`, `migration-path` (`.mmd` + `.svg`).
- **Scripts** — `pnpm cookbook:check-examples`, `scripts/check-cookbook-examples.mjs`; `verify` extended with examples typecheck + smoke.
- **Fixtures** — `test/fixtures/events/clean-tool.json` for policy-ci scan exit-0 golden.
- **Tests** — **LSG-CBK01–CBK34**, **LSG-CBK35–CBK43** (extended cookbook edge cases), **LSG-POL49–POL52**, **LSG-REL17–REL19**; **580** tests total.

### Unchanged

- Core runtime API, policy loader, CLI, zero runtime npm dependencies.
- npm tarball `files` whitelist (`dist`, `schemas`, `README.md`, `LICENSE`).

## [0.3.0]

### Added

- **Policy schema v1** — JSON/YAML files with `version`, `mode`, `byte`, ordered `rules`, optional `extends` and `policyVersion`.
- **Policy API** — `loadPolicy()`, `compilePolicy()`, `validatePolicy()`, `diffPolicies()`, `createGuardFromPolicy()`, `listProfiles()`; stable error codes `POLICY_E001`–`E011`.
- **Built-in profiles** — `proxy-strict`, `agent-gate`, `audit-only` with merge semantics for `extends`.
- **Minimal YAML parser** — zero-dep subset for policy files (`parsePolicyYaml`).
- **CLI** (`llm-stream-guard`) — `validate`, `resolve`, `scan` (files, dirs, stdin), `diff`, `profiles list|show`.
- **Scan report** — `--json` output includes `policyVersion` and effective `mode` per violation.
- **SSE-aware byte scan** — strips `data:` framing before byte redaction in CLI scan.
- **Examples** — `policies/`, `schemas/policy-v1.json`, `test/fixtures/policies/` + REGISTRY.
- **Tests** — **LSG-POL01–POL48**, **LSG-REL15–REL16**; **480** tests total.

### Unchanged

- All Phase 1 rule factories and manual transform API.
- Zero runtime npm dependencies.

## [0.2.0]

### Added

- **MVP rule factories** — `redactSecrets()`, `redactPII()`, `allowTools()`, `denyTools()`, `blockToolArgs()`, `maxToolArgsBytes()`, `sanitizeErrors()` with exported options types (`RedactSecretsOptions`, `RedactPIIOptions`, `SanitizeErrorsOptions`, `BlockToolArgsMatcher`).
- **Byte redaction** — rolling lookback buffer (128 B), latin1-preserving scan, `flush` handler; `createByteGuard({ redactSecrets, sanitizeErrors })` active.
- **Event pipeline** — `guardEvents()` executes transforms when provided; composable `GuardTransform` ordering documented.
- **Tests** — **LSG-C01–C14** chunk boundary + cross-mode parity + byte audit; **LSG-R01–R16** redaction; **LSG-T01–T12** tool policy + ordering; **LSG-P01–P03** performance smoke; **LSG-E18–E38** rule edge cases (patterns, modes, fuzz, stress); **355** tests total.
- **Fixtures** — `test/fixtures/` + `REGISTRY.md`; `pnpm fixtures:check-redaction`, `pnpm fixtures:audit-registry`; `pnpm bench:smoke`.
- **Docs** — README stable quickstart; [`docs/integration-cookbook.md`](./docs/integration-cookbook.md) mapper recipe; updated testing strategy, FAQ, comparison, diagrams.

### Changed

- **Breaking** — `guardEvents(..., transform)` now invokes transforms; `createByteGuard({ redactSecrets: true })` mutates bytes.
- **release-prep** — stable green badge gates for 0.2.0+.
- **maxToolArgsBytes** — stable byte tracking for tool calls without `id` (keyed by tool name).

### Notes

- **Secrets always redact** in all violation modes (including `audit`); tool policy `audit` passes events through with `onViolation`.
- YAML policy + CLI → repo **0.3.0** (proposal v0.2).

## [0.1.2]

### Added

- **Publishing** — `scripts/release-prep.mjs`, `pnpm release:prep`, [`docs/publishing.md`](./docs/publishing.md) (manual tag + npm + GitHub Release flow aligned with llm-stream-assemble); **LSG-REL01–REL14** release-readiness tests; npm publish-ready (`"private": true` removed).
- **Tests** — **LSG-E08–E17** extended edge-case suite (`test/edge-cases-extended.test.ts`): Phase 0 transform non-execution traps, exhaustive `GuardEvent` union matrix, 2000-event stress, source error propagation, `applyGuardTransforms` / `pipeGuard` combinatorics, every-byte UTF-8 split matrix, binary/CRLF SSE payloads, deterministic random split fuzz (20 seeds × 4 payloads), context lifecycle isolation, 1 MiB byte smoke; **162** tests total.

### Changed

- **README / FAQ** — install via npm when published; maintainer release steps linked from [`docs/publishing.md`](./docs/publishing.md).
- **CONTRIBUTING** — **LSG-REL** test prefix and release checklist.

## [0.1.1]

### Added

- **Package scaffold** — TypeScript 5.x, tsup (ESM + CJS + `.d.ts`), Vitest, Prettier (tabs), `.editorconfig`, `.npmrc` (`engine-strict`), `preinstall` `only-allow pnpm`, CI on Node 18/20/22 with `contents: read`.
- **Public types** — `GuardEvent` discriminated union, `Violation`, `ViolationMode`, `GuardTransform`, `ByteTransform`, config/options types (independent of llm-stream-assemble).
- **Passthrough API** — `guardEvents()`, `createByteGuard()`, `pipeGuard()`, `createGuardContext()` with `reset()`; internal `applyGuardTransforms()` pipeline wired but rules not executed until 0.2.0.
- **Zero-deps policy** — `scripts/verify-zero-deps.mjs` checks `dependencies`, `optionalDependencies`, and `peerDependencies`; `scripts/smoke-package.mjs` npm pack smoke (ESM + CJS import).
- **Tests** — **LSG-S01–S07** scaffold, **LSG-B01–B08** build artifacts, **LSG-E01–E07** extended edge cases (SSE byte splits, UTF-8 mid-codepoint chunks, transform ordering, concurrent contexts); **47** tests total.
- **Docs** — README updated for 0.1.1 scaffold; [`docs/testing-strategy.md`](./docs/testing-strategy.md); architecture diagrams including `scaffold-lifecycle` (`.mmd` + `.svg`); `pnpm diagrams:build`.

### Notes

- **Passthrough only** — no `redactSecrets`, tool policy, or byte redaction logic yet; Phase 1 targets **0.2.0** per [`docs/proposal.MD`](./docs/proposal.MD).
- **pnpm** — `vite@6.3.5` override for Node 18+ compatibility in CI.
