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

/** Shared display metadata (label + icon) for every modifier id used by the preset bundles. */
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
 * Build a frozen preset bundle from an ordered id→expression map, pulling shared label/icon
 * metadata from {@link MODIFIER_DISPLAY}.
 */
function buildPresetBundle(expressions) {
  return Object.freeze(
    Object.entries(expressions).map(([id, expression]) =>
      Object.freeze({
        id,
        label: MODIFIER_DISPLAY[id].label,
        icon: MODIFIER_DISPLAY[id].icon,
        expression,
      })
    )
  );
}

/** D&D 5e ability and skill presets. */
export const DND5E_CHARACTER_MODIFIER_PRESETS = buildPresetBundle({
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

/** Pathfinder 2e ability and skill presets. */
export const PF2E_CHARACTER_MODIFIER_PRESETS = buildPresetBundle({
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

/** Return the matching preset bundle for the active Foundry game system id. */
export function getCharacterModifierPresetsForFoundrySystem(foundrySystemId) {
  const id = String(foundrySystemId || '').trim();
  if (id === 'dnd5e') return DND5E_CHARACTER_MODIFIER_PRESETS;
  if (id === 'pf2e') return PF2E_CHARACTER_MODIFIER_PRESETS;
  return Object.freeze([]);
}

/** Idempotently merge a preset bundle into a per-system library. */
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
      expression: String(preset.expression || ''),
    };
    seen.set(id, cloned);
    added.push(cloned);
  }
  return { added, skipped, next: [...seen.values()] };
}
