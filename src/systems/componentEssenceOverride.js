/**
 * A SYSTEM-SCOPE ESSENCE WRITE IS AN OVERRIDE — the one home for that rule (issue 1371
 * r19-store2, the driver's ruling on the reviewer's round-5 finding 3, under maintainer ruling
 * M31).
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
 * the standalone `SvelteComponentEditorApp` opened from an item sheet, which reaches
 * `CraftingSystemManager.updateItem` directly when it has no manager window to borrow a store
 * from. A second copy of this rule is exactly the drift a shared unit exists to prevent.
 *
 * ## THE SEAMS ARE THREE NAMED COLLABORATORS, NOT A STORE
 *
 * This module reaches no store, no manager and no Foundry global. It is handed the three narrow
 * reads and writes it needs, so both call sites wire it from what they already hold and a test
 * drives it with three functions. Each seam is called inside a `try` here rather than at the call
 * sites, so neither caller can forget: a corpus that throws degrades to "nothing inherits" (the
 * write is what it always was), a union that throws degrades to "no resolved map" (the equality
 * exemption declines and the write is treated as authored), and a flag write that THROWS is a
 * refusal — a refused world-setting write REJECTS rather than answering `false`, because Foundry's
 * `SocketInterface.dispatch` toasts `error.message` and then rejects.
 */

import { componentEssenceMapsEqual } from './componentScope.js';
import { isSectionInherited } from './scopedDefinitions.js';

/**
 * @typedef {object} ComponentEssenceOverrideSeams
 * @property {() => unknown} readComponentMemberships The published component-scope membership
 *   records, in the corpus ARRAY shape.
 * @property {(systemId: string, componentId: string) => unknown} readResolvedEssences What one
 *   system currently resolves for one component's essences, through the read union.
 * @property {(componentId: string, systemId: string) => Promise<unknown>} setEssencesOverridden
 *   Flip one pair's `essences` switch OFF. Answering `false` — or rejecting — is a refusal.
 */

/**
 * The override rule, bound to one set of seams.
 *
 * @param {ComponentEssenceOverrideSeams} seams
 * @returns {{cohortFor: (systemId: string, componentIds: string[], edit: object) =>
 *   Promise<string[]>, updatesFor: (systemId: string, componentId: string, updates: object) =>
 *   Promise<object|null>}}
 */
export function createComponentEssenceOverride({
  readComponentMemberships,
  readResolvedEssences,
  setEssencesOverridden,
}) {
  /**
   * The components whose `essences` section this system INHERITS, so a value write here would be
   * shadowed by the world map until the switch moves.
   *
   * A pair with NO membership record is absent from the answer: nothing shadows a component the
   * world corpus does not hold for this system, and the write is what it always was.
   *
   * @param {string} systemId
   * @returns {Set<string>}
   */
  function inheritingIn(systemId) {
    const inheriting = new Set();
    let memberships;
    try {
      memberships = readComponentMemberships?.();
    } catch {
      return inheriting;
    }
    for (const record of Array.isArray(memberships) ? memberships : []) {
      if (record?.systemId !== systemId) continue;
      if (isSectionInherited(record, 'essences')) inheriting.add(record.entityId);
    }
    return inheriting;
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
   * Flip ONE pair's `essences` switch off ahead of a value write.
   *
   * @param {string} componentId
   * @param {string} systemId
   * @returns {Promise<boolean>} whether the pair may now be written.
   */
  async function override(componentId, systemId) {
    try {
      return (await setEssencesOverridden?.(componentId, systemId)) !== false;
    } catch (error) {
      console.error('Fabricate | Failed to override a component essence section:', error);
      return false;
    }
  }

  return {
    /**
     * The subset of a set-apply cohort a staged `essences` axis may be written to, having flipped
     * each inheriting pair to OVERRIDE first.
     *
     * An edit with no `essences` axis is returned untouched: `category` and `tags` are answered
     * from the same row and are not shadowed by this section.
     *
     * ONE FLAG WRITE PER PAIR, not one per batch, and that is deliberate: refusal is per pair, so
     * a pair whose flag will not move is dropped from the value write instead of taking the batch
     * down with it. The world catalogue's own bulk essence group already writes one world-section
     * write per record, so a per-record write is the established shape rather than a new cost.
     *
     * @param {string} systemId
     * @param {string[]} componentIds
     * @param {object} edit the staged axes.
     * @returns {Promise<string[]>}
     */
    async cohortFor(systemId, componentIds, edit) {
      if (!Object.hasOwn(edit ?? {}, 'essences')) return componentIds;
      const inheriting = inheritingIn(systemId);
      if (inheriting.size === 0) return componentIds;
      const writable = [];
      // Awaited one at a time, in selection order, so a refusal stops that pair and no other.
      for (const id of componentIds) {
        if (!inheriting.has(id) || (await override(id, systemId))) writable.push(id);
      }
      return writable;
    },

    /**
     * The `updates` a SINGLE component write may make, having settled its `essences` axis.
     *
     * THREE ANSWERS, and the first is the one that protects authored data. A component editor
     * seeds its steppers from what the system RESOLVES and sends `essences` on every save whether
     * or not the GM touched the card, which is locked while the section inherits. A save that
     * merely restates the resolved map has authored nothing, so the key is DROPPED: writing it
     * would replace the system's dormant own map, which is exactly what an inheriting system falls
     * back to if the world section is later cleared. A map that DIFFERS is a real authored
     * override and takes the flag-then-values order. A refused flag write answers `null`, which
     * refuses the whole save.
     *
     * @param {string} systemId
     * @param {string} componentId
     * @param {object} updates
     * @returns {Promise<object|null>}
     */
    async updatesFor(systemId, componentId, updates) {
      if (!Object.hasOwn(updates ?? {}, 'essences')) return updates;
      if (!inheritingIn(systemId).has(componentId)) return updates;
      if (componentEssenceMapsEqual(updates.essences, resolvedEssences(systemId, componentId))) {
        const next = { ...updates };
        delete next.essences;
        return next;
      }
      return (await override(componentId, systemId)) ? updates : null;
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
 * `setEssencesOverridden` stays the caller's own, because the flag write is the one seam the two
 * genuinely differ on: the store hands over its composed family verb, and a caller with no store
 * mints a world-scope family of its own. Keeping the write path out of this module is what lets it
 * stay a pure rule with no route to a setting.
 *
 * @param {{getComponentScopeStore: () => object|null,
 *   getCraftingSystemManager: () => object|null,
 *   setEssencesOverridden: (componentId: string, systemId: string) => Promise<unknown>}} wiring
 * @returns {ReturnType<typeof createComponentEssenceOverride>}
 */
export function componentEssenceOverrideOn({
  getComponentScopeStore,
  getCraftingSystemManager,
  setEssencesOverridden,
}) {
  return createComponentEssenceOverride({
    readComponentMemberships: () => getComponentScopeStore?.()?.corpus?.()?.membership,
    readResolvedEssences: (systemId, componentId) =>
      (getCraftingSystemManager?.()?.getComponentsForSystem?.(systemId) ?? []).find(
        (row) => String(row?.id ?? '') === componentId
      )?.essences,
    setEssencesOverridden,
  });
}
