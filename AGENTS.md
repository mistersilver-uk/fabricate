# Fabricate Agent Guidelines

## Project

System-agnostic FoundryVTT crafting module targeting Foundry VTT V13.
Primary stack: JavaScript ES modules, Svelte 5, Vite, `node:test`, happy-dom, Playwright, and Jekyll docs.

## Planning & Workflow

- Use the orchestrator flow first for any non-trivial task.
- Use OpenSpec as the planning system of record for non-trivial work.
- Plans touching shared scripts (smoke test, build, lint, anything in `scripts/` invoked from `package.json`) must spell out the behavior in both CI and local dev explicitly — don't bury one as a parenthetical.
- Capture the change delta in the work's GitHub issue (a managed `openspec-delta` block — proposal, design, tasks, spec deltas, roster, acceptance) before implementation starts; do not version planning files under `openspec/changes/` (that directory is gone). See `openspec/README.md` for the block format and rules.
- When the work originates from an existing issue, append the delta block and preserve the reporter's original text; when it originates from a prompt with no issue, create one from the `OpenSpec Change Delta` issue template.
- Read your assigned issue using the GitHub CLI before implementation work starts.
- Use GitHub issue numbers such as `#42` when an issue exists; treat legacy `T-XXX` IDs as reference only.
- Treat `openspec/specs/*/spec.md` as the canonical specification source of truth. The legacy `spec/` directory is compatibility-only.
- Route quick-start documentation changes to `docs/quickstart.md` only.

## Default Agentic Workflow

Non-trivial work runs as a `plan → plan-review → implement → review → docs` state machine, with iteration until each gate accepts. Stages auto-spawn role-specific subagents based on the change signals below — agents do not need to be requested by name. Subagents not matched by the routing table only run when explicitly requested.

