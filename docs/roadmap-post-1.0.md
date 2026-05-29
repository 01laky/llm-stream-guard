# Roadmap (post-1.0)

**Status:** **1.0.0** — ideas only, not committed releases.

---

## Near-term candidates

| Feature                    | Notes                                          |
| -------------------------- | ---------------------------------------------- |
| `blockShellMetachars()`    | Preset for tool args targeting shell execution |
| `rateLimitToolCalls(n)`    | Cap tool invocations per stream                |
| `allowRegexToolNames()`    | Allow `read_*` without enumerating every name  |
| `redactStructuredFields()` | Redact JSON keys by name in tool args          |
| WebSocket binary mode      | Same byte guard on non-SSE transports          |

---

## Explicitly not planned in core

- LLM-as-judge classification
- Hosted guard SaaS
- Provider adapters (see llm-stream-assemble)

Full table from the original proposal lives in [proposal.MD § Post-1.0 horizon](./proposal.MD#post-10-horizon-ideas-not-committed).

---

## semver impact

Features shipped as **additive** rule keys or optional CLI flags target **MINOR** bumps. Changes to frozen SARIF rule IDs or policy `version` const require **MAJOR**.
