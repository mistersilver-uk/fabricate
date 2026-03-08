# Svelte Migration Plan

**Task:** T-093 - Plan UI Migration from Handlebars to Svelte
**Status:** Approved (2026-03-07)
**Date:** 2026-03-07

---

## 1. Objectives

1. Replace all Handlebars (`.hbs`) templates with Svelte components to gain reactive state management, component composition, and modern tooling.
2. Eliminate manual DOM wiring (`data-action` dispatching, `_prepareContext()` serialisation) in favour of Svelte's declarative reactivity.
3. Preserve full Foundry VTT compatibility (ApplicationV2 lifecycle, drag-and-drop, localization, permissions).
4. Maintain uninterrupted GM and player workflows throughout the migration - no "big bang" cutover.
5. Resolve existing UI defects (T-089, T-090, T-091, T-094, T-095) as part of the component rewrite rather than patching Handlebars templates that will be deleted.

## 2. Benefits

| Benefit                         | Detail                                                                                                                                                |
|---------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Reactive UI**                 | Svelte stores replace manual `render()` calls; state changes propagate automatically.                                                                 |
| **Component reuse**             | Shared components (RecipeCard, IngredientRow, SearchBar, Badge) eliminate duplication across CraftingApp, RecipeManagerApp, and RecipeEditorApp.      |
| **Testability**                 | Components can be unit-tested in isolation with jsdom/happy-dom without Foundry runtime.                                                              |
| **Reduced template complexity** | The recipe-editor-v2.hbs alone is 705 lines of deeply nested Handlebars; equivalent Svelte components will be smaller and independently maintainable. |
| **CSS scoping**                 | Svelte `<style>` blocks scope CSS per component, eliminating class-name collisions with Foundry core and other modules.                               |
| **Developer experience**        | Hot module replacement, TypeScript support (future), and IDE autocompletion in `.svelte` files.                                                       |

## 3. Current Handlebars Inventory

| # | Template                               | Lines | Feature Area                   | User Entry Point              | Foundry App Class                  |
|---|----------------------------------------|-------|--------------------------------|-------------------------------|------------------------------------|
| 1 | `templates/crafting-app.hbs`           | 363   | Player crafting                | Sidebar button / macro        | `CraftingApp` (ApplicationV2)      |
| 2 | `templates/recipe-manager.hbs`         | 514   | GM system/item/recipe admin    | GM tools menu                 | `RecipeManagerApp` (ApplicationV2) |
| 3 | `templates/recipe-editor-v2.hbs`       | 705   | GM recipe editing              | Opened from RecipeManagerApp  | `RecipeEditorApp` (ApplicationV2)  |
| 4 | `templates/recipe-editor.hbs`          | 293   | Legacy recipe editor (v1)      | Unused / superseded           | `RecipeEditorApp` (legacy)         |
| 5 | `templates/partials/ingredientRow.hbs` | 71    | Partial: legacy ingredient row | Included by recipe-editor.hbs | N/A (partial)                      |
| 6 | `templates/partials/catalystRow.hbs`   | 101   | Partial: legacy catalyst row   | Included by recipe-editor.hbs | N/A (partial)                      |

**Total:** 6 templates, ~2,047 lines of Handlebars markup.

Templates 4-6 are legacy (v1 editor) and can be deleted once template 3 is confirmed as the sole editor path.

## 4. Target Svelte Architecture

### 4.1 Foundry Integration Pattern

Each top-level Foundry window remains an `ApplicationV2` subclass. Instead of `HandlebarsApplicationMixin`, a thin `SvelteApplicationMixin` mounts and destroys a root Svelte component:

