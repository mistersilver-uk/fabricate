/**
 * The Journal's lifecycle frames, generated one per run state and per control the state offers.
 */

import { JOURNAL_SOURCES } from './caseConstants.js';
import { playerCase } from './caseFactories.js';

/** Journal lifecycle fixtures use persisted records; steps operate the real controls. */
export function journalLifecycleCases() {
  const states = [
    'ready-single',
    'legacy-armed',
    'waiting-auto-eligible',
    'waiting-open-choice',
    'stage-not-started',
    'awaiting-choice',
    'stage-consumed',
    'stage-paid',
    'material-shortage',
    'ingredient-route',
    'check-route',
    'essence-shared',
    'paused',
    'cancel-confirmation',
    'past-stage',
    'future-stage',
    'gathering-straight',
    'gathering-d100',
    'gathering-check',
    'gathering-straight-finished',
    'gathering-d100-finished',
    'gathering-check-finished',
    'finished-success',
    'finished-failure',
    'finished-cancelled',
    'active-page-two',
    'finished-page-two',
    'filter-paused',
    'empty-search',
    'automatic-completion',
    'automatic-blocker',
    'dismissal',
    'redacted-owner',
    'alchemy',
    'salvage',
    'legacy',
    'loading',
    'error-retry',
    'no-actor-empty',
    'stale-action',
    'command-timeout',
    'authority-unavailable',
    'roll-cancelled',
    'unsupported-version',
    'recovery-required',
    'claim-retained',
    'wide',
    'narrow',
    'history-checked-choice',
    'history-resolution-ingredients',
    'history-resolution-simple',
    'history-checked-ingredients',
    'history-legacy-no-check-failure',
    'history-multi-essence',
    'history-multi-shared-essence',
    'history-multi-success',
    'history-multi-failure',
    'history-cancelled-before',
    'history-cancelled-multi',
    'history-d100-all-hit',
    'history-d100-all-miss',
    'history-gathering-check-failure',
    'history-just-resolved',
    'history-redacted',
    'history-missing-material',
    'history-gm-deleted-recipe',
    'history-failure-awards',
    'current-choice-closed',
    'essence-overshoot',
    'past-routed-stage',
    'future-routed-stage',
    'kind-menu-open',
    'history-settling',
  ];
  const selectRivets = [
    { selector: '[data-journal-search] input', fill: 'Forge Iron Rivets' },
    { selector: '[data-run-id="lab-v1-active-4"]' },
    { selector: '[data-journal-search] input', fill: '' },
  ];
  const selectionNames = Object.fromEntries(
    [
      [
        'Forge Iron Rivets',
        [
          'waiting-open-choice',
          'stage-not-started',
          'stage-consumed',
          'current-choice-closed',
          'paused',
          'cancel-confirmation',
          'past-stage',
          'future-stage',
          'empty-search',
          'wide',
          'narrow',
          'kind-menu-open',
          'finished-cancelled',
        ],
      ],
      [
        'Wax a Hemp Cord',
        ['ready-single', 'legacy-armed', 'history-just-resolved', 'history-cancelled-before'],
      ],
      ['File a Guild Permit', ['stage-paid']],
      ['Bind a Shield Boss', ['ingredient-route', 'material-shortage']],
      ['Whet a Keen Edge', ['check-route']],
      ['Inscribe a Prismatic Sigil', ['essence-shared', 'essence-overshoot']],
      ['Steep a Bitter Poultice', ['waiting-auto-eligible', 'automatic-blocker']],
      [
        'Assemble a Warded Buckler',
        ['awaiting-choice', 'past-routed-stage', 'future-routed-stage', 'history-cancelled-multi'],
      ],
      ['Gather Meadow Herbs', ['gathering-straight']],
      ['Quarry Rough Stone', ['gathering-d100', 'history-d100-all-hit', 'history-d100-all-miss']],
      ['Track a Balehound', ['gathering-check', 'history-gathering-check-failure']],
    ].flatMap(([name, suffixes]) => suffixes.map((suffix) => [suffix, name]))
  );
  const selectedIds = {
    'past-stage': 'lab-v1-stage-browser',
    'future-stage': 'lab-v1-stage-browser',
    'empty-search': 'lab-v1-ready-single',
    narrow: 'lab-v1-wide',
  };
  const selectCaseRun = (state) => {
    const fixtureState = state.replace(/-finished$/, '');
    const name = selectionNames[fixtureState];
    if (!name) return [];
    const id = selectedIds[fixtureState] ?? `lab-v1-${fixtureState}`;
    return [
      { selector: '[data-journal-search] input', fill: name },
      { selector: `[data-run-id="${id}"]` },
      { selector: '[data-journal-search] input', fill: '' },
    ];
  };
  const steps = {
    // A paused run holds the choices it already made (D-028), so its rail is inert: the walk
    // pauses the run and stops there rather than reaching for a tile it can no longer open.
    paused: [{ selector: '[data-run-action="pause"]' }],
    'waiting-open-choice': [{ selector: '[data-slot-row] button.fab-slot-tile' }],
    // Started and matured, which is what an enabled roll requires — and therefore locked, so
    // there is no open tile or choice option left to walk (issue 1648, D-028).
    'check-route': [],
    'material-shortage': [
      { selector: '[data-journal-route] input[value="boss-stage-1-verdant"]' },
      { selector: '[data-journal-route] input[value="boss-stage-1-sunward"]' },
    ],
    // Issue 1648, M15: the primary is refused while the essence pick is unmade, so there is
    // no further control left to walk into a command refusal — the frame is the blocked
    // state itself, reached by `selectCaseRun` alone.
    'automatic-blocker': [],
    'cancel-confirmation': [{ selector: '[data-run-action="cancel-arm"]' }],
    'past-stage': [{ selector: '[data-stage-nav-index="0"]' }],
    'future-stage': [{ selector: '[data-stage-nav-index="2"]' }],
    'finished-cancelled': [
      { selector: '[data-run-action="cancel-arm"]' },
      { selector: '[data-run-action="cancel-confirm"]' },
      { selector: '[data-history-run-id="lab-v1-finished-cancelled"]' },
    ],
    'active-page-two': [
      ...selectRivets,
      { selector: '[data-journal-list="active"] [data-pagination-next]' },
    ],
    'finished-page-two': [
      ...selectRivets,
      { selector: '[data-journal-list="finished"] [data-pagination-next]' },
    ],
    ...Object.fromEntries(
      ['straight', 'd100', 'check'].map((mode) => [
        `gathering-${mode}-finished`,
        [
          { selector: '[data-run-action="primary"]' },
          { selector: `[data-history-run-id="lab-v1-gathering-${mode}"]` },
        ],
      ])
    ),
    'filter-paused': [
      ...selectRivets,
      { selector: '[data-journal-status-filter] label:has(input[value="paused"])' },
    ],
    'empty-search': [{ selector: '[data-journal-search] input', fill: 'No matching Journal run' }],
    dismissal: [{ selector: '[data-journal-dismiss]' }],
    'stale-action': [{ selector: '[data-run-action="primary"]' }],
    'command-timeout': [{ selector: '[data-run-action="primary"]' }],
    'roll-cancelled': [{ selector: '[data-run-action="primary"]' }],
    alchemy: [
      { selector: '[data-journal-kind-filter]' },
      { selector: '[data-popover-option="alchemy"]' },
    ],
    salvage: [
      { selector: '[data-journal-kind-filter]' },
      { selector: '[data-popover-option="salvage"]' },
    ],
    'past-routed-stage': [{ selector: '[data-stage-nav-index="0"]' }],
    'future-routed-stage': [{ selector: '[data-stage-nav-index="3"]' }],
    'kind-menu-open': [{ selector: '[data-journal-kind-filter]' }],
    'essence-overshoot': [
      { selector: '[data-essence-source$=".Item.jp-duskglass"] [data-stepper-increment]' },
      { selector: '[data-essence-source$=".Item.jp-duskglass"] [data-stepper-increment]' },
      { selector: '[data-essence-source$=".Item.jp-sunmote"] [data-stepper-increment]' },
    ],
    ...Object.fromEntries(
      ['history-cancelled-before', 'history-cancelled-multi'].map((state) => [
        state,
        [
          { selector: '[data-run-action="cancel-arm"]' },
          { selector: '[data-run-action="cancel-confirm"]' },
          { selector: `[data-history-run-id="lab-v1-${state}"]` },
        ],
      ])
    ),
    ...Object.fromEntries(
      ['history-d100-all-hit', 'history-d100-all-miss', 'history-gathering-check-failure'].map(
        (state) => [
          state,
          [
            { selector: '[data-run-action="primary"]' },
            { selector: `[data-history-run-id="lab-v1-${state}"]` },
          ],
        ]
      )
    ),
    'history-just-resolved': [{ selector: '[data-run-action="primary"]' }],
  };
  const detail = '[data-journal-detail]';
  const primary = '[data-run-action="primary"]';
  const enabledPrimary = `${primary}:not(:disabled):not([aria-busy="true"])`;
  const has = (...selectors) => selectors.map((selector) => `:has(${selector})`).join('');
  const lacks = (...selectors) => selectors.map((selector) => `:not(:has(${selector}))`).join('');
  const terminal = (status, ...evidence) =>
    detail +
    has(
      '[data-journal-history-detail]',
      '[data-journal-this-run] + [data-journal-guidance]',
      ...(status === 'failed' ? ['[data-journal-verdict="failed"]'] : []),
      ...evidence
    ) +
    lacks(
      '[data-run-action-bar]',
      '[data-stage-nav]',
      '[data-run-progress]',
      '[data-journal-summary]',
      '[data-journal-time-remaining]',
      '[data-journal-record]',
      '.manager-callout-title',
      ...(status === 'failed' ? [] : ['[data-journal-verdict]'])
    );
  const commandError = (runId) =>
    '.journal-view-container' +
    has(
      `${detail}[data-run-key*="${runId}"]`,
      '[data-journal-command-error] [data-notice-action]',
      `${detail} ${enabledPrimary}`
    ) +
    lacks('[data-run-action-bar][aria-busy="true"]', '[data-journal-verdict]');
  const paged = (kind, row, otherRow) =>
    '.journal-view-container' +
    has(
      row,
      otherRow,
      `[data-journal-list="${kind}"] [data-pagination-prev]:not(:disabled)`,
      `[data-journal-list="${kind}"] [data-pagination-next]:not(:disabled)`,
      `${detail}[data-run-key*="lab-v1-active-4"]`
    );
  const roomy =
    detail + has('[data-stage-card="1"][data-stage-state="current"]', '[data-stage-nav-index="2"]');
  const expected = {
    'ready-single':
      '.journal-view-container' +
      has('[data-run-status="ready"]', `${detail} ${enabledPrimary}`) +
      lacks('[data-stage-nav]'),
    // The pre-D-026 run the shipped release armed.
    'legacy-armed':
      '.journal-view-container' +
      has('[data-run-status="ready"]', `${detail} ${enabledPrimary}`) +
      lacks('[data-run-action="begin"]', '[data-journal-action-blocker]'),
    'waiting-auto-eligible':
      detail +
      has(
        '[data-run-completion-switch] input[value="worldTime"]:checked',
        '[data-journal-summary-card="time"]',
        `${primary}:disabled`
      ),
    // An open requirement rail belongs to a stage that has NOT begun (D-028), and an unbegun
    // stage offers the begin decision in place of the resolve action — refused, because the
    // option pick this case exists to show is exactly what it is still waiting for.
    'waiting-open-choice':
      detail +
      has(
        '[data-choice-options] [data-choice-id]:not(:disabled)',
        '[data-slot-row] button[aria-pressed="true"]',
        '[data-run-action="begin"]:disabled'
      ) +
      lacks(primary),
    // The stage the player has not begun: its own control, stating what beginning commits,
    // and NO roll offered at all until it has started (issue 1648, M13/M15).
    'stage-not-started':
      detail + has('[data-run-action="begin"]:not(:disabled)', '[data-run-begin]') + lacks(primary),
    // Issue 1648, M10.
    'awaiting-choice':
      '.journal-view-container' +
      has(
        '[data-run-id="lab-v1-awaiting-choice"] [data-run-attention="choice"]',
        `${detail} .journal-detail-meta [data-run-attention="choice"]`,
        '[data-journal-awaiting-choice="true"][data-notice-tone="info"]',
        '[data-journal-route] input:not(:disabled)'
      ) +
      lacks('[data-journal-action-blocker]', '[data-run-attention="materials"]'),
    // The same stage once it started: it shows the RECEIPT of what it consumed rather than
    // the requirement rail, which probes an inventory the stage already emptied (M21), and
    // nothing about the choice is editable any more.
    'stage-consumed':
      detail +
      has('[data-journal-stage-details]', '[data-journal-stage-consumed] [data-list-row]') +
      lacks(
        '[data-journal-stage-details][data-editable="true"]',
        '[data-run-action="begin"]',
        '[data-slot-row]'
      ),
    // A currency-only ingredient set is valid and authorable (D-031), so a started stage whose
    // whole requirement was a price is a reachable state.
    'stage-paid':
      detail +
      has('[data-journal-stage-consumed] [data-journal-fact]') +
      lacks(
        // The item-row GRID, as one compound selector: a DESCENDANT inside a negated `:has()`
        // is evaluated unfaithfully by happy-dom, so the mounted walk would pass it open.
        '.journal-stage-consumed-items',
        '[data-essence-history]',
        '[data-slot-row]',
        '[data-run-action="begin"]'
      ),
    // A stage short of its materials has NOT begun — starting is what spends them (D-026) —
    // so the control it offers is the begin decision, refused and reasoned (issue 1648).
    'material-shortage':
      detail +
      has(
        '[data-slot-id="boss-stage-1-sunward-g3"]',
        '[data-run-action="begin"]:disabled',
        '[data-journal-action-blocker="selectionRequired"]'
      ) +
      lacks(primary),
    'ingredient-route':
      detail +
      has(
        '[data-journal-route] input:not(:disabled)',
        '[data-slot-id="boss-stage-1-verdant-g1"]',
        '[data-journal-stage-details][data-editable="true"]'
      ) +
      lacks('[data-slot-id="boss-stage-1-sunward-g1"]'),
    'check-route': detail + has('[data-outcome-ladder] [data-outcome-tier]', enabledPrimary),
    'essence-shared':
      detail +
      has(
        '[data-essence-threshold="radiant"]',
        '[data-essence-threshold="shadow"]',
        '[data-essence-source] button:not(:disabled)'
      ),
    paused:
      detail +
      has(
        '[data-journal-paused]',
        '[data-run-action="resume"]:not(:disabled)',
        '[data-stage-state="paused"]'
      ) +
      lacks('[data-journal-time-remaining]'),
    'cancel-confirmation':
      detail +
      has(
        '[data-run-cancel-decision] [data-run-action="cancel-confirm"]',
        '[data-run-action="cancel-keep"]'
      ) +
      lacks(primary, '[data-run-action="pause"]', '[data-run-completion]'),
    'past-stage':
      detail +
      has(
        '[data-stage-card="0"][data-stage-state="past"]',
        '[data-stage-nav-return]',
        '[data-stage-io="consumed"]',
        '[data-stage-io="produced"]'
      ) +
      lacks(
        '[data-journal-stage-details][data-editable="true"]',
        '[data-journal-summary]',
        '[data-journal-time-remaining]'
      ),
    'future-stage':
      detail +
      has(
        '[data-stage-card="2"][data-stage-state="future"]',
        '[data-stage-nav-return]',
        '[data-stage-io="consumed"]',
        '[data-stage-state="future"] [data-journal-crafting-yield]'
      ) +
      lacks(
        '[data-journal-stage-details][data-editable="true"]',
        '[data-journal-summary]',
        '[data-journal-time-remaining]'
      ),
    'gathering-straight':
      detail +
      has('[data-yield-entry="jp-meadow_herb-drop"]', enabledPrimary) +
      lacks('[data-yield-cut]', '[data-outcome-ladder]'),
    'gathering-d100':
      detail +
      has('[data-yield-scale] [data-yield-entry]', enabledPrimary) +
      lacks('[data-yield-cut]', '[data-outcome-ladder]'),
    'gathering-check':
      detail +
      has('[data-outcome-tier="rich"]', '.fab-outcome-tier .fa-circle-xmark', enabledPrimary) +
      lacks('[data-yield-cut]'),
    'gathering-straight-finished':
      terminal('succeeded', '[data-history-summary="none"] ~ [data-history-items="produced"]') +
      lacks('[data-yield-cut]'),
    'gathering-d100-finished':
      terminal('succeeded', '[data-yield-cut]', '[data-yield-entry="jp-rough_stone-drop"]') +
      lacks('[data-history-items="produced"]', '[data-history-summary]'),
    'gathering-check-finished':
      terminal(
        'succeeded',
        '[data-history-summary="check"] ~ [data-history-items="produced"] ~ [data-history-outcome-log]'
      ) + lacks('[data-outcome-ladder]'),
    'finished-success': terminal(
      'succeeded',
      '[data-history-summary="check"] ~ [data-history-items="produced"]'
    ),
    'finished-failure':
      terminal('failed', '[data-history-verdict-check]') +
      lacks('[data-history-summary]', '[data-history-items="produced"]'),
    'finished-cancelled': terminal(
      'cancelled',
      '[data-history-items="consumed"] ~ [data-history-items="produced"]'
    ),
    'active-page-two': paged(
      'active',
      '[data-run-id="lab-v1-active-7"]',
      '[data-history-run-id="lab-v1-finished-1"]'
    ),
    'finished-page-two': paged(
      'finished',
      '[data-history-run-id="lab-v1-finished-5"]',
      '[data-run-id="lab-v1-active-1"]'
    ),
    'filter-paused':
      '.journal-view-container' +
      has(
        '[data-journal-status-filter] input[value="paused"]:checked',
        `${detail}[data-run-key*="lab-v1-active-4"]`,
        '[data-run-id="lab-v1-filter-paused"][data-run-status="paused"]'
      ) +
      lacks('[data-run-status="ready"]'),
    'empty-search':
      '.journal-view-container' +
      has('[data-journal-empty="active"]', '[data-journal-empty="history"]', detail) +
      lacks('[data-run-id]', '[data-history-run-id]'),
    'automatic-completion': terminal(
      'succeeded',
      '[data-history-stages] [data-stage-io="produced"]'
    ),
    // Issue 1648, M15: the same unmade-choice shape as `awaiting-choice`, on a run armed before the
    // D-028 lock existed (started, but never locked, so its essence pick is still live-resolved and
    // still open).
    'automatic-blocker':
      detail +
      has(
        '[data-run-action="begin"]:disabled',
        '[data-essence-threshold="clarity"] [aria-valuenow="0"]',
        '[data-journal-awaiting-choice="true"][data-notice-tone="info"]'
      ) +
      lacks(primary, '[data-journal-command-error]', '[data-journal-action-blocker]'),
    dismissal:
      '.journal-view-container' +
      has('[data-history-run-id]', detail) +
      lacks('[data-history-run-id="lab-v1-dismissal"]'),
    'redacted-owner':
      '.journal-view-container' +
      has(
        '[data-run-id="lab-gathering-blind-waiting"]',
        `${detail} [data-run-action="cancel-arm"]:not(:disabled)`
      ) +
      lacks('[data-journal-stages]', '[data-yield-entry]', '[data-run-secret-preview]'),
    // Its stage has STARTED, so its materials surface is the consumption receipt rather than
    // the held/needed rail the slot id named (M21).
    alchemy:
      detail +
      has(
        '[data-run-action="primary"]:not(:disabled)',
        '[data-journal-stage-consumed] [data-list-row]',
        '.journal-detail-identity img[src$="bottle-bulb-corked-glowing-red.webp"]'
      ) +
      lacks('[data-journal-verdict]', '[data-slot-row]'),
    salvage: terminal('succeeded', '[data-history-items="produced"]'),
    legacy:
      '.journal-view-container' +
      has(
        '[data-run-id="lab-run-inprogress-single"][data-run-status="inProgress"]',
        `${detail} ${enabledPrimary}`,
        '[data-run-action="pause"]:disabled'
      ) +
      lacks('[data-run-completion]'),
    loading: '[data-journal-state="loading"][aria-busy="true"] .fa-spinner',
    'error-retry': '[data-journal-state="error"] [data-notice-tone="danger"] [data-notice-action]',
    'no-actor-empty':
      '[data-journal-state="empty"]:not([aria-busy="true"])' + lacks('[data-run-action-bar]'),
    'stale-action': commandError('lab-v1-stale-action'),
    'command-timeout': commandError('lab-v1-command-timeout'),
    'authority-unavailable':
      detail +
      has(`${primary}:disabled[title]:not([title=""])`, '[data-run-action="cancel-arm"]:disabled') +
      lacks('[data-journal-verdict]'),
    'roll-cancelled':
      '.journal-view-container' +
      has(
        '[data-run-id="lab-v1-roll-cancelled"][data-run-status="ready"]',
        `${detail} ${enabledPrimary}`
      ) +
      lacks(
        '[data-journal-command-error]',
        '[data-journal-verdict]',
        '[data-run-action-bar][aria-busy="true"]'
      ),
    'unsupported-version':
      detail +
      has(
        '[data-notice-tone="warning"]',
        `${primary}:disabled`,
        '[data-run-action="cancel-arm"]:disabled'
      ) +
      lacks('[data-run-completion]'),
    'recovery-required':
      detail +
      has(
        '[data-journal-recovery][role="alert"] .fab-notice-detail:not(:empty)',
        `${primary}:disabled`,
        '[data-run-action="cancel-arm"]:disabled'
      ),
    // One notice for one run state, carrying the GM's way out of it (issue 1648).
    'claim-retained':
      detail +
      has(
        '[data-journal-action-blocker="recovery-required"][data-journal-paused="true"]' +
          ' [data-notice-action]',
        '[data-run-action="resume"]:disabled'
      ) +
      lacks('[data-journal-recovery]', '[data-journal-paused]:not([data-journal-action-blocker])'),
    wide: roomy,
    narrow: roomy,
    // A choice slot exists only before the stage starts now (M21), so this state's stage is
    // unbegun.
    'current-choice-closed':
      detail +
      has('[data-stage-state="current"] [data-slot-row] button.fab-slot-tile') +
      lacks('[data-choice-options]', '[data-journal-stage-consumed]'),
    'essence-overshoot':
      detail + has('[data-essence-overshoot]', '[data-essence-source$=".Item.jp-duskglass"]'),
    'past-routed-stage':
      detail +
      has(
        '[data-stage-card="0"][data-stage-state="past"] [data-stage-io="consumed"]',
        '[data-stage-fact="route"]'
      ) +
      lacks('[data-journal-summary]', '[data-journal-time-remaining]'),
    'future-routed-stage':
      detail +
      has(
        '[data-stage-card="3"][data-stage-state="future"] [data-journal-crafting-yield]',
        '[data-stage-nav-return]'
      ) +
      lacks('[data-journal-summary]', '[data-journal-time-remaining]'),
    'kind-menu-open': '[role="listbox"] [data-popover-option="gathering"]',
    'history-checked-choice': terminal(
      'succeeded',
      '[data-history-summary="check"] ~ [data-history-items="consumed"] ~ [data-history-items="produced"]'
    ),
    'history-resolution-ingredients': terminal(
      'succeeded',
      '[data-history-summary="ingredients"] ~ [data-history-items="produced"]'
    ),
    'history-resolution-simple': terminal(
      'succeeded',
      '[data-history-summary="none"] ~ [data-history-items="produced"]'
    ),
    'history-checked-ingredients': terminal(
      'succeeded',
      '[data-history-summary="check"] ~ [data-history-items="consumed"] ~ [data-history-items="produced"]'
    ),
    'history-legacy-no-check-failure':
      terminal(
        'failed',
        '[data-journal-verdict] ~ [data-history-summary="ingredients"] ~ [data-history-items="consumed"]'
      ) + lacks('[data-history-items="produced"]'),
    ...Object.fromEntries(
      ['history-multi-essence', 'history-multi-shared-essence'].map((state) => [
        state,
        terminal(
          'succeeded',
          '[data-history-stages] [data-stage-card="0"]',
          '[data-history-stages] [data-stage-card="1"]',
          '[data-essence-history-carrier]'
        ) + lacks('[data-history-summary]', '[data-history-items="produced"]'),
      ])
    ),
    'history-multi-success':
      terminal(
        'succeeded',
        '[data-history-stages] [data-stage-card="2"] [data-stage-io="produced"]'
      ) + lacks('[data-history-summary]', '[data-history-items="produced"]'),
    'history-multi-failure':
      terminal('failed', '[data-history-stages] [data-stage-card="2"][data-stage-state="failed"]') +
      lacks('[data-history-summary]', '[data-history-items="produced"]'),
    'history-cancelled-before':
      terminal('cancelled') +
      lacks('[data-history-stages]', '[data-history-summary]', '[data-history-items]'),
    'history-cancelled-multi':
      terminal('cancelled', '[data-history-stages] [data-stage-card="1"]') +
      lacks('[data-stage-card="2"]', '[data-history-summary]'),
    ...Object.fromEntries(
      ['history-d100-all-hit', 'history-d100-all-miss'].map((state) => [
        state,
        terminal(
          'succeeded',
          '[data-yield-scale] [data-yield-cut]',
          '[data-yield-entry="jp-dewglass-drop"]'
        ) + lacks('[data-history-items="produced"]', '[data-history-summary]'),
      ])
    ),
    'history-gathering-check-failure':
      terminal('failed', '[data-history-outcome-log]') +
      lacks('[data-history-verdict-check]', '[data-outcome-ladder]', '[data-history-summary]'),
    'history-just-resolved':
      detail +
      has('[data-journal-verdict="succeeded"] [data-history-items="transient-produced"]') +
      lacks('[data-history-summary]', '[data-run-action-bar]'),
    'history-redacted':
      terminal('succeeded') +
      lacks('[data-history-items]', '[data-history-summary]', '[data-history-stages]'),
    'history-missing-material': terminal('succeeded', '[data-history-items="consumed"]'),
    'history-gm-deleted-recipe': terminal(
      'succeeded',
      '[data-history-summary="check"]',
      '[data-history-items="produced"]'
    ),
    'history-failure-awards': terminal('failed', '[data-history-items="produced"]'),
    'history-settling':
      detail +
      has('[data-journal-settling]') +
      lacks('[data-journal-verdict]', '[data-run-action-bar]', '[data-history-items="produced"]'),
  };
  const pointerTargets = {
    'waiting-open-choice': '[data-choice-id]:not(:disabled)',
    'cancel-confirmation': '[data-run-action="cancel-confirm"]',
    paused: '[data-run-action="resume"]',
    'ingredient-route': '[data-journal-route]',
    'stage-not-started': '[data-run-action="begin"]',
    'awaiting-choice': '[data-journal-route]',
    'check-route': '[data-run-action="primary"]',
    'essence-overshoot': '[data-essence-source$=".Item.jp-sunmote"] [data-stepper-increment]',
    'past-stage': '[data-stage-nav-return]',
    'future-stage': '[data-stage-nav-return]',
    'past-routed-stage': '[data-stage-nav-return]',
    'future-routed-stage': '[data-stage-nav-return]',
    'history-just-resolved': '[data-history-run-id="lab-v1-history-just-resolved"]',
  };
  return states.map((state) =>
    playerCase({
      id: `fabricate-journal-lifecycle-${state}`,
      label: `Player Journal — ${state.replaceAll('-', ' ')}`,
      smokeLabels: [],
      reaches: 'beyond',
      query: {
        tab: 'journal',
        journalCaseState: state.replace(/-finished$/, ''),
        ...(['history-gm-deleted-recipe', 'claim-retained'].includes(state) && { viewer: 'gm' }),
        ...(state.startsWith('gathering-straight') && { gatheringTaskMode: 'straight' }),
        ...(state.startsWith('gathering-check') && { gatheringTaskMode: 'routed' }),
      },
      position: { width: state === 'narrow' ? 1024 : 1240, height: 880 },
      steps: [
        ...selectCaseRun(state),
        ...(steps[state] ??
          (state.startsWith('history-') ||
          ['finished-success', 'finished-failure', 'automatic-completion'].includes(state)
            ? [{ selector: `[data-history-run-id="lab-v1-${state}"]` }]
            : [])),
      ],
      expectTab: 'journal',
      expectSelector: expected[state],
      ...(pointerTargets[state] && { expectCenterHit: pointerTargets[state] }),
      ...(state === 'filter-paused' && { expectCenterHit: steps[state].at(-1).selector }),
      ...(state === 'kind-menu-open' && { expectCenterHit: '[data-popover-option="gathering"]' }),
      ...(state === 'current-choice-closed' && {
        expectCenterHit: '[data-slot-row] button.fab-slot-tile',
      }),
      ...(['narrow', 'wide'].includes(state) && {
        expectLayout: {
          containerSelector: '.journal-view-container',
          gridSelector: '.journal-view-grid',
          expectedTracks: state === 'narrow' ? 1 : 2,
          ...(state === 'narrow' && { maxContentBoxInlineSize: 960 }),
        },
      }),
      kinds: ['player', 'journal', ...(state === 'narrow' ? ['responsive'] : [])],
      sourceMatches: [
        JOURNAL_SOURCES,
        /^src\/ui\/svelte\/stores\/journalStore/,
        /^src\/ui\/presenters\/RunJournalBuilder\.js$/,
      ],
    })
  );
}
