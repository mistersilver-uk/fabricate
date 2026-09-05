/*
 * THE SYSTEM COMPONENT RULES LIST, RENDERED IN A REAL BROWSER (issue 1371 r16-list, maintainer
 * ruling M22; r18-list, maintainer ruling M28).
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────────────────
 * Both of the defects it measures are CASCADE facts — which declaration a box's edge actually
 * resolves to — and happy-dom computes no layout, so the only place either can be measured is a
 * browser laying out the shipped markup under the shipped stylesheets. This follows
 * `world-component-catalogue-rendered.test.js`: MOUNT the real `ComponentsBrowserView` through the
 * shared harness, ship its `innerHTML` into Chromium inside the manager shell it renders in, and
 * read the boxes.
 * M22: the maintainer's live test found the toolbar card's LAST row — `Select all · GROUP BY
 * CATEGORY · SORT BY · N of M catalogue entries` — sitting flush against the card's bottom border
 * while the gap above it was the toolbar's ordinary row gap. The rule that shipped it said in its
 * own comment that the second row "already carries its own bottom margin"; no rule anywhere gave it
 * one.
 * M28: rows reading `No description` drew their medallion shunted to the middle of the row while
 * rows with a description sat flush. The row's identity is a `<button>`, and Foundry's own chrome
 * centres a button's content — measured on the harvested 14.365 sheet: the identity resolved
 * `justify-content: center` under it and `normal` without it. The module sheet set the button to
 * `display: flex` without saying where its content sits, and the copy column beside the medallion
 * was `flex: 0 1 auto`, so on a short description the pair floated to the centre of whatever
 * width the row left them. The shell here lays a stand-in for that chrome rule BEFORE the module
 * sheet, exactly where Foundry's sits, so the assertion holds under the arrangement the maintainer
 * photographed; where the harvested chrome is on disk the same measurement runs under the real
 * sheet too.
 * ── THE NEGATIVE CONTROLS ARE IN THE FILE ────────────────────────────────────────────────
 * A geometry assertion that has never been seen to fail is indistinguishable from one that
 * measures nothing. Each ruling's second page load re-declares the rule the defect shipped under,
 * and the suite asserts the defect comes back — reproduced on every CI execution rather than
 * pasted once.
 * ── SKIP POLICY, AND WHERE THE SKIPPED ARM RUNS IN CI ────────────────────────────────────
 * (issue 1371 r19-gates2, quality review round 5 Q2; the pattern and the wording follow
 * `tests/view-lab-fixture-assets.test.js`.)
 * The M28 arm that lays FOUNDRY'S OWN harvested sheet skips where no harvest exists, because
 * `npm test` must stay runnable without a Foundry licence — and `.foundry-chrome/` is a licensed
 * local artefact, so `ci.yml`'s `npm test` runner never holds one. A skip policy without a place
 * the skip cannot be taken is a guard that executes nowhere: the runner that DOES harvest is
 * `pr-screenshots.yml`'s capture job, and this file is named on its "Verify the harvested chrome
 * still matches, and every lab asset path resolves in it" step, beside
 * `view-lab-chrome-drift.test.js` and `view-lab-fixture-assets.test.js`, under that step's
 * `VIEWLAB_REQUIRE_CHROME=1`. Moving or renaming that step without moving this file leaves the
 * real-sheet arm running nowhere again.
 * `VIEWLAB_REQUIRE_CHROME=1` turns the skip into a failure, so a machine that is supposed to hold
 * a cache cannot report a green run that measured nothing.
 * AND THE STAND-IN IS ITSELF MEASURED. `FOUNDRY_BUTTON_CHROME` below is a hand transcription of
 * one line of Foundry's sheet, and until r19 nothing checked it against the real thing: emptied,
 * the whole suite stayed green, because the test that claimed to guard it was reading the
 * CONTROL's own `!important`. Two arms now measure a BARE `<button>` under each chrome with no
 * module sheet at all — the stand-in must centre one, and the harvested sheet must agree with it —
 * so a Foundry release that drops the rule, or a transcription that drifts from it, fails loudly
 * instead of silently disarming the arm that carries the claim in CI.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { before, describe, it, test } from 'node:test';

import { chromium } from 'playwright';

import { resolveChromeCache } from '../../scripts/lib/foundryChromeCache.js';
import { createComponentsBrowserViewHarness } from '../helpers/componentScopeMountModules.js';
import { collectScopedCss, managerShellPage } from '../helpers/renderedManagerShell.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

const { harness, compiledModules } = createComponentsBrowserViewHarness({
  repoRoot,
  tmpPrefix: 'fabricate-components-rendered-',
});

// Wide enough that `.manager-body` keeps its columns: the sheet stacks the list over the
// inspector at or below 1120px of container width, and a stacked toolbar is not the one the
// maintainer measured.
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

/**
 * THE CHROME STAND-IN (M28). Foundry's sheet centres a button's content; this is that one fact at
 * element specificity, laid before the module sheet where Foundry's own sits. The module rule that
 * closes M28 has to beat it the way it beats the real one — by declaring the property at all.
 */
