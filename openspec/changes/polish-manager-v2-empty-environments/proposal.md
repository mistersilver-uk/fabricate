# Polish Manager V2 Empty Environments

## Summary

Refine the Manager V2 Environments empty state for gathering-enabled systems that do not yet have any gathering environments.

## Motivation

The current empty state only says that no environments exist and the inspector still prompts the GM to select an environment. That is not useful when there are no rows to select.

## Scope

- Replace the first-environment empty state with localized setup copy that explains what environments define.
- Preserve loading, error, and filtered-empty behavior.
- Add contextual inspector setup guidance for gathering-enabled systems with no environments.
- Link to published gathering/environment documentation from the inspector.

## Out Of Scope

- Changing environment persistence, validation, schema, or Foundry runtime behavior.
- Reworking the legacy Environments tab or player Gathering UI.
- Adding npm dependencies.
