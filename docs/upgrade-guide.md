# Upgrade guide

**Status:** **0.9.0** — semver jumps for npm, GitHub Action, test fortress, and documentation layout.

Historical per-release notes remain in FAQ **What works in X.Y.Z?** sections.

---

## From 0.8.2 → 0.9.0

- **Test-only release** — **≥4000** Vitest tests; programmatic edge matrices (LSG-XEC), property invariants (PROP), npm pack smoke (PKG), security negatives (SEC).
- **No API / CLI / Action schema changes** — upgrade for confidence and CI gates only.
- **New scripts:** `pnpm test:count-gate`, `pnpm test:coverage-map`, `pnpm test:timing` (informational).
- **npm:** `npm install llm-stream-guard@0.9.0`
- **GitHub Action:** optional pin `@v0.9.0` when released on Action track (docs may still reference `@v0.8.2` until Action tag published).

```yaml
- uses: 01laky/llm-stream-guard/action@v0.9.0
```

---

## From 0.7.0 → 0.8.x

- **No API breaking changes** — same `createByteGuard`, `guardEvents`, policy loader, CLI commands.
- **Docs reorganized** — start at [Getting started](./getting-started.md), [Policy reference](./policy-reference.md), [CLI reference](./cli-reference.md).
- **npm:** `npm install llm-stream-guard@0.8.2`
- **Tests:** exhaustive coverage (LSG-COV) unchanged in behavior; doc gates added in 0.8.2.

---

## From 0.8.0 / 0.8.1 → 0.8.2

- **0.8.1** — npm `bin` path fix (`dist/cli.js` without `./` prefix). Upgrade if CLI missing after `npm install -g`.
- **0.8.2** — [Troubleshooting](./troubleshooting.md), [schemas README](../schemas/README.md), [security reporting](./security-reporting.md), [upgrade guide](./upgrade-guide.md), [threat model stub](./threat-model-stub.md).
- **GitHub Action:** pin `01laky/llm-stream-guard/action@v0.8.2` (replace `@v0.5.0` / `@v0.7.0`).

```yaml
- uses: 01laky/llm-stream-guard/action@v0.8.2
  with:
    policy: policies/agent-gate.json
```

---

## npm install

```bash
npm install llm-stream-guard@0.8.2
# or
pnpm add llm-stream-guard@0.8.2
```

Verify CLI:

```bash
npx llm-stream-guard validate policies/agent-gate.json
```

---

## Where docs live

| Location           | Contents                                                        |
| ------------------ | --------------------------------------------------------------- |
| **GitHub `docs/`** | Full guides (getting started, cookbook, CI, troubleshooting)    |
| **npm tarball**    | `README.md`, `dist/`, `schemas/` (includes `schemas/README.md`) |

---

## CLI unchanged

Same commands — see [CLI reference](./cli-reference.md). Exit codes: router **0–2**, audit subcommands **0–3**.

Related: [CHANGELOG](../CHANGELOG.md) · [Publishing](./publishing.md)