```
┌─────────────────────────────────────────────┐
│  SvelteApplicationMixin(ApplicationV2)      │
│  ┌───────────────────────────────────────┐  │
│  │  _renderHTML() → mount(SvelteRoot,    │  │
│  │                        target, props) │  │
│  │  close()       → unmount(component)   │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

- `_renderHTML()` creates/updates the Svelte component, passing reactive props.
- `close()` calls `unmount()` for cleanup.
- The mixin handles Foundry lifecycle hooks (`_onRender`, `_onClose`, `_onPosition`).
- Drag-and-drop events are forwarded from Foundry's ApplicationV2 into Svelte via props/callbacks.

### 4.2 Component Hierarchy

```
src/ui/svelte/
├── apps/                          # Root components (one per Foundry window)
│   ├── CraftingAppRoot.svelte     # Player crafting interface
│   ├── RecipeManagerRoot.svelte   # GM admin interface
│   └── RecipeEditorRoot.svelte    # GM recipe editor
├── components/                    # Shared/reusable components
│   ├── SearchBar.svelte
│   ├── FilterBar.svelte
│   ├── RecipeCard.svelte
│   ├── RecipeList.svelte
│   ├── IngredientBadge.svelte
│   ├── EssenceBadge.svelte
│   ├── CatalystBadge.svelte
│   ├── RunSummary.svelte
│   ├── FavouritesSection.svelte
│   ├── ActorSelector.svelte
│   ├── SourceActorPicker.svelte
│   ├── SystemSidebar.svelte
│   ├── FeatureCard.svelte
│   ├── AccordionPanel.svelte
│   ├── IngredientSetPanel.svelte
│   ├── IngredientGroupCard.svelte
│   ├── ResultGroupPanel.svelte
│   ├── ItemPickerGrid.svelte
│   ├── LinkedRecipeItem.svelte
│   ├── ValidationBanner.svelte
│   ├── Badge.svelte
│   ├── DropZone.svelte
│   └── Pagination.svelte
├── stores/                        # Svelte stores for shared state
│   ├── craftingStore.js           # Actor selection, source actors, recipes, runs
│   ├── adminStore.js              # Selected system, active tab, components
│   └── editorStore.js             # Draft recipe, validation, panel state
├── actions/                       # Svelte use:action directives
│   ├── dragDrop.js                # Foundry drag-and-drop integration
│   └── tooltip.js                 # Foundry tooltip integration
└── util/
    └── foundryBridge.js           # Thin wrappers for Foundry APIs (localize, notifications, dialogs)
