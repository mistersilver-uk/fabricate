# Agentic Workflow Specification

## Purpose

Define the canonical planning, specification, and skill-discovery workflow for agent-driven work in this repository.

## Requirements

### Requirement: Canonical specification paths

The repository MUST treat files under `openspec/specs/*/spec.md` as the canonical source of truth for durable requirements.

#### Scenario: reading product behaviour

- **WHEN** an agent or contributor needs authoritative behaviour or workflow requirements
- **THEN** they read from `openspec/specs/*/spec.md`
- **AND** they treat legacy `spec/` paths as compatibility links only

### Requirement: Per-change planning

Non-trivial changes MUST be planned as an OpenSpec change delta in the work's GitHub issue before implementation starts.
The delta is NOT versioned as files in the repository; it lives in a managed block (`openspec-delta:start` … `openspec-delta:end`) in the issue body and consolidates the proposal, design, tasks, any per-domain spec deltas, the resolved roster, and acceptance/verification.
Each task entry MUST declare its lane surface as a literal field so model-tier selection has a mechanically available input rather than a reading of prose.
For non-trivial UI work, the delta MUST include a reference-surfaces and reuse inventory before plan approval.

#### Scenario: planning issue work

- **WHEN** work is non-trivial or spans multiple files, validations, or decisions
- **THEN** the workflow driver captures the change delta in the issue's managed `openspec-delta` block before code changes begin
- **AND** when the work originates from an existing issue it appends the block, preserving the reporter's original text, and when the work originates from a prompt with no issue it creates an issue from the `OpenSpec Change Delta` template
- **AND** it rewrites the block in place across plan-review iterations rather than appending duplicate blocks, and never edits outside the markers
- **AND** every `### Tasks` entry carries a literal `Lane surface` field naming one of the declared values, which the driver reads as a lookup when it selects that lane's model tier
- **AND** a spawned orchestrator helper remains read-only and returns draft or replacement managed-block text for the driver to apply

#### Scenario: planning non-trivial UI work

- **WHEN** a change adds or materially redesigns a UI surface
- **THEN** its delta records every supplied visual reference and analogous shipped surface
- **AND** it names the reusable primitives and CSS contracts selected for the work
- **AND** it justifies every deliberate non-reuse or shared-extraction gap before plan approval

#### Scenario: implementing the delta into canonical specs

- **WHEN** the change requires canonical requirement changes
- **THEN** the implementer makes those changes under `openspec/specs/*/spec.md` (the only versioned spec source of truth) as required by the issue's `Spec Deltas`

#### Scenario: reconciling the implementation against the delta

- **WHEN** implementation is complete
- **THEN** post-implementation review and the documentation loop compare the actual `openspec/specs/` diff against the proposed delta in the issue
- **AND** they confirm the implementation faithfully realizes the delta, or — when implementation justifiably deviated — the issue's delta and its `Deviations` note are updated so the delta accurately describes what shipped

### Requirement: Proportional workflow and momentum

The workflow driver MUST use the shortest workflow that satisfies mandatory repository gates and the actual risk, and MUST prioritize the earliest honestly reviewable PR while preserving mandatory safety, review, and exact-head delivery gates.
One mechanically valid evidence run MUST satisfy every gate it directly covers without ceremonial repetition.

#### Scenario: front-loading cheap checks

- **WHEN** the driver begins or resumes a workflow
- **THEN** it checks branch and base freshness, affected paths and roster, PR title and commitlint compliance, existing CI and external-check state, and screenshot scope before starting more expensive or delegated work

#### Scenario: reusing valid evidence and approvals

- **WHEN** a mechanically valid check or review already covers an unchanged target and concern
- **THEN** the driver reuses that evidence instead of repeating an equivalent check or review ceremonially
- **AND** a reviewer repeats only when its owned concern materially changed or an unresolved finding remains
- **AND** issue or PR metadata edits and patch-equivalent rebases do not invalidate approval
- **AND** when repeat review is required, the driver uses a fresh detached lane pinned to the exact target and supplies an immutable artifact

#### Scenario: timeboxing a delegated lane

- **WHEN** a delegated lane shows no observable progress for about 60 seconds
- **THEN** the driver requests status once
- **AND** after about another 60 seconds without progress it interrupts and reassigns the work or continues locally within driver authority

#### Scenario: preserving mandatory gates

- **WHEN** check evidence is stale or ambiguous, its target changed, repository policy requires an exact-head result, or a reviewer's owned concern materially changed or retains an unresolved finding
- **THEN** the driver reruns the applicable check or review before maintainer handoff

### Requirement: Reference-led visual comparison

Before visual approval, non-trivial UI work MUST compare every supplied prototype, screenshot, defect matrix, named shipped sibling, and named CSS record against the equivalent rendered Fabricate state.
The comparison MUST record each artifact's stable identity and dimensions, authority per control and state, and every justified deviation.

#### Scenario: resolving visual authority

- **WHEN** supplied references overlap or disagree
- **THEN** the plan assigns authority separately for each affected control and state rather than choosing one artifact globally
- **AND** it records which rendered route and state are equivalent to each reference
- **AND** any unavailable artifact leaves its affected decision and visual approval pending

#### Scenario: approving rendered parity

- **WHEN** implementation claims parity with the approved reference comparison
- **THEN** review compares the rendered state, representative data, and relevant responsive sizes against that comparison
- **AND** a source declaration, token name, or gate fixture copied from the implementation is not accepted as proof that the visual effect exists
- **AND** a reusable shipped primitive is used for the same behavior unless the approved inventory documents an incompatibility

### Requirement: Branch and PR workflow

All mutating agent work MUST happen on a branch that is not `main`, `release`, or a hotfix line, and the workflow driver MUST deliver the integrated result through a PR targeting `main`.
A PR targets `release` or a hotfix line only for a hotfix to the current public release.
The release automation's forward-port merge from `release` into `main` is not agent work and is exempt from this requirement.

#### Scenario: starting mutable work

- **WHEN** the workflow driver will coordinate mutable work
- **THEN** it verifies that the clean coordinator checkout is on a non-protected integration branch
- **AND** it uses a separate clean coordinator worktree when the current checkout contains unrelated user-owned state, or records before/after branch, SHA, tracked, untracked, and relevant ignored state and proves that state was preserved
- **AND** every spawned mutable agent verifies its assigned worktree, lane branch, base SHA, and clean status before editing

#### Scenario: finishing mutable work

- **WHEN** a spawned mutable agent completes a scoped change
- **THEN** it commits only owned paths to its local lane branch and returns the commits to the workflow driver without pushing or mutating GitHub state
- **AND** the driver verifies and integrates the returned commits on the coordinator branch
- **AND** the driver pushes the integrated branch and opens or updates a PR targeting `main`, or `release` or a hotfix line when the change is a hotfix to the current public release
- **AND** the PR title complies with Conventional Commits, including the GitHub issue number for `feat`, `fix`, and `perf`
- **AND** the PR description uses H2 sections for `Description`, `Benefit(s)`, `Changes in this PR`, `Testing`, and `Screenshots (if applicable)`

#### Scenario: responding to review feedback

