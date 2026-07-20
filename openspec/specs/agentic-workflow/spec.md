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

#### Scenario: planning issue work

- **WHEN** work is non-trivial or spans multiple files, validations, or decisions
- **THEN** the workflow driver captures the change delta in the issue's managed `openspec-delta` block before code changes begin
- **AND** when the work originates from an existing issue it appends the block, preserving the reporter's original text, and when the work originates from a prompt with no issue it creates an issue from the `OpenSpec Change Delta` template
- **AND** it rewrites the block in place across plan-review iterations rather than appending duplicate blocks, and never edits outside the markers
- **AND** a spawned orchestrator helper remains read-only and returns draft or replacement managed-block text for the driver to apply

#### Scenario: implementing the delta into canonical specs

- **WHEN** the change requires canonical requirement changes
- **THEN** the implementer makes those changes under `openspec/specs/*/spec.md` (the only versioned spec source of truth) as required by the issue's `Spec Deltas`

#### Scenario: reconciling the implementation against the delta

- **WHEN** implementation is complete
- **THEN** post-implementation review and the documentation loop compare the actual `openspec/specs/` diff against the proposed delta in the issue
- **AND** they confirm the implementation faithfully realizes the delta, or — when implementation justifiably deviated — the issue's delta and its `Deviations` note are updated so the delta accurately describes what shipped

### Requirement: Branch and PR workflow

All mutating agent work MUST happen on a branch that is not `main`, `release`, or a hotfix line, and the workflow driver MUST deliver the integrated result through a PR targeting `main`.
A PR targets `release` or a hotfix line only for a hotfix to the current public release.
The release automation's forward-port merge from `release` into `main` is not agent work and is exempt from this requirement.

#### Scenario: starting mutable work

- **WHEN** the workflow driver will coordinate mutable work
- **THEN** it verifies that the clean coordinator checkout is on a non-protected integration branch
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

#### Scenario: read-only review work

- **WHEN** a review-only agent evaluates work
- **THEN** it reviews a fresh detached worktree pinned to the exact assigned integration commit against the supplied base and immutable diff artifact
- **AND** it must not commit, push, merge, mutate GitHub state, or reuse the lane after the integration commit changes

#### Scenario: working near the release branch

- **WHEN** an agent works on or near `release` or a hotfix line
- **THEN** it MUST NOT rebase or force-push that branch, because the release automation stores release state in git tags and in git notes
- **AND** it MUST NOT squash-merge a prerelease line into `release`, because squashing collapses Conventional Commit types and mis-computes the stable version
- **AND** it MUST NOT merge `release` or `main` into a hotfix line; a fix leaves a hotfix line by cherry-pick

### Requirement: Isolated agent worktrees

Every spawned agent MUST work from a unique repository-local Git worktree by default.
Mutable lanes MUST use exclusive branches, and read-only lanes MUST use detached snapshots pinned to the exact commit being evaluated.

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
- **AND** it creates each lane beneath `.worktrees/<issue>/` with a unique directory
- **AND** it assigns mutable branches named `agent/<issue>-<stage>-<role>-r<revision>`

#### Scenario: briefing a spawned agent

- **WHEN** the driver assigns a mutable or read-only lane
- **THEN** the brief supplies the absolute worktree path, issue, role, stage, revision, base SHA, expected branch or detached SHA, owned paths, dependency state, expected commit range, allowed focused checks, and handoff format
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

- **WHEN** implementation, plan, or documentation integration produces a new target commit
- **THEN** the driver creates fresh detached reviewer lanes at that commit and supplies the immutable base-relative artifact
- **AND** domain or canonical-spec reconciliation integrates before dependent documentation authoring
- **AND** domain and documentation cross-review may run concurrently only after both outputs integrate

### Requirement: Serialized validation and guarded cleanup

The workflow driver MUST serialize resource-heavy validation and MUST treat only gates run from the fully integrated coordinator branch as authoritative acceptance evidence.
Cleanup MUST preserve any lane whose integration or meaningful state has not been mechanically resolved.

#### Scenario: running local and CI gates

- **WHEN** lane work is in progress
- **THEN** agents may run focused checks allowed by their briefs
- **AND** the driver serializes dependency installation, complete tests, build, complete lint and format, Foundry or Docker smoke, and screenshot generation
- **AND** the driver runs required final gates from the fully integrated coordinator branch
- **AND** CI creates no agent worktrees and runs the repository's unchanged gates against the pushed integrated commit

