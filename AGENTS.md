# Fabricate Agent Guidelines

## Project

System-agnostic FoundryVTT crafting module targeting Foundry VTT V13.
Primary stack: JavaScript ES modules, Svelte 5, Vite, `node:test`, happy-dom, Playwright, and Jekyll docs.

## Planning & Workflow

- Use the orchestrator flow first for any non-trivial task.
- Use OpenSpec as the planning system of record for non-trivial work.
- Plans touching shared scripts (smoke test, build, lint, anything in `scripts/` invoked from `package.json`) must spell out the behavior in both CI and local dev explicitly — don't bury one as a parenthetical.
- Create or update `openspec/changes/<change>/proposal.md`, `design.md`, and `tasks.md` before implementation starts.
- Read your assigned issue using the GitHub CLI before implementation work starts.
- Use GitHub issue numbers such as `#42` when an issue exists; treat legacy `T-XXX` IDs as reference only.
- Treat `openspec/specs/*/spec.md` as the canonical specification source of truth. The legacy `spec/` directory is compatibility-only.
- Route quick-start documentation changes to `docs/quickstart.md` only.

## Default Agentic Workflow

Non-trivial work runs as a `plan → plan-review → implement → review → docs` state machine, with iteration until each gate accepts. Stages auto-spawn role-specific subagents based on the change signals below — agents do not need to be requested by name. Subagents not matched by the routing table only run when explicitly requested.

