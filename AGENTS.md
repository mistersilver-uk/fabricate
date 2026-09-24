# Fabricate Agent Guidelines

## Project

System-agnostic FoundryVTT crafting module supporting Foundry VTT V13 as a minimum and verified on V14 (see `module.json`); the smoke harness and the View Lab both run V14.365.
Primary stack: JavaScript ES modules, Svelte 5, Vite, `node:test`, happy-dom, Playwright, and Jekyll docs.

## Planning & Workflow

- Use the orchestrator flow first for any non-trivial task.
- Use OpenSpec as the planning system of record for non-trivial work.
- Capture the change delta in the work's GitHub issue (a managed `openspec-delta` block — proposal, design, tasks, spec deltas, roster, acceptance) before implementation starts; do not version planning files under `openspec/changes/` (that directory is gone).
See `openspec/README.md` for the block format and rules.
- Treat `openspec/specs/*/spec.md` as the canonical specification source of truth.
- The remaining planning rules and the OpenSpec workflow are in [Planning & Workflow](.agents/skills/fabricate-orchestrator/references/agentic-workflow.md#planning--workflow).

## Default Agentic Workflow

Non-trivial work runs as a `plan → plan-review → implement → review → docs` state machine, with iteration until each gate accepts.
Stages auto-spawn role-specific subagents based on the change signals below — agents do not need to be requested by name.
Subagents not matched by the routing table only run when explicitly requested.
An untiered family resolves directly to a registered agent in **both** providers — `.codex/agents/*.toml` for Codex and `.claude/agents/*.md` for Claude (spawned via the Agent tool using the `subagent_type` in [Agent Roles & Bindings](#agent-roles--bindings)).
A model-tiered family resolves through per-spawn model-tier selection (see [Model tier routing](#model-tier-routing)) to exactly one model-tiered binding in each active provider, found through the `Family` table in [Agent Roles & Bindings](#agent-roles--bindings).

**Workflow driver.** The top-level loop — Codex's depth-0 prompt agent or Claude's main loop — is the *workflow driver*.
It enacts the orchestrator role: it owns routing and the iteration loops and performs **all** agent spawning.
The spawnable `fabricate_orchestrator` agent is a planning helper the driver may delegate to for resolving the roster and drafting the OpenSpec delta in the issue; it returns its plan to the driver.
Spawned role agents execute their scoped role and do not nest — no role agent spawns another.

Three loops run until acceptance, each capped at 3 revisions before escalating to the user.
**Each loop runs ONE full round by default.**
The verdict vocabulary is `APPROVED / NEEDS_CHANGES / BLOCKED` (and `DOCS APPROVED / DOCS NEEDS_CHANGES` in the docs loop).
The driver's procedure — proportionality, isolated worktrees, worked routing examples, the three loops, the final handoff, stop conditions and confirming work — is in [Default Agentic Workflow](.agents/skills/fabricate-orchestrator/references/agentic-workflow.md#default-agentic-workflow).

### Auto-spawn routing

Resolve the roster with this procedure — it is mechanical, not a judgment call:

1. Compute the changed-path set: the delta's affected-files list during planning, or `git diff --name-only origin/main...HEAD` during review.
2. Match every path against every row's signal below; a path-signal row matches when any changed path matches any of its globs, and a content-signal row (Foundry identifiers, competitor questions, PR investigation) matches on the diff content or request text instead.
3. Take the union of every matching row's agents — multi-select, never single-pick; the "any non-trivial task" row always applies.
4. Record the union in the issue delta's `### Resolved Roster` section, split by stage (plan-review, post-implementation review, docs loop).
5. **Prune a path-signal role whose row fired on prose alone** at the post-implementation review and docs-loop stages: take the row-intersected `git diff`, and when every hunk in it changes only comments, JSDoc or docblocks, Markdown prose, a `file:line` cite or a count — no executable line, no selector, no assertion, no requirement sentence — and the intersected diff is at or below the post-implementation `SMALL_MAX`, the row does not spawn; `fabricate_reviewer`'s reconciliation already reads those hunks.
The driver records the pruned role and the hunks it measured in the handoff.
The always row, the paired docs-loop row (`fabricate_docs_writer` + `fabricate_domain_expert`), every plan-review spawn, and any hunk that adds or changes a requirement sentence under `openspec/specs/**` are never pruned.

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

### Model tier routing

Six families — `fabricate_implementer`, `fabricate_reviewer`, `fabricate_domain_expert`, `fabricate_ux_designer`, `fabricate_quality_engineer`, and `foundry_integrator` — are bound at three **model tiers** ordered by capability, `small` < `medium` < `large`, so the driver routes each spawn to the cheapest model that can hold its scope.
The model pins, the keyed inputs, row intersection, the `HIGH_RISK_PATHS` list, the floors, the confirmation-round override and `ESCALATE_TIER` are in [Model tier routing](.agents/skills/fabricate-orchestrator/references/agentic-workflow.md#model-tier-routing).

**Base model tier — first match wins.**

| # | Condition                                                                              | Model tier |
|---|----------------------------------------------------------------------------------------|------------|
| 1 | Any path in the keyed path set matches `HIGH_RISK_PATHS`                                 | `large`    |
| 2 | The lane's rule 2 source is anything other than `none`                                   | `large`    |
| 3 | The keyed path set holds 3 or more paths                                                 | `large`    |
| 4 | The size metric exceeds `MEDIUM_MAX`                                                     | `large`    |
| 5 | The keyed path set holds exactly 1 path and the size metric is at or below `SMALL_MAX`   | `small`    |
| 6 | Otherwise, including whenever any input above is unavailable                             | `medium`   |

| Stage                     | `SMALL_MAX`              | `MEDIUM_MAX`              |
|---------------------------|--------------------------|---------------------------|
| plan-review               | 3 delta tasks            | 8 delta tasks             |
| implementation            | 1 owned delta task       | 4 owned delta tasks       |
| post-implementation, docs | 50 added + deleted lines | 400 added + deleted lines |

## Build & Test

- `npm test` — required validation gate for implementation changes.
The unit-test bar is `# cancelled 0` as well as `# fail 0`: a parallel run under machine load (a concurrent `npm ci` in another worktree, for instance) produces cancellations that read like failures, so on any cancellation re-run with `--test-concurrency=1` and account for the delta before diagnosing a real break.
- `npm run build` — required build gate for implementation changes.
- `npm run lint` + `npm run lint:svelte` + `npm run lint:svelte:warnings` + `npm run lint:css` + `npm run format:check` + `npm run lint:md` — required ESLint + Svelte ESLint + Svelte compiler-warning sweep + Stylelint + Prettier + markdownlint gate (the `lint` CI job).
- `npm run lint:md` (markdownlint, config in `.markdownlint-cli2.jsonc`) gates every authored Markdown file and enforces **one sentence per line** — run it before finalising any change that touches Markdown.
Run `npm run lint:md:fix` to auto-split prose, re-running until the count stops dropping (a long paragraph splits one boundary per pass), and wrap a multi-sentence table cell's table in a `<!-- markdownlint-disable markdownlint-sentences-per-line -->` / `<!-- markdownlint-enable markdownlint-sentences-per-line -->` region, since a cell cannot break across lines.
- UI-changing PRs (files under `src/ui/`, `styles/`, or any `*.svelte`/`*.css`) must include screenshot evidence for the relevant changed views before opening or updating the PR; a `lang/` change requires screenshots only when the same PR also changes one of those render files.
If capture is genuinely impossible, only a maintainer may apply the `screenshots-exempt` label (agents must never apply it).
- The prerequisites and the rest of each gate, with the release utilities, are in `CONTRIBUTING.md`: [Toolchain prerequisites](CONTRIBUTING.md#toolchain-prerequisites), [Linting & formatting](CONTRIBUTING.md#linting--formatting), [The View Lab](CONTRIBUTING.md#the-view-lab-foundry-free-window-captures), [Foundry integration (smoke) tests](CONTRIBUTING.md#foundry-integration-smoke-tests), [UI PR screenshot evidence](CONTRIBUTING.md#ui-pr-screenshot-evidence) and [Release Workflow](CONTRIBUTING.md#release-workflow).

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
- `src/ui/model/` holds the Foundry-free view models the UI owns — pure filtering, sorting, pagination, selection and validation logic with no Foundry global and no importer outside `src/ui/`.
- `src/ui/presenters/` holds the modules that render a chat card or build a read-side row model for a UI surface.
Unlike `src/ui/model/`, these may have importers outside `src/ui/` — the crafting, gathering and bulk-salvage engines, and `src/main.js`, which drives four of them behind the `game.fabricate` facade.
Several own a canonical disclosure rule (teaser redaction, blind-run secrecy, summary audience), so a change here can be a requirement change rather than a cosmetic one.
- Svelte UI components live in `src/ui/svelte/apps/` and `src/ui/svelte/components/`.
- Svelte stores live in `src/ui/svelte/stores/`.
- Domain and runtime logic lives under `src/models/`, `src/systems/`, `src/utils/`, `src/integrations/`, `src/config/`, and related `src/` modules.
- Tests live under `tests/`.
- Styles live in `styles/`, primarily `styles/fabricate.css`.
- `styles/fabricate.css` is loaded **globally** into the Foundry document (via `module.json`'s `styles` field; in dev also through the `src/main.js` import), so it shares the page with every other module and system sheet.
Every selector in this file MUST be namespaced under a `.fabricate*` root class (e.g. `.fabricate-app`, `.fabricate`, `.fabricate-manager`) — the only exception is `:root` for custom-property definitions.
A bare generic selector like `.badge` or `.btn-icon` will bleed into other sheets (it previously broke the D&D 5e Armor Class badge). `tests/styles-namespacing.test.js` enforces this under `npm test` and fails on any unscoped selector.
Note this is independent of the Svelte `<style>` blocks in `src/ui/svelte/`, which compile to hashed, component-scoped classes and do not bleed.
- No literal colours in product code. `tests/components/theme-colour-contract.test.js` (under `npm test`) forbids colour literals — `#hex`, `rgb()/rgba()`, `hsl()/hsla()`, bare `white`/`black` — anywhere under `src/ui/` or `styles/` outside the approved `:root`/theme blocks, **including JS fallback constants** (a `'#888888'` default in a `.js` util fails the gate).
Use a theme token (`var(--fab-…)`); when a util can't resolve a colour, return `''` and let CSS supply a themed default.
A region/document's *own* runtime colour is fine inline via `style=` (it isn't a source literal).
- **A UI control's constraint is never an invariant — the invariant belongs at the normalizer.**
A disabled or absent control only refuses to *enter* a forbidden state through one surface.
It cannot stop a record *becoming* forbidden by a removal path, and it is not on the path of the writers that have no UI at all — import (`CraftingSystemExporter.prepareForImport`), copy-mode, and migration.
Enforce the rule where every writer passes instead: `_normalizeSystem` / `_normalizeComponent` / `_normalizeSalvage` in `src/systems/CraftingSystemManager.js` are that single chokepoint.
Issue 676 is the worked example, and the claim "constraining the control makes the forbidden state unreachable by construction" was false in **both** directions: the sanctioned flow's exact reverse (enable at one result group, delete that group, save) persisted the forbidden state anyway, and then disabled the control that would have undone it.
Keep the control constraint as UX, and **test the requirement** (normalizer input → output), never the control's `disabled` attribute — a control-shaped test reads green through every gap the control cannot close.
- Localized strings belong in `lang/`; UI code should use the Foundry bridge/localization helpers instead of hard-coded copy.
- Manager confirmation prompts (discard unsaved, destructive actions) MUST go through `services.confirmDialog` → `foundry.applications.api.DialogV2.confirm`.
Never use `globalThis.confirm()`, not even as a fallback.
See [Manager confirm-discard guard](.agents/docs/foundry-and-architecture.md#manager-confirm-discard-guard).
  - **Carve-out: high-frequency destructive ROW actions.** A per-row destructive action a GM performs repeatedly down a list (deleting one owned copy, erasing one learned recipe) uses the inline two-step arm — `src/ui/svelte/components/ArmedDangerButton.svelte` — instead of a modal: the first click arms the control, the second executes.
A modal per row is the wrong ergonomics at that frequency, and the arm still requires a deliberate second act.
`confirmDialog` is RETAINED for the heavyweight cases: deleting a stacked (`quantity > 1`) document, and a reset action.
The armed token MUST be keyed on the target document id, never a row index, because a projection can re-publish asynchronously between the two clicks.
This carve-out does NOT retrofit `VocabularyPanel`'s expanding below-row confirm strip, which is a different idiom by design — it carries a reference-count consequence sentence no two-word button label can hold.
  - **Carve-out: a bulk action that states its own impact.** A bulk destructive action ALSO uses the inline two-step arm, in place of `confirmDialog`, when the panel states the impact of the pending action — what it affects and how much — in view BEFORE the control is armed.
The stated impact is what a modal would otherwise exist to warn about, so the modal adds no safety once the panel already says it, and the arm still requires the same deliberate second act a row action does.
A bulk action that does NOT state its impact in-panel still goes through `confirmDialog`; this does not relax the rule for a bulk action that stays silent about its consequences until the modal names them.
The essence library's bulk delete (`EssenceBulkEditPanel.svelte`) is the worked example: it states how many essences, carrying components, and rewritten recipes are affected, then arms the same `ArmedDangerButton`, on an explicit maintainer decision (issue 1036).
The Component Studio's bulk delete (`ComponentBulkEditPanel.svelte`) is the second (issue 1129) and shows the carve-out generalizing rather than staying a one-off: it states how many components, rewritten recipes, and newly disabled recipes are affected, then arms.
Its impact is computed in the store and passed in as a prop rather than derived from the selected rows, because one of its numbers — how many recipes the delete leaves uncraftable — depends on the whole selection against real recipe bodies and cannot be answered per row.
- When a Svelte component is shared between task and event (or similar `kind`-driven) contexts, split shared i18n keys into kind-specific siblings (`…Task` / `…Event`) and select with a ternary on `kind`.
Reserve combined "tasks and events" / "task or event" wording for surfaces that genuinely mix kinds (overview hints, mixed validation issues, error messages).
- Generic "record" / "records" wording in user-facing strings under `FABRICATE.Admin.Manager.EnvironmentEditor.*` is a known anti-pattern; environments don't have catalysts, they have tasks, events, and required tools.
Use accurate domain terms when adding new strings.
- Test files under `tests/components/` pin code shapes with `inspectorSource.includes(...)` / `listSource.includes(...)` string assertions.
When renaming variables, refactoring markup, or removing i18n keys, grep these assertions and update them in lockstep — they fail at test time, not compile time.
- **Comments state contracts, not history.**
A comment survives only if it states an invariant, a non-obvious ordering or concurrency rule, a persisted-shape or public-API contract, or the test or spec line that pins one — in one to three lines.
- Rejected alternatives, review rounds, and what the code used to do live in the issue and the pull request.
A one-token `(issue 1234)` pointer back to that record is allowed; a paragraph retelling it is not.
The exception is a comment another rule in this file, a canonical spec, or a test cites by name: that comment is part of a contract, and it is edited with its citation or not at all.
- No ALL-CAPS emphasis, no Markdown headings inside a docblock, and no line-number code citations.
Name the symbol or the test instead; a line number is stale the moment the file is edited.
- A JSDoc tag earns its line by carrying a type a reader cannot infer, or a description that adds something the type and the name do not; a tag supplying neither is deleted.
Nothing in this repository consumes JSDoc — no `jsdoc`, no `typedoc`, no `checkJs`, no JSDoc ESLint plugin — so a tag that restates the signature costs its lines and returns nothing.
- Svelte component headers follow the template in [`.agents/component-header-template.md`](.agents/component-header-template.md).
- These rules apply to every line a change touches and to every new file in full.
A change does not rewrite comments in files it is not otherwise editing, unless condensing them is the change and its issue names it as such.

### Observed failure mode: bloat

This workflow produced each of these shapes repeatedly, and each already has a rule that answers it; naming them together is what stops review approving them one at a time.

- Comments that argue a case, retell history, or shout in ALL-CAPS, answered by the comment rules above and measured per directory by `tests/comment-share-ledger.txt`.
- Adding to the nearest large file or function instead of extracting a unit, answered by `tests/file-size-ledger.txt`.
- Pinning how code is written with a `Source.includes(` assertion, answered by `tests/source-pin-ledger.txt`.
- Redeclaring a shared helper locally, answered by `tests/scalar-helper-duplicates.test.js` and `tests/category-shim-bindings.test.js`.
- An issue delta, lane brief, or handover that runs to tens of kilobytes, answered by stating the decision rather than how it was reached.
- A file or component header longer than [`.agents/component-header-template.md`](.agents/component-header-template.md).

Each ledger is a ceiling rather than an exact count, so a unit that stays under its row costs no ledger edit at all; a ceiling is raised in a feature PR only with the reason stated in the PR, and lowered by this epic's sweeps with `TIGHTEN_<X>_LEDGER=1`.
A ceiling gate cannot tell that a condensation sweep finished, so a PR whose stated purpose is condensation, extraction or pin conversion runs that tighten mode for every ledger it moves and commits the result, and a reviewer treats a sweep PR that leaves those ledgers byte-identical as `NEEDS_CHANGES`.
`tests/source-pin-ledger.txt` and `tests/foundry-global-reads-ledger.txt` carry no headroom, because one more pin or bare read is never the same debt as the last one, so there the gate enforces that obligation itself: a row left above the unit it bounds fails as `SLACK` and is banked with the tighten mode in the same PR that earned it.

## FoundryVTT Notes and Architecture Pointers

Moved to [`.agents/docs/foundry-and-architecture.md`](.agents/docs/foundry-and-architecture.md) (issue #1661).
Read it before writing code that calls a Foundry API, hooks into its lifecycle, or touches the manager shell, the gathering data model or the design system.
It carries rules, not background: the imperatives moved with the evidence rather than being summarised here.

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
- How the steady-state rule sits on the one-time reflow is in [Markdown linting (markdownlint)](CONTRIBUTING.md#markdown-linting-markdownlint).

## Git Conventions

- All implementation, documentation, and workflow-file changes must happen on a non-`main` integration or lane branch.
- Branch verification, lane commits, review-feedback lanes and review snapshots are in [Git Conventions](.agents/skills/fabricate-orchestrator/references/agentic-workflow.md#git-conventions).
- Follow the final-delivery procedure in `.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md`; readiness changes do not create check evidence.
- PR titles must comply with Conventional Commits, using the same `<type>(#<issue>): <short description>` format for `feat`, `fix`, and `perf`.
- PR descriptions must use H2 sections in this order: `Description`, `Benefit(s)`, `Changes in this PR`, `Testing`, and `Screenshots (if applicable)`.
- PR descriptions must include a GitHub closing keyword for the issue the PR resolves: put `Closes #<issue>` (or `Fixes #<issue>` / `Resolves #<issue>`) on its own line in the `Description` section so merging the PR auto-closes the issue.
- Never commit directly to `main` or `release`.
- Never rebase or force-push a branch semantic-release has tagged (`release` or a hotfix line): the release automation stores release state in git tags and git notes, and a rewrite loses it.
- Never squash-merge a prerelease line into `release`: squashing collapses the Conventional Commit types the version computation reads and mis-computes the stable version.
- Never merge `release` or `main` into a hotfix line — a fix leaves a hotfix line by cherry-pick only.
- Carve-out: the release automation's `forward-port` merge from `release` into `main` is not agent work; agents do not perform or reproduce it.
- Use Conventional Commits.
- For `feat`, `fix`, and `perf`, use the format `<type>(#<issue>): <short description>`.
- Validate commit messages with `npx commitlint --from <merge-base> --to HEAD` before pushing **and after any history rewrite** — the `lint-commits` CI job lints every commit on the PR, not just the tip, so a stale subject deep in the branch fails it.
- The closing-keyword and screenshot-section detail, the commitlint traps, rewording, and merge-commit titles are in [Commit conventions](CONTRIBUTING.md#commit-conventions) and [UI PR screenshot evidence](CONTRIBUTING.md#ui-pr-screenshot-evidence).
- Prefer one logical change per commit; align commit boundaries with reviewable user-facing changes.
Bundling is acceptable when changes overlap on the same files such that hunk-splitting would be fragile, but separate commits are the default.

## Agent Roles & Bindings

Each role is defined **once** in its shared `.agents/skills/<role>/SKILL.md` (the canonical persona and Codex repository-discovery location).
Both provider agents are **thin bindings** that point at that skill — change behavior in the skill, not in the bindings.
The shared-skill rule, how the workflow spawns these roles, and how the driver picks one of a family's three bindings are in [Agent Roles & Bindings](.agents/skills/fabricate-orchestrator/references/agentic-workflow.md#agent-roles--bindings).
Each row below is one **binding**, so a model-tiered family occupies three rows that share one canonical skill and differ only by model pin.

| Routing token                     | Canonical skill (persona)                               | Codex binding                                          | Claude `subagent_type`           |
|-----------------------------------|---------------------------------------------------------|--------------------------------------------------------|----------------------------------|
| `fabricate_orchestrator`          | `.agents/skills/fabricate-orchestrator/SKILL.md`        | `.codex/agents/fabricate-orchestrator.toml`            | `fabricate-orchestrator`         |
| `fabricate_implementer_small`     | `.agents/skills/fabricate-implementer/SKILL.md`         | `.codex/agents/fabricate-implementer-small.toml`       | `fabricate-implementer-small`    |
| `fabricate_implementer_medium`    | `.agents/skills/fabricate-implementer/SKILL.md`         | `.codex/agents/fabricate-implementer-medium.toml`      | `fabricate-implementer-medium`   |
| `fabricate_implementer_large`     | `.agents/skills/fabricate-implementer/SKILL.md`         | `.codex/agents/fabricate-implementer-large.toml`       | `fabricate-implementer-large`    |
| `fabricate_reviewer_small`        | `.agents/skills/fabricate-reviewer/SKILL.md`            | `.codex/agents/fabricate-reviewer-small.toml`          | `fabricate-reviewer-small`       |
| `fabricate_reviewer_medium`       | `.agents/skills/fabricate-reviewer/SKILL.md`            | `.codex/agents/fabricate-reviewer-medium.toml`         | `fabricate-reviewer-medium`      |
| `fabricate_reviewer_large`        | `.agents/skills/fabricate-reviewer/SKILL.md`            | `.codex/agents/fabricate-reviewer-large.toml`          | `fabricate-reviewer-large`       |
| `fabricate_domain_expert_small`   | `.agents/skills/fabricate-domain-expert/SKILL.md`       | `.codex/agents/fabricate-domain-expert-small.toml`     | `fabricate-domain-expert-small`  |
| `fabricate_domain_expert_medium`  | `.agents/skills/fabricate-domain-expert/SKILL.md`       | `.codex/agents/fabricate-domain-expert-medium.toml`    | `fabricate-domain-expert-medium` |
| `fabricate_domain_expert_large`   | `.agents/skills/fabricate-domain-expert/SKILL.md`       | `.codex/agents/fabricate-domain-expert-large.toml`     | `fabricate-domain-expert-large`  |
| `fabricate_docs_writer`           | `.agents/skills/fabricate-docs-writer/SKILL.md`         | `.codex/agents/fabricate-docs-writer.toml`             | `fabricate-docs-writer`          |
| `fabricate_ux_designer_small`     | `.agents/skills/fabricate-ux-designer/SKILL.md`         | `.codex/agents/fabricate-ux-designer-small.toml`       | `fabricate-ux-designer-small`    |
| `fabricate_ux_designer_medium`    | `.agents/skills/fabricate-ux-designer/SKILL.md`         | `.codex/agents/fabricate-ux-designer-medium.toml`      | `fabricate-ux-designer-medium`   |
| `fabricate_ux_designer_large`     | `.agents/skills/fabricate-ux-designer/SKILL.md`         | `.codex/agents/fabricate-ux-designer-large.toml`       | `fabricate-ux-designer-large`    |
| `fabricate_quality_engineer_small`  | `.agents/skills/fabricate-quality-engineer/SKILL.md`  | `.codex/agents/fabricate-quality-engineer-small.toml`  | `fabricate-quality-engineer-small`  |
| `fabricate_quality_engineer_medium` | `.agents/skills/fabricate-quality-engineer/SKILL.md`  | `.codex/agents/fabricate-quality-engineer-medium.toml` | `fabricate-quality-engineer-medium` |
| `fabricate_quality_engineer_large`  | `.agents/skills/fabricate-quality-engineer/SKILL.md`  | `.codex/agents/fabricate-quality-engineer-large.toml`  | `fabricate-quality-engineer-large`  |
| `foundry_integrator_small`        | `.agents/skills/foundry-integrator/SKILL.md`            | `.codex/agents/foundry-integrator-small.toml`          | `foundry-integrator-small`       |
| `foundry_integrator_medium`       | `.agents/skills/foundry-integrator/SKILL.md`            | `.codex/agents/foundry-integrator-medium.toml`         | `foundry-integrator-medium`      |
| `foundry_integrator_large`        | `.agents/skills/foundry-integrator/SKILL.md`            | `.codex/agents/foundry-integrator-large.toml`          | `foundry-integrator-large`       |
| `fabricate_competitive_analyst`   | `.agents/skills/fabricate-competitive-analyst/SKILL.md` | `.codex/agents/fabricate-competitive-analyst.toml`     | `fabricate-competitive-analyst`  |
| `fabricate_pr_explorer`           | — (no shared skill; read-only mapping)                  | `.codex/agents/fabricate-pr-explorer.toml`             | `Explore` (built-in)             |

### Family to model tiers

The auto-spawn routing table keeps **family** tokens, while every row of the bindings table above is a binding token, so this table is the join between them.

| Family                        | Model-tiered routing tokens                                                                                       |
|-------------------------------|-------------------------------------------------------------------------------------------------------------------|
| `fabricate_implementer`       | `fabricate_implementer_small`, `fabricate_implementer_medium`, `fabricate_implementer_large`                       |
| `fabricate_reviewer`          | `fabricate_reviewer_small`, `fabricate_reviewer_medium`, `fabricate_reviewer_large`                                |
| `fabricate_domain_expert`     | `fabricate_domain_expert_small`, `fabricate_domain_expert_medium`, `fabricate_domain_expert_large`                 |
| `fabricate_ux_designer`       | `fabricate_ux_designer_small`, `fabricate_ux_designer_medium`, `fabricate_ux_designer_large`                       |
| `fabricate_quality_engineer`  | `fabricate_quality_engineer_small`, `fabricate_quality_engineer_medium`, `fabricate_quality_engineer_large`        |
| `foundry_integrator`          | `foundry_integrator_small`, `foundry_integrator_medium`, `foundry_integrator_large`                                |

The four untiered roles — `fabricate_orchestrator`, `fabricate_docs_writer`, `fabricate_competitive_analyst`, and `fabricate_pr_explorer` — are absent from this table because their routing token is already their binding token.

### Shared skills with no persona binding

These are discoverable by Codex as repository skills and loaded on demand by roles that reference them; they are not auto-spawned as agents:

- `.agents/skills/javascript-structural-design/SKILL.md`
- `.agents/skills/review-implementing/SKILL.md`

## What Agents Must Not Do

- Merge to `main` without reviewer approval.
- Post review verdicts or other workflow notes as GitHub issue or PR comments.
Plan-review, implementation-review, and docs-loop reviewers return their verdicts to the driver, which acts on them and summarizes outcomes to the user.
- Delete test files.
- Change `module.json` id or module name.
- Add npm dependencies without a plan entry that explains why they are needed.
- Add a component under `src/ui/svelte/components/` without adding its specimen to `openspec/specs/design-system/library.html` and its row to `scripts/lib/designSystemPrimitives.json` in the same change.
`tests/design-system-coverage.test.js` enforces this: it fails when a file in that directory carries no manifest row, and when the library and the manifest describe different vocabularies.
Equally, do not hand-roll markup for a control the primitive set already owns, and do not introduce a second component that owns half a meaning an existing primitive owns — extend that primitive instead.
- Patch dead UI / config / code branches as a workaround.
When a control has nothing useful to configure or a code path has no remaining purpose, propose wholesale removal first.
- Add static cloud credentials (e.g. AWS access keys) to CI.
Automation/agent workflows authenticate to cloud via OIDC role assumption (`aws-actions/configure-aws-credentials` + `id-token: write`) using a dedicated least-privilege role scoped to the task — never the release/production role. `pull_request_target` jobs must check out only the base ref and never execute PR-head code.
See the "Screenshot publishing infrastructure" section in `CONTRIBUTING.md` for the screenshot-publishing role/policy example.
