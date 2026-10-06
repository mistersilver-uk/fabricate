/*
 * The Manager page header's three geometry contracts, measured in a real engine.
 *  1. The `Unsaved` chip takes the geometry of the buttons it sits beside in full: height,
 *     corner, type size and inline padding. A chip matching only one of the four reads as a
 *     further control drawn wrong.
 *  2. A long identity subtitle or title truncates on one line, so the action cluster never wraps.
 *  3. The Premium advert gives way first: it compacts, then goes, so the heading keeps 320px and
 *     `Add from catalogue` stays on screen and on one row at every manager width.
 */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { borrowBrowser } from '../helpers/layout-harness.js';
import { scopedComponentCss, withScopeHash } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const foundryCss = readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

const SCOPED_COMPONENTS = [
  'src/ui/svelte/components/Chip.svelte',
  'src/ui/svelte/components/Medallion.svelte',
  // NOT `Button.svelte`: it emits no scoped CSS at all. Every declaration a header
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
    <button type="button" class="fabricate-button fab-manager-button is-ghost" data-action="back">
      <i class="fas fa-arrow-left"></i><span>All factions</span>
    </button>
    <button type="button" class="fabricate-button fab-manager-button is-danger" data-action="delete">
      <i class="fas fa-trash"></i><span>Delete faction</span>
    </button>
    <button type="button" class="fabricate-button fab-manager-button is-primary" data-action="save">
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
  return pageAround(header(subtitle, title));
}

/**
 * @param {string} markup the Manager's content, composed inside its real shell
 * @param {{width?: number, extraCss?: string}} [shell] the manager's width and any further
 *   component CSS the markup carries already scoped
 * @returns {string}
 */
function pageAround(markup, { width = 1040, extraCss = '' } = {}) {
  const fixture = SCOPED_COMPONENTS.reduce(
    stampScopedClasses,
    `<div class="application theme-dark">
      <section class="window-content">
        <div class="fabricate fabricate-manager" data-fabricate-theme="dark" style="width:${width}px">
          ${markup}
        </div>
      </section>
    </div>`
  );
  const scopedCss = [...SCOPED_COMPONENTS.map((component) => component.css), extraCss].join('\n');
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
  const browser = await borrowBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.setContent(pageFor(subtitle, title), { waitUntil: 'load' });
    return await page.evaluate(() => {
      const round = (element) => Math.round(element.getBoundingClientRect().height);
      const chip = document.querySelector('.manager-chip');
      const buttons = [...document.querySelectorAll('.manager-header-actions .fabricate-button')];
      const subline = document.querySelector('.manager-subtitle');
      const style = getComputedStyle(subline);
      return {
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

/**
 * The two shipped clusters that stand a state chip beside 34px buttons. `is-primary` widens its
 * own inline padding, so only the ghost composition compares that figure.
 */
const CHIP_CLUSTERS = [
  {
    name: 'the page header beside a ghost button',
    compared: ['height', 'radius', 'fontSize', 'paddingLeft', 'paddingRight'],
    markup: (chipClass) => `
<header class="manager-header">
  <div class="manager-header-actions" aria-label="Actions">
    <span class="${chipClass}" title="Unsaved">Unsaved</span>
    <button type="button" class="fabricate-button fab-manager-button is-ghost">
      <i class="fas fa-arrow-left"></i><span>Back</span>
    </button>
  </div>
</header>`,
  },
  {
    name: 'an edit card heading beside a primary button',
    compared: ['height', 'radius', 'fontSize'],
    markup: (chipClass) => `
<section class="manager-edit-card">
  <div class="manager-edit-card-heading">
    <h3 class="manager-card-title">Identity</h3>
    <div class="manager-action-group">
      <span class="${chipClass}" title="Unsaved">Unsaved</span>
      <button type="submit" class="fabricate-button fab-manager-button is-primary">
        <i class="fas fa-save"></i><span>Save details</span>
      </button>
    </div>
  </div>
</section>`,
  },
];

const CHIP_FACES = [
  { name: 'plain', chipClass: 'manager-chip is-warning is-action' },
  { name: 'truncated', chipClass: 'manager-chip is-warning is-truncated is-action' },
];

/**
 * @param {string} markup one composed cluster
 * @returns {Promise<{chip: object, button: object}>} the computed geometry of the chip and button
 */
async function measureCluster(markup) {
  const browser = await borrowBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.setContent(pageAround(markup), { waitUntil: 'load' });
    return await page.evaluate(() => {
      const geometry = (element) => {
        const style = getComputedStyle(element);
        return {
          height: Math.round(element.getBoundingClientRect().height),
          radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
          fontSize: Number.parseFloat(style.fontSize) || 0,
          paddingLeft: Number.parseFloat(style.paddingLeft) || 0,
          paddingRight: Number.parseFloat(style.paddingRight) || 0,
        };
      };
      return {
        chip: geometry(document.querySelector('.manager-chip')),
        button: geometry(document.querySelector('.fabricate-button')),
      };
    });
  } finally {
    await browser.close();
  }
}

for (const cluster of CHIP_CLUSTERS) {
  for (const face of CHIP_FACES) {
    test(`a ${face.name} action chip takes the button's geometry in ${cluster.name}`, async () => {
      const { chip, button } = await measureCluster(cluster.markup(face.chipClass));

      // A button the sheet failed to style would compare equal to a chip that also lost its rule.
      assert.ok(button.radius > 0, 'the button computed no corner radius to compare against');
      assert.ok(button.fontSize > 0, 'the button computed no font size to compare against');
      for (const property of cluster.compared) {
        assert.equal(
          chip[property],
          button[property],
          `the chip's ${property} is ${chip[property]} beside a button at ${button[property]}`
        );
      }
    });
  }
}

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

// ── The Premium crafting-icons advert (issue 2220) ─────────────────────────────────────────────

const PREMIUM_AD = 'src/ui/svelte/apps/manager/ManagerPremiumIconsAd.svelte';
const premiumAdCss = scopedComponentCss(resolve(repoRoot, PREMIUM_AD));
const premiumAdHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-premium-ad-geometry-',
  rawModules: ['src/ui/svelte/apps/manager/premiumIconsAdModel.js'],
  compiledModules: [
    'src/ui/svelte/components/Button.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    PREMIUM_AD,
  ],
  componentPath: PREMIUM_AD,
});

/** The advert's own markup, rendered by the component rather than copied into a fixture. */
let premiumAdMarkup = '';
before(async () => {
  try {
    await premiumAdHarness.setup();
    const host = await premiumAdHarness.mount({ text: (key, fallback) => fallback });
    premiumAdMarkup = host.innerHTML;
  } finally {
    premiumAdHarness.teardown();
  }
});

/** Component Rules' header: the longest title a GM can give a system, the advert, the action. */
const advertHeader = () => `
<header class="manager-header">
  <div class="manager-heading">
    <nav class="manager-breadcrumbs"><span>Crafting Systems</span></nav>
    <h1 class="manager-title">The Most Serene and Ancient Nimithernian Institute Component Rules</h1>
    <p class="manager-subtitle">${LONG_SUBTITLE}</p>
  </div>
  <div class="manager-header-actions" aria-label="Component actions">
    ${premiumAdMarkup}
    <button type="button" class="fabricate-button fab-manager-button is-primary is-size-38" data-component-add-from-catalogue>
      <i class="fas fa-plus"></i><span>Add from catalogue</span>
    </button>
  </div>
</header>`;

/** The header at one manager width: what the advert shows, and what it left the rest. */
async function measureAdvert(width) {
  const browser = await borrowBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 800 } });
    await page.setContent(pageAround(advertHeader(), { width, extraCss: premiumAdCss.css }), {
      waitUntil: 'load',
    });
    return await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect();
      const shown = (element) => element.getBoundingClientRect().width > 0;
      const add = document.querySelector('[data-component-add-from-catalogue]');
      const group = box('.manager-header-actions');
      const header = document.querySelector('.manager-header');
      const inner =
        header.getBoundingClientRect().right -
        Number.parseFloat(getComputedStyle(header).paddingRight);
      return {
        advert: shown(document.querySelector('[data-premium-icons-ad]')),
        icons: [...document.querySelectorAll('.manager-premium-icons-ad-icon')].filter(shown)
          .length,
        subline: shown(document.querySelector('.manager-premium-icons-ad-subline')),
        heading: Math.round(box('.manager-heading').width),
        // One row: the group is no taller than its tallest child.
        groupHeight: Math.round(group.height),
        tallest: Math.round(
          Math.max(
            ...[...document.querySelector('.manager-header-actions').children].map(
              (child) => child.getBoundingClientRect().height
            )
          )
        ),
        addHeight: Math.round(add.getBoundingClientRect().height),
        addRight: Math.round(add.getBoundingClientRect().right),
        headerRight: Math.round(inner),
      };
    });
  } finally {
    await browser.close();
  }
}

