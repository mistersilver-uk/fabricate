/**
 * The Journal's award face (issue 1773): a finished craft that owes the player a pick of up to two
 * rewards, one already known and so disabled with its reason, at both widths, at the ceiling, under
 * a darker palette, on the Active list, and once settled.
 */

import { JOURNAL_SOURCES } from './caseConstants.js';
import { playerCase } from './caseFactories.js';

const OWED = Object.freeze({
  tab: 'journal',
  journalCaseState: 'award-choice',
  resultRowState: 'reward-craft',
});
const FACE = '[data-journal-detail] [data-award-face]';
const TILE = (id) => `[data-award-alternative="${id}"] button`;
const PICK = (id) => ({ selector: TILE(id) });

const AWARD_SOURCES = Object.freeze([
  JOURNAL_SOURCES,
  /^src\/ui\/svelte\/apps\/journal\/(?:RunAwardChoice\.svelte|runStateNotice\.js)$/,
  /^src\/ui\/svelte\/components\/RequirementChooser\.svelte$/,
  /^src\/ui\/presenters\/(?:awardChoiceRows|runAwardChoiceProjection)\.js$/,
  /^src\/systems\/(?:awardChoiceSettle|journalRunAwardChoice)\.js$/,
]);

/** The face as it opens: a disabled known recipe stating why, and a confirm waiting on a pick. */
const OPEN_FACE =
  FACE +
  `:has(${TILE('known')}:disabled):has([data-requirement-reason="known"])` +
  `:has(${TILE('ingot')}:not(:disabled)):has([data-award-confirm]:disabled)`;

const owedCase = (entry) =>
  playerCase({
    smokeLabels: [],
    reaches: 'beyond',
    query: OWED,
    position: { width: 1240, height: 880 },
    steps: [],
    expectTab: 'journal',
    kinds: ['player', 'journal'],
    sourceMatches: AWARD_SOURCES,
    ...entry,
  });

export function journalAwardChoiceCases() {
  return [
    owedCase({
      id: 'player-journal-award-choice',
      label: 'Player Journal — a finished craft owing a pick of up to two rewards',
      expectSelector: `${OPEN_FACE}:has([data-journal-award-pending="true"])`,
      expectCenterHit: TILE('ingot'),
    }),
    owedCase({
      id: 'player-journal-award-choice-ceiling',
      label: 'Player Journal — the award face with two rewards picked, its ceiling stated',
      steps: [PICK('ingot'), PICK('bounty')],
      expectSelector:
        FACE +
        `:has(${TILE('lore')}:disabled):has(${TILE('bounty')}[aria-pressed="true"])` +
        ':has([data-award-status]:not(:empty)):has([data-award-confirm]:not(:disabled))',
      // A disabled tile still owns its own centre: no overlay sits over the refused pick.
      expectCenterHit: TILE('lore'),
    }),
    owedCase({
      id: 'player-journal-award-choice-narrow',
      label: 'Player Journal — the award face at the narrow Journal width',
      position: { width: 1024, height: 760 },
      expectSelector: OPEN_FACE,
      kinds: ['player', 'journal', 'responsive'],
    }),
    owedCase({
      id: 'player-journal-award-choice-dark',
      label: 'Player Journal — the award face under the darkest palette',
      theme: 'foundry-native',
      steps: [PICK('ingot')],
      expectSelector: `${FACE}:has(${TILE('ingot')}[aria-pressed="true"])`,
    }),
    owedCase({
      id: 'player-journal-list-award-pending',
      label: 'Player Journal — a finished run owing a reward, listed under Active',
      expectSelector:
        '[data-journal-list="active"] [data-run-id="lab-v1-award-choice"]' +
        ' [data-run-attention="reward"]',
    }),
    owedCase({
      id: 'player-journal-award-choice-history',
      label: 'Player Journal — the craft once its reward was claimed',
      query: { ...OWED, journalCaseState: 'award-choice-history' },
      steps: [{ selector: '[data-history-run-id="lab-v1-award-choice-history"]' }],
      expectSelector:
        '[data-journal-detail]:has([data-journal-history-detail])' +
        ':has([data-history-items="produced"] [title="Iron Ingot"]):has([data-journal-fact] i.fa-coins)' +
        ':not(:has([data-award-face]))',
    }),
  ];
}