#### Scenario: cleaning integrated lanes

- **WHEN** the workflow has accepted a lane's integrated output
- **THEN** the driver verifies its source-to-integrated mappings, stable patch equivalence, tracked state, and meaningful untracked state before removal
- **AND** known generated content is discarded only after confirming it contains no meaningful work
- **AND** forced worktree removal is allowed only after integration equivalence and meaningful-state checks succeed
- **AND** `git branch -D` is allowed for a cherry-picked lane only after every source commit is mapped and patch-equivalent to its integrated commit
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
- **THEN** it resolves to a registered agent in each active provider — `.codex/agents/<role>.toml` for Codex and the `.claude/agents/<role>.md` `subagent_type` for Claude
- **AND** the read-only mapping role `fabricate_pr_explorer`, which has no shared skill, resolves to `.codex/agents/fabricate-pr-explorer.toml` for Codex and to Claude's built-in `Explore` agent (no dedicated Claude binding)

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

### Requirement: Harness reference integrity

Harness documents — `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `openspec/README.md`, `.agents/skills/README.md`, `.agents/skills/*/SKILL.md`, every Markdown file recursively beneath `.agents/skills/*/references/`, `.claude/agents/*.md`, and `.codex/agents/*.toml` — MUST cite repository files by paths that exist and by symbol names rather than line numbers, and the agent-binding validator MUST enforce this mechanically.

#### Scenario: validating harness references

- **WHEN** `npm run validate:agents` runs
- **THEN** it verifies every conservatively path-shaped backtick reference in the harness documents resolves to an existing file or directory, allowing only entries in an explicit, commented allow-missing set
- **AND** it rejects line-number-based code citations (such as `file.js:NNN` or approximate line references) in the harness documents
- **AND** it verifies every skill-backed role's Claude binding declares a `model:` and its Codex binding declares a `model =`
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

### Requirement: UI PR screenshot evidence

Pull requests that change UI files MUST include smoke-run screenshot evidence for the relevant changed views before the PR is opened or updated.

#### Scenario: UI files changed

- **WHEN** a PR changes files under `src/ui/`, `styles/`, files ending in `.svelte` or `.css`, or a `lang/` file alongside any of those render files (a `lang/`-only change does not require screenshots)
- **THEN** the agent runs the Foundry smoke harness locally (the `full` profile via `npm run test:foundry`) and collects the relevant smoke screenshots for the changed views
- **AND** the full smoke profile is not run on a GitHub Actions runner
- **AND** the agent stores PR-scoped screenshots only under `tmp/pr-screenshots/<number>/` while preparing evidence
- **AND** `npm run screenshots:ui:publish -- --pr <number>` uploads the collected screenshots to S3 (`pr-screenshots/<number>/`) and embeds the returned `![pr-<number> ...]` markdown into a managed block in the PR body
- **AND** the agent cleans `tmp/pr-screenshots/<number>/` immediately after the evidence is added to the PR
- **AND** generic unrelated image links are not sufficient evidence
- **AND** uploaded artifact names or `test-results/` paths are treated as automation fallback evidence, not the normal visible PR screenshot handoff

#### Scenario: screenshot capture is blocked

- **WHEN** a UI-changing PR genuinely cannot capture screenshots because the Foundry smoke harness or browser is unavailable
- **THEN** a maintainer (not an agent) applies the `screenshots-exempt` label to waive the required `check-screenshots` gate
- **AND** there is no self-serve `SCREENSHOTS_NEEDED:` text bypass; the gate cannot be satisfied from the PR body without real screenshot evidence or the maintainer label

#### Scenario: smoke screenshots need images

- **WHEN** smoke fixture data needs item, environment, event, or placeholder imagery
- **THEN** it uses Foundry VTT core or dnd5e non-SVG raster icon paths directly
- **AND** it does not invent custom SVG preview art for smoke screenshots

### Requirement: Provider-specific skill metadata

Skills SHOULD include provider-specific metadata under the skill directory when that provider benefits from explicit discovery hints.

#### Scenario: OpenAI/Codex skill metadata

- **WHEN** a skill is intended for OpenAI/Codex reuse
- **THEN** it may include `agents/openai.yaml` within the skill directory
