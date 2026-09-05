/**
 * A SYSTEM-SCOPE ESSENCE WRITE IS AN OVERRIDE — the one home for that rule (issue 1371
 * r19-store2, the driver's ruling on the reviewer's round-5 finding 3, under maintainer ruling
 * M31; reworked at r20-store3 for round 6's findings 1, 2, 5, 6 and 7).
 *
 * ## THE RULE, AND WHY IT NEEDS A HOME OF ITS OWN
 *
 * A world component record carries an `essences` SECTION and every system inherits it unless its
 * membership record overrides, so the read union OVERWRITES an inheriting system's own row with
 * the world map (`scopedDefinitionStore`'s `applyInheritedSections`). A write made on a SYSTEM
 * screen therefore lands on a field nothing resolves, while the surface that made it counts it and
 * reports success. After the `1.32.0` election that is EVERY component in a one-system world.
 *
 * The answer is the rules editor's own order (`ComponentEditView`'s `setEssenceInheritance`): the
 * FLAG first through `setSectionInherited`, the VALUES second, so a flag-only landing leaves the
 * system overriding rather than persisting a map the union masks.
 *
 * It lives here rather than inside `adminStore` because there are TWO entry points to a
 * system-scope component write and they must not be able to disagree: the manager's own store, and
 * the standalone `SvelteComponentEditorApp`, which reaches `CraftingSystemManager.updateItem`
 * directly when it has no manager window to borrow a store from. A second copy of this rule is
 * exactly the drift a shared unit exists to prevent.
 *
 * **THAT SECOND ENTRY POINT IS CURRENTLY UNREACHABLE FROM THE MANAGER** (reviewer round 6). Its
 * only constructor call is `SvelteCraftingSystemManagerApp.svelte.js`'s `services.onEditComponent`,
 * and nothing consumes that service — `CraftingSystemManagerRoot` binds its own in-page route to
 * every `onEditComponent` prop, and no `renderItemSheet` or header-control hook opens the app. It
 * is wired here because it is a live writer the moment anything opens it, not because a GM reaches
 * it today; earlier revisions of this docblock said "opened from an item sheet", which described a
 * path that does not exist.
 *
 * ## THE FLIP ONLY FIRES WHERE THE WRITE WOULD IN FACT BE SHADOWED (round 6, finding 7)
 *
 * "Inheriting" is not sufficient. `applyInheritedSections` skips a section whose world default is
 * `undefined`, so a pair that inherits an UNAUTHORED world section already resolves its own row and
 * nothing shadows the write. Flipping there opted the pair out of a world default it had not yet
 * received — invisibly, because `ComponentEditView` withholds the inherit offer precisely when the
 * world authored nothing, so the GM could neither see nor reverse it. {@link ComponentEssenceOverrideSeams.readComponentScope}
 * therefore reads the whole corpus rather than the membership half alone, and the cohort is the
 * pairs that inherit an AUTHORED world map.
 *
 * ## "DID THE GM AUTHOR ANYTHING" IS ANSWERED AGAINST A BASELINE, NOT AN ASSUMPTION (finding 1)
 *
 * An editor sends `essences` on every save whether or not the GM touched the card, so the rule has
 * to be able to tell a restatement from an authored override. It used to compare the staged map
 * against what the system RESOLVES, which is sound only for an editor SEEDED from the resolved map
 * — true of the in-page rules editor, false of a caller seeded from the persisted row. So the
 * caller may now hand over the BASELINE its editor was seeded from and the comparison is made
 * against that; the resolved map is the fallback for a caller that states none, and the assumption
 * is written down here rather than left implicit at two call sites.
 *
 * ## THE SEAMS ARE THREE NAMED COLLABORATORS, NOT A STORE
 *
 * This module reaches no store, no manager and no Foundry global. It is handed the three narrow
 * reads and writes it needs, so both call sites wire it from what they already hold and a test
 * drives it with three functions. Each seam is called inside a `try` here rather than at the call
 * sites, so neither caller can forget: a corpus that throws degrades to "nothing is shadowed" (the
 * write is what it always was), a union that throws degrades to "no resolved map" (the exemption
 * declines and the write is treated as authored), and a flag write that THROWS is a refusal — a
 * refused world-setting write REJECTS rather than answering `false`, because Foundry's
 * `SocketInterface.dispatch` toasts `error.message` and then rejects.
 *
 * ## A REFUSED PAIR LOSES ITS ESSENCE AXIS AND NOTHING ELSE (finding 6)
 *
 * A refusal is a statement about the `essences` section, so `cohortFor` REPORTS the refused pairs
 * rather than swallowing them: the caller writes the whole edit to the writable pairs and the
 * essence-less remainder to the refused ones, and a cohort staging `category` alongside `essences`
 * no longer loses its category change to an unrelated setting refusal.
 *
 * ## AND A FLIP THAT OUTLIVES ITS VALUE WRITE IS ROLLED BACK (finding 5)
 *
 * The flip is a durable, replicated world-setting write that lands BEFORE the values. If the value
 * write then throws, the GM is told the save failed while the pair is left overriding with its
 * dormant map, which no later world edit reaches. Both verbs therefore report which pairs they
 * FLIPPED, and {@link ComponentEssenceOverride.rollback} puts them back — the precedent is
 * `adminStore`'s `joinComponentToSystem`, which removes the membership record its own call wrote
 * when the second half refuses.
 */

