/**
 * Specimens: a shipped component mounted DIRECTLY by a fixture-only wrapper under
 * `tests/view-lab/fixtures/`, for props no shipped caller passes yet (issue 1782). A specimen frame
 * depicts a state no GM can reach today, so each label says so; it is not a smoke counterpart.
 */

import { managerCase } from './caseFactories.js';

/** The seam, its prop kinds, its manifest, its adapter and its host: each redraws what it mounts. */
const PUBLISHED_SEAM_SOURCES = Object.freeze([
  /^src\/ui\/publishedComponentSeam\.js$/,
  /^src\/ui\/publishedComponentProps\.js$/,
  /^src\/ui\/publishedComponentManifest\.js$/,
  /^src\/ui\/publishedComponents\.svelte\.js$/,
  /^src\/ui\/svelte\/published\/PublishedComponentHost\.svelte$/,
]);

/** The leaves fixture's ground: the one `div` whose sections hold every mounted root. */
const LEAVES_GROUND = [
  '.fab-avatar[data-avatar="image"]',
  '.fab-avatar[data-avatar="initials"]',
  '.fab-medallion[data-medallion="image"]',
  '.fab-medallion[data-medallion="glyph"]',
  '.fab-fill-bar',
  '.fab-meter[aria-labelledby]',
  '.fab-banded-bar.is-single',
  '.fab-banded-bar.is-histogram',
  '.fab-stat-box',
  '.fab-kicker.is-accent > span',
  '.manager-chip.is-warning.is-list > span',
].reduce((ground, root) => `${ground}:has(> section > div > ${root})`, 'div');

/** How many mounts `tests/view-lab/fixtures/PublishedLeaves.svelte` makes, one section each. */
const LEAF_MOUNTS = 23;

/** The one mounted chip at the default density, whose long label wraps inside its 88px track. */
const WRAPPED_CHIP = `${LEAVES_GROUND} > section > div > .manager-chip:not(.is-list)`;

/** The portrait ladder's single mark, whose edge includes its border under Foundry's reset. */
const PORTRAIT_BOX = 'box-sizing: border-box; width: 32px; height: 32px';

export const CASES = Object.freeze([
  managerCase({
    id: 'manager-bulk-edit-panel-shell-specimen',
    label:
      'Specimen, props no caller sets yet — Bulk edit panel: blocked forecast, clean report, report with skips',
    // Beyond the smoke: no studio passes `subjectCount`, `blocked` or `report`, so no walk reaches these.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'bulk-edit-panel-shell' },
    steps: [],
    // The hardest of the three states: a warning report listing its skipped rows inside the notice.
    expectSelector: '[data-bulk-report][data-notice-tone="warning"] [data-bulk-blocked-row]',
    kinds: ['manager', 'specimen'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/BulkEditPanelShell\.svelte$/],
  }),
  managerCase({
    id: 'manager-published-tier-track-specimen',
    label:
      'Specimen, mounted through the published seam — Tier track: a descending ladder whose middle rung is current. The frame draws inside the manager window, so ancestor independence is proved by the mounted suite’s bare-target clauses, not by this frame',
    // Beyond the smoke: no Fabricate screen renders it; a companion mounts it through `api.ui`.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-tier-track' },
    steps: [],
    expectSelector: '.fab-tier-track > ol[role="list"][aria-label] > li[aria-current="step"]',
    kinds: ['manager', 'specimen'],
    // `TierTrack.svelte` is a broad signal, routed here by its `BROAD_SIGNAL_CASE_OVERRIDES` entry.
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
  managerCase({
    id: 'manager-published-leaves-specimen',
    label:
      'Specimen, mounted through the published seam — the seven data-only leaves, then three kickers and three chips, reading left to right, top to bottom: three portraits, four art tiles; fill bars at 0, 64 and 100; the meter, the single banded bar, the histogram; three stat boxes, the info strip, a kicker wrapped to two lines; a heading kicker in the accent ink, an inline kicker, a warning and a neutral list chip, a chip whose label wraps. The frame draws inside the manager window, so ancestor independence is proved by the mounted suite’s bare-target clauses, not by this frame',
    // Beyond the smoke: a companion mounts each through `api.ui`, in states no one screen draws together.
    reaches: 'beyond',
    smokeLabels: [],
    query: { specimen: 'published-leaves' },
    steps: [],
    // Spelt from hooks `src/` emits, each root the direct child of its target, so a `FillBar`
    // nested in `Meter` cannot stand in for the mounted one.
    expectSelector: `${LEAVES_GROUND} > section > div > .fabricate-info-strip`,
    // Each mount inside the ground, the wrapped label inside its chip, and the ground inside the
    // window, so a row the window clips fails the capture.
    expectContained: [
      ...Array.from({ length: LEAF_MOUNTS }, (_, index) => ({
        container: LEAVES_GROUND,
        target: `${LEAVES_GROUND} > section:nth-child(${index + 1}) > div > *`,
      })),
      { container: WRAPPED_CHIP, target: `${WRAPPED_CHIP} > span` },
      { container: '.window-content', target: LEAVES_GROUND },
    ],
    expectLayout: {
      controls: [
        { selector: '.fab-avatar[data-avatar="image"]', styles: PORTRAIT_BOX },
        { selector: '.fab-avatar-img', styles: 'object-fit: cover' },
        { selector: '.fab-avatar[data-avatar="initials"]:not(.is-square)', styles: PORTRAIT_BOX },
        {
          selector: '.fab-medallion.is-corner-7:not(.is-tone-danger)',
          styles: 'width: 26px; height: 26px; border-radius: 7px',
        },
        { selector: '.fab-meter-hidden', styles: 'position: absolute; width: 1px; height: 1px' },
        {
          selector: '.fab-stat-box:has(.has-icon) .fab-kicker',
          styles: 'font-size: 8.5px; color: var(--fab-text-muted)',
        },
        { selector: '.fab-kicker.is-accent', styles: 'font-size: 8.5px; color: var(--fab-accent)' },
        {
          selector: '.manager-chip.is-warning.is-list',
          styles: 'font-size: 9px; color: var(--fab-warning-text)',
        },
        {
          selector: '.manager-chip.is-neutral.is-list',
          styles: 'font-size: 9px; color: var(--fab-text-muted)',
        },
      ],
    },
    // Sized to the fixture's 880px ground.
    position: { width: 1024, height: 640 },
    kinds: ['manager', 'specimen'],
    // The seven leaves, `Kicker` and `Chip` are broad signals, each routed here by its override.
    // `Kicker` and `Chip` are mounted here in their own right too (issue 2451).
    sourceMatches: PUBLISHED_SEAM_SOURCES,
  }),
]);
