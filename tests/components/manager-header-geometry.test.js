/*
 * THE MANAGER PAGE HEADER'S TWO GEOMETRY CONTRACTS, measured in a real engine.
 *  1. The `Unsaved` chip renders SHORTER than the Back / Delete / Save buttons it sits
 *     beside. The header cluster is a `space-between` flex row that centres its children, so
 *     a 20px chip beside 34px buttons reads as a label that fell out of the group.
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
  // NOT `ManagerButton.svelte`: it emits no scoped CSS at all. Every declaration a header
  // button renders with lives in `styles/fabricate.css`, which is exactly why its height and
  // the chip's are decided in two different places and by two different layers.
].map((componentPath) => scopedComponentCss(resolve(repoRoot, componentPath)));

/**
 * Stamp every class a component's own CSS scopes onto the fixture.
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
    <button type="button" class="fabricate-button manager-button fab-manager-button is-ghost" data-action="back">
      <i class="fas fa-arrow-left"></i><span>All factions</span>
    </button>
    <button type="button" class="fabricate-button manager-button fab-manager-button is-danger" data-action="delete">
      <i class="fas fa-trash"></i><span>Delete faction</span>
    </button>
    <button type="button" class="fabricate-button manager-button fab-manager-button is-primary" data-action="save">
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
        // 1ch OF THE SUBTITLE'S OWN FONT.
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
  // 20px BESIDE 34px was what shipped. The cluster centres its children.
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
  // THE DEFECT, IN THE ORDER IT HAPPENS. The subtitle wraps.
  const measured = await measure(LONG_SUBTITLE);

  // ONE LINE. Asserted against the computed line height rather than a pixel figure.
  assert.ok(measured.sublineLine > 0, 'the subtitle has no computed line height to measure');
  assert.ok(
    measured.sublineHeight <= Math.ceil(measured.sublineLine) + 1,
    `the subtitle wrapped to ${measured.sublineHeight}px against a ${measured.sublineLine}px line`
  );

  // AND IT IS REALLY BEING CLIPPED.
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
    const tops = new Set(measured.actionTops);
    assert.equal(
      tops.size,
      1,
      `the action cluster wrapped onto ${tops.size} rows: header ${measured.headerWidth}px = heading ${measured.headingWidth}px + actions ${measured.actionsWidth}px`
    );
  }));