const FOUNDRY_BUTTON_CHROME = `
  button { display: inline-flex; align-items: center; justify-content: center; }
`;

/*
 * M28's fix is TWO declarations, one per cause, and each half is re-declared away on its own below
 * as well as together (issue 1371 r19-gates2, quality review round 5 Q7). Until r19 only the PAIR
 * was laid, and either declaration could be deleted with the suite green — the sheet's "two
 * declarations, one per cause" was a claim no arrangement measured.
 *
 * What the three arrangements say, measured rather than reasoned: each declaration ALONE still
 * draws the medallion flush, because either cause is sufficient on its own to leave no free space
 * for the content to float in — so the pair is defence in depth rather than two halves of one
 * fix — and each declaration is the only thing closing ITS OWN cause, which is why deleting either
 * now reddens the suite.
 */

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

/** The harvested Foundry chrome, when a local harvest exists; `''` otherwise (CI runs no harvest). */
function harvestedChromeCss() {
  const cache = resolveChromeCache(repoRoot);
  const sheet = cache ? join(cache.dir, 'css', 'foundry2.css') : '';
  return sheet && existsSync(sheet) ? readFileSync(sheet, 'utf8') : '';
}

const HARVEST_HINT = 'run: npm run viewlab:chrome:harvest';
/** Resolved ONCE, so the skipped arm, the mirror check and the CI guard all read one fact. */
const harvestedChrome = harvestedChromeCss();

// See the SKIP POLICY block at the head of this file: on the runner that harvests, the skip is a
// failure rather than a quietly green run that measured nothing.
if (!harvestedChrome && process.env.VIEWLAB_REQUIRE_CHROME === '1') {
  test('a harvested Foundry chrome is present (VIEWLAB_REQUIRE_CHROME=1)', () => {
    assert.fail(`no css/foundry2.css under .foundry-chrome/, but VIEWLAB_REQUIRE_CHROME=1; ${HARVEST_HINT}`);
  });
}

const WORKFLOW_PATH = '.github/workflows/pr-screenshots.yml';
const SUITE_PATH = 'tests/components/components-browser-rendered.test.js';
/** The step this file's SKIP POLICY names, quoted verbatim from the workflow. */
const CHROME_STEP_NAME = 'Verify the harvested chrome still matches, and every lab asset path resolves in it';

/**
 * That step's own YAML, sliced out by indentation.
 *
 * A docblock saying "and it runs HERE in CI" is a hand-maintained mirror of another file, and the
 * defect it exists to prevent — round-3 F2, a chrome-dependent guard that executed on no runner —
 * is exactly what a stale mirror re-opens. Read rather than asserted, so a step that is renamed,
 * deleted or emptied of this file fails here at test time.
 *
 * The workflow is read as TEXT: `js-yaml` is a transitive dependency of this repo's toolchain
 * rather than a declared one, and a guard is not worth a new npm dependency.
 */
