# Policy fixture registry

| File                              | expectValid | expectCode  | Description                             |
| --------------------------------- | ----------- | ----------- | --------------------------------------- |
| valid/minimal.json                | true        | —           | Minimal valid policy                    |
| valid/extends-agent.resolved.json | true        | —           | Expected merge of extends-agent example |
| invalid/missing-version.json      | false       | POLICY_E001 | Missing version without extends         |
| invalid/bad-regexp.json           | false       | POLICY_E003 | Invalid blockToolArgs RegExp            |
| invalid/allow-deny-overlap.json   | false       | POLICY_E009 | allowTools/denyTools name overlap       |
| invalid/empty-allow-block.json    | false       | POLICY_E010 | Empty allowlist with mode block         |