- **WHEN** a reviewer requests changes
- **THEN** the driver reuses the retained mutable lane when ownership and dependency context remain valid, or creates a fresh revision lane from current integration `HEAD`
- **AND** the driver integrates accepted follow-up commits and updates the same PR unless the user explicitly asks for a replacement

#### Scenario: batching explicit maintainer feedback

- **WHEN** a maintainer explicitly asks to batch feedback
- **THEN** the driver queues ordinary findings until the stated batch boundary and produces one cohesive revision ordered by severity, path ownership, and dependency
- **AND** only a safety or data-loss blocker interrupts the batch
- **AND** it preserves the mapping from every queued finding to the revision that addressed it

#### Scenario: read-only review work

- **WHEN** a review-only agent evaluates work
- **THEN** it reviews a fresh detached worktree pinned to the exact assigned integration commit against the supplied base and immutable diff artifact
- **AND** it must not commit, push, merge, or mutate GitHub state
- **AND** if repeat review is later required at another commit, the driver creates another fresh detached lane instead of reusing that checkout

#### Scenario: working near the release branch

- **WHEN** an agent works on or near `release` or a hotfix line
- **THEN** it MUST NOT rebase or force-push that branch, because the release automation stores release state in git tags and in git notes
- **AND** it MUST NOT squash-merge a prerelease line into `release`, because squashing collapses Conventional Commit types and mis-computes the stable version
- **AND** it MUST NOT merge `release` or `main` into a hotfix line; a fix leaves a hotfix line by cherry-pick

### Requirement: Manual-test candidate proof

Before asking a maintainer to test, the workflow driver MUST identify and prove the exact candidate root, branch, SHA, launch surface, dirty-state status, and visibility from the maintainer's requested checkout.

#### Scenario: handing a candidate to a maintainer

- **WHEN** the workflow asks a maintainer to perform manual testing
- **THEN** the driver integrates the candidate into the intended checkout or deliberately serves it from another exact worktree
- **AND** it reports the absolute root, branch, `HEAD`, URL or launch command, tracked and meaningful untracked state, and relevant ignored state
- **AND** it proves the running process, Foundry module path, or requested checkout resolves to that candidate rather than merely asserting branch or SHA
- **AND** it records coordinator branch, SHA, and dirty state before and after preparation and preserves unrelated user-owned state
- **AND** if the requested checkout cannot safely expose the candidate, it reports the exact clean alternate root and launch command instead of claiming visibility

### Requirement: Ready-for-review delivery gate

Before maintainer handoff, the workflow driver MUST deliver a PR whose unchanged remote head contains current `origin/main`, has passed authoritative post-rebase validation and required implementation review, is ready for review, and has every required post-undraft GitHub and external check successful.
Draft-head checks MUST be treated only as preflight evidence because required workflows may use the `ready_for_review` trigger.
Metadata-only CI MUST use concurrency independent from code-gate attempts, and a `ready_for_review` event MUST run the full required code gates.

#### Scenario: preparing the final remote head

- **WHEN** implementation, review, and documentation loops have accepted the integrated change
- **THEN** the driver finalizes PR title, body, issue linkage, screenshots, and other metadata before the final run
- **AND** it fetches `origin/main`, captures the expected remote PR-head SHA, and requires a clean coordinator with no active mutable lane
- **AND** it rebases the integration branch onto current `origin/main`
- **AND** it reruns every required authoritative local gate plus `npx commitlint --from origin/main --to HEAD`
- **AND** it preserves valid implementation approval when the rebase is patch-equivalent for the reviewer's owned concern and no finding remains unresolved
- **AND** when repeat review is required, it obtains that review from a fresh detached lane pinned to the exact rebased commit with an immutable diff artifact
- **AND** it repeats domain and documentation reconciliation if conflict resolution or later fixes change workflow, canonical specification, or documentation content

#### Scenario: publishing rewritten history

- **WHEN** the rebased head has passed its required local gates and has valid required implementation-review evidence
- **THEN** the driver updates the remote only with `--force-with-lease=<branch>:<expected-sha>` using the previously captured remote SHA
- **AND** a rejected lease stops for investigation
- **AND** the driver MUST NOT retry with `--force` or an unqualified force push

#### Scenario: validating the ready head

- **WHEN** the explicit-lease push succeeds
- **THEN** the driver marks the PR ready for review before the final check rollup
- **AND** it waits for every required GitHub Actions and external check on that exact remote head
- **AND** both SonarCloud checks, Automatic Analysis and Quality Gate, report success
- **AND** pending, skipped when required, cancelled, stale-head, or failing checks do not satisfy the gate
- **AND** it identifies one authoritative full exact-head attempt, normally the `ready_for_review` attempt, and requires every full gate from that attempt rather than combining successful jobs across duplicates
- **AND** metadata-only `edited` attempts cannot cancel or satisfy the authoritative code-gate attempt
- **AND** cancelled or skipped duplicate attempts neither supply missing gates nor invalidate a separately complete authoritative attempt

#### Scenario: restarting failed or stale delivery

- **WHEN** a required check fails, current `origin/main` advances, the remote PR head changes, or the PR is draft
- **THEN** the driver returns the PR to draft before evidence gathering, issue reconciliation, or isolated fix work
- **AND** it repeats rebase, authoritative validation, explicit-lease push, ready transition, and exact-head checks
- **AND** it repeats review only when the resulting target materially changes the reviewer's owned concern or an unresolved finding remains
- **AND** after a successful rollup it fetches `origin/main` again and verifies current-main ancestry, unchanged remote-head identity, and ready state before maintainer handoff

### Requirement: Isolated agent worktrees

Every spawned agent MUST work from a unique repository-local Git worktree by default.
Mutable lanes MUST use exclusive branches, and read-only lanes MUST use detached snapshots pinned to the exact commit being evaluated.
A lane of a model-tiered family MUST carry its model-tiered token in both its branch name and its lane directory name, and an escalated lane MUST be a fresh lane at the same assigned base with the same owned paths rather than a reused feedback-revision lane.

#### Scenario: preparing planning and plan-review lanes

- **WHEN** the workflow driver needs a delta drafted or reviewed before approval
- **THEN** it requires a clean coordinator checkout and a committed shared baseline
- **AND** it derives a preliminary roster mechanically from the current request and proposed affected paths
- **AND** it creates fresh detached planner or plan-review worktrees beneath `.worktrees/<issue>/`, pinned to that baseline without requiring an approved delta
- **AND** it keeps immutable review artifacts in the driver-owned sibling directory `.worktrees/<issue>/artifacts/` rather than inside a detached checkout
- **AND** it recomputes the preliminary roster when proposed paths or content signals change

#### Scenario: preparing mutable implementation lanes

- **WHEN** the workflow driver is ready to fan out approved work
- **THEN** it requires the approved issue delta, final resolved roster, dependency order, exclusive path ownership, and a clean committed coordinator baseline
- **AND** it creates each lane beneath `.worktrees/<issue>/` with a unique directory that carries the same role component as the branch, including for detached read-only lanes
- **AND** it assigns mutable branches named `agent/<issue>-<stage>-<role>-r<revision>`, where the role component is the model-tiered token in hyphenated file form for a model-tiered family

