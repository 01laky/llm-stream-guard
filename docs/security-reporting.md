# Security reporting

**Status:** **0.9.0** — how to report confirmed security issues in llm-stream-guard.

**Regression suite:** `test/security-negative.test.ts` (LSG-SEC01–20) documents known non-bypasses at 0.9.0 — not a substitute for responsible disclosure of new bypasses.

**GitHub entrypoint:** [`SECURITY.md`](../SECURITY.md)

---

## What to report

- **Confirmed secret redaction bypass** — full token or secret-shaped string appears in guard output when it should be `[REDACTED]`
- **Tool policy bypass** — disallowed tool or blocked args reach downstream with minimal repro
- **Crash or hang** — malicious stream input causes uncaught exception or unbounded memory growth

---

## What not to report

- Regex **near-miss** false positives (document in FAQ / troubleshooting)
- Documentation typos or feature requests (use normal GitHub issues)
- Provider-side leaks before guard is attached (fix wiring in your proxy)

---

## How to report

1. Open a [GitHub issue](https://github.com/01laky/llm-stream-guard/issues) **without live secrets** in the title or body.
2. Include:
   - Package version (`llm-stream-guard@X.Y.Z`)
   - Mode: **byte** or **event**
   - Minimal policy JSON
   - Input sample (event JSON or byte chunk sequence)
   - Expected vs actual output
3. For redaction bypasses, prefer **`sk-test-...`** placeholders like [`test/fixtures/`](../test/fixtures/).

---

## Redaction bypass template

```markdown
**Version:** 0.8.2
**Mode:** byte | event
**Policy:** (attach minimal JSON)
**Input:** (sanitized fixture)
**Expected:** [REDACTED] or tool blocked
**Actual:** (what you observed)
```

See also [Threat model stub](./threat-model-stub.md) for scope boundaries.

---

## Response

Maintainer triage via GitHub issues. No guaranteed SLA in 0.8.x.

Related: [Troubleshooting](./troubleshooting.md) · [FAQ](./faq.md)