function chromeDependentStep() {
  const lines = readFileSync(resolve(repoRoot, WORKFLOW_PATH), 'utf8').split('\n');
  const start = lines.findIndex((line) => line.trim() === `- name: ${CHROME_STEP_NAME}`);
  if (start === -1) return null;
  const marker = lines[start].indexOf('- ');
  const after = lines.findIndex((line, index) => index > start && line.indexOf('- ') === marker && line.trim().startsWith('- '));
  return lines.slice(start, after === -1 ? lines.length : after).join('\n');
}

/**
 * A BARE `<button>` under one chrome sheet and NOTHING else — no module sheet, no scoped blocks.
 *
 * This is how the hand-written stand-in stops being an unguarded mirror: the one fact it
 * transcribes is read off it here, and off Foundry's own sheet in the same arrangement, so the two
 * can be compared instead of assumed equal.
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

function page(productMarkup, scopedCss, { chrome = '', control = '' } = {}) {
  return managerShellPage({
    fabricateCss,
    view: 'components',
    productMarkup,
    scopedCss,
    chrome,
    control,
    hostWidth: HOST_WIDTH_PX,
    hostHeight: HOST_HEIGHT_PX,
  });
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

/**
 * The band, its two rows and the space between and under them, as laid out.
 *
 * `paddingBottom` is read as the computed value so the assertion can say which declaration won,
 * and `spaceBelowLastRow` is the geometric fact a GM sees: the distance from the last row's
 * border-box bottom to the band's own border-box bottom, border included.
 */
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

/**
 * Where each row's medallion sits against the row's leading edge, as laid out.
 *
 * `leadInset` is the fact a GM sees: the distance from the selection box's trailing edge to the
 * medallion's leading edge, which the reference draws as ONE row gap on every row whatever its
 * description says. `identityInset` separates the two ways it can go wrong — the button itself
 * moving, or the button staying put and its content floating inside it.
 *
 * `justifyContent` and `copySlack` are M28's TWO CAUSES read directly, one each: which declaration
 * won the identity's alignment, and how much free space the copy column left beside it for the
 * content to float in. The leading edge holds while EITHER is closed, so measuring the edge alone
 * cannot tell whether both declarations are still doing their job (issue 1371 r19-gates2, Q7).
 */
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

