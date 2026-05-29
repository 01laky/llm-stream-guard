export function cliUsage(): string {
	return `llm-stream-guard — policy validate, scan, diff

Usage:
  llm-stream-guard doctor [--json] [policy-path]
  llm-stream-guard validate <policy>
  llm-stream-guard resolve <policy> [--json]
  llm-stream-guard scan --policy <policy> [--mode M] [--stdin-format F] [--json] <paths...|->
  llm-stream-guard diff <policyA> <policyB> [--check] [--json]
  llm-stream-guard profiles list
  llm-stream-guard profiles show <id>
  llm-stream-guard audit validate-manifest --manifest <path> [--json]
  llm-stream-guard audit drift --policy <p> --manifest <m> [--json]
  llm-stream-guard audit static [--policy <p>|--policy-dir <d>] [--root <dir>] [--manifest <m>]
    [--strict] [--include a,b] [--exclude a,b] [--quiet] [--annotate] [--json] [--sarif-out <file>]

Env: GUARD_MODE, GUARD_POLICY_PATH
`;
}
