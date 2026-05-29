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

| LSG-C9-01 | byte-sse/phase9/split-01.sse + split-01.expected.sse | byte redactSecrets | block | split index 1 |
| LSG-C9-02 | byte-sse/phase9/split-02.sse + split-02.expected.sse | byte redactSecrets | block | split index 2 |
| LSG-C9-03 | byte-sse/phase9/split-03.sse + split-03.expected.sse | byte redactSecrets | block | split index 3 |
| LSG-C9-04 | byte-sse/phase9/split-04.sse + split-04.expected.sse | byte redactSecrets | block | split index 4 |
| LSG-C9-05 | byte-sse/phase9/split-05.sse + split-05.expected.sse | byte redactSecrets | block | split index 5 |
| LSG-C9-06 | byte-sse/phase9/split-06.sse + split-06.expected.sse | byte redactSecrets | block | split index 6 |
| LSG-C9-07 | byte-sse/phase9/split-07.sse + split-07.expected.sse | byte redactSecrets | block | split index 7 |
| LSG-C9-08 | byte-sse/phase9/split-08.sse + split-08.expected.sse | byte redactSecrets | block | split index 8 |
| LSG-C9-09 | byte-sse/phase9/split-09.sse + split-09.expected.sse | byte redactSecrets | block | split index 9 |
| LSG-C9-10 | byte-sse/phase9/split-10.sse + split-10.expected.sse | byte redactSecrets | block | split index 10 |
| LSG-C9-11 | byte-sse/phase9/split-11.sse + split-11.expected.sse | byte redactSecrets | block | split index 11 |
| LSG-C9-12 | byte-sse/phase9/split-12.sse + split-12.expected.sse | byte redactSecrets | block | split index 12 |
| LSG-C9-13 | byte-sse/phase9/split-13.sse + split-13.expected.sse | byte redactSecrets | block | split index 13 |
| LSG-C9-14 | byte-sse/phase9/split-14.sse + split-14.expected.sse | byte redactSecrets | block | split index 14 |
| LSG-C9-15 | byte-sse/phase9/split-15.sse + split-15.expected.sse | byte redactSecrets | block | split index 15 |
| LSG-C9-16 | byte-sse/phase9/split-16.sse + split-16.expected.sse | byte redactSecrets | block | split index 16 |
| LSG-C9-17 | byte-sse/phase9/split-17.sse + split-17.expected.sse | byte redactSecrets | block | split index 17 |
| LSG-C9-18 | byte-sse/phase9/split-18.sse + split-18.expected.sse | byte redactSecrets | block | split index 18 |
| LSG-C9-19 | byte-sse/phase9/split-19.sse + split-19.expected.sse | byte redactSecrets | block | split index 19 |
| LSG-C9-20 | byte-sse/phase9/split-20.sse + split-20.expected.sse | byte redactSecrets | block | split index 20 |
| LSG-C9-21 | byte-sse/phase9/split-21.sse + split-21.expected.sse | byte redactSecrets | block | split index 21 |
| LSG-C9-22 | byte-sse/phase9/split-22.sse + split-22.expected.sse | byte redactSecrets | block | split index 22 |
| LSG-C9-23 | byte-sse/phase9/split-23.sse + split-23.expected.sse | byte redactSecrets | block | split index 23 |
| LSG-C9-24 | byte-sse/phase9/split-24.sse + split-24.expected.sse | byte redactSecrets | block | split index 24 |
| LSG-C9-25 | byte-sse/phase9/split-25.sse + split-25.expected.sse | byte redactSecrets | block | split index 25 |
| LSG-C9-26 | byte-sse/phase9/split-26.sse + split-26.expected.sse | byte redactSecrets | block | split index 26 |
| LSG-C9-27 | byte-sse/phase9/split-27.sse + split-27.expected.sse | byte redactSecrets | block | split index 27 |
| LSG-C9-28 | byte-sse/phase9/split-28.sse + split-28.expected.sse | byte redactSecrets | block | split index 28 |
| LSG-C9-29 | byte-sse/phase9/split-29.sse + split-29.expected.sse | byte redactSecrets | block | split index 29 |
| LSG-C9-30 | byte-sse/phase9/split-30.sse + split-30.expected.sse | byte redactSecrets | block | split index 30 |
| LSG-C9-31 | byte-sse/phase9/split-31.sse + split-31.expected.sse | byte redactSecrets | block | split index 31 |
| LSG-C9-32 | byte-sse/phase9/split-32.sse + split-32.expected.sse | byte redactSecrets | block | split index 32 |
| LSG-C9-33 | byte-sse/phase9/split-33.sse + split-33.expected.sse | byte redactSecrets | block | split index 33 |
| LSG-C9-34 | byte-sse/phase9/split-34.sse + split-34.expected.sse | byte redactSecrets | block | split index 34 |
| LSG-C9-35 | byte-sse/phase9/split-35.sse + split-35.expected.sse | byte redactSecrets | block | split index 35 |

