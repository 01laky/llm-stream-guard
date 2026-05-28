# Fixture registry

Synthetic secrets only — never real keys.

| ID      | File(s)                                                            | Rule               | Mode  | Notes                  |
| ------- | ------------------------------------------------------------------ | ------------------ | ----- | ---------------------- |
| LSG-C04 | byte-sse/sk-mid-line.sse + sk-mid-line.expected.sse                | byte redactSecrets | block | split inside sk- token |
| LSG-R14 | redaction/text-sk.input.json + text-sk.expected.json               | redactSecrets      | warn  | event golden           |
| LSG-T11 | tool-policy/allow-blocked.input.json + allow-blocked.expected.json | allowTools         | block |                        |

Maintained by `pnpm fixtures:check-redaction` and `pnpm fixtures:audit-registry`.
