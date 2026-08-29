# Fabricate Agent Guidelines

## Project

System-agnostic FoundryVTT crafting module supporting Foundry VTT V13 as a minimum and verified on V14 (see `module.json`); the smoke harness and the View Lab both run V14.365.
Primary stack: JavaScript ES modules, Svelte 5, Vite, `node:test`, happy-dom, Playwright, and Jekyll docs.

## Planning & Workflow

- Use the orchestrator flow first for any non-trivial task.
- Use OpenSpec as the planning system of record for non-trivial work.
- Plans touching shared scripts (smoke test, build, lint, anything in `scripts/` invoked from `package.json`) must spell out the behavior in both CI and local dev explicitly — don't bury one as a parenthetical.
- Capture the change delta in the work's GitHub issue (a managed `openspec-delta` block — proposal, design, tasks, spec deltas, roster, acceptance) before implementation starts; do not version planning files under `openspec/changes/` (that directory is gone).
See `openspec/README.md` for the block format and rules.
- Every `### Tasks` entry in the delta declares a literal `Lane surface: new-module | new-export | persisted-shape | none` field, because model-tier rule 2 reads it as a lookup at spawn time; see [Model tier routing](#model-tier-routing).
- When the work originates from an existing issue, append the delta block and preserve the reporter's original text; when it originates from a prompt with no issue, create one from the `OpenSpec Change Delta` issue template.
- Read your assigned issue using the GitHub CLI before implementation work starts.
- Use GitHub issue numbers such as `#42` when an issue exists; treat legacy `T-XXX` IDs as reference only.
- Treat `openspec/specs/*/spec.md` as the canonical specification source of truth.
- Route quick-start documentation changes to `docs/help/quickstart.md` only.
- Non-trivial UI plans include a `Reference surfaces / reuse inventory` and follow `.agents/skills/fabricate-ux-designer/references/visual-evidence-and-reuse.md`.

## Default Agentic Workflow

Non-trivial work runs as a `plan → plan-review → implement → review → docs` state machine, with iteration until each gate accepts.
Stages auto-spawn role-specific subagents based on the change signals below — agents do not need to be requested by name.
Subagents not matched by the routing table only run when explicitly requested.

The routing tokens below (`fabricate_orchestrator`, etc.) are provider-neutral role identifiers.
A routing token names a role **family**, not a binding, so it does not always resolve directly to one.
An untiered family resolves directly to a registered agent in **both** providers — `.codex/agents/*.toml` for Codex and `.claude/agents/*.md` for Claude (spawned via the Agent tool using the `subagent_type` in [Agent Roles & Bindings](#agent-roles--bindings)).
A model-tiered family resolves through per-spawn model-tier selection (see [Model tier routing](#model-tier-routing)) to exactly one model-tiered binding in each active provider, found through the `Family` table in [Agent Roles & Bindings](#agent-roles--bindings).
Either way the auto-spawn workflow behaves the same regardless of which assistant is driving.
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
That coordinator checkout is itself a worktree created for the task — never the maintainer's primary clone — so integration, authoritative gates, and delivery all run from it and it is disposed under the same guarded cleanup as any lane.
A maintainer's own checkout is never checked out to a task branch and is left as they left it.
The one exception is an explicit maintainer instruction to work in their checkout, usually so they can watch the change in a running app or drive manual testing themselves; no agent may assume or grant itself that instruction.
It authorizes only the task it was given for, does not become the default afterwards, and still requires confirming and reporting that checkout's current branch and dirty state before touching it.
Mutable lanes use unique `agent/<issue>-<stage>-<role>-r<revision>` branches and exclusive path ownership; read-only lanes use fresh detached worktrees pinned to the exact commit under review.
Spawned agents verify their assigned path, branch or detached SHA, base, and clean state before acting, then return local commits, base-relative diffs, or verdicts without pushing or mutating issue or PR state.
Parallel mutable lanes require disjoint owned paths and no dependency on unintegrated output.
The driver serializes dependency installation and complete test, build, lint, Foundry/Docker, and screenshot gates from the fully integrated coordinator branch.
Follow the canonical mechanics in `.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md` for assignment briefs, review artifacts, integration mapping, feedback revisions, conflicts, and cleanup.
That lifecycle also owns manual-test candidate visibility, unrelated dirty-state preservation, and explicit maintainer feedback batching.

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

### Model tier routing

Every routing token above names a role **family**, not a binding.
Six families — `fabricate_implementer`, `fabricate_reviewer`, `fabricate_domain_expert`, `fabricate_ux_designer`, `fabricate_quality_engineer`, and `foundry_integrator` — are bound at three **model tiers** ordered by capability, `small` < `medium` < `large`, so the driver routes each spawn to the cheapest model that can hold its scope.
The other four roles are untiered and are pinned to a single model tier each.
A model tier changes the model pin and nothing else: all three bindings of a family point at the same canonical `.agents/skills/<family>/SKILL.md`, and no per-model-tier skill directory exists.

"Model tier" is written in full on first use in a section.
A bare "tier" belongs to the crafting domain's existing success/outcome vocabulary and never to these three.

| Model tier | Claude `model:` | Codex `model`   | Codex `model_reasoning_effort` |
|------------|-----------------|-----------------|--------------------------------|
| `small`    | `haiku`         | `gpt-5.6-luna`  | `low`                          |
| `medium`   | `sonnet`        | `gpt-5.6-terra` | `medium`                       |
| `large`    | `opus`          | `gpt-5.6-sol`   | `high`                         |

These pins are declared once in `scripts/lib/agentModelTiers.js` and mirrored by this table; `npm run validate:agents` fails any binding that drifts from them.
The model tier is an **underscore** suffix in token space (`fabricate_implementer_small`) and a **hyphen** suffix in file space (`.codex/agents/fabricate-implementer-small.toml`), because the two namespaces already differ that way.
This is mechanical, not cosmetic: the bindings-table parser matches a token cell against a bare backticked `(fabricate|foundry)_\w+` pattern, and `\w` covers `_` but not `-`, so a hyphenated token cell would be silently skipped and that role would lose every binding check.

The four untiered roles are pinned as follows.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Role                            | Model tier | Rationale                                                                       |
|---------------------------------|------------|---------------------------------------------------------------------------------|
| `fabricate_orchestrator`        | `large`    | Owns routing and the iteration loops.                                            |
| `fabricate_docs_writer`         | `medium`   | Bounded JSDoc and Jekyll edits against an already-approved diff.                  |
| `fabricate_competitive_analyst` | `large`    | Rare, research-heavy, judgement-dense; model-tiering it would save little.        |
| `fabricate_pr_explorer`         | `small`    | Read-only codebase mapping. Codex binding only — Claude uses the built-in `Explore` agent, which has no repository binding and whose model this repository cannot set. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

#### Selecting a model tier

Model-tier selection is the driver's, and it is literal.
It is resolved **once per spawn**, keyed on the `(family token, stage, revision)` triple — not once per token.
The routing table's Stage column already schedules one family at two stages, and those spawns see different facts, so they may legitimately resolve to different model tiers.

The driver uses only facts it mechanically holds at that spawn point.

| Stage                                 | Keyed path set                                                                                                                          | Size metric                                    | Rule 2 source                                                                                                                                           |
|---------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| plan-review                           | the delta's proposed affected-files list, **intersected with the globs of the path-signal routing-table row that spawned this reviewer** | count of `### Tasks` items                     | the strongest `Lane surface` among the `### Tasks` entries whose declared paths intersect this reviewer's keyed path set, or `none` when none intersects |
| implementation                        | the lane's owned-path set from the assignment brief                                                                                       | count of `### Tasks` items owned by the lane   | the lane's `Lane surface` field                                                                                                                         |
| post-implementation review, docs loop | `git diff --name-only` against the assigned base, on the driver-generated immutable artifact, intersected with the spawning path-signal row's globs | added + deleted lines from `git diff --numstat` | the artifact: an added `export` line                                                                                                                    |

`git diff` is an input for post-implementation stages only.
The implementer is the agent that *creates* the diff, and plan-review runs before any implementation exists, so neither has one.

Rule 2's review-stage source is the added-`export` line **only**, deliberately excluding added files.
An added file is what makes the tests row fire in the first place, so keying on it would resolve `fabricate_quality_engineer` to `large` on every change that adds a test — the same always-`large` failure that row intersection fixes.
Excluding added files also removes any dependence on ambient `diff.renames` configuration, which decides whether a rename reports as `R` or as `A` plus `D`.

**Row intersection.**
A reviewer spawned by a **path-signal** routing-table row is scored only on the paths that row's globs matched — the driver already computed that intersection to build the roster.
Without it, one `package.json` touch would force every parallel plan reviewer to `large` at the workflow's highest-fan-out stage, which is precisely the outcome model tiers exist to avoid.
Intersection applies to path-signal rows only.
A **content-signal** row (Foundry identifiers, competitor questions, PR investigation) has no globs, so its reviewer scores on the **unintersected** set, exactly like the always-row roles.
The Foundry row is mixed: intersect on its path globs when it matched on those, and score unintersected when it matched on content.
The always-row roles `fabricate_implementer` and `fabricate_reviewer` own the whole change and always score unintersected.

**`HIGH_RISK_PATHS`.**
Any match forces `large`.
The list lives here, once, next to the ladder.
Its matching semantics and the list itself are inside one fenced block so that no illustrative path is read as a repository reference by the harness path-existence gate.

```text
Entries are root-anchored, repo-relative POSIX paths.
`**` matches one or more path segments.
An entry without `**` matches that exact path only, never a basename — so a nested
src/ui/package.json would not match the root package.json entry.

module.json
package.json
package-lock.json
src/main.js
src/migration/**
scripts/**
.github/workflows/**
release.config.js
release.s3.config.json
AGENTS.md
CLAUDE.md
.agents/skills/**
.claude/agents/**
.codex/agents/**
```

The agent-harness paths are on the list because a mistake there mis-routes every future change.
`openspec/specs/**` is deliberately **not** on the list — forcing it to `large` would make the `fabricate_domain_expert` lane permanently `large` and erase the saving for the role that touches specs most.
It carries a `medium` floor instead (see the floors below), because the routing table schedules `fabricate_domain_expert` at plan-review and the docs loop but **never** at post-implementation review: a spec change that does not trip the docs row has its actual canonical-spec diff reviewed by `fabricate_reviewer` alone, and the cheapest model must not author or review canonical requirement text unaccompanied.

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

Rules 1 to 4 all yield `large`, so their overlap is harmless under first-match-wins; rules 5 and 6 are disjoint and rule 6 is total, so the ladder always returns exactly one model tier.
Rule 6 is the default, and it defaults **up** to `medium`, never down to `small`.
`small` requires a positive, narrow match on rule 5; nothing falls into `small` by omission.
The 2-path case resolving to `medium` is a deliberate, stated relaxation of "single-file": a module plus its co-located test is one concern, not two, and treating it as `large` would make `large` the common case and erase the saving model tiers exist to produce.

**Rule 2's input is authored at plan time, not judged at spawn time.**
Each `### Tasks` entry in the issue delta carries a literal field:

```text
Lane surface: new-module | new-export | persisted-shape | none
```

Rule 2 then reads as a lookup, not a reading of prose.
At post-implementation stages the field is ignored and rule 2 is derived from the artifact instead, per the keyed-input table above.

**Worked examples.**

- **A harness change whose implementation lane owns `AGENTS.md`, `.claude/agents/**`, `scripts/validate-agent-bindings.mjs`, and `package.json`.**
Four `HIGH_RISK_PATHS` matches.
Rule 1: `large`.
- **Plan-review of a UI change that also touches `package.json`.**
The `fabricate_ux_designer` spawn intersects the change with its row's globs (`src/ui/**`, `styles/**`, `**/*.svelte`), so `package.json` is not in its keyed set; 2 Svelte files, 5 delta tasks.
Rules 1 to 4 miss, and rule 5 needs exactly 1 path.
Rule 6: `medium`.
The `fabricate_reviewer` spawn scores unintersected, hits `package.json`, and is `large`.
- **A `lang/en.json` string correction, implementation lane.**
One owned path, no high-risk match, `Lane surface: none`, 1 owned task.
Rule 5: `small`.
- **A Svelte component fix that adds an exported helper.**
One owned path, but `Lane surface: new-export`.
Rule 2: `large`.
- **Post-implementation review of a 2-file, 180-line diff under `src/systems/`.**
No high-risk match, no added file and no added `export`, 2 files, and 180 lines is above `SMALL_MAX` and below `MEDIUM_MAX`, while rule 5 needs exactly 1 path.
Rule 6: `medium`.

**Model-tier floors.**
Applied after the base model tier; they only ever raise it, and every floor clamps at `large`.

- A lane's model tier never decreases across revisions of the same `(family, stage)`.
The floor is the **highest model tier at which the lane actually executed** in a previous revision — not the model tier it was originally resolved to.
Without this, a lane that resolved `small`, escalated, and completed at `medium` would re-resolve to `small` from the same unchanged facts next revision and pay the identical wasted spawn again, since the ladder itself has no memory.
- A revision carrying an unresolved finding forward is floored one model tier above the previous revision's executed model tier.
- A lane whose keyed path set includes `openspec/specs/**` floors at `medium`.

#### `ESCALATE_TIER`

An agent of a model-tiered family that finds its assignment exceeds its model tier returns `ESCALATE_TIER: <reason>` on its first line rather than guessing.
It is named `ESCALATE_TIER`, not `ESCALATE`, because this file and two canonical skills already use "escalating to the user" for the 3-revision cap, which is the opposite direction of travel.

- **It is available only to the six model-tiered families.**
An untiered role (`fabricate_orchestrator`, `fabricate_docs_writer`, `fabricate_competitive_analyst`, `fabricate_pr_explorer`) has no model tier above it to escalate into and returns `BLOCKED` with the reason instead.
- **It is not a verdict.**
It never satisfies a loop's acceptance condition, never counts as `APPROVED`, and is not a `BLOCKED` stop condition.
It is defined for mutable roles too, whose first line is not a verdict at all.
- **It is returned before the lane's first edit**, immediately after the lane identity checks in `.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md`.
The driver honours it only after mechanically confirming the lane has zero commits, `git status --short` is empty, and `HEAD` equals the assigned base; any other escalating lane is preserved and reported as `BLOCKED`.
- **The driver disposes that clean lane** and creates a fresh lane at the same assigned base with the same owned paths, exactly one model tier up.
- **An escalation does not consume a loop revision**, because a revision is defined by reviewer findings, not by model-tier capability.
- **At most one escalation per `(family, stage, revision)`** — not per lane.
The fresh lane inherits the spent budget, so `small` to `medium` to `large` in one revision is not permitted; a second escalation is `BLOCKED`.
This is what bounds the worst case at two spawns per revision, since a per-lane budget would reset on every fresh lane.
- **`ESCALATE_TIER` from a `large` lane is a protocol error.**
The driver converts it to `BLOCKED` and surfaces it under the existing stop condition.
- **Feedback rule.**
When a `small` spawn escalates on a recurring assignment shape, move that shape up the ladder in this file.

Because an escalation does not consume a revision, a family-named lane would collide with itself at the same revision, so the model-tiered token appears in the lane **branch** and the lane **directory** name alike — including for detached read-only lanes, which have no branch to disambiguate them.
The assignment brief records the resolved model tier and the facts it was resolved from.
See `.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md` for the lane mechanics.

An escalation is pure waste, not partial progress — the second spawn repeats the full orientation cost.
The default-up rule, the executed-model-tier floor, the once-per-revision bound, and the requirement that the driver front-load selection from cheap facts it already holds are what keep the expected cost below the flat-`large` baseline.

### Iteration cycles

Three loops run until acceptance, each capped at 3 revisions before escalating to the user:

In every loop, reviewers return their verdicts to the driver, which acts on them and summarizes outcomes to the user.
Reviewers do not post verdicts (or other workflow notes) as GitHub issue or PR comments.

The verdict vocabulary is `APPROVED / NEEDS_CHANGES / BLOCKED` (and `DOCS APPROVED / DOCS NEEDS_CHANGES` in the docs loop).
`ESCALATE_TIER: <reason>` is **not** a verdict: it never satisfies a loop's acceptance condition, never counts as `APPROVED`, and is not a `BLOCKED` stop condition.
Only the six model-tiered families may return it; an untiered role has no model tier above it and returns `BLOCKED` with the reason instead.
See [Model tier routing](#model-tier-routing).

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

**The driver runs this loop, including the ready transition, on its own initiative.**
Marking a PR ready is a step the driver owns outright, not a decision to refer upward, so the driver never waits to be told to undraft.
Delivery is only complete when the PR is ready and its exact-head checks are green; a green PR left in draft is unfinished work, not a cautious pause, because draft checks prove nothing about the workflows that run only on `ready_for_review`.
The maintainer's decision point is reviewing and merging the ready PR, and asking them to authorise the transition into that state only moves work back to the person the loop exists to serve.
Ask first only when the user has said to hold, when the change is one the user asked to inspect before it goes out, or when a delivery precondition below cannot be met.

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
Choose one authoritative full exact-head attempt, normally the `ready_for_review` attempt, and require all full gates from that attempt rather than combining jobs from duplicates; metadata-only `edited` attempts never qualify.
7. On any failure, return the PR to draft before gathering evidence and routing fixes through the normal isolated implementation and review loops.
After fixes, repeat the rebase, validation, lease push, ready transition, and exact-head checks, repeating review only for a materially changed owned concern or unresolved finding.
8. After the final check rollup succeeds, fetch `origin/main` again and mechanically verify that it remains an ancestor of the unchanged remote PR head and that the PR remains ready.
If main advanced, the head changed, or the PR returned to draft, repeat the mandatory delivery steps and apply step 4's material-change review rule.

Only hand the PR to the maintainer after all final-delivery conditions are true on the same commit.

### Stop conditions

- Any reviewer returning `BLOCKED` halts the loop and surfaces to the user.
- Hitting the 3-revision cap on any loop halts and surfaces to the user with the outstanding findings.
- An `ESCALATE_TIER` return is **not** a stop condition and does not consume a revision: the driver disposes the proven-clean lane and respawns it one model tier up.
A second escalation within the same `(family, stage, revision)`, an escalation from a `large` lane, an escalation from an untiered role, or an escalating lane that is not provably clean at its assigned base all become `BLOCKED` and halt under the first bullet.
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
`tests/`, the `.js` under `src/ui/**`, and `src/main.js` are NOT gated yet — widen a path in its own focused PR only once it passes BOTH ESLint and the SonarCloud quality gate (reformatting counts as new code, so it surfaces pre-existing Sonar findings).
`scripts/**` is a different shape and must not be lumped in with those: it IS gated, file by file — 20 files today, named one at a time in the `lint`, `format` and `format:check` scripts rather than globbed.
Adding a script therefore does not lint it, which is the trap that let a new BUG and a new VULNERABILITY reach SonarCloud in issue 933.
`tests/scripts-lint-gate-coverage.test.js` closes that at `npm test` speed: it parses the paths out of the `lint` script, enumerates `scripts/**`, and fails on any ungated file not written down as acknowledged debt in `tests/scripts-known-ungated.js` — a baseline that may only shrink.
So a new script must be added to all three lists — the test compares them as sets, so the same paths, in whatever order — and recording one as debt instead means changing an exactly-pinned count in review.
That count is pinned rather than capped so paying the debt down also has to be banked deliberately, and the test parses the ESLint `scripts/**` glob back out of `eslint.config.js` so widening it to a new extension cannot leave the enumeration behind.
The ones still ungated stay that way for a measured reason: the Foundry smoke harness alone accounts for 844 of the 993 ESLint findings that remain across `scripts/**` and pins its Phase D0 selectors by class, index and button text with no unit coverage, so widening the glob is a large triage against the least-covered file here rather than a tidy-up.
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
- For a view covered by the canonical registry (`scripts/lib/viewLabCases.js`) — which is the normal case, at 269 cases across both windows — the **View Lab** is the producer, and it is what CI runs on every PR push: `node scripts/view-lab-screenshots.mjs apps` renders every case, or pass a comma-separated id list to render a subset, into `ui-screenshot-artifact/apps/`.
Selection is targeted, and no single changed file selects the whole registry: a render file selects the cases whose `sourceMatches` claim it, a broad shared primitive or stylesheet selects a small representative set, and a change to one of the lab's OWN inputs (fixture world, capture driver, registry shared code) selects **surface coverage** — one frame of every route and tab the lab renders, 42 cases — rather than every state of every screen.
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
The evidence must DEMONSTRATE the change, not merely clear the gate: at least one published frame must show the changed state itself, and when that state is not reachable by the existing capture walk in `scripts/foundry-test-run.mjs` or by a registry case, the branch adds one that reaches it rather than publishing an unrelated frame.
A View Lab case that navigates must declare `expectView`; the capture asserts the app reached that route and fails rather than screenshotting whichever screen it landed on.
The `check-screenshots` gate cannot be self-satisfied: there is no `SCREENSHOTS_NEEDED:` bypass.
It also now awaits the `capture` job in `pr-screenshots.yml` for this PR's own head SHA before deciding, then re-reads the live PR body those frames were published into, so a first push no longer reds by construction on a body the producer has not written yet.
If capture is genuinely impossible, only a maintainer may apply the `screenshots-exempt` label (agents must never apply it).
An explicit issue-specific maintainer instruction may replace automated screenshot production, but it leaves agent visual approval pending and does not itself satisfy or waive `check-screenshots`; qualifying maintainer-provided evidence or the maintainer label is still required.
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
  - **Carve-out: high-frequency destructive ROW actions.** A per-row destructive action a GM performs repeatedly down a list (deleting one owned copy, erasing one learned recipe) uses the inline two-step arm — `src/ui/svelte/apps/manager/ArmedDangerButton.svelte` — instead of a modal: the first click arms the control, the second executes.
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

## FoundryVTT Notes

- `game`, `ui`, `Hooks`, and `CONFIG` are runtime globals.
Never import them.
- The module declares `minimum: "13"` and `verified: "14"`, and the smoke harness boots the pinned V14.365.
Account for both API shapes when touching Foundry-facing code, and treat a note below that cites a specific build as verified against that build rather than as a claim about every supported one.
- V13 **animates token movement**: at the `updateToken` hook the document is already at the destination, but the placeable (`token.object.center`) and `TokenDocument#getCenterPoint()` still report the *animating* position — the spot the token just left.
Any Scene Region containment / "where is this token" read at the hook is off-by-one if it uses the placeable.
Read `TokenDocument#regions` (authoritative membership) or compute the centre from the document `x/y` + footprint, and defer until the move animation settles.
See [Travel: live current-realm sensing](#travel-live-current-realm-sensing).
- **`RegionDocument#testPoint` reads a missing or non-finite `elevation` as a silent `false`, never an error** — an incomplete `ElevatedPoint` is a DENIAL, not a crash, so the defect presents as an unexplained containment miss with nothing in the console.
`testPoint` is `#testElevation(point.elevation) && polygonTree.testPoint(point)` (`client/documents/region.mjs`, verified against V14.361), and every comparison in `#testElevation` — `elevation < bottom`, `elevation === bottom`, `elevation <= top`, `elevation < top` — is false against `undefined`.
This bites **unbanded** regions too: `prepareBaseData` normalizes a `null` `elevation.bottom`/`top` to ∓`Infinity`, but `undefined < -Infinity` and `undefined < Infinity` are both false, so a region with no authored band rejects the point exactly like a banded one.
Normalize to a finite elevation at the call site (`Number.isFinite(e) ? e : 0`) for every point handed to `testPoint`, including one built from `TokenDocument#getCenterPoint()` — that returns the document's `elevation` verbatim, so an absent elevation reaches `testPoint` on the *primary* branch, not just a fallback.
`regionContainsPoint` in `src/canvas/regionHitTest.js` therefore takes elevation as an **explicit parameter defaulting to `0`** rather than reading `point.elevation`, so a caller that legitimately has no elevation (a mouse drop point) submits `0` by omission and cannot silently start submitting `undefined` when something later adds that field (issue 999).
Note the band's `bottom` is inclusive on both builds, but the `top` bound diverges by version: on V14.365 it is **exclusive unless `elevation.topInclusive`** is set, while on V13.351 the Region schema has no `topInclusive` field at all (`common/documents/region.mjs`) and `top` is **always inclusive** — `testPoint` reduces to `(bottom <= elevation) && (elevation <= top)` (`client/documents/region.mjs`).
A token sitting at exactly a region's top elevation is therefore INSIDE on V13 and OUTSIDE on V14, silently and without a crash on either build; Fabricate never reads or writes `topInclusive` (no match in `src/`), so this is a difference in the containment answer Fabricate consumes, not a Fabricate defect.
So "tests elevation" and "tests elevation the same way `testInsideRegion` does" are different claims.
- **`TokenDocument#regions` is canvas-independent and safe to read on a client that is not viewing that scene**, which makes it the one containment input that survives an active GM re-validating a player's request against a scene they cannot see.
It is backfilled from the **persisted, replicated** `_regions` schema field (`client/documents/token.mjs`, verified against V14.361): `prepareBaseData` fills it at load time but ONLY when `regions === null`, `_onCreate` fills it for a token created during play, and `#onUpdateRegions` rebuilds it when `_regions` changes — all three resolving ids through `this.parent.regions.get(id)`.
So it is populated for a token that has never moved, and it holds the SAME `RegionDocument` instances `scene.regions.get(id)` returns, which is what makes identity comparison a valid match.
It is a real `Set<RegionDocument>`, so an `Array.isArray` read silently misses it and leaves the primary path dead in production while every array fixture stays green — read it through a shape-tolerant collector (`collectRegions` in `src/canvas/regionHitTest.js`).
An **empty** `regions` means "unknown", never "in no regions": the field initializer is `game._documentsReady ? new Set() : null` and only the `null` case is ever backfilled, so an unbackfilled empty set is indistinguishable from a genuine absence.
Treat a membership miss as **indeterminate** and fall through to another signal; treating it as a negative converts a load-order race into a wrong denial (`membershipIncludesRegion`, issue 999).
- **`TokenDocument#testInsideRegion` is the canvas-free token→region containment predicate; `Token#center` and the `Token` placeable are not.**
`testInsideRegion` (`client/documents/token.mjs`, verified against V14.361) tests scene **level** inclusion via `region.includedInLevel`, the full elevation band including the token's head (`elevation + depth * grid.distance`), the token **footprint** via `getContainmentTestPoints`, and hex shapes — every one of which a centre-point `testPoint` drops — and it reads `this._source.x/y/elevation/width/height/shape` explicitly, so it is also immune to the animation lag documented above.
It throws unless `this.parent === region.parent`, a precondition that is free at any call site enumerating `scene.tokens` off `region.parent`.
By contrast the `Token` **placeable has no `elevation` getter at all** in 14.361 (neither does `PlaceableObject`; every internal read goes through `this.document.elevation`), and `Token#center` returns a bare `PIXI.Point` built from `document.getCenterPoint()` with the elevation **dropped**.
Always read a token's elevation through `.document` (`tokenElevation` in `src/canvas/regionHitTest.js`): a bare `token.elevation` read is `undefined` on any placeable-fed path and degrades silently into whatever `?? 0` fallback follows it, while a document-shaped test fixture passes green.
- **`TokenDocument#object` is `null` off-VIEW and, on V14, off-LEVEL**, so "the GM is on another scene" is only half the exposure.
`CanvasDocumentMixin`'s `object` getter returns `null` unless `viewed`, and `viewed` is `!!this.parent?._view && this.includedInLevel(this.parent._view)` (`client/documents/abstract/canvas-document.mjs`, verified against V14.361) — a token on a non-active scene **level** of the scene the GM IS viewing also has no placeable.
Any code reading `doc.object?.center` and falling back to `{ x: doc.x, y: doc.y }` therefore swaps the centre for the top-left **anchor**, roughly 70px diagonally off for a Medium token on a 100px grid, on a code path reachable while looking at the right scene.
Write every GM-side re-validation against document APIs and never against a placeable: this failure is invisible to `npm test` (no fake refuses a placeable read) and invisible to the single-client smoke, so only the source contract catches it (issue 999).
- **`canvas.scene?.id === X` is NOT a canvas-readiness predicate** — it starts answering roughly sixty lines before the canvas can accept a placeable.
`Canvas##draw` (`client/canvas/board.mjs`, verified against V14.365) assigns `#scene = nextScene` early, then `await`s `#loadTextures()`, and only afterwards calls `#activateTicker()`, which is the sole assignment of the `pendingRenderFlags` field — a bare class field until that call runs.
Creating a placeable document inside that window reaches `canvas.pendingRenderFlags[this.priority]` in `RenderFlags#set` / `RenderFlags#clear` (`client/canvas/interaction/render-flags.mjs`) and throws `Cannot read properties of undefined (reading '<PRIORITY>')`.
It surfaces as a bare `pageerror` with **no failing step**, because `CanvasDocumentMixin#_onCreate` calls `object.draw()` un-awaited and un-caught, so the throw is an unhandled rejection nothing attributes to a caller.
Wait on `canvas.ready` (or the `canvasReady` hook) rather than the scene id: `#ready = false` is assigned before the scene swaps and `#ready = true` after `#activateTicker()`, so the compound `canvas.ready === true && canvas.scene?.id === X` is the correct predicate.
**But do not treat the wait as the fix — order the work instead.** A bounded wait is only as good as its timeout, and the FIRST draw of a session is the expensive one (WebGL init, transcoder, worker startup, a full asset load on a software renderer); when it overran a 15s bound the smoke harness swallowed the timeout and created placeables into the open window anyway, reproducing the identical failure.
Create the documents while the scene is **not viewed** (`scene._view` is null, so `_onCreate` finds no placeable and draws nothing) and activate afterwards; the layer pass then draws them after `#activateTicker()`.
That also explains which draws are exposed: placeables a scene ALREADY carries are drawn by the layer pass and are never at risk — a scene full of Regions and Tiles redraws cleanly — so a create during the window is the only route in.
The window is per page session rather than per draw: `#activateTicker` defines the property with `configurable: true` and teardown only clears the queues, so once any scene has drawn past that call neither message form can recur (issue 1010).
The smoke harness's `activateSceneAndAwaitCanvasReady` and `scripts/lib/foundryCanvasReadiness.js` are the worked example of the wait, and the Manage Interactables block's seed-then-activate order is the worked example of the fix.
- **Foundry V14 added an `INTERFACE` ticker priority, and a priority-labelled error waiver goes stale on a version bump.**
V13 had `OBJECTS` and `PERCEPTION` queues only; V14 adds `INTERFACE` and moves `ControlIcon` and the new `ShapeControls` onto it.
The canvas race above therefore reported `reading 'OBJECTS'` under V13 and `reading 'INTERFACE'` under V14.365 — the same defect, renamed out from under the smoke harness's waiver, which is how it read as a new failure introduced by the version bump.
When bumping the pinned Foundry build, re-check every waiver, selector, or matcher keyed on a core constant name: a waiver that stops matching turns a suppressed problem into a fresh-looking one, and a waiver that keeps matching a renamed symbol hides it for another year.
- `updateWorldTime` is a **synced** hook — it fires on every connected client off the server's broadcast.
Any externally observable side effect driven from it (publishing public hooks, posting chat, writing documents) must be gated to the primary GM (`game.users.activeGM?.id === game.user?.id`, the `isPrimaryGM` seam in `GatheringEngine`) or it duplicates N times.
Idempotent shared-state updates (stamina regen, node respawn) are already gated this way; the gathering completion-hook publication follows the same rule for matured timed runs.
The gate applies to actor `setFlag` / `_persist` broadcast document writes too, not only `craft()` / award side effects — `SalvageRunManager.processWorldTime` and `CraftingRunManager.processWorldTime` resume matured timed runs and persist a broadcast `setFlag`, so both carry the `isPrimaryGM` seam wired in `main.js` (issue 656).
Use `activeGM` (`game.users.activeGM?.id === game.user?.id`), NOT `game.user.isGM`: `User#isGM` is true for assistant GMs too (who hold `SETTINGS_MODIFY`), so an `isGM` gate lets the full GM AND every assistant race the write — `activeGM` fires on exactly one client (this is also why `_runMigrations` gates on `activeGM`, issue 657).
- **`isGM` vs `activeGM` — the decision rule stated positively.** Ask what drove the call, not who is allowed to make it.
Use **`activeGM`** for BROADCAST-driven work that runs on every connected client — a synced hook (`updateWorldTime`), a world-load migration, any handler N clients receive — because the gate's job there is to elect exactly one executor and prevent N duplicate writes.
Use **`isGM`** for a SINGLE-CLIENT, user-initiated GM action — a click in a GM-only application — because there is no duplicate-execution risk to prevent, and `activeGM` would instead lock out the assistant GMs the application already admits.
`game.fabricate.resetActorKnowledge` is the canonical `isGM` example: one GM invokes it, from a macro/console or the GM Knowledge surface, and Foundry authorises the document writes for an assistant too (`testUserPermission` short-circuits any `isGM` to `OWNER`).
Getting this backwards is silent in both directions — an `isGM` broadcast gate duplicates writes only when a second GM is logged in, and an `activeGM` click gate refuses only assistant GMs.
- **Embedded documents created or destroyed WITH their parent emit no `create<Embedded>` / `delete<Embedded>` hook.** Hook dispatch is per-operation-type, and embedded collections are materialised through `EmbeddedCollection#_initialize`, a path with no lifecycle hook dispatch at all.
So an `Actor.create` carrying `items[]` — from an import, a duplicate, or a compendium drop — fires `createActor` and **zero** `createItem`, and `deleteActor` is symmetric.
Any projection over `actor.items` must therefore hook the PARENT's CRUD (`createActor` / `deleteActor`) as well as the child's (`createItem` / `updateItem` / `deleteItem`); the parent hooks are load-bearing, not belt-and-braces.
Filter the child hooks with `doc.parent?.documentName === 'Actor' && !doc.pack` — an Item embedded in a *compendium* Actor also has an Actor parent and could never change a world projection, and `Document#pack` falls back to `this.parent?.pack`, so the clause is directly testable.
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
- **Item drop payloads onto a manager drop zone come in three item-bearing shapes**, all resolved by `services.collectImportFolderGroups` / `onDropItem` (`src/ui/SvelteCraftingSystemManagerApp.svelte.js`).
A **world folder** is `{ type: 'Folder', uuid: 'Folder.<id>' }` (v13 drags carry the uuid, not a bare `id`) — resolve it with `fromUuidSync` and walk `folder.contents` + descendant folders.
An **in-pack folder** is `{ type: 'Folder', uuid: 'Compendium.<pack>.Folder.<id>' }` (it carries a `folder.pack` packId).
A **whole pack** is `{ type: 'Compendium', collection: '<packId>' }` (no folder in the payload).
For BOTH compendium cases, read folder membership from `pack.index[].folder` — a **default-indexed** Item field, so grouping loads no documents — grouped by folder, with display names from `pack.folders`.
Do **NOT** use `Folder#getSubfolders` for a packed folder: it filters `game.folders` (world-only) and returns `[]` for an in-pack folder, silently dropping nested items; derive the in-pack subtree from the `pack.folders` parent links instead (`descendantFolderIdSet` in `src/ui/svelte/util/importFolderGroups.js`).
A compendium-**directory** world folder (resolved `folder.documentType === 'Compendium'`) groups packs, not items, and has no item-level grouping — skip it with a notice.
- Foundry `DiceTerm#total` is the post-modifier, active-only sum; `DiceTerm#number`/`#faces` may be undefined until evaluated — read `results[].result` for raw per-die logic.
- `game.documentTypes.Item` is a plain **array**, not a `Set` — `Game#setupPackages` builds it with `Object.keys(types)` (verified against V13.351 `client/game.mjs`).
  A defensive `Array.from()` is harmless and still appears in the harness, but code may index and `.includes()` it directly.
  This note previously claimed `Set`; a `.has()` written against it would have failed at runtime while passing every fake that copied the note.
- Prefer `game.documentTypes` over `game.system.documentTypes`, with fallback only when needed.
- **Character-prerequisite paths are ROLL-DATA paths, not document paths.**
  They resolve against `actor.getRollData()`, which Foundry has already flattened, so dnd5e wants `skills.arc.value` — never `system.skills.arc.value`.
  Gathering character modifiers use the *other* convention (`@actor.system.…`), which is what makes this easy to get wrong.
  A `system.`-prefixed prerequisite resolves to `undefined`, coerces to 0/false, and fails its gate permanently while logging only a `console.warn` — and the manager renders the raw path, so the mistake reaches published screenshots.
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
- Fabricate runs configured macros through `MacroExecutor.run(uuid, payload)` (`src/utils/MacroExecutor.js`), **not** `Macro#execute`.
Foundry V13.351 `client/documents/macro.mjs` gates `Macro#execute(scope)` on the current user's Macro permission and requires LIMITED permission.
Fabricate evaluates the configured command directly so player-initiated crafting can run GM-selected automation; this bypasses only that client-side Macro document gate and grants the current player no additional server or document authority.
The generated `AsyncFunction` receives `(context, args, scope)`, with all three names referencing the identical Fabricate payload object.
This is identifier-level compatibility, not full native execution semantics: Foundry constructs its native `scope` as a rest copy and also provides `actor` / `token` / `speaker` / `character` locals, while Fabricate provides neither the copy nor those additional locals.
Foundry V13.351 `client/client.mjs` publishes `game`, `foundry`, `ui`, and `fromUuid` on `globalThis`, so Fabricate macros consume those runtime globals directly instead of receiving redundant function parameters.
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
- **Any ownership predicate whose FIRST disjunct reads `isOwner` is inert on a GM-side apply path**, and passes for a sender who owns nothing.
`ClientDocumentMixin#isOwner` is `this.testUserPermission(game.user, "OWNER")` (`client/documents/abstract/client-document.mjs`), and `Document#testUserPermission` opens with `if ( user.isGM ) level = perms.OWNER` (`common/abstract/document.mjs`) — verified against both 13.351 and 14.365.
So on the elected GM's client, which is the only client that runs a GM-side apply, `isOwner` is unconditionally true for every document in the world; a predicate shaped `actor.isOwner === true || actor.testUserPermission(sender, 'OWNER') === true` short-circuits on the first disjunct and never consults the attested sender at all.
This is the failure mode a socket relay's re-authorization exists to prevent, so the relay must call `actor.testUserPermission(senderUser, 'OWNER')` **directly**, never through a shared "may this user select this actor" helper written for the client that owns the gesture.
The two paths look identical in review and behave identically under every single-client test, because `npm test` fakes and the single-context smoke both run as one user; only reading the predicate's first disjunct catches it.
`applyComplicationDelivery` (`src/main.js`) is the correct pattern; the blind-run gather relay carried the defect and #1288 removed it — `isGatheringActorSelectableByUser` (`src/config/preferencesCleanup.js`) now reads the passed user only, and denies rather than throwing on a nullish user (`Document#testUserPermission` reads `user.isGM` as its first statement) or slipping through on a user-id STRING (`getUserLevel` reads `user.id`, so a string falls through to `ownership.default`).
Ownership predicates are not the only ambient read that goes wrong on a GM-side apply, and the same sweep found the second: `GatheringRunManager.createRun` stamped a run's `userId` from `game.user`, so a relayed blind start created a run **owned by the elected GM** — which `getGatheringRunViewer` reads back at maturity as a GM viewer, making `_isOpaqueBlindTask` false and writing the drawn task's real id into the player-readable actor flag.
When a relay applies something on another user's behalf, thread that user through EVERY identity the applied work records, not just the one it authorizes against.
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
- **The first write to a `world`-scoped setting is a `create`, not an `update`.** `ClientSettings#setWorld` only calls `current.update(...)` when a `Setting` document already exists; `get()` synthesises an `_id`-less document when nothing is stored, so the very first `game.settings.set` for a given key fires `createSetting` and never `updateSetting`.
Any module reacting to a world setting must listen on **both** hooks, and the two do not share a signature: `createSetting` emits `(doc, options, userId)`, `updateSetting` emits `(doc, change, options, userId)` — a handler written as `(setting, changed) => …` receives `options` in `changed` on the create leg.
Verified against Foundry 13.351 and 14.361 (issue 1024).
- **A registered `onChange` and a `Hooks.on` listener for the same setting BOTH fire, redundantly.** `Setting._onCreate`/`_onUpdate` invoke the registered `onChange` directly, then `Hooks.callAll` runs on the same document in the same callback — so registering both for one setting double-runs whatever they drive (e.g. two full world scans and two notifications per save).
Pick one.
A throw inside `onChange` escapes and kills the batch's broadcast entirely, whereas a throw inside a `Hooks.on` listener is caught by `Hooks.#call` and routed to `Hooks.onError`, so a `Hooks.on` listener is the safer place for a fallible reaction.
Verified against Foundry 13.351 and 14.361 (issue 1024).
- **`SETTINGS_MODIFY` changed shape between V13 and V14.** V13 declares `disableGM: false` and no `requiredRoles`; V14 adds `requiredRoles: [GAMEMASTER]`, and a new CASE 1 in `User#hasPermission` makes the permission UNREVOKABLE for a GM specifically (not exclusive to a GM — any other role a GM grants it to still holds it too).
`defaultRole: ASSISTANT` is unchanged in both versions.
`restricted: true` on `registerMenu` is a display gate only (`SettingsConfig._prepareCategoryData` hides the entry from a user lacking `SETTINGS_MODIFY`); the real write gate is always `BaseSetting.#canModify` -> `user.hasPermission('SETTINGS_MODIFY')`.
Verified against Foundry 13.351 and 14.361 (issue 1024).
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
- **`foundry.utils.setProperty` vivifies an intermediate only when core decides it is absent, so a `null` or primitive intermediate THROWS instead of being replaced — but the two supported builds decide "absent" differently.** On V14.361 `common/utils/helpers.mjs`'s traversal step tests `target[p] === undefined` before descending, a VALUE check; on V13.351 the same traversal step tests `!(p in target)`, a PRESENCE check.
The reachable production outcome is unchanged on both builds: a `null` intermediate is traversed INTO and a primitive intermediate is assigned ONTO, and both THROW — on V13 because `in` against a non-object throws immediately, on V14 because assignment onto a primitive throws in strict mode — so the guard described below is required on both.
The one build-specific divergence needs a literal `undefined` VALUE sitting at an intermediate key (not absent, not `null`), which is reachable only from a hand-built object, never from real Item/Actor data: V13 finds `p in target === true`, does not vivify, and throws descending into `undefined`, while V14 vivifies and succeeds.
A hand-rolled test fixture or macro-authored object proving vivification here on one build proves nothing about the other; see the test-double warning below for why a fixture that is looser than core hides this class of defect rather than catching it.
Item data built from `Item#toObject()` presents the null/primitive shapes as the NORM, not the exception (a `null` container field, an integer quantity field), so any dotted write into it from GM- or macro-authored data needs its own guard — an unguarded write can abort mid-operation AFTER earlier side effects (consumption, currency, tool wear) have already committed, not merely fail cleanly at the write.
`foundry.utils.setProperty` also silently REFUSES `__proto__`, `constructor`, and `prototype` — as the whole key or as any dotted path segment, checked BEFORE the dot split — returning `false` rather than throwing.
See `_applyEssencePropertyUpdates` in `src/systems/CraftingEngine.js` for the guarded pattern.
- **`fromUuid` can REJECT, not just resolve to `null`.** An invalid embedded-document segment throws out of `getEmbeddedCollection`, and a compendium uuid performs a server round-trip that can fail outright.
Always wrap it in `try`/`catch`: a bare `await fromUuid(uuid)` with no guard turns an ordinary broken or unresolvable reference into an unhandled rejection instead of a `null` you can branch on.
See `_runOneEssencePropertyMacro` in `src/systems/CraftingEngine.js` (`try { macro = await fromUuid(macroUuid); } catch { macro = null; }`).
- **A Foundry `Macro` defaults to `type: "chat"`, and `command` is a required `StringField` on BOTH types**, so `typeof macro.command === 'string'` is a presence check, never proof the command is a script.
`Macro#validateJoint` syntax-validates `command` as JavaScript only when `type === 'script'` (verified against Foundry 14.361), so a chat macro's `command` is guaranteed-unvalidated text that still passes a bare string-typeof guard.
A drop-handler check that inspects the dragged payload's type guards only newly authored links; an imported system, a hand-edited world setting, or a macro whose own type the GM changes AFTER linking all reach runtime unguarded, so a consumer that compiles `command` as JavaScript (`MacroExecutor.run`) needs its own `macro.type !== 'script'` backstop at the point it resolves the macro, not only at the point the link is authored.
See `_runOneEssencePropertyMacro` in `src/systems/CraftingEngine.js`.
- **A whispered `ChatMessage` that carries `rolls` is VISIBLE to every client**, because `visible` tests `isRoll` BEFORE it tests the whisper list.
The getter is `if ( this.whisper.length ) { if ( this.isRoll ) return true; ... }` (`client/documents/chat-message.mjs`; the quoted branch and its ordering are identical on 13.351 and 14.365, and only the elided tail differs cosmetically — 13 uses `indexOf(...) !== -1`, 14 uses `includes(...)`), so `whisper: [gmId]` plus a non-empty `rolls` renders the card in every player's sidebar.
Two consequences, and both are design constraints rather than bugs to fix: a **GM-only card must carry no rolls at all**, and a **GM-only roll discloses its own existence** by design — core's Private GM Roll behaves the same way, showing every player that a hidden roll happened while `isContentVisible` hides the formula and total.
So a feature that wants a private roll AND a private card needs two messages: a rolled one the players see the existence of, and a roll-free whispered one carrying the prose.
- **Foundry does not scope whispers SERVER-side; `visible` and `isContentVisible` are purely presentational.**
The document is broadcast in full to every connected client: `ChatMessage.metadata.permissions` declares only `create` and `delete` and no view predicate (`common/documents/chat-message.mjs`), and the server-side subclass adds only migrations and a timestamp default with no recipient projection (`dist/database/documents/chat-message.mjs`, 14.365).
A player can therefore read a GM whisper's `content` straight out of `game.messages` in the console.
This is core behaviour and is identical for core's own Private GM Roll, so it is not a Fabricate defect — but it is the honest limit on any claim that a whispered card is a safe home for secret text, and it belongs beside the world-setting disclosure note in `data-models/spec.md` § Component rather than being rediscovered.
Fabricate's `visibility: 'gmOnly'` is therefore a **disclosure** guarantee (no Fabricate surface shows it) and never a **confidentiality** guarantee.
- **A test double for a Foundry util must match the REAL helper's edge semantics, not just its happy path.** A stub LOOSER than core produces false passes, which is the direction nobody notices under `npm test`: the essence-macro test fixtures' hand-rolled `setProperty` stub vivified on `== null` (replacing a `null` intermediate with `{}`, where real Foundry throws) and omitted core's `__proto__`/`constructor`/`prototype` refusal, so no test built on that stub could ever fail on the `setProperty` defect above while the real code aborted crafts in production.
See `tests/helpers/essenceFixtures.js`.
- **Foundry's LIGHT application theme changes almost nothing about a Fabricate window, so a light-theme screenshot that looks dark is correct rather than broken.**
Foundry themes by body class (`Game##configureUI` adds `theme-light`), and its light theme keeps a DARK window header: `.window-header .window-title` resolves to `--color-light-1` under both themes because neither theme block redefines that token.
That was probed in core's `css/foundry2.css` at V14.361 while the smoke and the harvested lab chrome pin 14.365, and a plain checkout carries no copy of that stylesheet, so re-checking it needs a chrome harvest (`scripts/lib/foundryChromeCache.js`).
Fabricate overrides the rest at BOTH window roots, which is easy to get wrong because the two windows are built differently: `.fabricate.fabricate-app` in `styles/fabricate.css` sets `background: var(--fab-bg-1)`, `color: var(--fab-text)` and `color-scheme: dark`, while `.fabricate.crafting-system-manager` sets only `font-family` and makes its `.window-content` transparent so the inner `.fabricate-manager` root paints instead (`color: var(--fab-mv2-text)`, `background: var(--fab-mv2-bg)`, `color-scheme: dark`).
An unlayered module stylesheet loads at `layer(modules)`, which outranks core's `layer(applications)`, so core's light parchment background never paints, and all seven `[data-fabricate-theme]` palettes in `styles/fabricate.css` are dark (their id set is `FABRICATE_THEME_IDS` in `src/ui/theme.js`).
The visible light-versus-dark difference is the window header bar, which is why the `coverage-theme-light-player` and `coverage-theme-light-manager` View Lab cases in `scripts/lib/viewLabCases.js` publish dark-looking frames by design.
This does NOT mean the light theme leaks nothing into Fabricate, and the mechanism that protects those two frames is INHERITANCE rather than per-component colour: the headline heading of each declares no `color` at all — `h2.manager-title` from `src/ui/svelte/apps/manager/SystemsBrowserView.svelte`, which has no style block, and `h2.crafting-detail-name` from `src/ui/svelte/apps/crafting/RecipeDetailHeader.svelte` — and each inherits its colour from a Fabricate ancestor inside `.window-content`, which sits closer to the heading than anything core sets on the window frame or the body.
For the manager that ancestor is the root itself, `.fabricate-manager`; for the player the shell root `.fabricate-app-shell` in `src/ui/svelte/apps/FabricateAppRoot.svelte` sets `color: var(--fab-text)` for every tab, while on the crafting tab a nearer rule — `.crafting-view-grid` in `src/ui/svelte/apps/crafting/CraftingView.svelte` — re-declares the same value, so either one would do the job.
A Fabricate surface therefore leaks exactly when no Fabricate root colour covers it, which is the leak issue 972 owns, or when core sets a colour on the element itself rather than on an ancestor.
Whether core does the latter for `h1`–`h6` under `theme-light` is unverified and needs the harvested `foundry2.css` above to settle.
- **Hook listeners fire in REGISTRATION order, which is module-script EXECUTION order — not `module.json` declaration order and not `relationships.requires` order.**
Foundry orders a world's `esmodules` first by the `library` manifest flag (a `library: true` package's scripts execute at internal priority 4, ahead of the game system at priority 6, a non-`library` module at priority 8, and the world's own scripts at priority 10) and then, among packages at the same priority, by WORLD MODULE-COLLECTION order; `relationships.requires` does not influence load order at all, however strongly it reads as a dependency declaration (issue 1289, verified against source rather than inferred).
Fabricate declares no `library` flag, by decision: raising one WOULD close the ordering gap against a non-`library` companion — priority sort is stable, so every priority-4 esmodule runs before every priority-8 one, meaning `bindFabricateGlobal()` would then execute before a normal companion's `init` body — but Foundry defines the flag to mean a package "provides no user-facing functionality and is solely for use by other modules" (`common/packages/_types.mjs`), which Fabricate is not, so setting it would be a manifest lie and would additionally reorder Fabricate ahead of the game system, not a position a crafting module should take; `module.json` is on `HIGH_RISK_PATHS`, so that trade is declined regardless, and the residual gap against another `library: true` package would remain in any case.
The consequence for anything assigned onto `game.fabricate`: **nothing there is guaranteed readable from another module's `init`.**
A companion sorting ahead of Fabricate in its world's module collection reads `game.fabricate` as `undefined` at its own `init` — not as a descriptor with an unreadable field — because `bindFabricateGlobal()` is the line that CREATES `game.fabricate`, and it runs from Fabricate's own `init` listener.
A companion MUST read anything Fabricate publishes in `setup` or `ready`, not at its own `init`, and MUST treat an absent `game.fabricate` there as *Fabricate has not loaded yet* and retry — never as *this Fabricate build has no such contract*, and never as a trigger for a degraded path.
- **A `game.fabricate` accessor answering `null` before `initialize()` has run is a fact about the underlying FIELD, not something each accessor's own code checks.**
`craftingEngine`, `actorInventoryCoinSpender`, and `actorPropertyCoinSpender` are all initialised to `null` in the `Fabricate` constructor and reassigned exactly once, inside `initialize()`; `getCurrencyConfigStore()` instead normalizes with `?? null` on every read.
Verified at all four sites individually rather than assumed to generalise from one (issue 1289): none of the four getters — `getCraftingEngine`, `getActorPropertyCoinSpender`, `getActorInventoryCoinSpender`, `getCurrencyConfigStore` — is `_requireReady()`-gated, so a pre-readiness call never throws and always answers `null`, never an unrelated live object and never an exception.
Do not add a readiness guard to one of these accessors on the assumption the others already have one, and do not remove the guardless pattern from a new sibling accessor expecting one to already exist elsewhere: none does, by design.
The throw belongs to a caller that needs a value NOW (`_requireReady()`); a `null`-before-readiness accessor exists precisely so a companion can read it defensively without wrapping every read in a `whenReady()` gate.
- **V14 retired the `rollMode` chat vocabulary in favour of `messageMode`.**
On 14.365 `core.rollMode` survives only as a deprecated shim setting, registered in `client/game.mjs`, that maps `core.messageMode` back to a legacy string, so any read of it returns a truthy value and trips `Roll#toMessage`'s own deprecation warning in `client/dice/roll.mjs` — which carries **no `once`**, so it fires once per roll rather than once per session, unlike the setting-read warning itself, which **is** `{once: true}`.
Do not conflate the two: reading the setting warns once per session; the truthy value it hands to `Roll#toMessage` then warns again on every single roll, which is the one that matters for a bulk resolve.
An unrecognised mode also changes failure shape across the boundary: on 13.351 `ChatMessage.applyRollMode` falls back to a GM whisper, while on 14.365 `applyMode` throws on `CONFIG.ChatMessage.modes[mode]` being undefined.
Both fail safe on Fabricate's own check-roll path regardless, because the chat post is wrapped in a swallowed-error guard (`checkRoll.js`), so the roll still returns a valid total and only the chat message is lost.
This narrows any future fix to threading `messageMode` instead of `rollMode`, not merely silencing the warning (issue 1293; reported by Foundry review, core source not in this tree).
- **`Localization#format` is a real, separately-declared method on V13 and a bare alias of `localize` on V14, with no deprecation warning either way.**
On V13.351, `client/helpers/localization.mjs` declares `format(stringId, data={})` as its own method, calling `this.localize(stringId)` internally, and its `localize(stringId)` takes no `data` argument at all.
On V14.365 the class declares only `localize(stringId, data)` — which now accepts `data` itself — and `format` is not declared as a method anywhere in the class body; it survives solely because the module ends with `Object.defineProperties(Localization.prototype, {format: {value: Localization.prototype.localize}})`, a non-enumerable alias pointing at the same function as `localize`.
So `i18n.format(key, data)` in `src/ui/svelte/util/foundryBridge.js` is correct on both supported builds today, but "modernising" it to `i18n.localize(key, data)` would silently break on V13.351, where `localize` ignores a second argument.
Do not collapse the two calls into one without re-checking both builds' declared signatures.
- **A Foundry document write is judged by its RETURN VALUE, not by whether it threw.**
`createEmbeddedDocuments` resolves `[]` — not a rejection — when the document constructor throws on a bad payload, when `_preCreate` returns `false`, when a `preCreate<Type>` hook returns `false`, or when `_preCreateOperation` returns `false`; the client drops each such document with a `continue` and returns early on an empty batch (`client/data/client-backend.mjs`, `#preCreateDocumentArray` / `_createDocuments`, identical at 13.351 and 14.365).
Only the constructor-throw case is additionally reported to the user, through `Hooks.onError(..., { notify: 'error' })`; the other three are `console.debug` only, and `_preCreate` returning `false` is indistinguishable from a hook returning `false` because both drop the document by that same `continue`.
`Document#update` resolves `undefined` when the whole diff is empty — which a single off-schema key is enough to produce, since `SchemaField` prunes keys that are not in the data model — and it does so **at the default `diff: true`**, which is what `operation.diff ??= true` supplies.
BOTH builds gate that drop on `diff`: 13.351 nests the empty-diff `continue` inside an `if ( options.diff )` block in `#preUpdateDocumentArray`, and 14.365 flattens the same gate into one conjunction, which is a syntactic refactor rather than a behavioural difference.
So `{ diff: false }` sends the full payload and resolves the document at either build, and the caveat is needed at both ends rather than at 14 alone.
A write REJECTS only for a server-side refusal, via `SocketInterface.dispatch`, which means the write did not happen.
At V14 both returns are additionally filtered by `response.sideEffect`, which defaults `false` and is never set anywhere in the client bundle, so it is server-driven and whether a plain embedded create could ever come back marked is **unverified** from source.
The consequence for any caller reporting an amount: derive it from what the write returned, never from the request.
- **A `Macro`'s `command` is a `StringField({ required: true, blank: true })` on EVERY macro type, so `typeof command === 'string'` does not mean "this is a script macro".**
A `chat`-type macro passes that guard and has its chat text compiled as JavaScript by `MacroExecutor.run` (`src/utils/MacroExecutor.js`), so it throws for any body that is not also valid JS.
Discriminating script from chat is therefore a **call-site** job, and deliberately not centralised: `MacroExecutor`'s own module docblock (`src/utils/MacroExecutor.js`) records that centralising it would turn a chat-type essence property macro from a silent `console.warn` into a per-essence-per-result error notification, and `tests/macro-executor.test.js` pins that decision as the ABSENCE of `/\.type\b/` and `/script/i` from the module's comment-stripped source.
A call site that needs the distinction resolves the uuid itself and gates on `macro.type === 'script'` before delegating — the resolve-then-gate idiom — rather than discovering the problem from a `SyntaxError` after the fact.
- **A synthetic (unlinked-token) actor carries the BASE actor's `_id`**, so `game.actors.get(id)` silently answers the world prototype and an id cannot disambiguate two tokens of one actor even in principle.
`BaseActorDelta.applyDelta` takes `baseActor.toObject()` and deletes only the DELTA's `_id` before constructing the Actor, byte-identical at 13.351 and 14.365, and `ActorDelta#_initialize` asserts the same invariant by rebuilding whenever `syntheticActor?.id !== parent.actorId`.
Foundry's own handle for one is `fromUuid("Scene.<id>.Token.<id>.Actor.<baseActorId>")`: `TokenDocument#getEmbeddedCollection("Actor")` answers `this.actors` keyed by `this.actorId`, and `buildUuid` composes exactly that path.
Only ADDRESSING is the gap — writes route correctly, because `#adjustActorDeltaRequest` rewrites `operation.parentUuid` to `token.delta.uuid` for any embedded write whose parent has a `TokenDocument` ancestor, byte-identical at both builds.
On 14.365 `TokenDocument#actor` gained an `isLazyDelta && _preventActorDeltaAccess` early return, so it can answer `null` where 13.351 always answered the synthetic actor.
- **Reading back a stack quantity reads PREPARED data, not `_source`**, so a re-read is a weaker signal than the write's own return.
`probeStackQuantityPath`'s `'schema-discard'` verdict exists for exactly this divergence (`probeStackQuantityPath` in `src/systems/itemStackQuantity.js`): `SchemaField._cleanType` deletes keys that are not in the schema, so an off-schema write is discarded while a value some other module or active effect put at the same path still reads fine on the prepared document — and a system whose data preparation recomputes the path masks a successful `_source` write from the other direction.
Prefer a write's own return when asking "did my write land", and prefer `_source` where a re-read is unavoidable.
One generalisation to resist while doing so: the decisive axis is what a value RESOLVES AGAINST, never where it was declared.
The CSS counter-example makes the same point one layer over — the `font` / `--button-size` argument does not transfer to fields, because `2em` resolves against the using element's own font size while `2rem` is root-relative and would not move even if it were declared on the element, so the UNIT is what decides and the declaration site is not.
- Update compatibility metadata if new Foundry API requirements are introduced.

## Architecture Pointers

These deep-dive notes explain layered patterns and data-model subtleties that aren't obvious from reading any single file.
Treat the cited file paths as **load-bearing**: when a change touches a path mentioned in a note, update the note in the same change — stale citations defeat the whole point.
Cite code by symbol name and file path only — for example `_playerListingFields` in `src/systems/GatheringListingBuilder.js`, locatable with `grep -n` — never by line number; `npm run validate:agents` rejects `file.js:NNN`-style citations because they rot silently as code moves.

Some contributor-workflow deep-dives moved into `CONTRIBUTING.md`: the Foundry smoke harness (`npm run test:foundry` phases, outputs, Phase D0 selector drift) is the "Foundry integration (smoke) tests" section; UI PR screenshot evidence is the "UI PR screenshot evidence" section; the Foundry-vs-Fabricate CSS override map (button layout, focus rings, specificity ladder) is the "Foundry vs Fabricate CSS overrides" section.
Interrupted or stale per-worktree smoke recovery is defined in `.agents/skills/fabricate-orchestrator/references/foundry-smoke-lifecycle.md`.

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

### Reference-led redesign and design-system migration

Non-trivial UI work follows `.agents/skills/fabricate-ux-designer/references/visual-evidence-and-reuse.md`.
Open every supplied artifact, assign authority per control and state, record dimensions and expected deviations, inventory shipped siblings and primitives before plan approval, and compare rendered output rather than source declarations.
The shipped primitive catalog and semantic-slider geometry live in `.agents/skills/fabricate-ux-designer/references/design-system.md`.

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

Each row below is one **binding**, so a model-tiered family occupies three rows that share one canonical skill and differ only by model pin.
[Model tier routing](#model-tier-routing) explains how the driver picks which of the three a given spawn uses.

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

`fabricate_pr_explorer` is read-only codebase mapping; Claude uses its built-in `Explore` agent
for the same role rather than a dedicated binding.

### Family to model tiers

The auto-spawn routing table keeps **family** tokens, while every row of the bindings table above is a binding token, so this table is the join between them.
For a model-tiered family it is the sole path from a routing token to a `subagent_type`, so `npm run validate:agents` gates its family set against the base families derived from the bindings table and requires each row to name exactly that family's three model-tiered tokens.

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
- Patch dead UI / config / code branches as a workaround.
When a control has nothing useful to configure or a code path has no remaining purpose, propose wholesale removal first.
- Add static cloud credentials (e.g. AWS access keys) to CI.
Automation/agent workflows authenticate to cloud via OIDC role assumption (`aws-actions/configure-aws-credentials` + `id-token: write`) using a dedicated least-privilege role scoped to the task — never the release/production role. `pull_request_target` jobs must check out only the base ref and never execute PR-head code.
See the "Screenshot publishing infrastructure" section in `CONTRIBUTING.md` for the screenshot-publishing role/policy example.
