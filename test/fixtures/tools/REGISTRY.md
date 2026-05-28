# Tools manifest fixtures (Phase 4 static audit)

| File                                | Purpose                                       |
| ----------------------------------- | --------------------------------------------- |
| agent-tools.json                    | Valid manifest aligned with agent-gate.json   |
| agent-tools-invalid.json            | Schema violation (empty tool name)            |
| agent-tools-drift.json              | web_search drift vs agent-gate allowlist      |
| agent-tools-dangerous.json          | D001 curl pipe to sh in description           |
| agent-tools-block-args.json         | blockToolArgs static match under proxy-strict |
| agent-tools-deny.json               | bash declared under proxy-strict denyTools    |
| agent-tools.yaml                    | YAML tools list extraction                    |
| mcp-tools.json                      | MCP-shaped tools array                        |
| openapi-x-tools.json                | OpenAPI components.x-tools subset             |
| walk/apps/agent/tools/manifest.json | Include-prefix fixture                        |
| walk/binary-tools.dat               | Binary skipped without throw                  |

`node_modules` skip is covered by **LSG-STA13** (temp dir in test, not a committed fixture — `node_modules/` is gitignored).