describe('this suite runs on the one CI runner that harvests a chrome (issue 1371 r19-gates2, Q2)', () => {
  it('is named on pr-screenshots.yml’s chrome-dependent step, under VIEWLAB_REQUIRE_CHROME and --conditions=browser', () => {
    const step = chromeDependentStep();
    assert.ok(
      step,
      `${WORKFLOW_PATH} no longer carries a step named "${CHROME_STEP_NAME}" — this file's SKIP POLICY quotes it, and the harvested-sheet arm now runs nowhere in CI`
    );
    assert.ok(
      step.includes(SUITE_PATH),
      `${WORKFLOW_PATH}'s "${CHROME_STEP_NAME}" step no longer runs ${SUITE_PATH}, so its M28 claim is carried in CI by the hand-written stand-in alone`
    );
    assert.match(step, /VIEWLAB_REQUIRE_CHROME: '1'/, `that step no longer sets VIEWLAB_REQUIRE_CHROME=1, so a missing harvest would skip rather than fail`);
    assert.match(step, /--conditions=browser/, `that step no longer passes --conditions=browser, so every mount in this file fails with "mount(...) is not available on the server"`);
  });
});

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
    // Proves the assertion above can fail: the same markup under the rule the defect shipped
    // with must reproduce the defect the maintainer photographed.
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
      // ONE ROW WITH NO DESCRIPTION AND ONE WITH A LONG ONE, because the defect only showed on the
      // first: a long description filled the copy column and hid where the content would float.
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

      // The stand-in's fidelity, measured rather than trusted: a BARE button under each chrome
      // alone, so what is read back is the chrome's own arbitration and nothing else's.
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

  /**
   * M28's two causes, each read off the shipped row: the identity states its own alignment, so no
   * host sheet re-arbitrates it, AND the copy takes the free space, so there is none to float in.
   * The flush edge above survives either one on its own, which is why the pair needs saying here.
   */
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
    // Non-vacuity for the CONTROL: the identity's `justify-content` is being ARBITRATED, so the
    // arrangement that re-declares the defect must be seen to have re-declared it. The property is
    // read off the shipped row rather than assumed.
    assert.equal(
      centred[0].justifyContent,
      'center',
      'the control did not centre the identity, so the negative half below proves nothing'
    );
  });

  it('THE MIRROR: the hand-written chrome stand-in centres a bare button, which is the one fact it transcribes', () => {
    // Emptied, this line used to leave the whole suite green (Q2): the test that claimed to guard
    // it was reading the CONTROL's own `!important`, not the stand-in. Measured here on a page
    // carrying the stand-in and NOTHING else, so only the stand-in can produce the answer.
    assert.deepEqual(
      standInBareButton,
      { display: 'inline-flex', justifyContent: 'center', alignItems: 'center' },
      'the stand-in does not centre a bare button, so every arrangement laid under it proves nothing about Foundry'
    );
  });

  it('THE MIRROR: and Foundry’s own harvested sheet agrees with it, where a local harvest exists', { skip: !chrome && 'no local Foundry chrome harvest (.foundry-chrome)' }, () => {
    // The drift this catches is a Foundry release that stops centring a button's content: the
    // stand-in would then describe a chrome nobody ships, and the CI arm below would be measuring
    // a defect that no longer exists. Compared rather than restated, so one fact is pinned once.
    assert.equal(
      foundryBareButton.justifyContent,
      standInBareButton.justifyContent,
      `Foundry ${resolveChromeCache(repoRoot)?.version} resolves a bare button to justify-content: ${foundryBareButton.justifyContent}, the stand-in to ${standInBareButton.justifyContent} — the transcription has drifted from the sheet`
    );
    assert.equal(
      foundryBareButton.alignItems,
      standInBareButton.alignItems,
      `Foundry ${resolveChromeCache(repoRoot)?.version} resolves a bare button to align-items: ${foundryBareButton.alignItems}, the stand-in to ${standInBareButton.alignItems}`
    );
  });

  it('draws the medallion one row gap after the box on BOTH rows under a chrome that centres buttons (M28)', () => {
    assertFlush(honest, 'chrome stand-in');
    assertBothCausesClosed(honest, 'chrome stand-in');
  });

  it('and under the harvested Foundry sheet itself, where a local harvest exists', { skip: !chrome && 'no local Foundry chrome harvest (.foundry-chrome)' }, () => {
    const label = `foundry chrome ${resolveChromeCache(repoRoot)?.version}`;
    assertFlush(underFoundry, label);
    assertBothCausesClosed(underFoundry, label);
  });

  it('holds the edge on the identity’s own alignment alone, which is the only thing closing the chrome’s cause', () => {
    // The copy's grow re-declared away: the edge still holds, because the identity packs its
    // content to the start — and the free space the copy stopped taking is now measurable beside
    // it, which is the cause this declaration does NOT close.
    assertFlush(withoutCopyGrow, 'without the copy’s grow');
    const bare = withoutCopyGrow.find((row) => row.id === 'bare');
    assert.equal(bare.justifyContent, 'flex-start', 'the identity’s own alignment is what is holding the edge here');
    assert.ok(
      bare.copySlack > 40,
      `the control left only ${bare.copySlack}px of free space beside the copy — it did not remove the grow, so this arrangement proves nothing`
    );
  });

  it('and on the copy’s grow alone, which is the only thing closing the free-space cause', () => {
    // The identity's own alignment re-declared away: the chrome wins the alignment, and the edge
    // still holds only because the copy leaves no free space for the content to float in.
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
    // The defect the maintainer photographed: the bare row's content mid-row, the described row's
    // nearer the edge but still adrift, under the same chrome. A measurement that could not see
    // this would pass the arrangement above for nothing.
    const bare = centred.find((row) => row.id === 'bare');
    assert.ok(
      bare.leadInset > bare.gap + 40,
      `under the control the bare row's medallion still sits ${bare.leadInset}px after the box — the measurement cannot see the shunt`
    );
  });
});
