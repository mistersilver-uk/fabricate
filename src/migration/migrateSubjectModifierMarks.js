/**
 * 1.33.0 — record the mark that keeps every existing subject pick rolling (issue 1608; pure,
 * clone-first, idempotent, version-gated).
 *
 * WHY THIS EXISTS — read this before deleting it as redundant. Under the `bySubject`
 * combination rule the activity check's `defaultModifierIds` used to be a DEFAULT the subject
 * fell back to; it is now also the MARK that BOUNDS what the subject may pick, which is what
 * the Checks studio's per-row "Selectable" / "Not selectable" pill has always claimed to
 * author. `resolveEligibleModifierIds` therefore drops a stored pick the check does not mark.
 *
 * Every already-shipped check carries a REAL ARRAY. `CraftingSystemManager
 * ._normalizeCheckModifierSelection` emits `defaultModifierIds` unconditionally, so a check
 * whose GM never toggled a single row "Selectable" is persisted as `[]` rather than as an
 * absent key — and an empty mark bounds everything away. Without this pass, the upgrade would
 * silently stop applying EVERY pick those worlds authored, on the one rule whose whole purpose
 * is to let a record pick its own.
 *
 * ═══ WHAT IT WRITES ═══
 *
 * For each activity check under `bySubject` whose mark is an AUTHORED EMPTY array:
 *
 * 1. **The mark is seeded with the union of what that activity's subjects already pick** —
 *    recipes for `craftingCheck`, components' salvage for `salvageCraftingCheck`, gathering
 *    tasks for `gatheringCraftingCheck` — in first-seen authored order, de-duplicated, and
 *    INTERSECTED with the world modifier catalogue. The intersection costs nothing and
 *    prevents the pass writing an id that names no entry: `resolveEligibleModifierIds` drops
 *    an unknown id anyway, so an id outside the catalogue contributed nothing before this pass
 *    and must contribute nothing after it.
 * 2. **Every subject of that same activity that was INHERITING the empty mark is given an
 *    explicit pick of nothing.** This half is not optional, and leaving it out is the trap:
 *    under `bySubject` a subject with no authored pick resolves the mark itself, so an
 *    inheriting record rolled NOTHING while the mark was empty and would start rolling the
 *    whole seeded union the moment step 1 landed. That is a bigger behaviour change than the
 *    one this pass exists to prevent, and it would land on every record that never opened the
 *    picker. An authored `[]` is a real pick of zero (`checkModifierPicks.js`), which is
 *    exactly what those records were already rolling.
 *
 * Both halves fire together or not at all: when the union is empty there is no mark to seed,
 * nothing changes for any subject, and no record is touched. So a world that never used the
 * rule, and a world whose subjects picked only ids its catalogue no longer knows, are both
 * left byte-identical.
 *
 * ═══ NOTHING ELSE IS TOUCHED ═══
 *
 * - **An authored NON-EMPTY mark is the GM's own answer** and is never widened. A recipe
 *   picking an id the check does not mark is precisely the state issue 1608 reports, and
 *   re-marking it here would re-authorize the pick the GM's own check refuses.
 * - **A NON-ARRAY mark bounds nothing already** (the unknown-basis sentinel the resolver
 *   reads raw), so there is nothing for this pass to preserve.
 * - **The other three rules are untouched.** `addAll`, `highest` and `playerPicks` read the
 *   mark as the SOURCE rather than as a bound, so an empty one already means "nothing rolls"
 *   there and has meant that since 1055; seeding it would ADD modifiers to every roll.
 *
 * IDEMPOTENT, and the guard is the seeded mark itself: a second pass finds a non-empty mark
 * and returns at the same test that made it non-empty. Re-running after a GM has since emptied
 * the mark by hand would re-seed it — but the version gate is what stops that, and it is the
 * same posture `1.20.0`'s conditional stamp takes.
 *
 * PURE AND CLONE-FIRST. The runner spread-merges a migration's return value
 * (`data = { ...data, ...result }`), so this returns `{ systems, recipes, gatheringConfig }`
 * rather than mutating the runner's payload. Clone-first is also what makes the no-throw
 * guarantee total: the runner restores its pre-migration checkpoint only on the FATAL branch,
 * so an in-place migration that threw halfway would persist a half-applied world. Nothing here
 * throws (every level is guarded and a malformed system, check or subject is skipped rather
 * than repaired — normalization is the normalizer's job), and because only the clone is ever
 * touched, even a hypothetical throw leaves the runner's payload untouched.
 *
 * Mutated setting keys: `craftingSystems`, `recipes` and `gatheringConfig`.
 *
 * Downgrade target `1.32.0` is LOSSLESS, in data and in behaviour. Nothing is removed: the
 * pass only adds ids to a mark and adds an empty pick to a record that had none. That build
 * reads `defaultModifierIds` as a plain default rather than as a bound, so a subject with its
 * own picks rolls exactly those picks there (mark or no mark), and a subject carrying the
 * authored `[]` this pass wrote resolves to no eligible modifier — which is what it resolved
 * to under the empty mark it used to inherit. Every record rolls the same thing in both
 * directions.
 */

import { normalizeModifierPolicy } from '../systems/checkModifierResolver.js';
import { normalizeCheckModifierIds } from '../utils/checkModifierPicks.js';

import { isPlainObject, clone } from './migrationHelpers.js';

/** The one combination rule that hands the selection to the record being resolved. */
const SUBJECT_POLICY = 'bySubject';

