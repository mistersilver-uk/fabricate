# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Removed

- Removed orphaned `enableTiers` and `tiers` fields from `CraftingSystemManager._normalizeSystem()` output. Tiered mode was removed previously and these fields were hardcoded dead values (`false`/`[]`) that inflated stored data. (#105)
- Removed dead tier-check branches from `RecipeManager._matchesIngredient()` that were unreachable because `enableTiers` was always `false`. (#105)
- Removed `enableTiers`/`tiers` delete statements from `CraftingSystemExporter.stripTransitionalAliases()` since these fields are no longer emitted. (#105)
