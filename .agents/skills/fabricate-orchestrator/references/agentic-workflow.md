# Agentic workflow reference

`AGENTS.md` keeps the workflow's rules and links to each section of this procedure.

## Planning & Workflow

- Plans touching shared scripts (smoke test, build, lint, anything in `scripts/` invoked from `package.json`) must spell out the behavior in both CI and local dev explicitly — don't bury one as a parenthetical.
- Every `### Tasks` entry in the delta declares a literal `Lane surface: new-module | new-export | persisted-shape | none` field, because model-tier rule 2 reads it as a lookup at spawn time; see [Model tier routing](#model-tier-routing).
- When the work originates from an existing issue, append the delta block and preserve the reporter's original text; when it originates from a prompt with no issue, create one from the `OpenSpec Change Delta` issue template.
- Read your assigned issue using the GitHub CLI before implementation work starts.
- Use GitHub issue numbers such as `#42` when an issue exists; treat legacy `T-XXX` IDs as reference only.
- Route quick-start documentation changes to `docs/help/quickstart.md` only.
- Non-trivial UI plans include a `Reference surfaces / reuse inventory` and follow `.agents/skills/fabricate-ux-designer/references/visual-evidence-and-reuse.md`.
- **Batch siblings that share an exact-count ledger.** Two issues whose planned path sets both touch the same pinned ledger — `tests/components/design-system-known-debt.json`, `tests/components/selector-repetition-baseline.json`, `tests/components/spacing-known-literals.json`, `tests/components/control-height-known-literals.js`, or the View Lab registry-total prose that `tests/view-lab-cases.test.js` pins — are planned as ONE delta and delivered as one PR chain, with the phases ordered so each commit boundary re-derives the pins once.
Planned separately, every one of those PRs restacks onto the other's merge and re-derives the same pins again, which is pure overhead with no review value.
The four ratchet ledgers issue #1656 added — `tests/comment-share-ledger.txt`, `tests/file-size-ledger.txt`, `tests/source-pin-ledger.txt` and `tests/foundry-global-reads-ledger.txt` — are ceiling gates whose rows change only when a unit crosses its ceiling, so lanes that share them no longer need one rail (issue #1914).

### OpenSpec

For non-trivial work, use the OpenSpec workflow:

- canonical specs: `openspec/specs/*/spec.md` — the only versioned spec source of truth
- per-change delta: a managed `openspec-delta` block in the work's GitHub issue (proposal, design, tasks, spec deltas, roster, acceptance), not versioned files.
  Append it to an existing issue (preserving the reporter's text) or create one from the `OpenSpec Change Delta` issue template for prompt-driven work.
See `openspec/README.md`.
- implementation makes the canonical spec changes the delta requires under `openspec/specs/`;
  post-implementation and docs reviewers reconcile the `openspec/specs/` diff against the issue delta.

## Default Agentic Workflow

For non-trivial work, run the **Default Agentic Workflow** in `AGENTS.md` — the `plan → plan-review → implement → review → docs` state machine — without waiting to be asked.
At each gate, spawn the roles matched by that file's auto-spawn routing table using the Agent tool: the `subagent_type` for each binding is listed in the **Agent Roles & Bindings** table in `AGENTS.md`.

The routing tokens below (`fabricate_orchestrator`, etc.) are provider-neutral role identifiers.
A routing token names a role **family**, not a binding, so it does not always resolve directly to one.
A routing token names a role family, so the join runs one of two ways.
An untiered family resolves directly, as in `fabricate_orchestrator` → `fabricate-orchestrator`.
A model-tiered family resolves through the **Model tier routing** ladder in `AGENTS.md` — which picks one of `small` / `medium` / `large` per spawn, from the `(family token, stage, revision)` triple — and then through the **Family to model tiers** table, as in `fabricate_implementer` at `small` → `fabricate_implementer_small` → `fabricate-implementer-small`.
Either way the auto-spawn workflow behaves the same regardless of which assistant is driving.
The one exception is the read-only `fabricate_pr_explorer` mapping role: Claude uses its built-in `Explore` agent rather than a dedicated binding (see the table below).
These subagents are registered in `.claude/agents/`; for the read-only `fabricate_pr_explorer` role, use the built-in `Explore` agent.

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

Worked examples:

- A change touching `src/ui/svelte/apps/manager/EnvironmentEditView.svelte` and `lang/en.json` matches the always row, the UI row (`**/*.svelte`), and the domain row (`lang/**`): plan-review runs `fabricate_ux_designer` and `fabricate_domain_expert`, post-implementation review runs `fabricate_reviewer` and `fabricate_ux_designer`, and the docs loop runs `fabricate_docs_writer` with `fabricate_domain_expert`.
- A change touching `src/systems/GatheringEngine.js` and `tests/gathering-engine-listing.test.js` matches the always row, the domain row (`src/systems/**`), and the tests row (`tests/**`); `foundry_integrator` joins only when the diff also adds or edits one of the Foundry identifiers above.

### Model tier routing

Every routing token above names a role **family**, not a binding.
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

After round one the driver applies every mechanical finding itself — a finding that names exact replacement text, an anchor, a count, or a roster entry — into the next revision of the delta or the branch, and spawns a further round only as a *confirmation round*: disposition-only, scoped to the roles whose findings were not mechanical or whose `HIGH` finding the driver disputes, at model tier `medium` (see the confirmation-round override under [Model tier routing](#model-tier-routing)).
A role whose round-one findings were all `LOW`, or none, is not re-spawned; the driver confirms its concern from evidence — the gate run, the artifact, the mutation control — and records that in the handoff.
Findings carry a severity — `HIGH` (the change would ship a defect or red a gate), `MEDIUM` (a decision is wrong or unjustified), `LOW` (wording, an anchor, a count) — and every review role grades by that scale; the quality engineer's severity guide in `.agents/skills/fabricate-quality-engineer/SKILL.md` is the same three rungs applied to defects.
A loop's acceptance condition is therefore that every finding is applied or dispositioned, not that a fresh `APPROVED` exists for the final artifact; the approval of record at [Final maintainer handoff](#final-maintainer-handoff) is the last round's verdict plus the driver's recorded disposition of the findings it applied, and a `BLOCKED` verdict is never self-cleared.
Rounds two and three therefore exist for disputed or non-mechanical findings, not as a second reading of the whole plan or diff, and the three-revision cap is the stop condition rather than the expected path.
Run plan-review reviewers in parallel ONCE; apply the mechanical findings yourself; spawn a further round only as a disposition-only confirmation round at model tier `medium`, per the **Iteration cycles** and the confirmation-round override in `AGENTS.md`; honor the 3-revision caps as stop conditions; and surface any `BLOCKED` verdict to the user.

In every loop, reviewers return their verdicts to the driver, which acts on them and summarizes outcomes to the user.
Reviewers do not post verdicts (or other workflow notes) as GitHub issue or PR comments.

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
Follow the detailed final-delivery procedure in `.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md`.
It preserves ready state through rebases and fixes, reuses a complete full check attempt for the exact head regardless of draft state, and retains the required local gates, review evidence, explicit lease, current-main ancestry, both SonarCloud checks, and ready handoff state.

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

## Git Conventions

- Before editing, the driver verifies the coordinator branch, and every mutable spawned agent verifies the branch and base in its assignment (`git branch --show-current` and `git rev-parse HEAD`).
If the coordinator is on `main`, the driver creates or switches to a task branch before fan-out; a spawned agent treats any lane identity mismatch as blocked.
Re-check after any integration or merge because the expected branch or SHA may have changed.
- When a spawned agent completes work, it commits only owned paths locally and returns the commits to the driver without pushing or opening a PR.
The driver verifies and integrates lane commits, then pushes the integration branch and opens or updates the PR targeting `main`.
- Respond to review feedback through a valid retained lane or a fresh revision lane, then update the same integration branch and PR; do not open replacement PRs unless the user asks.
- When review is required, review-only agents inspect fresh detached snapshots of the exact assigned integration commit against an immutable artifact and must not commit, push, merge, or mutate GitHub state.
- Before maintainer handoff, complete the final-delivery procedure in `.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md`.

## Agent Roles & Bindings

Shared project skills live in `.agents/skills/` (the canonical persona definition for each role lives in `.agents/skills/<role>/SKILL.md`).
Use those shared skills instead of creating provider-local copies or provider-specific mirrors; see the bindings table in `AGENTS.md`.
The default workflow above auto-spawns these roles based on change signals; explicit requests are only required for roles the routing table does not cover.

[Model tier routing](#model-tier-routing) explains how the driver picks which of the three a given spawn uses.

`fabricate_pr_explorer` is read-only codebase mapping; Claude uses its built-in `Explore` agent for the same role rather than a dedicated binding.

### Family to model tiers

For a model-tiered family it is the sole path from a routing token to a `subagent_type`, so `npm run validate:agents` gates its family set against the base families derived from the bindings table and requires each row to name exactly that family's three model-tiered tokens.
