# Tasks — Remove Legacy UI (#145)

## Admin class collapse
- [x] Merge `SvelteRecipeManagerApp` logic into the surviving manager app as one
      flat `ApplicationV2` shell; delete `SvelteRecipeManagerApp.svelte.js`.
- [x] Flatten `_prepareSvelteProps()`; drop the `openCurrentAdmin` service.
- [x] Merge the `close()` overrides preserving guard order.

## Reference cleanup
- [x] Remove the `SvelteRecipeManagerApp` side-effect import from `main.js`.
- [x] Drop `registerSvelteRecipeManagerApp` / `getRecipeManagerAppClass` from
      `appFactory.js`.
- [x] Repoint `game.fabricate.api.openRecipeManager()` at the surviving manager.
- [x] Remove the "open current admin" button(s) from the manager root component.

## Deletions
- [x] Delete Handlebars apps `CraftingApp`, `RecipeManagerApp`, `RecipeEditorApp`.
- [x] Delete `RecipeManagerRoot.svelte` and its tab components.
- [x] Delete the legacy `apps/environments/` editor directory.
- [x] Delete orphaned components `ActorSelector`, `SourceActorPicker`,
      `TeaserProgressEditor`.

## "V2" rename
- [x] Rename class, file, `manager/` directory, and root component.
- [x] Rename app factory functions, app id, and CSS class prefixes.
- [x] Rename the `FABRICATE.Admin.ManagerV2.*` localization namespace.
- [x] Rename `manager-v2-*` test files; update canonical specs.

## Tests & cleanup
- [x] Delete legacy-only tests; salvage kept-module assertions from mixed files.
- [x] Remove dead localization keys (`OpenCurrentAdmin`, `LegacyFallback*`).
- [x] Remove cleanly-bounded dead CSS blocks (`feature-card`, `token-list`,
      recipe-graph); delete the obsolete legacy-admin CSS regression tests.
- [x] `npm test` and `npm run build` green.

## Foundry smoke suite
- [x] Rename V2 tokens in `scripts/foundry-test-run.mjs` to match the new API
      / app id / CSS class names (`getCraftingSystemManagerAppClass`,
      `fabricate-crafting-system-manager`, `.fabricate-manager`, `manager-*`).
- [x] Delete Phase D ("Screenshot Recipe Manager" — the legacy admin
      screenshot tour) and the helpers it owned
      (`setRecipeManagerWindowSize`, `prepareGmEnvironmentsScreenshotState`,
      `scrollEnvironmentEditorTo`, `scrollEnvironmentEditorToTop`,
      `assertPointerTarget`, `exerciseGmEnvironmentCardPointerActions`,
      `assertGmEnvironmentCardMediaContained`).
- [x] Drop the "Open current admin" button click from the system-edit pointer
      exercise; clean up the inert `.fabricate-admin` selectors in
      `closeOpenApplications`.
- [x] `npm run test:foundry` (full profile) green locally.

## Follow-ups
- [ ] Excise the remaining inert `.fabricate-admin` legacy CSS interleaved in
      `styles/fabricate.css`.
