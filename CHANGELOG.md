# Changelog

All notable changes to Fabricate will be documented in this file.

## [Unreleased]

### Removed

- `enableTiers` and `tiers` fields are no longer emitted by `_normalizeSystem()`. These were hardcoded dead values left over from the tiered-mode removal. (#134)
- `tier` field is no longer emitted by `_normalizeComponent()`. The spec defines no `tier` field on Component; the `difficulty` field serves progressive-mode purposes. (#134)
- Dead-code tier-matching branches removed from `RecipeManager._matchesIngredient()`. The `features.enableTiers` flag was always `false` and the branches were unreachable. (#134)

### Fixed

- `_normalizeResolutionMode` now maps legacy `'mapped'` and `'tiered'` values to `'routed'` instead of passing them through as unrecognised values. (#134)