#### Scenario: briefing a spawned agent

- **WHEN** the driver assigns a mutable or read-only lane
- **THEN** the brief supplies the absolute worktree path, issue, role, stage, revision, base SHA, expected branch or detached SHA, owned paths, dependency state, expected commit range, allowed focused checks, handoff format, and — for a model-tiered family — the resolved model tier and the facts it was resolved from
- **AND** the agent verifies its top-level path, branch or detached state, assigned SHA, and clean status before acting
- **AND** an identity mismatch or unexpected existing change blocks the lane before edits begin

#### Scenario: running mutable lanes concurrently

- **WHEN** multiple mutable agents can work at the same time
- **THEN** their owned paths are disjoint and every lockfile or shared configuration file has exactly one owner
- **AND** no parallel lane depends on output that has not integrated
- **AND** dependent work starts from the integration commit containing its prerequisites

### Requirement: Driver-owned coordination and integration

The workflow driver MUST exclusively own the coordinator checkout, integration branch, GitHub and remote mutations, worktree lifecycle, integration ordering, authoritative gates, and cleanup.
Spawned agents MUST return local work products to the driver and MUST NOT exercise those shared authorities.

#### Scenario: handing off mutable work

- **WHEN** a mutable agent finishes a revision
- **THEN** it commits only owned paths locally
- **AND** it returns the verified base, ordered new commit SHAs, base-relative changed paths and diff, focused check results, lane status, and any caveats or recommended managed-block text
- **AND** it leaves the lane available for driver verification or a valid retained-lane feedback round

#### Scenario: integrating lane commits

- **WHEN** the driver receives a mutable lane handoff
- **THEN** it verifies the coordinator and lane state, exact commit range, owned changed paths, integrated dependencies, and absence of a prior integration record
- **AND** it cherry-picks commits in declared dependency order
- **AND** it records a source-to-integrated SHA mapping for every commit
- **AND** if a cherry-pick conflicts it aborts the cherry-pick and routes resolution through a fresh revision lane based on current integration `HEAD` without editing another lane

#### Scenario: iterating after feedback

- **WHEN** a mutable lane remains available with unchanged ownership and current dependency context
- **THEN** the driver reuses it and accepts only the new ordered commits for the revision
- **AND** when ownership changes, the prior lane is unavailable, or conflict or stale dependency invalidates its context, the driver creates a fresh revision lane from current integration `HEAD`

#### Scenario: reviewing a changed integration target

- **WHEN** implementation, plan, or documentation integration materially changes a reviewer's owned concern or leaves a finding unresolved
- **THEN** the driver creates a fresh detached reviewer lane pinned to that exact target and supplies the immutable base-relative artifact
- **AND** metadata-only edits and patch-equivalent rebases preserve the prior approval without another review
- **AND** domain or canonical-spec reconciliation integrates before dependent documentation authoring
- **AND** domain and documentation cross-review may run concurrently only after both outputs integrate

### Requirement: Serialized validation and guarded cleanup

The workflow driver MUST serialize resource-heavy validation and MUST treat only gates run from the fully integrated coordinator branch as authoritative acceptance evidence.
Cleanup MUST preserve any lane whose integration or meaningful state has not been mechanically resolved.
An escalated lane proven clean at its assigned base with zero commits MAY be disposed; any other escalating lane MUST be preserved and reported as `BLOCKED`.

#### Scenario: running local and CI gates

- **WHEN** lane work is in progress
- **THEN** agents may run focused checks allowed by their briefs
- **AND** the driver serializes dependency installation, complete tests, build, complete lint and format, Foundry or Docker smoke, and screenshot generation
- **AND** the driver runs required final gates from the fully integrated coordinator branch
- **AND** CI creates no agent worktrees and runs the repository's unchanged gates against the pushed integrated commit
- **AND** CI MAY additionally PRODUCE screenshot evidence for the pull request under the UI PR screenshot evidence requirement, which is authoring rather than gate-running, and is therefore stated here explicitly rather than read into "unchanged gates"

#### Scenario: recovering interrupted or stale Foundry smoke

- **WHEN** the per-worktree Foundry smoke container is running or may be stale before its bound setup data is replaced
- **THEN** the launcher resolves the exact worktree container, stops it, waits for proof that it is stopped, and aborts before setup-data mutation if the stop fails or cannot be proved
- **AND** it stops rather than removes the container so the extracted Foundry application cache is preserved
- **AND** it uses bounded stop, startup, join, setup, and teardown phases and proves a clean join and setup state before fixtures run
- **AND** local development may reuse the safely stopped per-worktree cache while CI uses its isolated identity and the same stop-before-data-replacement ordering
- **AND** screenshots left by an interrupted, failed, degraded, or mismatched run remain diagnostic rather than publishable evidence

#### Scenario: per-worktree-isolated real-Foundry capture

- **WHEN** the driver runs the real-Foundry screenshot capture from a worktree
- **THEN** the container identity (name, hostname, compose project, host port) is derived deterministically from the worktree root, so it is stable within a worktree yet distinct across worktrees and concurrent worktrees do not collide on the fixed name
- **AND** the derivation preserves the container-reuse cache and the hostname-bound cached license within a worktree
- **AND** — CONDITIONAL on the licensing probe passing and the prebaked world existing — the capture may be sharded across containers within a run, with the merged frame set required to equal the single-container scoped set
- **AND** sharding does not change this scenario's producer: it remains real-Foundry scoped capture
- **AND** a Foundry-free renderer MAY produce evidence only under the Harvested Foundry window chrome requirement, and never by approximating chrome it has not harvested

#### Scenario: cleaning integrated lanes

- **WHEN** the workflow has accepted a lane's integrated output
- **THEN** the driver verifies its source-to-integrated mappings, stable patch equivalence, tracked state, and meaningful untracked state before removal
- **AND** known generated content is discarded only after confirming it contains no meaningful work
- **AND** forced worktree removal is allowed only after integration equivalence and meaningful-state checks succeed
- **AND** `git branch -D` is allowed for a cherry-picked lane only after every source commit is mapped and patch-equivalent to its integrated commit
- **AND** an escalated lane, which has nothing to integrate because it escalated before its first edit, is disposed only after the driver proves it has zero commits, a clean status, and `HEAD` at the assigned base
- **AND** dirty, unintegrated, blocked, interrupted, ambiguous, or otherwise unverified lanes and branches are preserved and reported
- **AND** the driver prunes worktree metadata only after eligible lanes are removed

### Requirement: Shared skill source

Shared reusable skills MUST live under the repository `.agents/skills/` directory so Codex discovers them from the repository root.

#### Scenario: provider-specific skill discovery

- **WHEN** a provider-specific agent binding needs a shared skill
- **THEN** it points back to the canonical `.agents/skills/` directory instead of carrying a divergent copy
- **AND** no second repository skill tree is maintained outside the Codex discovery root

### Requirement: Role persona bindings

Each agent role MUST be defined once in its canonical `.agents/skills/<role>/SKILL.md`.
Provider agent definitions (`.codex/agents/*.toml` for Codex, `.claude/agents/*.md` for Claude) MUST be thin bindings that point at the canonical skill and MUST NOT carry divergent persona behavior.

