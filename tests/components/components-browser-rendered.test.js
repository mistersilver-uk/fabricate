/* THE SYSTEM COMPONENT RULES LIST. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { before, describe, it } from 'node:test';

import { chromium } from 'playwright';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

import { createComponentsBrowserViewHarness } from '../helpers/componentScopeMountModules.js';
import {
  harvestedFoundryChromeCss,
  harvestedFoundryVersion,
  registerChromeRunnerGuards,
  skipWithoutHarvest,
} from '../helpers/harvestedFoundryChrome.js';
import { collectScopedCss, managerShellPage } from '../helpers/renderedManagerShell.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

const { harness, compiledModules } = createComponentsBrowserViewHarness({
  repoRoot,
  tmpPrefix: 'fabricate-components-rendered-',
});

// Wide enough that `.manager-body` keeps its columns.
const HOST_WIDTH_PX = 1280;
const HOST_HEIGHT_PX = 720;
// Anti-vacuity: an unstyled toolbar is a few pixels tall. The reference's band holds a 38px
// control row and a second row under it.
const MIN_TOOLBAR_HEIGHT_PX = 70;
// Anti-vacuity for the scoped-CSS collector; the view's tree compiles to well over this.
const MIN_SCOPED_BLOCKS = 6;

/** The shipped zero, re-declared: the exact rule the maintainer's M22 screenshot was taken under. */
const FLUSH_CONTROL = `
  .fabricate-manager .manager-component-toolbar { padding-bottom: 0 !important; }
`;

/** THE CHROME STAND-IN (M28). Foundry's sheet centres a button's content. */
const FOUNDRY_BUTTON_CHROME = `
  button { display: inline-flex; align-items: center; justify-content: center; }
`;

/* M28's fix is TWO declarations, one per cause. */

/** Cause 1 alive: the identity's own alignment gone, so the chrome's `center` decides it again. */
const NO_IDENTITY_ALIGNMENT_CONTROL = `
  .fabricate-manager .manager-components-list .manager-component-row button.manager-component-identity { justify-content: center !important; }
`;

/** Cause 2 alive: the copy stops taking the free space, so there is space to float in again. */
const NO_COPY_GROW_CONTROL = `
  .fabricate-manager .manager-components-list .manager-component-row .manager-component-identity .manager-system-copy { flex: 0 1 auto !important; }
`;

/** Both causes alive — the M28 fix re-declared away, so the identity floats again under the same chrome. */
const CENTRED_CONTROL = NO_IDENTITY_ALIGNMENT_CONTROL + NO_COPY_GROW_CONTROL;

/** Resolved ONCE, so the skipped arm, the mirror check and the CI guard all read one fact. */
const harvestedChrome = harvestedFoundryChromeCss(repoRoot);

// See the SKIP POLICY block at the head of this file. BOTH halves.
registerChromeRunnerGuards({
  repoRoot,
  suitePath: 'tests/components/components-browser-rendered.test.js',
  chrome: harvestedChrome,
});

/**
 * A BARE `<button>` under one chrome sheet and NOTHING else — no module sheet, no scoped blocks.
 */
function bareButtonPage(chromeCss) {
  return managerShellPage({
    fabricateCss: '',
    view: 'components',
    productMarkup: '<button data-bare-button type="button">Bare</button>',
    scopedCss: '',
    chrome: chromeCss,
    hostWidth: HOST_WIDTH_PX,
    hostHeight: HOST_HEIGHT_PX,
  });
}

/** Runs IN THE PAGE: where a bare button's chrome puts its content. */
function measureBareButton() {
  const style = getComputedStyle(document.querySelector('[data-bare-button]'));
  return { display: style.display, justifyContent: style.justifyContent, alignItems: style.alignItems };
}

function page(productMarkup, scopedCss, { chrome = '', control = '', hostWidth = HOST_WIDTH_PX } = {}) {
  return managerShellPage({
    fabricateCss,
    view: 'components',
    productMarkup,
    scopedCss,
    chrome,
    control,
    hostWidth,
    hostHeight: HOST_HEIGHT_PX,
  });
}

function absentScope() {
  return {
    entries: [
      {
        id: 'world-long',
        entity: {
          name: 'Masterwork Morningstar with a Deliberately Long World Name',
          description:
            'A long world description that must yield to the adoption control without escaping the row.',
          img: 'icons/svg/hammer.svg',
        },
        systems: [],
      },
      {
        id: 'world-bare',
        entity: { name: 'Unbound Salt', description: '', img: '' },
        systems: [],
      },
    ],
  };
}

