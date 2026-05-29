# Contributing to llm-stream-guard

**Maintainer:** Ladislav Kostolny ([01laky@gmail.com](mailto:01laky@gmail.com))

Thank you for your interest in contributing.

## Canonical spec

Read [`docs/proposal.MD`](./docs/proposal.MD) before making changes. It defines scope, the `GuardEvent` model, MVP rules, and non-goals.

For integration patterns, see [`docs/integration-cookbook.md`](./docs/integration-cookbook.md) (expanded in **v0.4.0** with runnable `examples/`). Phase 4 (**v0.5.0**) adds static audit docs, GitHub Action, and pre-commit recipe.

## Requirements

- **Zero runtime dependencies** — enforced by `pnpm verify:deps` and CI (`dependencies`, `optionalDependencies`, and `peerDependencies` must stay empty).
- **Golden tests** for any rule or redaction behavior change (fixture in → expected safe output out).
- **Long, descriptive commit messages** with subject + body explaining what, why, and how tested.
- **CHANGELOG** — add entries under a version header (**no dates**); bump `package.json` version in the same commit.
- **No AI co-author trailers** in commits or PRs (`Co-authored-by: Cursor`, `cursoragent@`, etc.).
- **Tabs** — `.editorconfig` + `.prettierrc` (`useTabs: true`).

## Git hooks (required once per clone)

Cursor Agent can inject `Co-authored-by: Cursor <cursoragent@cursor.com>` when it runs
`git commit`. There is **no Settings toggle** to disable this — use the repo hooks instead:

```bash
./scripts/setup-githooks.sh
```

Verify:

```bash
git config core.hooksPath   # should print: .githooks
```

## Fixture and test ID convention

| Prefix       | Purpose                          |
| ------------ | -------------------------------- |
| **LSG-S**    | Scaffold / smoke                 |
| **LSG-B**    | Build artifact / dist hygiene    |
| **LSG-E**    | Extended edge-case wiring        |
| **LSG-C**    | Chunk-boundary byte streams      |
| **LSG-R**    | Redaction golden fixtures        |
| **LSG-T**    | Tool policy tests                |
| **LSG-P**    | Performance smoke (local)        |
| **LSG-POL**  | Policy loader / CLI              |
| **LSG-CBK**  | Integration cookbook / examples  |
| **LSG-STA**  | Static manifest audit / CLI      |
| **LSG-ACT**  | GitHub Action / CI docs          |
| **LSG-REL**  | Release / publish readiness      |
| **LSG-DOC**  | Documentation completeness       |
| **LSG-XEC**  | Phase 9 exhaustive edge matrices |
| **LSG-PROP** | Property invariants (0.9.0+)     |
| **LSG-PKG**  | npm pack tarball smoke           |
| **LSG-SEC**  | Security negative / bypass docs  |

Document new IDs in test headers; maintain `test/fixtures/REGISTRY.md`; run `pnpm fixtures:audit-registry` to enforce parity. Rule edge cases: **LSG-E18–E38** in `test/edge-cases-rules.test.ts`.

## Documentation

- **Start here:** [docs/docs-map.md](./docs/docs-map.md) for structure.
- **Beginner path:** [docs/getting-started.md](./docs/getting-started.md) — keep in sync when changing public API or CLI.
- **Diagrams:** edit `docs/img/*.mmd` → run `pnpm diagrams:build` → commit `.mmd` + `.svg`.
- **Policy/CLI changes:** update [policy-reference.md](./docs/policy-reference.md) and [cli-reference.md](./docs/cli-reference.md) in the same PR.
- **New examples:** register in `examples/README.md` and cookbook section; run `pnpm cookbook:check-examples`.
- **Doc tests:** `test/docs-readiness.test.ts` (LSG-DOC\*) must pass; add DOC ID if adding release-critical doc gates.
- **Phase 9 tests:** matrix files (`byte-split-matrix`, `edge-cases-exhaustive*`, `*-matrix.test.ts`); run `pnpm test:count-gate` before release.
- **Link checks:** run `pnpm doc:check-links` before PR; wired in `pnpm verify`.
- **Status lines:** bump guide status when releasing; do not change `proposal.MD` draft status.

## Releases

Maintainers follow [`docs/publishing.md`](./docs/publishing.md) — `pnpm release:prep`, git tag `vX.Y.Z`, `npm publish`, GitHub Release from CHANGELOG (no dates in CHANGELOG headers).

## Architecture diagrams

Sources live in [`docs/img/`](./docs/img/) as `.mmd` files. **Always commit matching `.svg`** files — npm/GitHub README cannot run Mermaid.

```bash
pnpm diagrams:build
```

See [`docs/img/README.md`](./docs/img/README.md).

## Development

```bash
pnpm install
pnpm verify
```

## Pull requests

1. Branch from `main`.
2. Ensure `pnpm verify` passes locally.
3. Include fixtures for new rule behavior (**LSG-R**, **LSG-C**, **LSG-T**).
4. Regenerate SVGs if any `.mmd` file changed.
5. Do not expand scope into HTTP clients, agent loops, or provider adapters — see proposal non-goals.
