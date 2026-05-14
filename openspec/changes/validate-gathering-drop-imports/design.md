# Design: Validate Gathering Drop Imports

## Validation Boundary

Introduce one shared gathering drop reference validator under `src/systems/`. It accepts a crafting system id, the owning system's components, task records, and a UUID resolver. For each enabled drop row it verifies:

- `componentId`, when present, matches a component in the owning crafting system.
- `itemUuid`, when present without a component target, resolves to an Item document through `fromUuid` or `fromUuidSync`.
- rows with neither target, stale component ids, or unresolved item UUIDs are invalid.

The validator returns human-readable errors that include task name/id and row name/id. It does not mutate rows.

## Import And Admin Saves

`CompendiumImporter` will validate `system.gatheringConfig.systems[systemId].tasks` before calling `createSystem` or `updateSystem`. This keeps invalid imported data from being persisted with the system payload. Import validation uses the remapped component list so component-backed rows are checked against the actual imported system shape.

The Manager V2 admin store already normalizes and validates gathering library tasks before save. That validation will reuse the shared rules with system context from the selected crafting system so it can reject stale component references. For `itemUuid`, the store will use synchronous `fromUuidSync` when available for immediate UI/save validation.

## Mythwright Bootstrap

Mythwright already discovers SRD equipment, creates/upserts world items, and builds managed components for resolved SRD entries. The bootstrap will build gathering tasks after component construction so optional SRD reward rows can be component-backed. SRD reward rows will call a helper that maps the requested item name to the deterministic component id, for example `War Pick` to `weapon-war-pick`.

If an optional SRD entry is not resolved and therefore no managed component exists, the row will be omitted and reported in `summary.gatheringConfig.unresolvedDrops`. Seed validation will run before `game.settings.set('fabricate', 'gatheringConfig', ...)`; any remaining invalid row throws with task/drop context.

## Specification Ownership

Durable behavior is owned by `openspec/specs/gathering-and-harvesting/spec.md`: persisted or imported d100 drop rows must resolve to a real component or Item. The data-model spec keeps the row shape unchanged.

## Testing

Focused tests will cover:

- Mythwright War Pick uses `componentId: "weapon-war-pick"` with no `itemUuid`.
- all Mythwright seeded rows resolve against built component ids or resolvable Item UUIDs.
- unresolved optional Mythwright SRD entries are omitted and reported.
- import rejects unknown component ids and unresolved item UUIDs.
- import accepts valid component-backed and item-backed rows.
- admin validation reports stale component/item targets.
