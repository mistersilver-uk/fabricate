/**
 * Per-Foundry-system character prerequisite preset bundles. Presets are opt-in:
 * nothing is ever seeded automatically. GMs invoke `seedCharacterPrerequisitePresets()`
 * from the System Settings UI when they want a starting set in the selected
 * crafting system.
 *
 * The bundles seed real, resolvable roll-data paths for `dnd5e` and `pf2e` so a
 * GM can see working examples of the `path` + `op` + `value` shape. They are
 * fully editable once seeded; subsequent calls are idempotent (existing ids are
 * never overwritten).
 *
 * Mirrors `gatheringCharacterModifierPresets.js`.
 */

/** Shared display metadata (label + icon) for every prerequisite id used by the preset bundles. */
const PREREQUISITE_DISPLAY = Object.freeze({
  expertCrafter: { label: 'Expert Crafter', icon: 'fa-solid fa-screwdriver-wrench' },
  journeymanCrafter: { label: 'Journeyman Crafter', icon: 'fa-solid fa-screwdriver-wrench' },
  smithsTools: { label: "Proficient with Smith's Tools", icon: 'fa-solid fa-hammer' },
  proficientArcana: { label: 'Proficient in Arcana', icon: 'fa-solid fa-hat-wizard' },
  trainedInCrafting: { label: 'Trained in Crafting', icon: 'fa-solid fa-screwdriver-wrench' },
  strongEnough: { label: 'Strong Enough', icon: 'fa-solid fa-dumbbell' },
  hillGiantStrength: { label: 'Hill Giant Strength', icon: 'fa-solid fa-hand-fist' },
});

/**
 * Build a frozen preset bundle from an ordered id→condition map, pulling shared label/icon metadata
 * from {@link PREREQUISITE_DISPLAY}.
 */
function buildPresetBundle(conditions) {
  return Object.freeze(
    Object.entries(conditions).map(([id, condition]) =>
      Object.freeze({
        id,
        name: PREREQUISITE_DISPLAY[id].label,
        icon: PREREQUISITE_DISPLAY[id].icon,
        path: condition.path,
        op: condition.op,
        value: condition.value ?? null,
      })
    )
  );
}

/** D&D 5e prerequisite presets. */
export const DND5E_CHARACTER_PREREQUISITE_PRESETS = buildPresetBundle({
  // dnd5e skill/tool proficiency lives on `<skill|tool>.value` as a 0/0.5/1/2 multiplier (0 = not
  // proficient, 0.5 = half, 1 = proficient, 2 = expertise); proficient-or-better is ≥ 1.
  smithsTools: { path: 'tools.smith.value', op: 'gte', value: 1 },
  proficientArcana: { path: 'skills.arc.value', op: 'gte', value: 1 },
  journeymanCrafter: { path: 'abilities.int.mod', op: 'gte', value: 2 },
  hillGiantStrength: { path: 'abilities.str.value', op: 'gte', value: 21 },
});

/** Pathfinder 2e prerequisite presets. */
export const PF2E_CHARACTER_PREREQUISITE_PRESETS = buildPresetBundle({
  trainedInCrafting: { path: 'actor.skills.crafting.rank', op: 'gte', value: 1 },
  expertCrafter: { path: 'actor.skills.crafting.rank', op: 'gte', value: 2 },
  strongEnough: { path: 'actor.system.abilities.str.mod', op: 'gte', value: 2 },
});

/** Return the matching preset bundle for the active Foundry game system id. */
export function getCharacterPrerequisitePresetsForFoundrySystem(foundrySystemId) {
  const id = String(foundrySystemId || '').trim();
  if (id === 'dnd5e') return DND5E_CHARACTER_PREREQUISITE_PRESETS;
  if (id === 'pf2e') return PF2E_CHARACTER_PREREQUISITE_PRESETS;
  return Object.freeze([]);
}

/** Idempotently merge a preset bundle into a per-system library. */
export function seedCharacterPrerequisitePresets({ presets = [], currentLibrary = [] } = {}) {
  const safePresets = Array.isArray(presets) ? presets : [];
  const safeCurrent = Array.isArray(currentLibrary) ? currentLibrary : [];
  const seen = new Map();
  for (const entry of safeCurrent) {
    if (entry && typeof entry === 'object' && entry.id) seen.set(String(entry.id), entry);
  }
  const added = [];
  const skipped = [];
  for (const preset of safePresets) {
    if (!preset || typeof preset !== 'object' || !preset.id) continue;
    const id = String(preset.id);
    if (seen.has(id)) {
      skipped.push(preset);
      continue;
    }
    const cloned = {
      id,
      name: String(preset.name || id),
      icon: String(preset.icon || 'fa-solid fa-user-shield'),
      path: String(preset.path || ''),
      op: String(preset.op || 'gte'),
      value: preset.value ?? null,
    };
    seen.set(id, cloned);
    added.push(cloned);
  }
  return { added, skipped, next: [...seen.values()] };
}