#### Scenario: resolving a routing token

- **WHEN** the auto-spawn routing table in `AGENTS.md` names a role token such as `fabricate_orchestrator`
- **THEN** an untiered role resolves directly to a registered agent in each active provider — `.codex/agents/<role>.toml` for Codex and the `.claude/agents/<role>.md` `subagent_type` for Claude
- **AND** a model-tiered family resolves through per-spawn model-tier selection, and then through the `AGENTS.md` family table, to exactly one model-tiered binding in each active provider
- **AND** the read-only mapping role `fabricate_pr_explorer`, which has no shared skill, resolves to `.codex/agents/fabricate-pr-explorer.toml` for Codex and to Claude's built-in `Explore` agent (no dedicated Claude binding)

#### Scenario: resolving a model-tiered role to its persona

- **WHEN** the validator or the driver resolves a model-tiered role name
- **THEN** it first splits any model-tier suffix unconditionally into a candidate base family and model tier, so the family map is built even for an incomplete family
- **AND** it then checks completeness over those candidates, reporting a family and its missing model tiers by name
- **AND** it only then resolves the skill path, using the base family when that skill exists and the family declared all three model tiers, and otherwise treating the role name literally
- **AND** all model tiers of one family share a single canonical `.agents/skills/<role>/SKILL.md` and differ only by model pin, with no per-model-tier skill directory

#### Scenario: changing role behavior

- **WHEN** a role's behavior must change
- **THEN** the edit is made in `.agents/skills/<role>/SKILL.md`
- **AND** the provider bindings remain thin pointers without divergent persona behavior
- **AND** provider-local metadata, tool allowlists, and sandbox guardrails may live in bindings when needed

#### Scenario: orchestration ownership

