/**
 * The Counters screen's route state and handlers: which row is open, which Name takes focus once, the
 * search that outlives the editor round trip, and the writes. Every input is a thunk read at call
 * time, and the model owns no effect.
 */
import { createCountersBrowserState } from '../../../../model/managerBrowserViewState.js';

import { confirmCounterDelete } from './iterativeDeleteConfirm.js';

/**
 * @param {object} seams
 * @param {() => object|undefined} seams.section The store's `iterative` member.
 * @param {(view: string, onEnter?: () => void) => void} seams.setView Guarded navigation.
 * @param {() => object} seams.services The manager services, of which this reads `confirmDialog`.
 * @param {Function} seams.text `(key, fallback)` localizer.
 * @returns {{ handlers: object, reads: object }}
 */
export function createIterativeCounterRoute({ section, setView, services, text }) {
  let expandedId = $state('');
  let focusNameId = $state('');
  const browse = $state(createCountersBrowserState());

  const handlers = {
    expandCounter: (id) => {
      expandedId = id;
    },
    openCounter: (id) =>
      setView('iterative-counters', () => {
        expandedId = id;
      }),
    /** Adds a Counter, opens it and asks the screen to focus its Name. */
    addCounter: async () => {
      const id = await section()?.addCounter();
      if (id) {
        expandedId = id;
        focusNameId = id;
      }
      return id;
    },
    clearNameFocus: () => {
      focusNameId = '';
    },
    updateCounter: (id, patch) => section()?.updateCounter(id, patch) ?? false,
    reorderCounters: (from, to) => section()?.reorderCounters(from, to) ?? false,
    /** Confirms with where `counter` is used, then deletes it; answers whether it did. */
    deleteCounter: async (counter, uses) => {
      const confirmed = await confirmCounterDelete({
        confirmDialog: services()?.confirmDialog,
        text,
        counter,
        uses,
      });
      return confirmed && (await section().deleteCounter(counter.id));
    },
  };

  return {
    handlers,
    /** Thunks for the route model's read-only accessors, so a spread never freezes a value. */
    reads: {
      expandedCounterId: () => expandedId,
      focusNameId: () => focusNameId,
      countersBrowse: () => browse,
    },
  };
}
