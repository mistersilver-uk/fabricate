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

### Proportionality and momentum

The workflow driver uses the shortest workflow that satisfies mandatory repository gates and the actual risk, prioritizing the earliest honestly reviewable PR while preserving mandatory safety, review, and exact-head delivery gates.
One mechanically valid evidence run satisfies every gate it directly covers, so agents do not repeat equivalent checks or reviews ceremonially.
A reviewer repeats only when its owned concern materially changed or an unresolved finding remains; issue or PR metadata edits and patch-equivalent rebases do not invalidate approval.
The driver front-loads cheap checks for branch and base freshness, affected paths and roster, PR title and commitlint, existing CI state, and screenshot scope.
The driver timeboxes delegated lanes: after about 60 seconds without observable progress it requests status once, and after another about 60 seconds it interrupts and reassigns the work or continues locally within driver authority.

### Isolated worktree execution

Every spawned role works in its own Git worktree by default so independent workstreams do not share a mutable checkout.
The workflow driver owns the clean coordinator checkout and integration branch, GitHub and remote mutations, lane lifecycle, integration, authoritative gates, and guarded cleanup.
Mutable lanes use unique `agent/<issue>-<stage>-<role>-r<revision>` branches and exclusive path ownership; read-only lanes use fresh detached worktrees pinned to the exact commit under review.
Spawned agents verify their assigned path, branch or detached SHA, base, and clean state before acting, then return local commits, base-relative diffs, or verdicts without pushing or mutating issue or PR state.
Parallel mutable lanes require disjoint owned paths and no dependency on unintegrated output.
The driver serializes dependency installation and complete test, build, lint, Foundry/Docker, and screenshot gates from the fully integrated coordinator branch.
Follow the canonical mechanics in `.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md` for assignment briefs, review artifacts, integration mapping, feedback revisions, conflicts, and cleanup.

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

### Final maintainer handoff

Before asking the maintainer to review a PR, the workflow driver completes a final delivery loop from the coordinator checkout.
Draft-head checks are preflight evidence only because some CI workflows may run only on the `ready_for_review` event.

1. Finalize the PR title, body, issue linkage, screenshots, and other metadata before the final run.
2. Fetch `origin/main`, capture the expected remote PR-head SHA, and require a clean coordinator checkout with no active mutable lane.
3. Rebase the integration branch onto current `origin/main`, then rerun every required authoritative local gate and `npx commitlint --from origin/main --to HEAD`.
4. Determine mechanically whether the rebase materially changed the implementation reviewer's owned concern or left an unresolved finding.
Reuse the valid approval for a patch-equivalent rebase; when repeat review is required, create a fresh detached implementation-review lane pinned to the exact rebased commit and supply an immutable diff artifact.
Repeat domain and documentation reconciliation when conflict resolution or a later fix changes workflow, canonical spec, or documentation content.
5. Update the remote branch only with `git push --force-with-lease=<branch>:<expected-sha>`.
A rejected lease stops the loop for investigation; never retry with `--force` or an unqualified force push.
6. Mark the PR ready for review, then wait for every required GitHub Actions and external check triggered for that exact head.
Both SonarCloud checks, Automatic Analysis and Quality Gate, must be successful.
Pending, skipped when required, cancelled, stale-head, or failing checks are not green.
7. On any failure, return the PR to draft before gathering evidence and routing fixes through the normal isolated implementation and review loops.
After fixes, repeat the rebase, validation, lease push, ready transition, and exact-head checks, repeating review only for a materially changed owned concern or unresolved finding.
8. After the final check rollup succeeds, fetch `origin/main` again and mechanically verify that it remains an ancestor of the unchanged remote PR head and that the PR remains ready.
If main advanced, the head changed, or the PR returned to draft, repeat the mandatory delivery steps and apply step 4's material-change review rule.

Only hand the PR to the maintainer after all final-delivery conditions are true on the same commit.

### Stop conditions

- Any reviewer returning `BLOCKED` halts the loop and surfaces to the user.
- Hitting the 3-revision cap on any loop halts and surfaces to the user with the outstanding findings.
- User intervention takes precedence; treat user guidance as the new entry condition for the next iteration.

### Confirming work and resolving findings

A subagent's report is a claim, not evidence — and a confident-but-wrong claim believed at face value ("gates green", "no findings", "N divergences") is the most expensive failure in the loop, because cheap-to-make claims cascade once trusted.
Convert claims into evidence before acting on them:

