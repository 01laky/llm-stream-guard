# JSON schemas (npm package)

**Ships on npm** under `schemas/` alongside `dist/`. GitHub hosts full docs under `docs/`.

## What's included

| File                                                 | Purpose                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`policy-v1.json`](./policy-v1.json)                 | Mirror of policy document shape (`version`, `mode`, `rules`, `byte`, `extends`) |
| [`tools-manifest-v1.json`](./tools-manifest-v1.json) | Static tools manifest (`version: "1"`, `tools[].name`)                          |

## Runtime authority

The JSON Schema files are **documentation mirrors**. Authoritative validation at runtime uses TypeScript validators:

- **`validatePolicy()`** — policy files ([`docs/policy-reference.md`](../docs/policy-reference.md))
- **`validateManifestDocument()`** — tool manifests ([`docs/static-scanning.md`](../docs/static-scanning.md))

If schema and runtime diverge, trust runtime + file an issue (see COV176–185 in repo tests).

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
