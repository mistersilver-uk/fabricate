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

### Requirement: Provider-specific skill metadata

Skills SHOULD include provider-specific metadata under the skill directory when that provider benefits from explicit discovery hints.

#### Scenario: OpenAI/Codex skill metadata

- **WHEN** a skill is intended for OpenAI/Codex reuse
- **THEN** it may include `agents/openai.yaml` within the skill directory