function measureAbsentRows() {
  const probe = document.createElement('span');
  probe.style.background = 'var(--fab-bg-1)';
  probe.style.border = '1px solid var(--fab-accent-border)';
  document.body.append(probe);
  const bg1 = getComputedStyle(probe).backgroundColor;
  const accentBorder = getComputedStyle(probe).borderColor;
  probe.remove();

  const rows = [...document.querySelectorAll('[data-component-member="false"]')].map((row) => {
    const box = row.getBoundingClientRect();
    const add = row.querySelector('[data-component-ghost-add]');
    const addBox = add.getBoundingClientRect();
    const style = getComputedStyle(row);
    const target = document.elementFromPoint(
      addBox.left + addBox.width / 2,
      addBox.top + addBox.height / 2
    );
    return {
      id: row.dataset.componentId,
      selected: row.classList.contains('is-selected'),
      height: box.height,
      overflow: row.scrollWidth - row.clientWidth,
      addHeight: addBox.height,
      addContained: addBox.left >= box.left && addBox.right <= box.right,
      addHit: target?.closest?.('[data-component-ghost-add]') === add,
      hasRecipes: Boolean(row.querySelector('[data-component-recipes]')),
      hasSelection: Boolean(row.querySelector('[data-component-select]')),
      opacity: style.opacity,
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
    };
  });
  return {
    rows,
    bg1,
    accentBorder,
  };
}

function card(id, name, description) {
  return {
    id,
    name,
    description,
    img: 'icons/svg/item-bag.svg',
    essences: [],
    salvageSummary: { resultGroupCount: 0 },
  };
}

/** The band, its two rows and the space between and under them, as laid out. */
function measureToolbar() {
  const toolbar = document.querySelector('[data-component-toolbar]');
  const rows = [...toolbar.querySelectorAll('.manager-component-filter-row')];
  const first = rows[0]?.getBoundingClientRect();
  const last = rows.at(-1)?.getBoundingClientRect();
  const band = toolbar.getBoundingClientRect();
  const style = getComputedStyle(toolbar);
  const probe = document.createElement('span');
  probe.style.padding = 'var(--fab-space-3)';
  toolbar.append(probe);
  const space3 = getComputedStyle(probe).paddingTop;
  probe.remove();
  return {
    rowCount: rows.length,
    bandHeight: band.height,
    paddingBottom: style.paddingBottom,
    borderBottom: parseFloat(style.borderBottomWidth) || 0,
    space3,
    spaceBelowLastRow: last ? band.bottom - last.bottom : null,
    spaceBetweenRows: first && last && rows.length > 1 ? last.top - first.bottom : null,
  };
}

/** Where each row's medallion sits against the row's leading edge, as laid out. */
function measureRows() {
  return [...document.querySelectorAll('.manager-component-row')].map((row) => {
    const box = row.firstElementChild.getBoundingClientRect();
    const identity = row.querySelector('.manager-component-identity');
    const identityBox = identity.getBoundingClientRect();
    const medallion = identity.querySelector('.fab-medallion').getBoundingClientRect();
    const copy = identity.querySelector('.manager-system-copy').getBoundingClientRect();
    return {
      id: row.dataset.componentId,
      description: row.querySelector('.manager-system-description').textContent.trim(),
      gap: parseFloat(getComputedStyle(row).columnGap),
      identityInset: identityBox.left - box.right,
      leadInset: medallion.left - box.right,
      copySlack: identityBox.right - copy.right,
      justifyContent: getComputedStyle(identity).justifyContent,
    };
  });
}

