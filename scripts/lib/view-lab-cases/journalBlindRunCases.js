/**
 * The Journal's in-flight blind gathering run, from both sides of the redaction.
 */

import { JOURNAL_SOURCES } from './caseConstants.js';
import { playerCase } from './caseFactories.js';

/** The Journal's in-flight blind gathering run, from both sides of the redaction (issue 901). */
export function journalBlindRunCases() {
  // The in-flight blind run seeded by `tests/view-lab/world/labRunStates.js`.
  const card = '.journal-run-card[data-run-id="lab-gathering-blind-waiting"]';
  const shared = {
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: card },
      // Assert the SELECTION landed on the gathering run as well as scrolling its detail in: a
      // mis-click would otherwise photograph the crafting detail under a gathering case's name.
      {
        selector: '[data-journal-detail][data-run-key*="lab-gathering-blind-waiting"]',
        scroll: true,
      },
    ],
    kinds: ['player', 'journal', 'gathering'],
    sourceMatches: [
      JOURNAL_SOURCES,
      /^src\/ui\/svelte\/stores\/journalStore/,
      // The projection that decides what each viewer is told.
      /^src\/ui\/presenters\/RunJournalBuilder\.js$/,
    ],
  };
  return [
    playerCase({
      ...shared,
      id: 'fabricate-journal-blind-run',
      label: 'Player app — Journal, in-flight blind gathering run (player view)',
      query: { tab: 'journal' },
      expectSelector: `${card}:not(:has([data-run-secret-preview]))`,
    }),
    playerCase({
      ...shared,
      id: 'fabricate-journal-blind-run-gm',
      label: 'Player app — Journal, in-flight blind gathering run (GM secret preview)',
      // The player app rendered for a GM.
      query: { tab: 'journal', viewer: 'gm' },
      expectSelector: `${card} [data-run-secret-preview]`,
    }),
  ];
}
