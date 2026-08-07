/*
 * The essence GRID card's equal-height contract (issue 1036, maintainer review round 2).
 *
 * ── WHY THIS IS A REAL BROWSER AND NOT A SOURCE ASSERTION ────────────────────────
 * The maintainer read the defect off a published frame: in `manager-essences-grid.png` the
 * `Water` card is 4px taller than the two cards beside it, its footer 4px lower, with no
 * content difference to explain it. A previous round answered "the cards are equal height"
 * by looking at that same image, which is how the defect survived a review.
 *
 * Nothing in the source says otherwise. `.manager-essences-table.is-grid` already declared
 * `align-items: stretch`, and a source assertion on that declaration passes today and passed
 * while the frame was wrong. happy-dom computes no cascade, so a mounted test cannot measure
 * a height either. The only instrument that can settle it is a real engine, which is what
 * `component-studio-font-size.test.js` and `recipe-studio-font-size.test.js` already use.
 *
 * ── THE CAUSE, AND WHY THE FIXTURE MUST CARRY FOUNDRY'S LIST RULES ───────────────
 * Foundry core (`css/foundry2.css`, @layer elements) declares `ul li { margin-bottom:
 * 0.25rem }` and `ul li:last-child { margin-bottom: 0 }`, and neutralises it only for AppV1.
 * The manager is an ApplicationV2, so every essence `<li>` carries 4px of bottom margin and
 * the LAST one does not. In a grid, `align-items: stretch` sizes an item's MARGIN box to the
 * row, so the exempted last card converts its neighbours' margin into 4px of extra border
 * box — the exact asymmetry in the frame, and one that appears only when the last card
 * happens to share a row with others.
 *
 * `tests/fixtures/foundry-core-min.css` therefore reproduces those three rules. Remove them
 * and this gate goes green against a page the product never draws.
 *
 * ── WHAT IT MEASURES ─────────────────────────────────────────────────────────────
 * Two adversarial rows, chosen so that content variance is the ONLY thing left that could
 * move a height:
 *
 *  - row one mixes a 3-line description, a 1-line description and a two-chip header;
 *  - row two ends with a card carrying a 90-character name, which is the growth vector the
 *    maintainer named ("name should be truncated") and which, unclamped, wraps to three
 *    lines and re-sizes its whole row.
 *
 * Every card in a row must have the SAME border-box height, and the long-name card must be
 * no taller than the same row's shortest name — that second assertion is what fails if the
 * single-line clamp is ever dropped, because equal-height-within-a-row would still hold
 * while every card in the row grew together.
 *
 * ── THE FIXTURE IS A MIRROR, AND MIRRORS ROT ─────────────────────────────────────
 * The markup below stands in for `EssenceRow.svelte`'s card branch. Change that component's
 * card markup and update this fixture in the same commit: a green run against stale markup
 * proves nothing. The CLASSES are stamped with the components' real Svelte scope hashes and
 * their real compiled CSS is appended after the global sheet, so the cascade this measures is
 * the one the app ships.
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
  'src/ui/svelte/apps/manager/Chip.svelte',
  'src/ui/svelte/components/Medallion.svelte',
  'src/ui/svelte/components/StatusPill.svelte',
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  // The card's own CSS lives in the shared primitive now; without it this fixture measures
  // an unstyled stack and every gate below passes vacuously.
  'src/ui/svelte/apps/manager/library/LibraryCard.svelte',
  'src/ui/svelte/apps/manager/essences/EssenceRow.svelte',
  'src/ui/svelte/apps/manager/EssenceBrowserView.svelte',
].map((componentPath) => scopedComponentCss(resolve(repoRoot, componentPath)));

// The contract classes are DERIVED from each component's own emitted CSS rather than
// hand-listed, so renaming a scoped class cannot leave an element silently unstamped.
//
// BOTH of Svelte's scoping forms are collected, which the font-size gates' copies of this
// helper do not do. Svelte writes the SUBJECT of a rule as `.name.svelte-hash` but every
// ANCESTOR-QUALIFIED descendant as `.name:where(.svelte-hash)`, so a pattern that reads only
// the first form silently skips every rule of the shape
// `.manager-essence-row.is-card .manager-system-name` — which is most of what this file
// measures. A missed class does not fail; the rule simply never matches and the gate
// measures the unstyled element.
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
  const disabledPill = essence.off
    ? '<span class="fab-status-pill is-neutral"><i class="fas fa-circle-pause"></i><span class="fab-status-pill-label">Disabled</span></span>'
    : '';
  // The card is the shared `LibraryCard` anatomy: a header pairing the medallion with the
  // name to its right, a badges row, the fixed 2-line description box, the recessed facts
  // well, then a divided footer carrying the enable toggle and the edit pencil. The
  // selection box is the body button's SIBLING, pinned into the top-right corner.
  //
  // Both class vocabularies are stamped, exactly as the app renders them: the primitive's
  // own `fab-library-card-*` (which is where the LOOK lives) and the essence hooks the
  // smoke walk and the View Lab navigate by. Dropping either half would measure an element
  // the app does not ship.
  return `
<li class="fab-library-card manager-essence-row is-card${essence.off ? ' is-off' : ''}" data-essence-id="${essence.id}" data-essence-variant="grid">
  <button type="button" class="fab-library-card-body manager-essence-identity">
    <span class="fab-library-card-header">
      <span class="fab-medallion has-tint" style="width:40px;height:40px;--fab-medallion-tint:var(--fab-tag-sage)"><i class="fas fa-mortar-pestle"></i></span>
      <span class="fab-library-card-heading">
        <span class="fab-library-card-name manager-system-name" title="${essence.name}">${essence.name}</span>
      </span>
    </span>
    <span class="fab-library-card-badges">${disabledPill}<span class="manager-essence-capabilities is-card-badges">${pills}</span></span>
    <span class="fab-library-card-description manager-system-description">${essence.description}</span>
    <span class="fab-library-card-facts" data-essence-usage>
      <span class="fab-library-card-fact is-strong manager-essence-usage-components" data-essence-usage-components>${essence.components} components</span>
      <span class="fab-library-card-facts-sep"></span>
      <span class="fab-library-card-fact is-muted" data-essence-usage-recipes>${essence.recipes} recipes</span>
    </span>
  </button>
  <label class="fab-selection-checkbox"><input type="checkbox" class="fab-selection-input"><span class="fab-selection-check is-lg"><i class="fas fa-check"></i></span></label>
  <div class="fab-library-card-footer">
    <button type="button" class="manager-status-toggle ${essence.off ? 'is-off' : 'is-on'}"><span class="manager-status-toggle-track"><span class="manager-status-toggle-knob"></span></span></button>
    <span class="fab-library-card-footer-end"><button type="button" class="manager-icon-button manager-essence-edit"><i class="fas fa-pen"></i></button></span>
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

// 734px is the essence library's list column at the 1280px capture width, which is what
// makes this three tracks wide — the same three the published frame shows.
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

    // The fixture must actually be a three-column grid, or "same height in a row" is a
    // statement about rows of one and the gate is vacuous.
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

    // And the growth vector the maintainer named: a 90-character name is ONE line, so it
    // cannot re-size its row. Without the clamp this name wraps and every card in its row
    // grows with it — which the equal-height assertion above would happily allow.
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