describe('the rules list toolbar’s rendered geometry (issue 1371 r16-list, M22)', () => {
  const rendered = { markup: '', scoped: null };
  let honest = null;
  let flush = null;

  before(async () => {
    rendered.scoped = collectScopedCss({ repoRoot, compiledModules });
    await harness.setup();
    try {
      const target = await harness.mount({
        itemCards: [card('c1', 'Iron Ore', 'A lump of ore.'), card('c2', 'Copper Ore', 'A lump of ore.')],
      });
      rendered.markup = target.innerHTML;
    } finally {
      harness.teardown();
    }

    const browser = await chromium.launch();
    try {
      const tab = await browser.newPage({ viewport: { width: HOST_WIDTH_PX, height: HOST_HEIGHT_PX } });
      await tab.setContent(page(rendered.markup, rendered.scoped.css), { waitUntil: 'load' });
      honest = await tab.evaluate(measureToolbar);
      await tab.setContent(page(rendered.markup, rendered.scoped.css, { control: FLUSH_CONTROL }), { waitUntil: 'load' });
      flush = await tab.evaluate(measureToolbar);
    } finally {
      await browser.close();
    }
  });

  it('lays the toolbar out at its real height with both rows, so the measurement is of the product', () => {
    assert.ok(rendered.markup.length > 0, 'the view rendered nothing at all');
    assert.ok(
      rendered.scoped.blocks >= MIN_SCOPED_BLOCKS,
      `only ${rendered.scoped.blocks} scoped style blocks were collected (expected at least ${MIN_SCOPED_BLOCKS})`
    );
    assert.equal(honest.rowCount, 2, 'the reference draws TWO toolbar rows (gap-list row 103, C3)');
    assert.ok(
      honest.bandHeight >= MIN_TOOLBAR_HEIGHT_PX,
      `the band is ${honest.bandHeight}px tall — the stylesheets did not reach it`
    );
  });

  it('gives the LAST row the same breathing room below it as the rows have between them (M22)', () => {
    // The maintainer's photograph: the second row touching the band's bottom border. The space
    // under it must be the band's own `--fab-space-3` — the catalogue toolbar's value, and the
    // reference's 11px snapped to the 4px scale — and never less than the gap above the row.
    assert.equal(
      honest.paddingBottom,
      honest.space3,
      `the band's bottom padding resolved to ${honest.paddingBottom}, not the spacing scale's --fab-space-3 (${honest.space3})`
    );
    const expected = parseFloat(honest.space3) + honest.borderBottom;
    assert.ok(
      Math.abs(honest.spaceBelowLastRow - expected) < 0.5,
      `the last row sits ${honest.spaceBelowLastRow}px above the band's bottom edge, expected ${expected}px`
    );
    assert.ok(
      honest.spaceBelowLastRow >= honest.spaceBetweenRows,
      `the space below the last row (${honest.spaceBelowLastRow}px) is less than the gap between the rows (${honest.spaceBetweenRows}px)`
    );
  });

  it('CONTROL: with the shipped zero re-declared, the last row touches the border again', () => {
    // Proves the assertion above can fail.
    assert.equal(flush.paddingBottom, '0px', 'the control did not override the padding, so it proves nothing');
    assert.ok(
      flush.spaceBelowLastRow <= flush.borderBottom + 0.5,
      `under the control the last row still sits ${flush.spaceBelowLastRow}px above the edge — the measurement cannot see the defect`
    );
  });
});

