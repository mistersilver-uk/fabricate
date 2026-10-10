/**
 * The Journal's history frames, generated per persisted state at both Journal widths.
 */

import { JOURNAL_SOURCES } from './caseConstants.js';
import { playerCase } from './caseFactories.js';

/** Additive TP10 witnesses, with identical local and CI navigation over persisted fixtures. */
export function journalHistoryBatchCases() {
  const search = '[data-journal-search] input';
  const page = (list, direction) => `[data-journal-list="${list}"] [data-pagination-${direction}]`;
  const lastPages = ['active', 'finished'].flatMap((list) =>
    [1, 2].map(() => ({ selector: page(list, 'next') }))
  );
  const states = ['full', 'partial', 'empty', 'restored', 'tools'];
  return [1240, 1024].flatMap((width) =>
    states.map((state) => {
      const fixture = state === 'tools' ? 'history-compact-tools' : 'history-compact-grid';
      const steps = [{ selector: `[data-history-run-id="lab-v1-${fixture}"]` }];
      if (['partial', 'restored'].includes(state)) steps.push(...lastPages);
      if (['empty', 'restored'].includes(state))
        steps.push({ selector: search, fill: 'no batch matches' });
      if (state === 'restored') steps.push({ selector: search, fill: '' });
      const empty = state === 'empty';
      const count = state === 'partial' ? 3 : 4;
      const populated = ['journal-run-list', 'journal-history-list']
        .map((list) => `:has(.${list} > [role="listitem"]:nth-child(${count}):last-child)`)
        .join('');
      return playerCase({
        id: `fabricate-journal-history-batch-${state}-${width}`,
        label: `Player Journal — compact history ${state} at ${width}px`,
        smokeLabels: [],
        reaches: 'beyond',
        query: { tab: 'journal', journalCaseState: fixture },
        position: { width, height: 880 },
        steps,
        expectTab: 'journal',
        expectSelector:
          '.journal-view-grid' +
          (empty
            ? ':has([data-journal-empty="active"].is-fill):has([data-journal-empty="history"].is-fill)'
            : populated) +
          ':has([data-history-items="tools"] [data-list-row]:nth-child(5))',
        ...(!empty && { expectCenterHit: '[data-journal-list="finished"] [data-journal-dismiss]' }),
        kinds: ['player', 'journal', ...(width === 1024 ? ['responsive'] : [])],
        sourceMatches: [JOURNAL_SOURCES, /^src\/ui\/svelte\/apps\/FabricateAppRoot\.svelte$/],
      });
    })
  );
}

