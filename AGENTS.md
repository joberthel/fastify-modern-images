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