/** The widths either side of each threshold, plus the window's declared width and the extremes. */
const ADVERT_WIDTHS = Object.freeze([
  { width: 1440, face: 'full' },
  { width: 1280, face: 'full' },
  { width: 1180, face: 'full' },
  { width: 1179, face: 'compact' },
  { width: 1100, face: 'compact' },
  { width: 980, face: 'compact' },
  { width: 979, face: 'hidden' },
  { width: 900, face: 'hidden' },
  { width: 680, face: 'hidden' },
]);

const FACES = Object.freeze({
  full: { advert: true, icons: 6, subline: true },
  compact: { advert: true, icons: 3, subline: false },
  hidden: { advert: false, icons: 0, subline: false },
});

test('the markup the advert geometry is measured on is the component’s own', () => {
  assert.ok(premiumAdMarkup.includes('data-premium-icons-ad'), 'the advert rendered nothing');
  assert.ok(
    premiumAdMarkup.includes(premiumAdCss.hashClass),
    'the rendered advert and the measured CSS disagree on the scope hash'
  );
});

for (const { width, face } of ADVERT_WIDTHS) {
  test(`at ${width}px the Premium advert is ${face} and Add from catalogue keeps its row`, async () => {
    const measured = await measureAdvert(width);
    const { advert, icons, subline } = measured;
    assert.deepEqual({ advert, icons, subline }, FACES[face], `the advert's face at ${width}px`);
    assert.ok(measured.heading >= 320, `the heading kept ${measured.heading}px at ${width}px`);
    assert.equal(measured.groupHeight, measured.tallest, `the action group wrapped at ${width}px`);
    assert.equal(measured.addHeight, 38, `Add from catalogue wrapped its label at ${width}px`);
    assert.ok(
      measured.addRight <= measured.headerRight,
      `Add from catalogue ran ${measured.addRight - measured.headerRight}px off the header`
    );
  });
}