The routing tokens below (`fabricate_orchestrator`, etc.) are provider-neutral role identifiers. Each resolves to a registered agent in **both** providers — `.codex/agents/*.toml` for Codex and `.claude/agents/*.md` for Claude (spawned via the Agent tool using the `subagent_type` in [Agent Roles & Bindings](#agent-roles--bindings)) — so the auto-spawn workflow behaves the same regardless of which assistant is driving. The one exception is the read-only `fabricate_pr_explorer` mapping role: Claude uses its built-in `Explore` agent rather than a dedicated binding (see the table below).

**Workflow driver.** The top-level loop — Codex's depth-0 prompt agent or Claude's main loop — is the *workflow driver*. It enacts the orchestrator role: it owns routing and the iteration loops and performs **all** agent spawning. The spawnable `fabricate_orchestrator` agent is a planning helper the driver may delegate to for resolving the roster and drafting the OpenSpec change docs; it returns its plan to the driver. Spawned role agents execute their scoped role and do not nest — no role agent spawns another.

### Auto-spawn routing

Match the change against every signal that applies. All matching agents run in parallel within their stage; this is multi-select, not single-pick.

| Signal                                                                                                                            | Agent(s)                                                                                         | Stage                                    |
|-----------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|------------------------------------------|
| Any non-trivial task                                                                                                              | `fabricate_orchestrator` (plan), `fabricate_implementer` (build), `fabricate_reviewer` (verdict) | always                                   |
| Touches `src/ui/`, `src/ui/svelte/`, or `styles/`                                                                                 | `fabricate_ux_designer`                                                                          | plan-review + post-implementation review |
| Touches `src/models/`, `src/systems/`, `src/integrations/`, `openspec/specs/`, `lang/`, or domain language                        | `fabricate_domain_expert`                                                                        | plan-review + docs loop                  |
| Adds, removes, or restructures tests, or changes test infrastructure under `tests/`                                               | `fabricate_quality_engineer`                                                                     | plan-review + post-implementation review |
| Changes behaviour, public API surfaces, hooks, slash commands, settings, JSDoc-documented exports, or anything covered by `docs/` | `fabricate_docs_writer` + `fabricate_domain_expert` (paired loop)                                | post-implementation docs loop            |
| Competitor, market, or precedent question                                                                                         | `fabricate_competitive_analyst`                                                                  | plan                                     |
| GitHub PR investigation                                                                                                           | `fabricate_pr_explorer`                                                                          | as needed                                |

### Iteration cycles

Three loops run until acceptance, each capped at 3 revisions before escalating to the user:

1. **Plan review loop.** The driver drafts the OpenSpec change docs (delegating to a `fabricate_orchestrator` planning agent when useful), then spawns the plan-review agents matched by the routing table. Each emits `APPROVED / NEEDS_CHANGES / BLOCKED` against the plan. The driver revises the change docs until every plan reviewer approves.
2. **Implementation review loop.** The driver spawns the implementer to ship changes, then spawns `fabricate_reviewer` plus any post-implementation reviewers from the routing table to emit verdicts. The implementer addresses `NEEDS_CHANGES` until every reviewer emits `APPROVED`.
3. **Documentation iteration loop.** Triggered whenever the change touches behaviour or any documented API surface. The driver spawns the paired `fabricate_domain_expert` (updates `DOMAIN.md` and canonical specs against the diff) and `fabricate_docs_writer` (updates JSDoc and the Jekyll site). Each then reviews the other's output and emits `DOCS APPROVED / DOCS NEEDS_CHANGES`. Loop until both approve.

### Stop conditions

- Any reviewer returning `BLOCKED` halts the loop and surfaces to the user.
- Hitting the 3-revision cap on any loop halts and surfaces to the user with the outstanding findings.
- User intervention takes precedence; treat user guidance as the new entry condition for the next iteration.

## Build & Test

### Prereqs

- Node.js 22+ (see `.nvmrc` / `.node-version`). On Windows with `nvm-windows`, run `nvm use` manually — it does not auto-switch on directory change.
- npm (ships with Node).
- Docker Desktop only required for `npm run test:foundry`. Not required for `npm test`, `npm run build`, or `npm run dev`.
- No extra shell tools required. `npm run release:build` uses Windows' built-in `tar.exe` for zip creation; on Ubuntu it uses `zip`.

- `npm test` — required validation gate for implementation changes.
- `npm run build` — required build gate for implementation changes.
- `npm run test:foundry` — use when a task needs live Foundry UI or screenshot validation.
- For UI/UX work, prefer the local Vite dev server first, using the user-provided dev URL when available.
- Fall back to `npm run test:foundry` when a change depends on real Foundry runtime behavior, when no Vite dev server is available, or when clean reproducible screenshots are needed.
- UI-changing PRs must include generated screenshot evidence for the relevant changed views before opening or updating the PR. Use `npm run screenshots:ui:plan -- --base origin/main` to identify expected views, then use `npm run screenshots:ui -- --base origin/main --pr <number>` to generate focused representative Playwright screenshots into `tmp/pr-screenshots/<number>/`. Attach or upload those screenshots to the PR, update the PR body with the uploaded evidence links/artifact references, then immediately run `npm run screenshots:ui:clean -- --pr <number>` so PR-scoped screenshots are not committed as repository assets. Do not run the full Foundry smoke harness just to create PR screenshots unless the user explicitly asks for live Foundry evidence or the UI behavior cannot be represented by focused fixtures. If capture is blocked, put `SCREENSHOTS_NEEDED: <specific reason and visual change summary>` in the PR body.
- Focused UI screenshot fixtures must use non-SVG raster icons copied from Foundry VTT core and dnd5e via `tests/fixtures/ui-assets/manifest.js`; do not invent or check in custom SVG preview art. Live Foundry smoke data may keep direct Foundry core/dnd5e raster paths when it is explicitly used inside Foundry.
- The smoke harness Phase D0 (`screenshot-manager` step in `scripts/foundry-test-run.mjs`) pins many selectors by class, `.nth(N)` index, and visible button text. When changing any manager UI surface — environment row markup, env-edit view, composition list, header actions — grep the harness for the changed classes / text before declaring the change done. See `docs/agents/smoke-harness.md`.

## Code Conventions

- The runtime codebase is JavaScript, but typed surfaces must stay explicit; avoid `any` without justification where types are used.
- Keep modules and objects small and cohesive; if a unit naturally does X and Y, split it.
- Keep constructors and factories boring; avoid hidden I/O, service lookup, and object graph assembly inside them.
- Inject specific collaborators instead of passing context or container grab bags and digging through them later.
- Prefer behavior-first APIs over getter or setter-heavy data bags.
- Isolate global mutable state and runtime lookups at thin edges that are easy to test.
- Svelte is the only UI templating system. Do not add or reintroduce Handlebars templates.
- UI shells live in `src/ui/*.js` and `src/ui/*.svelte.js`.
- Svelte UI components live in `src/ui/svelte/apps/` and `src/ui/svelte/components/`.
- Svelte stores live in `src/ui/svelte/stores/`.
- Domain and runtime logic lives under `src/models/`, `src/systems/`, `src/utils/`, `src/integrations/`, `src/config/`, and related `src/` modules.
- Tests live under `tests/`.
- Styles live in `styles/`, primarily `styles/fabricate.css`.
- Localized strings belong in `lang/`; UI code should use the Foundry bridge/localization helpers instead of hard-coded copy.
- Manager confirmation prompts (discard unsaved, destructive actions) MUST go through `services.confirmDialog` → `foundry.applications.api.DialogV2.confirm`. Never use `globalThis.confirm()`, not even as a fallback. See `docs/agents/manager-confirm-discard.md`.
- When a Svelte component is shared between task and hazard (or similar `kind`-driven) contexts, split shared i18n keys into kind-specific siblings (`…Task` / `…Hazard`) and select with a ternary on `kind`. Reserve combined "tasks and hazards" / "task or hazard" wording for surfaces that genuinely mix kinds (overview hints, mixed validation issues, error messages).
- Generic "record" / "records" wording in user-facing strings under `FABRICATE.Admin.Manager.EnvironmentEditor.*` is a known anti-pattern; environments don't have catalysts, they have tasks, hazards, and required tools. Use accurate domain terms when adding new strings.
- Test files under `tests/components/` pin code shapes with `inspectorSource.includes(...)` / `listSource.includes(...)` string assertions. When renaming variables, refactoring markup, or removing i18n keys, grep these assertions and update them in lockstep — they fail at test time, not compile time.

## FoundryVTT Notes

- `game`, `ui`, `Hooks`, and `CONFIG` are runtime globals. Never import them.
- The module targets Foundry V13. Account for V13 API shapes when touching Foundry-facing code.
- `game.documentTypes.Item` is a `Set`; use `Array.from()` before array-style operations.
- Prefer `game.documentTypes` over `game.system.documentTypes`, with fallback only when needed.
- Use `sheet.changeTab(tabName, groupName)` for ApplicationV2 tab switches.
- Preserve `flags.core.sourceId` when embedded items must map back to a world item.
- `CraftingSystemManager` uses `getSystems()` and `getItems(systemId)`.
- Update compatibility metadata if new Foundry API requirements are introduced.

## Architecture Pointers

These deep-dive notes live under `docs/agents/` and explain layered patterns or data-model subtleties that aren't obvious from reading any single file. Update them when the underlying code changes — stale citations defeat the whole point.

- [`docs/agents/manager-confirm-discard.md`](docs/agents/manager-confirm-discard.md) — the three-layer "discard unsaved draft?" guard (Svelte route-exit → store helper → `services.confirmDialog`) used by every editor in the Crafting System Manager.
- [`docs/agents/gathering-environment-data-model.md`](docs/agents/gathering-environment-data-model.md) — environment objects carry both legacy embedded `tasks[]` and modern library refs (`enabledTaskIds` etc); names the canonical sources for composition counts and required-tool aggregation.
- [`docs/agents/smoke-harness.md`](docs/agents/smoke-harness.md) — how `npm run test:foundry` is organized, where its outputs land, and which Phase D0 selectors routinely drift when manager markup changes.
- [`docs/agents/ui-pr-screenshots.md`](docs/agents/ui-pr-screenshots.md) — how UI PR screenshot evidence is planned, generated, collected, embedded in PR descriptions, and validated in CI.

## Git Conventions

- All implementation, documentation, and workflow-file changes must happen on a non-`main` branch.
- Before editing, verify the current branch. If it is `main`, create or switch to a task branch first.
- When the work is complete, commit to that branch, push it, and open a PR targeting `main`.
- Respond to review feedback by updating the same branch and PR; do not open replacement PRs unless the user asks.
- Review-only agents inspect the active branch and PR, and must not merge to `main`.
- PR titles must comply with Conventional Commits, using the same `<type>(#<issue>): <short description>` format for `feat`, `fix`, and `perf`.
- PR descriptions must use H2 sections in this order: `Description`, `Benefit(s)`, `Changes in this PR`, `Testing`, and `Screenshots (if applicable)`.
- For UI-touching PRs, `Screenshots (if applicable)` must link uploaded/attached screenshot evidence or include `SCREENSHOTS_NEEDED: <specific reason>`. Do not commit PR-scoped screenshots under docs or other asset directories.
- Never commit directly to `main`.
- Use Conventional Commits.
- For `feat`, `fix`, and `perf`, use the format `<type>(#<issue>): <short description>`.
- Validate commit messages with `npx commitlint` before pushing when a commit is part of the task.
- Prefer one logical change per commit; align commit boundaries with reviewable user-facing changes. Bundling is acceptable when changes overlap on the same files such that hunk-splitting would be fragile, but separate commits are the default.

## Agent Roles & Bindings

Each role is defined **once** in its shared `skills/<role>/SKILL.md` (the canonical persona).
Both provider agents are **thin bindings** that point at that skill — change behavior in the
skill, not in the bindings. The default workflow above auto-spawns these roles based on change
signals; explicit requests are only required for roles the routing table does not cover.

| Routing token                  | Canonical skill (persona)                  | Codex binding                                | Claude `subagent_type`        |
|---------------------------------|--------------------------------------------|----------------------------------------------|-------------------------------|
| `fabricate_orchestrator`        | `skills/fabricate-orchestrator/SKILL.md`   | `.codex/agents/fabricate-orchestrator.toml`  | `fabricate-orchestrator`      |
| `fabricate_implementer`         | `skills/fabricate-implementer/SKILL.md`    | `.codex/agents/fabricate-implementer.toml`   | `fabricate-implementer`       |
| `fabricate_reviewer`            | `skills/fabricate-reviewer/SKILL.md`       | `.codex/agents/fabricate-reviewer.toml`      | `fabricate-reviewer`          |
| `fabricate_domain_expert`       | `skills/fabricate-domain-expert/SKILL.md`  | `.codex/agents/fabricate-domain-expert.toml` | `fabricate-domain-expert`     |
| `fabricate_docs_writer`         | `skills/fabricate-docs-writer/SKILL.md`    | `.codex/agents/fabricate-docs-writer.toml`   | `fabricate-docs-writer`       |
| `fabricate_ux_designer`         | `skills/fabricate-ux-designer/SKILL.md`    | `.codex/agents/fabricate-ux-designer.toml`   | `fabricate-ux-designer`       |
| `fabricate_quality_engineer`    | `skills/fabricate-quality-engineer/SKILL.md` | `.codex/agents/fabricate-quality-engineer.toml` | `fabricate-quality-engineer` |
| `fabricate_competitive_analyst` | `skills/fabricate-competitive-analyst/SKILL.md` | `.codex/agents/fabricate-competitive-analyst.toml` | `fabricate-competitive-analyst` |
| `fabricate_pr_explorer`         | — (no shared skill; read-only mapping)     | `.codex/agents/fabricate-pr-explorer.toml`   | `Explore` (built-in)          |

`fabricate_pr_explorer` is read-only codebase mapping; Claude uses its built-in `Explore` agent
for the same role rather than a dedicated binding.

### Shared skills with no persona binding

These are loaded on demand (by path) from the role skills that reference them — not auto-spawned
as agents:

- `skills/javascript-mastery/SKILL.md`
- `skills/javascript-structural-design/SKILL.md`
- `skills/playwright-skill/SKILL.md`
- `skills/review-implementing/SKILL.md`

## What Agents Must Not Do

- Merge to `main` without reviewer approval.
- Delete test files.
- Change `module.json` id or module name.
- Add npm dependencies without a plan entry that explains why they are needed.
- Patch dead UI / config / code branches as a workaround. When a control has nothing useful to configure or a code path has no remaining purpose, propose wholesale removal first.
