# Agent Instructions

@[Coding Guidelines](CODING_GUIDELINES.md)

## Checks before handing work back

All of the following checks must pass before handing work back:

- `pnpm build`
- `pnpm test:coverage`
- `pnpm test:e2e`
- `pnpm lint`
- `echo "<commit-msg>" | pnpm run commitlint`
- `pinact run --check`

## GitHub Issues

Every GitHub issue should have both its **Issue Type** (`Bug`, `Task`, `Feature`) and **Priority** (`Urgent`, `High`, `Medium`, `Low`) field set.

1. **Set Issue Type** using `gh api graphql` (`updateIssue` mutation):
   - `Task`: `IT_kwDOAghkLs4HjyUW`
   - `Bug`: `IT_kwDOAghkLs4HjyUX`
   - `Feature`: `IT_kwDOAghkLs4HjyUY`

   ```bash
   gh api graphql -f query='mutation { updateIssue(input: {id: "<ISSUE_NODE_ID>", issueTypeId: "<TYPE_ID>"}) { issue { number issueType { name } } } }'
   ```

2. **Set Priority** using `gh api graphql` (`setIssueFieldValue` mutation on field `IFSS_kgDOAvndIw`):
   - `Urgent`: `IFSSO_kgDOBTXtEA`
   - `High`: `IFSSO_kgDOBTXtEQ`
   - `Medium`: `IFSSO_kgDOBTXtEg`
   - `Low`: `IFSSO_kgDOBTXtEw`

   ```bash
   gh api graphql -f query='mutation { setIssueFieldValue(input: {issueId: "<ISSUE_NODE_ID>", issueFields: [{fieldId: "IFSS_kgDOAvndIw", singleSelectOptionId: "<OPTION_ID>"}]}) { issue { number } } }'
   ```
