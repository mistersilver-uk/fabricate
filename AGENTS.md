# Fabricate Agent Guidelines

## Project

System-agnostic FoundryVTT crafting module targeting Foundry VTT V13.
Primary stack: JavaScript ES modules, Svelte 5, Vite, `node:test`, happy-dom, Playwright, and Jekyll docs.

## Planning & Workflow

- Use the orchestrator flow first for any non-trivial task.
- Read your assigned issue using the GitHub CLI before implementation work starts.
- Use GitHub issue numbers such as `#42` when an issue exists; treat legacy `T-XXX` IDs as reference only.
- Route quick-start documentation changes to `docs/quickstart.md` only.

## Build & Test

- `npm test` — required validation gate for implementation changes.
- `npm run build` — required build gate for implementation changes.
- `npm run test:foundry` — use when a task needs live Foundry UI or screenshot validation.
- For UI/UX work, prefer the local Vite dev server first, using the user-provided dev URL when available.
- Fall back to `npm run test:foundry` when a change depends on real Foundry runtime behavior, when no Vite dev server is available, or when clean reproducible screenshots are needed.

## Code Conventions

- The runtime codebase is JavaScript, but typed surfaces must stay explicit; avoid `any` without justification where types are used.
- Svelte is the only UI templating system. Do not add or reintroduce Handlebars templates.
- UI shells live in `src/ui/*.js` and `src/ui/*.svelte.js`.
- Svelte UI components live in `src/ui/svelte/apps/` and `src/ui/svelte/components/`.
- Svelte stores live in `src/ui/svelte/stores/`.
- Domain and runtime logic lives under `src/models/`, `src/systems/`, `src/utils/`, `src/integrations/`, `src/config/`, and related `src/` modules.
- Tests live under `tests/`.
- Styles live in `styles/`, primarily `styles/fabricate.css`.
- Localized strings belong in `lang/`; UI code should use the Foundry bridge/localization helpers instead of hard-coded copy.

## FoundryVTT Notes

- `game`, `ui`, `Hooks`, and `CONFIG` are runtime globals. Never import them.
- The module targets Foundry V13. Account for V13 API shapes when touching Foundry-facing code.
- `game.documentTypes.Item` is a `Set`; use `Array.from()` before array-style operations.
- Prefer `game.documentTypes` over `game.system.documentTypes`, with fallback only when needed.
- Use `sheet.changeTab(tabName, groupName)` for ApplicationV2 tab switches.
- Preserve `flags.core.sourceId` when embedded items must map back to a world item.
- `CraftingSystemManager` uses `getSystems()` and `getItems(systemId)`.
- Update compatibility metadata if new Foundry API requirements are introduced.

## Git Conventions

- Never commit directly to `main`.
- Use Conventional Commits.
- For `feat`, `fix`, and `perf`, use the format `<type>(#<issue>): <short description>`.
- Validate commit messages with `npx commitlint` before pushing when a commit is part of the task.

## Local Codex Agents And Skills

Prefer the local Codex custom agents in `.codex/agents/` for role-specific work, and the local skills in `.codex/skills/` for workflow instructions. Subagents only run when explicitly requested, so prompts and automation should tell Codex which agents to spawn and which files each implementation worker owns.

Custom agents:

- `fabricate_orchestrator`
- `fabricate_implementer`
- `fabricate_reviewer`
- `fabricate_docs_writer`
- `fabricate_domain_expert`
- `fabricate_ux_designer`
- `fabricate_quality_engineer`
- `fabricate_competitive_analyst`
- `fabricate_pr_explorer`

Skills:

- `fabricate-orchestrator`
- `fabricate-implementer`
- `fabricate-reviewer`
- `fabricate-docs-writer`
- `fabricate-domain-expert`
- `fabricate-ux-designer`
- `fabricate-quality-engineer`
- `fabricate-competitive-analyst`

## What Agents Must Not Do

- Merge to `main` without reviewer approval.
- Delete test files.
- Change `module.json` id or module name.
- Add npm dependencies without a plan entry that explains why they are needed.
