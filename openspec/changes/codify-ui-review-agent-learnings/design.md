# Design

## Agent Updates

Update the custom Fabricate agents that participate in UI work:

- `fabricate_orchestrator`: plans must state screenshot acceptance criteria, representative fixture needs, UX review gates, and when live pointer hit-tests are required.
- `fabricate_implementer`: UI work must validate rendered outcome against criteria, avoid global class collisions, and record screenshot evidence/gaps.
- `fabricate_quality_engineer`: QA must treat screenshots as evidence only after checking layout/interaction criteria and must prefer real pointer hit-tests for unreliable UI.
- `fabricate_reviewer`: review must reject screenshot-only claims that do not map artifacts to acceptance criteria.
- `fabricate_ux_designer`: UX review must inspect screenshots for clipping, spacing, alignment, scroll containment, visible controls, and first-view content.

## Skill Updates

Mirror the same durable rules into the shared skills:

- `fabricate-orchestrator`
- `fabricate-implementer`
- `fabricate-quality-engineer`
- `fabricate-reviewer`
- `fabricate-ux-designer`
- `playwright-skill`

The Playwright skill gets a reusable `elementFromPoint` pointer hit-test pattern because this is a general browser automation concern, not just a Fabricate concern.

## Validation

This is instruction-only work. Validate by:

- checking TOML parses for edited custom agents;
- checking YAML parses for existing skill metadata if modified;
- running `git diff --check`;
- reviewing the changed text for concise, non-duplicative guidance.
