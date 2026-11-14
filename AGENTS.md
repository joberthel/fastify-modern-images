# Agent Instructions

@[Coding Guidelines](CODING_GUIDELINES.md)

## Checks before handing work back

All of the following checks must pass before handing work back:

- `pnpm build`
- `pnpm test:coverage`
- `pnpm lint`
- `echo "<commit-msg>" | pnpm run commitlint`
