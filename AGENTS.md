# Fabricate Agent Guidelines

## Project

System-agnostic FoundryVTT crafting module targeting Foundry VTT V13.
Primary stack: JavaScript ES modules, Svelte 5, Vite, `node:test`, happy-dom, Playwright, and Jekyll docs.

## Planning & Workflow

- Use the orchestrator flow first for any non-trivial task.
- Use OpenSpec as the planning system of record for non-trivial work.
- Plans touching shared scripts (smoke test, build, lint, anything in `scripts/` invoked from `package.json`) must spell out the behavior in both CI and local dev explicitly — don't bury one as a parenthetical.
- Capture the change delta in the work's GitHub issue (a managed `openspec-delta` block — proposal, design, tasks, spec deltas, roster, acceptance) before implementation starts; do not version planning files under `openspec/changes/` (that directory is gone).
See `openspec/README.md` for the block format and rules.
- When the work originates from an existing issue, append the delta block and preserve the reporter's original text; when it originates from a prompt with no issue, create one from the `OpenSpec Change Delta` issue template.
- Read your assigned issue using the GitHub CLI before implementation work starts.
- Use GitHub issue numbers such as `#42` when an issue exists; treat legacy `T-XXX` IDs as reference only.
- Treat `openspec/specs/*/spec.md` as the canonical specification source of truth.
- Route quick-start documentation changes to `docs/quickstart.md` only.

## Default Agentic Workflow

Non-trivial work runs as a `plan → plan-review → implement → review → docs` state machine, with iteration until each gate accepts.
Stages auto-spawn role-specific subagents based on the change signals below — agents do not need to be requested by name.
Subagents not matched by the routing table only run when explicitly requested.

