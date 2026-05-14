# Design: Mythwright Gathering Task Images

## Bootstrap Content

`scripts/foundry/create-mythwright-dnd5e.js` will add task-specific image constants to `MYTHWRIGHT_ICONS` and assign them directly in `buildGatheringTasks()`.

The selected images will reuse Foundry core icon paths for Mythwright's existing materials and tools:

- ore extraction uses the raw ore icon,
- hardwood cutting uses the lumber icon,
- hide dressing uses the cured hide icon,
- ruin excavation uses the ancient fragment icon,
- battlefield salvage uses the armour plates icon,
- planar essence binding uses an essence/magic icon, and
- dragon scale harvesting uses the dragon scale icon.

Because the bootstrap persists task library records by deterministic ids, the existing upsert behavior will replace old generic or missing task images on reseed without a migration.

## Testing

Focused Mythwright bootstrap tests will verify that every seeded gathering task has a non-default approved image path, and will lock representative task-to-icon mappings.
