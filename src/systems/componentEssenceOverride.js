/**
 * A system-scope essence write is an override: the one home for that rule (issue 1371), shared by
 * `adminStore`'s `updateComponent` and `componentEditorSave.js`'s `overrideAwareComponentWrite` so
 * the two entry points cannot disagree. The read union answers an inheriting system's `essences`
 * from the world map, so a write there would be masked; the pair's flag moves to overriding first,
 * then the values land, as `ComponentEditView`'s `setEssenceInheritance` orders it.
 *
 * The flip fires only where the write would be shadowed, and a save that restates the editor's
 * baseline authors nothing. Every seam call is guarded here: a throwing corpus means nothing is
 * shadowed, a throwing union means no resolved map, and a throwing flag write is a refusal (a
 * refused world-setting write rejects: `SocketInterface.dispatch` toasts, then rejects). A refused
 * pair loses its essence axis and nothing else, and a flip whose value write fails is rolled back
 * to its whole pre-state record, not just its switch.
 */

import { componentEssenceMapsEqual } from './componentScope.js';
import { resolvedComponentEssencesFor } from './resolvedComponentEssences.js';
import { findWorldDefault, isSectionInherited } from './scopedDefinitions.js';

/**
 * @typedef {object} ComponentEssenceFlip
 * @property {string} componentId
 * @property {boolean} seeded whether moving the switch off also seeded the record's own `essences`
 *   block, the one pre-state fact a rollback cannot re-derive.
 */

/**
 * The rule bound to its seams: `readComponentScope` (the corpus in array shape),
 * `readResolvedEssences`, `setEssenceInheritance` (answering `false` or rejecting is a refusal)
 * and the optional `clearEssenceOverride`, used only by `rollback`.
 */
export function createComponentEssenceOverride({
  readComponentScope,
  readResolvedEssences,
  setEssenceInheritance,
  clearEssenceOverride,
}) {
  /**
   * Components this system inherits from an authored world map, each mapped to whether a flip
   * would seed its block. Each skip mirrors the union: no membership, no roster entry (the union
   * passes the row through), a switch already off, or an unauthored world section.
   */
  function shadowedIn(systemId) {
    const shadowed = new Map();
    let corpus;
    try {
      corpus = readComponentScope?.();
    } catch {
      return shadowed;
    }
    const memberships = Array.isArray(corpus?.membership) ? corpus.membership : [];
    const defaults = Array.isArray(corpus?.defaults) ? corpus.defaults : [];
    const roster = new Set(
      (Array.isArray(corpus?.entities) ? corpus.entities : []).map((entity) =>
        String(entity?.id ?? '').trim()
      )
    );
    for (const record of memberships) {
      if (record?.systemId !== systemId) continue;
      if (!roster.has(String(record?.entityId ?? '').trim())) continue;
      if (!isSectionInherited(record, 'essences')) continue;
      if (findWorldDefault(defaults, record.entityId)?.essences === undefined) continue;
      shadowed.set(record.entityId, record.essences === undefined);
    }
    return shadowed;
  }

  function resolvedEssences(systemId, componentId) {
    try {
      return readResolvedEssences?.(systemId, componentId);
    } catch {
      return;
    }
  }

  async function moveSwitch(componentId, systemId, inherit) {
    try {
      return (await setEssenceInheritance?.(componentId, systemId, inherit)) !== false;
    } catch (error) {
      console.error('Fabricate | Failed to move a component essence section switch:', error);
      return false;
    }
  }

  /** Swallows a refusal: the caller is already reporting a failure. */
  async function clearOverride(componentId, systemId) {
    try {
      await clearEssenceOverride?.(componentId, systemId);
    } catch (error) {
      console.error('Fabricate | Failed to clear a seeded component essence override:', error);
    }
  }

  return {
    /**
     * The cohort an `essences` edit may be written to, flipping each shadowed pair first, one flag
     * write per pair so a refusal drops only that pair's essence axis. An edit without `essences`
     * passes untouched.
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
          flipped.push({ componentId: id, seeded: shadowed.get(id) === true });
        } else {
          refused.push(id);
        }
      }
      return { writable, refused, flipped };
    },

    /**
     * One component write's `updates`. A map equal to the baseline (`baseline`, else what the
     * system resolves) drops the key so the dormant own map survives; a differing map flips then
     * writes; a refused flip answers `staged: null`, refusing the save.
     */
    async updatesFor(systemId, componentId, updates, { baseline } = {}) {
      if (!Object.hasOwn(updates ?? {}, 'essences')) return { staged: updates, flipped: [] };
      const shadowed = shadowedIn(systemId);
      if (!shadowed.has(componentId)) return { staged: updates, flipped: [] };
      const seed = baseline === undefined ? resolvedEssences(systemId, componentId) : baseline;
      if (componentEssenceMapsEqual(updates.essences, seed)) {
        const next = { ...updates };
        delete next.essences;
        return { staged: next, flipped: [] };
      }
      if (!(await moveSwitch(componentId, systemId, false))) return { staged: null, flipped: [] };
      return {
        staged: updates,
        flipped: [{ componentId, seeded: shadowed.get(componentId) === true }],
      };
    },

    /**
     * Restore each flipped pair: the switch first, then clear a block the flip seeded, since
     * `setSectionInheritance` seeds on the way off and not back. Best effort and never throws; a
     * bare id restores the switch alone.
     */
    async rollback(systemId, flipped) {
      for (const flip of Array.isArray(flipped) ? flipped : []) {
        const componentId = typeof flip === 'string' ? flip : flip?.componentId;
        if (!componentId) continue;
        await moveSwitch(componentId, systemId, true);
        if (flip?.seeded === true) await clearOverride(componentId, systemId);
      }
    },
  };
}

/**
 * The rule wired once from the thunks every writer holds; the resolved read is
 * `resolvedComponentEssencesFor`, and both writes stay the caller's own.
 */
export function componentEssenceOverrideOn({
  getComponentScopeStore,
  getCraftingSystemManager,
  setEssenceInheritance,
  clearEssenceOverride,
}) {
  return createComponentEssenceOverride({
    readComponentScope: () => getComponentScopeStore?.()?.corpus?.(),
    readResolvedEssences: (systemId, componentId) =>
      resolvedComponentEssencesFor(getCraftingSystemManager?.(), systemId, componentId),
    setEssenceInheritance,
    clearEssenceOverride,
  });
}
