# Design

## Agent Updates

Update the custom Fabricate agents that participate in UI work:

- `fabricate_orchestrator`: plans must state screenshot acceptance criteria, representative fixture needs, UX review gates, and when live pointer hit-tests are required. It must route durable product behavior to canonical specs or active design docs instead of putting screen-specific rules in agent prompts.
- `fabricate_implementer`: UI work must validate rendered outcome against criteria, avoid global class collisions, record screenshot evidence/gaps, and read the canonical UI spec before making product-UI decisions.
- `fabricate_quality_engineer`: QA must treat screenshots as evidence only after checking layout/interaction criteria and must prefer real pointer hit-tests for unreliable UI. It must separate harness infrastructure failures from app regressions.
- `fabricate_reviewer`: review must reject screenshot-only claims that do not map artifacts to acceptance criteria, and must flag product-UI changes that are implemented without matching spec/design updates.
- `fabricate_ux_designer`: UX review must inspect screenshots for clipping, spacing, alignment, scroll containment, visible controls, first-view content, and whether long localized/content strings can destabilize fixed navigation areas.
- `fabricate_pr_explorer`: codebase mapping should include relevant canonical specs, active design notes, likely existing tests, and known validation harness constraints for the touched UI surface.

## Skill Updates

Mirror the same durable rules into the shared skills:

- `fabricate-orchestrator`
- `fabricate-implementer`
- `fabricate-quality-engineer`
- `fabricate-reviewer`
- `fabricate-ux-designer`
- `playwright-skill`

The Playwright skill gets a reusable `elementFromPoint` pointer hit-test pattern because this is a general browser automation concern, not just a Fabricate concern.

Fabricate-specific skills get concise validation caveats for the Foundry harness: `npm run test:foundry` can conflict with a local Foundry process on port `30000`; alternate ports require both `FOUNDRY_HOST_PORT` and `FOUNDRY_URL`; Docker/container launch or stale-name failures should be reported as infrastructure unless the app under test loaded and failed a product assertion.

## Spec And Design Updates

Product-specific manager-v2 rules belong in `openspec/specs/ui-integration/spec.md` and the active `fabricate-ui-design-system-manager-v2` design documents. This change records the learned contracts there instead of distributing them through every agent:

- selected-system navigation and breadcrumb behavior;
- fixed-height selected-system rail scope with truncation for long names;
- top-bar heading hierarchy without duplicate "View" kickers;
- count fact wrapping and disabled-count wording.

## Validation

This is instruction-only work. Validate by:

- checking TOML parses for edited custom agents;
- checking YAML parses for existing skill metadata if modified;
- running `git diff --check`;
- reviewing the changed text for concise, non-duplicative guidance.
