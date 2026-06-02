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

Non-trivial changes MUST be planned in a dedicated change folder under `openspec/changes/` before implementation starts.

#### Scenario: planning issue work

- **WHEN** work is non-trivial or spans multiple files, validations, or decisions
- **THEN** the implementer creates or updates `proposal.md`, `design.md`, and `tasks.md` in `openspec/changes/<change>/`

### Requirement: Branch and PR workflow

All mutating agent work MUST happen on a non-`main` branch and be delivered through a PR targeting `main`.

#### Scenario: starting mutable work

- **WHEN** an agent will edit implementation, documentation, specs, prompts, skills, or workflow files
- **THEN** it verifies the current branch first
- **AND** if the branch is `main`, it creates or switches to a task branch before editing

#### Scenario: finishing mutable work

- **WHEN** an agent completes a scoped change
- **THEN** it commits the change to the task branch
- **AND** pushes the branch
- **AND** opens or updates a PR targeting `main`
- **AND** the PR title complies with Conventional Commits, including the GitHub issue number for `feat`, `fix`, and `perf`
- **AND** the PR description uses H2 sections for `Description`, `Benefit(s)`, `Changes in this PR`, `Testing`, and `Screenshots (if applicable)`

#### Scenario: responding to review feedback

- **WHEN** a reviewer requests changes on a PR
- **THEN** the implementing agent updates the same branch and PR
- **AND** it does not open a replacement PR unless the user explicitly asks

#### Scenario: read-only review work

- **WHEN** a review-only agent evaluates work
- **THEN** it reviews the active branch and PR against `main`
- **AND** it must not commit, push, or merge

### Requirement: Shared skill source

Shared reusable skills MUST live under the repository `skills/` directory.

#### Scenario: provider-specific skill discovery

- **WHEN** a provider-specific skill root is needed
- **THEN** it points back to the canonical `skills/` directory instead of carrying a divergent copy

### Requirement: Role persona bindings

Each agent role MUST be defined once in its canonical `skills/<role>/SKILL.md`. Provider agent definitions (`.codex/agents/*.toml` for Codex, `.claude/agents/*.md` for Claude) MUST be thin bindings that point at the canonical skill and MUST NOT carry divergent persona behavior.

#### Scenario: resolving a routing token

- **WHEN** the auto-spawn routing table in `AGENTS.md` names a role token such as `fabricate_orchestrator`
- **THEN** it resolves to a registered agent in each active provider — `.codex/agents/<role>.toml` for Codex and the `.claude/agents/<role>.md` `subagent_type` for Claude
- **AND** the read-only mapping role `fabricate_pr_explorer`, which has no shared skill, resolves to `.codex/agents/fabricate-pr-explorer.toml` for Codex and to Claude's built-in `Explore` agent (no dedicated Claude binding)

#### Scenario: changing role behavior

- **WHEN** a role's behavior must change
- **THEN** the edit is made in `skills/<role>/SKILL.md`
- **AND** the provider bindings remain thin pointers without duplicated instructions

#### Scenario: orchestration ownership

- **WHEN** role agents are spawned for a change
- **THEN** the workflow driver (the provider's top-level loop — Codex's depth-0 prompt agent or Claude's main loop) owns routing and the plan, implementation, and docs iteration loops
- **AND** scoped role agents execute their role and return without spawning or routing further agents

### Requirement: Product contracts stay in specs

Agents and skills MUST keep durable product behavior in canonical specs or active OpenSpec design docs, not in role prompts.

#### Scenario: UI learning becomes durable

- **WHEN** an implementation or review uncovers a reusable product UI rule
- **THEN** the agent updates the relevant `openspec/specs/*/spec.md` or active `openspec/changes/<change>/design.md`
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

### Requirement: Provider-specific skill metadata

Skills SHOULD include provider-specific metadata under the skill directory when that provider benefits from explicit discovery hints.

#### Scenario: OpenAI/Codex skill metadata

- **WHEN** a skill is intended for OpenAI/Codex reuse
- **THEN** it may include `agents/openai.yaml` within the skill directory
