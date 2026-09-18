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
- **Batch siblings that share an exact-count ledger.** Two issues whose planned path sets both touch the same pinned ledger — `tests/components/design-system-known-debt.json`, `tests/components/selector-repetition-baseline.json`, `tests/components/spacing-known-literals.json`, `tests/components/control-height-known-literals.js`, or the View Lab registry-total prose that `tests/view-lab-cases.test.js` pins — are planned as ONE delta and delivered as one PR chain, with the phases ordered so each commit boundary re-derives the pins once.
Planned separately, every one of those PRs restacks onto the other's merge and re-derives the same pins again, which is pure overhead with no review value.
The four ratchet ledgers issue #1656 added are covered by the same rule: `tests/comment-share-ledger.txt`, `tests/file-size-ledger.txt`, `tests/source-pin-ledger.txt` and `tests/foundry-global-reads-ledger.txt`.
`tests/comment-share-ledger.txt` collides the most widely because it buckets per directory rather than per file, so two lanes touching comments in unrelated trees still rewrite the same rows — a lane that edited only `tests/` moved two of them.

### OpenSpec

For non-trivial work, use the OpenSpec workflow:

- canonical specs: `openspec/specs/*/spec.md` — the only versioned spec source of truth
- per-change delta: a managed `openspec-delta` block in the work's GitHub issue (proposal, design, tasks, spec deltas, roster, acceptance), not versioned files.
  Append it to an existing issue (preserving the reporter's text) or create one from the `OpenSpec Change Delta` issue template for prompt-driven work.
See `openspec/README.md`.
- implementation makes the canonical spec changes the delta requires under `openspec/specs/`;
  post-implementation and docs reviewers reconcile the `openspec/specs/` diff against the issue delta.

## Default Agentic Workflow

Non-trivial work runs as a `plan → plan-review → implement → review → docs` state machine, with iteration until each gate accepts.
For non-trivial work, run the **Default Agentic Workflow** in `AGENTS.md` — the `plan → plan-review → implement → review → docs` state machine — without waiting to be asked.
Stages auto-spawn role-specific subagents based on the change signals below — agents do not need to be requested by name.
At each gate, spawn the roles matched by that file's auto-spawn routing table using the Agent tool: the `subagent_type` for each binding is listed in the **Agent Roles & Bindings** table in `AGENTS.md`.
Subagents not matched by the routing table only run when explicitly requested.

The routing tokens below (`fabricate_orchestrator`, etc.) are provider-neutral role identifiers.
A routing token names a role **family**, not a binding, so it does not always resolve directly to one.
A routing token names a role family, so the join runs one of two ways.
An untiered family resolves directly to a registered agent in **both** providers — `.codex/agents/*.toml` for Codex and `.claude/agents/*.md` for Claude (spawned via the Agent tool using the `subagent_type` in [Agent Roles & Bindings](#agent-roles--bindings)).
An untiered family resolves directly, as in `fabricate_orchestrator` → `fabricate-orchestrator`.
A model-tiered family resolves through per-spawn model-tier selection (see [Model tier routing](#model-tier-routing)) to exactly one model-tiered binding in each active provider, found through the `Family` table in [Agent Roles & Bindings](#agent-roles--bindings).
A model-tiered family resolves through the **Model tier routing** ladder in `AGENTS.md` — which picks one of `small` / `medium` / `large` per spawn, from the `(family token, stage, revision)` triple — and then through the **Family to model tiers** table, as in `fabricate_implementer` at `small` → `fabricate_implementer_small` → `fabricate-implementer-small`.
Either way the auto-spawn workflow behaves the same regardless of which assistant is driving.
The one exception is the read-only `fabricate_pr_explorer` mapping role: Claude uses its built-in `Explore` agent rather than a dedicated binding (see the table below).
These subagents are registered in `.claude/agents/`; for the read-only `fabricate_pr_explorer` role, use the built-in `Explore` agent.

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
**Parallel lanes only where the path sets are disjoint.** The driver runs two changes as parallel lanes or teams only when neither touches the other's pinned ledgers, shared stylesheet regions, or registry-total prose; changes that share any of those run on one rail, sequenced, because each concurrent PR costs a restack with conflict resolution and pin re-derivation at the tip, and that restack has cost more than the parallelism saved.
Prune a path-signal role whose row fired on prose alone at the post-implementation review and docs stages, batch issues that share an exact-count ledger into one delta, and serialise lanes whose path sets are not disjoint, as `AGENTS.md` directs.

### Isolated worktree execution

Every spawned role works in its own Git worktree by default so independent workstreams do not share a mutable checkout.
The main loop is the workflow driver and creates a unique isolated worktree for every spawned role by default; mutable roles use exclusive lane branches and read-only roles use fresh detached snapshots for each reviewed commit.
The workflow driver owns the clean coordinator checkout and integration branch, GitHub and remote mutations, lane lifecycle, integration, authoritative gates, and guarded cleanup.
The driver alone mutates the coordinator checkout, GitHub or remote state, integrates local lane commits, runs authoritative gates, and performs guarded cleanup.
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
Use the provider-neutral lifecycle in `.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md`; do not create a Claude-specific worktree convention.

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
src/systems/remapWorldScopeIdentityFlags.js
src/systems/restampOwnedItemComponentIdentity.js
src/systems/worldScopeReferenceRewrite.js
scripts/**
.github/workflows/**
release.config.js
release.s3.config.json
AGENTS.md
CLAUDE.md
.agents/skills/**
.agents/docs/**
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

- A lane's model tier never decreases across revisions of the same `(family, stage)`; a disposition-only confirmation round is exempt, per the override below.
The floor is the **highest model tier at which the lane actually executed** in a previous revision — not the model tier it was originally resolved to.
Without this, a lane that resolved `small`, escalated, and completed at `medium` would re-resolve to `small` from the same unchanged facts next revision and pay the identical wasted spawn again, since the ladder itself has no memory.
- A revision carrying an unresolved finding forward is floored one model tier above the previous revision's executed model tier.
- A lane whose keyed path set includes `openspec/specs/**` floors at `medium`.

**Confirmation-round override.**
A review role spawned into a read-only lane — `fabricate_reviewer`, `fabricate_ux_designer`, `fabricate_quality_engineer`, `fabricate_domain_expert`, `foundry_integrator` — at revision 2 or later, with a brief marked *disposition-only* (the assignment-brief field in `.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md`), resolves `medium`, overriding rules 1 to 4 and both revision floors above.
Its scope is fixed by construction: it dispositions its OWN prior findings against a driver-supplied immutable artifact and reports only defects the revision itself introduced, so the reading is narrow whatever the first round's path set was.
A mutable lane never takes the override, `ESCALATE_TIER` stays available to the confirmation spawn, and a confirmation round that returns a NEW `HIGH` finding re-enters the loop as a fresh revision at the ladder's own resolution.
The first round of every loop stays at the ladder's resolution, because that is the round that has to find the defects.
The override is applied by the driver on top of the mechanical ladder; `selectModelTier` in `scripts/lib/agentModelTiers.js` models the ladder and its floors only.

#### `ESCALATE_TIER`

An agent of a model-tiered family that finds its assignment exceeds its model tier returns `ESCALATE_TIER: <reason>` on its first line rather than guessing.
An agent of a model-tiered family may return `ESCALATE_TIER: <reason>` on its first line before its first edit; that is not a verdict, does not consume a revision, and is bounded at one escalation per family, stage, and revision.
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
Record the resolved model tier and the facts it was resolved from in the lane's assignment brief.
See `.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md` for the lane mechanics.

An escalation is pure waste, not partial progress — the second spawn repeats the full orientation cost.
The default-up rule, the executed-model-tier floor, the once-per-revision bound, and the requirement that the driver front-load selection from cheap facts it already holds are what keep the expected cost below the flat-`large` baseline.

### Iteration cycles

Three loops run until acceptance, each capped at 3 revisions before escalating to the user.
**Each loop runs ONE full round by default.**
After round one the driver applies every mechanical finding itself — a finding that names exact replacement text, an anchor, a count, or a roster entry — into the next revision of the delta or the branch, and spawns a further round only as a *confirmation round*: disposition-only, scoped to the roles whose findings were not mechanical or whose `HIGH` finding the driver disputes, at model tier `medium` (see the confirmation-round override under [Model tier routing](#model-tier-routing)).
A role whose round-one findings were all `LOW`, or none, is not re-spawned; the driver confirms its concern from evidence — the gate run, the artifact, the mutation control — and records that in the handoff.
Findings carry a severity — `HIGH` (the change would ship a defect or red a gate), `MEDIUM` (a decision is wrong or unjustified), `LOW` (wording, an anchor, a count) — and every review role grades by that scale; the quality engineer's severity guide in `.agents/skills/fabricate-quality-engineer/SKILL.md` is the same three rungs applied to defects.
A loop's acceptance condition is therefore that every finding is applied or dispositioned, not that a fresh `APPROVED` exists for the final artifact; the approval of record at [Final maintainer handoff](#final-maintainer-handoff) is the last round's verdict plus the driver's recorded disposition of the findings it applied, and a `BLOCKED` verdict is never self-cleared.
Rounds two and three therefore exist for disputed or non-mechanical findings, not as a second reading of the whole plan or diff, and the three-revision cap is the stop condition rather than the expected path.
Run plan-review reviewers in parallel ONCE; apply the mechanical findings yourself; spawn a further round only as a disposition-only confirmation round at model tier `medium`, per the **Iteration cycles** and the confirmation-round override in `AGENTS.md`; honor the 3-revision caps as stop conditions; and surface any `BLOCKED` verdict to the user.

In every loop, reviewers return their verdicts to the driver, which acts on them and summarizes outcomes to the user.
Reviewers do not post verdicts (or other workflow notes) as GitHub issue or PR comments.

The verdict vocabulary is `APPROVED / NEEDS_CHANGES / BLOCKED` (and `DOCS APPROVED / DOCS NEEDS_CHANGES` in the docs loop).
`ESCALATE_TIER: <reason>` is **not** a verdict: it never satisfies a loop's acceptance condition, never counts as `APPROVED`, and is not a `BLOCKED` stop condition.
Only the six model-tiered families may return it; an untiered role has no model tier above it and returns `BLOCKED` with the reason instead.
See [Model tier routing](#model-tier-routing).

1. **Plan review loop.** The driver drafts the OpenSpec delta in the issue's `openspec-delta` block (delegating to a `fabricate_orchestrator` planning agent when useful), then spawns the plan-review agents matched by the routing table.
Each emits `APPROVED / NEEDS_CHANGES / BLOCKED` against the delta, returning its verdict to the driver rather than commenting on the issue.
The driver rewrites the delta block in place, applying the mechanical findings itself, and spawns a confirmation round only for a reviewer whose finding it could not apply mechanically or disputes; when every remaining finding is applied or dispositioned, the plan is accepted and implementation starts.
2. **Implementation review loop.** The driver spawns the implementer to ship changes — including the canonical spec changes under `openspec/specs/` that the delta requires — then spawns `fabricate_reviewer` plus any post-implementation reviewers from the routing table to emit verdicts.
Reviewers compare the actual `openspec/specs/` diff against the proposed delta in the issue and confirm a faithful realization (or flag a justified deviation to reconcile).
The implementer addresses `NEEDS_CHANGES` in one fix lane for every reviewer's findings; the driver then spawns the confirmation round for the roles the rule above retains, confirms the rest from evidence, and proceeds when every finding is resolved or recorded as a Deviation.
3. **Documentation iteration loop.** Triggered whenever the change touches behaviour or any documented API surface.
The driver spawns the paired `fabricate_domain_expert` (updates `DOMAIN.md` and canonical specs against the diff, and reconciles the issue delta — updating it and its `Deviations` note when implementation justifiably diverged) and `fabricate_docs_writer` (updates JSDoc and the Jekyll site to match the shipped canonical spec).
Each then reviews the other's output and emits `DOCS APPROVED / DOCS NEEDS_CHANGES`.
Loop until both approve.

### Final maintainer handoff

Before asking the maintainer to review a PR, the workflow driver completes a final delivery loop from the coordinator checkout.
Before maintainer handoff, the driver finalizes PR metadata, rebases onto fetched `origin/main`, reruns authoritative gates and commitlint, preserves valid approval across a patch-equivalent rebase or obtains fresh detached exact-target review when the owned concern materially changed or a finding remains unresolved, pushes only with an explicit expected-head lease, marks the PR ready, and requires all post-undraft exact-head checks including both SonarCloud checks.
Draft-head checks are preflight evidence only because some CI workflows may run only on the `ready_for_review` event.
Draft checks are preflight only; on failure or a moved main/head, return the PR to draft and repeat the delivery loop.

**The driver runs this loop, including the ready transition, on its own initiative.**
Marking a PR ready is a step the driver owns outright, not a decision to refer upward, so the driver never waits to be told to undraft.
Delivery is only complete when the PR is ready and its exact-head checks are green; a green PR left in draft is unfinished work, not a cautious pause, because draft checks prove nothing about the workflows that run only on `ready_for_review`.
The maintainer's decision point is reviewing and merging the ready PR, and asking them to authorise the transition into that state only moves work back to the person the loop exists to serve.
The ready transition is the driver's own step, so run it without asking: a green PR still sitting in draft has not had its deciding checks run, so it is unfinished, not safely parked.
Ask first only when the user has said to hold, when the change is one the user asked to inspect before it goes out, or when a delivery precondition below cannot be met.
Hold at draft only when the user asked to hold or a delivery precondition is unmet, and say which.

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
- For a view covered by the canonical registry (`scripts/lib/viewLabCases.js`) — which is the normal case, at 485 cases across five windows — the **View Lab** is the producer, and it is what CI runs on every PR push: `node scripts/view-lab-screenshots.mjs apps` renders every case, or pass a comma-separated id list to render a subset, into `ui-screenshot-artifact/apps/`.
Selection is targeted, and no single changed file selects the whole registry: a render file selects the cases whose `sourceMatches` claim it, a broad shared primitive or stylesheet selects a small representative set, and a change to one of the lab's OWN inputs (fixture world, capture driver, registry shared code) selects **surface coverage** — one frame of every route and tab the lab renders, 48 cases — rather than every state of every screen.
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
- `src/ui/model/` holds the Foundry-free view models the UI owns — pure filtering, sorting, pagination, selection and validation logic with no Foundry global and no importer outside `src/ui/`.
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

Each ledger is a ratchet, so the rule is to leave its number lower than you found it, never to spend up to it.

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
Shared project skills live in `.agents/skills/` (the canonical persona definition for each role lives in `.agents/skills/<role>/SKILL.md`).
Both provider agents are **thin bindings** that point at that skill — change behavior in the skill, not in the bindings.
Use those shared skills instead of creating provider-local copies or provider-specific mirrors; see the bindings table in `AGENTS.md`.
The default workflow above auto-spawns these roles based on change signals; explicit requests are only required for roles the routing table does not cover.

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

`fabricate_pr_explorer` is read-only codebase mapping; Claude uses its built-in `Explore` agent for the same role rather than a dedicated binding.

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
- Add a component under `src/ui/svelte/components/` without adding its specimen to `openspec/specs/design-system/library.html` and its row to `scripts/lib/designSystemPrimitives.json` in the same change.
`tests/design-system-coverage.test.js` enforces this: it fails when a file in that directory carries no manifest row, and when the library and the manifest describe different vocabularies.
Equally, do not hand-roll markup for a control the primitive set already owns, and do not introduce a second component that owns half a meaning an existing primitive owns — extend that primitive instead.
- Patch dead UI / config / code branches as a workaround.
When a control has nothing useful to configure or a code path has no remaining purpose, propose wholesale removal first.
- Add static cloud credentials (e.g. AWS access keys) to CI.
Automation/agent workflows authenticate to cloud via OIDC role assumption (`aws-actions/configure-aws-credentials` + `id-token: write`) using a dedicated least-privilege role scoped to the task — never the release/production role. `pull_request_target` jobs must check out only the base ref and never execute PR-head code.
See the "Screenshot publishing infrastructure" section in `CONTRIBUTING.md` for the screenshot-publishing role/policy example.