The routing tokens below (`fabricate_orchestrator`, etc.) are provider-neutral role identifiers.
Each resolves to a registered agent in **both** providers — `.codex/agents/*.toml` for Codex and `.claude/agents/*.md` for Claude (spawned via the Agent tool using the `subagent_type` in [Agent Roles & Bindings](#agent-roles--bindings)) — so the auto-spawn workflow behaves the same regardless of which assistant is driving.
The one exception is the read-only `fabricate_pr_explorer` mapping role: Claude uses its built-in `Explore` agent rather than a dedicated binding (see the table below).

**Workflow driver.** The top-level loop — Codex's depth-0 prompt agent or Claude's main loop — is the *workflow driver*.
It enacts the orchestrator role: it owns routing and the iteration loops and performs **all** agent spawning.
The spawnable `fabricate_orchestrator` agent is a planning helper the driver may delegate to for resolving the roster and drafting the OpenSpec delta in the issue; it returns its plan to the driver.
Spawned role agents execute their scoped role and do not nest — no role agent spawns another.

### Auto-spawn routing

Resolve the roster with this procedure — it is mechanical, not a judgment call:

1. Compute the changed-path set: the delta's affected-files list during planning, or `git diff --name-only origin/main...HEAD` during review.
2. Match every path against every row's signal below; a path-signal row matches when any changed path matches any of its globs, and a content-signal row (Foundry identifiers, competitor questions, PR investigation) matches on the diff content or request text instead.
3. Take the union of every matching row's agents — multi-select, never single-pick; the "any non-trivial task" row always applies.
4. Record the union in the issue delta's `### Resolved Roster` section, split by stage (plan-review, post-implementation review, docs loop).

| Signal                                                                                                                            | Agent(s)                                                                                         | Stage                                    |
|-----------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|------------------------------------------|
| Any non-trivial task                                                                                                              | `fabricate_orchestrator` (plan), `fabricate_implementer` (build), `fabricate_reviewer` (verdict) | always                                   |
| Any path matches `src/ui/**`, `styles/**`, or `**/*.svelte`                                                                       | `fabricate_ux_designer`                                                                          | plan-review + post-implementation review |
| Any path matches `src/models/**`, `src/systems/**`, `src/integrations/**`, `openspec/specs/**`, or `lang/**`, or the change renames or redefines domain language | `fabricate_domain_expert`                                                                        | plan-review + docs loop                  |
| Any path matches `tests/**` (adds, removes, or restructures tests or test infrastructure)                                         | `fabricate_quality_engineer`                                                                     | plan-review + post-implementation review |
| Any path matches `src/canvas/**` or `src/integrations/**` or touches `src/main.js` or `module.json`, or the diff adds or edits `Hooks.`, `game.`, `ui.`, `CONFIG.`, `ApplicationV2`, `DialogV2`, sheet/document APIs, or settings/flags/UUID handling | `foundry_integrator`                                                                             | plan-review + post-implementation review |
| Changes behaviour, public API surfaces, hooks, slash commands, settings, JSDoc-documented exports, or anything covered by `docs/` | `fabricate_docs_writer` + `fabricate_domain_expert` (paired loop)                                | post-implementation docs loop            |
| The request asks a competitor, market, or precedent question                                                                      | `fabricate_competitive_analyst`                                                                  | plan                                     |
| The request needs GitHub PR investigation                                                                                         | `fabricate_pr_explorer`                                                                          | as needed                                |

Worked examples:

- A change touching `src/ui/svelte/apps/manager/EnvironmentEditView.svelte` and `lang/en.json` matches the always row, the UI row (`**/*.svelte`), and the domain row (`lang/**`): plan-review runs `fabricate_ux_designer` and `fabricate_domain_expert`, post-implementation review runs `fabricate_reviewer` and `fabricate_ux_designer`, and the docs loop runs `fabricate_docs_writer` with `fabricate_domain_expert`.
- A change touching `src/systems/GatheringEngine.js` and `tests/gathering-engine-listing.test.js` matches the always row, the domain row (`src/systems/**`), and the tests row (`tests/**`); `foundry_integrator` joins only when the diff also adds or edits one of the Foundry identifiers above.

### Iteration cycles

Three loops run until acceptance, each capped at 3 revisions before escalating to the user:

In every loop, reviewers return their verdicts to the driver, which acts on them and summarizes outcomes to the user.
Reviewers do not post verdicts (or other workflow notes) as GitHub issue or PR comments.

1. **Plan review loop.** The driver drafts the OpenSpec delta in the issue's `openspec-delta` block (delegating to a `fabricate_orchestrator` planning agent when useful), then spawns the plan-review agents matched by the routing table.
Each emits `APPROVED / NEEDS_CHANGES / BLOCKED` against the delta, returning its verdict to the driver rather than commenting on the issue.
The driver rewrites the delta block in place until every plan reviewer approves.
2. **Implementation review loop.** The driver spawns the implementer to ship changes — including the canonical spec changes under `openspec/specs/` that the delta requires — then spawns `fabricate_reviewer` plus any post-implementation reviewers from the routing table to emit verdicts.
Reviewers compare the actual `openspec/specs/` diff against the proposed delta in the issue and confirm a faithful realization (or flag a justified deviation to reconcile).
The implementer addresses `NEEDS_CHANGES` until every reviewer emits `APPROVED`.
3. **Documentation iteration loop.** Triggered whenever the change touches behaviour or any documented API surface.
The driver spawns the paired `fabricate_domain_expert` (updates `DOMAIN.md` and canonical specs against the diff, and reconciles the issue delta — updating it and its `Deviations` note when implementation justifiably diverged) and `fabricate_docs_writer` (updates JSDoc and the Jekyll site to match the shipped canonical spec).
Each then reviews the other's output and emits `DOCS APPROVED / DOCS NEEDS_CHANGES`.
Loop until both approve.

### Stop conditions

- Any reviewer returning `BLOCKED` halts the loop and surfaces to the user.
- Hitting the 3-revision cap on any loop halts and surfaces to the user with the outstanding findings.
- User intervention takes precedence; treat user guidance as the new entry condition for the next iteration.

## Build & Test

### Prereqs

- Node.js 22+ (see `.nvmrc` / `.node-version`).
On Windows with `nvm-windows`, run `nvm use` manually — it does not auto-switch on directory change.
- npm (ships with Node).
- Docker Desktop only required for `npm run test:foundry`.
Not required for `npm test`, `npm run build`, or `npm run dev`.
- No extra shell tools required. `npm run release:build` uses Windows' built-in `tar.exe` for zip creation; on Ubuntu it uses `zip`.

- `npm test` — required validation gate for implementation changes.
Its glob enumerates a fixed set of test directories (see the `test` script in `package.json`).
A test placed in a directory the glob does not list is NOT gated, even though it passes when run directly with `node --test <file>`.
When adding a test in a new directory, add that directory to the `test` script and confirm the total count rises under `npm test`.
A mounted-component test that references a `.svelte` (or imported module) missing from its harness allowlist does not fail — it hangs and is reported as `# cancelled`, so after adding/rendering a component confirm `# cancelled 0`, not just `# fail 0` (see the implementer skill).
- **SonarCloud quality gate** — a separate CI job evaluated on the PR's *new code*, distinct from `npm run lint`.
It fails on `new_duplicated_lines_density > 3%`, and SonarCloud Automatic Analysis **does not honor `sonar.cpd.exclusions`** from `sonar-project.properties`: duplication in `tests/**` and `scripts/**` fixtures counts against the gate exactly like `src/`.
Keep new test/fixture/script code DRY (shared helpers like `createMountedComponentHarness`, hoisted constants); the only durable way to exempt a path is the maintainer-set **Duplication Exclusion** in the SonarCloud project UI.
The gate also fails on new bugs/code-smells that ESLint does not flag (e.g. `Array#sort()` without a comparator, a nested ternary), so a PR can be lint-green yet Sonar-red — read the gate's findings, don't assume `npm run lint` covers it.
- Reading a smoke result: `test-results/summary.json` reports `passed: false` if any phase step fails OR if `consoleErrors[]` is non-empty.
Benign browser `404 (Not Found)` asset misses in the fixture world populate `consoleErrors` and flip `passed` to false even when every `steps[]` entry passed.
Check `steps[]` for an actual failing step before treating a run as broken or discarding its screenshots — see the "Foundry integration (smoke) tests" section in `CONTRIBUTING.md`.
- `npm run build` — required build gate for implementation changes.
- `npm run lint` + `npm run lint:css` + `npm run format:check` + `npm run lint:md` — required ESLint + Stylelint + Prettier + markdownlint gate (the `lint` CI job).
ESLint/Prettier run over a **staged path scope** (see the `lint`/`format` globs in `package.json`): now the entire `src/` JavaScript surface — `src/{models,utils,integrations,config,migration,canvas,systems}` + `src/toolBreakageRuntime.js`. `tests/`, `src/ui/**`, `*.svelte`, `src/main.js`, and `scripts/**` are NOT gated yet — widen a path in its own focused PR only once it passes BOTH ESLint and the SonarCloud quality gate (reformatting counts as new code, so it surfaces pre-existing Sonar findings). `npm run lint:css` (Stylelint, config in `stylelint.config.js`) gates `styles/**/*.{css,scss}` and enforces quality, reliability, duplication, reuse/shorthand, and cross-browser support (against the `browserslist` in `package.json`); Svelte scoped `<style>` blocks are out of scope.
Use `npm run lint:fix` / `npm run lint:css:fix` / `npm run format` to auto-fix.
See the "Linting & formatting" section in `CONTRIBUTING.md`.
- `npm run lint:md` (markdownlint, config in `.markdownlint-cli2.jsonc`) gates every authored Markdown file and enforces **one sentence per line** — run it before finalising any change that touches Markdown.
Run `npm run lint:md:fix` to auto-split prose, re-running until the count stops dropping (a long paragraph splits one boundary per pass), and wrap a multi-sentence table cell's table in a `<!-- markdownlint-disable markdownlint-sentences-per-line -->` / `<!-- markdownlint-enable markdownlint-sentences-per-line -->` region, since a cell cannot break across lines.
- `npm run test:foundry` — use when a task needs live Foundry UI or screenshot validation.
- For UI/UX work, prefer the local Vite dev server first, using the user-provided dev URL when available.
- Fall back to `npm run test:foundry` when a change depends on real Foundry runtime behavior, when no Vite dev server is available, or when clean reproducible screenshots are needed.
- UI-changing PRs (files under `src/ui/`, `styles/`, or any `*.svelte`/`*.css`) must include real smoke-run screenshot evidence for the relevant changed views before opening or updating the PR; a `lang/` change requires screenshots only when the same PR also changes one of those render files.
Use `npm run screenshots:ui:plan -- --base origin/main` to identify expected views, run `npm run test:foundry` (local default `full` profile) to produce real Foundry screenshots under `test-results/`, `npm run screenshots:ui -- --base origin/main --pr <number>` to collect the relevant smoke artifacts into `tmp/pr-screenshots/<number>/`, then `npm run screenshots:ui:publish -- --pr <number>` to upload them to S3 (under `pr-screenshots/<number>/`) and embed the returned `![pr-<number> ...]` image markdown into a managed block in the PR body's `Screenshots (if applicable)` section, then `npm run screenshots:ui:clean -- --pr <number>` so PR-scoped screenshots are not committed as repository assets.
Do NOT run the full smoke profile on a GitHub Actions runner — generation is local.
The `check-screenshots` gate cannot be self-satisfied: there is no `SCREENSHOTS_NEEDED:` bypass.
If capture is genuinely impossible, only a maintainer may apply the `screenshots-exempt` label (agents must never apply it).
- Smoke screenshot fixture data should use Foundry VTT core or dnd5e non-SVG raster icon paths directly when previews need imagery; do not invent custom SVG preview art.
- The smoke harness Phase D0 (`screenshot-manager` step in `scripts/foundry-test-run.mjs`) pins many selectors by class, `.nth(N)` index, and visible button text.
When changing any manager UI surface — environment row markup, env-edit view, composition list, header actions — grep the harness for the changed classes / text before declaring the change done.
See the "Foundry integration (smoke) tests" section in `CONTRIBUTING.md`.

### Release Utilities

- Use `node scripts/latest-module-versions.mjs --profile fabricate-beta` to query the current latest beta manifest versions for Fabricate and the premium sibling modules; substitute another `--profile <name>` when the local AWS profile differs.
The script reads `release.s3.config.json` plus `../fabricate-premium/release.config.json`, uses exact S3 `GetObject` reads for `modules/<moduleId>/<channel>/latest/module.json`, and does not require `s3:ListBucket`.
Useful flags: `--json`, `--include <moduleId>`, `--bucket <name>`, `--channel <name>`, `--premium-config <path>`, and `--no-premium`.

## Code Conventions

- The runtime codebase is JavaScript, but typed surfaces must stay explicit; avoid `any` without justification where types are used.
- Keep modules and objects small and cohesive; if a unit naturally does X and Y, split it.
- Keep constructors and factories boring; avoid hidden I/O, service lookup, and object graph assembly inside them.
- Inject specific collaborators instead of passing context or container grab bags and digging through them later.
- Prefer behavior-first APIs over getter or setter-heavy data bags.
- Isolate global mutable state and runtime lookups at thin edges that are easy to test.
- Svelte is the only UI templating system.
Do not add or reintroduce Handlebars templates.
- UI shells live in `src/ui/*.js` and `src/ui/*.svelte.js`.
- Svelte UI components live in `src/ui/svelte/apps/` and `src/ui/svelte/components/`.
- Svelte stores live in `src/ui/svelte/stores/`.
- Domain and runtime logic lives under `src/models/`, `src/systems/`, `src/utils/`, `src/integrations/`, `src/config/`, and related `src/` modules.
- Tests live under `tests/`.
- Styles live in `styles/`, primarily `styles/fabricate.css`.
- `styles/fabricate.css` is loaded **globally** into the Foundry document (via `module.json`'s `styles` field; in dev also through the `src/main.js` import), so it shares the page with every other module and system sheet.
Every selector in this file MUST be namespaced under a `.fabricate*` root class (e.g. `.fabricate-app`, `.fabricate-admin`, `.fabricate-manager`) — the only exception is `:root` for custom-property definitions.
A bare generic selector like `.badge` or `.btn-icon` will bleed into other sheets (it previously broke the D&D 5e Armor Class badge). `tests/styles-namespacing.test.js` enforces this under `npm test` and fails on any unscoped selector.
Note this is independent of the Svelte `<style>` blocks in `src/ui/svelte/`, which compile to hashed, component-scoped classes and do not bleed.
- No literal colours in product code. `tests/components/theme-colour-contract.test.js` (under `npm test`) forbids colour literals — `#hex`, `rgb()/rgba()`, `hsl()/hsla()`, bare `white`/`black` — anywhere under `src/ui/` or `styles/` outside the approved `:root`/theme blocks, **including JS fallback constants** (a `'#888888'` default in a `.js` util fails the gate).
Use a theme token (`var(--fab-…)`); when a util can't resolve a colour, return `''` and let CSS supply a themed default.
A region/document's *own* runtime colour is fine inline via `style=` (it isn't a source literal).
- Localized strings belong in `lang/`; UI code should use the Foundry bridge/localization helpers instead of hard-coded copy.
- Manager confirmation prompts (discard unsaved, destructive actions) MUST go through `services.confirmDialog` → `foundry.applications.api.DialogV2.confirm`.
Never use `globalThis.confirm()`, not even as a fallback.
See [Manager confirm-discard guard](#manager-confirm-discard-guard).
- When a Svelte component is shared between task and event (or similar `kind`-driven) contexts, split shared i18n keys into kind-specific siblings (`…Task` / `…Event`) and select with a ternary on `kind`.
Reserve combined "tasks and events" / "task or event" wording for surfaces that genuinely mix kinds (overview hints, mixed validation issues, error messages).
- Generic "record" / "records" wording in user-facing strings under `FABRICATE.Admin.Manager.EnvironmentEditor.*` is a known anti-pattern; environments don't have catalysts, they have tasks, events, and required tools.
Use accurate domain terms when adding new strings.
- Test files under `tests/components/` pin code shapes with `inspectorSource.includes(...)` / `listSource.includes(...)` string assertions.
When renaming variables, refactoring markup, or removing i18n keys, grep these assertions and update them in lockstep — they fail at test time, not compile time.

## FoundryVTT Notes

- `game`, `ui`, `Hooks`, and `CONFIG` are runtime globals.
Never import them.
- The module targets Foundry V13.
Account for V13 API shapes when touching Foundry-facing code.
- V13 **animates token movement**: at the `updateToken` hook the document is already at the destination, but the placeable (`token.object.center`) and `TokenDocument#getCenterPoint()` still report the *animating* position — the spot the token just left.
Any Scene Region containment / "where is this token" read at the hook is off-by-one if it uses the placeable.
Read `TokenDocument#regions` (authoritative membership) or compute the centre from the document `x/y` + footprint, and defer until the move animation settles.
See [Travel: live current-realm sensing](#travel-live-current-realm-sensing).
- `updateWorldTime` is a **synced** hook — it fires on every connected client off the server's broadcast.
Any externally observable side effect driven from it (publishing public hooks, posting chat, writing documents) must be gated to the primary GM (`game.users.activeGM?.id === game.user?.id`, the `isPrimaryGM` seam in `GatheringEngine`) or it duplicates N times.
Idempotent shared-state updates (stamina regen, node respawn) are already gated this way; the gathering completion-hook publication follows the same rule for matured timed runs.
- Foundry `DiceTerm#total` is the post-modifier, active-only sum; `DiceTerm#number`/`#faces` may be undefined until evaluated — read `results[].result` for raw per-die logic.
- A DISMISSED manual roll-fulfilment `RollResolver` **resolves — it never rejects** — and silently digital-fills every unfilled die with `term.randomFace()`, so a `try/catch` around `Roll#evaluate({allowInteractive:true})` cannot detect a cancel.
Detect it via a `RollResolver` subclass recording submit-vs-dismiss: `fabricateDismissed = fulfillable.size > 0 && !submitted` — do NOT use `rendered === false`, which is also `false` for a default-digital client (never rendered) AND after a genuine submit's `close()`, so it false-positive-cancels every digital interactive roll.
Inject the subclass through a LOCAL `Roll` subclass overriding the static `resolverImplementation` getter (wrap `super.resolverImplementation` to preserve DSN/hardware resolvers), built LAZILY at call time because `globalThis.Roll` is absent headless.
`allowInteractive: false` fully bypasses the resolver (identical to `Roll.simulate`) — keep it verbatim for the automated/API path.
Never register the local subclass on `CONFIG.Dice.rolls` / `Roll.defaultImplementation`; and because a chat message serializes the roll's class name, its `toJSON().class` MUST be re-labelled to the registered default's name or a chat/DSN `Roll.fromData` on every client throws "Unable to recreate `<Subclass>` instance".
See `src/systems/fabricateRoll.js` and the "Interactive Check Rolls" requirement in `openspec/specs/resolution-modes/spec.md`.
- `game.documentTypes.Item` is a `Set`; use `Array.from()` before array-style operations.
- Prefer `game.documentTypes` over `game.system.documentTypes`, with fallback only when needed.
- Use `sheet.changeTab(tabName, groupName)` for ApplicationV2 tab switches.
- Foundry core styles fight Fabricate styles for `button`/`input` controls; the override usually belongs in global per-area CSS in `styles/fabricate.css`, not in scoped Svelte `<style>`.
Two recurring instances:
  - **Layout.** Foundry's global `button` styles center their content (`justify-content: center`) and pin a fixed height.
A Svelte component rendering a `<button>` with custom content (icon+label triggers, portrait+name option rows) must set `justify-content: flex-start`, `height: auto`, and a `min-height` explicitly, or content centers and taller children (portraits) clip.
Test layout in real Foundry, not just compiled source.
  - **Focus ring.** Foundry paints an orange focus ring that must be overridden per app-area (`.fabricate-admin`, `.fabricate-manager`, `.fabricate-app`) with a paired block in `styles/fabricate.css`: strip the ring on `:focus`, repaint the accent ring on `:focus-visible`.
Handle `:focus-visible` explicitly — a button lands in that state after a sibling/panel re-render (e.g. a tab-panel swap on click), so a `:focus:not(:focus-visible)` rule alone leaves the orange ring in the "clicked-away" state.
Keep these blocks at **single area-class** specificity (`.fabricate-app …`, i.e. 0,2,1) so per-component focus rings (scoped Svelte, 0,3,0) still win; doubling the class (`.fabricate.fabricate-app …`, 0,3,1) silently clobbers them.
Do not add scoped focus CSS in components — it duplicates the area block and needs a Svelte rebuild, whereas `styles/fabricate.css` is served directly.
New top-level app surfaces need their own focus block; a partial rule reads as "handled" but isn't.
See the "Foundry vs Fabricate CSS overrides" section in `CONTRIBUTING.md`.
- Preserve `flags.core.sourceId` when embedded items must map back to a world item.
- Fabricate runs configured macros through `MacroExecutor.run(uuid, context)` (`src/utils/MacroExecutor.js`), **not** `Macro#execute`.
  It compiles `macro.command` into an `AsyncFunction` invoked with `(context, args, game, foundry, ui, fromUuid)` — so a Fabricate macro receives `context` (also aliased as `args`) and the explicit globals, and does **not** get Foundry's `Macro#execute` locals (`actor`/`token`/`speaker`/`character`/`scope`).
  A thrown error propagates to the caller (no Foundry notification-swallow), which is why a currency payment-gate macro that throws aborts the craft loudly instead of silently passing.
- `CraftingSystemManager` uses `getSystems()` and `getItems(systemId)`.
- V13 `CalendarData#timeToComponents().day` is the day-*of-year* (0-based, and it resets every year), NOT a cumulative campaign day.
Compose an absolute/monotonic day from `year` + `day` (plus a days-per-year seam) before showing it — see `daysPerYearFromCalendar` (`src/systems/foundryCalendar.js`) and `worldTimeLabel` (`src/ui/svelte/util/worldTimeLabel.js`).
- A run's persisted `componentSourceActorUuids` are UUIDs (not ids) — resolve them with `fromUuid`/`fromUuidSync`, never `game.actors.get`.
See `resolveAdvanceSources` (`src/systems/advanceCraftingSources.js`).
- Update compatibility metadata if new Foundry API requirements are introduced.

## Architecture Pointers

These deep-dive notes explain layered patterns and data-model subtleties that aren't obvious from reading any single file.
Treat the cited file paths as **load-bearing**: when a change touches a path mentioned in a note, update the note in the same change — stale citations defeat the whole point.
Cite code by symbol name and file path only — for example `_playerListingFields` in `src/systems/GatheringListingBuilder.js`, locatable with `grep -n` — never by line number; `npm run validate:agents` rejects `file.js:NNN`-style citations because they rot silently as code moves.

Some contributor-workflow deep-dives moved into `CONTRIBUTING.md`: the Foundry smoke harness (`npm run test:foundry` phases, outputs, Phase D0 selector drift) is the "Foundry integration (smoke) tests" section; UI PR screenshot evidence is the "UI PR screenshot evidence" section; the Foundry-vs-Fabricate CSS override map (button layout, focus rings, specificity ladder) is the "Foundry vs Fabricate CSS overrides" section.

### Manager confirm-discard guard

Every editor in the Crafting System Manager (component, essence, environment, gathering task, gathering event, tools) guards an unsaved draft on route exit.
The pattern is three layers; new editor kinds MUST mirror it rather than reach for `globalThis.confirm()` or thread callbacks through `services` directly.

**1.
Svelte layer — `src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte`.** Each kind has a `confirm{Kind}RouteExit(nextView)` function that early-returns `true` when the view isn't this kind or the local dirty flag is false, then calls the matching store helper.
An orchestrator `confirmRouteExit(nextView)` chains all of them; it's what every "Back to …" / nav-click handler invokes.
Helpers today: `confirmEnvironmentRouteExit`, `confirmEssenceRouteExit`, `confirmComponentRouteExit`, `confirmGatheringTaskRouteExit`, `confirmGatheringEventRouteExit`, `confirmToolsRouteExit`.
Each pairs with a `finish{Kind}RouteExit` that calls `store.cancel{Kind}Draft?.()` to actually clear the draft *after* the user confirms.

**2.
Store layer — `src/ui/svelte/stores/adminStore.js`.** Each kind has a `confirmDiscardDirty{Kind}Draft()` async helper exported on the store.
It calls `services.confirmDialog?.({ title, content, yes, no })` and returns the boolean.
Shared title + button labels live under `FABRICATE.Admin.Manager.DiscardDirty*` in `lang/en.json`; kind-specific body strings live under each kind's namespace.
A shared inner factory `_confirmDiscardDirtyDraft(contentKey, contentFallback)` produces the dialog options for the four kinds whose dirty state lives in Svelte (component, essence, gathering-task, gathering-event).
The two kinds whose dirty state lives in the store (environment, tools) wrap the same factory with their own dirty-check + dedup lock.

**3.
Foundry layer — `src/ui/svelte/util/foundryBridge.js`.** `services.confirmDialog` is wired to `foundry.applications.api.DialogV2.confirm`.
In tests, `services.confirmDialog` is absent and the store helpers are stubbed directly on the test fixture — the Svelte layer never knows the difference.

**Adding a new editor kind:** (1) add a `confirmDiscardDirty{Kind}Draft()` helper in `adminStore.js` using the shared `_confirmDiscardDirtyDraft` factory; (2) export it on the store API; (3) add a `confirm{Kind}RouteExit(nextView)` function in `CraftingSystemManagerRoot.svelte` and chain it through `confirmRouteExit`; (4) wire the editor's Back / Cancel button to a handler that runs `afterTruthyResult(confirmRouteExit(nextView), () => { activeView = ... })` — never call `store.cancel{Kind}Draft?.()` directly, that bypasses the prompt; (5) add a stub for the new helper to the `confirmDiscardDirty{Kind}Draft` stub block in the store fixture of `tests/components/manager-mounted.test.js` (locate it with `grep -n confirmDiscardDirty`).

**Anti-patterns:** adding `globalThis.confirm(message)` as a fallback (DialogV2 is always present in Foundry; missing-DialogV2 means a test environment that should stub the store helper); adding a `services?.confirmDiscard{Kind}Draft?.()` seam that nothing wires up in production; skipping the dirty check at the Svelte layer and relying solely on the store helper (the Svelte layer is the source of truth for which view is active and whether its draft is dirty; the store helper just asks the user).

### Gathering environment data model

Gathering environment objects carry **two parallel sets** of task/event fields.
Knowing which one to read for which question saves a lot of stale-zero confusion.

**Modern (canonical for new envs).** Library references — the environment composes content from `gatheringConfig.systems[].tasks` / `.events` by id: `environment.enabledTaskIds[]` (included automatically), `disabledTaskIds[]` (GM explicitly excluded), `forcedTaskIds[]` (force-added in manual mode), and the `enabledEventIds[]` / `disabledEventIds[]` / `forcedEventIds[]` siblings for events.
The actual composed-task set is `enabled ∪ forced − disabled`, then filtered by environment matching rules (biome / danger / library-enabled).
Geography is NOT a composition axis — the first-class `GatheringRealm` only gates location availability, never composition.

**Canonical GM-admin composition counts** for the row table and inspector live at `$viewState.environmentTaskCounts[envId]` (shape `{ availableTaskCount, availableEventCount }`), computed via `_buildEnvironmentCompositionViewModel(environment)?.counts` in `src/ui/svelte/stores/adminStore.js`. `availableTaskCount` counts only records whose `runtimeState === 'available'` — composed **and** with current conditions met (the `runtimeState === 'available'` filters inside the same store).
It is the authoritative GM-runtime "ready right now" count; it is **not** what a player blind-reveal `(x/y)` suffix divides by.

**Player listing counts are a separate, engine-owned surface.** The player-facing listing is produced by `GatheringEngine.listForActor` — a thin delegator to the engine's injected `GatheringListingBuilder` collaborator, whose `_buildEnvironmentListing` in `src/systems/GatheringListingBuilder.js` does the construction — not the admin store.
Each listing carries count/policy fields via `_playerListingFields` in `GatheringListingBuilder.js`: `composedTaskCount` (total composed task pool — `normalizeList(environment.tasks).length`, the blind-reveal denominator `y`; `0` when locked); `discoveredTaskCount` (the `x` — tasks this actor revealed at the effective reveal scope via `GatheringRichStateService.countRevealedTasks`; `0` when locked or `revealPolicy === 'never'`); `revealPolicy` (effective **system-level** policy `never` | `onSuccess` | `onAttempt`, resolved by `GatheringEngine._resolveRevealPolicy`, which the builder receives as its injected `resolveRevealPolicy` collaborator — reveal is system-level only, environments do not override it); `locked` (`true` for a disabled environment, surfaced as a locked identity-only listing to all viewers); and `biomeTags` (resolved biome display metadata).
Beyond `_playerListingFields`, `_buildEnvironmentListing` surfaces `tasks[]` (visible task models — a targeted env lists every task transparently; a non-GM viewer of a blind env gets a single opaque `blindGather` entry; a GM viewer of a blind env gets the full transparent list) and `discoveredTasks[]` (for a non-GM viewer of a blind env only — the transparent, attemptable models for tasks already revealed, each tagged `discovered: true`; `[]` for targeted/GM/locked/`never`-policy; built by `_discoveredTaskModels` in `GatheringListingBuilder.js`).

Per-task `successChance` (on transparent task models, from `GatheringEngine._taskSuccessChance`) is a 0–1 **static drop-rate approximation** `1 − ∏(1 − dropRate_i/100)` over enabled d100 drop rows; `null` for non-d100 tasks and when no enabled drop rows.
It is a **find-chance** ("chance at least one drop rolls"), **not** whole-attempt success — it ignores actor/condition/character modifiers, attempt limits, node depletion, stamina, required tools, and the d100 success threshold.
Use the admin `environmentTaskCounts` only for GM manager surfaces; use the engine listing fields for anything a player sees.

**Legacy (stored slot, superseded by composition).** A stored environment record's embedded `environment.tasks[]` survives only as a back-compat schema slot (the embedded-task UX moved to the standalone `gathering-task-edit` route), and no per-task normalizer for it remains — the old `_normalizeTask` helper was removed from `src/systems/GatheringEnvironmentStore.js`.
At runtime, `GatheringRichStateService.composeEnvironment` replaces `tasks` wholesale with the composed library set (built from the system's task library and normalized by `normalizeLibraryTask`), so the `normalizeList(environment.tasks)` reads in `GatheringEngine.js` and `GatheringListingBuilder.js` see composed library tasks, never the embedded slot.
**Do not read counts off a stored record's `environment.tasks.length`** for the row table, inspector, or readiness checks — switch to `$viewState.environmentTaskCounts`. (An older `task.catalysts[]` field was dead/vestigial and is fully removed.)

**Required tools (system-owned).** Tools are the unified, required-but-reusable, breakable prerequisite primitive (they replaced the retired Catalyst concept).
A task references them by id via `task.toolIds`; the environment surfaces **required tools**, aggregated from the unique `task.toolIds` across the composed task set.
The single canonical library is `system.tools` (the `craftingSystems` setting, populated by `CraftingSystemManager._normalizeSystem`) — **not** a gathering-scoped store. `GatheringRichStateService.composeEnvironment` sources it from `system.tools` and exposes the non-enumerable `__libraryTools` Map on the composed environment; `GatheringEngine._resolveTaskTools` resolves each `task.toolIds` entry against that Map.
A `toolId` that no longer resolves, or resolves to a disabled tool, blocks the attempt with `TOOL_BLOCKED`.
Migrations: **0.6.0** converts recipe-side catalysts into library Tools on `system.tools`; **0.7.0** (`migrateToolsToSystem.js`) reconciles any UI-authored `gatheringConfig.systems[id].tools` onto the matching `system.tools` and clears the gathering-config copy.
After 0.7.0, `system.tools` is the sole library.
There is **no** gathering-side catalyst concept; env-scope "Catalysts" strings are stale — the correct label is "Required tools".

**Canvas placement: Gathering-Task region interactables.** A Gathering Task can be placed on the canvas as a **region-first interactable**: a **Scene Region** carrying a custom **`fabricate.interactable` Region Behaviour** (the authoritative state owner), plus an optional **linked visual** marker (Tile by default; optionally a Drawing or an existing GM Token; or region-only).
There are no synthetic actors or tokens.
Players activate by **walking a controlled token into the region** (Tile double-click is retired): a non-blocking on-canvas prompt appears on the controlling player's client, and clicking *Interact* routes an activation request to the active GM, who validates/grants it, opening the gathering app scoped to (and auto-selecting) that `(environmentId, taskId)`.
A `controlToken` re-trigger + the *Fabricate: interact here* keybinding cover tokens already inside on scene load.
The behaviour has **no `node` field** and snapshots nothing at placement: it carries only `(environmentId, taskId)`; activation reads and decrements `environment.nodeRuntime[taskId]` — the **single source of truth** — exactly as a manual gather would.
Two interactables on the same `(environment, task)` draw down the **same** shared node.
The marker *reflects* state (no per-marker pool): a Tile marker swaps to the depleted image when `environment.nodeRuntime[taskId].current <= 0` and the task configures `nodes.depletedBehavior.swapImage`, and flips back on recharge (`interactableMarkerDepletion.js`, active-GM reconcile); marker `hidden` reflects `resolveMarkerHidden` (true when the interactable is DISABLED or HIDDEN — LOCKED stays visible: Lock ≠ Disable, the prompt fires and Interact is denied). `defaultEnvironmentId` is an optional `string | null` task **placement hint** — it does NOT participate in composition.
Placement-time environment resolution precedence (`src/canvas/environmentResolution.js`): tagged Scene Region containing the drop point (`region.flags.fabricate.environmentId`, one unambiguous hit auto-resolves) → task `defaultEnvironmentId` → GM dialog; holding **Alt** during the drop always forces the GM dialog.
Distinguish a Scene Region `flags.fabricate.environmentId` (a placement hint) from `environment.sceneUuid` (the runtime gathering gate tying a composed environment to a scene during attempt validation) — they are unrelated.

### Travel: live current-realm sensing

How a gathering **party's current Fabricate realm** is determined, and the Foundry V13 token-movement timing trap that makes the naive implementation report the realm the marker *just left*.

> **Realm vs Foundry Scene Region.** A **Gathering Realm** is the Fabricate geography concept; a **Foundry Scene Region** (`RegionDocument`) is the canvas object the travel marker physically sits inside.
The sensing layer reads Foundry Scene Regions (their `sceneRegionUuid`s) and maps them **many-to-one** onto Fabricate realms via each realm's `sceneMappings[].sceneRegionUuid`.
The Foundry-named identifiers (`sceneRegionUuid`, `TokenDocument#regions`, `senseSceneRegions`, `sceneRegionUuidsContainingToken`) are kept verbatim.

**Resolution model.** `GatheringLocationService.resolveCurrentRealms({ partyId, systemId })` (`src/systems/GatheringLocationService.js`) resolves in order: (1) **Manual override** — `party.currentRealmOverrides[systemId].mode === 'manual'` wins (`source: 'manualOverride'`); (2) **Auto (travel-actor) sensing** — otherwise the current realm is derived **live** from where the party's travel-marker token (`party.travelActorUuid`) sits: the Foundry Scene-Region UUIDs the marker is inside → mapped to Fabricate realms by each realm's `sceneMappings[].sceneRegionUuid` (`source: 'travelActor'`; no state stored).
The service stays Foundry-free and unit-testable: the `senseSceneRegions` collaborator (`(travelActorUuid) => Iterable<sceneRegionUuid>`) is injected (default `() => []`); the real implementation is wired in `src/main.js`.
The manager's `adminStore` travel `buildState` resolves each party once via `resolveCurrentRealms` and buckets by realm — so **auto-resolved** parties appear in realm→party lists; do not read `currentRealmOverrides` directly for "parties in realm", or auto parties vanish.

**The V13 token-movement off-by-one.** Foundry V13 **animates** token movement.
When a token moves, the `updateToken` hook fires with the **document** already at the destination, **but** the placeable (`token.object`) is still animating from the old spot, and `token.object.center` **and `TokenDocument#getCenterPoint()`** report the *animating* position — the position the token just left — until the animation settles.
So any containment test reading the placeable centre *at the hook* resolves the **previous** Scene Region (and realm).
This is deterministic, not flaky.
Three independent mitigations (use all three): (1) **read Foundry's authoritative membership** — `senseSceneRegions` prefers `TokenDocument#regions`, falling back to position hit-testing only when unavailable; (2) **compute the centre from the DOCUMENT, not the placeable** — `tokenDocumentCenter(token)` in `src/canvas/regionHitTest.js` computes from `token.x/y` + footprint + `scene.grid.size` first (`getCenterPoint()` / `object.center` are lagging fallbacks; `tokenCenter` placeable-first is correct only for a *settled* token, e.g. the interactable `controlToken` re-trigger — do not reuse it for travel sensing); (3) **wait for the move to settle before re-resolving** — `subscribeTravelMarkerMove` (`src/ui/svelte/util/foundryBridge.js`) defers its notification until the token's move animation completes (`CanvasAnimation`).

**Reactive refresh (no reopen).** `subscribeTravelMarkerMove(handler)` hooks `updateToken` / `createToken` / `deleteToken` and fires `handler(actorUuid)` with the **base** world-actor uuid (`Actor.<actorId>`, matching `party.travelActorUuid` for linked *and* unlinked marker tokens).
It does not pre-filter on `x/y` keys — the **consumer** filters to actual travel markers.
The GM manager's `adminStore` subscribes and calls `travel.patch()` when a moved token is some party's marker (disposed in `destroy()`); the player app's `GatheringView.svelte` subscribes and quietly re-fetches (`load(true)`), with `SvelteFabricateApp` injecting `isTravelMarkerActor(actorUuid)` so only marker moves trigger a refetch (players also stay correct without a refresh because the engine resolves live whenever the gathering app is opened/re-listed).
Token positions sync to every client, so each client derives the same live result — no socket/broadcast needed.
Key files: `GatheringLocationService.js`, `src/main.js` (`senseSceneRegions` injection), `src/canvas/regionHitTest.js`, `foundryBridge.js`, `adminStore.js`, `GatheringView.svelte` / `src/ui/SvelteFabricateApp.svelte.js`.

## Markdown & Prose Conventions

These rules apply to every agent (Claude and Codex) and to how all Markdown is authored.

- Committed Markdown documents — every in-repo `*.md` (e.g. `openspec/specs/`, `docs/`, `DOMAIN.md`, `README`s, `AGENTS.md`, `CLAUDE.md`) — use semantic line breaks: one complete sentence per line.
Start each sentence on its own line; never hard-wrap a single sentence across multiple lines at a fixed column.
This keeps diffs sentence-scoped and review-friendly.
Headings and list items stay one per line as usual, and a multi-sentence list item still puts each sentence on its own line.
A multi-sentence table cell cannot break across lines, so keep its sentences in the one cell and wrap that table in the markdownlint disable region described in the Build & Test section.
Prettier does not format Markdown (its glob is `src/**/*.js` plus `eslint.config.js` only), so nothing re-wraps these files — author them this way by hand.
- GitHub issue, PR, and comment bodies are written as normal prose with no manual line wrapping — one line per paragraph, and let GitHub soft-wrap.
Do not hard-wrap at a fixed column, and do not apply the one-sentence-per-line rule here (GitHub renders single newlines as spaces, but unwrapped source is cleaner to read and edit).
- Do not reflow existing documents wholesale just to apply these rules.
Apply them to new content and to any section you are already editing.

## Git Conventions

- All implementation, documentation, and workflow-file changes must happen on a non-`main` branch.
- Before editing, verify the current branch (`git branch --show-current`).
If it is `main`, create or switch to a task branch first.
Re-check after any merge — merging a PR can move the local checkout to `main`, so a branch you were on earlier may no longer be current.
- When the work is complete, commit to that branch, push it, and open a PR targeting `main`.
- Respond to review feedback by updating the same branch and PR; do not open replacement PRs unless the user asks.
- Review-only agents inspect the active branch and PR, and must not merge to `main`.
- PR titles must comply with Conventional Commits, using the same `<type>(#<issue>): <short description>` format for `feat`, `fix`, and `perf`.
- PR descriptions must use H2 sections in this order: `Description`, `Benefit(s)`, `Changes in this PR`, `Testing`, and `Screenshots (if applicable)`.
- PR descriptions must include a GitHub closing keyword for the issue the PR resolves: put `Closes #<issue>` (or `Fixes #<issue>` / `Resolves #<issue>`) on its own line in the `Description` section so merging the PR auto-closes the issue.
The `<type>(#<issue>):` title prefix and a bare `(#<issue>)` only *reference* the issue — GitHub does **not** auto-close from the title, so the body keyword is required (omitting it leaves resolved issues open, as happened with the #318–#326 sweep).
Each issue needs its own keyword (`Closes #1, closes #2`).
Use the non-closing `Refs #<issue>` instead only for a partial change that must leave the issue open.
- For UI-touching PRs, the `Screenshots` section must embed at least one image (markdown `![alt](url)` or `<img>`) beneath the heading — the CI check looks for exactly that. `npm run screenshots:ui:publish -- --pr <number>` produces real smoke-harness screenshots (S3-hosted under `pr-screenshots/<number>/`) and embeds them automatically, but a drag-and-dropped GitHub attachment under the heading works too.
There is no `SCREENSHOTS_NEEDED:` bypass; if capture is genuinely impossible, a maintainer applies the `screenshots-exempt` label.
Do not commit PR-scoped screenshots under docs or other asset directories.
- Never commit directly to `main`.
- Use Conventional Commits.
- For `feat`, `fix`, and `perf`, use the format `<type>(#<issue>): <short description>`.
- Validate commit messages with `npx commitlint --from <merge-base> --to HEAD` before pushing **and after any history rewrite** — the `lint-commits` CI job lints every commit on the PR, not just the tip, so a stale subject deep in the branch fails it.
Recurring traps it enforces: the header type must be a single valid Conventional type (`test/refactor:` is invalid — `/` breaks parsing into `type-empty`/`subject-empty`; pick one type); the subject must **not** start capitalized (`subject-case` rejects sentence/start/pascal/upper-case — lead with a lowercase verb, e.g. `feat: add Map Region Links tab`, not `feat: Map Region Links tab`). `body-max-length` (>500 chars) is a warning only and does not fail the job.
To reword a non-tip commit non-interactively (interactive rebase is unavailable), use `git filter-branch --msg-filter` then `git push --force-with-lease`.
- Merge commits are linted too.
A `merge:` prefix fails `commitlint` (`merge` is not an allowed type); `commitlint`'s default ignore only skips the standard capitalized `Merge branch …` / `Merge pull request …` messages.
For a `--no-ff` integration merge, title it `chore: merge <x> into <y>` (or keep the default `Merge branch …` message). `git commit --amend -m "chore: …"` preserves both parents if a merge message needs fixing; re-run `npx commitlint --from=main --to=HEAD`, then `git push --force-with-lease`.
- Prefer one logical change per commit; align commit boundaries with reviewable user-facing changes.
Bundling is acceptable when changes overlap on the same files such that hunk-splitting would be fragile, but separate commits are the default.

## Agent Roles & Bindings

Each role is defined **once** in its shared `skills/<role>/SKILL.md` (the canonical persona).
Both provider agents are **thin bindings** that point at that skill — change behavior in the
skill, not in the bindings.
The default workflow above auto-spawns these roles based on change
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
| `foundry_integrator`            | `skills/foundry-integrator/SKILL.md`       | `.codex/agents/foundry-integrator.toml`      | `foundry-integrator`          |
| `fabricate_competitive_analyst` | `skills/fabricate-competitive-analyst/SKILL.md` | `.codex/agents/fabricate-competitive-analyst.toml` | `fabricate-competitive-analyst` |
| `fabricate_pr_explorer`         | — (no shared skill; read-only mapping)     | `.codex/agents/fabricate-pr-explorer.toml`   | `Explore` (built-in)          |

`fabricate_pr_explorer` is read-only codebase mapping; Claude uses its built-in `Explore` agent
for the same role rather than a dedicated binding.

### Shared skills with no persona binding

These are loaded on demand (by path) from the role skills that reference them — not auto-spawned
as agents:

- `skills/javascript-structural-design/SKILL.md`
- `skills/review-implementing/SKILL.md`

## What Agents Must Not Do

- Merge to `main` without reviewer approval.
- Post review verdicts or other workflow notes as GitHub issue or PR comments.
Plan-review, implementation-review, and docs-loop reviewers return their verdicts to the driver, which acts on them and summarizes outcomes to the user.
- Delete test files.
- Change `module.json` id or module name.
- Add npm dependencies without a plan entry that explains why they are needed.
- Patch dead UI / config / code branches as a workaround.
When a control has nothing useful to configure or a code path has no remaining purpose, propose wholesale removal first.
- Add static cloud credentials (e.g. AWS access keys) to CI.
Automation/agent workflows authenticate to cloud via OIDC role assumption (`aws-actions/configure-aws-credentials` + `id-token: write`) using a dedicated least-privilege role scoped to the task — never the release/production role. `pull_request_target` jobs must check out only the base ref and never execute PR-head code.
See the "Screenshot publishing infrastructure" section in `CONTRIBUTING.md` for the screenshot-publishing role/policy example.
