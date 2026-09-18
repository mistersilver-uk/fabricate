/*
 * The essence GRID card's equal-height contract (issue 1036, maintainer review round 2).
 * ── WHY THIS IS A REAL BROWSER AND NOT A SOURCE ASSERTION ────────────────────────
 * The maintainer read the defect off a published frame: in `manager-essences-grid.png` the
 * `Water` card is 4px taller than the two cards beside it, its footer 4px lower, with no
 * content difference to explain it. A previous round answered "the cards are equal height"
 * by looking at that same image, which is how the defect survived a review.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { scopedComponentCss, withScopeHash } from '../helpers/scoped-component-css.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const foundryCss = readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

const SCOPED_COMPONENTS = [
  'src/ui/svelte/components/Chip.svelte',
  'src/ui/svelte/components/Medallion.svelte',
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  // The card's own CSS lives in the shared primitive now.
  'src/ui/svelte/apps/manager/library/LibraryCard.svelte',
  'src/ui/svelte/apps/manager/essences/EssenceRow.svelte',
  'src/ui/svelte/apps/manager/EssenceBrowserView.svelte',
].map((componentPath) => scopedComponentCss(resolve(repoRoot, componentPath)));

// The contract classes are DERIVED from each component's own emitted CSS rather than
// hand-listed, so renaming a scoped class cannot leave an element silently unstamped.
function stampScopedClasses(fixture, { css, hashClass }) {
  const subjects = new RegExp(String.raw`\.([\w-]+)\.` + hashClass + String.raw`\b`, 'g');
  const descendants = new RegExp(
    String.raw`\.([\w-]+):where\(\.` + hashClass + String.raw`\)`,
    'g'
  );
  const classes = new Set(
    [...css.matchAll(subjects), ...css.matchAll(descendants)].map((match) => match[1])
  );
  return [...classes].reduce(
    (markup, className) => withScopeHash(markup, className, hashClass),
    fixture
  );
}

const LONG_NAME = 'Quintessence of the Long Forgotten Ember That Will Not Fit On One Line At All';

function chip(label, { tone = '', icon = '' } = {}) {
  const toneClass = tone ? ` is-${tone}` : '';
  const glyph = icon ? `<i class="${icon}"></i>` : '';
  return `<span class="manager-chip${toneClass}">${glyph}${label}</span>`;
}

function card(essence) {
  const pills = (essence.pills || [])
    .map((pill) => chip(pill.label, { tone: pill.tone, icon: pill.icon }))
    .join('');
  // The row's Disabled badge is the same shared chip as the capability badges beside it
  // (issue 1506); before that it was a second pill component, and this fixture stamped its
  // markup by hand. It is built through `chip()` for the reason the badges are: a fixture that
  // spells a component's markup itself keeps measuring the old anatomy after the app stops
  // rendering it.
  const disabledPill = essence.off
    ? chip('Disabled', { tone: 'subtle', icon: 'fas fa-circle-pause' })
    : '';
  // The card is the shared `LibraryCard` anatomy.
  return `
<li class="fab-library-card manager-essence-row is-card${essence.off ? ' is-off' : ''}" data-essence-id="${essence.id}" data-essence-variant="grid">
  <button type="button" class="fab-library-card-body manager-essence-identity">
    <span class="fab-library-card-header">
      <span class="fab-medallion" data-medallion-tint="sage" style="width:40px;height:40px;--fab-medallion-tint:var(--fab-tag-sage)"><i class="fas fa-mortar-pestle"></i></span>
      <span class="fab-library-card-heading">
        <span class="fab-library-card-name manager-system-name" title="${essence.name}">${essence.name}</span>
      </span>
    </span>
    <span class="fab-library-card-badges">${disabledPill}<span class="manager-essence-capabilities is-card-badges">${pills}</span></span>
    <span class="fab-library-card-description manager-system-description">${essence.description}</span>
    <span class="fab-library-card-facts" data-essence-usage>
      <span class="fab-library-card-fact is-muted manager-essence-usage-components" data-essence-usage-components>${essence.components} components</span>
      <span class="fab-library-card-facts-sep"></span>
      <span class="fab-library-card-fact is-muted" data-essence-usage-recipes>${essence.recipes} recipes</span>
    </span>
  </button>
  <label class="fab-selection-checkbox"><input type="checkbox" class="fab-selection-input"><span class="fab-selection-check is-lg"><i class="fas fa-check"></i></span></label>
  <div class="fab-library-card-footer">
    <button type="button" class="fabricate-toggle manager-status-toggle ${essence.off ? 'is-off' : 'is-on'}"><span class="manager-status-toggle-track"><span class="manager-status-toggle-knob"></span></span></button>
    <span class="fab-library-card-footer-end"><button type="button" class="fabricate-icon-button manager-icon-button manager-essence-edit"><i class="fas fa-pen"></i></button></span>
  </div>
</li>`;
}

const EFFECTS = { label: 'Effects', tone: 'info', icon: 'fas fa-wand-magic-sparkles' };
const MACRO = { label: 'Macro', tone: 'neutral', icon: 'fas fa-code' };

// Six cards, three per row at the fixture width. Row one is the shipped corpus's own spread
// of description lengths and footer shapes; row two ends with the long-name card.
const ESSENCES = [
  {
    id: 'aether',
    name: 'Aether',
    off: true,
    description:
      'The binding between things, drawn thin. Rare, and quiet about what it does, which is a great deal.',
    pills: [MACRO, EFFECTS],
    components: 2,
    recipes: 1,
  },
  {
    id: 'air',
    name: 'Air',
    description: 'Breath and vapour.',
    pills: [],
    components: 1,
    recipes: 0,
  },
  {
    id: 'earth',
    name: 'Earth',
    description: 'Stone, ore, and root.',
    pills: [EFFECTS],
    components: 6,
    recipes: 1,
  },
  {
    id: 'fire',
    name: 'Fire',
    description: 'Forge-heat and ember.',
    pills: [EFFECTS],
    components: 4,
    recipes: 4,
  },
  {
    id: 'mote',
    name: 'Mote',
    description: 'Loose motive dust. Useful, and nobody has yet found a single use for it.',
    pills: [],
    components: 0,
    recipes: 1,
  },
  {
    id: 'longname',
    name: LONG_NAME,
    description: 'Spring, tide, and frost.',
    pills: [EFFECTS],
    components: 3,
    recipes: 1,
  },
];

// 734px is the essence library's list column at the 1280px capture width.
const FIXTURE = `
<div class="application theme-dark">
  <section class="window-content">
    <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="essences">
      <main class="manager-main">
        <section class="manager-panel" style="width:734px">
          <ul class="manager-essences-table is-grid" role="list" data-essence-view="grid">
            ${ESSENCES.map(card).join('')}
          </ul>
        </section>
      </main>
    </div>
  </section>
</div>`;

const SCOPED_FIXTURE = SCOPED_COMPONENTS.reduce(stampScopedClasses, FIXTURE);
const SCOPED_CSS = SCOPED_COMPONENTS.map((component) => component.css).join('\n');

const page = `<!doctype html><html><head><meta charset="utf-8">
  <style>${foundryCss}</style><style>${fabricateCss}</style><style>${SCOPED_CSS}</style>
  <style>:root{--font-primary:Arial,sans-serif}</style></head>
  <body class="game">${SCOPED_FIXTURE}</body></html>`;

test('essence grid cards are the same height in a row regardless of content', async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    await p.setContent(page, { waitUntil: 'load' });

    const measured = await p.evaluate(() => {
      const grid = document.querySelector('.manager-essences-table');
      return {
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        cards: [...document.querySelectorAll('.manager-essence-row')].map((row) => {
          const box = row.getBoundingClientRect();
          const style = getComputedStyle(row);
          const name = row.querySelector('.manager-system-name').getBoundingClientRect();
          return {
            id: row.dataset.essenceId,
            top: Math.round(box.top),
            height: Math.round(box.height),
            marginBottom: style.marginBottom,
            nameHeight: Math.round(name.height),
          };
        }),
      };
    });

    // The fixture must actually be a three-column grid.
    assert.equal(measured.columns, 3, 'the fixture renders three tracks, as the frame does');

    const rows = new Map();
    for (const measurement of measured.cards) {
      const bucket = rows.get(measurement.top) || [];
      bucket.push(measurement);
      rows.set(measurement.top, bucket);
    }
    assert.equal(rows.size, 2, 'and lays six cards out over two rows');

    for (const [top, bucket] of rows) {
      const heights = new Set(bucket.map((measurement) => measurement.height));
      assert.equal(
        heights.size,
        1,
        `cards in the row at y=${top} must be one height, measured ${bucket
          .map((measurement) => `${measurement.id}=${measurement.height}px`)
          .join(', ')}`
      );
    }

    // The margin is what made the LAST card taller than its row siblings. Asserting it is
    // zero states the fix rather than only its symptom: a future rule that reinstates the
    // margin fails here with a message that names the cause.
    for (const measurement of measured.cards) {
      assert.equal(
        measurement.marginBottom,
        '0px',
        `${measurement.id} must not carry Foundry's li margin — the last card converts it into extra height`
      );
    }

    // And the growth vector the maintainer named: a 90-character name is ONE line.
    const byId = new Map(measured.cards.map((measurement) => [measurement.id, measurement]));
    assert.equal(
      byId.get('longname').nameHeight,
      byId.get('fire').nameHeight,
      'a long essence name truncates to one line rather than wrapping the card taller'
    );
    assert.equal(
      byId.get('longname').height,
      byId.get('fire').height,
      'so its row is the height the short-named cards would have had on their own'
    );
  } finally {
    await browser.close();
  }
});
