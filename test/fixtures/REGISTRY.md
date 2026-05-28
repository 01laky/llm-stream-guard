# Fixture registry

Synthetic secrets only — never real keys.

| ID        | File(s)                                                            | Rule               | Mode  | Notes                            |
| --------- | ------------------------------------------------------------------ | ------------------ | ----- | -------------------------------- |
| LSG-C04   | byte-sse/sk-mid-line.sse + sk-mid-line.expected.sse                | byte redactSecrets | block | split inside sk- token           |
| LSG-POL\* | byte-sse/data-prefix-sk.sse                                        | byte redactSecrets | block | SSE `data:` prefix before secret |
| LSG-R14   | redaction/text-sk.input.json + text-sk.expected.json               | redactSecrets      | warn  | event golden                     |
| LSG-T11   | tool-policy/allow-blocked.input.json + allow-blocked.expected.json | allowTools         | block |                                  |
| LSG-POL\* | events/bad-tool.json                                               | allowTools         | block | CLI scan event fixture           |
| LSG-CBK27 | events/clean-tool.json                                             | allowTools         | block | clean scan fixture (exit 0)      |
| LSG-POL\* | policies/valid/minimal.json                                        | policy validate    | —     | valid policy golden              |
| LSG-POL\* | policies/valid/extends-agent.resolved.json                         | policy merge       | —     | expected resolved extends        |
| LSG-POL\* | policies/invalid/missing-version.json                              | policy validate    | —     | POLICY_E001                      |
| LSG-POL\* | policies/invalid/bad-regexp.json                                   | policy validate    | —     | POLICY_E003                      |
| LSG-POL\* | policies/invalid/allow-deny-overlap.json                           | policy validate    | —     | POLICY_E009                      |
| LSG-POL\* | policies/invalid/empty-allow-block.json                            | policy validate    | —     | POLICY_E010 / POLICY_E008        |

Policy rows are also tracked in `policies/REGISTRY.md` (`pnpm fixtures:audit-policy-registry`).

Tool manifest rows are tracked in `tools/REGISTRY.md` (`pnpm fixtures:audit-tools-registry`).

Maintained by `pnpm fixtures:check-redaction`, `pnpm fixtures:check-policies`, `pnpm fixtures:audit-registry`, and `pnpm fixtures:audit-tools-registry`.