/** TP14 history-data witnesses. */
const JOURNAL_HISTORY_DATA_EVIDENCE = Object.freeze({
  // Two independent recorded rolls and no global cut: the approved row-only legacy exception.
  'legacy-row-rolls':
    ':has([data-yield-entry="legacy-iron-ore-roll-12"].is-cleared)' +
    ':has([data-yield-entry="legacy-copper-ore-roll-94"].is-cleared)' +
    ':not(:has([data-yield-cut]))' +
    ':not(:has([data-yield-shared-roll]))' +
    ':not(:has([data-history-unattributed]))',
  // The negative control: an explicit root roll keeps its single cut, above the row it missed.
  'shared-roll-control':
    ':has([data-yield-cut])' +
    ':has([data-yield-entry="shared-iron-ore:0"].is-cleared)' +
    ':has([data-yield-entry="shared-coal:1"].is-cleared)' +
    ':has([data-yield-entry="shared-ruby:2"].is-missed)',
  // Two recovered identities, the captured name winning, and a third row that stays unknown and draws the fallback.
  'recovered-materials':
    ':has([data-history-items="consumed"] [title="Steel Billet"])' +
    ':has([data-history-items="consumed"] [title="Coal"])' +
    ':has([data-history-items="consumed"] i.fa-box)' +
    ':has([data-history-items="produced"] [title="Steel Ingot"])',
  // A recorded roll that cannot cut, and a haul whose quantity is real while its row is not known.
  'unknown-material-resolution':
    ':has([data-yield-shared-roll])' +
    ':has([data-yield-entry="unknown-silver-ore"].is-cleared)' +
    ':has([data-yield-entry="unknown-ruby"])' +
    ':has([data-history-unattributed] + [data-history-items="produced"])' +
    ':not(:has([data-yield-cut]))' +
    ':not(:has([data-yield-entry="unknown-ruby"].is-cleared))' +
    ':not(:has([data-yield-entry="unknown-ruby"].is-missed))',
  // A confirmed complete-empty award: the applied empty receipt is what separates this from a missing record.
  'settled-zero':
    ':has([data-journal-verdict="failed"])' +
    ':has([data-yield-cut])' +
    ':has([data-yield-entry="barren-iron-ore"].is-missed)' +
    ':not(:has([data-yield-entry].is-cleared))' +
    ':not(:has([data-history-items="produced"]))',
  // The confirmed prefix and its uncertain remainder, both ahead of the closed-run guidance.
  'uncertain-awards':
    ':has([data-journal-recovery="true"])' +
    ':has([data-journal-effect="0"][data-effect-phase="applied"] [data-list-row])' +
    ':has([data-journal-effect="1"][data-effect-phase="applying"] [data-list-row])' +
    ':has([data-journal-effect="2"][data-effect-phase="planned"])' +
    ':has([data-journal-recovery-evidence] ~ [data-journal-history-detail] [data-journal-guidance])' +
    ':not(:has([data-history-items]))',
  // Native fizzle: the permitted consumption with its captured names, and the resolution that actually applied.
  fizzle:
    ':has([data-journal-verdict="failed"])' +
    ':has([data-history-summary="none"])' +
    ':has([data-history-items="consumed"] [title="Quicksilver"])' +
    ':has([data-history-items="consumed"] [title="Yellow Sulphur"])' +
    ':has([data-history-items="consumed"] img.fab-medallion-img)' +
    ':not(:has([data-history-items="produced"]))',
  // Native salvage: two receipts from one source row, and a consumption that does not apply rather than one unknown.
  salvage:
    ':has([data-journal-verdict="failed"])' +
    ':has([data-history-items="produced"] [data-list-row] ~ [data-list-row])' +
    ':has([data-history-items="produced"] + [data-journal-fact])' +
    ':not(:has([data-history-items="consumed"]))' +
    ':not(:has([data-history-summary]))',
});

/**
 * Issue 2257 D15: a shared-model row after its roll, on the one history witness the scale's capture
 * publishes — the borderless 26px mark, and the mark, body, quantity and chance on one flex line.
 */
const JOURNAL_HISTORY_DATA_LAYOUT = Object.freeze({
  'unknown-material-resolution-1240': {
    containerSelector: '[data-journal-detail] [data-yield-scale]',
    oneLineRows: '[data-journal-detail] [data-yield-entry] > .fabricate-list-row',
    controls: [
      {
        selector: '[data-journal-detail] [data-yield-entry="unknown-silver-ore"] .fab-medallion',
        styles: 'width: 26px; border-width: 0',
      },
    ],
  },
});

/** Issue 1773: a craft's credit and grants read as result rows, labelled, rolled and reasoned. */
const REWARD_AWARDS_CASE = playerCase({
  id: 'player-journal-reward-awards',
  label: 'Player Journal — a craft that credited currency and taught recipes',
  smokeLabels: [],
  reaches: 'beyond',
  query: { tab: 'journal', journalCaseState: 'history-data-reward-awards' },
  position: { width: 1240, height: 880 },
  steps: [{ selector: '[data-history-run-id="lab-v1-history-data-reward-awards"]' }],
  expectTab: 'journal',
  expectSelector:
    '[data-journal-detail]' +
    ':has([data-history-items="produced"] [title="Iron Ingot"])' +
    ':has([data-journal-fact] i.fa-coins)' +
    ':has([data-journal-fact] i.fa-book-open + * + *)',
  kinds: ['player', 'journal'],
  sourceMatches: [JOURNAL_SOURCES, /^src\/systems\/(?:runHistoryEvidence|resultKindAward)\.js$/],
});

