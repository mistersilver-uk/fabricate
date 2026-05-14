# Validate Gathering Drop Imports

## Summary

Gathering task drop rows can currently persist stale reward targets when they are imported, seeded, or saved through admin flows. Mythwright exposed this with SRD equipment rewards such as War Pick: a drop row could point at a raw item UUID even though Mythwright already owns a managed component for that equipment, or it could survive with an unresolved target when SRD lookup fails.

This change validates gathering drop reward references at data boundaries and changes Mythwright SRD equipment rewards to component-backed rows whenever the managed component exists.

## Goals

- Reject imported crafting system payloads that include gathering task drop rows with unresolved reward targets.
- Validate Mythwright seeded gathering tasks against the components built by the bootstrap before saving `fabricate.gatheringConfig`.
- Extend admin gathering task validation so stale component ids and unresolved item UUIDs are caught when system context is available.
- Keep the public drop row shape as `{ componentId?, itemUuid?, quantity, dropRate }`.
- Prefer Mythwright managed component ids for SRD equipment rewards, including `weapon-war-pick`, instead of raw compendium UUID drop rows.
- Include task and drop row names or ids in validation errors.

## Out of Scope

- Changing runtime reward resolution semantics beyond rejecting invalid persisted/imported rows.
- Removing support for valid `itemUuid` rewards.
- Adding npm dependencies.
- Changing Foundry compatibility metadata.

## Acceptance Criteria

- Imported gathering tasks fail before system persistence when an enabled drop row has no target, an unknown `componentId`, or an unresolved `itemUuid`.
- Admin task saves fail when system-aware validation detects an unknown component id or unresolved item UUID.
- Mythwright bootstrap omits optional SRD reward rows when the matching SRD item/component is unavailable, and reports the omission in the bootstrap summary.
- Mythwright War Pick uses `componentId: "weapon-war-pick"` and no `itemUuid`.
- Focused tests cover Mythwright bootstrap behavior, import validation, and admin validation.
- `npm test` and `npm run build` pass.

## Resolved Roster

- Plan: `fabricate_orchestrator`
- Plan review: `fabricate_domain_expert`, `fabricate_quality_engineer`
- Implementation: `fabricate_implementer`
- Post-implementation review: `fabricate_reviewer`, `fabricate_domain_expert`, `fabricate_quality_engineer`
- Docs loop: `fabricate_domain_expert`, `fabricate_docs_writer`

Subagents were not spawned in this run because the active tool policy only allows delegation when the user explicitly requests subagents.
