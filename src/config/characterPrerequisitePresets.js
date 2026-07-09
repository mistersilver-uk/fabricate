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

/**
 * Shared display metadata (label + icon) for every prerequisite id used by the
 * preset bundles. Each Foundry-system bundle reuses these so the two bundles
 * differ only in their `path` / `op` / `value`.
 *
 * @type {Readonly<Record<string, {label: string, icon: string}>>}
 */
const PREREQUISITE_DISPLAY = Object.freeze({
  expertCrafter: { label: 'Expert Crafter', icon: 'fa-solid fa-screwdriver-wrench' },
  smithsTools: { label: "Proficient with Smith's Tools", icon: 'fa-solid fa-hammer' },
  proficientArcana: { label: 'Proficient in Arcana', icon: 'fa-solid fa-hat-wizard' },
  trainedInCrafting: { label: 'Trained in Crafting', icon: 'fa-solid fa-screwdriver-wrench' },
  strongEnough: { label: 'Strong Enough', icon: 'fa-solid fa-dumbbell' },
});

/**
 * Build a frozen preset bundle from an ordered id→condition map, pulling shared
 * label/icon metadata from {@link PREREQUISITE_DISPLAY}. The resulting array
 * preserves the insertion order of `conditions`.
 *
 * @param {Record<string, {path: string, op: string, value?: (string|number|null)}>} conditions
 *   Ordered map of prerequisite id to its system-specific condition.
 * @returns {ReadonlyArray<object>} Frozen preset bundle.
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

/**
 * D&D 5e prerequisite presets. Paths assume the Foundry `dnd5e` actor roll-data
 * shape (`@abilities.<key>.value`, `@tools.<key>.value`, `@skills.<key>.value`).
 *
 * @type {ReadonlyArray<object>}
 */
export const DND5E_CHARACTER_PREREQUISITE_PRESETS = buildPresetBundle({
  smithsTools: { path: 'tools.smith.prof.multiplier', op: 'gte', value: 1 },
  // dnd5e skill proficiency is a 0/0.5/1/2 multiplier; proficient (or better) is ≥ 1.
  proficientArcana: { path: 'skills.arc.prof.multiplier', op: 'gte', value: 1 },
  expertCrafter: { path: 'abilities.int.value', op: 'gte', value: 13 },
  strongEnough: { path: 'abilities.str.value', op: 'gte', value: 15 },
});

/**
 * Pathfinder 2e prerequisite presets. Paths assume the Foundry `pf2e` actor
 * roll-data shape (`@skills.<key>.rank`, proficiency ranks 0–4).
 *
 * @type {ReadonlyArray<object>}
 */
export const PF2E_CHARACTER_PREREQUISITE_PRESETS = buildPresetBundle({
  trainedInCrafting: { path: 'skills.cra.rank', op: 'gte', value: 1 },
  expertCrafter: { path: 'skills.cra.rank', op: 'gte', value: 2 },
  strongEnough: { path: 'abilities.str.mod', op: 'gte', value: 2 },
});

/**
 * Return the matching preset bundle for the active Foundry game system id.
 * Unknown ids return an empty array.
 *
 * @param {string} foundrySystemId Foundry game system id (`game.system.id`).
 * @returns {ReadonlyArray<object>} Frozen preset bundle (possibly empty).
 */
export function getCharacterPrerequisitePresetsForFoundrySystem(foundrySystemId) {
  const id = String(foundrySystemId || '').trim();
  if (id === 'dnd5e') return DND5E_CHARACTER_PREREQUISITE_PRESETS;
  if (id === 'pf2e') return PF2E_CHARACTER_PREREQUISITE_PRESETS;
  return Object.freeze([]);
}

/**
 * Idempotently merge a preset bundle into a per-system library. Existing entries
 * with a matching id are preserved untouched. The return value is a fresh array
 * suitable for assignment back onto the system's `characterPrerequisites` field.
 *
 * @param {object} options
 * @param {ReadonlyArray<object>} options.presets Preset bundle.
 * @param {Array<object>} [options.currentLibrary] Current library entries.
 * @returns {{added: Array<object>, skipped: Array<object>, next: Array<object>}}
 *   `added` lists newly inserted entries, `skipped` lists presets whose id
 *   already existed, and `next` is the merged library array.
 */
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
