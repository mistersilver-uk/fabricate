/**
 * Per-Foundry-system character modifier preset bundles for the Fabricate
 * gathering library. Presets are opt-in: nothing is ever seeded automatically.
 * GMs invoke `seedCharacterModifierPresets()` from the manager UI when they
 * want a starting set in the selected crafting system.
 *
 * The bundles intentionally target the most common ability and skill paths
 * for `dnd5e` and `pf2e`. They are editable once seeded; subsequent calls are
 * idempotent (existing ids are never overwritten).
 */

/**
 * D&D 5e ability and skill presets. The expressions assume the Foundry
 * `dnd5e` system's actor roll data shape (`@abilities.<key>.mod`,
 * `@skills.<key>.total`).
 *
 * @type {ReadonlyArray<object>}
 */
export const DND5E_CHARACTER_MODIFIER_PRESETS = Object.freeze([
  Object.freeze({ id: 'strength', label: 'Strength', icon: 'fa-solid fa-dumbbell', provider: 'dnd5e', expression: '@abilities.str.mod' }),
  Object.freeze({ id: 'dexterity', label: 'Dexterity', icon: 'fa-solid fa-feather', provider: 'dnd5e', expression: '@abilities.dex.mod' }),
  Object.freeze({ id: 'constitution', label: 'Constitution', icon: 'fa-solid fa-heart-pulse', provider: 'dnd5e', expression: '@abilities.con.mod' }),
  Object.freeze({ id: 'intelligence', label: 'Intelligence', icon: 'fa-solid fa-brain', provider: 'dnd5e', expression: '@abilities.int.mod' }),
  Object.freeze({ id: 'wisdom', label: 'Wisdom', icon: 'fa-solid fa-eye', provider: 'dnd5e', expression: '@abilities.wis.mod' }),
  Object.freeze({ id: 'charisma', label: 'Charisma', icon: 'fa-solid fa-comments', provider: 'dnd5e', expression: '@abilities.cha.mod' }),
  Object.freeze({ id: 'acrobatics', label: 'Acrobatics', icon: 'fa-solid fa-person-running', provider: 'dnd5e', expression: '@skills.acr.total' }),
  Object.freeze({ id: 'athletics', label: 'Athletics', icon: 'fa-solid fa-mountain', provider: 'dnd5e', expression: '@skills.ath.total' }),
  Object.freeze({ id: 'stealth', label: 'Stealth', icon: 'fa-solid fa-user-secret', provider: 'dnd5e', expression: '@skills.ste.total' }),
  Object.freeze({ id: 'perception', label: 'Perception', icon: 'fa-solid fa-bullseye', provider: 'dnd5e', expression: '@skills.prc.total' }),
  Object.freeze({ id: 'investigation', label: 'Investigation', icon: 'fa-solid fa-magnifying-glass', provider: 'dnd5e', expression: '@skills.inv.total' }),
  Object.freeze({ id: 'nature', label: 'Nature', icon: 'fa-solid fa-leaf', provider: 'dnd5e', expression: '@skills.nat.total' }),
  Object.freeze({ id: 'survival', label: 'Survival', icon: 'fa-solid fa-campground', provider: 'dnd5e', expression: '@skills.sur.total' }),
  Object.freeze({ id: 'history', label: 'History', icon: 'fa-solid fa-scroll', provider: 'dnd5e', expression: '@skills.his.total' })
]);

/**
 * Pathfinder 2e ability and skill presets. The expressions assume the
 * Foundry `pf2e` actor roll data shape.
 *
 * @type {ReadonlyArray<object>}
 */
