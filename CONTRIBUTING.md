# Contributing to llm-stream-guard

**Maintainer:** Ladislav Kostolny ([01laky@gmail.com](mailto:01laky@gmail.com))

Thank you for your interest in contributing.

## Canonical spec

Read [`docs/proposal.MD`](./docs/proposal.MD) before making changes. It defines scope, the `GuardEvent` model, MVP rules, and non-goals.

For integration patterns, see [`docs/integration-cookbook.md`](./docs/integration-cookbook.md) (expanded in v0.3).

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

| Prefix      | Purpose                       |
| ----------- | ----------------------------- |
| **LSG-S**   | Scaffold / smoke              |
| **LSG-B**   | Build artifact / dist hygiene |
| **LSG-E**   | Extended edge-case wiring     |
| **LSG-C**   | Chunk-boundary byte streams   |
| **LSG-R**   | Redaction golden fixtures     |
| **LSG-T**   | Tool policy tests             |
| **LSG-REL** | Release / publish readiness   |

Document new IDs in test headers; maintain `test/fixtures/REGISTRY.md` from Phase 1 onward.

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
