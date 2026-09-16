/**
 * `1.33.0` — record the mark that keeps every existing subject pick rolling (issue 1608; spec
 * § Subject Modifier Mark Seed owns both halves and why they fire together or not at all).
 * Pure, clone-first, idempotent, version-gated.
 */

import { normalizeModifierPolicy } from '../systems/checkModifierResolver.js';
import { normalizeCheckModifierIds } from '../utils/checkModifierPicks.js';

import { isPlainObject, clone } from './migrationHelpers.js';

/** The one combination rule that hands the selection to the record being resolved. */
const SUBJECT_POLICY = 'bySubject';

/**
 * The three activity checks, each paired with the field its subject's pick lives under. Only the
 * per-activity part belongs here, since a copy reading the wrong field would silently seed nothing.
 */
const ACTIVITY_MARKS = Object.freeze([
  Object.freeze({
    checkKey: 'craftingCheck',
    read: (subject) => subject?.craftingModifier?.modifierIds,
    pin: (subject) => {
      // The recipe keeps its own `modifierIds` spelling inside `craftingModifier`, and the block
      // may be absent on a recipe that never opened the picker. Any other key already in the block
      // is preserved rather than replaced, so this pass removes nothing.
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

/**
 * The ids the world catalogue knows — a UNION with any surviving in-system copy, because before the
 * `1.28.0` lift those entries ARE the live corpus. Used only to DECLINE to write an id.
 */
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

/**
 * Read one activity's subjects into the ORDERED UNION of catalogued ids they pick and the records
 * that authored no pick. Split from the caller, which is the decision, on complexity grounds.
 */
function partitionSubjectPicks(subjects, catalogueIds, read) {
  const union = [];
  const seen = new Set();
  const inheriting = [];
  for (const subject of subjects) {
    if (!isPlainObject(subject)) continue;
    const authored = read(subject);
    // `Array.isArray` AT ENTRY, the one authoredness rule: an authored empty pick is a real pick of
    // zero and needs no pin.
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

/** Apply the whole transform to ONE activity check; the check and subjects are mutated in place. */
function seedActivityMark(check, subjects, catalogueIds, field) {
  if (!isPlainObject(check)) return;
  if (normalizeModifierPolicy(check.defaultModifierPolicy) !== SUBJECT_POLICY) return;
  // An AUTHORED EMPTY array only. A non-array bounds nothing already, and a non-empty mark is the
  // GM's own answer to the question this pass is reconstructing.
  if (!Array.isArray(check.defaultModifierIds) || check.defaultModifierIds.length > 0) return;

  const { union, inheriting } = partitionSubjectPicks(subjects, catalogueIds, field.read);

  // Nothing was picked, so nothing was suppressed and there is nothing to preserve. Writing here
  // would pin every record of an activity whose rolls this release never altered.
  if (union.length === 0) return;

  check.defaultModifierIds = union;
  for (const subject of inheriting) field.pin(subject);
}

/** Apply it to ONE system and its subjects, so there is one derivation rather than three copies. */
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

/** Runner entry point. */
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

  for (const system of systems) {
    if (!isPlainObject(system)) continue;
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
  }

  return { systems, recipes, gatheringConfig };
}
