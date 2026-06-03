# Agentic Workflow Spec Delta

## MODIFIED Requirements

### Requirement: UI PR screenshot evidence

Pull requests that change UI files MUST include real smoke-run screenshot evidence for the relevant changed views before the PR is opened or updated. The required `check-screenshots` gate cannot be satisfied without real evidence or a maintainer exemption.

#### Scenario: UI files changed

- **WHEN** a PR changes files under `src/ui/`, `styles/`, `lang/`, or files ending in `.svelte` or `.css`
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

- **WHEN** smoke fixture data needs item, environment, hazard, or placeholder imagery
- **THEN** it uses Foundry VTT core or dnd5e non-SVG raster icon paths directly
- **AND** it does not invent custom SVG preview art for smoke screenshots
