# JSON schemas (npm package)

**Ships on npm** under `schemas/` alongside `dist/`. GitHub hosts full docs under `docs/`.

**Status:** **1.0.0**

## What's included

| File                                                             | Purpose                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| [`policy-v1.json`](./policy-v1.json)                             | Policy document (`version`, `mode`, `rules`, `byte`) |
| [`tools-manifest-v1.json`](./tools-manifest-v1.json)             | Tools manifest (`version: "1"`, `tools[].name`)      |
| [`scan-report-v1.json`](./scan-report-v1.json)                   | CLI `scan --json` report                             |
| [`static-scan-report-v1.json`](./static-scan-report-v1.json)     | `audit static --json` report                         |
| [`stream-guard-summary-v1.json`](./stream-guard-summary-v1.json) | `onFinish` / `summarizeGuardContext` summary         |

## Runtime authority

The JSON Schema files are **documentation mirrors**. Authoritative validation at runtime uses TypeScript validators:

- **`validatePolicy()`** — policy files ([`docs/policy-reference.md`](../docs/policy-reference.md))
- **`validateManifestDocument()`** — tool manifests ([`docs/static-scanning.md`](../docs/static-scanning.md))

If schema and runtime diverge, trust runtime + file an issue (see LSG-SCH01–35, COV176–185).

## Validate in CI

No **ajv** (or other validator) is bundled — zero runtime npm dependencies.

```bash
npx llm-stream-guard validate policies/agent-gate.json
npx llm-stream-guard audit validate-manifest --manifest tools/manifest.json
```

## Examples

- Policies: [`../policies/`](../policies/)
- Manifest: [`../tools/manifest.json`](../tools/manifest.json)
- Fixtures: [`../test/fixtures/policies/`](../test/fixtures/policies/)