import { componentEssenceMapsEqual } from './componentScope.js';
import { resolvedComponentEssencesFor } from './resolvedComponentEssences.js';
import { findWorldDefault, isSectionInherited } from './scopedDefinitions.js';

/**
 * @typedef {object} ComponentEssenceOverrideSeams
 * @property {() => unknown} readComponentScope The published component-scope corpus, in the
 *   `{entities, defaults, membership}` ARRAY shape. Both the membership records and the world
 *   defaults are read from it, because "would this write be shadowed" needs both halves.
 * @property {(systemId: string, componentId: string) => unknown} readResolvedEssences What one
 *   system currently resolves for one component's essences, through the read union.
 * @property {(componentId: string, systemId: string, inherit: boolean) => Promise<unknown>}
 *   setEssenceInheritance Move one pair's `essences` switch. Answering `false` — or rejecting — is
 *   a refusal.
 */

/**
 * @typedef {object} ComponentEssenceOverride
 * @property {(systemId: string, componentIds: string[], edit: object) =>
 *   Promise<{writable: string[], refused: string[], flipped: string[]}>} cohortFor
 * @property {(systemId: string, componentId: string, updates: object,
 *   options?: {baseline?: unknown}) => Promise<{staged: object|null, flipped: string[]}>} updatesFor
 * @property {(systemId: string, componentIds: string[]) => Promise<void>} rollback
 */

/**
 * The override rule, bound to one set of seams.
 *
 * @param {ComponentEssenceOverrideSeams} seams
 * @returns {ComponentEssenceOverride}
 */
