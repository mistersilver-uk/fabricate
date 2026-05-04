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

### Requirement: Shared skill source

Shared reusable skills MUST live under the repository `skills/` directory.

#### Scenario: provider-specific skill discovery

- **WHEN** a provider-specific skill root is needed
- **THEN** it points back to the canonical `skills/` directory instead of carrying a divergent copy

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

### Requirement: Manager V2 route planning

Agents planning or implementing Manager V2 feature routes MUST account for placeholder promotion, route wiring, display seams, and tests as a single workflow.

#### Scenario: promoting a placeholder route

- **WHEN** a Manager V2 feature route moves from planned placeholder to implemented UI
- **THEN** the agent removes the feature from disabled placeholder/deferred-view data
- **AND** adds feature-gated navigation, route normalization, breadcrumbs, title/subtitle/header labels, main route rendering, inspector routing, localization, CSS, and focused mounted/source-contract coverage

#### Scenario: diagnosing an unclickable Manager V2 feature button

- **WHEN** a Manager V2 feature button cannot be clicked
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
