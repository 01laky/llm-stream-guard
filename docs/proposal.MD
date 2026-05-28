# llm-stream-guard — Project Proposal

**Status:** Draft (discussion only — not implemented)  
**Author:** Ladislav Kostolny ([@01laky](https://github.com/01laky))  
**Related work:** [llm-stream-assemble](https://github.com/01laky/llm-stream-assemble) (separate library, no code migration)

---

## One-liner

A standalone, zero-dependency TypeScript library for security filtering of LLM streams: redact secrets/PII, enforce tool-call policy, block dangerous argument patterns. Works on raw SSE bytes (`TransformStream`) and on parsed event streams. **No dependency on llm-stream-assemble.**

---

## Problem

When proxying or rendering LLM streams (proxy, agent runtime, chat UI), several classes of unsafe content leak downstream:

1. **Secrets in text deltas** — API keys, bearer tokens, JWTs appear inside model output or echoed request context.
2. **Dangerous tool-call arguments** — shell injection, exfil URLs, oversized payloads.
3. **Unauthorized tool names** — models invoke tools outside an allowlist.
4. **Raw provider errors** — internal URLs, request IDs, stack traces, or key-like strings forwarded to browsers.

Existing middleware (ShieldStack, CloakLLM, etc.) often filters **raw bytes before parsing**. That helps proxies but misses precise policy on assembled tool calls with valid JSON at `tool_call.done`. There is no focused, zero-dep library with both **byte mode** and **event mode** as first-class citizens.

---

## Solution — Two Modes

### Byte mode (proxy-first)

Drop-in guard on upstream `response.body` without parsing provider SSE:

```ts
response.body.pipeThrough(
  createByteGuard({ redactSecrets: true, sanitizeErrors: true })
);
```

Use when the app forwards provider-shaped SSE (or opaque bytes) and wants secret redaction + error sanitization without an assembly layer.

### Event mode (agent / parsed streams)

Policy on typed events after parsing (by any parser — assemble, AI SDK, custom):

```ts
guardEvents(events, redactSecrets(), allowTools(["search"]), blockToolArgs(/rm\s+-rf/));
```

Use when tool names and complete JSON arguments are available — especially **before tool execution**.

---

## Relationship to llm-stream-assemble

**This is a fresh library, not an extraction from assemble.**

| | llm-stream-assemble | llm-stream-guard |
|---|---|---|
| Question | *What did the provider send?* | *What may go downstream?* |
| Input | Raw bytes / provider payloads | Raw bytes **or** parsed events |
| Output | Unified `StreamEvent` (assembly) | Safe bytes / safe events |
| Dependency | — | **None** on assemble |

Assemble solves **parsing and assembly** (SSE line splits, fragmented tool JSON, reasoning channels, provider adapters). Guard solves **policy and redaction** — a different domain, threat model, and test matrix.

Assemble today includes a thin `sanitizeErrors` flag on `toSSE()` / the assembler. That is a proxy tip, not a guard library. Guard does not replace it and no code moves from assemble into guard.

### Composable pipelines (no hard coupling)

```text
A) Proxy byte mode (no assemble):
   upstream.body → createByteGuard() → browser

B) Proxy event mode (assemble in app code):
   assembleStream(body, adapter) → guardEvents(...) → toSSE / UI

C) Agent gate (no streaming):
   tool_call.done → guardEvents([event], allowTools(...)) → execute or block
```

Guard does not need to know whether events came from assemble, Vercel AI SDK, or a custom parser. v0.3 docs may show an “assemble + guard” recipe; that is cookbook only, not package architecture.

### Ecosystem positioning

> **assemble** = universal stream parser  
> **guard** = security filter for LLM streams (bytes or events)

Two npm packages, same author, zero runtime deps, MIT — an ecosystem, not a required monorepo.

---

## GuardEvent Model (Independent)

Guard defines its own minimal event union — not `StreamEvent`, not provider types:

| Type | Shape | Notes |
|------|--------|-------|
| `text` | `{ type, phase: "delta" \| "done", text }` | User-visible model text |
| `tool_call` | `{ type, phase, id?, name?, args?, argsText? }` | Policy target for tools |
| `reasoning` | `{ type, phase, text }` | Hidden reasoning channels |
| `error` | `{ type, message, code? }` | Sanitized downstream |
| `finish` | `{ type, reason? }` | Stream termination |

Intentionally excludes citations, logprobs, usage, metadata — guard does not need provenance events.

Apps using assemble (or others) map their event types to `GuardEvent` in a few lines at the app boundary. No compat layer in the core package.

---

## MVP Rules (v0.1)

| Rule | Purpose |
|------|---------|
| `redactSecrets()` | API keys, bearer tokens, JWT-shaped strings, common PAT patterns |
| `redactPII({ ... })` | Opt-in categories (email, phone, etc.) |
| `allowTools([])` | Allowlist tool names |
| `denyTools([])` | Blocklist tool names |
| `blockToolArgs(pattern \| RegExp \| fn)` | Block dangerous argument content |
| `maxToolArgsBytes(n)` | Cap streaming / final argument size |
| `sanitizeErrors()` | Generic error messages for downstream |
| `onViolation(callback)` | Audit / log / metrics hook |

### Composition

```ts
guardEvents(events, ...transforms)
pipeGuard(...transforms)           // byte-mode pipeline
createByteGuard(options)           // TransformStream factory
```

### Violation modes

| Mode | Behavior |
|------|----------|
| `block` | Substitute safe content; optionally emit `finish` with `reason: "policy_violation"` |
| `warn` | Transform + invoke `onViolation` |
| `audit` | Pass through (or redact only) + invoke `onViolation` for logging |

Global config (recommended):

```ts
guardEvents(events, {
  mode: "block",
  transforms: [redactSecrets(), allowTools(["search"])],
  onViolation: (v) => { /* log */ },
});
```

---

## Policy Semantics (Design Decisions)

### When to evaluate rules

| Rule | When |
|------|------|
| `allowTools` / `denyTools` | On first known `name` (delta or done) |
| `blockToolArgs` | **Primarily on `done`** when full JSON is valid |
| `maxToolArgsBytes` | During delta (streaming limit) and on done |
| `redactSecrets` / `redactPII` | All text/reasoning deltas and done |
| `sanitizeErrors` | On `error` events (and byte-mode error payloads) |

Evaluating `blockToolArgs` on incomplete JSON during delta phase causes false positives (e.g. fragment `"rm -"` inside a larger string).

### Block semantics in streams

For MVP, prefer **safe substitution** over hard stream truncation:

- **text delta:** redact or replace matched segment
- **tool_call violation:** drop or replace with error/finish events (configurable)
- **byte mode:** redact in place; optionally inject terminal SSE error

Pure “stop stream with no replacement” is poor UX in chat UIs.

### Byte mode and chunk boundaries

Secrets split across TCP chunks require a **stateful rolling buffer** (e.g. 64–128 byte lookback). Per-chunk regex without state will leak:

```text
chunk1: "sk-proj-abc"
chunk2: "defghijklmnop"
```

This is guard-specific hard problem; assemble does not solve it. MVP tests must include mid-chunk SSE splits and random split fuzzing.

### Byte mode and SSE framing

Byte mode MVP should treat input as **opaque bytes** for secret scanning. Optional SSE-aware error sanitization may replace `error` payload fields without full provider parsing. Full provider-specific SSE parsing stays out of scope (same as assemble non-goals for HTTP/adapters).

### PII scope

PII in code/JSON streams has high false-positive risk. MVP should use **opt-in categories**:

```ts
redactPII({ email: true, phone: false })
```

Default: conservative or all-off except secrets.

### UTF-8 safety

Redaction must be UTF-8 safe; test emoji and multi-byte characters split across chunk boundaries.

---

## Transform API (Sketch)

```ts
type GuardTransform = (
  event: GuardEvent,
  ctx: GuardContext,
) => GuardEvent | GuardEvent[] | null;
// null = drop event
```

Byte-mode equivalent operates on `Uint8Array` chunks with shared `GuardContext` (violation mode, counters, pending buffer).

---

## Non-goals

- HTTP client, auth, retries
- Agent loop, tool execution, memory, persistence
- UI / React components
- LLM-as-judge classifier
- Hard dependency on llm-stream-assemble, Vercel AI SDK, LangChain
- OpenAPI / MCP / static config scanner (roadmap v0.4 — static scan only, not live stream parsing)
- Provider adapters and SSE assembly (assemble’s job)
- Markdown/XML tag parsing from model text

---

## Tech Stack

| Item | Choice |
|------|--------|
| Language | TypeScript |
| Build | tsup → ESM + CJS + declarations |
| Runtime deps | **Zero** (CI: `verify:deps`) |
| Runtimes | Node 18+, Bun, Deno, Cloudflare Workers (Web Streams) |
| Tests | Vitest + SSE fixtures with chunk-boundary edge cases |
| License | MIT |
| npm | `llm-stream-guard` |
| GitHub | `01laky/llm-stream-guard` |

Reuse **project culture** from assemble (fixture style, golden tests, CI patterns) — not code.

---

## Target Audience

- Developers building **LLM proxies** (Hono, Express, Cloudflare Workers)
- **Agent builders** enforcing tool policy before execution
- Teams wanting a **drop-in guard** without an enterprise security platform

---

## Test Strategy

### Unit

- One test file per transform/rule
- Golden fixtures: input → redacted output
- Violation modes: block / warn / audit

### Integration

- Mid-chunk SSE splits (secrets, PII, tool args)
- Property-style: secret at random chunk boundaries always redacted
- Idempotency: double `guardEvents` does not produce `[REDACTED][REDACTED]`
- Transform ordering documented and tested
- Performance smoke: ~1 MB stream, bounded buffer growth

### Fixture naming (suggested)

Follow assemble-style IDs for traceability, e.g. `LSG-C01` chunk split, `LSG-R01` redaction golden.

---

## Competition / Positioning

| | Enterprise middleware | llm-stream-guard |
|---|---|---|
| Scope | Often broad platform | Focused stream guard |
| Parsing | Bytes-first common | Bytes **+** parsed events |
| Tool policy | Varies | First-class |
| Dependencies | Varies | Zero runtime |

Marketing: **“TransformStream guard for LLM proxies and agent tool gates.”**

---

## Roadmap

High-level arc: **working guard in code → declarative policy → integration recipes → CI enforcement → stable reporting API**.

YAML policy (v0.2) waits until the transform pipeline API is stable — otherwise YAML serializes unstable design.

### v0.1 — MVP: stream guard that actually works

**Goal:** Ship a trustworthy zero-dep library for proxy byte pipelines and agent tool gates.

| Area | Deliverables |
|------|----------------|
| **Core API** | `createByteGuard()`, `guardEvents()`, `pipeGuard()`, `GuardEvent` types, `GuardContext`, violation modes (`block` \| `warn` \| `audit`) |
| **MVP rules** | `redactSecrets()`, `redactPII({ ... })`, `allowTools()`, `denyTools()`, `blockToolArgs()`, `maxToolArgsBytes()`, `sanitizeErrors()`, `onViolation()` |
| **Byte mode hard problems** | Rolling lookback buffer, UTF-8-safe redaction, mid-chunk SSE split fixtures (**LSG-C***) |
| **Event mode semantics** | Tool name policy on first known `name`; arg policy primarily on `done`; safe substitution on block |
| **Quality bar** | Golden fixtures (**LSG-R***, **LSG-T***), idempotency tests, 1 MB smoke, `verify:deps` CI |

**v0.1 stretch (if time — still in 0.1.x, not blocking release):**

- **`customSecretPatterns()`** — add project-specific regexes alongside built-in sk-/Bearer/JWT heuristics.
- **`redactPlaceholder()`** — configurable token (default `[REDACTED]`) for audit-friendly logs.
- **`blockPrivateUrls()`** — block `localhost`, RFC1918, link-local, and `file://` in text and tool args (common exfil/SSRF paths).
- **`tapGuard()`** — observe violations and redactions without changing output (proxy metrics).
- **`dryRun: true`** — report violations via `onViolation` but pass bytes/events through unchanged (shadow mode for production rollout).

---

### v0.2 — Declarative policy + local CLI

**Goal:** Teams configure guard once in YAML/JSON and run the same policy in app code and offline scans.

| Area | Deliverables |
|------|----------------|
| **Policy file** | Versioned schema: rules list, global `mode`, per-rule overrides, tool allowlists |
| **CLI** | `llm-stream-guard scan <file|dir>` — lint SSE fixtures, sample logs, or captured streams against policy |
| **Loaders** | `loadPolicy(path)` → runtime transforms; validate schema with actionable errors |
| **Profiles** | Built-in presets: `proxy-strict`, `agent-gate`, `audit-only` (starting points, not magic) |

**Interesting additions:**

- **`requireToolArgsSchema()`** — per-tool JSON Schema validation on `tool_call.done` (catch malformed or over-broad args before execution).
- **`blockDomains()` / `allowDomains()`** — URL host policy in text deltas and tool args (block paste sites, allow only corp domains).
- **`maxTextBytes(n)`** — cap streamed assistant text (DoS / runaway generation in proxy).
- **`hideReasoning()`** — drop or redact `reasoning.*` events downstream (keep hidden chain-of-thought off the browser wire).
- **Policy diff** — CLI subcommand to compare two policy files (useful in PR review).
- **Env overrides** — `GUARD_MODE=audit` for staging without editing YAML.

---

### v0.3 — Integration recipes (docs only, zero new runtime deps)

**Goal:** Lower adoption friction; show guard in real stacks without pulling frameworks into the package.

| Area | Deliverables |
|------|----------------|
| **Cookbook** | Hono / Express / Cloudflare Workers proxy patterns (byte + event mode) |
| **Event mappers** | Copy-paste recipes: assemble `StreamEvent` → `GuardEvent`, Vercel AI SDK chunks, LangChain callbacks |
| **Agent gate pattern** | “Guard before execute” loop with violation handling and user-facing error copy |
| **Examples repo folder** | Runnable minimal examples (no provider SDK deps in core) |

**Interesting additions:**

- **Dual-stream pattern** — safe stream to client + violation stream to server logger (documented, not required API).
- **MCP-oriented recipe** — map MCP tool call shapes to `GuardEvent` and apply `allowTools` before server-side execution.
- **LiteLLM / gateway hook** — where to insert byte guard on gateway response body.
- **Migration guide** — from ad-hoc regex proxy filters to guard transforms.

---

### v0.4 — CI and repo scanning

**Goal:** Catch unsafe tool definitions and policy drift before deploy — static analysis, not live stream middleware.

| Area | Deliverables |
|------|----------------|
| **GitHub Action** | `llm-stream-guard/action@v1` — scan policy + tool manifests on PR |
| **Static targets** | Tool JSON schemas in repo, OpenAPI `x-tool` blocks, MCP server tool lists, agent config YAML |
| **PR annotations** | Fail or warn with file/line when tool allowlist and declared tools diverge |
| **Pre-commit recipe** | Optional hook snippet in docs (policy validate + fixture smoke) |

**Interesting additions:**

- **Allowlist drift detection** — policy allows `search` but codebase registers `web_search` → flagged.
- **Dangerous arg pattern catalog** — bundled ruleset for shell injection, `curl | sh`, base64-encoded payloads in args (scan static tool examples/docs).
- **Fixture gate in CI** — run golden **LSG-*** fixtures against pinned policy in Action (regression safety net).
- **SARIF preview** — early SARIF output for GitHub Advanced Security integration (full format stabilized in v1.0).

---

### v1.0 — Stable API and observability

**Goal:** Semver promise, production reporting, and operability at scale.

| Area | Deliverables |
|------|----------------|
| **API freeze** | Documented public surface; breaking changes only in 2.x |
| **Violation reports** | JSON export + **SARIF 2.1.0** for CI and security dashboards |
| **Aggregates** | Per-stream summary: violation counts by rule, first/last offset, tool names touched |
| **Docs** | Full API reference, policy schema reference, threat model, performance notes |

**Interesting additions:**

- **`ViolationReport` type** — structured export from `onViolation` batch at `finish` (for logging pipelines).
- **`hashRedacted()`** — optional audit mode: log SHA-256 of redacted segments, not plaintext (compliance-friendly).
- **`violationBudget(n)`** — after N violations in one stream, escalate from `warn` to `block` (graceful degradation).
- **Policy versioning field** — `policyVersion` echoed in every violation for cross-service correlation.
- **Benchmark suite** — published numbers for byte mode MB/s and event mode events/s (like assemble LSA-C52 smoke).

---

### Post-1.0 horizon (ideas, not committed)

Features that fit the guard mission but need design time or clearer demand:

| Feature | Why it’s interesting |
|---------|----------------------|
| **`blockShellMetachars()`** | Opinionated preset for tool args targeting shell execution (`;`, `\|`, `$()`, backticks). |
| **`rateLimitToolCalls(n)`** | Stop runaway agent loops invoking tools too fast in one stream. |
| **`allowRegexToolNames()`** | Allow `read_*` tools without enumerating every variant. |
| **`redactStructuredFields()`** | Redact JSON keys by name in tool args (`password`, `apiKey`) even when values aren’t secret-shaped. |
| **`syncPolicyRemote()`** | Pull signed policy from URL (enterprise); optional, likely separate package to keep core zero-dep. |
| **`@llm-stream-guard/recipes` subpath** | Optional published mappers if docs-only recipes aren’t enough — only if demand is clear. |
| **WebSocket binary mode** | Same byte guard on non-SSE streaming transports (Realtime APIs). |

Explicitly **not** on the roadmap: LLM-as-judge classification, autonomous tool execution, hosted guard SaaS, provider adapters (assemble’s job).

---

## Open Questions

1. **Primary v0.1 use case** — proxy byte guard vs agent tool gate (drives docs and test emphasis).
2. **Async transforms** — sync-only MVP, or async `onViolation` for SIEM export?
3. **Optional subpath** — `@llm-stream-guard/recipes` for event mappers, or docs-only?
4. **npm name** — confirm `llm-stream-guard` availability before public README.
5. **Default violation mode** — `audit` for proxy, `block` for agent gate, or single global default?
6. **v0.1 stretch** — ship `blockPrivateUrls()` and `dryRun` in 0.1.x or defer to 0.2?
7. **Reasoning visibility** — `hideReasoning()` as core rule (v0.2) vs app-level drop in mapper?
8. **SARIF timing** — preview in v0.4 Action or wait until v1.0 schema freeze?

---

## Example Usage (Target DX)

### Proxy (byte mode)

```ts
import { createByteGuard } from "llm-stream-guard";

return new Response(
  upstream.body!.pipeThrough(
    createByteGuard({
      redactSecrets: true,
      sanitizeErrors: true,
      mode: "warn",
      onViolation: (v) => logger.warn(v),
    }),
  ),
  { headers: { "Content-Type": "text/event-stream" } },
);
```

### Agent (event mode)

```ts
import { guardEvents, allowTools, blockToolArgs, redactSecrets } from "llm-stream-guard";

for await (const event of guardEvents(
  parsedEvents,
  { mode: "block" },
  redactSecrets(),
  allowTools(["search", "read_file"]),
  blockToolArgs(/curl\s+.*\|\s*sh/),
)) {
  if (event.type === "tool_call" && event.phase === "done") {
    await executeTool(event);
  }
}
```

### With assemble (app-level, no package dep)

```ts
import { assembleStream, openaiChatAdapter } from "llm-stream-assemble";
import { guardEvents, redactSecrets, sanitizeErrors } from "llm-stream-guard";

function toGuardEvent(e: StreamEvent): GuardEvent | null {
  // app-local mapper — not shipped in guard core
}

const raw = assembleStream(body, openaiChatAdapter());
const mapped = (async function* () {
  for await (const e of raw) {
    const g = toGuardEvent(e);
    if (g) yield g;
  }
})();

for await (const event of guardEvents(mapped, redactSecrets(), sanitizeErrors())) {
  // safe events
}
```

---

## Summary

`llm-stream-guard` is a **new, independent** security layer for LLM streams. It complements `llm-stream-assemble` without sharing code or types. The hardest MVP work is **stateful byte redaction across chunk boundaries** and **clear block/warn/audit semantics for tool calls**. Everything else — composable transforms, violation callbacks, zero deps — follows established patterns from the assemble project’s engineering culture, applied to a different problem space.
