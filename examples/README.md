# Examples index

Typechecked cookbook recipes (`pnpm examples:typecheck`). **Hono / Express / AI SDK / assemble** use stub types — install those packages in **your app** only.

| Path                                       | Recipe                                 | Test ID                 |
| ------------------------------------------ | -------------------------------------- | ----------------------- |
| `byte-proxy/hono.ts`                       | Hono SSE proxy + `createByteGuard`     | LSG-CBK02, LSG-CBK12    |
| `byte-proxy/express.ts`                    | Express + `Readable.fromWeb` bridge    | LSG-CBK03               |
| `byte-proxy/workers.ts`                    | Cloudflare Workers fetch handler       | LSG-CBK04, LSG-CBK26    |
| `event-gate/agent-loop.ts`                 | Guard-before-execute loop              | LSG-CBK05, LSG-CBK21–22 |
| `event-gate/policy-driven.ts`              | `loadPolicy` + `createGuardFromPolicy` | LSG-CBK06, LSG-CBK23    |
| `assemble-mapper/stream-event-to-guard.ts` | Stub `StreamEvent` → `GuardEvent`      | LSG-CBK07, LSG-CBK25    |
| `ai-sdk-mapper/map-stream-part.ts`         | Stub AI SDK parts → `GuardEvent`       | LSG-CBK29               |
| `dual-stream/audit-side-channel.ts`        | Audit log + client stream              | LSG-CBK08, LSG-CBK24    |
| `policy-ci/scan-fixtures.sh`               | CLI validate + scan in CI              | LSG-CBK09, LSG-CBK27    |
| `minimal-node/smoke.mjs`                   | Dist smoke after build                 | LSG-CBK28               |

## Run

```bash
pnpm build
pnpm examples:typecheck
pnpm examples:smoke
bash examples/policy-ci/scan-fixtures.sh
```

Optional local install:

```bash
cd examples/minimal-node && npm install && node smoke.mjs
```

See [integration cookbook](../docs/integration-cookbook.md).
