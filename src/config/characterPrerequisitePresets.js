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
  journeymanCrafter: { label: 'Journeyman Crafter', icon: 'fa-solid fa-screwdriver-wrench' },
  smithsTools: { label: "Proficient with Smith's Tools", icon: 'fa-solid fa-hammer' },
  proficientArcana: { label: 'Proficient in Arcana', icon: 'fa-solid fa-hat-wizard' },
  trainedInCrafting: { label: 'Trained in Crafting', icon: 'fa-solid fa-screwdriver-wrench' },
  strongEnough: { label: 'Strong Enough', icon: 'fa-solid fa-dumbbell' },
  hillGiantStrength: { label: 'Hill Giant Strength', icon: 'fa-solid fa-hand-fist' },
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
  // dnd5e skill/tool proficiency lives on `<skill|tool>.value` as a 0/0.5/1/2
  // multiplier (0 = not proficient, 0.5 = half, 1 = proficient, 2 = expertise);
  // proficient-or-better is ≥ 1. An ability score is `abilities.<key>.value`; its
  // derived modifier is `abilities.<key>.mod`.
  smithsTools: { path: 'tools.smith.value', op: 'gte', value: 1 },
  proficientArcana: { path: 'skills.arc.value', op: 'gte', value: 1 },
  journeymanCrafter: { path: 'abilities.int.mod', op: 'gte', value: 2 },
  hillGiantStrength: { path: 'abilities.str.value', op: 'gte', value: 21 },
});

/**
 * Pathfinder 2e prerequisite presets.
 *
 * EVERY PATH HERE IS ROOTED AT `actor.`, and that is not a style choice. `pf2e`'s
 * `ActorPF2e#getRollData()` returns `{ actor: this }` and NOTHING else — it does not
 * spread `system` onto the roll data the way `dnd5e` does. A bare `skills.…` path is
 * therefore unresolvable in every `pf2e` world, and because
 * {@link evaluatePrerequisite} degrades an unknown path to `0` rather than throwing,
 * it fails as a condition that can simply never be met. These presets carried bare
 * paths until this was found, so a seeded `pf2e` world silently blocked recipe
 * learning and Tool use with one console warning and nothing on screen.
 *
 * Two further shape facts, both verified against `pf2e` source rather than inferred:
 *
 * - Skill keys are FULL SLUGS (`crafting`), never the three-letter abbreviations the
 *   `dnd5e` bundle uses (`cra`). See `CORE_SKILL_SLUGS` in `pf2e`'s `actor/values.ts`.
 * - Proficiency `rank` lives on the PREPARED statistic (`actor.skills.<slug>.rank`,
 *   `ZeroToFour | null`), NOT under `system.skills`. A `pf2e` skill's trace data
 *   carries `value`, `totalModifier`, `dc` and `attribute` — no `rank` — which is why
 *   `actor.system.skills.crafting.rank` would be just as dead as the bare form.
 *   `resolveRollDataPath` walks plain properties, and reaches the prepared statistic
 *   through the `actor` reference the roll data hands it.
 *
 * Ability modifiers DO live under `system` (`AbilityData.mod`), so `strongEnough`
 * roots at `actor.system.abilities.…` and agrees with the sibling modifier bundle's
 * `@actor.system.abilities.str.mod`.
 *
 * `tests/character-prerequisites.test.js` pins all three shapes so this cannot drift
 * back.
 *
 * @type {ReadonlyArray<object>}
 */
export const PF2E_CHARACTER_PREREQUISITE_PRESETS = buildPresetBundle({
  trainedInCrafting: { path: 'actor.skills.crafting.rank', op: 'gte', value: 1 },
  expertCrafter: { path: 'actor.skills.crafting.rank', op: 'gte', value: 2 },
  strongEnough: { path: 'actor.system.abilities.str.mod', op: 'gte', value: 2 },
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
