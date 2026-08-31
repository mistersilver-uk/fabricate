/*
 * THE MANAGER PAGE HEADER'S TWO GEOMETRY CONTRACTS, measured in a real engine.
 *
 * Both defects were read off a running world, and neither can be seen from the source.
 *
 *  1. The `Unsaved` chip renders SHORTER than the Back / Delete / Save buttons it sits
 *     beside. The header cluster is a `space-between` flex row that centres its children, so
 *     a 20px chip beside 34px buttons reads as a label that fell out of the group.
 *
 *  2. A long identity subtitle — a faction's description, a component's blurb — WRAPS, and
 *     the heading block it grows takes the row's width with it. The action cluster is
 *     `flex-wrap: wrap`, so instead of overflowing it breaks, and `Save` drops onto a second
 *     line under `Delete`. The title beside it is already clamped to one line; the subtitle
 *     under it was not.
 *
 * ── WHY A REAL BROWSER, AND NOT A SOURCE ASSERTION ───────────────────────────────
 *
 * Because the cascade is the whole subject. `styles/fabricate.css` is imported at
 * `layer(modules)` and Svelte's `css: 'injected'` blocks land UNLAYERED, so an unlayered
 * author declaration beats every layered one at any specificity — which is why
 * `.manager-header-actions .manager-chip { min-height: 34px }` was written at three classes,
 * did nothing, and was retired in issue 1118. `Chip.svelte` records that finding at length.
 *
 * A source assertion cannot tell a rule that wins from one that is inert. happy-dom computes
 * no cascade, so a mounted test cannot either. This measures the composed page: Foundry's
 * own sheet, then the global one at its real layer, then the components' compiled blocks
 * unlayered — which is the order the product loads them in.
 *
 * ── THE FIXTURE IS A MIRROR, AND MIRRORS ROT ─────────────────────────────────────
 *
 * The markup below stands in for the identity-header branch of
 * `CraftingSystemManagerRoot.svelte` — `.manager-recipe-edit-heading` and
 * `.manager-header-actions`, which the recipe editor and every companion drill-down share.
 * Change that markup and change this in the same commit: a green run against a stale mirror
 * proves nothing.
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
  // NOT `ManagerButton.svelte`: it emits no scoped CSS at all. Every declaration a header
  // button renders with lives in `styles/fabricate.css`, which is exactly why its height and
  // the chip's are decided in two different places and by two different layers.
].map((componentPath) => scopedComponentCss(resolve(repoRoot, componentPath)));

/**
 * Stamp every class a component's own CSS scopes onto the fixture.
 *
 * BOTH of Svelte's scoping forms are collected. It writes a rule's SUBJECT as
 * `.name.svelte-hash` and every ancestor-qualified descendant as `.name:where(.svelte-hash)`,
 * and a pattern reading only the first silently skips the second — which does not fail, it
 * simply leaves the element unstyled and the measurement vacuous.
 *
 * @param {string} fixture
 * @param {{css: string, hashClass: string}} component
 * @returns {string}
 */
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

/** A real faction description out of the maintainer's world, which is what wrapped the row. */
const LONG_SUBTITLE =
  "The setting's most institutionalised arcane power, cloistered in Nimithern above the Ague " +
  'Shards. Knowledge is property and legitimacy is a function of control. Currently sliding ' +
  'towards schism and purge.';

/**
 * The identity header as the root renders it for a companion drill-down.
 *
 * @param {string} subtitle
 * @param {string} [title]
 * @returns {string}
 */
