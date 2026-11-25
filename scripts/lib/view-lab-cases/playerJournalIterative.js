/**
 * The player Journal's iterative workpieces, on the lab's `workpiece` Ironworks (issue 3011).
 * Each later screen of the workbench adds the frames it renders, once its hooks exist.
 */

import { JOURNAL_SOURCES } from './caseConstants.js';
import { playerCase } from './caseFactories.js';

/** The world every frame here renders: Ironworks as `workpiece`, in one of the `iterative-*` run states. */
const workpiece = (state) => ({
  tab: 'journal',
  iterative: 'workpiece',
  journalCaseState: `iterative-${state}`,
});

export const CASES = Object.freeze([
  playerCase({
    id: 'player-journal-iterative-list',
    label: 'Player Journal — iterative workpieces in the list',
    // `beyond`: the smoke walk never builds an iterative system.
    reaches: 'beyond',
    smokeLabels: [],
    query: workpiece('list'),
    steps: [],
    expectTab: 'journal',
    expectSelector: '[data-run-id="iw-run-longsword"]',
    kinds: ['player', 'journal', 'iterative'],
    sourceMatches: [JOURNAL_SOURCES, /^src\/ui\/svelte\/stores\/journalStore/],
  }),
]);
