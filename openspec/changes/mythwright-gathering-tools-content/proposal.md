# Mythwright Gathering Tools Content

## Summary

Mythwright currently seeds only minimal gathering tasks, while the gathering runtime still relies on inline `task.tools` for tool gates and breakage even though the Manager V2 tools library persists gathering task references as `toolIds`. This change completes the runtime bridge from task `toolIds` to the per-system tools library and expands Mythwright's DnD5e bootstrap with practical gathering tools, broken-tool replacement components, repair recipes, and richer gathering rewards.

## Goals

- Resolve gathering task `toolIds` through the composed environment's `__libraryTools` map wherever the runtime checks, plans, applies, or records tools.
- Update the canonical gathering spec so stale or disabled required tool references are runtime blockers instead of ignored references.
- Preserve backwards compatibility for legacy inline `task.tools`.
- Block gathering starts when required library ids are missing or disabled, or when actor tools are missing, flagged broken, or fail requirements.
- Apply configured breakage and `replaceWith` behavior through the existing terminal tool side-effect service, and record `usedTools` evidence.
- Seed Mythwright with a deterministic tool library, broken-tool managed components, matching repair recipes, and richer gathering tasks across mines, wilds, ruins, battlefields, planar sites, and dragon lairs.

## Out of Scope

- New UI surfaces for gathering tools.
- New npm dependencies.
- Foundry API compatibility metadata changes.
- Party-wide or shared-container tool availability.

## Acceptance Criteria

- Tasks that contain only `toolIds` behave the same at runtime as tasks with equivalent inline `tools`.
- Missing or disabled library references and missing, flagged-broken, or requirement-failing actor tools block starts with `TOOL_BLOCKED`.
- Breakage plans and applies for library-resolved tools, including replacement with broken-tool components.
- Mythwright bootstrap remains idempotent and uses deterministic ids for tools, broken components, repair recipes, and seeded gathering tasks.
- Focused runtime and bootstrap tests cover the new behavior, and the normal project test/build gates pass.
