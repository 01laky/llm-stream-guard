# Migration: 0.x → 1.0.0

**Status:** **1.0.0** — historical reference for adopters on 0.9.x.

---

## Summary

| Area               | 0.9.x                                       | 1.0.0                                                    |
| ------------------ | ------------------------------------------- | -------------------------------------------------------- |
| SARIF              | Preview disclaimers, `sarif-preview` module | Stable `staticScanToSarif`, frozen rule IDs              |
| Action `sarif-out` | Described as preview                        | Stable SARIF 2.1.0 output                                |
| Stream summary     | Ad-hoc violation lists                      | `onFinish(StreamGuardSummary)` + `summarizeGuardContext` |
| Threat model doc   | `threat-model-stub.md`                      | [threat-model.md](./threat-model.md)                     |
| Doctor CLI         | —                                           | `llm-stream-guard doctor`                                |

No intentional breaking changes to policy `version: "1"` documents or core rule factories.

---

## Code changes

### onFinish reporting

```js
import { createByteGuard } from "llm-stream-guard";

const guard = createByteGuard({
	redactSecrets: true,
	policyVersion: "prod-gate",
	onFinish: (summary) => {
		metrics.increment("guard.redactions", summary.redactions);
		for (const [rule, count] of Object.entries(summary.countsByRule)) {
			metrics.increment(`guard.violation.${rule}`, count);
		}
	},
});
```

Event mode: pass `onFinish` on `guardEvents` config or `createGuardFromPolicy(path, { onFinish })`.

### SARIF

Replace imports of any local `sarif-preview` copy with:

```ts
import { staticScanToSarif, SARIF_RULE_CATALOG } from "llm-stream-guard/audit";
```

GitHub Code Scanning category: `llm-stream-guard` (not `llm-stream-guard-preview`).

---

## CI / Action

```yaml
uses: 01laky/llm-stream-guard/action@v1.0.0
```

Remove fork-only “preview schema” comments; upload SARIF when `sarif-out` is set.

---

## Docs map

- API stability: [api-stability.md](./api-stability.md)
- Performance budgets: [performance.md](./performance.md)
- Post-1.0 ideas: [roadmap-post-1.0.md](./roadmap-post-1.0.md)
- Archived version FAQ: [faq-archive.md](./faq-archive.md)
