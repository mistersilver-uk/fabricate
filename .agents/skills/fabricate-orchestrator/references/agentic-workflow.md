# Agentic workflow reference

`AGENTS.md` keeps the workflow's rules and links to each section of this procedure.

## Planning & Workflow

- Plans touching shared scripts (smoke test, build, lint, anything in `scripts/` invoked from `package.json`) must spell out the behavior in both CI and local dev explicitly — don't bury one as a parenthetical.
- Every `### Tasks` entry in the delta declares a literal `Lane surface: new-module | new-export | public-api | persisted-shape | none` field, because ladder rules 2, 4 and 5 read it as a lookup at spawn time; see [Model tier routing](#model-tier-routing).
- When the work originates from an existing issue, append the delta block and preserve the reporter's original text; when it originates from a prompt with no issue, create one from the `OpenSpec Change Delta` issue template.
- Read your assigned issue using the GitHub CLI before implementation work starts.
- Use GitHub issue numbers such as `#42` when an issue exists; treat legacy `T-XXX` IDs as reference only.
- Route quick-start documentation changes to `docs/help/quickstart.md` only.
- Non-trivial UI plans include a `Reference surfaces / reuse inventory` and follow `.agents/skills/fabricate-ux-designer/references/visual-evidence-and-reuse.md`.
- **Ratchets do not couple sibling issues.** Every quality ratchet computes its baseline from the base commit, so two issues whose planned path sets touch the same ratcheted files share no checked-in rows, and each is planned and delivered on its own.

### OpenSpec

For non-trivial work, use the OpenSpec workflow:

- canonical specs: `openspec/specs/*/spec.md` — the only versioned spec source of truth
- per-change delta: a managed `openspec-delta` block in the work's GitHub issue (proposal, design, tasks, spec deltas, roster, acceptance), not versioned files, created as the Planning & Workflow bullet above directs.
See `openspec/README.md`.
- implementation makes the canonical spec changes the delta requires under `openspec/specs/`;
  post-implementation and docs reviewers reconcile the `openspec/specs/` diff against the issue delta.

## Default Agentic Workflow

This is the procedure for `AGENTS.md`'s Default Agentic Workflow; bindings are in its **Agent Roles & Bindings** table.
Terms such as lane, coordinator checkout and review snapshot are defined under **Terms.** in [`AGENTS.md`](../../../../AGENTS.md#default-agentic-workflow).

The routing tokens below (`fabricate_orchestrator`, etc.) are provider-neutral role identifiers.
A routing token names a role family, so the join runs one of two ways.
An untiered family resolves directly, as in `fabricate_orchestrator` → `fabricate-orchestrator`.
A model-tiered family resolves through [Model tier routing](#model-tier-routing) and then the **Family to model tiers** table, as in `fabricate_implementer` at `small` → `fabricate_implementer_small` → `fabricate-implementer-small`.
Either way, auto-spawn behaves the same whichever assistant is driving.
These subagents are registered in `.claude/agents/`; for the read-only `fabricate_pr_explorer` role, use the built-in `Explore` agent.

### Proportionality and momentum

The workflow driver uses the shortest workflow that satisfies the actual risk and the mandatory repository, safety, review, and exact-head delivery gates, prioritizing the earliest honestly reviewable PR.
One mechanically valid evidence run satisfies every gate it directly covers, so agents do not repeat equivalent checks or reviews ceremonially.
A reviewer repeats only when its owned concern materially changed or an unresolved finding remains; issue or PR metadata edits and patch-equivalent rebases do not invalidate approval.
The driver front-loads cheap checks for branch and base freshness, affected paths and roster, PR title and commitlint, existing CI state, and screenshot scope.
The driver timeboxes delegated lanes: after about 60 seconds without observable progress it requests status once, and after another about 60 seconds it interrupts and reassigns the work or continues locally within driver authority.
**Parallel lanes only where the path sets are disjoint.** The driver runs two changes as parallel lanes or teams only when neither touches the other's shared stylesheet regions; changes that share one run on one rail, sequenced, because each concurrent PR costs a restack with conflict resolution at the tip.
Prune path-signal roles that fired on prose alone per step 5 of [Auto-spawn routing in `AGENTS.md`](../../../../AGENTS.md#auto-spawn-routing).

### Isolated worktree execution

Every spawned role works in its own lane by default so independent workstreams do not share a mutable checkout.
The driver alone owns and mutates the coordinator checkout and integration branch, GitHub and remote state, lane lifecycle, integration of local lane commits, authoritative gates, and guarded cleanup.
That coordinator checkout is itself a worktree created for the task — never the maintainer's primary clone — so integration, authoritative gates, and delivery all run from it and it is disposed under the same guarded cleanup as any lane.
A maintainer's own checkout is never checked out to a task branch and is left as they left it.
The one exception is an explicit maintainer instruction to work in their checkout (usually to watch the change in a running app or test it manually); no agent may assume or grant itself that instruction.
It covers only the task it was given for, never becomes the default, and still requires confirming and reporting that checkout's current branch and dirty state before touching it.
Mutable lanes use unique `agent/<issue>-<stage>-<role>-r<revision>` branches and exclusive path ownership; read-only lanes use a fresh review snapshot for each reviewed commit.
Spawned agents verify their assigned path, branch or detached SHA, base, and clean state before acting, then return local commits, base-relative diffs, or verdicts without pushing or mutating issue or PR state.
Parallel mutable lanes require disjoint owned paths and no dependency on unintegrated output.
The driver serializes dependency installation and complete test, build, lint, Foundry/Docker, and screenshot gates on the fully integrated coordinator checkout.
Follow the provider-neutral lifecycle in `.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md` for assignment briefs, review artifacts, integration mapping, feedback revisions, conflicts, cleanup, manual-test candidate visibility, unrelated dirty-state preservation, and explicit maintainer feedback batching; do not create a Claude-specific worktree convention.

### Auto-spawn routing

Worked examples:

- A change touching `src/ui/svelte/apps/manager/EnvironmentEditView.svelte` and `lang/en.json` matches the [always row](../../../../AGENTS.md#auto-spawn-routing), the UI row (`**/*.svelte`), and the domain row (`lang/**`): plan-review runs `fabricate_ux_designer` and `fabricate_domain_expert`, post-implementation review runs `fabricate_reviewer` and `fabricate_ux_designer`, and the docs loop runs `fabricate_docs_writer` with `fabricate_domain_expert`.
- A change touching `src/systems/GatheringEngine.js` and `tests/gathering-engine-listing.test.js` matches the always row, the domain row (`src/systems/**`), and the tests row (`tests/**`); `foundry_integrator` joins only when the diff also adds or edits one of the Foundry identifiers in [`AGENTS.md`'s routing table](../../../../AGENTS.md#auto-spawn-routing).

### Model tier routing

Model capacity is judged by bounded responsibility and risk, not by file count: a module, its tests, and required localization or canonical-spec edits form one **cohesive work packet** ([`AGENTS.md`](../../../../AGENTS.md#model-tier-routing)) when the contract is defined.
A model tier changes the model pin and nothing else: all three bindings of a family point at the same canonical `.agents/skills/<family>/SKILL.md`, and no per-model-tier skill directory exists.

Always write "model tier"; a bare "tier" means the crafting Outcome Tier.

| Model tier | Claude `model:`     | Codex `model`   | Codex `model_reasoning_effort` |
|------------|---------------------|-----------------|--------------------------------|
| `small`    | `claude-haiku-5-5`  | `gpt-5.6-luna`  | `low`                          |
| `medium`   | `claude-sonnet-5-5` | `gpt-5.6-terra` | `medium`                       |
| `large`    | `claude-opus-5-5`   | `gpt-5.6-sol`   | `high`                         |

These pins are declared once in `scripts/lib/agentModelTiers.js` and mirrored by this table; `npm run validate:agents` fails any binding that drifts from them.
Claude pins use fixed model IDs rather than floating aliases, so newly released models cannot change any agent lane without a deliberate update.
To upgrade them, change `TIER_MODELS`, regenerate bindings with `npm run validate:agents -- --write`, update this table and the model-pin tests, and require CI approval before merging.
The model tier is an **underscore** suffix in token space (`fabricate_implementer_small`) and a **hyphen** suffix in file space (`.codex/agents/fabricate-implementer-small.toml`) (the bindings-table parser skips hyphenated token cells, silently dropping their checks).

The four untiered roles are each pinned to a single model tier.

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
It is resolved **once per spawn**, keyed on the `(family token, stage, revision)` triple — not once per token — so one family scheduled at two stages may resolve to different model tiers.

The driver uses only facts it mechanically holds at that spawn point.
The **keyed path set** is the paths a spawn's model tier is scored on, per stage as below.

| Stage                                 | Keyed path set                                                                                                                          | Size metric                                    | Lane surface                                                                                                                                            |
|---------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| plan-review                           | the delta's proposed affected-files list, **intersected with the globs of the path-signal routing-table row that spawned this reviewer** | count of `### Tasks` items                     | the strongest `Lane surface` among the `### Tasks` entries whose declared paths intersect this reviewer's keyed path set, or `none` when none intersects |
| implementation                        | the lane's owned-path set from the assignment brief                                                                                       | count of `### Tasks` items owned by the lane   | the lane's `Lane surface` field                                                                                                                         |
| post-implementation review, docs loop | `git diff --name-only` against the assigned base, on the driver-generated immutable artifact, intersected with the spawning path-signal row's globs | added + deleted lines from `git diff --numstat` | `public-api` / `persisted-shape` from affected planned tasks, else the artifact's added `export` line (`new-export`), else `none` |

`git diff` is an input only after implementation exists.

For post-implementation and docs reviewers, first intersect the reviewer's keyed path set with planned task paths in the issue delta.
If a matching task has a `public-api` or `persisted-shape` lane surface, use it (rule 2 → `large`); otherwise use `new-export` when an added `export` line is present, or `none`.
An added internal export selects at least `medium` (rule 4), but cannot erase previously declared external API or persisted-data risk.
Do not infer risk from added files alone, or every added test would route the quality-engineer row to `large`.

**Row intersection.**
A reviewer spawned by a [path-signal row](../../../../AGENTS.md#auto-spawn-routing) is scored only on the paths that row's globs matched — the driver already computed that intersection to build the roster (otherwise one high-risk touch would force every plan reviewer to `large`).
Intersection applies to path-signal rows only.
A [content-signal row](../../../../AGENTS.md#auto-spawn-routing) (Foundry identifiers, competitor questions, PR investigation) has no globs, so its reviewer scores on the **unintersected** set, exactly like the always-row roles.
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
scripts/forward-port-complete-merge.sh
scripts/forward-port-content-gate.sh
scripts/forward-port-provenance.mjs
scripts/foundry-smoke/**
scripts/lib/agentBindingRender.js
scripts/lib/agentBindingRoles.js
scripts/lib/agentBindingRoles.json
scripts/lib/agentModelTiers.js
scripts/lib/forwardPortProvenance.js
scripts/lib/foundrySmokeSignal.js
scripts/lib/publishGuard.js
scripts/lib/releaseTags.js
scripts/lib/releaseZipChunks.js
scripts/lib/screenshotEvidenceMatching.js
scripts/lib/zip.js
scripts/release-s3.js
scripts/release.js
scripts/validate-agent-bindings.mjs
scripts/validate-release-tag.mjs
scripts/ui-pr-screenshot-evidence.mjs
scripts/view-lab-screenshots.mjs
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

Agent-harness and publishing paths are on the list because mistakes there can mis-route later changes or corrupt a release; other `scripts/` support, such as design-system registries and View Lab case lists, is not.
`openspec/specs/**` is not high-risk; it carries the `medium` floor below because no domain expert reviews it at post-implementation review.

Mark a proposed external API as `public-api` rather than `new-export`; the latter is reserved for internal exports with a bounded caller contract.
A new module or export is not automatically a public or persisted contract (rule 4 → `medium`).
Rule 6 defaults **up** to `medium` for unclassified work; the number of changed paths alone never forces `large`.

**Lane surface** is the literal field each `### Tasks` entry declares at plan time (see [Planning & Workflow](#planning--workflow)), so the ladder reads it as a lookup, not a reading of prose:

```text
Lane surface: new-module | new-export | public-api | persisted-shape | none
```

At post-implementation stages the field is read only for `public-api` and `persisted-shape` on the planned tasks the reviewer's keyed paths intersect; otherwise the lane surface is derived from the artifact, per the keyed-input table above.

**Worked examples.**

| Case | Stage | Keyed paths | Size | Lane surface | Rule → model tier |
|------|-------|-------------|------|--------------|-------------------|
| Harness change | implementation | `AGENTS.md`, `.claude/agents/**`, `scripts/validate-agent-bindings.mjs`, `package.json` (four `HIGH_RISK_PATHS` matches) | — | — | 1 → `large` |
| UI change that also touches `package.json`, `fabricate_ux_designer` spawn | plan-review | 2 Svelte files (`package.json` is outside its row's globs) | 5 delta tasks | `none` | 6 → `medium` (rule 5 needs exactly 1 path) |
| `lang/en.json` string correction | implementation | 1 owned path, no high-risk match | 1 owned task | `none` | 5 → `small` |
| Svelte component fix that adds an exported helper | implementation | 1 owned path | — | `new-export` | 4 → `medium` |
| Cohesive component, tests and localization change | implementation | 5 paths, no high-risk match | 5 owned tasks | `none` | 6 → `medium` |
| Persisted data-shape change | implementation | 1 file | — | `persisted-shape` | 2 → `large` |
| 2-file diff under `src/systems/` | post-implementation review | 2 paths, no high-risk match | 180 lines (above `SMALL_MAX`, below `MEDIUM_MAX`) | `none` (no added `export`) | 6 → `medium` (rule 5 needs exactly 1 path) |

In the UI example, the `fabricate_reviewer` spawn scores unintersected, hits `package.json`, and is `large` (rule 1).

**Model-tier floors.**
Applied after the base model tier; they only ever raise it, and every floor clamps at `large`.

- A lane's model tier never decreases across revisions of the same `(family, stage)`; a disposition-only confirmation round is exempt, per the override below.
The floor is the **highest model tier at which the lane actually executed** in a previous revision — not the model tier it was originally resolved to — so a lane that escalated from `small` to `medium` does not re-resolve to `small` from unchanged facts.
- An unresolved finding floors one model tier above the previous executed model tier **only** when the driver records `redesignRequired: true` after identifying a misunderstood invariant or architectural reassessment.
An ordinary, bounded fix for a reviewer finding retains the previously executed model tier, without suppressing `ESCALATE_TIER`.
- A lane whose keyed path set includes `openspec/specs/**` floors at `medium`.

**Confirmation-round override.**
A review role spawned into a read-only lane — `fabricate_reviewer`, `fabricate_ux_designer`, `fabricate_quality_engineer`, `fabricate_domain_expert`, `foundry_integrator` — at revision 2 or later, with a brief marked *disposition-only* (an [assignment brief](worktree-lifecycle.md#assignment-brief) field), resolves `medium`, overriding rules 1 to 4 and both revision floors above.
It dispositions its OWN prior findings against a driver-supplied immutable artifact and reports only defects the revision itself introduced.
All first-round general reviews still cover the *entire integrated change*, including boundaries between implementation packets.
A mutable lane never takes the override, `ESCALATE_TIER` stays available to the confirmation spawn, and a confirmation round that returns a NEW `HIGH` finding re-enters the loop as a fresh revision at the ladder's own resolution.
The first round of every loop stays at the ladder's resolution.
The override is applied by the driver on top of the mechanical ladder; `selectModelTier` in `scripts/lib/agentModelTiers.js` models the ladder and its floors only.

#### `ESCALATE_TIER`

An agent of a model-tiered family may return `ESCALATE_TIER: <reason>` on its first line before its first edit; that is not a verdict, does not consume a revision, and is bounded at one escalation per family, stage, and revision.
An untiered role returns `BLOCKED` with the reason instead.
The lane checks, disposal and fresh-lane mechanics are in [Model tier escalation](worktree-lifecycle.md#model-tier-escalation); the routing rules are:

- **The budget is per `(family, stage, revision)`, not per lane.**
The fresh lane inherits the spent budget, so `small` to `medium` to `large` in one revision is not permitted; a second escalation is `BLOCKED`.
This bounds the worst case at two spawns per revision.
- **`ESCALATE_TIER` from a `large` lane is a protocol error.**
The driver converts it to `BLOCKED` and surfaces it under the existing stop condition.
- **Feedback rule.**
When a `small` spawn escalates on a recurring assignment shape, move that shape up the ladder in `AGENTS.md`.

Record the resolved model tier and the facts it was resolved from in the lane's assignment brief.

An escalation is pure waste, not partial progress, so the driver front-loads model-tier selection from cheap facts it already holds.

### Iteration cycles

After round one the driver applies every mechanical finding itself — a finding that names exact replacement text, an anchor, a count, or a roster entry — into the next revision of the delta or the branch, and spawns a further round only as a *confirmation round*: disposition-only, scoped to the roles whose findings were not mechanical or whose `HIGH` finding the driver disputes, at model tier `medium` (see the confirmation-round override under [Model tier routing](#model-tier-routing)).
A role whose round-one findings were all `LOW`, or none, is not re-spawned; the driver confirms its concern from evidence — the gate run, the artifact, the mutation control — and records that in the handoff.
Findings carry a severity — `HIGH` (the change would ship a defect or red a gate), `MEDIUM` (a decision is wrong or unjustified), `LOW` (wording, an anchor, a count) — and every review role grades by that scale; the quality engineer's severity guide in `.agents/skills/fabricate-quality-engineer/SKILL.md` is the same three rungs applied to defects.
A loop's acceptance condition is therefore that every finding is applied or dispositioned, not that a fresh `APPROVED` exists for the final artifact; the approval of record at [Final maintainer handoff](#final-maintainer-handoff) is the last round's verdict plus the driver's recorded disposition of the findings it applied, and a `BLOCKED` verdict is never self-cleared.
Rounds two and three therefore exist for disputed or non-mechanical findings, not as a second reading of the whole plan or diff, and the three-revision cap is the stop condition rather than the expected path.

In every loop, reviewers return their verdicts to the driver, which acts on them and summarizes outcomes to the user.
Reviewers do not post verdicts (or other workflow notes) as GitHub issue or PR comments.

1. **Plan review loop.** The driver drafts the OpenSpec delta in the issue's `openspec-delta` block (delegating to a `fabricate_orchestrator` planning agent when useful), then spawns the plan-review agents matched by the routing table in parallel.
Each emits `APPROVED / NEEDS_CHANGES / BLOCKED` against the delta, returning its verdict to the driver rather than commenting on the issue.
The driver rewrites the delta block in place, applying findings and confirmation rounds as above; when every remaining finding is applied or dispositioned, the plan is accepted and implementation starts.
2. **Implementation review loop.** The driver spawns the implementer to ship changes — including the canonical spec changes under `openspec/specs/` that the delta requires — then spawns `fabricate_reviewer` plus any post-implementation reviewers from the routing table to emit verdicts.
Reviewers compare the actual `openspec/specs/` diff against the proposed delta in the issue and confirm a faithful realization (or flag a justified deviation to reconcile).
The implementer addresses `NEEDS_CHANGES` in one fix lane for every reviewer's findings; the driver then spawns the confirmation round for the roles the rule above retains, confirms the rest from evidence, and proceeds when every finding is resolved or recorded as a Deviation.
3. **Documentation iteration loop.** Triggered whenever the change touches behaviour or any documented API surface.
The driver spawns the paired `fabricate_domain_expert` (updates `DOMAIN.md` and canonical specs against the diff, and reconciles the issue delta — updating it and its `Deviations` note when implementation justifiably diverged) and `fabricate_docs_writer` (updates JSDoc and the Jekyll site to match the shipped canonical spec).
Each then reviews the other's output and emits `DOCS APPROVED / DOCS NEEDS_CHANGES`.
The loop is accepted when every finding is applied or dispositioned, as for the other loops.

### Final maintainer handoff

Before asking the maintainer to review a PR, the workflow driver completes a final delivery loop from the coordinator checkout.
Follow the detailed final-delivery procedure in `.agents/skills/fabricate-orchestrator/references/worktree-lifecycle.md`.
It preserves ready state through rebases and fixes, reuses the authoritative check attempt for the exact head regardless of draft state, and retains the authoritative gates, review evidence, explicit lease, current-main ancestry, both SonarCloud checks, and ready handoff state.

### Stop conditions

- Any reviewer returning `BLOCKED` halts the loop and surfaces to the user.
- Hitting the 3-revision cap on any loop halts and surfaces to the user with the outstanding findings.
- An `ESCALATE_TIER` return is **not** a stop condition and does not consume a revision: the driver disposes the proven-clean lane and respawns it one model tier up.
A second escalation within the same `(family, stage, revision)`, an escalation from a `large` lane, an escalation from an untiered role, or an escalating lane that is not provably clean at its assigned base all become `BLOCKED` and halt under the first bullet.
- User intervention takes precedence; treat user guidance as the new entry condition for the next iteration.

### Confirming work and resolving findings

A subagent's report is a claim, not evidence; a confident-but-wrong claim ("gates green", "no findings", "N divergences") believed at face value is the loop's most expensive failure.
Convert claims into evidence before acting on them:

- Confirm gate results mechanically.
The driver checks CI status (or re-runs the gate) and re-derives the facts a decision rests on — touched paths from `git diff`, test counts, the roster — rather than merging on a subagent's self-reported "tests pass".
- Resolve a disputed, surprising, or expensive finding by INVESTIGATION, not introspection.
Gather the fact mechanically — read the real source, import and differential-test the real artifact, run the check — never by re-asking an agent "are you sure" (self-evaluation returns yes) and never by averaging votes.
A credible dissent about a real defect gates until disproven by evidence; a finding that turns out to rest on a hand-reconstructed model of the code is dismissed only after reading the real code.
- Match verification effort to the cost of being wrong.
Before an irreversible or outward-facing step — publishing an artefact, deleting or overwriting, force-pushing, any one-way door — spend disproportionate verification: rehearse against a scratch target, add a dissenting check, or gate.

## Git Conventions

- Before editing, the driver verifies the integration branch, and every mutable spawned agent verifies the branch and base in its assignment (`git branch --show-current` and `git rev-parse HEAD`).
If the coordinator checkout is on `main`, the driver creates or switches to a task branch before fan-out; a spawned agent treats any lane identity mismatch as blocked.
Re-check after any integration or merge, since the expected branch or SHA may move.
- When a spawned agent completes work, it commits only owned paths locally and returns the commits to the driver without pushing or opening a PR.
The driver verifies and integrates lane commits, then pushes the integration branch and opens or updates the PR targeting `main`.
- Respond to review feedback through a valid retained lane or a fresh revision lane, then update the same integration branch and PR; do not open replacement PRs unless the user asks.
- When review is required, review-only agents inspect review snapshots of the exact assigned integration commit against an immutable artifact and must not commit, push, merge, or mutate GitHub state.
- Before maintainer handoff, complete [Final maintainer handoff](#final-maintainer-handoff).

## Agent Roles & Bindings

Each role's canonical persona is its shared skill, `.agents/skills/<role>/SKILL.md`; use those instead of creating provider-local copies or provider-specific mirrors, per the bindings table in [`AGENTS.md`](../../../../AGENTS.md#agent-roles--bindings).
The default workflow above auto-spawns these roles based on change signals; explicit requests are only required for roles the routing table does not cover.

[Model tier routing](#model-tier-routing) explains how the driver picks which model tier a given spawn uses.

### Family to model tiers

For a model-tiered family it is the sole path from a routing token to a `subagent_type`, so `npm run validate:agents` gates its family set against the base families derived from the bindings table and requires each row to name exactly that family's three model-tiered tokens.
