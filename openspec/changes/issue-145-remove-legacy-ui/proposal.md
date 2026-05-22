# Remove Legacy UI (#145)

## Summary

Fabricate carried three layers of pre-V2 UI alongside the current Svelte UI:
the dead Handlebars `ApplicationV2` apps, the original Svelte admin
(`SvelteRecipeManagerApp` / `RecipeManagerRoot` and its tab components), and a
few orphaned Svelte components. This change removes all of it so the V2 Svelte
UI is the only UI, collapses the admin app to a single class, and drops the
now-meaningless "V2" suffix from the surviving crafting system manager.

## Goals

- Delete the dead Handlebars apps `CraftingApp`, `RecipeManagerApp`,
  `RecipeEditorApp` (never registered or imported at runtime).
- Delete the legacy Svelte admin: `SvelteRecipeManagerApp`,
  `RecipeManagerRoot.svelte`, its tab components, and the legacy
  `apps/environments/` editor directory.
- Collapse `SvelteCraftingSystemManagerV2App` into one standalone
  `ApplicationV2` shell with no legacy base class; the shared store/service
  plumbing is inlined.
- Keep the `game.fabricate.api.openRecipeManager()` public method working by
  repointing it at the surviving manager; remove the in-app "open current
  admin" affordance.
- Delete orphaned Svelte components with no production importers
  (`ActorSelector`, `SourceActorPicker`, `TeaserProgressEditor`).
- Rename the surviving manager to drop "V2": class, file, directory, root
  component, app factory functions, app id, CSS class prefixes, and the
  `FABRICATE.Admin.ManagerV2.*` localization namespace.
- Remove legacy-only tests; salvage kept-module assertions from mixed test
  files. Remove dead localization keys and the cleanly-bounded dead CSS blocks.

## Out of Scope

- Changing crafting, gathering, recipe, or admin behavior, persistence,
  schemas, or public API surfaces beyond the `openRecipeManager()` repoint.
- A full excision of the now-inert `.fabricate-admin` legacy CSS in
  `styles/fabricate.css`. The three cleanly-bounded dead blocks (`feature-card`,
  `token-list`, recipe-graph) were removed; the remaining `.fabricate-admin`
  rules are interleaved with live CSS and left as a follow-up.
- Reworking the Foundry smoke suite; it continues to exercise the V2 UI in CI.