- **WHEN** role agents are spawned for a change
- **THEN** the workflow driver (the provider's top-level loop — Codex's depth-0 prompt agent or Claude's main loop) owns routing and the plan, implementation, and docs iteration loops
- **AND** the workflow driver alone mutates issue, PR, or workflow state
- **AND** a spawned orchestrator helper performs read-only planning and returns draft managed-block text rather than applying it
- **AND** scoped role agents execute their role and return without spawning or routing further agents

### Requirement: Model tier routing

Executing roles MUST be bound at three model tiers ordered by capability, and the workflow driver MUST resolve exactly one model tier per spawn, keyed on the family token, stage, and revision, from a literal first-match-wins ladder whose default raises rather than lowers and whose reviewer inputs are scoped to the routing row that spawned it.
An agent of a model-tiered family whose assignment exceeds its model tier MUST return a non-verdict escalation before its first edit rather than proceed, while an untiered role MUST return `BLOCKED` instead.
An escalation MUST NOT consume a loop revision, MUST be bounded at one per family, stage, and revision, and MUST become `BLOCKED` when returned from the most capable model tier.
A lane's model tier MUST NOT decrease across revisions, flooring on the model tier at which it actually executed, and the orchestrator MUST stay on the most capable model tier.
Each model tier's provider model pins MUST be declared in exactly one place, and the agent-binding validator MUST fail any binding that drifts from them.

#### Scenario: selecting a model tier for a spawn

- **WHEN** the workflow driver spawns a role of a model-tiered family
- **THEN** it resolves exactly one model tier from the ladder in `AGENTS.md`, keyed on that spawn's family token, stage, and revision, using only facts it mechanically holds at that point
- **AND** it scores a reviewer spawned by a path-signal routing row only on the paths that row's globs matched, while a content-signal or always-row role scores on the unintersected set
- **AND** any keyed path matching the high-risk path list resolves to the most capable model tier
- **AND** an unavailable or otherwise unmatched input resolves to the middle model tier, so no spawn reaches the cheapest model tier by omission
- **AND** it records the resolved model tier and the facts it was resolved from in the lane's assignment brief

#### Scenario: escalating from a model tier

- **WHEN** an agent of a model-tiered family determines that its assignment exceeds its assigned model tier
- **THEN** it returns the non-verdict escalation on its first line before making any edit, immediately after its lane identity checks
- **AND** the driver honours it only after mechanically confirming that lane has zero commits, a clean status, and `HEAD` at the assigned base, and otherwise preserves and reports the lane as `BLOCKED`
- **AND** it disposes that proven-clean lane and creates a fresh lane at the same assigned base with the same owned paths, exactly one model tier up, without consuming a loop revision
- **AND** a second escalation within the same family, stage, and revision, an escalation from the most capable model tier, or an escalation from an untiered role is `BLOCKED`

#### Scenario: flooring a model tier across revisions

- **WHEN** the driver re-resolves a model tier for a later revision of the same family and stage
- **THEN** the result is never below the highest model tier at which that lane actually executed in a previous revision, rather than the model tier it was originally resolved to
- **AND** a revision carrying an unresolved finding forward is floored one model tier above the previous revision's executed model tier
- **AND** a lane whose keyed path set includes `openspec/specs/**` is floored at the middle model tier
- **AND** every floor only ever raises the base model tier and clamps at the most capable one

### Requirement: Harness reference integrity

Harness documents — `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `openspec/README.md`, `.agents/skills/README.md`, `.agents/skills/*/SKILL.md`, every Markdown file recursively beneath `.agents/skills/*/references/`, `.claude/agents/*.md`, and `.codex/agents/*.toml` — MUST cite repository files by paths that exist and by symbol names rather than line numbers, and the agent-binding validator MUST enforce this mechanically.

#### Scenario: validating harness references

- **WHEN** `npm run validate:agents` runs
- **THEN** it verifies every conservatively path-shaped backtick reference in the harness documents resolves to an existing file or directory, allowing only entries in an explicit, commented allow-missing set
- **AND** it rejects line-number-based code citations (such as `file.js:NNN` or approximate line references) in the harness documents
- **AND** it verifies every skill-backed role's Claude binding declares a `model:` and its Codex binding declares a `model =`
- **AND** it resolves a model-tiered binding to its base family skill, derives the shared-skills list from base families rather than from model-tiered role names, and resolves read-only tool exemptions against the base family token
- **AND** it requires a model-tiered family to declare all three model tiers, reporting the family and its missing model tiers by name
- **AND** it gates every skill-backed role's pin, model-tiered or not, against its declared model tier by exact comparison, covering the Codex reasoning-effort field as well as the model
- **AND** it gates the `AGENTS.md` family table against the base families derived from the bindings table, treating failure to locate that table as an error rather than a skip
- **AND** it requires each model-tiered binding's `description`, in both providers, to name its own model tier and neither of the other two
- **AND** it verifies every `.agents/skills/<name>/SKILL.md` has only single-line string `name` and `description` frontmatter fields
- **AND** the `name` matches its directory, contains at most 64 lowercase letters, digits, and hyphens, and the `description` contains 1-1024 characters without angle brackets
- **AND** it recursively enumerates every Markdown file beneath a skill's `references/` directory, validates paths cited by those nested documents, and requires the owning `SKILL.md` to cite each one directly by its full relative `references/...` path
- **AND** it verifies the AGENTS.md shared-skills list equals the set of `.agents/skills/` subdirectories containing a `SKILL.md` minus the role directories derived from the bindings table
- **AND** it exits non-zero on any violation

#### Scenario: consistent local and CI validation

- **WHEN** a developer runs `npm run validate:agents` locally or the `validate-agents` CI job runs it on Ubuntu
- **THEN** the identical dependency-free Node validator behavior enforces the same discovery, metadata, recursive-reference, and binding requirements in both environments
- **AND** neither path requires network access or a provider-specific fallback

#### Scenario: citing code from harness documents

- **WHEN** a harness document cites a location in the codebase
- **THEN** it names the symbol and the file path (locatable with `grep -n`) instead of a line number

### Requirement: Focused Markdown lint

Focused Markdown lint MUST inspect only explicitly supplied paths for local development and implementation lanes.
The whole-repository Markdown command MUST remain the authoritative local and CI gate.

#### Scenario: linting assigned Markdown paths

- **WHEN** a developer or lane runs `npm run lint:md:files -- <paths>`
- **THEN** the command passes only those paths to `markdownlint-cli2 --no-globs`
- **AND** configured broad globs do not load an invalid unrequested Markdown file
- **AND** an invalid requested Markdown file fails the focused command

#### Scenario: running authoritative Markdown lint

- **WHEN** the integrated change is validated locally or in CI
- **THEN** `npm run lint:md` continues to inspect the whole configured authored-Markdown surface
- **AND** CI does not replace it with the focused path command

### Requirement: Mounted-component dependency closure

Mounted-component setup MUST resolve the static local-import closure of the declared raw, rune, and compiled component graph before importing the mounted target.
A missing local dependency MUST fail setup normally with an actionable diagnostic, and non-zero test cancellation remains unacceptable.

#### Scenario: a transitive local import is omitted

- **WHEN** a declared mounted-test graph omits a raw or compiled local module reached through static imports
- **THEN** shared harness setup fails promptly and lists the missing import and importer chain
- **AND** the test process reports a normal failure with zero cancelled tests rather than hanging
- **AND** local development and CI exercise the same helper through the existing `npm test` path

### Requirement: Product contracts stay in specs

Agents and skills MUST keep durable product behavior in canonical specs or active OpenSpec design docs, not in role prompts.

#### Scenario: UI learning becomes durable

- **WHEN** an implementation or review uncovers a reusable product UI rule
- **THEN** the agent updates the relevant `openspec/specs/*/spec.md`, or the active change delta in the issue's `openspec-delta` block when the rule is still being planned
- **AND** role prompts or skills may add only concise workflow guidance that points agents to those documents

#### Scenario: validation infrastructure fails

- **WHEN** browser or Foundry validation fails before the relevant app surface loads
- **THEN** the agent records the failure as validation infrastructure
- **AND** the agent does not report it as an app regression unless a loaded app surface violates the relevant spec or acceptance criteria

### Requirement: Manager route planning

Agents planning or implementing Manager feature routes MUST account for placeholder promotion, route wiring, display seams, and tests as a single workflow.

#### Scenario: promoting a placeholder route

- **WHEN** a Manager feature route moves from planned placeholder to implemented UI
- **THEN** the agent removes the feature from disabled placeholder/deferred-view data
- **AND** adds feature-gated navigation, route normalization, breadcrumbs, title/subtitle/header labels, main route rendering, inspector routing, localization, CSS, and focused mounted/source-contract coverage

#### Scenario: diagnosing an unclickable Manager feature button

- **WHEN** a Manager feature button cannot be clicked
- **THEN** the agent first checks whether the button is rendered from placeholder/deferred-view data or has a feature gate that intentionally disables/hides it
- **AND** only then debugs event handlers or pointer-overlay problems

#### Scenario: Svelte mounted event simulation

- **WHEN** mounted Svelte tests synthesize `input` or `change` DOM events directly
- **THEN** route/component code may prefer explicit `value` plus `oninput`/`onchange` handlers for controls under test
- **AND** tests should dispatch the event that the component actually handles before asserting state

### Requirement: Harvested Foundry window chrome

A Foundry-free renderer that claims window fidelity MUST draw chrome harvested from Foundry the operator already licenses, whether a release archive their own credentials fetched or an unpacked installation of theirs.
It MUST fail closed when that material is absent rather than substituting an approximation, MUST NOT commit, publish, or download it, and MUST record which Foundry build its frames were drawn with.
It MUST draw the same Foundry build that the live smoke boots, because the smoke is the fidelity authority and frames of different builds are not comparable.

#### Scenario: chrome is unavailable

- **WHEN** a capture is requested and no harvested chrome is present
- **THEN** the capture aborts, naming the sources it searched and the commands that would provide them
- **AND** it emits no frame, because a frame drawn without the real cascade is worse than no frame — it looks authoritative

#### Scenario: harvested material is never redistributed

- **WHEN** chrome is harvested
- **THEN** the harvested files are ignored by version control and no harvested file is tracked anywhere in the repository
- **AND** the committed record carries provenance only — the Foundry version, the source archive identity, and digests — never file contents
- **AND** captured screenshots remain publishable evidence; the restriction is on redistributing Foundry's own assets, not on the frames drawn with them

#### Scenario: window geometry

- **WHEN** a window is captured
- **THEN** it is rendered at its application's declared position, and the applied geometry is asserted to equal the declared geometry
- **AND** a capture whose geometry was clamped fails rather than publishing a wrong-sized frame

#### Scenario: the chrome source changes

- **WHEN** the harvested Foundry build differs from the one the frame builder was transcribed against
- **THEN** the mismatch is reported as a failure that names the recorded and actual builds, so the transcription is re-verified rather than silently drifting

#### Scenario: the renderer and the smoke name different Foundry builds

- **WHEN** the Foundry build recorded for the renderer's chrome differs from the build the live smoke is pinned to
- **THEN** the mismatch fails a check that runs without any harvested material present, so a machine with no Foundry licence still catches it
- **AND** the failure names both builds and the steps that re-harvest and re-attest

#### Scenario: recording which build the frames were drawn with

- **WHEN** the committed provenance record is written
- **THEN** it is written only from the source the automated pipeline itself harvests, so its digests are reproducible there
- **AND** a harvest from any other source is refused for that purpose, naming why, while remaining usable for rendering

#### Scenario: the chrome depends on fonts that did not load

- **WHEN** a window is captured and a face the chrome paints with is absent, renamed, or unloaded
- **THEN** the capture fails naming the missing family, because a frame drawn in fallback glyphs looks deliberate and would publish as evidence

### Requirement: UI PR screenshot evidence

Pull requests that change UI files MUST include screenshot evidence for the relevant changed views before the PR is opened or updated.
Evidence MUST depict the changed view as a full application window.
Every collected automated view MUST prove successful, non-degraded, exact-run provenance.
Automatically published evidence MUST be identifiable as belonging to the pull request's current head.
The evidence gate MUST NOT decide before the automated producer for that same head has concluded, UNLESS the pull request body already carries evidence sufficient to satisfy the gate for that head.

Published evidence MUST be **legible to a reader who has only the picture**.
Each frame MUST be named from the canonical view-case registry rather than by its case id, and a frame that depicts a surface the module does not ship MUST carry a visible caption saying so and naming where that surface comes from.
This repository is public and its pull requests are readable by anyone; a frame that photographs Core's own companion seam necessarily shows a stand-in module registered by the test harness, and an uncaptioned picture of it reads as a shipped feature to precisely the readers who know it is not one.
The caption MUST sit beside the image rather than in its alt text, which is read by a screen reader and by almost nothing else a reviewer uses.

#### Scenario: UI files changed

- **WHEN** a PR changes files under `src/ui/`, `styles/`, files ending in `.svelte` or `.css`, or a `lang/` file alongside any of those render files (a `lang/`-only change does not require screenshots)
- **THEN** the affected views are selected from the canonical view-case registry, and each is captured as a full application window at the application's declared `DEFAULT_OPTIONS.position`
- **AND** a view the registry covers IS captured by the Foundry-free renderer, which is the DEFAULT producer: it renders the real application root over production `styles/fabricate.css` at its production cascade layer, inside harvested Foundry window chrome
- **AND** a view the registry does not cover is captured by the Foundry smoke harness with the scoped `screenshots` profile (`npm run test:foundry:screenshots`), which is the fallback producer rather than the routine one
- **AND** an agent does not run the smoke to produce evidence for a view the registry already covers: the smoke's `screenshots` profile costs roughly thirty seconds per frame against the renderer's five, needs Docker and a licensed Foundry container, and cannot run on a GitHub Actions runner at all, so it produces nothing per-PR and blocks on the maintainer's machine
- **AND** the reduced `rc`/`ci` smoke stays the CI/release gate and the `full` profile remains the occasional outer-loop visual-regression suite; the `full` profile is not run on a GitHub Actions runner
- **AND** the live-Foundry smoke remains the fidelity authority: where a Foundry-free frame and a smoke frame of the same view disagree, the smoke frame is correct and the renderer is defective
- **AND** the agent stores PR-scoped screenshots only under `tmp/pr-screenshots/<number>/` while preparing evidence
- **AND** `npm run screenshots:ui:publish -- --pr <number>` uploads the collected screenshots to S3 (`pr-screenshots/<number>/`) and embeds the returned `![pr-<number> ...]` markdown into a managed block in the PR body
- **AND** the agent cleans `tmp/pr-screenshots/<number>/` immediately after the evidence is added to the PR
- **AND** generic unrelated image links are not sufficient evidence
- **AND** uploaded artifact names or `test-results/` paths are treated as automation fallback evidence, not the normal visible PR screenshot handoff

#### Scenario: validating automated screenshot provenance

- **WHEN** an automated screenshot is collected for an affected view
- **THEN** the run summary reports success and is not degraded
- **AND** summary and capture manifest identify the same run and exact requested source head
- **AND** requested target labels include the view and the PNG is bound to its capture record
- **AND** manifest-declared dimensions equal decoded PNG dimensions
- **AND** view-specific parity, stress-frame, or dimension constraints remain additive and may be stricter than the generic provenance check

#### Scenario: the run summary does not qualify as publishable evidence

- **WHEN** collection refuses a run because its summary reports an unsuccessful, degraded, or renderer-crashed run, or records step failures or un-waived console errors
- **THEN** the refusal names each condition that disqualified the summary, with the value it measured, rather than the class of fault alone
- **AND** it quotes a bounded excerpt of the failing steps and the un-waived console errors the summary recorded, and states plainly where the summary recorded no evidence for a condition, or did not record its value at all
- **AND** it states how to establish whether the same fault is already present at the pull request's base, because a single run's summary carries no evidence of which head caused it

#### Scenario: reaching a named view state

- **WHEN** a captured view requires the application to be on a particular internal route or selection
- **THEN** the case declares the state it expects and the capture asserts the application reached it before the frame is taken
- **AND** a case whose navigation resolves to a different state fails rather than publishing the frame it reached

#### Scenario: evidence is produced without a local run

- **WHEN** a PR changes render files and the change is able to run the automated producer
- **THEN** the affected cases are selected from the changed-file set, rendered, and published into the PR's managed screenshot block without a maintainer running anything locally
- **AND** the automated producer is an accelerator, not an additional gate: a change that cannot run it (for want of the credentials or the write access the producer needs) falls back to the existing evidence path and is not failed for producing nothing
- **AND** a selection that resolves to no case announces that outcome explicitly, and is never reported the same way as a run that rendered frames
- **AND** a producer that selected cases but rendered none fails, because a run that publishes nothing is indistinguishable from success to every downstream check

#### Scenario: the gate and the automated producer run concurrently

- **WHEN** a pull request changes render files and the automated producer is able to run for that head
- **THEN** the evidence gate does not decide until that pull request's producer run for that exact head has reached a conclusion, except where it already holds evidence sufficient to decide without that run's output
- **AND** it re-reads the pull request body after that conclusion rather than deciding on a copy fetched before the producer wrote it
- **AND** where several producer runs exist for one head, an unfinished one is awaited rather than an older finished one being read in its place
- **AND** a producer run that is cancelled because a newer head superseded it does not fail the superseded head's gate, since the new head's own run is the authoritative one
- **AND** a producer that never concludes fails the gate, because a gate that passes on a timeout can be waited out
- **AND** the gate does not wait where no producer run can exist for that head, so a pull request the producer cannot serve is decided immediately on the evidence in its body rather than reported as skipped
- **AND** that exception is exactly this: a gate that already holds satisfying evidence for the current head decides immediately, without waiting on a producer whose output it does not need

#### Scenario: naming which evidence problem a failure is

- **WHEN** the gate fails a pull request that changes render files
- **THEN** the failure names which of these it is: no screenshot section where none was ever going to be produced automatically, a producer that was expected and never appeared, a producer whose run was cancelled without a newer head having superseded it, a producer that failed, a producer that concluded while publishing nothing, frames published for a different head, frames that depict none of the views this change selects, a producer that did not conclude, or the gate itself being unable to read the pull request's body when it goes to check what the producer published
- **AND** a producer that was expected for this head and has not appeared is never reported as evidence the author failed to supply, because that is the same red this requirement exists to remove
- **AND** a cancelled run is excused only when a newer head superseded it before its capture finished, since that newer head's own run is then the authoritative one; a cancelled run whose head has not moved is this failure instead, since the same cancellation means the opposite thing depending on whether the head moved
- **AND** a producer that concludes successfully while publishing nothing — because the infrastructure it depends on was unavailable, which it treats as outside the pull request's control — is reported as that, and never as a fault in the change
- **AND** a producer that fails is reported as a failure of that run, distinctly from an infrastructure gap, because the two point the reader at different things to fix
- **AND** the gate being unable to read the pull request's body is reported as that, and never as the producer having published nothing, because an unread body carries no evidence of what the producer did and conflating the two sends the reader to debug the wrong system
- **AND** a body the gate cannot read fails the gate rather than passing it, because a check that passes when it cannot read its own evidence can be satisfied by breaking that read
- **AND** automatically published frames are identified by the case they depict and the head they were drawn for, carried in their published location rather than in their caption
- **AND** evidence supplied by a person, which carries no such identity, satisfies the gate without that identification, so the maintainer-supplied path is unchanged
- **AND** identification requires the automatically published frames to overlap the selected views rather than to equal them, because a run that renders only some of its selection has still produced evidence
- **AND** automatically published frames left over from an earlier head do not satisfy the gate, since a stale frame depicts a state the pull request no longer proposes

#### Scenario: a changed render file claims no case

- **WHEN** a render file inside a captured window is claimed by no case's selection patterns
- **THEN** the omission fails at authoring time rather than at capture time
- **AND** the reason this is gated is that an unclaimed path does not produce NO evidence — selection falls back — it produces UNRELATED evidence, a frame of a different window offered as proof of a change it does not contain
- **AND** a path deliberately left unclaimed carries a recorded reason, and that record is itself gated so it cannot outlive the thing it exempts

#### Scenario: the producer's own inputs change

- **WHEN** a PR changes any input the producer itself renders from — the fixture world, the mounting page, the case registry, the capture driver, or the window-chrome specification — rather than a file the product renders
- **THEN** one case per captured SURFACE is selected by default — every application the producer renders and every route or tab reachable within it, each photographed once — because a change to a shared input can alter any frame at once, and what it has to prove is that the producer still reaches and captures every route and tab
- **AND** the default is not every publishable case, because the detailed states of a route are evidence about the files that draw them rather than about a shared input, and a selection nobody reads is not evidence
- **AND** a surface is a route or a tab and NOT every screen: a route's own internal tabs fold into that route's single frame, because no case declares which one it reaches, so they are deferred alongside detailed states rather than covered
- **AND** that surface set is derived from what the cases already declare about themselves — the route or tab each reaches, and the application theme it renders under — rather than enumerated, so a route added later is covered without anyone remembering to cover it
- **AND** each surface is represented by a frame that shows that route or tab rather than a variant of it — preferring, in order, the application's default window geometry, no dialog covering the screen, and the least-driven state of it — wherever the surface offers such a frame
- **AND** a narrower selection is permitted only on an axis a case already declares about itself, or from a diff whose hunks are verified against the content of the file the producer will actually render
- **AND** that verification locates each of the diff's hunks by searching the file's own content rather than by trusting the line numbers the hunk header claims, and where the content recurs it attributes the hunk at every location it could be and answers with their union, which contains the true one
- **AND** that distinction matters because the producer renders a merge commit while the diff describes the head it was generated against, so trusting the header's line numbers verifies against a file whose lines may have shifted, and can silently attribute a change to the wrong case where a window of the file recurs verbatim
- **AND** widening happens on an input the registry does not narrow, a diff it cannot parse, a hunk with no anchor or an empty sequence to anchor by, or a changed line landing outside every attributed region — and not merely because a recurring anchor's candidate locations disagree, since disagreement is answered by their union
- **AND** this holds even though none of the producer's own inputs is itself a render file, since selecting on render files alone would select nothing for exactly the changes most able to invalidate the corpus
- **AND** widening is a UNION at every level and never a replacement: a change whose reach is partly attributable and partly not selects what was attributed TOGETHER WITH the surface set, whether the unattributable part is another hunk of the same patch, another shared input in the same change, or a co-changed render file
- **AND** the reason that has to hold at every level is that the surface set contains no detailed state, so replacing an attributed selection with it would publish a capture of everything except the thing the change altered

#### Scenario: screenshot capture is blocked

- **WHEN** a UI-changing PR genuinely cannot capture screenshots because the Foundry smoke harness or browser is unavailable
- **THEN** a maintainer (not an agent) applies the `screenshots-exempt` label to waive the required `check-screenshots` gate
- **AND** there is no self-serve `SCREENSHOTS_NEEDED:` text bypass; the gate cannot be satisfied from the PR body without real screenshot evidence or the maintainer label

#### Scenario: a maintainer replaces automated visual production

- **WHEN** an issue-specific maintainer instruction replaces the automated screenshot producer
- **THEN** the workflow records the affected views and reports agent visual approval as pending maintainer evidence
- **AND** the instruction does not itself satisfy or waive `check-screenshots`
- **AND** the PR still requires qualifying maintainer-provided evidence embedded in `Screenshots (if applicable)` or a maintainer-applied `screenshots-exempt` label

#### Scenario: smoke screenshots need images

- **WHEN** smoke fixture data needs item, environment, event, or placeholder imagery
- **THEN** it uses Foundry VTT core or dnd5e non-SVG raster icon paths directly
- **AND** it does not invent custom SVG preview art for smoke screenshots

### Requirement: View-case reach declaration

Every case in the canonical view-case registry MUST declare how far it actually gets: whether it lands on its live-smoke counterpart's own condition, reaches only the application window that counterpart shows, or covers a condition the smoke never walks.
A case of the third kind MUST carry no smoke pairing, because there is nothing to compare it against.
An approximate case that does not declare itself approximate is worse than no case, because a reviewer cannot tell which frames are evidence and which are gestures.

#### Scenario: a case falls short of its counterpart

- **WHEN** a case reaches the right application window but not the specific condition its counterpart shows
- **THEN** it declares that, and its shortfall is accounted for by an entry in the standing known-gaps register
- **AND** the register records shortfalls by CLASS rather than per case, so that one entry covers every case blocked by the same cause and the record stays worth reading

#### Scenario: a condition cannot be reached by the renderer at all

- **WHEN** a condition depends on behaviour the Foundry-free renderer does not have, such as a native Foundry dialog or a Foundry-side service call
- **THEN** the case stays declared as falling short and the limitation is recorded in the register
- **AND** the renderer does not substitute a facsimile of the missing behaviour, because a frame depicting UI the product never draws is evidence of something that does not exist

### Requirement: Documentation screenshot provenance

A new or replaced screenshot on the documentation site MUST be generated from a named view case rather than curated by hand.
A screenshot committed before this requirement's generator existed remains valid documentation evidence without migration, because retiring evidence that is still accurate buys nothing and a rule that silently indicts shipped work is a rule nobody can act on.

#### Scenario: a doc page declares a case slot

- **WHEN** a documentation page needs a visual reference for a view the canonical view-case registry covers
- **THEN** the page declares an image slot naming that case id, and the committed asset is generated from that case
- **AND** a slot whose asset is absent fails a gate rather than rendering a hole

#### Scenario: only exact and beyond cases feed documentation

- **WHEN** a case is selected to feed a documentation slot
- **THEN** only a case declaring `reaches: exact` or `reaches: beyond` may be used
- **AND** a case that reaches the right application window but not the specific condition its live-smoke counterpart shows is refused, under the View-case reach declaration requirement, because publishing it as a documentation reference would present a shortfall as the condition the page describes

#### Scenario: generation fails closed

- **WHEN** the harvested Foundry window chrome, the image encoder, or the decoder the frame comparison needs is absent at generation time
- **THEN** generation aborts naming what is missing and how to obtain it, and writes no image
- **AND** no approximated frame is emitted, because a reader cannot tell a wrong documentation screenshot from a right one, which makes it worse than a stale one
- **AND** the restriction on harvested material is the one already stated in the Harvested Foundry window chrome requirement, and nothing here widens or narrows it

#### Scenario: a frame whose render did not succeed this run

- **WHEN** the renderer reports a per-case failure while an earlier run's output for that case is still on disk
- **THEN** that frame is not consumed, because the renderer accumulates output and a surviving stale frame would otherwise be republished as current documentation

#### Scenario: only changed frames are rewritten

- **WHEN** the generator runs against an already-populated documentation image set
- **THEN** it rewrites only those frames whose fresh render differs from the committed one by more than the renderer's own measured noise
- **AND** it reports which images changed and which were left alone, so a reviewer can tell a real visual change from re-encoding noise
- **AND** both sides of the comparison pass through identical encoding, so that the encoder's own treatment is not mistaken for a render difference
- **AND** the provenance digest is taken over the renderer's output rather than the published asset, so that changing the encoder cannot present itself as a visual change

#### Scenario: the renderer's own noise is not a documentation change

- **WHEN** two renders of the same case differ only by antialiasing jitter, which this renderer produces and which moves between runs rather than settling
- **THEN** the frame counts as unchanged and is not rewritten, because rewriting a tenth of the set on every run destroys the reviewable diff the selective rewrite exists to protect
- **AND** the tolerance that decides this is derived from measured noise and is required to be narrower than the smallest change a reader would notice, demonstrated in both directions, so that it cannot widen into a blindfold

#### Scenario: the toolchain that produced the frames changes

- **WHEN** the harvested Foundry version or the browser build that rasterises the frames changes
- **THEN** the whole generated set is expected to be rewritten with no visual change to review
- **AND** the provenance that produced the set is recorded alongside it and gated, so that such a rewrite is identifiable as a toolchain change rather than mistaken for content changes

#### Scenario: the map is gated in both directions

- **WHEN** either a documentation image or the case id feeding it is renamed, added, or removed
- **THEN** a gate fails unless both sides move together, so neither can drift out from under the other
- **AND** the generated images occupy a namespace distinct from hand-curated ones, so that the reverse direction enumerates real files rather than restating the map to itself

#### Scenario: a screenshot predating the generator

- **WHEN** a screenshot was committed to the documentation site before this requirement's generator existed
- **THEN** it remains valid documentation evidence and is not required to be re-authored through an image slot
- **AND** only a new or replaced screenshot must use the generated slot mechanism

### Requirement: Provider-specific skill metadata

Skills SHOULD include provider-specific metadata under the skill directory when that provider benefits from explicit discovery hints.

#### Scenario: OpenAI/Codex skill metadata

- **WHEN** a skill is intended for OpenAI/Codex reuse
- **THEN** it may include `agents/openai.yaml` within the skill directory

### Requirement: Two-class performance measurement baselines

Committed performance baselines MUST contain only machine-invariant values, and machine-dependent measurements MUST NOT be committed or asserted.
Comparison between two runs MUST be refused when the runs came from environments that cannot be meaningfully compared.

#### Scenario: recording a performance measurement

- **WHEN** the deterministic benchmark harness measures a profile
- **THEN** it writes operation counts, model counts, serialized payload sizes, and fixture checksums to a committed class-1 baseline under `benchmarks/baselines/`
- **AND** it writes wall clock and heap to a gitignored class-2 run record carrying the commit, branch, dirty flag, Node and V8 versions, OS, architecture, CPU model and count, memory, containerization, fixture profile, fixture seed, and harness version
- **AND** no committed artifact contains a wall-clock or heap value, and no test asserts one
- **AND** fixture generation and case setup run outside every timed region

#### Scenario: guarding a committed baseline against drift

- **WHEN** a committed class-1 count or fixture checksum changes
- **THEN** a drift test re-derives the counts from the fixtures and the code under measurement and fails, naming the case, the count, and both values
- **AND** the failure instructs the author to re-record the baseline in the same pull request and state what moved and why

#### Scenario: comparing two performance runs

- **WHEN** two class-2 run records are compared
- **THEN** the comparison is refused, naming the differing fields, when their Node version, CPU model, or architecture differ
- **AND** an accepted comparison reports a median ratio with an interquartile band rather than absolute milliseconds
- **AND** a band spanning parity is reported as no measured difference rather than as a change

#### Scenario: varying an independent scaling dimension

- **WHEN** a measured hot path's cost is a product of two quantities
- **THEN** each quantity is a separate fixture dimension that varies while the other is pinned, so a regression is attributable to one of them
- **AND** the dimension is reported as a series of at least three points rather than as a single number
- **AND** each fixture declares the composition that decides which branch of the measured path it exercises

### Requirement: Opt-in live-Foundry performance measurement

Measurement that requires a licensed Foundry installation MUST be an opt-in profile of the existing Foundry harness, MUST run in no required check, and MUST NOT start or download anything before its preconditions are met.
Its measurements MUST NOT become assertions.

#### Scenario: adding a live-Foundry measurement profile

- **WHEN** performance behaviour can only be observed inside a running Foundry
- **THEN** the profile is added to the existing harness's check and profile mechanisms and reuses its container identity, world lifecycle and teardown, rather than introducing a second harness, compose file or world script
- **AND** the profile is declared in no GitHub Actions workflow, and a test fails when one references it
- **AND** the profile carries its own wall-clock budget entry rather than inheriting a smoke walk's

#### Scenario: preconditions for a licensed measurement run

- **WHEN** a live-Foundry profile is invoked
- **THEN** it checks for the container runtime, the credentials, the already-cached Foundry image and the fixtures it seeds, before any build, container start or download
- **AND** an unmet precondition exits non-zero naming the precondition and the command that satisfies it
- **AND** no image, Foundry build or licence material is fetched by the check itself

#### Scenario: seeding a large corpus for measurement

- **WHEN** a measurement profile needs a corpus at the scale being characterised
- **THEN** the corpus is written as a bounded number of persistence writes that does not vary with corpus size, rather than through a per-record authoring API
- **AND** the fixtures are the ones the Foundry-free harness uses, so the two layers measure the same corpus
- **AND** the world is reloaded after seeding, so a startup measurement is taken against the seeded corpus rather than an empty world
- **AND** the composition the store actually retained is counted against the composition requested, and any drift is reported

#### Scenario: attributing startup cost to the module

- **WHEN** a measurement reports startup time attributable to the module
- **THEN** the module opens explicit performance mark boundaries around its own initialization and around each nested phase whose cost scales with the corpus
- **AND** the instrumentation degrades to a no-op rather than failing a boot when the timing API is absent, partial or throwing
- **AND** a phase that reported no measurement is recorded as missing rather than as zero

#### Scenario: recording a live-Foundry measurement

- **WHEN** a live-Foundry profile completes
- **THEN** every duration and heap value is written to a gitignored run record, is never asserted, and carries a statement in the artifact itself that it must not be quoted as an absolute
- **AND** counts are recorded against the Foundry build, game system and fixture that produced them, and no live-Foundry measurement is committed as a baseline
- **AND** a comparison between two run records is refused, naming the differing fields, when their host, Foundry build, arm, game system, browser build, fixture profile or fixture seed differ
- **AND** every measurement the profile declares but does not implement records what blocks it, and every declared measurement that produced no result is reported by name
