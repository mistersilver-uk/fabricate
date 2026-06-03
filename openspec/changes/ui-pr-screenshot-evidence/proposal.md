# UI PR Screenshot Evidence

> **Superseded by `ui-pr-screenshot-evidence-hardening`.** This change's hosting
> (GitHub attachments / `SCREENSHOTS_NEEDED:` bypass) was replaced by S3-hosted
> embeds, a maintainer-only `screenshots-exempt` label, and `lang/` detection.
> See the hardening change and `openspec/specs/agentic-workflow/spec.md` for the
> current design; this folder is retained as history.

## Problem

UI-touching pull requests already have a CI screenshot check, but the check accepts broad image-like links and the agent guidance does not consistently require generated screenshots for the changed views. This lets UI PRs pass with weak or unrelated visual evidence.

## Proposed Change

- Reuse the existing CI screenshot check as the enforcement point.
- Move screenshot evidence detection into a versioned Node script so CI and local agents use the same rules.
- Require UI PR screenshot evidence to be collected under `tmp/pr-screenshots/<number>/`, uploaded through GitHub's native attachment flow, embedded as rendered images in the PR description, cleaned locally immediately after attachment, or explicitly deferred with `SCREENSHOTS_NEEDED: <reason>`.
- Collect PR-scoped screenshot evidence only from real Foundry smoke-harness artifacts under `test-results/`.
- Update agent guidance and shared skills so UI changes run the smoke harness, collect relevant screenshots before PR open/update, and avoid synthetic screenshot fixtures.
- Treat artifact names as automation fallback evidence only; normal UI PR handoff requires visible GitHub attachment image markdown in the PR description.

## Out of Scope

- Building a full Storybook-style UI catalogue.
- Replacing the live Foundry smoke harness.
- Requiring committed screenshots for every smoke-harness artifact.