- Confirm gate results mechanically.
The driver checks CI status (or re-runs the gate) and re-derives the facts a decision rests on — touched paths from `git diff`, test counts, the roster — rather than merging on a subagent's self-reported "tests pass".
A subagent can mis-observe or overstate.
- Resolve a disputed, surprising, or expensive finding by INVESTIGATION, not introspection.
Gather the fact mechanically — read the real source, import and differential-test the real artifact, run the check — never by re-asking an agent "are you sure" (self-evaluation returns yes) and never by averaging votes.
A credible dissent about a real defect gates until disproven by evidence; a finding that turns out to rest on a hand-reconstructed model of the code is dismissed only after reading the real code.
- Match verification effort to the cost of being wrong.
Before an irreversible or outward-facing step — publishing an artefact, deleting or overwriting, force-pushing, any one-way door — spend disproportionate verification: rehearse against a scratch target, add a dissenting check, or gate.
Being wrong there costs far more than checking.

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
The unit-test bar is `# cancelled 0` as well as `# fail 0`: a parallel run under machine load (a concurrent `npm ci` in another worktree, for instance) produces cancellations that read like failures, so on any cancellation re-run with `--test-concurrency=1` and account for the delta before diagnosing a real break.
- **SonarCloud quality gate** — a separate CI job evaluated on the PR's *new code*, distinct from `npm run lint`.
It fails on `new_duplicated_lines_density > 3%`, and SonarCloud Automatic Analysis **does not honor `sonar.cpd.exclusions`** from `sonar-project.properties`: duplication in `tests/**` and `scripts/**` fixtures counts against the gate exactly like `src/`.
Keep new test/fixture/script code DRY (shared helpers like `createMountedComponentHarness`, hoisted constants); the only durable way to exempt a path is the maintainer-set **Duplication Exclusion** in the SonarCloud project UI.
The gate also fails on new bugs/code-smells that ESLint does not flag (e.g. `Array#sort()` without a comparator, a nested ternary), so a PR can be lint-green yet Sonar-red — read the gate's findings, don't assume `npm run lint` covers it.
- The gate also fails on `new_security_rating` — a single new-code finding above rating A fails the PR.
The ones that bite in practice: `Math.random()` for an id or token (`S2245`, a MEDIUM vulnerability — use `crypto.randomUUID()` / `crypto.getRandomValues()` / `foundry.utils.randomID()`), and spawning a bare command name resolved through `PATH` such as `spawnSync('git', …)` (`S4036` — read the data from stdin, or pass a fixed executable path, rather than searching `PATH`).
For GitHub Actions workflows the gate adds its own rules: no `${{ inputs.* }}` / `${{ github.* }}` interpolated into a `run:` block (`S7630` — pass them through `env:` and reference `$VAR`); declare `permissions:` at the **job** level on any new job (`S8264`); and SHA-pin third-party actions such as `aws-actions/*` (`S7637`; `actions/*` are allowlisted).
A **composite action** (`.github/actions/release-setup/action.yml`) has **no `secrets`/`vars` context** — only `inputs`/`env`/`github`/`runner`/`steps`/`job` — so a `${{ vars.* }}` / `${{ secrets.* }}` moved into one resolves to an empty string silently; declare those as `inputs` the caller passes explicitly.
- Reading a smoke result: `test-results/summary.json` reports `passed: false` if any phase step fails OR if an un-waived `consoleErrors[]` entry remains, and also carries the split counts `stepFailures` and `consoleErrorCount` plus the flags `degraded` and `rendererCrashed` (all written in the harness's `finally` block, so an early phase abort still populates them, never `undefined`).
Benign browser `404 (Not Found)` asset misses in the fixture world populate `consoleErrors` and flip `passed` to false even when every `steps[]` entry passed.
A known-benign console or `pageerror` line can be admitted per run via `--allowed-console-error-patterns` (appended to the in-source defaults like `/reading 'OBJECTS'/`, never replacing them; waived lines are echoed to the step summary), but a failing `steps[]` entry is NEVER waivable and still throws first.
`degraded: true` marks a run that tolerated a transient renderer/page teardown (a `screenshot-manager`/`player-journal` step recorded `skipped: true`) — the run stays exit 0 but is a flake, not a clean pass; `rendererCrashed: true` marks a Playwright page `crash` (canonically an OOM).
A JS product bug surfaces via `consoleErrorCount` (the independent console-error gate), NOT the teardown-tolerance path — a tolerated teardown coincident with any non-waived console error still fails on the console gate; the tolerance can only mask a renderer PROCESS crash (OOM/target-destroyed) and only post-captures.
A `rendererCrashed: true` exit-0 run warrants a confirming re-run, and a PERSISTENT `rendererCrashed` pattern is actionable (a systematic tail OOM), not cosmetic.
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
The evidence must DEMONSTRATE the change, not merely clear the gate: at least one published frame must show the changed state itself, and when that state is not reachable by the existing capture walk in `scripts/foundry-test-run.mjs`, the branch adds a capture state that reaches it rather than publishing an unrelated frame.
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
- `node scripts/release-s3.js --channel <name>` publishes a built `dist/` to one channel's S3 targets: `beta` (closed testers, the default), `early-access` (patrons), `public` (everyone + the Foundry registry), or a hotfix line's own channel.
`--channel early-access` and `--channel public` are the private-patron and public targets; each private channel derives its tester URLs from its own path secret, and a channel that declares tester groups with no secret set refuses to publish.
Pair with `--dry-run` to print every planned key and URL without writing, and `--check-heads` to read each target's head and the monotonic-head guard verdict without publishing (note `--check-heads` is head-ordering only — it stages no build, so it does NOT evaluate the same-version resume/provenance decision, which needs a real publish).
The three-channel model these serve is specified in `openspec/specs/release-and-distribution/spec.md`.
- `release-s3.js` publishes through a **provenance guard**, not a byte check (the built zip is not byte-reproducible across builds).
Every versioned zip carries `(fabricate-version, fabricate-source-sha, fabricate-build-profile)` metadata — pass `--source-sha` explicitly, since `GITHUB_SHA` is stale after a `git checkout <tag>`; manifest writes are conditional (`IfMatch`) and every write is read back.
A publish that died between targets **resumes** from the same commit with no flag (matching provenance skips the already-written zip); `--overwrite` is only for an artefact no cohort has installed yet and must never be the routine fix for a failed publish of an already-distributed version; `--allow-downgrade` is only for an intentional backward move.
`--backfill-provenance` (and the `backfill-provenance.yml` workflow dispatch, `dry_run` first) stamps provenance onto pre-existing zips so the guard does not fail closed on legacy artefacts; it derives each zip's sha from its `v<version>` tag and stamps `unknown` (treated as absent) where none maps.
The immutability, completeness, and one-build-per-publish contracts are specified in `openspec/specs/release-and-distribution/spec.md`.

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
- **A UI control's constraint is never an invariant — the invariant belongs at the normalizer.**
A disabled or absent control only refuses to *enter* a forbidden state through one surface.
It cannot stop a record *becoming* forbidden by a removal path, and it is not on the path of the writers that have no UI at all — import (`CraftingSystemExporter.prepareForImport`), copy-mode, and migration.
Enforce the rule where every writer passes instead: `_normalizeSystem` / `_normalizeComponent` / `_normalizeSalvage` in `src/systems/CraftingSystemManager.js` are that single chokepoint.
Issue 676 is the worked example, and the claim "constraining the control makes the forbidden state unreachable by construction" was false in **both** directions: the sanctioned flow's exact reverse (enable at one result group, delete that group, save) persisted the forbidden state anyway, and then disabled the control that would have undone it.
Keep the control constraint as UX, and **test the requirement** (normalizer input → output), never the control's `disabled` attribute — a control-shaped test reads green through every gap the control cannot close.
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
The gate applies to actor `setFlag` / `_persist` broadcast document writes too, not only `craft()` / award side effects — `SalvageRunManager.processWorldTime` and `CraftingRunManager.processWorldTime` resume matured timed runs and persist a broadcast `setFlag`, so both carry the `isPrimaryGM` seam wired in `main.js` (issue 656).
Use `activeGM` (`game.users.activeGM?.id === game.user?.id`), NOT `game.user.isGM`: `User#isGM` is true for assistant GMs too (who hold `SETTINGS_MODIFY`), so an `isGM` gate lets the full GM AND every assistant race the write — `activeGM` fires on exactly one client (this is also why `_runMigrations` gates on `activeGM`, issue 657).
- Directory entry context menus are extended through the `get<Directory>ContextOptions` hook family (`getCompendiumContextOptions`, introduced 13.344; confirmed against V14.361 source) — an **array-mutation** hook: `(app, contextOptions) => contextOptions.push(entry)`, mutate in place and return nothing.
Two traps.
(1) **Register early** (module top-level, or `init`/`setup` — NOT the `ready` body): the menu is built exactly once in the directory's `_onFirstRender`, which runs during the pre-`ready` sidebar force-render, so a `ready`-body listener can miss the one-time build (unlike `renderItemDirectory` header-button wiring, which legitimately re-runs on every render).
(2) Use the **modern `ContextMenuEntry` shape** `{ label, icon, visible, onClick }`, NOT the deprecated `{ name, condition, callback }` (compat-warns per menu open, removed in v15): `visible(target)` returns a boolean, and `onClick(event, target)` takes the target **second** (the old `callback` passed `(target, event)` reversed).
The entry element is a raw `HTMLElement`; read the pack id from `target.dataset.pack`.
See `buildCompendiumImportContextOption` (`src/ui/compendiumDirectoryContext.js`) and its `main.js` wiring.
- **V13 progress notifications** are `ui.notifications.info(msg, { progress: true, console: false })`, which returns a handle whose `handle.update({ pct, message })` advances the bar (`pct` on `[0, 1]`); this superseded `SceneNavigation.displayProgressBar` (a deprecated 13→15 shim the native scene loader no longer uses).
Pass `console: false` for scene-loader parity, or every tick also writes a `console.info` line.
This whole `{ progress: true }` + handle API is **identical across V13 and V14** (introduced in the V13 notifications refactor, confirmed against V14.361 source), so no version branch or `module.json` compatibility change is needed.
A progress toast is **lifetime-exempt** — it ignores the normal 5 s dismissal and only self-dismisses when it reaches `pct: 1`, so a run that ends below `1` must tear its own bar down or it lingers until reload.
The default reporter therefore owns an idempotent terminal `dismiss()` seam, and `importFromPackData` guarantees a terminal state on **every** exit path — success, an already-installed skip, AND a throw before the `pct:1` completion tick (its catch calls `dismiss()` to remove the still-open toast, then re-throws the original error unchanged) — so a failed import no longer leaves a frozen bar on screen.
Tear the bar down with the handle's own `handle.remove()` (immediate and queue-safe): NOT `ui.notifications.remove(handle)`, whose class method throws on an undefined/stub handle, and NOT `update({ pct: 1 })`, which flashes the bar to a misleading SUCCESS state.
Two guards are mandatory: `.update()` can **throw before the toast renders** when it is queued behind the visible-toast cap, and a test stub for `info` returns `undefined` (no `.update`) — so wrap the update in try/catch and no-op on a falsy handle (the same falsy-handle / missing-method / teardown-throw guards wrap `handle.remove()`).
A stateful default reporter (opens one toast, then drives it) must be built **per run**, not once per long-lived importer, or a second run updates the first run's already-dismissed toast.
See `createDefaultProgressReporter` (`src/systems/CompendiumImporter.js`).
- **`CompendiumCollection#getIndex` already self-caches per pack**: a call whose `fields` are a subset of the pack's already-`#indexedFields` short-circuits to the cached index, and `clear()` does not reset it.
So wrapping `getIndex` in a memo saves nothing — the residual cost of a per-item miss scan is the linear walk of the index, and the fix is a per-run `Map<nameLower, entry[]>` name→entry lookup, not memoizing the build.
- Foundry `DiceTerm#total` is the post-modifier, active-only sum; `DiceTerm#number`/`#faces` may be undefined until evaluated — read `results[].result` for raw per-die logic.
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
- **The player-path ownership gate lives in the `main.js` FACADE, not in `CraftingEngine`.** `CraftingEngine.craft` / `salvage` contain **no ownership check at all** — they resolve the actor uuid they are handed and mutate that actor's Items directly.
`_resolveCraftingActor` / `_resolveCraftingSources` (`src/main.js`) are the whole gate, which is exactly why every player-facing facade (`craftRecipe`, `salvageComponent`, `listInventoryForActor`, the alchemy pair) takes an **`actorId`** and resolves it, and **never accepts an actor uuid**.
A uuid-taking facade is a privilege hole, not a style choice: the uuid flows straight to `fromUuid` past the only gate that exists, and a stale, foreign, or console-supplied one reaches the server and surfaces as a **thrown exception**, not the `{ success: false, message }` every store is written to expect — so the failure is both a permission bypass and an unhandled shape.
Keep new player entry points on `actorId`, and treat "the engine will check it" as false.
Engine methods are the GM/API surface and are owner-scoped by their caller.
- A Foundry `game.settings.register` **`scope: 'client'`** setting persists in that browser/device's `localStorage`, so it is **per device, not per user account** — the same user opening the world on a second machine sees the client default, and it never follows the account.
`scope: 'user'` is the cross-device per-user scope **within one world** (NOT a per-account-globally scope — see the next bullet), and `scope: 'world'` is shared for the world.
Fabricate uses `scope: 'client'` for view preferences (`MANAGER_RAIL_COLLAPSED`, `GATHERING_HIDE_UNAVAILABLE`, the gathering view prefs in `src/config/settings.js`), so spec/docs copy for those must say "per client/device", not "per user".
A preference that must follow the user across devices needs `scope: 'user'` — but say "per user, per world", never "follows the account".
- **`scope: 'user'` is a replicated async DOCUMENT write, not localStorage** (`PROGRESSIVE_RESULT_ORDER` is the only one Fabricate registers; issue 651 flipped it from `client`).
`ClientSettings#set` forks on scope: `client` is a synchronous `storage.setItem`, `user` is an `await`ed document create/update that **can reject** and **throws before `game.ready`**.
So the fire-and-forget `setSetting(...)` idiom used for client-scoped settings (e.g. `toggleFavouriteRecipe`) is **unsafe** on a user-scoped one — `await` it and define the failure path, or the UI reports a write that never happened.
Every write broadcasts `createSetting`/`updateSetting` to every client (the FIRST write is `createSetting`, not `updateSetting`), so a per-gesture write must be debounced.
It is per-user **within a world**, not per-account globally — the same player in a second world gets the default.
Despite being async and replicated, the write is **locally coherent**: the awaited create/update populates the same local collection `ClientSettings#get` reads, so a `get` issued after the `await` returns the new value without waiting on any broadcast.
That is what makes **flush-before-read an honest ordering guarantee** rather than a hopeful one — `await` the pending write, then start the operation that captures it (issue 675's salvage panel flushes its debounced order write before `salvage()` captures it onto the run record).
It also means the failure mode to design for is **rejection, not staleness**.
- **The player salvage order key is derived INDEPENDENTLY at two sites, and they must produce the identical string or the captured order silently reads empty.** The inventory store WRITES the order under `progressiveOrderKey({ scope: 'salvage', id })` (via `salvageOrderId` in `inventoryStore.svelte.js`), and `CraftingEngine.salvage` READS it back through the injected `getPlayerResultOrder` (wired to `_readPlayerResultOrder` in `src/main.js`) at capture time — two separate derivations of the same key.
Issue 766 made the id composite (`salvage:<systemId>:<componentId>`, because component ids are NOT globally unique across systems), so any change to one derivation that misses the other yields a live key naming nothing: `applyPlayerResultOrder` finds no stored order and falls back to the authored one, with nothing thrown and every unit test that stubs only one side still green.
Assert the write key equals the capture key in a store↔engine test (the #766 follow-up closed exactly this gap), never just that each side "uses `systemId`".
- **Setting scope changes ORPHAN data; they never migrate it.** Foundry has no scope-migration facility (`ClientSettings#get` dispatches on scope at read time), so a pre-existing `localStorage` value is simply never read again — never deleted, never an error.
When claiming "there is no data to migrate", prove it by showing **no writer has ever existed**, not that nothing reads it: "nothing reads it" does not imply absence.
- **`BaseSetting.canUserCreate` is a UI helper, NOT authorization** — it requires `SETTINGS_MODIFY` (default ASSISTANT), which players lack, and reads like a blocker for user-scoped player writes.
Real authz is `#canModify`, which passes any user writing their **own** user-scoped setting. `config: false` is orthogonal: only WORLD scope is GM-gated in the settings UI.
- **A synced `updateWorldTime` handler runs on EVERY client**, so any per-user state read inside one reads the **executing** user, not the owner — and with no primary-GM gate or ownership filter, whichever client wins the race executes.
Capture owner-scoped state onto the record at start instead of reading it at resume; that makes the invariant structural rather than documented.
Issue 651's salvage `resultOrder` is the worked example (`SalvageRunManager.createRun` already stamps `userId`, so the capture is auditable).
`SalvageRunManager.processWorldTime` and `CraftingRunManager.processWorldTime` were the unguarded case (#656, fixed): both now take an injected `isPrimaryGM` collaborator, defaulting fail-open to `() => true` so unit fixtures still resume, with the real `activeGM` check wired at construction in `src/main.js`.
Contrast `GatheringEngine`, which gates timed completions on `isPrimaryGM()` explicitly.
- **The migration GM gate lives in the CALLER, not `MigrationRunner`** (#657, fixed).
`MigrationRunner` contains zero `isGM`/`game.user` references, so grepping the runner alone reads as an unguarded world-scoped write path — the wrong conclusion.
The gate is `_runMigrations` in `src/main.js`, which early-returns unless `game.users?.activeGM?.id === game.user?.id`, so exactly one client runs the pass and no player or assistant races the setting writes.
Use `activeGM`, not `isGM`: `User#isGM` is true for assistant GMs too, so an `isGM` gate would let the full GM and every assistant transform-and-write concurrently (last-writer-wins).
When planning a new migration, confirm the gate at the call site rather than inferring its absence from the runner — this note previously asserted that absence and was wrong for every migration added after the fix.
- **The adminStore view-state projections are a FAMILY of hand-built allowlists** — the `selectedSystem` projection and the recipe-list projection (both in `src/ui/svelte/stores/adminStore.js`), plus `salvageComponentOptions` in `CraftingSystemManagerRoot.svelte` — and a new field is invisible to the UI unless added to each one it must reach.
For a **default-true** field the failure is worse than absent, it is **inverted**: the editor seeds from `undefined`, reads its default-true, renders ON for an entity the GM authored OFF, and saves that wrong value back.
Pin such a projection with a `false` fixture — a `true` fixture round-trips green through a dropped field.
- **The mounted/store test harnesses have TWO separate module-copy mechanisms**, and adding one import to a module already in the graph can break either: `CRAFTING_APP_RAW_MODULES`/`compiledModules` in `tests/helpers/svelte-component-harness.js` (mounted components) and `compiler.copyPlain(...)` in `tests/helpers/compile-svelte-module.js` (runes `.svelte.js` store suites).
A missing entry HANGS the suite (`# cancelled N`), never fails it — one import added to `CraftingListingBuilder` cancelled 36 tests across 8 files.
**Membership is an explicit allowlist, so READ it — never infer it from a module's kind or its name.** That incident does **not** generalize to "builders are in the harness graph": its sibling `InventoryListingBuilder` is copied by **no** harness (its only importer is `src/main.js`), so the hazard does not apply to it at all — issue 675's delta inherited the opposite belief from this note and planned around a constraint that did not bind.
Grep the allowlists for the module before reasoning about whether an import is safe to add.
The mirror trap is **over-filling**: a speculative entry for a module the graph never reaches is silently **inert** and passes green, so an allowlist accretes cargo-cult entries that read as load-bearing and no gate distinguishes from real ones — confirm a new entry is needed (drop it; the suite should hang) rather than adding it defensively.
What matters is the **transitive import graph, not the rendered tree**: the harness imports the compiled `.svelte.js`, whose **static** imports resolve at module time, so an `{#if}` branch that never renders a child does not keep it out of the graph.
- Foundry custom module/system sockets carry a **server-attested sender user id** as the **2nd callback argument** (`game.socket.on('module.fabricate', (payload, senderId) => …)`).
The server sets it from the authenticated session in `dist/server/sockets.mjs handleCustomSocket` (`this.user.id`), so it is non-forgeable; a payload `userId` field is client-supplied and spoofable.
Authenticate socket senders via the 2nd arg (e.g. gate privileged edges on `game.users.get(senderId)?.isGM`), never via the payload — `socketlib` merely wraps this same mechanism and adds no stronger guarantee (so it is not needed for sender auth).
The interactable socket layer does this: `handleInteractableSocketMessage` (`src/canvas/interactableSocketBridge.js`) takes `{ senderId, isSenderGM }` from `main.js` and gates the visual write/delete edges (GM-only), the behaviour-update edge (non-GM restricted to `system.node`), and activation (requester must be the sender) — see issue 593.
- **Foundry's `Localization#localize()` is a dotted-path WALK (`foundry.utils.getProperty`) over the nested `lang/` tree — not a flat-key lookup — and returns the key VERBATIM on any non-string result.** `lang/en.json` is a nested object, so every key segment is a real node.
The consequence: **a string occupying a namespace slot silently shadows every key beneath it.** If `FABRICATE.Component.Salvage` is authored as a string and something also reads `FABRICATE.Component.Salvage.Enabled`, the walk steps into the string, finds no such property, and returns the key — whereupon Fabricate's `text(key, fallback)` idiom (`translated && translated !== key ? translated : fallback`, e.g. in `ProgressiveStageList.svelte`) quietly renders its **hardcoded English fallback**.
**Nothing fails.** The UI reads correctly in English, screenshots look right, and mounted tests pass — so the whole class is invisible until a translator ships a locale where the fallback is wrong-language.
Every child key of the shadowing string is affected at once.
`tests/ui-lang-keys-resolve.test.js` (PR #674) gates only the **reference direction** (a key the code reads must exist); it does **not** detect a shadowed namespace, and **orphaned keys stay invisible to it entirely**.
So when adding a key, check no ancestor path is itself a string, and prefer a distinct leaf (`…Salvage.Label`) over reusing a container path as a value.
- **`setFlag` / `Document#update` OBJECT flags DEEP-MERGE, so removing a key needs an explicit `-=` deletion — whereas `game.settings.set` REPLACES the whole value and needs no deletion key.** This merge-vs-replace split is load-bearing across three subsystems: active-run containers, learned knowledge, and the party learn pool.
An object flag written through `setFabricateFlag` is stored DOUBLY nested (`flags.fabricate.fabricate.<key>`) because the helper prefixes `fabricate.` and `expandObject` nests it again under the scope, so the deletion key is `flags.fabricate.fabricate.<map>.-=<id>` — a shallow `flags.fabricate.<map>.-=<id>` silently no-ops and the entry resurrects on reload.
Never prune by rebuilding a filtered map and writing it back through `setFlag` as the sole write — that merge never removes keys.
A same-`update` parent-delete + re-assert mix (`-=<map>` plus a fresh `<map>` in one payload) is ORDER-DEPENDENT in `mergeObject` (no delete-before-insert guarantee, so it can process the delete last and wipe the whole map); issue TWO sequential awaited updates instead — parent `-=<map>` first, then the retained-map write.
See `forgetLearnedRecipes` (`src/systems/RecipeVisibilityService.js`) and `deleteRemovedActiveRunFlags` (`src/config/flags.js`) for the worked precedents; the party pool instead lives in a world setting, so its `decrement` re-`set`s the whole map with no `-=` key.
- **The same merge-vs-replace split makes a dotted id SAFE as a settings-payload VALUE though it is a trap as a flag KEY.** `Recipe.importSource.systemId` (`importSource` in `src/models/Recipe.js`, stamped by `importFromPackData` in `src/systems/CompendiumImporter.js`) can hold a dotted pack id and round-trips intact because it rides inside the `recipes` world setting, which `game.settings.set` JSON-serializes whole — never through `mergeObject`/`expandObject` — so no dot is ever read as a path separator.
That is why provenance-matched recipe pruning sidesteps the dotted-flag-key trap (where `setFlag`/`expandObject` split a dotted id on EVERY dot and nest it, so the reader silently misses the intended key): the identical dotted id that would degrade a flag key is inert-safe as a settings JSON value.
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

**The `nextView === '<kind>-view'` same-view skip is NOT safe for a view with no `SCOPE_BROWSER_BY_VIEW` entry.** That map in `CraftingSystemManagerRoot.svelte` lists only `recipe-edit`, `recipe-item-edit`, `component-edit`, and `essence-edit`, and `browserViewForScopeChange` falls back to returning the view token unchanged for everything else.
So a scope-select **system switch** from such a view calls `confirmRouteExit` with the view it is already on, the same-view skip returns `true`, and the guard silently never fires — even though the draft belongs to the outgoing system and is about to be abandoned.
A view in that position needs a separate identity-change check invoked from `changeScopeSystem` before `confirmRouteExit`; `confirmSystemDetailsScopeChange` is the worked example (issue 767).
`environment-edit` and `tools` also pair a same-view skip with no map entry, so check them against their own scope-change paths before assuming they are covered.
Keep the same-view skip as well: a genuine same-view re-entry on the SAME system (the validation-blocker link) leaves the form mounted with its draft intact, so prompting there is a spurious dialog.

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
Each listing carries count/policy fields via `_playerListingFields` in `GatheringListingBuilder.js`: `composedTaskCount` (total composed task pool — `normalizeList(environment.tasks).length`, the blind-reveal denominator `y`; `0` when locked); `discoveredTaskCount` (the `x` — tasks this actor revealed at the effective reveal scope via `GatheringRichStateService.countRevealedTasks`; `0` when locked or `revealPolicy === 'never'`); `revealPolicy` (effective **system-level** policy `never` | `onSuccess` | `onAttempt`, resolved by `GatheringEngine._resolveRevealPolicy`, which the builder receives as its injected `resolveRevealPolicy` collaborator — reveal is system-level only, environments do not override it); `locked` (`true` for an out-of-reach environment, surfaced as an identity-only listing to all viewers — built by `_lockedEnvironmentListing` in `GatheringListingBuilder.js`, which `_buildEnvironmentListing` emits in exactly two cases: a **disabled** environment (`environment.enabled === false`, `ENVIRONMENT_DISABLED`), and a **location-gated** environment the party is not in (`location.gated === true && location.available === false`, `NO_CURRENT_REALM` / `LOCATION_BLOCKED`, covering both realm gating and scene gating); both are `attemptable: false` and carry no tasks; an in-realm, selectable environment whose individual tasks are merely blocked is `locked: false`); and `biomeTags` (resolved biome display metadata).
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

### The `sourceUuid` string names TWO unrelated persisted things

A codemod on the literal string `sourceUuid` (or `sourceItemUuid` / `fallbackItemIds`) is **object-family-scoped, never global** — the same string names two unrelated persisted concepts with different schemas and different migration surfaces.

1. **The registered-entry match reference** (issue 560 renamed it).
Components, recipe-item definitions, and first-class tools each carry `registeredItemUuid` / `originItemUuid` / `aliasItemUuids` (formerly `sourceUuid` / `sourceItemUuid` / `fallbackItemIds`) inside the `craftingSystems` **settings payload**.
Because this lives in settings data, `MigrationRunner` can rename it as pure data (`migrateRenameSourceUuidFields`, `1.16.0`); the union matcher is `getItemMatchUuids(entry)` in `src/utils/sourceUuid.js`.
The essence definition's OWN `sourceItemUuid` pointer is a THIRD, separate field family that was deliberately NOT renamed.

2. **The `fabricate.interactable` RegionBehaviour `sourceUuid` `StringField`** (`interactableRegionFlags.js`).
This is a real `documentTypes` DataModel schema field on a persisted RegionBehaviour, consumed across `src/canvas/**`; renaming it would corrupt saved region data and needs its OWN DataModel migration.
It is unrelated to the registered-entry match ref and stays `sourceUuid`.

The learned-recipe provenance record (`Actor.flags.fabricate.learnedRecipes[recipeId].sourceItemUuid`, written by `RecipeVisibilityService`) is a fourth, actor-flag family that is also NOT in the settings-payload rename scope.
Classify every occurrence by the owning object before renaming.

### Prototype-driven redesign and design-system migration

Fabricate's UI is being redesigned surface-by-surface from standalone HTML prototypes.
Issues 675 (player Inventory) and 676 (GM Component Studio) each passed a three-round plan gate, a two-round implementation review, and a docs loop — and the maintainer still found user-visible drift within minutes of opening them, plus two surfaces that were specified and never built.
Every reviewer had checked the change against *rules* (tokens, geometry, type scale, a11y); none had put the new surface beside the shipped one it was supposed to match, and none had checked whether the CSS did anything.
These notes are what that cost.

- **The already-migrated side wins — identify it, do not assume it.**
When a redesign lands one surface at a time, every prototype-vs-shipped disagreement has a side that is already the new design system.
That side wins.
The shipped sibling won for issue 676 (the Recipe Studio was itself built from a prototype and had already been corrected in use), and the **prototype** won for issue 675 (the Inventory leads the new player design; Crafting/Gathering/Journal are the old one and follow later).
Neither "the mock is the source of truth" nor "match the neighbour" is safe as a blanket rule — applied blindly, the first re-introduces fixed defects and the second drags a leading surface backwards.

- **"Where the brief is silent, X wins" does not fire where the brief speaks.**
Issue 676's plan carried exactly that clause and drifted anyway: the brief spoke, the implementer followed it faithfully, and the result still diverged from its sibling — because the sibling had already fixed the thing the brief described.
A sibling rule must read "the sibling wins wherever it has an opinion", and the check must be a control-by-control diff, not a tie-breaker invoked when someone happens to notice a gap.

- **A shipped sibling's CSS comments are the record of what the prototype got wrong.**
Read them before building from a mock.
`.manager-recipe-row.is-selected { box-shadow: none; }` in `styles/fabricate.css` exists to opt the recipe row out of a shared rule, and says why: a ring plus a bar states the selection twice.
Issue 676 was added to that shared rule's selector list, never got the opt-out, and shipped the bar.
The same file documents deleting a duplicate page header, replacing a bordered count chip that "read as something to press", and cutting three row icons to one — all three of which issue 676 rebuilt.

- **Implementing a brief's token NAMES is not implementing its design.**
A brief describes a delta from the prototype's baseline, so the same declaration means different things against a different baseline.
Issue 675's card selection shipped `--accent-border` + `--surface-soft` exactly as written, onto a resting card that was already `--surface-soft` — the rule compiled to a no-op and selection became invisible.
Verify the change **renders**; a style that declares correctly and changes nothing passes every review we have.

- **Duplicated scoped styles drift silently, and per-file review cannot see it.**
Svelte scoping lets two components hand-roll the same class names with different values while each reads as perfectly self-consistent.
Issue 675's `InventoryBookDetail.svelte` and `InventoryComponentDetail.svelte` did this across eleven classes, so the inspector rendered two design systems depending on what the player clicked.
Extract the shared shell; matching the values by hand only resets the clock.

- **A "verbatim" extraction during a redesign carries the OLD design forward.**
Splitting a component is a structural refactor, and "I moved it unchanged" is the correct claim for the code and the wrong outcome for the pixels when everything around it is being restyled.

- **A gate authored from the implementation enshrines the implementation.**
`tests/components/component-studio-font-size.test.js` was written by measuring the shipped markup, so its fixture hardcoded the drifted controls and its own comments recorded the drift as expected values.
It then defended the drift.
Author a visual gate from the design source, and treat a gate whose fixture mirrors the component as measuring nothing.

- **Hand-rolled markup where a primitive exists is a drift generator.**
Both issues did this: `Medallion`, `StatusPill`, `DropZone`, `RollResultBox`, `CraftButton` and `CraftingThumb` all exist and were re-implemented locally, each copy landing on its own values.
When reviewing a new surface, list the primitives its sibling uses and ask why each one is absent — "it's a valid manager surface" is not the bar, "it is the same surface" is.

- **Borrowing vocabulary from the wrong neighbour is invisible to rule-based review.**
Issue 676's editor was built from the Gathering vocabulary (`manager-task-core-card`, the environment scene widgets, `manager-availability-pill`) rather than the Recipe Studio's, so its tag pills inherited a **warning** ramp and rendered amber.
Every token was a real `--fab-*` token and every gate passed.

- **A mock's fixtures hide the states real data produces.**
No item in issue 675's prototype was both a tool and salvageable, so its salvageable and tool badges could share one corner slot; in Fabricate those flags are independent and the broken salvageable tool is the headline case.
The prototype is not authority on states it never had to survive — long names, missing art, both-flags-true, zero-length collections.

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

- All implementation, documentation, and workflow-file changes must happen on a non-`main` integration or lane branch.
- Before editing, the driver verifies the coordinator branch, and every mutable spawned agent verifies the branch and base in its assignment (`git branch --show-current` and `git rev-parse HEAD`).
If the coordinator is on `main`, the driver creates or switches to a task branch before fan-out; a spawned agent treats any lane identity mismatch as blocked.
Re-check after any integration or merge because the expected branch or SHA may have changed.
- When a spawned agent completes work, it commits only owned paths locally and returns the commits to the driver without pushing or opening a PR.
The driver verifies and integrates lane commits, then pushes the integration branch and opens or updates the PR targeting `main`.
- Respond to review feedback through a valid retained lane or a fresh revision lane, then update the same integration branch and PR; do not open replacement PRs unless the user asks.
- When review is required, review-only agents inspect fresh detached snapshots of the exact assigned integration commit against an immutable artifact and must not commit, push, merge, or mutate GitHub state.
- Before maintainer handoff, complete the final delivery loop: rebase onto fetched `origin/main`, rerun authoritative gates and commitlint, preserve valid approval across a patch-equivalent rebase or obtain fresh detached review when the owned concern materially changed or a finding remains unresolved, explicit-lease push, mark ready, require all exact-head checks including both SonarCloud checks, then re-fetch main and reverify ancestry, head identity, and ready state.
- Treat draft checks as preflight only; a required workflow may be triggered by `ready_for_review` and must pass after the PR is undrafted.
- PR titles must comply with Conventional Commits, using the same `<type>(#<issue>): <short description>` format for `feat`, `fix`, and `perf`.
- PR descriptions must use H2 sections in this order: `Description`, `Benefit(s)`, `Changes in this PR`, `Testing`, and `Screenshots (if applicable)`.
- PR descriptions must include a GitHub closing keyword for the issue the PR resolves: put `Closes #<issue>` (or `Fixes #<issue>` / `Resolves #<issue>`) on its own line in the `Description` section so merging the PR auto-closes the issue.
The `<type>(#<issue>):` title prefix and a bare `(#<issue>)` only *reference* the issue — GitHub does **not** auto-close from the title, so the body keyword is required (omitting it leaves resolved issues open, as happened with the #318–#326 sweep).
Each issue needs its own keyword (`Closes #1, closes #2`).
Use the non-closing `Refs #<issue>` instead only for a partial change that must leave the issue open.
- For UI-touching PRs, the `Screenshots` section must embed at least one image (markdown `![alt](url)` or `<img>`) beneath the heading — the CI check looks for exactly that. `npm run screenshots:ui:publish -- --pr <number>` produces real smoke-harness screenshots (S3-hosted under `pr-screenshots/<number>/`) and embeds them automatically, but a drag-and-dropped GitHub attachment under the heading works too.
There is no `SCREENSHOTS_NEEDED:` bypass; if capture is genuinely impossible, a maintainer applies the `screenshots-exempt` label.
Do not commit PR-scoped screenshots under docs or other asset directories.
- Never commit directly to `main` or `release`.
- Never rebase or force-push a branch semantic-release has tagged (`release` or a hotfix line): the release automation stores release state in git tags and git notes, and a rewrite loses it.
- Never squash-merge a prerelease line into `release`: squashing collapses the Conventional Commit types the version computation reads and mis-computes the stable version.
- Never merge `release` or `main` into a hotfix line — a fix leaves a hotfix line by cherry-pick only.
- Carve-out: the release automation's `forward-port` merge from `release` into `main` is not agent work; agents do not perform or reproduce it.
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

Each role is defined **once** in its shared `.agents/skills/<role>/SKILL.md` (the canonical persona and Codex repository-discovery location).
Both provider agents are **thin bindings** that point at that skill — change behavior in the
skill, not in the bindings.
The default workflow above auto-spawns these roles based on change
signals; explicit requests are only required for roles the routing table does not cover.

| Routing token                  | Canonical skill (persona)                  | Codex binding                                | Claude `subagent_type`        |
|---------------------------------|--------------------------------------------|----------------------------------------------|-------------------------------|
| `fabricate_orchestrator`        | `.agents/skills/fabricate-orchestrator/SKILL.md`   | `.codex/agents/fabricate-orchestrator.toml`  | `fabricate-orchestrator`      |
| `fabricate_implementer`         | `.agents/skills/fabricate-implementer/SKILL.md`    | `.codex/agents/fabricate-implementer.toml`   | `fabricate-implementer`       |
| `fabricate_reviewer`            | `.agents/skills/fabricate-reviewer/SKILL.md`       | `.codex/agents/fabricate-reviewer.toml`      | `fabricate-reviewer`          |
| `fabricate_domain_expert`       | `.agents/skills/fabricate-domain-expert/SKILL.md`  | `.codex/agents/fabricate-domain-expert.toml` | `fabricate-domain-expert`     |
| `fabricate_docs_writer`         | `.agents/skills/fabricate-docs-writer/SKILL.md`    | `.codex/agents/fabricate-docs-writer.toml`   | `fabricate-docs-writer`       |
| `fabricate_ux_designer`         | `.agents/skills/fabricate-ux-designer/SKILL.md`    | `.codex/agents/fabricate-ux-designer.toml`   | `fabricate-ux-designer`       |
| `fabricate_quality_engineer`    | `.agents/skills/fabricate-quality-engineer/SKILL.md` | `.codex/agents/fabricate-quality-engineer.toml` | `fabricate-quality-engineer` |
| `foundry_integrator`            | `.agents/skills/foundry-integrator/SKILL.md`       | `.codex/agents/foundry-integrator.toml`      | `foundry-integrator`          |
| `fabricate_competitive_analyst` | `.agents/skills/fabricate-competitive-analyst/SKILL.md` | `.codex/agents/fabricate-competitive-analyst.toml` | `fabricate-competitive-analyst` |
| `fabricate_pr_explorer`         | — (no shared skill; read-only mapping)     | `.codex/agents/fabricate-pr-explorer.toml`   | `Explore` (built-in)          |

`fabricate_pr_explorer` is read-only codebase mapping; Claude uses its built-in `Explore` agent
for the same role rather than a dedicated binding.

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
- Patch dead UI / config / code branches as a workaround.
When a control has nothing useful to configure or a code path has no remaining purpose, propose wholesale removal first.
- Add static cloud credentials (e.g. AWS access keys) to CI.
Automation/agent workflows authenticate to cloud via OIDC role assumption (`aws-actions/configure-aws-credentials` + `id-token: write`) using a dedicated least-privilege role scoped to the task — never the release/production role. `pull_request_target` jobs must check out only the base ref and never execute PR-head code.
See the "Screenshot publishing infrastructure" section in `CONTRIBUTING.md` for the screenshot-publishing role/policy example.
