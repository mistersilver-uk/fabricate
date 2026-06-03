# Agentic Workflow Spec Delta

## ADDED Requirements

### Requirement: UI PR screenshot evidence

Pull requests that change UI files MUST include generated screenshot evidence for the relevant changed views before the PR is opened or updated.

#### Scenario: UI files changed

- **WHEN** a PR changes files under `src/ui/`, `styles/`, or files ending in `.svelte` or `.css`
- **THEN** the agent generates screenshots for the changed views
- **AND** the PR body references committed screenshots under `docs/assets/pr-screenshots/pr-<number>/` or uploaded screenshot artifacts
- **AND** generic unrelated image links are not sufficient evidence

#### Scenario: screenshot capture is blocked

- **WHEN** a UI-changing PR cannot capture screenshots because the renderer, browser, or Foundry harness is unavailable
- **THEN** the PR body includes `SCREENSHOTS_NEEDED: <reason and visual change summary>`
- **AND** the reason is non-empty and specific enough for a reviewer to reproduce the missing evidence

#### Scenario: mock UI screenshots need images

- **WHEN** generated screenshot fixture data needs item, environment, hazard, or placeholder imagery
- **THEN** it uses non-SVG raster icon files copied from Foundry VTT core and dnd5e through the repository asset manifest under `tests/fixtures/ui-assets/`
- **AND** it does not invent or check in custom SVG preview art
