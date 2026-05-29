# Architecture diagrams

Mermaid sources and pre-rendered SVGs for the README and docs. npm and GitHub README cannot
execute Mermaid — always commit updated **`.svg`** files alongside **`.mmd`** edits.

## Core architecture

| File                     | Purpose                                                             |
| ------------------------ | ------------------------------------------------------------------- |
| `pipeline.mmd`           | End-to-end: bytes/events → guard → apps + offline CLI/audit         |
| `guard-event.mmd`        | `GuardEvent` union mindmap + which rules apply                      |
| `modes.mmd`              | Byte mode vs event mode routing (~30 second decision)               |
| `violation-modes.mmd`    | `block` / `warn` / `audit` + `onViolation`                          |
| `chunk-redaction.mmd`    | Mid-chunk secret redaction with rolling lookback buffer (Phase 1)   |
| `ecosystem.mmd`          | Optional `llm-stream-assemble` + guard pipeline (no npm dependency) |
| `scaffold-lifecycle.mmd` | Stateful `GuardContext` per stream vs stateless compose helpers     |

## Policy & agent flows

| File                      | Purpose                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| `policy-compile.mmd`      | Policy file → validate → merge → compile → guard / CLI (incl. errors) |
| `policy-rules-map.mmd`    | All policy rule keys and sub-options (mindmap)                        |
| `agent-gate-loop.mmd`     | Agent loop: phases → policy checks → execute or block                 |
| `tool-call-lifecycle.mmd` | Sequence: start / delta / done vs guard hooks                         |
| `dual-stream.mmd`         | Client stream + server audit side-channel (`onViolation` collector)   |
| `migration-path.mmd`      | Regex middleware → rule factories → policy files → CLI scan           |

## Beginner & CI docs (0.8.0+)

| File                          | Purpose                                            |
| ----------------------------- | -------------------------------------------------- |
| `stream-anatomy.mmd`          | What SSE lines look like; byte vs parse path       |
| `getting-started-journey.mmd` | Recommended doc reading order for new users        |
| `static-audit-flow.mmd`       | `audit static` pipeline: drift + D001–D006 + SARIF |
| `ci-action-flow.mmd`          | GitHub Action: validate → scan → audit → fail gate |
| `test-coverage.mmd`           | Phase 7 LSG-COV test suite layout (maintainers)    |
| `test-fortress.mmd`           | Phase 9 test fortress: XEC/PROP gates              |
| `v1-stable-architecture.mmd`  | 1.0 stable surfaces: byte, event, policy, SARIF    |
| `violation-report-flow.mmd`   | `onFinish` / `StreamGuardSummary` sequence         |

**21 diagrams** in `pnpm diagrams:build`.

Regenerate after editing sources:

```bash
pnpm diagrams:build
```

Requires `@mermaid-js/mermaid-cli` (installed on demand via `npx` in `scripts/build-diagrams.mjs`).

**Workflow:** edit `.mmd` → run `pnpm diagrams:build` → commit both `.mmd` and `.svg` → README/docs reference SVG via relative paths or `raw.githubusercontent.com` URLs (npm-safe).
