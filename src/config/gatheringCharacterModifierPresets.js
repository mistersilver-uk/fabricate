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
 * Shared display metadata (label + icon) for every modifier id used by the
 * preset bundles. Each Foundry-system bundle reuses these so the two bundles
 * differ only in their `provider` and roll `expression`.
 *
 * @type {Readonly<Record<string, {label: string, icon: string}>>}
 */
const MODIFIER_DISPLAY = Object.freeze({
  strength: { label: 'Strength', icon: 'fa-solid fa-dumbbell' },
  dexterity: { label: 'Dexterity', icon: 'fa-solid fa-feather' },
  constitution: { label: 'Constitution', icon: 'fa-solid fa-heart-pulse' },
  intelligence: { label: 'Intelligence', icon: 'fa-solid fa-brain' },
  wisdom: { label: 'Wisdom', icon: 'fa-solid fa-eye' },
  charisma: { label: 'Charisma', icon: 'fa-solid fa-comments' },
  acrobatics: { label: 'Acrobatics', icon: 'fa-solid fa-person-running' },
  athletics: { label: 'Athletics', icon: 'fa-solid fa-mountain' },
  stealth: { label: 'Stealth', icon: 'fa-solid fa-user-secret' },
  perception: { label: 'Perception', icon: 'fa-solid fa-bullseye' },
  investigation: { label: 'Investigation', icon: 'fa-solid fa-magnifying-glass' },
  nature: { label: 'Nature', icon: 'fa-solid fa-leaf' },
  survival: { label: 'Survival', icon: 'fa-solid fa-campground' },
  history: { label: 'History', icon: 'fa-solid fa-scroll' },
  occultism: { label: 'Occultism', icon: 'fa-solid fa-hat-wizard' },
});

/**
 * Build a frozen preset bundle from a provider id and an ordered id→expression
 * map, pulling shared label/icon metadata from {@link MODIFIER_DISPLAY}. The
 * resulting array preserves the insertion order of `expressions`.
 *
 * @param {string} provider Provider id stamped onto every preset.
 * @param {Record<string, string>} expressions Ordered map of modifier id to
 *   the system-specific roll expression.
 * @returns {ReadonlyArray<object>} Frozen preset bundle.
 */
function buildPresetBundle(provider, expressions) {
  return Object.freeze(
    Object.entries(expressions).map(([id, expression]) =>
      Object.freeze({
        id,
        label: MODIFIER_DISPLAY[id].label,
        icon: MODIFIER_DISPLAY[id].icon,
        provider,
        expression,
      })
    )
  );
}

/**
 * D&D 5e ability and skill presets. The expressions assume the Foundry
 * `dnd5e` system's actor roll data shape (`@abilities.<key>.mod`,
 * `@skills.<key>.total`).
 *
 * @type {ReadonlyArray<object>}
 */
export const DND5E_CHARACTER_MODIFIER_PRESETS = buildPresetBundle('dnd5e', {
  strength: '@abilities.str.mod',
  dexterity: '@abilities.dex.mod',
  constitution: '@abilities.con.mod',
  intelligence: '@abilities.int.mod',
  wisdom: '@abilities.wis.mod',
  charisma: '@abilities.cha.mod',
  acrobatics: '@skills.acr.total',
  athletics: '@skills.ath.total',
  stealth: '@skills.ste.total',
  perception: '@skills.prc.total',
  investigation: '@skills.inv.total',
  nature: '@skills.nat.total',
  survival: '@skills.sur.total',
  history: '@skills.his.total',
});

/**
 * Pathfinder 2e ability and skill presets. The expressions assume the
 * Foundry `pf2e` actor roll data shape.
 *
 * @type {ReadonlyArray<object>}
 */
export const PF2E_CHARACTER_MODIFIER_PRESETS = buildPresetBundle('pf2e', {
  strength: '@actor.system.abilities.str.mod',
  dexterity: '@actor.system.abilities.dex.mod',
  constitution: '@actor.system.abilities.con.mod',
  intelligence: '@actor.system.abilities.int.mod',
  wisdom: '@actor.system.abilities.wis.mod',
  charisma: '@actor.system.abilities.cha.mod',
  acrobatics: '@actor.system.skills.acrobatics.totalModifier',
  athletics: '@actor.system.skills.athletics.totalModifier',
  stealth: '@actor.system.skills.stealth.totalModifier',
  perception: '@actor.system.perception.totalModifier',
  nature: '@actor.system.skills.nature.totalModifier',
  survival: '@actor.system.skills.survival.totalModifier',
  occultism: '@actor.system.skills.occultism.totalModifier',
});

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
      macroUuid: String(preset.macroUuid || ''),
    };
    seen.set(id, cloned);
    added.push(cloned);
  }
  return { added, skipped, next: [...seen.values()] };
}
