/**
 * `1.33.0`: the mark that keeps every subject pick rolling (issue 1608); spec § Subject Modifier
 * Mark Seed owns both halves and why they fire together. Pure, clone-first and idempotent.
 */

import { normalizeModifierPolicy } from '../systems/checkModifierResolver.js';
import { normalizeCheckModifierIds } from '../utils/checkModifierPicks.js';

import { isPlainObject, clone, forEachSystem } from './migrationHelpers.js';

/** The one combination rule that hands the selection to the record being resolved. */
const SUBJECT_POLICY = 'bySubject';

/** Each check's pick field; reading the wrong field would silently seed nothing. */
const ACTIVITY_MARKS = Object.freeze([
  Object.freeze({
    checkKey: 'craftingCheck',
    read: (subject) => subject?.craftingModifier?.modifierIds,
    pin: (subject) => {
      // `craftingModifier.modifierIds`, absent on a recipe that never opened the picker; other
      // keys in the block are preserved.
      if (!isPlainObject(subject.craftingModifier)) subject.craftingModifier = {};
      subject.craftingModifier.modifierIds = [];
    },
  }),
  Object.freeze({
    checkKey: 'salvageCraftingCheck',
    read: (subject) => subject?.salvage?.checkModifierIds,
    pin: (subject) => {
      if (!isPlainObject(subject.salvage)) subject.salvage = {};
      subject.salvage.checkModifierIds = [];
    },
  }),
  Object.freeze({
    checkKey: 'gatheringCraftingCheck',
    read: (subject) => subject?.checkModifierIds,
    pin: (subject) => {
      subject.checkModifierIds = [];
    },
  }),
]);

/** Unioned with in-system copies, the live corpus before `1.28.0`; only declines an id. */
function catalogueIdsFor(worldLibraries, system) {
  const ids = new Set();
  for (const source of [worldLibraries?.modifiers, system?.modifiers]) {
    for (const entry of Array.isArray(source) ? source : []) {
      const id = isPlainObject(entry) ? entry.id : null;
      if (typeof id === 'string' && id.trim() !== '') ids.add(id.trim());
    }
  }
  return ids;
}

/** The ordered union of catalogued picks, and the records that authored no pick. */
function partitionSubjectPicks(subjects, catalogueIds, read) {
  const union = [];
  const seen = new Set();
  const inheriting = [];
  for (const subject of subjects) {
    if (!isPlainObject(subject)) continue;
    const authored = read(subject);
    // The one authoredness rule: an authored empty pick is a real pick of zero.
    if (!Array.isArray(authored)) {
      inheriting.push(subject);
      continue;
    }
    for (const id of normalizeCheckModifierIds(authored)) {
      if (seen.has(id) || !catalogueIds.has(id)) continue;
      seen.add(id);
      union.push(id);
    }
  }
  return { union, inheriting };
}

/** Mutates the check and subjects in place. */
function seedActivityMark(check, subjects, catalogueIds, field) {
  if (!isPlainObject(check)) return;
  if (normalizeModifierPolicy(check.defaultModifierPolicy) !== SUBJECT_POLICY) return;
  // An authored empty array only: a non-empty mark is already the GM's answer.
  if (!Array.isArray(check.defaultModifierIds) || check.defaultModifierIds.length > 0) return;

  const { union, inheriting } = partitionSubjectPicks(subjects, catalogueIds, field.read);

  // Nothing picked, nothing suppressed: writing would pin records whose rolls never changed.
  if (union.length === 0) return;

  check.defaultModifierIds = union;
  for (const subject of inheriting) field.pin(subject);
}

export function applySubjectModifierMarks(system, sources = {}) {
  if (!isPlainObject(system)) return;
  const catalogueIds = catalogueIdsFor(sources.worldLibraries, system);
  const components = [system.components, system.managedItems, system.items].find((list) =>
    Array.isArray(list)
  );
  const subjectsByCheck = {
    craftingCheck: Array.isArray(sources.recipes) ? sources.recipes : [],
    salvageCraftingCheck: components ?? [],
    gatheringCraftingCheck: Array.isArray(sources.tasks) ? sources.tasks : [],
  };
  for (const field of ACTIVITY_MARKS) {
    seedActivityMark(system[field.checkKey], subjectsByCheck[field.checkKey], catalogueIds, field);
  }
}

export function migrateSubjectModifierMarks(data = {}) {
  if (!Array.isArray(data?.systems)) {
    return {
      systems: data?.systems,
      recipes: data?.recipes,
      gatheringConfig: data?.gatheringConfig,
    };
  }
  const systems = clone(data.systems);
  const recipes = Array.isArray(data.recipes) ? clone(data.recipes) : data.recipes;
  const gatheringConfig = isPlainObject(data.gatheringConfig)
    ? clone(data.gatheringConfig)
    : data.gatheringConfig;
  const configSystems = isPlainObject(gatheringConfig?.systems) ? gatheringConfig.systems : null;

  forEachSystem(systems, (system) => {
    const systemId = String(system.id ?? '');
    applySubjectModifierMarks(system, {
      worldLibraries: data.characterLibraries,
      recipes: Array.isArray(recipes)
        ? recipes.filter(
            (recipe) => isPlainObject(recipe) && String(recipe.craftingSystemId ?? '') === systemId
          )
        : [],
      tasks: configSystems?.[systemId]?.tasks,
    });
  });

  return { systems, recipes, gatheringConfig };
}