/** Issue 1773: a multi-stage run's rewards read as its final stage card's facts, each glyph drawn. */
const REWARD_AWARDS_MULTI_CASE = playerCase({
  id: 'player-journal-reward-awards-multi',
  label: 'Player Journal — a multi-stage craft whose last stage credited and taught',
  smokeLabels: [],
  reaches: 'beyond',
  query: { tab: 'journal', journalCaseState: 'history-data-reward-awards-multi' },
  position: { width: 1240, height: 880 },
  steps: [{ selector: '[data-history-run-id="lab-v1-history-data-reward-awards-multi"]' }],
  expectTab: 'journal',
  expectSelector:
    '[data-history-stages] [data-stage-card="2"]' +
    ':has([data-stage-fact] i.fa-coins):has([data-stage-fact] i.fa-book-open)',
  kinds: ['player', 'journal'],
  sourceMatches: [JOURNAL_SOURCES, /^src\/ui\/presenters\/resultKindGlyphs\.js$/],
});

/** Issue 1773: a credit the run just paid is evidence in the run-completed banner. */
const REWARD_JUST_RESOLVED_CASE = playerCase({
  id: 'player-journal-reward-just-resolved',
  label: 'Player Journal — a just-finished craft that paid a credit, in its completed banner',
  smokeLabels: [],
  reaches: 'beyond',
  query: { tab: 'journal', journalCaseState: 'history-just-resolved-rewards' },
  position: { width: 1240, height: 880 },
  steps: [
    { selector: '[data-journal-search] input', fill: 'Wax a Hemp Cord' },
    { selector: '[data-run-id="lab-v1-history-just-resolved-rewards"]' },
    { selector: '[data-journal-search] input', fill: '' },
    { selector: '[data-run-action="primary"]' },
  ],
  expectTab: 'journal',
  expectSelector:
    '[data-journal-verdict="succeeded"] .fab-notice-evidence' +
    ':has([data-history-items="transient-produced"]):has([data-journal-fact] i.fa-coins)',
  kinds: ['player', 'journal'],
  sourceMatches: [JOURNAL_SOURCES, /^src\/systems\/resultKindAward\.js$/],
});

/** Sixteen full-window history-data witnesses (eight persisted states at both Journal widths),
 *  then the three reward-award witnesses. */
export function journalHistoryDataCases() {
  const states = [1240, 1024].flatMap((width) =>
    Object.entries(JOURNAL_HISTORY_DATA_EVIDENCE).map(([state, evidence]) =>
      playerCase({
        id: `fabricate-journal-history-data-${state}-${width}`,
        label: `Player Journal — ${state.replaceAll('-', ' ')} history at ${width}px`,
        smokeLabels: [],
        reaches: 'beyond',
        query: {
          tab: 'journal',
          journalCaseState: `history-data-${state}`,
          // Alchemy attempt history is GM evidence; a player is not entitled to the record at all.
          ...(state === 'fizzle' && { viewer: 'gm' }),
        },
        position: { width, height: 880 },
        steps: [{ selector: `[data-history-run-id="lab-v1-history-data-${state}"]` }],
        expectTab: 'journal',
        expectSelector: `[data-journal-detail]${evidence}`,
        ...(JOURNAL_HISTORY_DATA_LAYOUT[`${state}-${width}`] && {
          expectLayout: JOURNAL_HISTORY_DATA_LAYOUT[`${state}-${width}`],
        }),
        kinds: ['player', 'journal', ...(width === 1024 ? ['responsive'] : [])],
        // `YieldScale` is a broad signal routed by `BROAD_SIGNAL_CASE_OVERRIDES`, which is where it is named.
        sourceMatches: [
          JOURNAL_SOURCES,
          /^src\/ui\/presenters\/RunJournalBuilder\.js$/,
          /^src\/systems\/(?:gatheringHistoryEvidence|historyItemEvidence|runHistoryEvidence)\.js$/,
        ],
      })
    )
  );
  return [...states, REWARD_AWARDS_CASE, REWARD_AWARDS_MULTI_CASE, REWARD_JUST_RESOLVED_CASE];
}