describe('every row’s medallion sits at the leading edge after the box (issue 1371 r18-list, M28)', () => {
  const rendered = { markup: '', scoped: null };
  const chrome = harvestedChrome;
  let honest = null;
  let underFoundry = null;
  let centred = null;
  let withoutAlignment = null;
  let withoutCopyGrow = null;
  let standInBareButton = null;
  let foundryBareButton = null;

  before(async () => {
    rendered.scoped = collectScopedCss({ repoRoot, compiledModules });
    await harness.setup();
    try {
      // ONE ROW WITH NO DESCRIPTION AND ONE WITH A LONG ONE.
      const target = await harness.mount({
        itemCards: [
          card('bare', 'Bitterbark', ''),
          card('described', 'Iron Ore', 'A lump of ore dug from the deep seams of the northern mines, heavy and cold to the touch.'),
        ],
      });
      rendered.markup = target.innerHTML;
    } finally {
      harness.teardown();
    }

    const browser = await chromium.launch();
    try {
      const tab = await browser.newPage({ viewport: { width: HOST_WIDTH_PX, height: HOST_HEIGHT_PX } });
      const rowsUnder = async (options) => {
        await tab.setContent(page(rendered.markup, rendered.scoped.css, options), { waitUntil: 'load' });
        return tab.evaluate(measureRows);
      };
      honest = await rowsUnder({ chrome: FOUNDRY_BUTTON_CHROME });
      centred = await rowsUnder({ chrome: FOUNDRY_BUTTON_CHROME, control: CENTRED_CONTROL });
      withoutAlignment = await rowsUnder({ chrome: FOUNDRY_BUTTON_CHROME, control: NO_IDENTITY_ALIGNMENT_CONTROL });
      withoutCopyGrow = await rowsUnder({ chrome: FOUNDRY_BUTTON_CHROME, control: NO_COPY_GROW_CONTROL });
      if (chrome) underFoundry = await rowsUnder({ chrome });

      // The stand-in's fidelity, measured rather than trusted.
      await tab.setContent(bareButtonPage(FOUNDRY_BUTTON_CHROME), { waitUntil: 'load' });
      standInBareButton = await tab.evaluate(measureBareButton);
      if (chrome) {
        await tab.setContent(bareButtonPage(chrome), { waitUntil: 'load' });
        foundryBareButton = await tab.evaluate(measureBareButton);
      }
    } finally {
      await browser.close();
    }
  });

  /** The claim a GM sees, stated once for every arrangement it is made under. */
  function assertFlush(rows, label) {
    assert.equal(rows.length, 2, `${label}: both rows rendered`);
    assert.equal(rows[0].description, 'No description', `${label}: the bare row really reads the fallback`);
    for (const row of rows) {
      assert.ok(
        Math.abs(row.identityInset - row.gap) < 0.5,
        `${label}: row "${row.id}"'s identity starts ${row.identityInset}px after the box, not the row gap (${row.gap}px)`
      );
      assert.ok(
        Math.abs(row.leadInset - row.gap) < 0.5,
        `${label}: row "${row.id}"'s medallion sits ${row.leadInset}px after the box, not the row gap (${row.gap}px) — its content floated inside the identity`
      );
    }
  }

  /** M28's two causes, each read off the shipped row: the identity states its own alignment. */
  function assertBothCausesClosed(rows, label) {
    for (const row of rows) {
      assert.equal(
        row.justifyContent,
        'flex-start',
        `${label}: row "${row.id}"'s identity resolved justify-content: ${row.justifyContent} — the module sheet stopped declaring it and the chrome decided`
      );
      assert.ok(
        Math.abs(row.copySlack) < 0.5,
        `${label}: row "${row.id}" leaves ${row.copySlack}px of free space beside the copy column — the copy stopped taking the slack`
      );
    }
  }

  it('renders the bare row and the described row, and the control really centres the identity', () => {
    assert.ok(rendered.markup.length > 0, 'the view rendered nothing at all');
    assert.equal(honest.length, 2);
    // Non-vacuity for the CONTROL: the identity's `justify-content` is being ARBITRATED.
    assert.equal(
      centred[0].justifyContent,
      'center',
      'the control did not centre the identity, so the negative half below proves nothing'
    );
  });

  it('THE MIRROR: the hand-written chrome stand-in centres a bare button, which is the one fact it transcribes', () => {
    // Emptied, this line used to leave the whole suite green (Q2).
    assert.deepEqual(
      standInBareButton,
      { display: 'inline-flex', justifyContent: 'center', alignItems: 'center' },
      'the stand-in does not centre a bare button, so every arrangement laid under it proves nothing about Foundry'
    );
  });

  it('THE MIRROR: and Foundry’s own harvested sheet agrees with it, where a local harvest exists', { skip: skipWithoutHarvest(chrome) }, () => {
    // The drift this catches is a Foundry release that stops centring a button's content.
    assert.equal(
      foundryBareButton.justifyContent,
      standInBareButton.justifyContent,
      `Foundry ${harvestedFoundryVersion(repoRoot)} resolves a bare button to justify-content: ${foundryBareButton.justifyContent}, the stand-in to ${standInBareButton.justifyContent} — the transcription has drifted from the sheet`
    );
    assert.equal(
      foundryBareButton.alignItems,
      standInBareButton.alignItems,
      `Foundry ${harvestedFoundryVersion(repoRoot)} resolves a bare button to align-items: ${foundryBareButton.alignItems}, the stand-in to ${standInBareButton.alignItems}`
    );
  });

  it('draws the medallion one row gap after the box on BOTH rows under a chrome that centres buttons (M28)', () => {
    assertFlush(honest, 'chrome stand-in');
    assertBothCausesClosed(honest, 'chrome stand-in');
  });

  it('and under the harvested Foundry sheet itself, where a local harvest exists', { skip: skipWithoutHarvest(chrome) }, () => {
    const label = `foundry chrome ${harvestedFoundryVersion(repoRoot)}`;
    assertFlush(underFoundry, label);
    assertBothCausesClosed(underFoundry, label);
  });

  it('holds the edge on the identity’s own alignment alone, which is the only thing closing the chrome’s cause', () => {
    // The copy's grow re-declared away: the edge still holds.
    assertFlush(withoutCopyGrow, 'without the copy’s grow');
    const bare = withoutCopyGrow.find((row) => row.id === 'bare');
    assert.equal(bare.justifyContent, 'flex-start', 'the identity’s own alignment is what is holding the edge here');
    assert.ok(
      bare.copySlack > 40,
      `the control left only ${bare.copySlack}px of free space beside the copy — it did not remove the grow, so this arrangement proves nothing`
    );
  });

  it('and on the copy’s grow alone, which is the only thing closing the free-space cause', () => {
    // The identity's own alignment re-declared away: the chrome wins the alignment.
    assertFlush(withoutAlignment, 'without the identity’s alignment');
    for (const row of withoutAlignment) {
      assert.equal(row.justifyContent, 'center', 'the control did not hand the alignment back to the chrome, so this arrangement proves nothing');
      assert.ok(
        Math.abs(row.copySlack) < 0.5,
        `row "${row.id}" left ${row.copySlack}px of free space — the copy's grow is what is holding the edge here`
      );
    }
  });

  it('CONTROL: with the fix re-declared away, the bare row’s medallion floats into the row again', () => {
    // The defect the maintainer photographed: the bare row's content mid-row.
    const bare = centred.find((row) => row.id === 'bare');
    assert.ok(
      bare.leadInset > bare.gap + 40,
      `under the control the bare row's medallion still sits ${bare.leadInset}px after the box — the measurement cannot see the shunt`
    );
  });
});

