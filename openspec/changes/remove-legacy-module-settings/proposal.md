# Remove Legacy Module Settings

## Why

Fabricate still registers several configurable module settings that no longer match the current product workflow:

- global module enablement
- simple-recipes-only filtering
- auto-craft confirmation bypass

These settings create stale Foundry configuration surface and keep runtime plumbing alive for behavior that should no longer be module-level policy.

## What Changes

- Remove the old configurable module settings and all runtime reads/writes that depend on them.
- Keep hidden persistence settings for Fabricate data and client preferences unchanged.
- Keep the Fabricate theme setting configurable.
- Add a visible world setting for experimental features, defaulting disabled, for future feature gates.

## Impact

- Crafting and salvage actions will show their confirmation dialogs unless an internal caller explicitly passes `skipConfirm`.
- Recipe browsing will no longer support the global simple-recipes-only module setting.
- Existing saved values for removed settings are not migrated or cleaned; they are simply no longer registered or used.
