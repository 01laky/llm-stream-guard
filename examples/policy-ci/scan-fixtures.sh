#!/usr/bin/env bash
# Offline CI prep — validate policy + scan clean fixtures (LSG-CBK09 / LSG-CBK27).
# Run from repository root: bash examples/policy-ci/scan-fixtures.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# Local repo: use built CLI (no npm link required). In CI with installed package, set LSG_CLI=llm-stream-guard.
CLI=(node "$ROOT/dist/cli.js")
if [[ -n "${LSG_CLI:-}" ]]; then
	CLI=(pnpm exec "$LSG_CLI")
elif [[ ! -f "$ROOT/dist/cli.js" ]]; then
	echo "dist/cli.js missing — run pnpm build first" >&2
	exit 1
fi

"${CLI[@]}" validate policies/agent-gate.json
"${CLI[@]}" scan --policy policies/agent-gate.json --json \
	test/fixtures/events/clean-tool.json >/tmp/lsg-scan-clean.json

node --input-type=module -e "
import fs from 'node:fs';
const report = JSON.parse(fs.readFileSync('/tmp/lsg-scan-clean.json', 'utf8'));
if (report.summary.violations !== 0) process.exit(1);
"

echo "OK: policy validate + clean scan passed"