describe('absent world components use the Essence Rules row contract (issue 2036)', () => {
  const rendered = { markup: '', scoped: null };
  const measurements = new Map();

  before(async () => {
    rendered.scoped = collectScopedCss({ repoRoot, compiledModules });
    await harness.setup();
    try {
      const target = await harness.mount({
        itemCards: [],
        scope: absentScope(),
        systemId: 'sys-1',
        selectedSystemId: 'sys-1',
        selectedComponentId: 'world-long',
      });
      target.querySelector('[data-component-membership-option="all"] input').click();
      flushSync();
      rendered.markup = target.innerHTML;
    } finally {
      harness.teardown();
    }

    const browser = await chromium.launch();
    try {
      for (const width of [HOST_WIDTH_PX, 1024]) {
        const tab = await browser.newPage({ viewport: { width, height: HOST_HEIGHT_PX } });
        await tab.setContent(page(rendered.markup, rendered.scoped.css, { hostWidth: width }), {
          waitUntil: 'load',
        });
        const rest = await tab.evaluate(measureAbsentRows);
        await tab.hover('[data-component-id="world-bare"]');
        const hover = await tab.evaluate(measureAbsentRows);
        measurements.set(width, { rest, hover });
        await tab.close();
      }
    } finally {
      await browser.close();
    }
  });

  it('renders actual absent rows at full contrast with member-only facts omitted', () => {
    assert.ok(rendered.markup.length > 0, 'the view rendered nothing');
    assert.match(rendered.markup, /data-component-member="false"/);
    for (const { rest } of measurements.values()) {
      assert.equal(rest.rows.length, 2);
      assert.ok(rest.rows.every((row) => row.opacity === '1'), 'absent rows keep normal contrast');
      assert.ok(rest.rows.every((row) => !row.hasRecipes), 'absent rows omit the recipe fact');
      assert.ok(rest.rows.every((row) => !row.hasSelection), 'absent rows omit bulk selection');
    }
  });

  it('keeps both long and missing content contained at wide and minimum window widths', () => {
    for (const [width, { rest }] of measurements) {
      for (const row of rest.rows) {
        assert.ok(row.height >= 76, `${width}px ${row.id}: row height is ${row.height}px`);
        assert.ok(row.overflow <= 0.5, `${width}px ${row.id}: row overflows by ${row.overflow}px`);
        assert.ok(row.addContained, `${width}px ${row.id}: Add escapes the row`);
        assert.equal(row.addHeight, 34, `${width}px ${row.id}: Add is not the 34px primary rung`);
        assert.ok(row.addHit, `${width}px ${row.id}: Add is not the pointer target at its centre`);
      }
    }
  });

  it('uses transparent rest, bg-1 hover and bg-1 plus the accent edge when selected', () => {
    for (const [width, { rest, hover }] of measurements) {
      const bare = rest.rows.find((row) => row.id === 'world-bare');
      const hovered = hover.rows.find((row) => row.id === 'world-bare');
      const selected = rest.rows.find((row) => row.id === 'world-long');
      assert.equal(bare.backgroundColor, 'rgba(0, 0, 0, 0)', `${width}px: resting fill`);
      assert.equal(hovered.backgroundColor, rest.bg1, `${width}px: hover fill`);
      assert.equal(selected.backgroundColor, rest.bg1, `${width}px: selected fill`);
      assert.equal(selected.borderColor, rest.accentBorder, `${width}px: selected edge`);
    }
  });
});