The routing tokens below (`fabricate_orchestrator`, etc.) are provider-neutral role identifiers. Each resolves to a registered agent in **both** providers — `.codex/agents/*.toml` for Codex and `.claude/agents/*.md` for Claude (spawned via the Agent tool using the `subagent_type` in [Agent Roles & Bindings](#agent-roles--bindings)) — so the auto-spawn workflow behaves the same regardless of which assistant is driving. The one exception is the read-only `fabricate_pr_explorer` mapping role: Claude uses its built-in `Explore` agent rather than a dedicated binding (see the table below).

**Workflow driver.** The top-level loop — Codex's depth-0 prompt agent or Claude's main loop — is the *workflow driver*. It enacts the orchestrator role: it owns routing and the iteration loops and performs **all** agent spawning. The spawnable `fabricate_orchestrator` agent is a planning helper the driver may delegate to for resolving the roster and drafting the OpenSpec delta in the issue; it returns its plan to the driver. Spawned role agents execute their scoped role and do not nest — no role agent spawns another.

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

1. **Plan review loop.** The driver drafts the OpenSpec delta in the issue's `openspec-delta` block (delegating to a `fabricate_orchestrator` planning agent when useful), then spawns the plan-review agents matched by the routing table. Each emits `APPROVED / NEEDS_CHANGES / BLOCKED` against the delta (verdicts posted as issue comments). The driver rewrites the delta block in place until every plan reviewer approves.
2. **Implementation review loop.** The driver spawns the implementer to ship changes — including the canonical spec changes under `openspec/specs/` that the delta requires — then spawns `fabricate_reviewer` plus any post-implementation reviewers from the routing table to emit verdicts. Reviewers compare the actual `openspec/specs/` diff against the proposed delta in the issue and confirm a faithful realization (or flag a justified deviation to reconcile). The implementer addresses `NEEDS_CHANGES` until every reviewer emits `APPROVED`.
3. **Documentation iteration loop.** Triggered whenever the change touches behaviour or any documented API surface. The driver spawns the paired `fabricate_domain_expert` (updates `DOMAIN.md` and canonical specs against the diff, and reconciles the issue delta — updating it and its `Deviations` note when implementation justifiably diverged) and `fabricate_docs_writer` (updates JSDoc and the Jekyll site to match the shipped canonical spec). Each then reviews the other's output and emits `DOCS APPROVED / DOCS NEEDS_CHANGES`. Loop until both approve.

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

- `npm test` — required validation gate for implementation changes. Its glob enumerates a fixed set of test directories (see the `test` script in `package.json`). A test placed in a directory the glob does not list is NOT gated, even though it passes when run directly with `node --test <file>`. When adding a test in a new directory, add that directory to the `test` script and confirm the total count rises under `npm test`.
- Reading a smoke result: `test-results/summary.json` reports `passed: false` if any phase step fails OR if `consoleErrors[]` is non-empty. Benign browser `404 (Not Found)` asset misses in the fixture world populate `consoleErrors` and flip `passed` to false even when every `steps[]` entry passed. Check `steps[]` for an actual failing step before treating a run as broken or discarding its screenshots — see `docs/agents/smoke-harness.md`.
- `npm run build` — required build gate for implementation changes.
- `npm run lint` + `npm run lint:css` + `npm run format:check` — required ESLint + Stylelint + Prettier gate (the `lint` CI job). ESLint/Prettier run over a **staged path scope** (see the `lint`/`format` globs in `package.json`): now the entire `src/` JavaScript surface — `src/{models,utils,integrations,config,migration,canvas,systems}` + `src/toolBreakageRuntime.js`. `tests/`, `src/ui/**`, `*.svelte`, `src/main.js`, and `scripts/**` are NOT gated yet — widen a path in its own focused PR only once it passes BOTH ESLint and the SonarCloud quality gate (reformatting counts as new code, so it surfaces pre-existing Sonar findings). `npm run lint:css` (Stylelint, config in `stylelint.config.js`) gates `styles/**/*.{css,scss}` and enforces quality, reliability, duplication, reuse/shorthand, and cross-browser support (against the `browserslist` in `package.json`); Svelte scoped `<style>` blocks are out of scope. Use `npm run lint:fix` / `npm run lint:css:fix` / `npm run format` to auto-fix. See the "Linting & formatting" section in `docs/contributing.md`.
- `npm run test:foundry` — use when a task needs live Foundry UI or screenshot validation.
- For UI/UX work, prefer the local Vite dev server first, using the user-provided dev URL when available.
- Fall back to `npm run test:foundry` when a change depends on real Foundry runtime behavior, when no Vite dev server is available, or when clean reproducible screenshots are needed.
- UI-changing PRs (files under `src/ui/`, `styles/`, `lang/`, or any `*.svelte`/`*.css`) must include real smoke-run screenshot evidence for the relevant changed views before opening or updating the PR. Use `npm run screenshots:ui:plan -- --base origin/main` to identify expected views, run `npm run test:foundry` (local default `full` profile) to produce real Foundry screenshots under `test-results/`, `npm run screenshots:ui -- --base origin/main --pr <number>` to collect the relevant smoke artifacts into `tmp/pr-screenshots/<number>/`, then `npm run screenshots:ui:publish -- --pr <number>` to upload them to S3 (under `pr-screenshots/<number>/`) and embed the returned `![pr-<number> ...]` image markdown into a managed block in the PR body's `Screenshots (if applicable)` section, then `npm run screenshots:ui:clean -- --pr <number>` so PR-scoped screenshots are not committed as repository assets. Do NOT run the full smoke profile on a GitHub Actions runner — generation is local. The `check-screenshots` gate cannot be self-satisfied: there is no `SCREENSHOTS_NEEDED:` bypass. If capture is genuinely impossible, only a maintainer may apply the `screenshots-exempt` label (agents must never apply it).
- Smoke screenshot fixture data should use Foundry VTT core or dnd5e non-SVG raster icon paths directly when previews need imagery; do not invent custom SVG preview art.
- The smoke harness Phase D0 (`screenshot-manager` step in `scripts/foundry-test-run.mjs`) pins many selectors by class, `.nth(N)` index, and visible button text. When changing any manager UI surface — environment row markup, env-edit view, composition list, header actions — grep the harness for the changed classes / text before declaring the change done. See `docs/agents/smoke-harness.md`.

### Release Utilities

- Use `node scripts/latest-module-versions.mjs --profile fabricate-beta` to query the current latest beta manifest versions for Fabricate and the premium sibling modules; substitute another `--profile <name>` when the local AWS profile differs. The script reads `release.s3.config.json` plus `../fabricate-premium/release.config.json`, uses exact S3 `GetObject` reads for `modules/<moduleId>/<channel>/latest/module.json`, and does not require `s3:ListBucket`. Useful flags: `--json`, `--include <moduleId>`, `--bucket <name>`, `--channel <name>`, `--premium-config <path>`, and `--no-premium`.

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
- `styles/fabricate.css` is loaded **globally** into the Foundry document (via `module.json`'s `styles` field; in dev also through the `src/main.js` import), so it shares the page with every other module and system sheet. Every selector in this file MUST be namespaced under a `.fabricate*` root class (e.g. `.fabricate-app`, `.fabricate-admin`, `.fabricate-manager`) — the only exception is `:root` for custom-property definitions. A bare generic selector like `.badge` or `.btn-icon` will bleed into other sheets (it previously broke the D&D 5e Armor Class badge). `tests/styles-namespacing.test.js` enforces this under `npm test` and fails on any unscoped selector. Note this is independent of the Svelte `<style>` blocks in `src/ui/svelte/`, which compile to hashed, component-scoped classes and do not bleed.
- No literal colours in product code. `tests/components/theme-colour-contract.test.js` (under `npm test`) forbids colour literals — `#hex`, `rgb()/rgba()`, `hsl()/hsla()`, bare `white`/`black` — anywhere under `src/ui/` or `styles/` outside the approved `:root`/theme blocks, **including JS fallback constants** (a `'#888888'` default in a `.js` util fails the gate). Use a theme token (`var(--fab-…)`); when a util can't resolve a colour, return `''` and let CSS supply a themed default. A region/document's *own* runtime colour is fine inline via `style=` (it isn't a source literal).
- Localized strings belong in `lang/`; UI code should use the Foundry bridge/localization helpers instead of hard-coded copy.
- Manager confirmation prompts (discard unsaved, destructive actions) MUST go through `services.confirmDialog` → `foundry.applications.api.DialogV2.confirm`. Never use `globalThis.confirm()`, not even as a fallback. See `docs/agents/manager-confirm-discard.md`.
- When a Svelte component is shared between task and event (or similar `kind`-driven) contexts, split shared i18n keys into kind-specific siblings (`…Task` / `…Event`) and select with a ternary on `kind`. Reserve combined "tasks and events" / "task or event" wording for surfaces that genuinely mix kinds (overview hints, mixed validation issues, error messages).
- Generic "record" / "records" wording in user-facing strings under `FABRICATE.Admin.Manager.EnvironmentEditor.*` is a known anti-pattern; environments don't have catalysts, they have tasks, events, and required tools. Use accurate domain terms when adding new strings.
- Test files under `tests/components/` pin code shapes with `inspectorSource.includes(...)` / `listSource.includes(...)` string assertions. When renaming variables, refactoring markup, or removing i18n keys, grep these assertions and update them in lockstep — they fail at test time, not compile time.

## FoundryVTT Notes

- `game`, `ui`, `Hooks`, and `CONFIG` are runtime globals. Never import them.
- The module targets Foundry V13. Account for V13 API shapes when touching Foundry-facing code.
- V13 **animates token movement**: at the `updateToken` hook the document is already at the destination, but the placeable (`token.object.center`) and `TokenDocument#getCenterPoint()` still report the *animating* position — the spot the token just left. Any Scene Region containment / "where is this token" read at the hook is off-by-one if it uses the placeable. Read `TokenDocument#regions` (authoritative membership) or compute the centre from the document `x/y` + footprint, and defer until the move animation settles. See [`docs/agents/travel-current-realm-sensing.md`](docs/agents/travel-current-realm-sensing.md).
- `game.documentTypes.Item` is a `Set`; use `Array.from()` before array-style operations.
- Prefer `game.documentTypes` over `game.system.documentTypes`, with fallback only when needed.
- Use `sheet.changeTab(tabName, groupName)` for ApplicationV2 tab switches.
- Foundry core styles fight Fabricate styles for `button`/`input` controls; the override usually belongs in global per-area CSS in `styles/fabricate.css`, not in scoped Svelte `<style>`. Two recurring instances:
  - **Layout.** Foundry's global `button` styles center their content (`justify-content: center`) and pin a fixed height. A Svelte component rendering a `<button>` with custom content (icon+label triggers, portrait+name option rows) must set `justify-content: flex-start`, `height: auto`, and a `min-height` explicitly, or content centers and taller children (portraits) clip. Test layout in real Foundry, not just compiled source.
  - **Focus ring.** Foundry paints an orange focus ring that must be overridden per app-area (`.fabricate-admin`, `.fabricate-manager`, `.fabricate-app`) with a paired block in `styles/fabricate.css`: strip the ring on `:focus`, repaint the accent ring on `:focus-visible`. Handle `:focus-visible` explicitly — a button lands in that state after a sibling/panel re-render (e.g. a tab-panel swap on click), so a `:focus:not(:focus-visible)` rule alone leaves the orange ring in the "clicked-away" state. Keep these blocks at **single area-class** specificity (`.fabricate-app …`, i.e. 0,2,1) so per-component focus rings (scoped Svelte, 0,3,0) still win; doubling the class (`.fabricate.fabricate-app …`, 0,3,1) silently clobbers them. Do not add scoped focus CSS in components — it duplicates the area block and needs a Svelte rebuild, whereas `styles/fabricate.css` is served directly. New top-level app surfaces need their own focus block; a partial rule reads as "handled" but isn't. See [`docs/agents/foundry-css-overrides.md`](docs/agents/foundry-css-overrides.md).
- Preserve `flags.core.sourceId` when embedded items must map back to a world item.
- `CraftingSystemManager` uses `getSystems()` and `getItems(systemId)`.
- Update compatibility metadata if new Foundry API requirements are introduced.

## Architecture Pointers

These deep-dive notes live under `docs/agents/` and explain layered patterns or data-model subtleties that aren't obvious from reading any single file. Update them when the underlying code changes — stale citations defeat the whole point.

- [`docs/agents/manager-confirm-discard.md`](docs/agents/manager-confirm-discard.md) — the three-layer "discard unsaved draft?" guard (Svelte route-exit → store helper → `services.confirmDialog`) used by every editor in the Crafting System Manager.
- [`docs/agents/gathering-environment-data-model.md`](docs/agents/gathering-environment-data-model.md) — environment objects carry both legacy embedded `tasks[]` and modern library refs (`enabledTaskIds` etc); names the canonical sources for composition counts and required-tool aggregation.
- [`docs/agents/smoke-harness.md`](docs/agents/smoke-harness.md) — how `npm run test:foundry` is organized, where its outputs land, and which Phase D0 selectors routinely drift when manager markup changes.
- [`docs/agents/ui-pr-screenshots.md`](docs/agents/ui-pr-screenshots.md) — how UI PR screenshot evidence is planned, collected from smoke artifacts, embedded in PR descriptions, and validated in CI.
- [`docs/agents/foundry-css-overrides.md`](docs/agents/foundry-css-overrides.md) — where Foundry core styles fight Fabricate styles (button layout, focus rings) and the global per-area override map in `styles/fabricate.css`, including the specificity ladder that keeps area defaults from clobbering per-component rules.
- [`docs/agents/travel-current-realm-sensing.md`](docs/agents/travel-current-realm-sensing.md) — how a gathering party's current Fabricate **realm** is resolved live from its travel-marker token (mapped from Foundry Scene Regions many-to-one via each realm's `sceneMappings[].sceneRegionUuid`), and the V13 token-movement timing trap (placeable centre lags the move → off-by-one) plus the three mitigations.

## Git Conventions

- All implementation, documentation, and workflow-file changes must happen on a non-`main` branch.
- Before editing, verify the current branch (`git branch --show-current`). If it is `main`, create or switch to a task branch first. Re-check after any merge — merging a PR can move the local checkout to `main`, so a branch you were on earlier may no longer be current.
- When the work is complete, commit to that branch, push it, and open a PR targeting `main`.
- Respond to review feedback by updating the same branch and PR; do not open replacement PRs unless the user asks.
- Review-only agents inspect the active branch and PR, and must not merge to `main`.
- PR titles must comply with Conventional Commits, using the same `<type>(#<issue>): <short description>` format for `feat`, `fix`, and `perf`.
- PR descriptions must use H2 sections in this order: `Description`, `Benefit(s)`, `Changes in this PR`, `Testing`, and `Screenshots (if applicable)`.
- For UI-touching PRs, the `Screenshots` section must embed at least one image (markdown `![alt](url)` or `<img>`) beneath the heading — the CI check looks for exactly that. `npm run screenshots:ui:publish -- --pr <number>` produces real smoke-harness screenshots (S3-hosted under `pr-screenshots/<number>/`) and embeds them automatically, but a drag-and-dropped GitHub attachment under the heading works too. There is no `SCREENSHOTS_NEEDED:` bypass; if capture is genuinely impossible, a maintainer applies the `screenshots-exempt` label. Do not commit PR-scoped screenshots under docs or other asset directories.
- Never commit directly to `main`.
- Use Conventional Commits.
- For `feat`, `fix`, and `perf`, use the format `<type>(#<issue>): <short description>`.
- Validate commit messages with `npx commitlint --from <merge-base> --to HEAD` before pushing **and after any history rewrite** — the `lint-commits` CI job lints every commit on the PR, not just the tip, so a stale subject deep in the branch fails it. Recurring traps it enforces: the header type must be a single valid Conventional type (`test/refactor:` is invalid — `/` breaks parsing into `type-empty`/`subject-empty`; pick one type); the subject must **not** start capitalized (`subject-case` rejects sentence/start/pascal/upper-case — lead with a lowercase verb, e.g. `feat: add Map Region Links tab`, not `feat: Map Region Links tab`). `body-max-length` (>500 chars) is a warning only and does not fail the job. To reword a non-tip commit non-interactively (interactive rebase is unavailable), use `git filter-branch --msg-filter` then `git push --force-with-lease`.
- Merge commits are linted too. A `merge:` prefix fails `commitlint` (`merge` is not an allowed type); `commitlint`'s default ignore only skips the standard capitalized `Merge branch …` / `Merge pull request …` messages. For a `--no-ff` integration merge, title it `chore: merge <x> into <y>` (or keep the default `Merge branch …` message). `git commit --amend -m "chore: …"` preserves both parents if a merge message needs fixing; re-run `npx commitlint --from=main --to=HEAD`, then `git push --force-with-lease`.
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
- Add static cloud credentials (e.g. AWS access keys) to CI. Automation/agent workflows authenticate to cloud via OIDC role assumption (`aws-actions/configure-aws-credentials` + `id-token: write`) using a dedicated least-privilege role scoped to the task — never the release/production role. `pull_request_target` jobs must check out only the base ref and never execute PR-head code. See `docs/contributing.md` for the screenshot-publishing role/policy example.