export const PF2E_CHARACTER_MODIFIER_PRESETS = Object.freeze([
  Object.freeze({ id: 'strength', label: 'Strength', icon: 'fa-solid fa-dumbbell', provider: 'pf2e', expression: '@actor.system.abilities.str.mod' }),
  Object.freeze({ id: 'dexterity', label: 'Dexterity', icon: 'fa-solid fa-feather', provider: 'pf2e', expression: '@actor.system.abilities.dex.mod' }),
  Object.freeze({ id: 'constitution', label: 'Constitution', icon: 'fa-solid fa-heart-pulse', provider: 'pf2e', expression: '@actor.system.abilities.con.mod' }),
  Object.freeze({ id: 'intelligence', label: 'Intelligence', icon: 'fa-solid fa-brain', provider: 'pf2e', expression: '@actor.system.abilities.int.mod' }),
  Object.freeze({ id: 'wisdom', label: 'Wisdom', icon: 'fa-solid fa-eye', provider: 'pf2e', expression: '@actor.system.abilities.wis.mod' }),
  Object.freeze({ id: 'charisma', label: 'Charisma', icon: 'fa-solid fa-comments', provider: 'pf2e', expression: '@actor.system.abilities.cha.mod' }),
  Object.freeze({ id: 'acrobatics', label: 'Acrobatics', icon: 'fa-solid fa-person-running', provider: 'pf2e', expression: '@actor.system.skills.acrobatics.totalModifier' }),
  Object.freeze({ id: 'athletics', label: 'Athletics', icon: 'fa-solid fa-mountain', provider: 'pf2e', expression: '@actor.system.skills.athletics.totalModifier' }),
  Object.freeze({ id: 'stealth', label: 'Stealth', icon: 'fa-solid fa-user-secret', provider: 'pf2e', expression: '@actor.system.skills.stealth.totalModifier' }),
  Object.freeze({ id: 'perception', label: 'Perception', icon: 'fa-solid fa-bullseye', provider: 'pf2e', expression: '@actor.system.perception.totalModifier' }),
  Object.freeze({ id: 'nature', label: 'Nature', icon: 'fa-solid fa-leaf', provider: 'pf2e', expression: '@actor.system.skills.nature.totalModifier' }),
  Object.freeze({ id: 'survival', label: 'Survival', icon: 'fa-solid fa-campground', provider: 'pf2e', expression: '@actor.system.skills.survival.totalModifier' }),
  Object.freeze({ id: 'occultism', label: 'Occultism', icon: 'fa-solid fa-hat-wizard', provider: 'pf2e', expression: '@actor.system.skills.occultism.totalModifier' })
]);

/**
 * Return the matching preset bundle for the active Foundry game system id.
 *
 * Unknown ids return an empty array. The bundle is read-only — callers should
 * pass it through `seedCharacterModifierPresets()` rather than copying into
 * the library directly.
 *
 * @param {string} foundrySystemId Foundry game system id (`game.system.id`).
 * @returns {ReadonlyArray<object>} Frozen preset bundle (possibly empty).
 */
export function getCharacterModifierPresetsForFoundrySystem(foundrySystemId) {
  const id = String(foundrySystemId || '').trim();
  if (id === 'dnd5e') return DND5E_CHARACTER_MODIFIER_PRESETS;
  if (id === 'pf2e') return PF2E_CHARACTER_MODIFIER_PRESETS;
  return Object.freeze([]);
}

/**
 * Idempotently merge a preset bundle into a per-system library.
 *
 * Existing entries with a matching id are preserved untouched. The return
 * value is a fresh array suitable for assignment back onto the per-system
 * `characterModifiers` field.
 *
 * @param {object} options
 * @param {ReadonlyArray<object>} options.presets Preset bundle.
 * @param {Array<object>} [options.currentLibrary] Current library entries.
 * @returns {{added: Array<object>, skipped: Array<object>, next: Array<object>}}
 *   `added` lists newly inserted entries, `skipped` lists presets whose id
 *   already existed in the library, and `next` is the merged library array.
 */
export function seedCharacterModifierPresets({ presets = [], currentLibrary = [] } = {}) {
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
      label: String(preset.label || id),
      icon: String(preset.icon || 'fa-solid fa-user'),
      provider: preset.provider || 'dnd5e',
      expression: String(preset.expression || ''),
      macroUuid: String(preset.macroUuid || '')
    };
    seen.set(id, cloned);
    added.push(cloned);
  }
  return { added, skipped, next: Array.from(seen.values()) };
}
