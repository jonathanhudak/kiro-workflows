# Project Structure

<!-- Customize this file for your project -->

Describe your codebase architecture here. Kiro agents read this to understand your project layout.

## Directory Layout

```
src/           — source code
tests/         — test files
docs/          — documentation
.kiro/         — Kiro configuration (agents, steering, hooks)
```

## Key Files

- `README.md` — project overview
- `package.json` / `Cargo.toml` / etc. — dependencies and scripts

## Conventions

- File naming: kebab-case
- One module per file
- Co-locate tests with source (`*.test.ts` next to `*.ts`)
