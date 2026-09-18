/**
 * GM Downtime rail, preview and companion-panel layout, measured in a real browser (issue 1670).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { openLayoutContext } from '../helpers/layout-harness.js';

import { blockIn, css } from './manager-layout-shared.js';
import {
  MANAGER_WIDTH_LADDER,
  assertBadgeFixtureMirrorsComponent,
  companionRoot,
  companionRows,
  companionShort,
  downtimeHostScoped,
  railPage,
  readCompanionPanelChain,
  readCoreFallbackHostRows,
  readDowntimePreviewArrangement,
} from './manager-layout-downtime-fixtures.js';

test('the downtime preview keeps a two-column hero and a four-across grid in an ordinary Foundry window', async () => {
  // 1092px is what a 1314px Foundry window -- the reported one -- leaves `.manager-main`.
  const real = await readDowntimePreviewArrangement(1092);
  assert.equal(
    real.containerWidth,
    1052,
    'the pane arithmetic this gate rests on: a 1092px main pane is a 1052px query container'
  );
  assert.equal(
    real.heroTracks,
    2,
    `the hero keeps the board beside the copy at a real window width (got ${real.heroTracks})`
  );
  assert.equal(
    real.gridTracks,
    4,
    `the four benefit cards stay four-across at a real window width (got ${real.gridTracks})`
  );
  assert.ok(
    real.boardWidth < 400,
    `and the board is still the narrow column, not a half-width block (${real.boardWidth}px)`
  );

  // The fallbacks are half the claim.
  const narrow = await readDowntimePreviewArrangement(960);
  assert.equal(narrow.gridTracks, 2, 'the grid folds to 2x2 once a card would go under 228px');
  assert.equal(narrow.heroTracks, 2, 'and the hero, with far more room, does not fold with it');

  const tight = await readDowntimePreviewArrangement(700);
  assert.equal(tight.heroTracks, 1, 'the hero stacks once its copy column would drop under 420px');

  const smallest = await readDowntimePreviewArrangement(660);
  assert.equal(smallest.gridTracks, 1, 'and the existing 640px stage still stacks the cards');
});

test('the rail Downtime premium mark renders as the shared gold badge chip', async () => {
  const context = await openLayoutContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    // One row shape, rendered twice: Core's preview state (gold) and the companion-installed
    // state (muted). Writing the markup once is what makes the two frames comparable — and
    // keeps a second near-identical block out of the SonarCloud duplication gate.
    const downtimeRow = (rowId, chipId, chipModifier) =>
      `<button class="manager-nav-button manager-nav-parent manager-world-nav-item is-active"` +
      ` data-world-nav-item="downtime" id="${rowId}">` +
      `<i class="fas fa-hourglass-half"></i>` +
      `<span class="manager-nav-label">Downtime</span>` +
      `<span class="manager-nav-premium${chipModifier}" id="${chipId}">PREMIUM</span>` +
      `</button>`;
    await page.setContent(
      `<style>${css}</style>` +
        `<div class="fabricate-manager">` +
        `<span class="manager-titlebar-badge" id="titlebar">PREMIUM</span>` +
        `<nav class="manager-rail"><div class="manager-world-nav">` +
        downtimeRow('row', 'chip', '') +
        downtimeRow('row-installed', 'chip-installed', ' is-installed') +
        `<button class="manager-nav-button manager-nav-parent is-active" id="plain-active">` +
        `<i class="fas fa-users"></i>` +
        `<span class="manager-nav-label">Parties</span>` +
        `<span class="manager-nav-count">5</span>` +
        `</button>` +
        `<button class="manager-nav-button manager-nav-parent" id="plain">` +
        `<span class="manager-nav-label">Parties</span>` +
        `<span class="manager-nav-count" id="count">10</span>` +
        `</button>` +
        `</div></nav></div>`
    );
    const read = await page.evaluate(() => {
      const of = (id) => {
        const computed = getComputedStyle(document.getElementById(id));
        return {
          background: computed.backgroundColor,
          color: computed.color,
          weight: computed.fontWeight,
          radius: computed.borderTopLeftRadius,
          padding: computed.paddingLeft,
          borderColor: computed.borderTopColor,
        };
      };
      // Line boxes, counted by the browser rather than derived from a computed line-height:
      const lineCount = (selector) => {
        const range = document.createRange();
        range.selectNodeContents(document.querySelector(selector));
        return range.getClientRects().length;
      };
      return {
        chip: of('chip'),
        chipInstalled: of('chip-installed'),
        titlebar: of('titlebar'),
        count: of('count'),
        row: of('row'),
        plainActive: of('plain-active'),
        labelLines: lineCount('#row .manager-nav-label'),
        installedLabelLines: lineCount('#row-installed .manager-nav-label'),
      };
    });

    // The chip is asserted against the SHIPPED chip rather than against a hex.
    assert.equal(
      read.chip.background,
      read.titlebar.background,
      'the rail chip fills with the same gold as the title bar badge'
    );
    assert.equal(
      read.chip.color,
      read.titlebar.color,
      'and inks with the same dark pair, rather than the rail count colour'
    );
    assert.equal(read.chip.weight, '700', 'the chip is a badge weight, not the count weight');
    assert.notEqual(
      read.chip.background,
      'rgba(0, 0, 0, 0)',
      'a transparent chip is the reported defect: bare tan lettering rather than a mark'
    );
    assert.notEqual(
      read.chip.color,
      read.count.color,
      'the chip must beat the later nav-count rules that re-tone every trailing marker'
    );
    assert.equal(read.chip.radius, '4px', 'at the rail scale the design draws a 4px chip');
    // 5px, one pixel tighter each side than the design's own `2px 6px`.
    assert.equal(read.chip.padding, '5px', 'the rail chip keeps its filled-chip padding');
    assert.ok(
      read.labelLines === 1,
      `the chip must not squeeze the label into a second line (got ${read.labelLines})`
    );

    // Issue 1185 — the MUTED state. With a companion installed the title bar carries the loud
    // gold signal, so the rail chip steps down. "Somewhat mute" is the whole requirement, so
    // both halves are asserted: it must stop being gold, AND it must still be a filled chip.
    assert.notEqual(
      read.chipInstalled.background,
      read.chip.background,
      'an installed companion mutes the rail chip off the gold fill'
    );
    assert.notEqual(
      read.chipInstalled.color,
      read.chip.color,
      'and off the dark on-gold ink with it'
    );
    assert.notEqual(
      read.chipInstalled.background,
      'rgba(0, 0, 0, 0)',
      'muted is not removed: the row must still say which route premium provides'
    );
    assert.notEqual(
      read.chipInstalled.color,
      read.count.color,
      'and it must still read as a marker rather than collapsing into a plain rail count'
    );
    assert.equal(read.chipInstalled.weight, '600', 'the muted chip drops one weight step');
    // Geometry is NOT part of the mute: the muted rule restates colour and weight only.
    assert.equal(read.chipInstalled.radius, read.chip.radius, 'the muted chip keeps its radius');
    assert.equal(read.chipInstalled.padding, read.chip.padding, 'and its padding');
    assert.ok(
      read.installedLabelLines === 1,
      `and still leaves the label on one line (got ${read.installedLabelLines})`
    );

    // The active Downtime ROW is an ordinary active rail row and nothing more. It briefly
    // carried the prototype's bespoke accent fill, border and ink, which made one row in the
    // rail look like a different control; the premium signal lives in the chip and the title
    // bar, not in the row. Asserted against a plain active row rather than against literals,
    // so a change to the rail's selected language moves both or fails here.
    assert.equal(
      read.row.background,
      read.plainActive.background,
      'the active Downtime row fills exactly like any other active rail row'
    );
    assert.equal(read.row.color, read.plainActive.color, 'and inks like one');
    assert.equal(
      read.row.borderColor,
      read.plainActive.borderColor,
      'and borders like one — no accent outline of its own'
    );
    assert.notEqual(
      read.row.background,
      'rgba(0, 0, 0, 0)',
      'and the shared active fill is still a real fill, so the comparison is not two blanks'
    );
  } finally {
    await context.close();
  }
});

// Issue 1185 — the Downtime children are RAIL SUB-ITEMS, and had stopped looking like it.
test('the Downtime rail children sit on the same indent and gap as every other rail child', async () => {
  const context = await openLayoutContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    const subitem = (id, extraClass) =>
      `<button class="manager-nav-subitem${extraClass}" id="${id}">` +
      `<i class="fas fa-flask"></i>` +
      `<span class="manager-nav-label">Recipes</span>` +
      `<span class="manager-nav-count">7</span>` +
      `</button>`;
    await page.setContent(
      `<style>${css}</style>` +
        `<div class="fabricate-manager"><div class="manager-body"><aside class="manager-rail">` +
        `<nav class="manager-nav">` +
        `<div class="manager-nav-group is-expanded"><div class="manager-nav-submenu" id="crafting-submenu">` +
        subitem('crafting-child', '') +
        `</div></div>` +
        `<div class="manager-nav-group is-expanded"><div class="manager-nav-submenu" id="downtime-submenu">` +
        subitem('downtime-child', ' manager-downtime-subitem') +
        `</div></div>` +
        `</nav></aside><main class="manager-main"></main></div></div>`
    );
    const read = await page.evaluate(() => {
      const of = (id, submenuId) => {
        const button = document.getElementById(id);
        const computed = getComputedStyle(button);
        return {
          // The visible indent is what a GM compares.
          glyphOffset: +(
            button.querySelector('i').getBoundingClientRect().left -
            document.getElementById(submenuId).getBoundingClientRect().left
          ).toFixed(2),
          gap: computed.columnGap,
          paddingLeft: computed.paddingLeft,
          minHeight: computed.minHeight,
          radius: computed.borderTopLeftRadius,
          columns: computed.gridTemplateColumns,
        };
      };
      return {
        crafting: of('crafting-child', 'crafting-submenu'),
        downtime: of('downtime-child', 'downtime-submenu'),
      };
    });

    assert.equal(
      read.downtime.glyphOffset,
      read.crafting.glyphOffset,
      `a Downtime child starts where a Crafting child starts (got ${read.downtime.glyphOffset} vs ${read.crafting.glyphOffset})`
    );
    assert.equal(read.downtime.paddingLeft, read.crafting.paddingLeft, 'same indent');
    assert.equal(read.downtime.gap, read.crafting.gap, 'same gap between glyph and label');
    assert.equal(read.downtime.minHeight, read.crafting.minHeight, 'same row floor');
    assert.equal(read.downtime.radius, read.crafting.radius, 'same corner');
    assert.equal(read.downtime.columns, read.crafting.columns, 'same four-track grid');
  } finally {
    await context.close();
  }
});

// Issue 1185 — a rail label degrades by wrapping at a SPACE and then by ELLIPSIS.
test('a rail label wraps at a space and ellipsises, and never splits a word', async () => {
  const context = await openLayoutContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    const row = (id, label) =>
      `<div class="manager-nav-group" style="position:relative">` +
      `<button class="manager-nav-button manager-nav-parent manager-world-nav-item" id="${id}">` +
      `<i class="fas fa-hourglass-half"></i>` +
      `<span class="manager-nav-label">${label}</span>` +
      `<span class="manager-nav-premium">PREMIUM</span>` +
      `</button></div>`;
    await page.setContent(
      `<style>${css}</style>` +
        `<div class="fabricate-manager"><div class="manager-body"><aside class="manager-rail">` +
        `<nav class="manager-nav"><section class="manager-world-nav">` +
        row('short', 'Downtime') +
        row('oneword', 'Handelsverwaltungsuebersicht') +
        row('twowords', 'Trade Administration') +
        `</section></nav></aside><main class="manager-main"></main></div></div>`
    );
    const read = await page.evaluate(() => {
      const of = (id) => {
        const label = document.getElementById(id).querySelector('.manager-nav-label');
        const range = document.createRange();
        range.selectNodeContents(label);
        // Count LINE BOXES by distinct top edge.
        const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
        return {
          lines: lines.size,
          clipped: label.scrollWidth > label.clientWidth,
          trackWidth: +label.getBoundingClientRect().width.toFixed(1),
          overflow: getComputedStyle(label).overflow,
          textOverflow: getComputedStyle(label).textOverflow,
          wrap: getComputedStyle(label).overflowWrap,
        };
      };
      return { short: of('short'), oneWord: of('oneword'), twoWords: of('twowords') };
    });

    assert.equal(read.short.lines, 1, 'the shipped Downtime label still fits on one line');
    assert.equal(read.short.clipped, false, 'and is not ellipsised at the shipped rail width');

    // The proof that a word is not split: one line, and the overflow taken by the clip.
    assert.equal(
      read.oneWord.lines,
      1,
      'a label too wide for its track stays on ONE line rather than breaking mid-word'
    );
    assert.ok(read.oneWord.clipped, 'and is clipped, which is what `text-overflow` ellipsises');
    assert.equal(read.oneWord.overflow, 'hidden', 'the clip is what puts ellipsis in scope');
    assert.equal(read.oneWord.textOverflow, 'ellipsis');
    assert.notEqual(
      read.oneWord.wrap,
      'anywhere',
      '`anywhere` is what produced the reported mid-word break'
    );

    // And a label that CAN break at a space still does, rather than ellipsising whole words.
    assert.equal(read.twoWords.lines, 2, 'a multi-word label still wraps at its space');
  } finally {
    await context.close();
  }
});

// AC-16 — the widest sub-item case, at the shipped 220px rail.
test('a four-digit companion badge takes width from the LABEL, which never splits a word', async () => {
  assertBadgeFixtureMirrorsComponent();
  const context = await openLayoutContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    const subitem = (id, label, count) =>
      `<button class="manager-nav-subitem manager-downtime-subitem" id="${id}">` +
      `<i class="fas fa-scroll"></i>` +
      `<span class="manager-nav-label">${label}</span>` +
      `<span class="manager-nav-issue-badge" data-world-downtime-badge="${id}" role="img" ` +
      `aria-label="${count} waiting">${count}</span>` +
      `</button>`;
    await page.setContent(
      railPage(
        `<div class="manager-nav-group is-expanded">` +
          `<div class="manager-nav-submenu" id="downtime-submenu">` +
          subitem('wide', 'Trade Administration Overview', '1200') +
          subitem('control', 'Trade Administration Overview', '7') +
          subitem('oneword', 'Handelsverwaltungsuebersicht', '1200') +
          subitem('short', 'Ledger', '1200') +
          `</div></div>`
      )
    );
    // Counting LINE BOXES by distinct top edge, not by rect count.
    const read = await page.evaluate(() => {
      const of = (id) => {
        const row = document.getElementById(id);
        const label = row.querySelector('.manager-nav-label');
        const badge = row.querySelector('.manager-nav-issue-badge');
        const range = document.createRange();
        range.selectNodeContents(label);
        const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
        const rowBox = row.getBoundingClientRect();
        const labelBox = label.getBoundingClientRect();
        const badgeBox = badge.getBoundingClientRect();
        return {
          lines: lines.size,
          clipped: label.scrollWidth > label.clientWidth,
          wrap: getComputedStyle(label).overflowWrap,
          labelWidth: +labelBox.width.toFixed(1),
          labelFirstLineBottom: Math.min(...[...range.getClientRects()].map((rect) => rect.bottom)),
          badgeWidth: +badgeBox.width.toFixed(1),
          badgeHeight: +badgeBox.height.toFixed(1),
          badgeClipped: badge.scrollWidth > badge.clientWidth,
          badgeCentreY: +(badgeBox.top + badgeBox.height / 2).toFixed(1),
          badgeInsideRow:
            badgeBox.left >= rowBox.left - 0.5 &&
            badgeBox.right <= rowBox.right + 0.5 &&
            badgeBox.top >= rowBox.top - 0.5 &&
            badgeBox.bottom <= rowBox.bottom + 0.5,
          badgeClearsLabel: badgeBox.left >= labelBox.right - 0.5,
          rowHeight: +rowBox.height.toFixed(1),
          rowCentreY: +(rowBox.top + rowBox.height / 2).toFixed(1),
          rowVerticallyClipped: row.scrollHeight > row.clientHeight + 1,
        };
      };
      return {
        wide: of('wide'),
        control: of('control'),
        oneWord: of('oneword'),
        short: of('short'),
      };
    });

    // THE NUMERAL IS NEVER TRUNCATED. A truncated numeral actively lies.
    assert.equal(read.wide.badgeClipped, false, 'a four-digit badge holds its declared size');
    assert.ok(read.wide.badgeWidth > 0 && read.wide.badgeHeight > 0, 'and is a real box');
    assert.ok(
      read.wide.badgeWidth > read.control.badgeWidth,
      `four digits are wider than one (got ${read.wide.badgeWidth} vs ${read.control.badgeWidth})`
    );
    assert.ok(
      read.wide.labelWidth < read.control.labelWidth,
      'and the extra width comes out of the LABEL track, which is what `minmax(0, 1fr)` is for'
    );
    assert.ok(read.wide.badgeInsideRow, 'the badge stays inside its own row');
    assert.ok(read.wide.badgeClearsLabel, 'in the trailing track, never over the label');

    // The label degrades by WRAPPING AT A SPACE and then by ellipsis.
    assert.ok(read.wide.lines >= 2, 'a long multi-word label wraps at its spaces');
    assert.equal(
      read.oneWord.lines,
      1,
      'a label too wide for its track stays on ONE line rather than breaking mid-word'
    );
    assert.ok(read.oneWord.clipped, 'and is clipped, which is what `text-overflow` ellipsises');
    assert.notEqual(
      read.oneWord.wrap,
      'anywhere',
      '`anywhere` is what produced the reported mid-word break'
    );
    assert.equal(read.short.lines, 1, 'a short label needs neither');
    assert.equal(read.short.clipped, false);

    // THE ROW GROWS rather than clipping.
    assert.ok(
      read.wide.rowHeight > read.short.rowHeight,
      `a wrapped label grows its row (got ${read.wide.rowHeight} vs ${read.short.rowHeight})`
    );
    assert.equal(read.wide.rowVerticallyClipped, false, 'and nothing is cut off inside it');

    // THE TWO-LINE CASE, measured rather than assumed.
    assert.ok(
      Math.abs(read.wide.badgeCentreY - read.wide.rowCentreY) <= 1,
      'the badge is centred on the ROW, not aligned to the label’s first line'
    );
    assert.ok(
      read.wide.badgeCentreY > read.wide.labelFirstLineBottom,
      'so on a two-line label it sits below the line it counts — the state Decision 8 reopens on'
    );
  } finally {
    await context.close();
  }
});

// AC-17 — the parent row does not regress, expanded and collapsed.
test('the Downtime parent rollup keeps the row’s label on one line, and survives a collapsed rail', async () => {
  assertBadgeFixtureMirrorsComponent();
  const context = await openLayoutContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    // The parent's single trailing track carries EITHER the rollup or the muted chip. Both
    // rows are rendered so the trade is measured rather than asserted: the chip is ≈47.5px
    // and the rollup ≈18-26px, so while the rollup shows the label track GROWS.
    const parentRow = (id, trailing) =>
      `<div class="manager-nav-group" style="position:relative">` +
      `<button class="manager-nav-button manager-nav-parent manager-world-nav-item" id="${id}">` +
      `<i class="fas fa-hourglass-half"></i>` +
      `<span class="manager-nav-label">Downtime</span>` +
      trailing +
      `</button>` +
      `<button class="manager-nav-toggle" id="${id}-toggle">` +
      `<i class="fas fa-chevron-down"></i></button></div>`;
    const rollup =
      `<span class="manager-nav-issue-badge" data-world-downtime-badge-total role="img" ` +
      `aria-label="5 updates">5</span>`;
    const chip = `<span class="manager-nav-premium is-installed">PREMIUM</span>`;
    const nav =
      `<section class="manager-world-nav">` +
      parentRow('rollup', rollup) +
      parentRow('chip', chip) +
      `</section>`;


    await page.setContent(railPage(nav));
    const expanded = await page.evaluate(() => {
      const of = (id, markSelector) => {
        const row = document.getElementById(id);
        const label = row.querySelector('.manager-nav-label');
        const mark = row.querySelector(markSelector);
        const toggle = document.getElementById(id + '-toggle');
        const range = document.createRange();
        range.selectNodeContents(label);
        const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
        const rowBox = row.getBoundingClientRect();
        const markBox = mark.getBoundingClientRect();
        const toggleBox = toggle.getBoundingClientRect();
        return {
          lines: lines.size,
          clipped: label.scrollWidth > label.clientWidth,
          labelWidth: +label.getBoundingClientRect().width.toFixed(1),
          markDisplay: getComputedStyle(mark).display,
          markWidth: +markBox.width.toFixed(1),
          markHeight: +markBox.height.toFixed(1),
          markInsideRow:
            markBox.left >= rowBox.left - 0.5 &&
            markBox.right <= rowBox.right + 0.5 &&
            markBox.top >= rowBox.top - 0.5 &&
            markBox.bottom <= rowBox.bottom + 0.5,
          overlapsToggle:
            markBox.right > toggleBox.left + 0.5 &&
            markBox.left < toggleBox.right - 0.5 &&
            markBox.bottom > toggleBox.top + 0.5 &&
            markBox.top < toggleBox.bottom - 0.5,
        };
      };
      return {
        rollup: of('rollup', '[data-world-downtime-badge-total]'),
        chip: of('chip', '.manager-nav-premium'),
      };
    });

    assert.equal(
      expanded.rollup.lines,
      1,
      'the shipped Downtime label still renders on ONE line with the rollup in the track'
    );
    assert.equal(expanded.rollup.clipped, false, 'and unclipped at the shipped 220px rail');
    assert.ok(expanded.rollup.markInsideRow, 'the rollup sits inside the parent button');
    assert.ok(
      !expanded.rollup.overlapsToggle,
      'and clears the disclosure toggle, which is a `position: absolute` sibling at `right: 4px` ' +
        'with 36px of padding reserved for it'
    );
    assert.ok(
      expanded.rollup.labelWidth > expanded.chip.labelWidth,
      `the rollup is narrower than the chip it replaces, so the label track GROWS while it ` +
        `shows (got ${expanded.rollup.labelWidth} vs ${expanded.chip.labelWidth})`
    );

    // COLLAPSED. `.manager-nav-button` becomes a single centred column.
    await page.setContent(railPage(nav, ' is-rail-collapsed'));
    const collapsed = await page.evaluate(() => {
      const of = (id, markSelector) => {
        const row = document.getElementById(id);
        const label = row.querySelector('.manager-nav-label');
        const mark = row.querySelector(markSelector);
        const toggle = document.getElementById(id + '-toggle');
        const range = document.createRange();
        range.selectNodeContents(label);
        const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
        const rowBox = row.getBoundingClientRect();
        const markBox = mark.getBoundingClientRect();
        const toggleBox = toggle.getBoundingClientRect();
        return {
          lines: lines.size,
          clipped: label.scrollWidth > label.clientWidth,
          labelWidth: +label.getBoundingClientRect().width.toFixed(1),
          markDisplay: getComputedStyle(mark).display,
          markWidth: +markBox.width.toFixed(1),
          markHeight: +markBox.height.toFixed(1),
          markInsideRow:
            markBox.left >= rowBox.left - 0.5 &&
            markBox.right <= rowBox.right + 0.5 &&
            markBox.top >= rowBox.top - 0.5 &&
            markBox.bottom <= rowBox.bottom + 0.5,
          overlapsToggle:
            markBox.right > toggleBox.left + 0.5 &&
            markBox.left < toggleBox.right - 0.5 &&
            markBox.bottom > toggleBox.top + 0.5 &&
            markBox.top < toggleBox.bottom - 0.5,
        };
      };
      return {
        rollup: of('rollup', '[data-world-downtime-badge-total]'),
        chip: of('chip', '.manager-nav-premium'),
      };
    });

    assert.equal(
      collapsed.chip.markDisplay,
      'none',
      'the collapsed rail really did apply: it names `.manager-nav-premium` in its hide rule'
    );
    assert.notEqual(collapsed.rollup.markDisplay, 'none', 'and the rollup survives that hide');
    assert.ok(
      collapsed.rollup.markWidth > 0 && collapsed.rollup.markHeight > 0,
      `the rollup is a real box on a 56px rail (got ${collapsed.rollup.markWidth}x${collapsed.rollup.markHeight})`
    );
    assert.ok(
      collapsed.rollup.markInsideRow,
      'and stays inside the parent button, which grows from its 36px floor to hold it'
    );
  } finally {
    await context.close();
  }
});

test('the companion Downtime panel states a height at every link, which Chromium alone cannot gate', () => {
  // MEASUREMENT CANNOT PROVE THIS ONE, and saying so is the point of a separate test.
  const hash = downtimeHostScoped.hashClass;
  for (const selector of ['.downtime-extension-panel', '.downtime-extension-target']) {
    const rule = blockIn(downtimeHostScoped.css, `${selector}.${hash}`);
    assert.ok(rule, `${selector} should own a rule in the host's scoped CSS`);
    // ANCHORED. `/height:\s*100%/` is also satisfied by `min-height: 100%`.
    assert.match(
      rule,
      /(^|[;{\s])height:\s*100%/,
      `${selector} must state its own height — Chromium's propagation hides its absence`
    );
  }
});

test("the companion Downtime panel hands over the Manager pane's whole height, at every width", async () => {
  // The full ladder, because the block-size guarantee is what a companion's own `height: 100%`
  // rests on, and `styles/fabricate.css` exempts this route from the shared `.manager-body`
  // stack inside `@container fabricate-manager (max-width: 1120px)`. That exemption is the ONLY
  // reason the host stays a definite-height grid below 1120px instead of becoming content-sized,
  // which would silently invert every companion's percentage height into a page-length scroll.
  for (const managerWidth of MANAGER_WIDTH_LADDER) {
    const read = await readCompanionPanelChain(managerWidth, companionShort);
    const at = `at ${managerWidth}px`;
    assert.equal(
      read.target,
      read.panels,
      `the target is the panel's whole content box ${at} (got ${read.target} vs ${read.panels})`
    );
    assert.equal(
      read.region,
      read.panels,
      `the panel region fills that box too ${at} (got ${read.region} vs ${read.panels})`
    );
    // The link the one-track host grid buys, and the one a vacuous equality hides.
    assert.equal(
      read.panels,
      read.host,
      `and the panel row is the host's whole content box ${at} (got ${read.panels} vs ${read.host})`
    );
    assert.equal(
      read.host,
      read.main,
      `and the host fills the Manager pane ${at} (got ${read.host} vs ${read.main})`
    );
    assert.ok(
      read.main > 400,
      `the pane is a REAL height ${at}, not a collapsed one every link agrees on (${read.main})`
    );
    assert.equal(
      read.companion,
      read.target,
      `so a companion root asking for height: 100% actually gets it ${at}`
    );
  }
});

test('the companion Downtime panel is a bare box whose inline size is not guaranteed', async () => {
  const widths = [];
  for (const managerWidth of MANAGER_WIDTH_LADDER) {
    const read = await readCompanionPanelChain(managerWidth, companionShort);
    widths.push(read.targetWidth);
    assert.equal(read.targetPadding, '0px 0px 0px 0px', 'the companion supplies its own inset');
    assert.equal(read.targetOverflow, 'visible visible', 'and its own scroller, if it wants one');
    assert.equal(read.targetContainerType, 'normal', 'Core imposes no CSS container on it');
    // Core's own `12px 20px 24px` is GONE. It lived on the panels row, not on the target.
    assert.equal(read.insetTop, 0, `the target starts at the top of the host at ${managerWidth}px`);
    assert.equal(read.insetLeft, 0, `and at its left edge at ${managerWidth}px`);
    assert.equal(
      read.targetWidth,
      read.hostWidth,
      `so the companion is handed the host's whole inline box at ${managerWidth}px`
    );
  }
  // Core enforces no minimum Manager size and makes no no-horizontal-overflow promise for this
  // panel, explicitly unlike the player seam's enforced 1024x640 floor. Pin the ladder so the
  // contract's "not guaranteed" is a measured fact rather than a caveat nobody checked.
  assert.ok(
    widths.every((width, index) => index === 0 || width < widths[index - 1]),
    `the target's inline size tracks the window all the way down (${widths.join(' -> ')})`
  );
  assert.ok(widths.at(-1) < 400, `and reaches a genuinely narrow box (${widths.at(-1)}px)`);
});

test('Core keeps the Downtime panel scroller for a visibly overflowing companion, and only then', async () => {
  // Every case below states `height: 100%` on the companion root.
  const visible = await readCompanionPanelChain(
    1400,
    companionRoot('display:block', companionRows)
  );
  assert.equal(
    visible.panelsOverflowY,
    'auto',
    'Core keeps a real scroller on the panel row, not a clip that swallows the overflow'
  );
  assert.ok(
    visible.panelScrolls,
    `a full-height companion overflowing VISIBLY still scrolls (${visible.panelsScrollHeight} vs ${visible.panels})`
  );

  const nonShrinking = await readCompanionPanelChain(
    1400,
    companionRoot(
      'display:flex;flex-direction:column',
      '<div style="height:2400px;flex-shrink:0">tall</div>'
    )
  );
  assert.ok(
    nonShrinking.panelScrolls,
    'a flex column whose child cannot shrink overflows visibly too, and still scrolls'
  );

  // The confound, pinned so it cannot be reintroduced as a probe.
  const shrinkable = await readCompanionPanelChain(
    1400,
    companionRoot('display:flex;flex-direction:column', '<div style="height:2400px">tall</div>')
  );
  assert.equal(
    shrinkable.panelsOverflows,
    false,
    'a shrinkable child is SQUASHED rather than scrolled -- this is flex-shrink, not height'
  );
  assert.equal(
    shrinkable.panels,
    shrinkable.panelsScrollHeight,
    'nothing overflowed at all, which is why the earlier probe measured no scroll'
  );

  const ownScroller = await readCompanionPanelChain(
    1400,
    companionRoot('overflow:auto', companionRows)
  );
  assert.equal(
    ownScroller.panelsOverflows,
    false,
    'and a companion absorbing its own content with a non-visible overflow makes Core inert'
  );

  // The height stays OPT-IN either way.
  const noHeight = await readCompanionPanelChain(
    1400,
    '<div id="companion-root"><p style="margin:0">no height stated</p></div>'
  );
  assert.ok(
    noHeight.companion < 100 && noHeight.target > 400,
    `a companion stating no height keeps content height in a full-height target (${noHeight.companion} in ${noHeight.target})`
  );
});

test("Core's preview keeps its own two-track host, with the tab strip on the bottom edge", async () => {
  // CORE-FALLBACK HAD NO `npm test` LAYOUT GATE AT ALL (issue 1213 review).
  // was exercised only by Playwright frames — so this rung states what a free user actually
  // gets: the strip on the bottom edge and the preview scroller taking everything above it.
  const read = await readCoreFallbackHostRows(1400);
  assert.equal(read.strip, 44, 'the strip takes its own content height in the `auto` track');
  assert.equal(read.stripBottomGap, 0, 'and sits on the bottom edge of the host');
  assert.equal(
    read.scroll,
    read.host - read.strip,
    `the preview scroller takes the rest (${read.scroll} of ${read.host} beside a ${read.strip} strip)`
  );
  assert.ok(read.scrollScrolls, 'and it still scrolls its own overflowing preview content');
});