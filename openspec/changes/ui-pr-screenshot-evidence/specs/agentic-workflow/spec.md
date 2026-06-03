# Agentic Workflow Spec Delta

## ADDED Requirements

### Requirement: UI PR screenshot evidence

Pull requests that change UI files MUST include smoke-run screenshot evidence for the relevant changed views before the PR is opened or updated.

#### Scenario: UI files changed

- **WHEN** a PR changes files under `src/ui/`, `styles/`, or files ending in `.svelte` or `.css`
- **THEN** the agent runs the Foundry smoke harness and collects the relevant smoke screenshots for the changed views
- **AND** the agent stores PR-scoped screenshots only under `tmp/pr-screenshots/<number>/` while preparing evidence
- **AND** the PR body references uploaded or attached screenshot evidence
- **AND** the agent cleans `tmp/pr-screenshots/<number>/` immediately after the evidence is added to the PR
- **AND** generic unrelated image links are not sufficient evidence

#### Scenario: screenshot capture is blocked

- **WHEN** a UI-changing PR cannot capture screenshots because the Foundry smoke harness or browser is unavailable
- **THEN** the PR body includes `SCREENSHOTS_NEEDED: <reason and visual change summary>`
- **AND** the reason is non-empty and specific enough for a reviewer to reproduce the missing evidence

#### Scenario: smoke screenshots need images

- **WHEN** smoke fixture data needs item, environment, hazard, or placeholder imagery
- **THEN** it uses Foundry VTT core or dnd5e non-SVG raster icon paths directly
- **AND** it does not invent custom SVG preview art for smoke screenshots