| LSG-C9-36 | byte-sse/phase9/split-36.sse + split-36.expected.sse | byte redactSecrets | block | split index 36 |
| LSG-C9-37 | byte-sse/phase9/split-37.sse + split-37.expected.sse | byte redactSecrets | block | split index 37 |
| LSG-C9-38 | byte-sse/phase9/split-38.sse + split-38.expected.sse | byte redactSecrets | block | split index 0 |
| LSG-C9-39 | byte-sse/phase9/split-39.sse + split-39.expected.sse | byte redactSecrets | block | split index 1 |
| LSG-C9-40 | byte-sse/phase9/split-40.sse + split-40.expected.sse | byte redactSecrets | block | split index 2 |
| LSG-C9-41 | byte-sse/phase9/split-41.sse + split-41.expected.sse | byte redactSecrets | block | split index 3 |
| LSG-C9-42 | byte-sse/phase9/split-42.sse + split-42.expected.sse | byte redactSecrets | block | split index 4 |
| LSG-C9-43 | byte-sse/phase9/split-43.sse + split-43.expected.sse | byte redactSecrets | block | split index 5 |
| LSG-C9-44 | byte-sse/phase9/split-44.sse + split-44.expected.sse | byte redactSecrets | block | split index 6 |
| LSG-C9-45 | byte-sse/phase9/split-45.sse + split-45.expected.sse | byte redactSecrets | block | split index 7 |
| LSG-C9-46 | byte-sse/phase9/split-46.sse + split-46.expected.sse | byte redactSecrets | block | split index 8 |
| LSG-C9-47 | byte-sse/phase9/split-47.sse + split-47.expected.sse | byte redactSecrets | block | split index 9 |
| LSG-C9-48 | byte-sse/phase9/split-48.sse + split-48.expected.sse | byte redactSecrets | block | split index 10 |
| LSG-C9-49 | byte-sse/phase9/split-49.sse + split-49.expected.sse | byte redactSecrets | block | split index 11 |
| LSG-C9-50 | byte-sse/phase9/split-50.sse + split-50.expected.sse | byte redactSecrets | block | split index 12 |
| LSG-C9-51 | byte-sse/phase9/split-51.sse + split-51.expected.sse | byte redactSecrets | block | split index 13 |
| LSG-C9-52 | byte-sse/phase9/split-52.sse + split-52.expected.sse | byte redactSecrets | block | split index 14 |
| LSG-C9-53 | byte-sse/phase9/split-53.sse + split-53.expected.sse | byte redactSecrets | block | split index 15 |
| LSG-C9-54 | byte-sse/phase9/split-54.sse + split-54.expected.sse | byte redactSecrets | block | split index 16 |
| LSG-C9-55 | byte-sse/phase9/split-55.sse + split-55.expected.sse | byte redactSecrets | block | split index 17 |
| LSG-C9-56 | byte-sse/phase9/split-56.sse + split-56.expected.sse | byte redactSecrets | block | split index 18 |
| LSG-C9-57 | byte-sse/phase9/split-57.sse + split-57.expected.sse | byte redactSecrets | block | split index 19 |
| LSG-C9-58 | byte-sse/phase9/split-58.sse + split-58.expected.sse | byte redactSecrets | block | split index 20 |
| LSG-C9-59 | byte-sse/phase9/split-59.sse + split-59.expected.sse | byte redactSecrets | block | split index 21 |
| LSG-C9-60 | byte-sse/phase9/split-60.sse + split-60.expected.sse | byte redactSecrets | block | split index 22 |
| LSG-C9-61 | byte-sse/phase9/split-61.sse + split-61.expected.sse | byte redactSecrets | block | split index 23 |
| LSG-C9-62 | byte-sse/phase9/split-62.sse + split-62.expected.sse | byte redactSecrets | block | split index 24 |
| LSG-C9-63 | byte-sse/phase9/split-63.sse + split-63.expected.sse | byte redactSecrets | block | split index 25 |
| LSG-C9-64 | byte-sse/phase9/split-64.sse + split-64.expected.sse | byte redactSecrets | block | split index 26 |
| LSG-C9-65 | byte-sse/phase9/split-65.sse + split-65.expected.sse | byte redactSecrets | block | split index 27 |
| LSG-C9-66 | byte-sse/phase9/split-66.sse + split-66.expected.sse | byte redactSecrets | block | split index 28 |
| LSG-C9-67 | byte-sse/phase9/split-67.sse + split-67.expected.sse | byte redactSecrets | block | split index 29 |
| LSG-C9-68 | byte-sse/phase9/split-68.sse + split-68.expected.sse | byte redactSecrets | block | split index 30 |

Policy rows are also tracked in `policies/REGISTRY.md` (`pnpm fixtures:audit-policy-registry`).

Tool manifest rows are tracked in `tools/REGISTRY.md` (`pnpm fixtures:audit-tools-registry`).

Maintained by `pnpm fixtures:check-redaction`, `pnpm fixtures:check-policies`, `pnpm fixtures:audit-registry`, and `pnpm fixtures:audit-tools-registry`.
