# Architecture diagrams

Mermaid sources and pre-rendered SVGs for the README and docs. npm and GitHub README cannot
execute Mermaid — always commit updated **`.svg`** files alongside **`.mmd`** edits.

| File                     | Purpose                                                             |
| ------------------------ | ------------------------------------------------------------------- |
| `pipeline.mmd`           | End-to-end: raw bytes or parsed events → byte/event guard → apps    |
| `guard-event.mmd`        | `GuardEvent` union mindmap                                          |
| `modes.mmd`              | Byte mode vs event mode routing (~30 second decision)               |
| `violation-modes.mmd`    | `block` / `warn` / `audit` + `onViolation`                          |
| `chunk-redaction.mmd`    | Mid-chunk secret redaction with rolling lookback buffer (Phase 1)   |
| `ecosystem.mmd`          | Optional `llm-stream-assemble` + guard pipeline (no npm dependency) |
| `scaffold-lifecycle.mmd` | Stateful `GuardContext` per stream vs stateless compose helpers     |

Regenerate after editing sources:

```bash
pnpm diagrams:build
```

Requires `@mermaid-js/mermaid-cli` (installed on demand via `npx` in `scripts/build-diagrams.mjs`).

**Workflow:** edit `.mmd` → run `pnpm diagrams:build` → commit both `.mmd` and `.svg` → README references SVG via `raw.githubusercontent.com` URLs (npm-safe).
