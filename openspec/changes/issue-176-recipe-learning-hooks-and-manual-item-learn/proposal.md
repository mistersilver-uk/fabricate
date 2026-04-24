# Proposal: Issue #176 Recipe Learning Hooks And Manual Item Learn

## Summary

Close the runtime gap between the existing recipe-learning specification and the current module bootstrap by wiring owned-item learning hooks and the manual item-sheet learn action that `recipe-visibility` and `ui-integration` already require.

## Motivation

- `RecipeVisibilityService` already implements single-recipe learning, deterministic matched-item selection, and consume-on-learn behavior.
- The active runtime only wires inventory refresh and fragment discovery on owned-item creation; it does not register spec-compliant recipe-item learning hooks.
- The actor-owned item-sheet header learn affordance required when `learn.dragDropEnabled === false` is missing entirely.
- Issue `#176` is therefore an implementation defect against canonical OpenSpec requirements, not a new product-behavior proposal.

## Scope

- register a spec-compliant owned-item learning hook path, preferring `createItem`
- honor `recipeVisibility.knowledge.learn.dragDropEnabled` exactly
- add the manual actor-owned item-sheet header learn control and confirmation flow
- route both auto-learn and manual-learn paths through shared service logic
- add coverage for single-match, multi-match, already-learned, no-match, permission-gated, and consume-on-learn flows

## Out Of Scope

- changing canonical learning semantics in `openspec/specs/recipe-visibility/spec.md`
- changing item-based visibility rules outside the existing learn flows
- redesigning the crafting app or introducing new learning UI outside actor-owned item sheets
- adding new recipe visibility modes, hook types, or admin settings

## Spec Notes

No canonical spec delta is required for this issue. The normative behavior already exists in:

- `openspec/specs/recipe-visibility/spec.md`
- `openspec/specs/ui-integration/spec.md`

This change folder is the implementation handoff for bringing runtime behavior into compliance with those existing requirements.