```

### 4.3 State Management Strategy

| Store           | Scope                     | Contents                                                                                              |
|-----------------|---------------------------|-------------------------------------------------------------------------------------------------------|
| `craftingStore` | CraftingApp lifetime      | Selected actor, source actors, search/filter state, visible recipes, active runs, favourites, recents |
| `adminStore`    | RecipeManagerApp lifetime | Selected system, active tab, search terms, component list, recipe list, system config                 |
| `editorStore`   | RecipeEditorApp lifetime  | Draft recipe data, validation errors, collapsed panels, active step, picker search                    |

Stores are plain Svelte `writable`/`derived` stores. They are created per-app-instance (not global singletons) to avoid state leaking between multiple open windows.

Foundry data access (RecipeManager, CraftingEngine, etc.) continues through the existing service objects on `game.fabricate.*`. Stores call these services and update their reactive state; components subscribe to stores.

### 4.4 Localization

- All user-facing strings use `game.i18n.localize()` / `game.i18n.format()` via a `localize()` helper exported from `foundryBridge.js`.
- Svelte templates call `{localize('FABRICATE.RecipeName')}` instead of Handlebars `{{localize 'FABRICATE.RecipeName'}}`.
- No change to the `lang/en.json` structure.

### 4.5 CSS Strategy

- Component-scoped `<style>` blocks replace the monolithic `styles/fabricate.css` for migrated surfaces.
- Shared design tokens (colors, spacing, font sizes) are defined in a `src/ui/svelte/styles/tokens.css` file imported by components.
- Foundry core CSS classes (`flexrow`, `flexcol`, sheet framework classes) are used where appropriate for layout consistency with other modules/core UI.
- `styles/fabricate.css` remains for any non-Svelte styles and is progressively trimmed as components take ownership.

## 5. Migration Phases

### Phase 0: Foundation (prerequisite)

**Goal:** Establish build tooling, the SvelteApplicationMixin, and a proof-of-concept component rendering inside a Foundry window.

| Task ID | Task                           | Description                                                                                                                                                                                          |
|---------|--------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| T-100   | Add Svelte to build pipeline   | Install `svelte` and `@sveltejs/vite-plugin-svelte`. Update `vite.config.js` to compile `.svelte` files. Verify `npm run build` produces a working `dist/main.js` with no Svelte runtime errors.     |
| T-101   | Create SvelteApplicationMixin  | Implement `SvelteApplicationMixin(ApplicationV2)` that mounts/unmounts a Svelte component in `_renderHTML()`/`close()`. Support reactive prop updates and Foundry position/resize events.            |
| T-102   | Create foundryBridge utilities | Implement `src/ui/svelte/util/foundryBridge.js` with wrappers for `localize()`, `confirmDialog()`, `renderDialog()`, `notifyInfo/Warn/Error()`, `getDragEventData()`.                                |
| T-103   | Create dragDrop Svelte action  | Implement `use:dragDrop` action directive that integrates with Foundry's drag-and-drop system for item drops onto Svelte-rendered surfaces.                                                          |
| T-104   | Proof-of-concept smoke test    | Create a minimal `HelloSvelte.svelte` component, mount it via `SvelteApplicationMixin`, verify it renders in Foundry, responds to prop changes, and is cleaned up on close. Delete after validation. |

**Cutover criteria:** `npm run build` succeeds; a Svelte component renders inside a Foundry ApplicationV2 window; drag-and-drop forwarding works; existing Handlebars UIs are unaffected.

**Dependencies:** None. This phase is self-contained.

---

### Phase 1: CraftingApp (Player UI)

**Goal:** Migrate the player-facing crafting interface from `crafting-app.hbs` to Svelte. This is the simplest of the three main surfaces and has the highest user-facing impact.

| Task ID | Task                                       | Description                                                                                                                                                                        |
|---------|--------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| T-110   | Create craftingStore                       | Implement the `craftingStore` with actor selection, source actors, recipe list, run state, favourites, recents, search/filter state. Wire to existing `game.fabricate.*` services. |
| T-111   | Build CraftingAppRoot and ActorSelector    | Svelte root component with actor selection section (ActorSelector, SourceActorPicker).                                                                                             |
| T-112   | Build RunSummary component                 | Active runs and recent history columns with action buttons (continue, details, restart, cancel).                                                                                   |
| T-113   | Build SearchBar and FilterBar              | Search input, "Craftable Only" toggle, category dropdown. Shared components reusable in Phase 2.                                                                                   |
| T-114   | Build RecipeCard and RecipeList            | Recipe card with icon, name, badges, ingredient/essence/catalyst status, craft/learn buttons, favourite toggle, details button. RecipeList renders the filtered list.              |
| T-115   | Build FavouritesSection and RecentsSection | Quick-access sections above the main recipe list.                                                                                                                                  |
| T-116   | Build Pagination component                 | Footer with page range display.                                                                                                                                                    |
| T-117   | Wire CraftingApp to SvelteApplicationMixin | Replace `HandlebarsApplicationMixin` with `SvelteApplicationMixin` in `CraftingApp.js`. Mount `CraftingAppRoot`. Move action handlers into store actions.                          |
| T-118   | Migrate CraftingApp tests                  | Update `crafting-app-ui-actions.test.js`, `favourites-and-recents.test.js`, and `craftability-evaluation.test.js` to test against Svelte component/store layer.                    |
| T-119   | Delete crafting-app.hbs                    | Remove `templates/crafting-app.hbs`. No preload entry exists for this template in `main.js`, so no `loadTemplates` change is needed. Verify no other code references the path.    |

**Cutover criteria:** Player crafting UI is fully rendered by Svelte. All existing user actions (craft, learn, favourite, filter, actor selection, run management) work identically. Tests pass. No Handlebars code is executed for this surface.

**Dependencies:** Phase 0 complete.

**Defect fixes absorbed:** T-089 (favourites layout), T-091 (completed craft persisting as in-progress).

---

### Phase 2: RecipeManagerApp (GM Admin UI)

**Goal:** Migrate the GM administration interface. This is the largest surface and is decomposed into sub-phases by tab.

#### Phase 2a: Systems Tab

| Task ID | Task                                    | Description                                                                                                                                              |
|---------|-----------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| T-120   | Create adminStore                       | System selection, active tab, system config state.                                                                                                       |
| T-121   | Build SystemSidebar                     | System list with create/delete, selection highlighting.                                                                                                  |
| T-122   | Build Systems tab: basic settings       | System name, description, advanced options toggle.                                                                                                       |
| T-123   | Build FeatureCard components            | Reusable feature toggle cards for categories, tags, essences, complex recipes, multi-step, time, currency, checks, outcome routing, effects, visibility. |
| T-124   | Wire Systems tab into RecipeManagerRoot | Assemble SystemSidebar + Systems tab panel.                                                                                                              |

#### Phase 2b: Items Tab

| Task ID | Task                                          | Description                                                                                                                     |
|---------|-----------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| T-125   | Build Items tab: search, drop zone, item grid | Sticky search bar, drag-and-drop zone, system-item card grid with edit/delete. Absorbs T-094 fix (sticky search, card density). |
| T-126   | Build DropZone component                      | Shared drag-and-drop target with visual feedback, reusable in editor.                                                           |

#### Phase 2c: Recipes Tab

| Task ID | Task                                       | Description                                                                                                            |
|---------|--------------------------------------------|------------------------------------------------------------------------------------------------------------------------|
| T-127   | Build Recipes tab: toolbar, table, actions | Search, create/import/export buttons, recipe table with sorting, enable/disable toggle, edit/duplicate/delete actions. |

#### Phase 2d: Rules Tab and Assembly

| Task ID | Task                                            | Description                                                                                  |
|---------|-------------------------------------------------|----------------------------------------------------------------------------------------------|
| T-128   | Build Rules tab (placeholder)                   | Static content matching current implementation.                                              |
| T-129   | Wire RecipeManagerApp to SvelteApplicationMixin | Replace mixin. Mount RecipeManagerRoot. Move all action handlers into store/component logic. |
| T-130   | Migrate RecipeManager tests                     | Update relevant test files for Svelte component/store layer.                                 |
| T-131   | Delete recipe-manager.hbs                       | Remove `templates/recipe-manager.hbs`. No preload entry exists for this template in `main.js`. Verify no other code references the path. |

**Cutover criteria:** All four GM admin tabs render via Svelte. System CRUD, item management, recipe list management, import/export all work. Tests pass.

**Dependencies:** Phase 0 complete. Phase 1 recommended (for shared component validation) but not strictly required.

**Defect fixes absorbed:** T-094 (items tab search pinning and card density).

---

### Phase 3: RecipeEditorApp (GM Editor UI)

**Goal:** Migrate the most complex UI surface. The recipe editor has deeply nested state (steps, ingredient sets, groups, options, result groups, outcome routing) and heavy drag-and-drop interaction.

| Task ID | Task                                                    | Description                                                                                                                                              |
|---------|---------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| T-140   | Create editorStore                                      | Draft recipe state, validation, collapsed panels, active step, picker items.                                                                             |
| T-141   | Build RecipeEditorRoot: header, basic info grid, flags  | Top-level layout, name/category/description/image fields, enabled/locked/variable/effects checkboxes.                                                    |
| T-142   | Build ValidationBanner                                  | Sticky validation summary with click-to-scroll-to-error. Absorbs T-095 error visibility fix.                                                             |
| T-143   | Build player visibility and linked recipe item sections | Visibility restriction UI, linked recipe item display/browse/create.                                                                                     |
| T-144   | Build multi-step recipe UI                              | Step navigator (prev/next/add/remove), step name/description, time and currency requirement fields.                                                      |
| T-145   | Build IngredientSetPanel and IngredientGroupCard        | Accordion panel for ingredient sets with drag-and-drop reorder. Ingredient groups with OR-option rows, managed-item/tag-placeholder selection, quantity. |
| T-146   | Build catalyst block within ingredient sets             | Catalyst table with drop targets, degrade/max-uses controls.                                                                                             |
| T-147   | Build ResultGroupPanel                                  | Accordion panel for result groups with result rows, property macro selection, drop targets.                                                              |
| T-148   | Build outcome routing and result mapping sections       | Outcome-to-result-group mapping, ingredient-set-to-result-group mapping.                                                                                 |
| T-149   | Build ItemPickerGrid (sidebar)                          | Sticky search, draggable item cards. Absorbs T-095 items panel pinning fix.                                                                              |
| T-150   | Wire RecipeEditorApp to SvelteApplicationMixin          | Replace mixin. Mount RecipeEditorRoot. Move save/cancel and all action handlers into store.                                                              |
| T-151   | Migrate RecipeEditor tests                              | Update `recipe-editor-save.test.js`, `recipe-editor-accordion.test.js`, `linked-recipe-item-picker.test.js`.                                             |
| T-152   | Delete recipe-editor-v2.hbs and legacy templates        | Remove `recipe-editor-v2.hbs`, `recipe-editor.hbs`, `partials/ingredientRow.hbs`, `partials/catalystRow.hbs`. Remove the corresponding `loadTemplates()` entries from `main.js` (lines 199-203) that preload `ingredientRow.hbs`, `catalystRow.hbs`, and `recipe-editor-v2.hbs`. If this is the last phase completed before Phase 4, defer full `loadTemplates` removal to T-160; otherwise remove only the entries for deleted files. |

**Cutover criteria:** Recipe editor renders via Svelte. All editing workflows (basic, complex, multi-step, drag-and-drop, validation, save/cancel) work. Tests pass.

**Dependencies:** Phase 0 complete. Phase 2 recommended (for shared AccordionPanel, DropZone validation).

**Defect fixes absorbed:** T-095 (error visibility, items panel pinning, card overflow).

---

### Phase 4: Cleanup and Hardening

**Goal:** Remove all Handlebars infrastructure, consolidate CSS, and ensure full regression coverage.

| Task ID | Task                                             | Description                                                                                                                                                                                                                                                                                                                                                                                                                         |
|---------|--------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| T-160   | Remove Handlebars infrastructure from `main.js`  | Delete the `loadTemplates()` call in `main.js` (lines 199-206) that preloads `ingredientRow.hbs`, `catalystRow.hbs`, and `recipe-editor-v2.hbs`. Delete the `Handlebars.registerHelper('eq', ...)` and `Handlebars.registerHelper('json', ...)` registrations (lines 208-209). Remove all `HandlebarsApplicationMixin` imports from App classes. Delete `src/ui/templatePaths.js` (and its imports from `main.js`). Delete `src/ui/foundryCompat.js` if all consumers have been replaced by `foundryBridge.js`. Remove the feature-flag settings and `appFactory.js` branching logic introduced in Phase 0. |
| T-161   | Consolidate CSS                                  | Audit `styles/fabricate.css` for rules now covered by Svelte component styles. Remove dead CSS. Extract any remaining shared rules into `tokens.css`.                                                                                                                                                                                                                                                                               |
| T-162   | Remove templates directory                       | Delete the `templates/` directory entirely. Verify `module.json` does not reference template paths (it currently does not, but confirm after any interim changes).                                                                                                                                                                                                                                                                   |
| T-163   | Full regression test pass                        | Run all tests. Manual verification of every UI surface at multiple window sizes. Document any regressions and fix before closing.                                                                                                                                                                                                                                                                                                   |
| T-164   | Update documentation                             | Update `docs/` to reflect Svelte component architecture. Update contributor guide with component conventions and testing approach.                                                                                                                                                                                                                                                                                                  |

**Cutover criteria:** No Handlebars code remains. `templates/` directory is deleted. All tests pass. Docs are current.

**Dependencies:** Phases 1-3 complete.

## 6. Compatibility Rules for the Mixed Migration Period

### 6.1 Coexistence

- Handlebars and Svelte UIs coexist during Phases 1-3. Each Foundry window is either fully Handlebars or fully Svelte - no mixing within a single window.
- The `SvelteApplicationMixin` and `HandlebarsApplicationMixin` are never used on the same class simultaneously.
- Shared services (`RecipeManager`, `CraftingEngine`, etc.) are unchanged; both rendering approaches consume the same data layer.

### 6.2 Feature Flags

Three independent module settings control which renderer is active for each migrated surface. All are registered in `settings.js`, scoped to `world` (GM-only), hidden from the standard settings UI (`config: false`), and changeable via `game.settings.set()` or a developer console command.

| Setting Key                          | Type   | Default          | Removed In |
|--------------------------------------|--------|------------------|------------|
| `fabricate.uiEngine.craftingApp`     | String | `"handlebars"` * | Phase 4    |
| `fabricate.uiEngine.recipeManager`   | String | `"handlebars"` * | Phase 4    |
| `fabricate.uiEngine.recipeEditor`    | String | `"handlebars"` * | Phase 4    |

\* Default flips to `"svelte"` when the corresponding phase passes QA.

Valid values: `"handlebars"` | `"svelte"`.

**Rollout mechanics:**
1. Each App class reads its own setting at construction time and selects the matching mixin (`HandlebarsApplicationMixin` or `SvelteApplicationMixin`). A factory function in `src/ui/appFactory.js` encapsulates this selection so callers (e.g., sidebar button, macro, RecipeManagerApp opening an editor) are unaware of the active renderer.
2. Changing a setting takes effect the next time the window is opened — no page reload required.
3. During QA for a phase, the default is temporarily set to `"svelte"` in a development build. If a blocking issue is found, a GM can revert the single surface by running `game.settings.set("fabricate", "uiEngine.craftingApp", "handlebars")`.
4. Once a phase is accepted, the default is permanently changed to `"svelte"` and the corresponding Handlebars template is deleted.
5. In Phase 4, all three settings and the factory branching logic are removed; every App class uses `SvelteApplicationMixin` directly.

### 6.3 Rollback Approach

- Handlebars templates are not deleted until the corresponding Svelte surface passes full QA (each phase has a dedicated "delete template" task as the final step).
- Git tags mark each phase completion for easy revert.
- The feature flag (6.2) provides instant rollback without code changes.

## 7. Testing and Validation Strategy

### 7.1 Unit / Component Tests

**Test runner:** The project uses Node's built-in test runner (`node --test`, see `package.json` `scripts.test`). This remains the sole runner — no Jest, Vitest, or Playwright is introduced.

**Store tests (pure JS, no DOM):**
- Each Svelte store (`craftingStore`, `adminStore`, `editorStore`) gets unit tests in `tests/stores/` exercising state transitions, derived computations, and service interactions.
- These run identically to existing tests: `node --test tests/stores/*.test.js` with the same Foundry global mocks already used in `tests/`.
- No new dependencies required.

**Component rendering tests (needs DOM):**
- Svelte 5 components compiled by Vite can be rendered server-side via `svelte/server` (the `render()` export) to produce HTML strings for assertion without any browser or DOM library. This is the preferred approach for verifying markup structure, conditional rendering, and slot content.
- If interactive behavior must be tested (event handlers, reactive updates), `happy-dom` is added as a single dev-dependency to provide a lightweight `globalThis.document` for `node --test`. A shared test helper (`tests/helpers/svelte-dom.js`) will mount a compiled component into `happy-dom`, dispatch events, and assert resulting DOM state.
- Component test files live in `tests/components/` and follow the same `*.test.js` naming convention.
- The `package.json` `test` script is updated to include the new directories: `node --test tests/*.test.js tests/stores/*.test.js tests/components/*.test.js`.

**Migration of existing UI tests:**
- Existing test files (`crafting-app-ui-actions.test.js`, `recipe-editor-save.test.js`, etc.) currently test the App class methods directly with mocked Foundry globals. These tests are preserved and continue to pass during the mixed period since the App class API is unchanged.
- Once a surface is fully migrated, the corresponding test file is refactored to test the store + component layer instead. The old test file is deleted only after replacement tests provide equivalent or better coverage.

**New dev-dependency (Phase 0):** `happy-dom` (for component interaction tests only). No other test framework additions.

### 7.2 Regression Checks

- Before each phase's template deletion step, a manual regression checklist is completed:
  - All user actions produce correct outcomes (craft, save, delete, drag-drop, etc.).
  - Localized strings render correctly.
  - Keyboard navigation and focus management work.
  - Window resize/reposition behaves correctly.
  - Multiple simultaneous windows (e.g., two recipe editors) do not share state.

### 7.3 Manual UX Verification

- Before/after screenshots at consistent window sizes for every migrated surface.
- GM and player perspectives tested separately.
- Cross-system-game testing (dnd5e, pf2e) for system-specific UI paths (currency adapters, check macros).

## 8. Risk Register

| #  | Risk                                                                                                                                 | Likelihood | Impact | Mitigation                                                                                                                 |
|----|--------------------------------------------------------------------------------------------------------------------------------------|------------|--------|----------------------------------------------------------------------------------------------------------------------------|
| R1 | **Layout regressions** - Svelte components render differently from Handlebars templates                                              | High       | Medium | Use identical CSS class names initially; compare screenshots; address in review before template deletion.                  |
| R2 | **Drag-and-drop breakage** - Foundry's DnD system expects specific DOM structure                                                     | Medium     | High   | Build `use:dragDrop` action early (Phase 0); test with Foundry sidebar items, compendium items, and inter-component drags. |
| R3 | **Event wiring gaps** - Handlebars `data-action` dispatching replaced by Svelte event handlers; missed actions cause silent failures | Medium     | High   | Systematic audit of every `data-action` in each template before migration; checklist verification after.                   |
| R4 | **Localization regression** - Missing or incorrect `localize()` calls                                                                | Low        | Medium | Automated grep for raw English strings in `.svelte` files during review.                                                   |
| R5 | **Accessibility regression** - Lost ARIA attributes, focus management, keyboard navigation                                           | Medium     | Medium | Carry forward all existing `role`, `aria-*`, `tabindex` attributes; test with keyboard-only navigation.                    |
| R6 | **Performance regression** - Svelte reactivity triggers excessive re-renders                                                         | Low        | Medium | Use `$derived` / `$effect` judiciously; profile with Foundry dev tools; benchmark recipe list rendering with 100+ recipes. |
| R7 | **Bundle size increase** - Svelte runtime adds to module download                                                                    | Low        | Low    | Svelte compiles away most runtime; monitor `dist/main.js` size delta; target < 20KB increase.                              |
| R8 | **Multiple open windows** - Stores leak state between instances                                                                      | Medium     | High   | Create stores per-app-instance (factory pattern), not as module-level singletons; test with multiple simultaneous editors. |
| R9 | **Foundry version compatibility** - ApplicationV2 API changes break mixin                                                            | Low        | High   | Target Foundry v13 only (`module.json` compatibility: min/verified/max = 13). Test against v13 stable and v14 betas when available. Do not support v12. |

## 9. Effort Estimates and Delivery Order

| Phase                         | Scope                                            | Estimated Effort            | Recommended Order |
|-------------------------------|--------------------------------------------------|-----------------------------|-------------------|
| **Phase 0: Foundation**       | Build tooling, mixin, utilities, PoC             | Small (1-2 sessions)        | First             |
| **Phase 1: CraftingApp**      | Player UI (1 template, ~363 lines)               | Medium (2-3 sessions)       | Second            |
| **Phase 2: RecipeManagerApp** | GM Admin (1 template, ~514 lines, 4 tabs)        | Medium-Large (3-4 sessions) | Third             |
| **Phase 3: RecipeEditorApp**  | GM Editor (1 template, ~705 lines, deep nesting) | Large (4-5 sessions)        | Fourth            |
| **Phase 4: Cleanup**          | Remove HBS, consolidate CSS, docs                | Small (1 session)           | Last              |

**Total estimated effort:** 11-15 focused sessions.

**Critical path:** Phase 0 -> Phase 1 -> Phase 3 (the editor is the highest-risk surface).
Phases 1 and 2 can run in parallel after Phase 0 if desired.

## 10. Decision Log

| Decision                                    | Rationale                                                                                                                                                          | Status   |
|---------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|
| Use Svelte 5 (runes mode)                   | Current stable release; compiled reactivity with minimal runtime; best Vite integration.                                                                           | Proposed |
| Target Foundry v13 only                     | `module.json` sets `compatibility.minimum/verified/maximum = 13`. No v12 support or testing required. SvelteApplicationMixin targets v13 ApplicationV2 API only.   | Proposed |
| One Svelte root per Foundry window          | Aligns with ApplicationV2 lifecycle; avoids cross-window state leaks.                                                                                              | Proposed |
| Stores per-instance, not singleton          | Prevents state corruption when multiple editors are open.                                                                                                          | Proposed |
| Absorb UI defect fixes into migration       | Avoids double-work patching Handlebars templates that will be deleted.                                                                                             | Proposed |
| Keep legacy templates until phase QA passes | Enables instant rollback via feature flag.                                                                                                                         | Proposed |
| Delete legacy v1 editor templates early     | `recipe-editor.hbs` and partials are already superseded by v2; no migration needed.                                                                                | Proposed |
| `foundryBridge.js` supersedes `foundryCompat.js` | Current `src/ui/foundryCompat.js` provides `getDragEventData`, `confirmDialog`, `renderDialog`. The new `foundryBridge.js` absorbs these plus `localize()` and notification wrappers. `foundryCompat.js` is deleted in T-160 after all consumers are migrated. | Proposed |
| `happy-dom` as sole new test dependency     | Lightweight DOM for component interaction tests. Avoids heavier alternatives (jsdom, Playwright). Store-only tests need no DOM at all.                             | Proposed |

---

## 11. Backlog Promotion

Implementation tasks (T-100 through T-164) are defined in this plan document only. They will be promoted to `BACKLOG.md` as a **gating step** after this plan receives human maintainer sign-off.

**Promotion process:**
1. Maintainer approves this plan (or approves with amendments). Record approval in the Decision Log (section 10) with date.
2. Phase 0 tasks (T-100 through T-104) are added to `BACKLOG.md` immediately with status `todo`.
3. Subsequent phase tasks are added to `BACKLOG.md` only when the preceding phase reaches `done` status, to avoid backlog bloat and premature commitment.
4. T-093 status is updated to `done` with a resolution note linking to this plan and the approval date.

**Task format:** Each promoted task follows the existing `BACKLOG.md` template (`ID`, `Title`, `Status`, `Description`, `Acceptance Criteria`) and includes a `Dependencies` field linking to prerequisite tasks within the phase.

**Approved:** 2026-03-07. All tasks promoted to `BACKLOG.md`.

---

## 12. Migration Complete

**Completed:** 2026-03-07

All five phases have been executed:

- **Phase 0 (Foundation):** Svelte 5 build pipeline, `SvelteApplicationMixin`, `foundryBridge.js`, `use:dragDrop` action.
- **Phase 1 (CraftingApp):** Player crafting UI fully rendered by Svelte with `craftingStore` factory.
- **Phase 2 (RecipeManagerApp):** GM admin UI (Systems, Items, Recipes, Rules tabs) migrated with `adminStore`.
- **Phase 3 (RecipeEditorApp):** Recipe editor (the most complex surface) migrated with `editorStore`.
- **Phase 4 (Cleanup):** Handlebars infrastructure removed from `main.js`, feature-flag settings deleted, `appFactory.js` simplified to registry pattern, `templates/` directory deleted, CSS consolidated from 1918 to 856 lines, documentation updated.

**Final stats:** 494 kB bundle, 1004 tests passing, 856 lines shared CSS, 169 modules.

No Handlebars code remains. The `templates/` directory has been deleted. All UI surfaces are rendered by Svelte 5 components. Contributor guide in `CONTRIBUTING.md` documents the new architecture.
