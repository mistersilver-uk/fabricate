# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Removed

- `_normalizeResolutionMode` no longer passes `'mapped'` or `'tiered'` through as valid resolution modes; both now normalize to `'routed'` (consolidates #80, #103, #105 via #134).
- `tier` field removed from `_normalizeComponent` output; the `difficulty` field serves the progressive-mode purpose (#134).
- `enableTiers` and `tiers` fields removed from `_normalizeSystem` output; these were hardcoded dead values from the removed tiered mode (#134).
- Dead-code `enableTiers` branches removed from `RecipeManager._matchesIngredient` and `_getSystemFeatures` (#134).
