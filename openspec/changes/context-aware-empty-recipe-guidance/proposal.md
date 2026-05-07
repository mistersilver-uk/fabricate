# Context-Aware Empty Recipe Guidance

## Summary

Make the Manager V2 empty Recipes guidance aware of whether the selected crafting system has components.

## Motivation

The empty recipe inspector currently tells GMs to create recipes after reusable components are available even when the selected system has zero components. That copy is directionally correct, but it misses the actionable next step: add components first.

## Scope

- Branch the empty Recipes inspector guidance by selected-system component count.
- When component count is zero, show component-first copy and an in-app action that opens the Components browser.
- Keep the existing recipe setup guidance when components already exist.
- Add localized copy, quickstart documentation, and focused Manager V2 tests.

## Out Of Scope

- Blocking recipe creation when no components exist.
- Changing recipe, component, or system persistence.
- Adding new dependencies or Foundry API requirements.
