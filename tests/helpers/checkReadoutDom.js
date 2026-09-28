/** The Checks simulator's rolled readout read off a mounted tree, as a GM sees it (issue 2080). */

const textOf = (node) => node?.textContent.trim() ?? null;

/**
 * Every part of the rolled readout: the medallion's number and caption, the breakdown, the total,
 * the target line and its margin kind, the card's tone, title and detail, the note, and each
 * "What happens" row as `[id, label, meta]`. A part that does not render reads `null`.
 */
export function readReadout(root) {
  const find = (selector) => root.querySelector(selector);
  const line = find('[data-checks-simulator-margin]');
  const card = find('[data-checks-simulator-band]');
  const note = card?.querySelector('[data-checks-simulator-note]');
  return {
    medallion: [
      textOf(find('[data-checks-simulator-medallion] strong')),
      textOf(find('[data-checks-simulator-medallion-caption]')),
    ],
    breakdown: textOf(find('[data-checks-simulator-breakdown]')),
    total: textOf(find('[data-checks-simulator-total]')),
    line: line ? [textOf(line), line.dataset.checksSimulatorMargin] : null,
    card: card
      ? [
          card.dataset.checksSimulatorBand,
          textOf(card.querySelector('[data-checks-simulator-band-name]')),
          textOf(card.querySelector('[data-checks-simulator-band-detail]')),
        ]
      : null,
    note: note ? [note.dataset.checksSimulatorNote, textOf(note)] : null,
    rows: [...root.querySelectorAll('[data-checks-simulator-fact]')].map((row) => [
      row.dataset.checksSimulatorFact,
      textOf(row.querySelector('strong')),
      textOf(row.querySelector('[data-checks-simulator-fact-meta]')) ?? '',
    ]),
  };
}

/** The margin notes a roll-under, character value and count check always carry (R4). */
export const MARGIN_NOTES = Object.freeze({
  under: [
    'margin',
    'Margin is shown so that higher is always better: how far under the target the total landed.',
  ],
  over: [
    'margin',
    'Margin is shown so that higher is always better: how far over the target the total landed.',
  ],
  count: ['margin', 'Margin is shown so that higher is always better: successes over what was needed.'],
});

/** A roll-total trigger that fires on every roll and forces `outcome` (R5). */
export const forceTrigger = (outcome) => ({
  id: `force-${outcome}`,
  condition: { type: 'rollTotal', operator: '>=', value: -1000 },
  outcome,
  breakTools: false,
});
