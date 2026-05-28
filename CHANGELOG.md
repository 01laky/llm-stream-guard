# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/); versioning follows [Semantic Versioning](https://semver.org/).

Version headers only — no dates (`## [0.1.1]`, not `## [0.1.1] - 2026-05-28`).

## [Unreleased]

### Added

- **Tests** — **LSG-E08–E17** extended edge-case suite (`test/edge-cases-extended.test.ts`): Phase 0 transform non-execution traps, exhaustive `GuardEvent` union matrix, 2000-event stress, source error propagation, `applyGuardTransforms` / `pipeGuard` combinatorics, every-byte UTF-8 split matrix, binary/CRLF SSE payloads, deterministic random split fuzz (20 seeds × 4 payloads), context lifecycle isolation, 1 MiB byte smoke; **148** tests total.

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
- **Not published to npm** — `"private": true`.
- **pnpm** — `vite@6.3.5` override for Node 18+ compatibility in CI.
