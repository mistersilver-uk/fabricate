/**
 * The **stale-arrangement write refusal** (issue 1232).
 *
 * A definition repository chooses its backend ONCE, in the owning manager's constructor,
 * from the Definition Storage Target. Nothing rebuilds it when the layout moves underneath
 * it, and that gap is a data-loss door rather than a staleness annoyance:
 *
 * A client that built {@link import('./SettingsCraftingDefinitionRepository.js').SettingsCraftingDefinitionRepository}
 * writes the whole corpus through `ClientSettings#set`. After a forward Storage Layout
 * Conversion has deleted the legacy `fabricate.recipes` document, that write finds
 * `current?._id` falsy and takes the **create** branch — silently RE-CREATING the legacy
 * document, with a stale pre-conversion corpus inside it and a fresh envelope spent against
 * the granular-storage budget. `data-models/spec.md` states the rule this enforces: "The
 * legacy key MUST NOT be written after conversion [...] this is covered by a test rather
 * than by convention."
 *
 * The mirror image is equally reachable now that a REVERSE conversion exists: a client
 * holding the per-record adapter after a reverse conversion writes `fabricate.recipe.<id>`
 * documents back into existence, re-spending the very envelopes the reverse reclaimed.
 * The guard is therefore symmetric and is installed on BOTH adapters, keyed on the
 * arrangement each was built for rather than on its class.
 *
 * Reachable by any assistant GM: recipe CRUD is gated on `SETTINGS_MODIFY`, not on the
 * primary GM.
 *
 * ## Fail direction
 *
 * This refuses only on a POSITIVELY established disagreement — the layout reads back as a
 * recognised arrangement AND it is not the one this repository addresses. An unreadable
 * layout does not refuse, and that direction is deliberate in both halves:
 *
 * - refusing on an unreadable layout would brick every write in the several hundred unit
 *   fixtures that construct a manager with no `game` at all, and on a live world the layout
 *   is a registered setting that always reads;
 * - the hazard being closed is a layout that MOVED, which is by definition readable — the
 *   conversion that moved it wrote it.
 *
 * That is the same reasoning as `RecipeManager`'s `readRecipeStorageTarget`, and the
 * OPPOSITE of the Valid Id Basis gate, which must treat an unreadable setting as
 * not-known-complete. Both are correct where they sit: this one governs whether a write is
 * allowed to land, the gate governs whether a DELETE is allowed to run.
 */

import { DEFINITION_STORAGE_LAYOUTS } from '../config/settings.js';

/** Every value a Definition Storage LAYOUT may legitimately hold. */
const RECOGNISED_ARRANGEMENTS = Object.freeze(Object.values(DEFINITION_STORAGE_LAYOUTS));

/**
 * Thrown when a definition repository is asked to write through an arrangement the world
 * has already left.
 *
 * A named subclass rather than a bare `Error` because the refusal is a recoverable session
 * fact with a known remedy — reload, or let the layout-change signal rebuild the repository
 * — and a caller that wants to say so must be able to tell it apart from a validation or
 * permission failure.
 */
export class DefinitionStorageArrangementError extends Error {
  /**
   * @param {string} arrangement The arrangement this repository was built for.
   * @param {string} layout The arrangement the world reports now.
   */
  constructor(arrangement, layout) {
    super(
      `Fabricate | refusing a definition write: this client's storage is arranged as "${arrangement}" but the world's layout is now "${layout}". Reload to pick up the new arrangement.`
    );
    this.name = 'DefinitionStorageArrangementError';
    this.arrangement = arrangement;
    this.layout = layout;
  }
}

/**
 * True only for a value this build recognises as a storage arrangement.
 *
 * @param {*} value
 * @returns {boolean}
 */
export function isRecognisedArrangement(value) {
  return typeof value === 'string' && RECOGNISED_ARRANGEMENTS.includes(value);
}

/**
 * The write guard a definition repository calls before it touches storage.
 *
 * Returns a no-op guard when the caller states no arrangement, which is what an INJECTED
 * repository gets: nothing here knows what arrangement a caller-supplied adapter was built
 * for, and a guess would refuse writes on every fixture that injects one.
 *
 * @param {object} [options]
 * @param {string|null} [options.arrangement] The arrangement the repository addresses.
 * @param {() => string|null} [options.readLayout] Reads the entity class's Definition
 *   Storage Layout, answering `null` when it cannot be read at all.
 * @returns {() => void} throws {@link DefinitionStorageArrangementError} when the world has
 *   moved to a different arrangement.
 */
export function createArrangementWriteGuard({ arrangement = null, readLayout = null } = {}) {
  if (!isRecognisedArrangement(arrangement) || typeof readLayout !== 'function') {
    return () => {};
  }
  return () => {
    const layout = readLayout();
    if (!isRecognisedArrangement(layout)) return;
    if (layout === arrangement) return;
    throw new DefinitionStorageArrangementError(arrangement, layout);
  };
}