function header(subtitle, title = 'Nimithernian Institute for the Arcane') {
  return `
<header class="manager-header">
  <div class="manager-heading">
    <nav class="manager-breadcrumbs"><span>World</span></nav>
    <div class="manager-recipe-edit-heading" data-downtime-chrome-heading>
      <span class="fab-medallion" style="width:44px;height:44px"></span>
      <div class="manager-recipe-edit-heading-copy">
        <h1 class="manager-title">${title}</h1>
        <p class="manager-subtitle" data-downtime-chrome-subline>${subtitle}</p>
      </div>
    </div>
  </div>
  <div class="manager-header-actions" aria-label="Actions">
    <span class="manager-chip is-warning is-action" data-downtime-chrome-status>Unsaved</span>
    <button type="button" class="manager-button fab-manager-button is-ghost" data-action="back">
      <i class="fas fa-arrow-left"></i><span>All factions</span>
    </button>
    <button type="button" class="manager-button fab-manager-button is-danger" data-action="delete">
      <i class="fas fa-trash"></i><span>Delete faction</span>
    </button>
    <button type="button" class="manager-button fab-manager-button is-primary" data-action="save">
      <i class="fas fa-floppy-disk"></i><span>Save faction</span>
    </button>
  </div>
</header>`;
}

/**
 * One composed page at the Manager's real shell width.
 *
 * @param {string} subtitle
 * @returns {string}
 */
