# Coding Guidelines

## Dependencies

**Use latest compatible versions:** When adding new dependencies, verify current releases to ensure no outdated versions are introduced. Always select the most up-to-date versions compatible with the existing repository stack, runtime, and peer dependencies.

## Tests

- Keep unit tests (`*.test.ts`) in the `test/` folder.
- Keep end-to-end tests (`*.e2e.test.ts`) in the `e2e/` folder.

## Commits and Git hygiene

**Follow Conventional Commits.** Commit messages follow `<type>: <description>`. Types are restricted to: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style` and `test`. Scopes are not allowed. An explanatory body separated by a blank line is encouraged for non-trivial context.
