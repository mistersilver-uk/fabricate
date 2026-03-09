# Fabricate Agent Guidelines

## Project

System-agnostic FoundryVTT crafting module. JavaScript + Svelte + Vite + Jest.

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

## FoundryVTT Notes

- `game`, `ui`, `Hooks`, `CONFIG` are runtime globals — never import them
- Check module compatibility flags before using newer Foundry APIs
- `module.json` version must be updated for any new Foundry API usage

## What Agents Must NOT Do

- Merge to main without reviewer approval
- Delete test files
- Change module.json id or name
- Add npm dependencies without a plan entry explaining why