function pageFor(subtitle, title) {
  const fixture = SCOPED_COMPONENTS.reduce(
    stampScopedClasses,
    `<div class="application theme-dark">
      <section class="window-content">
        <div class="fabricate fabricate-manager" data-fabricate-theme="dark" style="width:1040px">
          ${header(subtitle, title)}
        </div>
      </section>
    </div>`
  );
  const scopedCss = SCOPED_COMPONENTS.map((component) => component.css).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${foundryCss}</style>
    <style>@layer modules {${fabricateCss}}</style>
    <style>${scopedCss}</style>
    <style>:root{--font-primary:Arial,sans-serif}</style></head>
    <body class="game">${fixture}</body></html>`;
}

/**
 * Measure one composed header.
 *
 * @param {string} subtitle
 * @returns {Promise<object>}
 */
async function measure(subtitle, title) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.setContent(pageFor(subtitle, title), { waitUntil: 'load' });
    return await page.evaluate(() => {
      const round = (element) => Math.round(element.getBoundingClientRect().height);
      const chip = document.querySelector('.manager-chip');
      const buttons = [...document.querySelectorAll('.manager-header-actions .manager-button')];
      const subline = document.querySelector('.manager-subtitle');
      const style = getComputedStyle(subline);
      return {
        chipHeight: round(chip),
        buttonHeights: buttons.map(round),
        // THE TOPS ARE WHAT SAY WHETHER THE CLUSTER WRAPPED. Every action on one line shares
        // a top; a wrapped `Save` sits below its siblings, which is the defect exactly.
        actionTops: [chip, ...buttons].map((element) =>
          Math.round(element.getBoundingClientRect().top)
        ),
        sublineHeight: round(subline),
        sublineLine: Number.parseFloat(style.lineHeight) || 0,
        sublineOverflows: subline.scrollWidth > subline.clientWidth,
        sublineWidth: Math.round(subline.getBoundingClientRect().width),
        // 1ch OF THE SUBTITLE'S OWN FONT, so the limit can be asserted as the reading measure
        // it is rather than as a pixel figure that a type-scale change would falsify.
        sublineCh: (() => {
          const ruler = document.createElement('span');
          ruler.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
          ruler.style.font = style.font;
          ruler.textContent = '0'.repeat(100);
          subline.parentElement.append(ruler);
          const width = ruler.getBoundingClientRect().width / 100;
          ruler.remove();
          return width;
        })(),
        headerWidth: Math.round(document.querySelector('.manager-header').clientWidth),
        headingWidth: Math.round(
          document.querySelector('.manager-heading').getBoundingClientRect().width
        ),
        actionsWidth: Math.round(
          document.querySelector('.manager-header-actions').getBoundingClientRect().width
        ),
      };
    });
  } finally {
    await browser.close();
  }
}

test('the header status chip is the same height as the buttons it sits beside', async () => {
  // 20px BESIDE 34px was what shipped. The cluster centres its children, so the chip floated
  // in the middle of the button row and read as a stray label rather than as the first member
  // of the group — which is where every Core editor puts its own `Unsaved`.
  const measured = await measure('Training · 8 days total');

  const heights = new Set(measured.buttonHeights);
  assert.equal(heights.size, 1, `the buttons are not one height: ${measured.buttonHeights}`);
  assert.equal(
    measured.chipHeight,
    measured.buttonHeights[0],
    `the chip is ${measured.chipHeight}px beside ${measured.buttonHeights[0]}px buttons`
  );
});

test('a long identity subtitle truncates rather than wrapping the action cluster', async () => {
  // THE DEFECT, IN THE ORDER IT HAPPENS. The subtitle wraps, so the heading block claims more
  // of the row; both children of a `space-between` row may shrink, so the action cluster is
  // squeezed; and because the cluster is `flex-wrap: wrap` it BREAKS rather than overflowing,
  // dropping `Save faction` onto a second line under `Delete faction`.
  const measured = await measure(LONG_SUBTITLE);

  // ONE LINE. Asserted against the computed line height rather than a pixel figure, so the
  // gate survives a type-scale change and still fails on a wrap.
  assert.ok(measured.sublineLine > 0, 'the subtitle has no computed line height to measure');
  assert.ok(
    measured.sublineHeight <= Math.ceil(measured.sublineLine) + 1,
    `the subtitle wrapped to ${measured.sublineHeight}px against a ${measured.sublineLine}px line`
  );

  // AND IT IS REALLY BEING CLIPPED, which is what distinguishes a truncated subtitle from one
  // that merely happened to fit: without this a shorter fixture would satisfy the height check
  // and the clamp could be dropped unnoticed.
  assert.equal(measured.sublineOverflows, true, 'the fixture subtitle is not long enough to clip');

  // AND IT IS WIDTH-LIMITED, not merely clipped at whatever the row left over. One line of a
  // long description would otherwise run the full width of everything the cluster does not
  // take, and an ellipsis at the far right of a 1200px header is a sentence a GM has to scan
  // across an empty row to find the end of. Asserted as a reading measure in the subtitle's own
  // `ch`, so a type-scale change moves the pixels and not the promise.
  assert.ok(measured.sublineCh > 0, 'the subtitle font could not be measured');
  assert.ok(
    measured.sublineWidth <= Math.ceil(measured.sublineCh * 70),
    `the subtitle runs ${Math.round(measured.sublineWidth / measured.sublineCh)}ch wide`
  );

  // AND NOTHING WRAPPED. Every action shares a top.
  const tops = new Set(measured.actionTops);
  assert.equal(
    tops.size,
    1,
    `the action cluster wrapped onto ${tops.size} rows: header ${measured.headerWidth}px = heading ${measured.headingWidth}px + actions ${measured.actionsWidth}px`
  );
});

test('a long identity TITLE does not wrap the action cluster either', () =>
  measure(
    'Training · 8 days total',
    'The Most Serene and Ancient Nimithernian Institute for the Study of the Arcane Arts and Allied Disciplines'
  ).then((measured) => {
    // **A SEPARATE CASE, AND IT HAD TO BE.** The subtitle clamp above fixes the reported defect
    // on its own -- driven mutation proved that the header's two `flex` rules changed nothing
    // for it -- and they are not therefore redundant: they are what a long TITLE needs.
    //
    // The title is already clamped to one line, so it never grows the heading TALLER. What it
    // grows is the heading's max-content WIDTH, and in a `space-between` row where both children
    // may shrink, the action cluster shrinks with it -- and wraps, because it is allowed to.
    // `flex: 0 0 auto` on the cluster and `flex: 1 1 auto` on the heading name which of the two
    // is the one that yields. Measured without them: heading 753px, actions 243px, two rows.
    const tops = new Set(measured.actionTops);
    assert.equal(
      tops.size,
      1,
      `the action cluster wrapped onto ${tops.size} rows: header ${measured.headerWidth}px = heading ${measured.headingWidth}px + actions ${measured.actionsWidth}px`
    );
  }));
