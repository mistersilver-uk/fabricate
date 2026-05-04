# UI Integration Delta

## MODIFIED Requirements

### Requirement: Manager V2 Essences route

The Manager V2 Essences route MUST be a real selected-system browser whenever the selected crafting system enables essences.

1. The left-rail Essences item MUST be rendered as an enabled navigation button when `selectedSystem.features.essences === true`.
2. The left-rail Essences item MUST NOT remain in the disabled placeholder/deferred-view list once the route is implemented.
3. If `features.essences !== true`, the Essences route MUST be hidden and an active `essences` route MUST normalize back to the systems browser or another valid selected-system route.
4. The Essences browser MUST use the Manager V2 browser-route pattern: section header, create or primary action band, toolbar, scrollable table/list rows, selected-row state, and right inspector.
5. The Essences browser MUST expose source-state filters and source evidence only when `features.effectTransfer === true`.
6. The Essences browser MUST always expose component usage evidence because usage controls whether destructive actions are available.
7. Deleting an essence definition MUST be blocked or disabled while any managed component references that essence with a positive quantity.
8. A blocked delete state MUST be visible near the destructive control and in the selected-essence inspector.
9. Browse rows MUST select essences. Edit actions SHOULD route to a dedicated edit surface when that slice exists; browse-row inline editing is not the durable Manager V2 target.
10. Native controls MAY be used for an interim implementation slice, but the durable Manager V2 target uses the shared essence icon picker and source selector components.

### Requirement: Manager V2 placeholder promotion

Manager V2 feature routes MUST be promoted from placeholders explicitly and consistently.

1. When a placeholder route becomes actionable, the implementation MUST remove that route from placeholder/deferred-view collections.
2. The implementation MUST add route normalization, breadcrumb copy, title/subtitle copy, header action labelling, left-nav active state, main view rendering, and inspector routing for the promoted route.
3. The implementation MUST add focused mounted/contract coverage proving the route is clickable, not disabled, feature-gated, and no longer listed as a planned placeholder.
