# npm & GitHub release checklist

**Maintainer-only** — same manual flow as [llm-stream-assemble](https://github.com/01laky/llm-stream-assemble).

`pnpm release:prep` validates version/docs/dist/npm drift. It does **not** tag, publish, or mutate git.

## Pre-flight

1. `pnpm verify` green on `main` at the release commit.
2. `pnpm release:prep` — version, README badges, CHANGELOG, dist, test badge, npm pack.
3. `pnpm smoke:package` — install tarball in temp project; ESM + CJS import smoke.
4. Confirm `package.json` has **no** `"private": true`.
5. `npm pack --dry-run --json` — confirm `files` whitelist (`dist`, `schemas`, `README.md`, `LICENSE`; **`bin.llm-stream-guard`** → `dist/cli.js` since **0.3.0**).

## Publish

1. `npm login` + 2FA enabled on npm account.
2. `git tag vX.Y.Z && git push origin vX.Y.Z` from the release commit.
3. `npm publish` from a clean tree matching git tag `vX.Y.Z`.
4. **GitHub Release** — title `vX.Y.Z`, body from `CHANGELOG.md` `## [X.Y.Z]`.
   - Optional draft: `.local-playground/release-X.Y.Z.md` (gitignored).
5. Verify `npm view llm-stream-guard version`.

## Badge conventions (stable 0.3.0+)

| Badge      | Pattern                                          |
| ---------- | ------------------------------------------------ |
| **core**   | `core-X.Y.Z-brightgreen`                         |
| **status** | `status-stable_X.Y.Z-brightgreen`                |
| **tests**  | `tests-N_passing-brightgreen` (N = vitest count) |

README status line: **Stable `X.Y.Z`**.

`scripts/release-prep.mjs` rejects scaffold-orange badges for stable releases.

## npm provenance (optional, later)

Enable [npm provenance](https://docs.npmjs.com/generating-provenance-statements) via GitHub Actions when publish automation is added. Assemble defers automated publish to a future release.

## Security

Do not commit `.env`, API keys, or live capture fixtures. Redact before any fixture lands in `test/fixtures/`.
