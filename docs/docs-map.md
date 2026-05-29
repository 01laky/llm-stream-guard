# Documentation map

**Status:** **1.0.0** — structured learning paths for beginners through maintainers.

Use this page when you are not sure **which doc to read first**. Every guide links back here.

---

## Who are you?

| Persona                 | Goal                                               | Start here                                                                     | Then                                                                           |
| ----------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **Complete beginner**   | “What is LLM streaming and why would I filter it?” | [Getting started](./getting-started.md)                                        | [Concepts & glossary](./concepts-and-glossary.md)                              |
| **Backend dev (proxy)** | Hide secrets in SSE before the browser             | [Getting started § Byte mode](./getting-started.md#byte-mode-your-first-guard) | [Cookbook §2 Byte proxies](./integration-cookbook.md#2-byte-mode-proxies)      |
| **Agent / tool dev**    | Block bad tool names or args before execution      | [Getting started § Event mode](./getting-started.md#event-mode-tool-gate)      | [Cookbook §3 Event gate](./integration-cookbook.md#3-event-mode-tool-gate)     |
| **Platform / security** | Team policies, CI gates, drift detection           | [Policy reference](./policy-reference.md)                                      | [Static scanning](./static-scanning.md) → [CI & Action](./ci-github-action.md) |
| **Maintainer**          | Publish, test matrix, architecture                 | [Testing strategy](./testing-strategy.md)                                      | [Publishing](./publishing.md) · [proposal.MD](./proposal.MD)                   |

Examples by persona: [`examples/README.md`](../examples/README.md)

---

## Learning path (recommended order)

```text
1. getting-started.md          ← install, first working example, pick a mode
2. concepts-and-glossary.md    ← SSE, GuardEvent, block/warn/audit
3. integration-cookbook.md     ← copy-paste recipes (Hono, agent loop, CI)
4. policy-reference.md         ← JSON/YAML rules, profiles, error codes
5. cli-reference.md            ← offline scan, validate, audit static
6. static-scanning.md          ← manifest drift, D001–D006, SARIF
7. ci-github-action.md         ← PR gates, GitHub Action inputs
8. faq.md · comparison.md      ← edge questions & alternatives
9. troubleshooting.md          ← symptom → cause → fix
10. security-reporting.md      ← bypass reports (see SECURITY.md)
11. upgrade-guide.md           ← semver jumps (0.x → 1.0)
12. threat-model.md            ← scope & trust boundaries
13. api-stability.md          ← 1.x guarantees
14. migration-0.x-to-1.0.md   ← SARIF + onFinish migration
```

Diagram: [`docs/img/getting-started-journey.svg`](./img/getting-started-journey.svg)

---

## By topic

### Runtime API (in your app)

| Topic               | Doc                                                                                  | Diagram                                                  |
| ------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Byte vs event mode  | [Getting started](./getting-started.md#which-mode-do-i-need)                         | [modes.svg](./img/modes.svg)                             |
| End-to-end pipeline | [README § Architecture](../README.md#architecture)                                   | [pipeline.svg](./img/pipeline.svg)                       |
| `GuardEvent` shapes | [Concepts § GuardEvent](./concepts-and-glossary.md#guardevent)                       | [guard-event.svg](./img/guard-event.svg)                 |
| Tool call phases    | [Concepts § Tool calls](./concepts-and-glossary.md#tool-calls)                       | [tool-call-lifecycle.svg](./img/tool-call-lifecycle.svg) |
| Violation modes     | [Concepts § Modes](./concepts-and-glossary.md#violation-modes-block-warn-audit)      | [violation-modes.svg](./img/violation-modes.svg)         |
| Chunk redaction     | [Concepts § Byte lookback](./concepts-and-glossary.md#byte-mode-and-chunk-redaction) | [chunk-redaction.svg](./img/chunk-redaction.svg)         |
| Agent loop wiring   | [Cookbook §3](./integration-cookbook.md#3-event-mode-tool-gate)                      | [agent-gate-loop.svg](./img/agent-gate-loop.svg)         |
| Audit side channel  | [Cookbook §8](./integration-cookbook.md#8-dual-stream-audit)                         | [dual-stream.svg](./img/dual-stream.svg)                 |

### Policy & CLI (offline / CI)

| Topic                 | Doc                                                          | Diagram                                                        |
| --------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| Policy file format    | [Policy reference](./policy-reference.md)                    | [policy-compile.svg](./img/policy-compile.svg)                 |
| JSON schemas (npm)    | [schemas/README.md](../schemas/README.md)                    | —                                                              |
| Rule types map        | [Policy reference § Rules](./policy-reference.md#rule-types) | [policy-rules-map.svg](./img/policy-rules-map.svg)             |
| CLI commands          | [CLI reference](./cli-reference.md)                          | —                                                              |
| Static manifest audit | [Static scanning](./static-scanning.md)                      | [static-audit-flow.svg](./img/static-audit-flow.svg)           |
| GitHub Action         | [CI guide](./ci-github-action.md)                            | [ci-action-flow.svg](./img/ci-action-flow.svg)                 |
| Troubleshooting       | [Troubleshooting](./troubleshooting.md)                      | —                                                              |
| Security reports      | [Security reporting](./security-reporting.md)                | —                                                              |
| Upgrading             | [Upgrade guide](./upgrade-guide.md)                          | —                                                              |
| Threat model          | [Threat model](./threat-model.md)                            | [v1-stable-architecture.svg](./img/v1-stable-architecture.svg) |
| API stability         | [API stability](./api-stability.md)                          | —                                                              |
| Stream reporting      | [Migration § onFinish](./migration-0.x-to-1.0.md)            | [violation-report-flow.svg](./img/violation-report-flow.svg)   |

### Diagrams index

Full list and regeneration: [`docs/img/README.md`](./img/README.md)

---

## External packages (optional)

| Package                 | Role                              | Doc                                                    |
| ----------------------- | --------------------------------- | ------------------------------------------------------ |
| **llm-stream-assemble** | Parse provider SSE → typed events | [Ecosystem diagram](./img/ecosystem.svg) · Cookbook §6 |
| **Vercel AI SDK**       | Stream parts → map to GuardEvent  | Cookbook §7                                            |
| **MCP servers**         | Tool manifests → static audit     | [MCP recipe](./mcp-tool-gate-recipe.md)                |

**llm-stream-guard** does not depend on any of these. They appear only in cookbook examples.

---

## Maintainer / design

- [Product proposal](./proposal.MD) — original problem statement and non-goals
- [Testing strategy](./testing-strategy.md) — LSG-\* test ID prefixes
- [Publishing checklist](./publishing.md) — release prep
- [SECURITY.md](../SECURITY.md) — GitHub vulnerability entrypoint
