# FAQ archive (pre-1.0 version history)

**Status:** **1.0.0** — historical “What works in X.Y.Z” sections moved from [faq.md](./faq.md). Current release FAQ stays in the main file.

---

## What works in 0.9.0?

Phase 9 **test fortress** — **≥4000** Vitest tests (LSG-XEC matrices, PROP invariants, PKG tarball smoke, SEC negatives), `pnpm test:count-gate`, `golden-runner` fixtures, `test-fortress` diagram. **No API breaking changes.**

---

## What works in 0.8.2?

Phase 8 completion: troubleshooting, schemas README, security reporting, upgrade guide, threat model (then stub), **LSG-DOC01–35** + **REL31–43** gates, `pnpm doc:check-links`. Action docs pin `@v0.8.2`.

---

## What works in 0.8.1?

npm **bin path fix** (`dist/cli.js` without `./`); version/badge sync with 0.8.x docs track.

---

## What works in 0.7.0?

Everything in **0.6.0** plus exhaustive test coverage (**LSG-COV01–220**), manifest **line numbers in SARIF**, `./audit` tarball smoke.

---

## What works in 0.6.0?

Source refactor (`shared/`, `scan/`, `./audit` export), **LSG-REF01–REF25**.

---

## What works in 0.5.0?

GitHub Action (`action/`), **`audit static`** / drift / dangerous-pattern catalog (**D001–D006**), SARIF export (then preview), pre-commit recipe.

---

## What works in 0.4.0?

Expanded integration cookbook, runnable `examples/`, migration/MCP/LiteLLM guides.

---

## What works in 0.3.0?

Declarative policies, built-in profiles, CLI `validate` / `resolve` / `scan` / `diff`.

---

## What works in 0.2.0?

`redactSecrets()`, `redactPII()`, tool policy factories, `sanitizeErrors()`, byte flags on `createByteGuard()`.
