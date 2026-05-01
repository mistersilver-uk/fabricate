# UI Integration Delta

## MODIFIED Requirements

### Requirement: GM Crafting Admin Environments editor feedback

The GM `Environments` editor MAY be refined for authoring feedback after the completed #179 runtime implementation, but those refinements MUST remain UI-only unless a later OpenSpec change explicitly changes runtime behavior.

1. The editor MUST continue to operate on the selected system's cloned environment draft and existing admin-store callback contract.
2. The first implementation step MUST be behavior-neutral component extraction only.
3. Extracted editor components MUST be prop-driven and MUST NOT use Foundry globals (`game`, `ui`, `Hooks`, `CONFIG`, `fromUuid`) or direct Foundry collection lookups.
4. Extraction MUST preserve CSS class contracts, localization keys, `data-environment-field` paths, validation paths, dirty-state behavior, stale UUID display, keyboard focus behavior, and callback wiring.
5. Incomplete visibility provider input MUST remain local UI state and MUST NOT be committed to the admin store until provider-required fields are present.
6. Later validation-aware collapsibles MUST reveal the section containing the first invalid field before focusing the existing field target.
7. Validation reveal section IDs MUST be deterministic compact UI keys derived from existing validation path prefixes:
   - `task.<taskId>.base`
   - `task.<taskId>.time`
   - `task.<taskId>.failure`
   - `task.<taskId>.resolution`
   - `task.<taskId>.check`
   - `task.<taskId>.visibility`
   - `task.<taskId>.catalysts`
   - `task.<taskId>.resultGroups`
   - `task.<taskId>.resultGroups.<groupId>` for nested result-group expansion
8. Later assisted picker controls MUST use injected plain data/actions:
   - scene options with at least `{ uuid, name }`
   - roll-table options with at least `{ uuid, name }`
   - an image picker callback that returns a selected path or empty cancellation
   - existing managed-item options for component choices and difficulty display
   - existing script-macro options for macro choices
9. Scene, roll-table, image, component, and macro picker integration MUST keep Foundry document lookup and file-picker access at the app/store edge, not in presentational Svelte components.
10. The first Environments tab view MUST show only the card grid for persisted environments; the draft editor MUST remain hidden until a card, card image/name, edit action, or new-environment action is activated.
11. Persisted environments MUST render as a scrollable 3-column card grid at the normal GM crafting admin window size.
12. Environment cards MUST use injected scene image data when available, preferring high-resolution scene image paths over thumbnails, and MUST use a default icon fallback when no linked scene image is available.
13. Card actions for edit, enable/disable, delete, and the contextual menu MUST be overlaid on the card image area.
14. The card body, card image, card name, and edit action MUST open the edit view, while enable/disable, delete, and reorder actions MUST operate on the represented persisted environment without opening the editor.
15. Card controls MUST remain reachable by real browser pointer hit-testing; card-body activation MUST NOT intercept edit, enable/disable, delete, or contextual menu actions.
16. The contextual card menu MUST remain visible and clickable when opened from an overlaid image action area.
17. Grid-mode card action failures MUST be visible in the grid view rather than only inside the editor form.
18. The edit view MUST expose a Back action that returns to the full-height card grid.
19. This UI feedback change MUST NOT change gathering runtime contracts, persistence schema, run-manager behavior, player app behavior, or add npm dependencies.