/**
 * The three activity checks, each paired with the field its own subject's pick lives under.
 *
 * The subjects themselves are supplied per system by the caller, because they live in three
 * different settings: recipes in `recipes`, components inside the crafting system, and
 * gathering tasks inside `gatheringConfig`. What belongs HERE is only the per-activity part
 * that would otherwise be copied three times — which field carries the pick, and how an
 * absent one is authored — since a copy that read the wrong field would silently seed nothing
 * and report success.
 *
 * @type {ReadonlyArray<{ checkKey: string, read: (subject: object) => unknown,
 *   pin: (subject: object) => void }>}
 */
const ACTIVITY_MARKS = Object.freeze([
  Object.freeze({
    checkKey: 'craftingCheck',
    read: (subject) => subject?.craftingModifier?.modifierIds,
    pin: (subject) => {
      // The recipe keeps its own `modifierIds` spelling inside `craftingModifier`, and the
      // block itself may be absent on a recipe that never opened the picker. Any other key
      // already in the block (a legacy `policy`, which nothing consults) is preserved rather
      // than replaced, so this pass removes nothing.
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
 * The ids the world's modifier catalogue actually knows.
 *
 * A UNION of the world library and any surviving legacy in-system copy, mirroring
 * `CraftingSystemManager._characterLibraryBasis` and `buildCheckModifierContext`: before the
 * `1.28.0` lift the in-system entries ARE the live corpus, and this pass runs in the same one
 * pass that may have just performed that lift.
 *
 * Used only to DECLINE to write an id, never to prune one, so an incomplete basis costs
 * nothing a reader would notice: an id outside it resolves to nothing today and would resolve
 * to nothing after being written.
 *
 * @param {unknown} worldLibraries The `characterLibraries` world setting.
 * @param {unknown} system One raw crafting system.
 * @returns {Set<string>}
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
 * Read one activity's subjects into the two lists the seed needs: the ORDERED UNION of every
 * catalogued id they pick, and the records that authored no pick at all.
 *
 * Split from the caller rather than inlined so neither function carries the whole shape — this
 * one is the corpus walk and the caller is the decision, and together they were over the
 * cognitive-complexity budget a changed function must stay under.
 *
 * @param {Array<unknown>} subjects That activity's subject records.
 * @param {Set<string>} catalogueIds The ids the world catalogue knows.
 * @param {(subject: object) => unknown} read Where this activity's pick lives on a subject.
 * @returns {{ union: string[], inheriting: object[] }}
 */
function partitionSubjectPicks(subjects, catalogueIds, read) {
  const union = [];
  const seen = new Set();
  const inheriting = [];
  for (const subject of subjects) {
    if (!isPlainObject(subject)) continue;
    const authored = read(subject);
    // `Array.isArray` AT ENTRY, the one authoredness rule (`checkModifierPicks.js`): an
    // authored empty pick is a real pick of zero and needs no pin.
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

/**
 * Apply the whole transform to ONE activity check.
 *
 * The check and the subjects are mutated in place, so callers must hand over structures they
 * already own (a clone).
 *
 * @param {unknown} check The raw activity check block.
 * @param {Array<unknown>} subjects That activity's subject records.
 * @param {Set<string>} catalogueIds The ids the world catalogue knows.
 * @param {{ read: (subject: object) => unknown, pin: (subject: object) => void }} field
 */
function seedActivityMark(check, subjects, catalogueIds, field) {
  if (!isPlainObject(check)) return;
  if (normalizeModifierPolicy(check.defaultModifierPolicy) !== SUBJECT_POLICY) return;
  // An AUTHORED EMPTY array only. A non-array bounds nothing already, and a non-empty mark is
  // the GM's own answer to the question this pass is reconstructing.
  if (!Array.isArray(check.defaultModifierIds) || check.defaultModifierIds.length > 0) return;

  const { union, inheriting } = partitionSubjectPicks(subjects, catalogueIds, field.read);

  // Nothing was picked, so nothing was suppressed and there is nothing to preserve. Writing
  // here would be storage churn for zero observable change — and it would pin every record of
  // an activity whose rolls this release never altered.
  if (union.length === 0) return;

  check.defaultModifierIds = union;
  for (const subject of inheriting) field.pin(subject);
}

/**
 * Apply the whole 1.33.0 transform to ONE crafting system and the subjects that resolve
 * against it.
 *
 * Split out this way so the world-setting migration below has one derivation rather than
 * three inlined copies, and so a caller holding a single system (an import bundle, a test)
 * can reach the same transform.
 *
 * @param {unknown} system One raw crafting system, mutated in place.
 * @param {object} [sources]
 * @param {Array<unknown>} [sources.recipes] The recipes of THIS system, already filtered.
 * @param {Array<unknown>} [sources.tasks] This system's raw `gatheringConfig` tasks.
 * @param {unknown} [sources.worldLibraries] The `characterLibraries` world setting.
 */
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

/**
 * Runner entry point.
 *
 * @param {object} data Runner payload.
 * @param {Array<object>} [data.systems] Raw craftingSystems setting.
 * @param {Array<object>} [data.recipes] Raw recipes setting.
 * @param {object} [data.gatheringConfig] Raw gatheringConfig setting.
 * @param {object} [data.characterLibraries] Raw characterLibraries setting.
 * @returns {{ systems: *, recipes: *, gatheringConfig: * }}
 */
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
