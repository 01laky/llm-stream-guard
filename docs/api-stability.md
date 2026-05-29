# API stability (1.0.0)

**Status:** **1.0.0** — semver guarantees for the public surface documented here.

---

## Stable in 1.x

| Surface                                                 | Guarantee                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `createByteGuard`, `guardEvents`, rule factories        | Behavior and option shapes frozen for matching major                   |
| `createGuardFromPolicy`, `loadPolicy`, `validatePolicy` | Policy compile semantics stable; new optional rule keys are additive   |
| `onFinish` + `StreamGuardSummary`                       | Summary keys stable; new optional fields may appear in minors          |
| `summarizeGuardContext`                                 | Same shape as `onFinish` payload                                       |
| CLI commands                                            | `validate`, `resolve`, `scan`, `diff`, `profiles`, `audit *`, `doctor` |
| SARIF export                                            | Rule IDs in [sarif-rule-ids.md](./sarif-rule-ids.md) frozen for 1.x    |
| JSON report schemas                                     | `schemas/*-v1.json` versioned by filename                              |

---

## Breaking change policy

- **MAJOR** — removed exports, changed default violation semantics, renamed SARIF rule IDs, incompatible policy schema version.
- **MINOR** — new rules, optional summary fields, new CLI flags, new diagram-only docs.
- **PATCH** — fixes, performance, docs, test fixtures.

Pre-1.0 releases did not promise semver on SARIF or Action pins. From **1.0.0**, pin Actions and npm to `@v1.0.0` or `@v1` tag policy your team chooses.

---

## Internal / not semver-guaranteed

- `GuardContext` mutation beyond documented `reset()`
- Undocumented `WeakMap` pipeline slots on context
- Test-only helpers under `test/helpers/`

---

## Verification

- `pnpm gate:stable-language` — no pre-release SARIF wording in `src/`, `action/`, `docs/` (allowlisted historical docs).
- `test/sarif-stable.test.ts` (LSG-SAR01–80), `test/schema-contract.test.ts` (LSG-SCH01–35), `test/edge-cases-phase10-exhaustive.test.ts` (LSG-XEC1201–2220), `test/edge-cases-phase10.1-exhaustive.test.ts` (LSG-XEC2231–2830).

See [migration-0.x-to-1.0.md](./migration-0.x-to-1.0.md) when upgrading from 0.9.x.
