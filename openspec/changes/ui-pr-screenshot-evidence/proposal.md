# UI PR Screenshot Evidence

## Problem

UI-touching pull requests already have a CI screenshot check, but the check accepts broad image-like links and the agent guidance does not consistently require generated screenshots for the changed views. This lets UI PRs pass with weak or unrelated visual evidence.

## Proposed Change

- Reuse the existing CI screenshot check as the enforcement point.
- Move screenshot evidence detection into a versioned Node script so CI and local agents use the same rules.
- Require UI PR screenshot evidence to be committed under `docs/assets/pr-screenshots/pr-<number>/`, linked as an uploaded artifact, or explicitly deferred with `SCREENSHOTS_NEEDED: <reason>`.
- Add copied non-SVG Foundry VTT core and dnd5e raster icons plus a UI preview asset manifest for generated screenshot fixtures.
- Update agent guidance and shared skills so UI changes generate relevant screenshots before PR open/update and use the asset manifest for mock data instead of invented SVG art.

## Out of Scope

- Building a full Storybook-style UI catalogue.
- Replacing the live Foundry smoke harness.
- Requiring committed screenshots for every smoke-harness artifact.
