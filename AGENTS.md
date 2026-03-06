# Fabricate Agent Guidelines

## Project

System-agnostic FoundryVTT crafting module. TypeScript + Svelte + Vite + Jest.

## Build & Test

- `npm test` — run Jest suite. Must pass before committing.
- `npm run build` — Vite build to /dist. Must compile cleanly.

## Code Conventions

- TypeScript strict mode. No `any` without a comment explaining why.
- Svelte for all UI. No Handlebars templates.
- Domain logic lives in `src/`. UI components in `src/scripts/`.
- Tests mirror src structure under `test/`.

## Git Conventions

- Branch per task: `agent/TASK-description`
- Commits: `feat:`, `fix:`, `test:`, `refactor:`, `ci:` prefixes
- Never commit directly to main. Always open a PR from a branch.

## Codex Governance

- Prefer `.codex/run-codex-pipeline.sh run` for a single task.
- Use `.codex/run-codex-pipeline.sh run-many` only when tasks are independent.
- If pipeline stage status is `BLOCKED` or review loop cap is exceeded, stop and request human input.
- Before opening a PR, validate artifacts locally:
  - `./.codex/validate-codex-run.sh single current`
  - or `./.codex/validate-codex-run.sh multi current-multi`
- PRs must include Codex evidence fields in `.github/pull_request_template.md`.

## FoundryVTT Notes

- `game`, `ui`, `Hooks`, `CONFIG` are runtime globals — never import them
- Check module compatibility flags before using newer Foundry APIs
- `module.json` version must be updated for any new Foundry API usage

## What Agents Must NOT Do

- Merge to main without reviewer approval
- Delete test files
- Change module.json id or name
- Add npm dependencies without a plan entry explaining why