export function createComponentEssenceOverride({
  readComponentScope,
  readResolvedEssences,
  setEssenceInheritance,
}) {
  /**
   * The components whose `essences` section this system INHERITS FROM AN AUTHORED WORLD MAP, so a
   * value write here would be shadowed by that map until the switch moves.
   *
   * THREE CONDITIONS, and each drops a pair the flip must not touch. A pair with NO membership
   * record is absent: nothing shadows a component the world corpus does not hold for this system.
   * A pair whose switch is already OFF is absent: it overrides already. And a pair whose world
   * record never AUTHORED the section is absent, because `applyInheritedSections` skips an
   * `undefined` value and the system therefore already resolves its own row — see the header.
   *
   * @param {string} systemId
   * @returns {Set<string>}
   */
  function shadowedIn(systemId) {
    const shadowed = new Set();
    let corpus;
    try {
      corpus = readComponentScope?.();
    } catch {
      return shadowed;
    }
    const memberships = Array.isArray(corpus?.membership) ? corpus.membership : [];
    const defaults = Array.isArray(corpus?.defaults) ? corpus.defaults : [];
    for (const record of memberships) {
      if (record?.systemId !== systemId) continue;
      if (!isSectionInherited(record, 'essences')) continue;
      if (findWorldDefault(defaults, record.entityId)?.essences === undefined) continue;
      shadowed.add(record.entityId);
    }
    return shadowed;
  }

  /**
   * What one system resolves for one component's essences, or absence when it cannot be asked.
   *
   * @param {string} systemId
   * @param {string} componentId
   * @returns {unknown}
   */
  function resolvedEssences(systemId, componentId) {
    try {
      return readResolvedEssences?.(systemId, componentId);
    } catch {
      return;
    }
  }

  /**
   * Move ONE pair's `essences` switch.
   *
   * @param {string} componentId
   * @param {string} systemId
   * @param {boolean} inherit
   * @returns {Promise<boolean>} whether the switch moved.
   */
  async function moveSwitch(componentId, systemId, inherit) {
    try {
      return (await setEssenceInheritance?.(componentId, systemId, inherit)) !== false;
    } catch (error) {
      console.error('Fabricate | Failed to move a component essence section switch:', error);
      return false;
    }
  }

  return {
    /**
     * The subset of a set-apply cohort a staged `essences` axis may be written to, having flipped
     * each shadowed pair to OVERRIDE first.
     *
     * An edit with no `essences` axis is returned untouched: `category` and `tags` are answered
     * from the same row and are not shadowed by this section.
     *
     * ONE FLAG WRITE PER PAIR, not one per batch, and that is deliberate: refusal is per pair, so
     * a pair whose flag will not move loses its ESSENCE axis and keeps the rest, instead of taking
     * the batch down with it. The world catalogue's own bulk essence group already writes one
     * world-section write per record, so a per-record write is the established shape rather than a
     * new cost.
     *
     * @param {string} systemId
     * @param {string[]} componentIds
     * @param {object} edit the staged axes.
     * @returns {Promise<{writable: string[], refused: string[], flipped: string[]}>} the pairs the
     *   whole edit may be written to, the pairs whose flag write was refused, and the pairs whose
     *   switch this call actually moved.
     */
    async cohortFor(systemId, componentIds, edit) {
      const ids = Array.isArray(componentIds) ? componentIds : [];
      if (!Object.hasOwn(edit ?? {}, 'essences'))
        return { writable: ids, refused: [], flipped: [] };
      const shadowed = shadowedIn(systemId);
      if (shadowed.size === 0) return { writable: ids, refused: [], flipped: [] };
      const writable = [];
      const refused = [];
      const flipped = [];
      // Awaited one at a time, in selection order, so a refusal stops that pair and no other.
      for (const id of ids) {
        if (!shadowed.has(id)) {
          writable.push(id);
        } else if (await moveSwitch(id, systemId, false)) {
          writable.push(id);
          flipped.push(id);
        } else {
          refused.push(id);
        }
      }
      return { writable, refused, flipped };
    },

    /**
     * The `updates` a SINGLE component write may make, having settled its `essences` axis.
     *
     * THREE ANSWERS, and the first is the one that protects authored data. A component editor
     * sends `essences` on every save whether or not the GM touched the card, which is locked while
     * the section inherits. A save that merely restates its BASELINE — what the editor was seeded
     * from, stated by the caller, or what the system resolves when it states none — has authored
     * nothing, so the key is DROPPED: writing it would replace the system's dormant own map, which
     * is exactly what an inheriting system falls back to if the world section is later cleared. A
     * map that DIFFERS is a real authored override and takes the flag-then-values order. A refused
     * flag write answers `staged: null`, which refuses the whole save.
     *
     * @param {string} systemId
     * @param {string} componentId
     * @param {object} updates
     * @param {{baseline?: unknown}} [options] `baseline` is the essence map the caller's editor was
     *   SEEDED from. Omit it only when the editor is seeded from the read union.
     * @returns {Promise<{staged: object|null, flipped: string[]}>}
     */
    async updatesFor(systemId, componentId, updates, { baseline } = {}) {
      if (!Object.hasOwn(updates ?? {}, 'essences')) return { staged: updates, flipped: [] };
      if (!shadowedIn(systemId).has(componentId)) return { staged: updates, flipped: [] };
      const seed = baseline === undefined ? resolvedEssences(systemId, componentId) : baseline;
      if (componentEssenceMapsEqual(updates.essences, seed)) {
        const next = { ...updates };
        delete next.essences;
        return { staged: next, flipped: [] };
      }
      if (!(await moveSwitch(componentId, systemId, false))) return { staged: null, flipped: [] };
      return { staged: updates, flipped: [componentId] };
    },

    /**
     * Put back every switch a failed write flipped.
     *
     * Best effort by construction: `moveSwitch` already swallows a refusal, and a rollback that
     * cannot land leaves the pair exactly where the un-rolled-back write would have. The caller is
     * reporting a failure either way, so nothing here may throw over the top of it.
     *
     * @param {string} systemId
     * @param {string[]} componentIds the `flipped` list one of the verbs above answered.
     * @returns {Promise<void>}
     */
    async rollback(systemId, componentIds) {
      for (const id of Array.isArray(componentIds) ? componentIds : []) {
        await moveSwitch(id, systemId, true);
      }
    },
  };
}

/**
 * The rule, wired to the two accessors every system-scope component writer already holds.
 *
 * STATED ONCE, so the manager's store and the standalone component editor cannot wire the same
 * rule two slightly different ways — which is the second half of the drift a shared unit prevents,
 * and the half a copied three-line lambda would reintroduce. The accessors are THUNKS because both
 * callers resolve their collaborators lazily: `services.getComponentScopeStore` in the store, and
 * `game.fabricate.getComponentScopeStore` at the app's Foundry edge.
 *
 * The resolved read is `systems/resolvedComponentEssences.js`, which is the SAME accessor the row
 * projection, the essence usage counts and the delete-impact dialog read — see that module for why
 * one accessor rather than a read per consumer (reviewer round 6).
 *
 * `setEssenceInheritance` stays the caller's own, because the flag write is the one seam the two
 * genuinely differ on: the store hands over its composed family verb, and a caller with no store
 * mints a world-scope family of its own. Keeping the write path out of this module is what lets it
 * stay a pure rule with no route to a setting.
 *
 * @param {{getComponentScopeStore: () => object|null,
 *   getCraftingSystemManager: () => object|null,
 *   setEssenceInheritance: (componentId: string, systemId: string, inherit: boolean) =>
 *     Promise<unknown>}} wiring
 * @returns {ComponentEssenceOverride}
 */
export function componentEssenceOverrideOn({
  getComponentScopeStore,
  getCraftingSystemManager,
  setEssenceInheritance,
}) {
  return createComponentEssenceOverride({
    readComponentScope: () => getComponentScopeStore?.()?.corpus?.(),
    readResolvedEssences: (systemId, componentId) =>
      resolvedComponentEssencesFor(getCraftingSystemManager?.(), systemId, componentId),
    setEssenceInheritance,
  });
}
