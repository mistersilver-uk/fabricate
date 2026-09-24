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
The gate also fails on new bugs/code-smells that ESLint does not flag (e.g. a nested ternary), so a PR can be lint-green yet Sonar-red — read the gate's findings, don't assume `npm run lint` covers it.
The commoner trap is the reverse one, and it is worth naming because it reads identically from the PR: the rule exists and simply never ran, because the FILE was outside the gate's path list.
`Array#sort()` without a comparator is a worked example — `unicorn/require-array-sort-compare` flags it here, yet Sonar still reported it as a new BUG, because the file it sat in was ungated (issue 933).
So when Sonar reports something, first check whether `npm run lint` covers that file at all; unlinted paths are the risk far more often than unlintable rules.
- The gate also fails on `new_security_rating` — a single new-code finding above rating A fails the PR.
The ones that bite in practice: `Math.random()` for an id or token (`S2245`, a MEDIUM vulnerability — use `crypto.randomUUID()` / `crypto.getRandomValues()` / `foundry.utils.randomID()`), and spawning a bare command name resolved through `PATH` such as `spawnSync('git', …)` (`S4036` — read the data from stdin, or pass a fixed executable path, rather than searching `PATH`).
For GitHub Actions workflows the gate adds its own rules: no `${{ inputs.* }}` / `${{ github.* }}` interpolated into a `run:` block (`S7630` — pass them through `env:` and reference `$VAR`); declare `permissions:` at the **job** level on any new job (`S8264`); and SHA-pin third-party actions such as `aws-actions/*` (`S7637`; `actions/*` are allowlisted).
A **composite action** (`.github/actions/release-setup/action.yml`) has **no `secrets`/`vars` context** — only `inputs`/`env`/`github`/`runner`/`steps`/`job` — so a `${{ vars.* }}` / `${{ secrets.* }}` moved into one resolves to an empty string silently; declare those as `inputs` the caller passes explicitly.
- Reading a smoke result: `test-results/summary.json` reports `passed: false` if any phase step fails OR if an un-waived `consoleErrors[]` entry remains, and also carries the split counts `stepFailures` and `consoleErrorCount` plus the flags `degraded` and `rendererCrashed` (all written in the harness's `finally` block, so an early phase abort still populates them, never `undefined`).
Benign browser `404 (Not Found)` asset misses in the fixture world populate `consoleErrors` and flip `passed` to false even when every `steps[]` entry passed.
A known-benign console or `pageerror` line can be admitted per run via `--allowed-console-error-patterns` (appended to the in-source `ignoredErrorPatternDefaults`, never replacing them; waived lines are echoed to the step summary), but a failing `steps[]` entry is NEVER waivable and still throws first.
Reach for a waiver last, not first: the canvas-priority default that lived there for a year was suppressing a real harness defect rather than a browser artefact, and its removal is what surfaced it (issue 1010).
`degraded: true` marks a run that tolerated a transient renderer/page teardown (a `screenshot-manager`/`player-journal` step recorded `skipped: true`) — the run stays exit 0 but is a flake, not a clean pass; `rendererCrashed: true` marks a Playwright page `crash` (canonically an OOM).
A JS product bug surfaces via `consoleErrorCount` (the independent console-error gate), NOT the teardown-tolerance path — a tolerated teardown coincident with any non-waived console error still fails on the console gate; the tolerance can only mask a renderer PROCESS crash (OOM/target-destroyed) and only post-captures.
A `rendererCrashed: true` exit-0 run warrants a confirming re-run, and a PERSISTENT `rendererCrashed` pattern is actionable (a systematic tail OOM), not cosmetic.
Check `steps[]` for an actual failing step before treating a run as broken or discarding its screenshots — see the "Foundry integration (smoke) tests" section in `CONTRIBUTING.md`.
- `npm run build` — required build gate for implementation changes.
- `npm run lint` + `npm run lint:svelte` + `npm run lint:svelte:warnings` + `npm run lint:css` + `npm run format:check` + `npm run lint:md` — required ESLint + Svelte ESLint + Svelte compiler-warning sweep + Stylelint + Prettier + markdownlint gate (the `lint` CI job).
ESLint/Prettier run over a **staged path scope** (see the `lint`/`format` globs in `package.json`): now the entire `src/` JavaScript surface — `src/{models,utils,integrations,config,migration,canvas,systems}` + `src/toolBreakageRuntime.js`.
Prettier additionally formats every `*.svelte` file under `src/` — `prettier-plugin-svelte` is registered in `.prettierrc.json` (Prettier 3 does not auto-load plugins, so the devDependency alone is not enough) and `format:check` names `src/**/*.svelte`, so an unformatted component fails CI.
`npm run lint:svelte` separately gates every `*.svelte` file under `src/` with `--max-warnings=0`, so a component's script and markup ARE ESLint-gated even though the `.js` around them under `src/ui/**` is not — the two halves of that directory are gated by different scripts and must not be reasoned about as one scope.
That gate polices suppressions in both directions: `svelte/no-unused-svelte-ignore` is active, so a `svelte-ignore` comment that no longer suppresses anything is itself a lint failure and must be removed once it stops being needed.
The same holds for an ESLint suppression — the `.svelte` block in `eslint.config.js` pins `linterOptions: { reportUnusedDisableDirectives: 'error' }`, so a stale `eslint-disable` directive fails the gate exactly as a stale `svelte-ignore` does.
That is pinned rather than left to ESLint's default because it is half of what makes reformatting components safe: `eslint-disable-next-line` is anchored to a line and Prettier moves lines, so a directive that slips off its violation resurfaces the violation, and one that lands suppressing nothing is reported by this option.
A suppression that must sit on a particular line therefore needs a `<!-- prettier-ignore -->` fence to keep it there — see the `{' '}` separators in `ExplainerCard.svelte` and `CraftingSystemManagerRoot.svelte`, where Prettier splits a `<span>` containing an `{#if}` across several lines whatever the print width; the fence protects the directive's line anchor, not the render.
Svelte COMPILER warnings are gated too, as of issue 924: `onwarn` in `svelte.config.js` fails `npm run build`, and `npm run lint:svelte:warnings` runs the graph-independent sweep in `scripts/check-svelte-warnings.mjs` as its own step of the `lint` CI job.
The sweep is the authoritative half — a Vite build compiles only the entry graph, so it is blind to a component nothing imports — and both read their compiler options from `svelte.config.js`, so a disagreement between them means graph reachability and never drift in `compilerOptions`.
That qualifier is load-bearing: `emitCss` is a `vite-plugin-svelte` option rather than a compiler one, and `emitCss: false` makes the plugin drop every `css_unused_selector` before `onwarn` sees it, so the build would go quiet on a class the sweep still reports.
`tests/svelte-warning-scope.test.js` pins `emitCss` at its default on both surfaces that can set it, and pins `compilerOptions` to carry no `warningFilter` — that one key would turn the sweep, the build and the whole-tree assertion clean while checking nothing.
Stylelint still excludes `.svelte` (scoped `<style>` blocks are not linted) and SonarCloud runs no RULES against it, so ESLint plus the compiler sweep are the whole static-analysis story for a component.
**But SonarCloud's DUPLICATION detector does read `.svelte`, and that distinction is not academic** — issue 1050 read this sentence as "Svelte is invisible to SonarCloud", concluded the duplication risk lived in `tests/**`, and shipped a PR whose quality gate failed at 5.3% on new code with 93 of its 98 duplicated lines in a single `.svelte` file.
A token-level CPD run at SonarJS's 100-token minimum reproduces the gate closely; a line-based approximation does not, and neither does reasoning from the rule surface.
So a change that repeats a component's markup — the same field pair written for two scopes, one row rendered per case — is a duplication risk exactly like repeated `.js`, and the remedy is the same: render it once from one component.
`npm run lint` is `eslint .` and `npm run format:check` is `prettier --check .` — the whole repository, as of issue #1660.
They used to enumerate about eighty paths each, so a new file was linted by nothing until somebody remembered to add it, which is the trap that let a new BUG and a new VULNERABILITY reach SonarCloud in issue 933.
The not-yet-clean files are carried by `eslint.debt.js`, which switches off **per file** only the rules that file fails and leaves every other rule armed on it — deliberately not an `ignores` entry, which would take the file out of ESLint's reach entirely, `no-undef` included, while the linted-file count went up.
Formatting debt is the marked section of `.prettierignore`.
`npm run lint:debt` reports what is left in a baselined file and fails on an entry that reports nothing any more; it runs as a step of the `lint` CI job rather than from `npm test`, because answering that means linting the largest files in the tree.
`tests/lint-coverage.test.js` pins each debt group's size exactly (not as a ceiling — a ceiling banks a free slot on every payment), asserts the glob still reaches everything the old enumeration did, and asserts `no-undef` is never baselined.
When you bring a file to green, delete its entry and lower the pinned count in the same commit; widen nothing else in the same PR, since reformatting counts as new code and surfaces pre-existing Sonar findings.
The `scripts/**` debt is fifteen of its thirty-three files, and stays that way for a measured reason: the Foundry smoke harness alone accounts for 844 of the roughly one thousand ESLint findings there and pins its Phase D0 selectors by class, index and button text with no unit coverage, so clearing it is a large triage against the least-covered file here rather than a tidy-up.
A new `.sh` under `scripts/` is the one thing still added by hand — to `SHELL_SCRIPTS` in `tests/scripts-lint-gate-coverage.test.js`, which with its `bash -n` parse is the only gate shell gets anywhere in this repository.
`npm run lint:css` (Stylelint, config in `stylelint.config.js`) gates `styles/**/*.{css,scss}` and enforces quality, reliability, duplication, reuse/shorthand, and cross-browser support (against the `browserslist` in `package.json`); Svelte scoped `<style>` blocks are out of scope.
Use `npm run lint:fix` / `npm run lint:css:fix` / `npm run format` to auto-fix.
See the "Linting & formatting" section in `CONTRIBUTING.md`.
- `npm run lint:md` (markdownlint, config in `.markdownlint-cli2.jsonc`) gates every authored Markdown file and enforces **one sentence per line** — run it before finalising any change that touches Markdown.
Run `npm run lint:md:fix` to auto-split prose, re-running until the count stops dropping (a long paragraph splits one boundary per pass), and wrap a multi-sentence table cell's table in a `<!-- markdownlint-disable markdownlint-sentences-per-line -->` / `<!-- markdownlint-enable markdownlint-sentences-per-line -->` region, since a cell cannot break across lines.
- `npm run lint:md:files -- <paths>` is the focused local and lane check and passes only the explicit paths to `markdownlint-cli2 --no-globs`, so configured repository globs cannot pull unrelated Markdown into the run.
`npm run lint:md` remains the unchanged authoritative whole-repository gate in local development and CI; CI does not substitute the focused command for it.
- `node scripts/view-lab-screenshots.mjs apps <case-ids>` — **the default way to produce and inspect application screenshots.** Seconds per frame, no Docker, no Foundry container, and it runs in CI.
- For UI/UX work, prefer the local Vite dev server first, using the user-provided dev URL when available.
- `npm run test:foundry` — use when a change depends on real Foundry RUNTIME behavior (document lifecycle, compendium APIs, cross-application context), or for a view the case registry does not cover.
Do NOT run it to photograph a view the registry already covers: the `screenshots` profile costs ~31s per frame against the View Lab's ~5s, needs Docker and a licensed container, and cannot run on a GitHub Actions runner — so it produces nothing per-PR and serialises on one machine.
- UI-changing PRs (files under `src/ui/`, `styles/`, or any `*.svelte`/`*.css`) must include screenshot evidence for the relevant changed views before opening or updating the PR; a `lang/` change requires screenshots only when the same PR also changes one of those render files.
Evidence is always a FULL APPLICATION WINDOW — never a component on a blank page.
Each case pins the size its smoke counterpart photographs rather than the app's declared `DEFAULT_OPTIONS.position`: the two differ (the smoke shoots the manager at 1280x820, not its declared 1280x940), and responsive cases deliberately pin narrower geometry, so the registry spans twelve sizes and the size is a per-case fact rather than a per-app one.
- For a view covered by the canonical registry (`scripts/lib/viewLabCases.js`) — which is the normal case — the **View Lab** is the producer, and it is what CI runs on every PR push: `node scripts/view-lab-screenshots.mjs apps` renders every case, or pass a comma-separated id list to render a subset, into `ui-screenshot-artifact/apps/`.
How many cases that is, and how many of them surface coverage selects, are generated into `scripts/README.md` rather than quoted here.
Selection is targeted, and no single changed file selects the whole registry: a render file selects the cases whose `sourceMatches` claim it, a broad shared primitive or stylesheet selects a small representative set, and a change to one of the lab's OWN inputs (fixture world, capture driver, registry shared code) selects **surface coverage** — one frame of every route and tab the lab renders — rather than every state of every screen.
A detailed state is captured when the files that govern it change; if you need one alongside such a change, name its case id in the run rather than widening the selection.
Measured at a 155-frame registry: ~5.6s per frame locally (14 min for that whole corpus), a five-case subset in 36s, one case in 22s — against ~31s per frame for the smoke's `screenshots` profile.
The per-frame rate is the durable figure; the whole-corpus total scales with the registry.
An unknown case id aborts in a second naming the id, so a typo costs nothing.
Browse the result at `ui-screenshot-artifact/apps/index.html`, which groups frames by screen and offers a multi-tag filter; `npm run viewlab:index` regenerates it.
It needs a one-off `npm run viewlab:chrome:harvest` first, which extracts Foundry's real window chrome from the release archive `npm run test:foundry:up` already caches; nothing harvested is ever committed.
The lab fails closed rather than approximating: no harvested chrome, no frame.
- The live smoke remains the FIDELITY AUTHORITY.
Where a View Lab frame and a smoke frame of the same view disagree, the smoke frame is right and the lab is defective — fix the lab, do not publish the lab's version.
For a view the registry does not cover, the smoke is also the producer:
use `npm run screenshots:ui:plan -- --base origin/main` to identify expected views, run the scoped `screenshots` profile (`npm run test:foundry:screenshots -- --target-labels=$(npm run --silent screenshots:ui:targets -- --base origin/main)`) to produce real Foundry screenshots for only the changed-file-affected views under `test-results/`, `npm run screenshots:ui -- --base origin/main --pr <number>` to collect the relevant smoke artifacts into `tmp/pr-screenshots/<number>/`, then `npm run screenshots:ui:publish -- --pr <number>` to upload them to S3 (under `pr-screenshots/<number>/`) and embed the returned `![pr-<number> ...]` image markdown into a managed block in the PR body's `Screenshots (if applicable)` section, then `npm run screenshots:ui:clean -- --pr <number>` so PR-scoped screenshots are not committed as repository assets.
The reduced `rc`/`ci` smoke stays the CI/release gate and `full` remains the occasional outer-loop suite; do NOT run the `full` (or `screenshots`) smoke profile on a GitHub Actions runner — generation is local.
The evidence must DEMONSTRATE the change, not merely clear the gate: at least one published frame must show the changed state itself, and when that state is not reachable by the existing capture walk in `scripts/foundry-smoke/scenarios/` or by a registry case, the branch adds one that reaches it rather than publishing an unrelated frame.
A View Lab case that navigates must declare `expectView`; the capture asserts the app reached that route and fails rather than screenshotting whichever screen it landed on.
The `check-screenshots` gate cannot be self-satisfied: there is no `SCREENSHOTS_NEEDED:` bypass.
It also now awaits the `capture` job in `pr-screenshots.yml` for this PR's own head SHA before deciding, then re-reads the live PR body those frames were published into, so a first push no longer reds by construction on a body the producer has not written yet.
If capture is genuinely impossible, only a maintainer may apply the `screenshots-exempt` label (agents must never apply it).
An explicit issue-specific maintainer instruction may replace automated screenshot production, but it leaves agent visual approval pending and does not itself satisfy or waive `check-screenshots`; qualifying maintainer-provided evidence or the maintainer label is still required.
- Smoke screenshot fixture data should use Foundry VTT core or dnd5e non-SVG raster icon paths directly when previews need imagery; do not invent custom SVG preview art.
- The smoke harness Phase D0 (`screenshot-manager` step in `scripts/foundry-smoke/scenarios/`) pins many selectors by class, `.nth(N)` index, and visible button text.
When changing any manager UI surface — environment row markup, env-edit view, composition list, header actions — grep the harness for the changed classes / text before declaring the change done.
See the "Foundry integration (smoke) tests" section in `CONTRIBUTING.md`.

### Release Utilities

- Use `node scripts/latest-module-versions.mjs --profile fabricate-beta` to query the current latest beta manifest versions for Fabricate and the premium sibling modules; substitute another `--profile <name>` when the local AWS profile differs.
The script reads `release.s3.config.json` plus `../fabricate-premium/release.config.json`, uses exact S3 `GetObject` reads for `modules/<moduleId>/<channel>/latest/module.json`, and does not require `s3:ListBucket`.
Useful flags: `--json`, `--include <moduleId>`, `--bucket <name>`, `--channel <name>`, `--premium-config <path>`, and `--no-premium`.
- `node scripts/rotate-tester-secrets.mjs` rotates every tester path segment in one pass, across this repository and the premium sibling.
It reads both committed release configs to derive which repository secrets each tester group's segment is written to, so no Patreon tier name is hard-coded here.
It is **dry-run by default** and writes nothing until `--apply`; `--group <name>` narrows to one group, and refuses when that group's secret also serves groups you did not name.
Useful flags: `--group <name>`, `--config <path>`, and `--premium-config <path>` when the premium sibling is not checked out beside this repository.
`--no-premium` inspects this repository alone and is **refused together with `--apply`**, because rotating one repository leaves the other on the old segment and splits one cohort across two prefixes.
Rotation is a cohort migration, never hygiene: it deletes nothing and republishes nothing, so every superseded prefix keeps serving its last manifest and the cohort on it silently stops receiving updates rather than failing.
Under `--apply` it prints one full `testers/<group>/<segment>/<moduleId>/module.json` URL per rotated group and module, so the report pastes into the patron announcement as-is; `gh` cannot read a secret back, so it is also the only record of where each cohort now lives.
Pair each run with the patron announcement carrying those URLs.
It is deliberately absent from `package.json` and from every workflow, because it mutates repository secrets in two repositories and must stay a deliberate local act.
It resolves `gh` to one absolute path before running it rather than searching `PATH` at spawn time; set `GH_BIN` to an absolute path for a non-standard install, and a relative `GH_BIN` is refused.
- `node scripts/release-s3.js --channel <name>` publishes a built `dist/` to one channel's S3 targets: `beta` (closed testers, the default), `early-access` (patrons), `public` (everyone + the Foundry registry), or a hotfix line's own channel.
`--channel early-access` and `--channel public` are the private-patron and public targets; each tester group derives its tester URLs from its own path secret, and a channel with any declared group whose secret is unset refuses to publish before building.
`release.s3.config.json` declares each channel's `testerGroups` as an object keyed by group, each naming its own `testerSecretEnv`; early access serves `apprentice-crafter-2026` and `guild-artisan-2026`.
Pair with `--dry-run` to print every planned key and URL without writing, and `--check-heads` to read each target's head and the monotonic-head guard verdict without publishing (note `--check-heads` is head-ordering only — it stages no build, so it does NOT evaluate the same-version resume/provenance decision, which needs a real publish).
The tag supplies the built bytes and the publisher runs from the workflow ref: every CI publish checks the tag out beside the workflow ref with `.github/actions/release-source/action.yml` and passes `--source-root <worktree>` and `--source-sha <commit>`, so the ref's publisher and configuration build the tag's tree.
In CI a build refuses without both flags, and it refuses a `--source-sha` that is not the commit checked out at `--source-root`.
Run locally with neither, it builds this checkout and reads its own `release.s3.config.json`.
A local `--source-sha` given without `--source-root` is checked against this checkout's `HEAD`.
The three-channel model these serve is specified in `openspec/specs/release-and-distribution/spec.md`.
- `release-s3.js` publishes through a **provenance guard**, not a byte check (the built zip is not byte-reproducible across builds).
Every versioned zip carries `(fabricate-version, fabricate-source-sha, fabricate-build-profile)` metadata — pass `--source-sha` explicitly, since `GITHUB_SHA` names the workflow ref rather than the tag being built; manifest writes are conditional (`IfMatch`) and every write is read back.
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
That is the steady-state rule, and it sits on top of the one-time reflow of the harness documents that issue #1661 sanctioned and `scripts/lib/markdownWraps.js` performed; a further wholesale reflow needs its own sanction.

## Git Conventions

- All implementation, documentation, and workflow-file changes must happen on a non-`main` integration or lane branch.
- Branch verification, lane commits, review-feedback lanes and review snapshots are in [Git Conventions](.agents/skills/fabricate-orchestrator/references/agentic-workflow.md#git-conventions).
- Follow the final-delivery procedure in `.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md`; readiness changes do not create check evidence.
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
