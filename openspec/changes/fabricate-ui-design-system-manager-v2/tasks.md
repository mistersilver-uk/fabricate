# Tasks

## Planning

- [x] Review redesign proposal images for systems manager, environments index, and environment editor.
- [x] Read current UI integration spec and existing Svelte manager/admin structure.
- [x] Query open GitHub issues; no dedicated redesign issue exists, and `#179` remains the closest gathering-specific issue only.
- [x] Create a design-system artifact that applies across Fabricate UI applications.
- [x] Create a delta spec for a parallel manager-v2 app.
- [x] Review the design system and delta spec against the images and record iteration notes.
- [x] Review the later recipe browser/editor direction and update the manager-v2 design system/spec for those views.
- [x] Review the later essence browser/editor direction and update the manager-v2 design system/spec for that view.
- [x] Extract keepable patterns from the latest Steps / Ingredients tab design and add explicit delta requirements for that page.
- [x] Review the latest Steps / Ingredients iteration and add palette, option-type, OR-divider, and drag-target requirements.
- [x] Link the reference screenshots under `references/` from the change docs and clarify that written OpenSpec requirements take precedence over imperfect visual references.
- [x] Link the added `Edit Recipe Results` reference screenshot and capture its intended result-group authoring direction.
- [x] Fold the crafting-check versus successful-provider resolution model into the manager-v2 recipe editor delta.
- [x] Review the added component, essence, resolution, and visibility reference screenshots and record explicit keep/change/discard decisions.
- [x] Review the added tags/categories reference screenshot and add system-level item-tag/category guidance.

## Implementer Entry Criteria

- [ ] Treat this as an additive manager-v2 implementation. Do not replace the current manager in the first pass.
- [ ] Reuse the existing admin store and service callbacks unless a later approved design update identifies a specific derived-view-state need.
- [ ] Preserve all runtime semantics, persistence schemas, import/export behavior, validation ownership, and dirty-draft protection.
- [ ] Add no npm dependencies without a new plan entry explaining why they are needed.
- [ ] Keep all presentational Svelte components free of direct Foundry global lookups.
- [ ] Use the design-system tokens and layout rules from `design-system.md`.

## Future Implementation Sequence

- [ ] Add manager-v2 app wrapper and root component behind an explicit launch path or setting.
- [ ] Add manager-v2 design-system primitives: shell, side rail, toolbar, data table, inspector, chip, action menu, icon button, and status toggle.
- [ ] Build the systems manager-v2 view using existing system data and actions.
- [ ] Build the components browser/editor manager-v2 view using existing component, tag, essence, source, usage, and salvage data/actions.
- [ ] Build the tags/categories manager-v2 view using existing item-tag and recipe-category data/actions.
- [ ] Build the recipes browser and recipe editor manager-v2 views using existing recipe data and actions.
- [ ] Build the essences browser/editor manager-v2 view using existing essence data and actions.
- [ ] Build the environments manager-v2 index and editor shell using existing environment data and actions.
- [ ] Migrate additional admin tabs to manager-v2 presentation patterns while preserving behavior.
- [ ] Add localized strings for all new labels, tooltips, headers, chips, empty states, and inspector actions.
- [ ] Add focused component and store-contract tests.
- [ ] Run full validation gates before implementation sign-off.

## UI Acceptance Criteria

- [ ] Normal-width manager-v2 systems view matches the reference hierarchy: left rail, central table, right inspector, compact header, search/filter toolbar, selected row, and quick actions.
- [ ] Normal-width environments view matches the reference hierarchy: feature rail, environment table, image-backed inspector, filters, view toggle, and quick actions.
- [ ] Normal-width recipes browser matches the reference hierarchy: system rail, recipe table, selected recipe inspector, requirements preview, filters, import/export, and quick actions.
- [ ] Components view matches the reference hierarchy: drop-to-add import, explicit component/recipe-item drop action where applicable, filters, table, tags, essences, usage legend, source states, selected component inspector, and quick actions.
- [ ] Tags/categories view matches the reference hierarchy while preserving Fabricate semantics: system item tags, flat recipe categories, reserved `General`, usage counts, cleanup actions, impact warnings, feature-disabled states, and right guidance/summary panels.
- [ ] Recipe editor matches the reference shell while exposing Fabricate recipe semantics: overview, steps/ingredients, result groups, mode-aware resolution, visibility, advanced, and live evidence column.
- [ ] Resolution tab separates crafting check from successful result selection, supports provider-specific mapping/guidance, and keeps failure outcome distinct from success result groups.
- [ ] Visibility tab adapts to system-owned global, player, knowledge, and alchemy modes; shows linked recipe item workflows only when relevant; and uses effective visibility, validation, example scenarios, and docs panels backed by real mode data.
- [ ] Steps / Ingredients tab preserves compact step cards, ingredient-set cards, active set editor, group blocks, typed option rows, compact OR dividers, mapped-result chips, collapsed requirement summaries, left-side validation, and right-side Components/Essences/Tags source palette with search, filters, drag target, and drag/drop behavior.
- [ ] Essences view matches the reference hierarchy: system rail, essence table, source item linking, selected essence inspector, usage summary, warnings, filters, import/export, and quick actions.
- [ ] Environment editor shows compact object context, tabs/workflow, primary resource/result authoring, and live evidence column.
- [ ] All image-backed screenshots include representative linked images, not only fallback icons.
- [ ] Narrow layouts stack without horizontal overflow and keep primary actions, selected object, validation, and save/cancel reachable.
- [ ] Pointer hit tests cover row selection, row action menus, toggles, search/filter controls, view toggles, primary actions, and inspector quick actions.
- [ ] Focus-visible states remain clear after styling.

## Verification For This Planning Change

- [x] `git diff --check -- openspec/changes/fabricate-ui-design-system-manager-v2`
- [x] Manual review of `design-system.md`, `design.md`, and `specs/ui-integration/spec.md` against the systems, environments, recipe browser, recipe editor, and essence input images.

## Future Implementation Validation

- [ ] Focused component tests for new manager-v2 views.
- [ ] Existing current-manager tests continue to pass.
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run test:foundry` for final screenshot and pointer validation.
