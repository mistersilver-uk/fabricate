/**
 * Recipe browser, tag requirement and requirement-picker layout, measured in a real browser (issue 1670).
 *
 * A surface module of `manager-layout.test.js`. It registers its tests on import and owns no
 * browser: `tests/helpers/layout-harness.js` holds the one Chromium every surface shares.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scopedComponentCss, withScopeHash } from '../helpers/scoped-component-css.js';
import { declaration } from '../helpers/fullWidthRoute.js';
import { openLayoutContext } from '../helpers/layout-harness.js';

import {
  blockFor,
  chipCss,
  chipScoped,
  css,
  stepperScoped,
  withChipHash,
} from './manager-layout-shared.js';
import {
  OR_MENU_GLYPHS,
  OR_MENU_KINDS,
  OR_MENU_LABELS,
  assertOneTrackPerGridChild,
  orMenuGroupCardSource,
} from './manager-layout-recipes-fixtures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The recipe library is a list of CARD rows (issue 643), not a column grid. The old
// assertions pinned a recipe-grid column template, the `has-no-category` grid variant and
// the medium-query column stacking — none of which a card row has. What replaces them
// is the pair that actually prevents horizontal overflow: the identity cell is the ONLY
// shrinkable flex child, and the control cluster never shrinks.
//
// The absence assertion on that retired column template is GONE (issue 1399). Its needle
// was a legacy generation name the sheet had already stopped declaring, so it could only
// ever pass; `tests/token-generation-gate.test.js` bans the whole name shape from a
// population that is not empty, which is the same guarantee from a gate that can fail.
test('manager recipes browser defines a non-overflowing card row', () => {
  const tableBlock = blockFor('.fabricate-manager .manager-recipes-table');
  const rowBlock = blockFor('.fabricate-manager .manager-recipe-row');
  const identityBlock = blockFor('.fabricate-manager .manager-recipe-row .manager-recipe-identity');
  const clusterBlock = blockFor('.fabricate-manager .manager-recipe-cluster');
  const groupListBlock = blockFor('.fabricate-manager .manager-recipe-group-list');

  assert.ok(tableBlock.includes('display: flex;'), 'the recipes table stacks its category groups');
  // A single column header sits above the whole list (issue 643). It mirrors the row's
  // flex split (identity + cluster) and its cluster shares the row cluster's fixed
  // template, so the labels line up with the cells beneath them.
  const headBlock = blockFor('.fabricate-manager .manager-recipe-table-head');
  assert.ok(headBlock.includes('display: flex;'), 'the column header mirrors the row flex split');
  const headClusterBlock = blockFor('.fabricate-manager .manager-recipe-head-cluster');
  assert.ok(
    headClusterBlock.includes('grid-template-columns: var(--fab-recipe-cluster-cols);'),
    'the header cluster shares the row cluster column template so the two align'
  );
  assert.ok(
    clusterBlock.includes('grid-template-columns: var(--fab-recipe-cluster-cols);'),
    'the row cluster consumes the same shared column template'
  );
  // The header hides at the stacked breakpoint, where a column header over a stack of
  // cards means nothing — it rides the same rule as the other browsers' table heads.
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-table-head,\n  .fabricate-manager .manager-recipe-table-head {\n    display: none;'
    ),
    'the recipe column header hides at the stacked breakpoint alongside the shared table head'
  );
  assert.ok(rowBlock.includes('display: flex;'), 'the recipe row is a flex card');
  assert.ok(rowBlock.includes('min-width: 0;'), 'the recipe row may shrink inside the main column');
  assert.ok(
    identityBlock.includes('flex: 1 1 0;') && identityBlock.includes('min-width: 0;'),
    'the identity cell is the row content that gives way'
  );
  assert.ok(
    clusterBlock.includes('flex-shrink: 0;'),
    'the control cluster (lock / enable / edit) must never be squeezed'
  );
  assert.ok(
    groupListBlock.includes('list-style: none;'),
    'the rows render as a real, unstyled list'
  );

  // The recipe row LEFT the shared 76px row-card geometry group: it is a denser card at
  // 11px/12px and radius 9 (~62px tall), so a page of recipes shows more of the library
  // and less of the gaps between it. The COMPONENT row followed it (issue 676, ruling 1:
  // where the Component Studio and the Recipe Studio disagree, the Recipe Studio wins).
  // The other three browser rows keep the 76px group — this change never visited them.
  assert.ok(
    css.includes(
      '.fabricate-manager .manager-environment-row,\n.fabricate-manager .manager-gathering-task-row,\n.fabricate-manager .manager-essence-row {\n  width: 100%;\n  min-height: 76px;'
    ),
    'environment, gathering task, and essence rows keep the shared 76px row height'
  );
  for (const row of ['manager-recipe-row', 'manager-component-row']) {
    assert.equal(
      new RegExp(`\\.${row},\\n[^{]*min-height: 76px`).test(css),
      false,
      `the ${row} must not still be in the 76px geometry group`
    );
  }
  assert.ok(rowBlock.includes('min-height: 62px;'), 'the recipe row is the denser library card');
  assert.ok(
    rowBlock.includes('padding: 11px 12px;'),
    'the recipe row uses the library card padding'
  );
  // The recipe row's own radius (9px) was retired by issue 883: the edge, corner and fill
  // are the ONE browser-row treatment now, so the row block must declare none of them.
  // Asserting their ABSENCE is what stops the copy being written back in.
  assert.equal(
    /border-radius:|border: 1px|background:/.test(rowBlock),
    false,
    'the recipe row must not restate the shared browser-row edge, corner or fill'
  );

  // A disabled row reads at .55, not .62 — far enough back that a page of rows separates
  // at a glance into what is live and what is not.
  assert.ok(
    blockFor('.fabricate-manager .manager-recipe-row.is-off').includes('opacity: 0.55;'),
    'a disabled row recedes'
  );

  // Selection is the accent BORDER. A ring plus an inset left bar is the same statement
  // made twice, and the bar bit into the row's medallion. The COMPONENT row joined the
  // opt-out in issue 676: it now leads with the same Medallion, so it had the same defect.
  // The ESSENCE row joined in issue 1036 on the same precondition — its redesign gave it
  // the 40px Medallion lead — and it is also the only one of the three that renders as a
  // GRID CARD, where an inset left bar is not even the right axis. The environment and
  // gathering-task rows are deliberately NOT here: they still lead differently.
  assert.ok(
    blockFor(
      '.fabricate-manager .manager-recipe-row.is-selected,\n.fabricate-manager .manager-component-row.is-selected,\n.fabricate-manager .manager-essence-row.is-selected'
    ).includes('box-shadow: none;'),
    'the selected recipe, component and essence rows ring in the accent and add no left bar'
  );
  for (const row of ['manager-environment-row', 'manager-gathering-task-row']) {
    assert.equal(
      css.includes(`.fabricate-manager .${row}.is-selected,\n`) ||
        css.includes(`.fabricate-manager .${row}.is-selected {`),
      true,
      `${row} still declares the shared selected treatment`
    );
    assert.equal(
      new RegExp(`\\.${row}\\.is-selected[^{]*\\{[^}]*box-shadow: none`).test(css),
      false,
      `${row} keeps the inset bar — it was not re-skinned by the essence change`
    );
  }
});

// The collapse ladder (issue 643 §8). Drop order is fixed and monotonic, and the
// lock / enable / edit controls are never in it.
//
// The ladder measures the ROW's own container, not the manager. `.manager-body` is
// `220px + 1fr + 300px` above 1120px and only collapses to one column at or below it,
// so a manager-keyed ladder fired NONE of its steps in the 1121-1280px band — exactly
// where the row is at its narrowest (~570-760px) — and every step once the layout
// stacked, where the row has the whole window. Keying it to `.manager-recipes-table`
// makes each step fire when the row is actually short of room.
test('manager recipe row collapses in the specified order and never drops its controls', () => {
  const tableBlock = blockFor('.fabricate-manager .manager-recipes-table');
  assert.ok(
    tableBlock.includes('container-type: inline-size;') &&
      tableBlock.includes('container-name: fabricate-recipes;'),
    'the row ladder needs a container that measures the ROW, not the whole manager'
  );

  // The ladder's old fourth rung dropped the switch's "On"/"Off" text at 440px. That text
  // is no longer rendered in the row at all — the track colour is the state, the aria-label
  // names it, and the Disabled pill says it in words — so the rung is gone rather than left
  // as a rule matching nothing.
  // Each rung moved out by 34px for issue 1010 — the 22px bulk selection track plus one
  // more 12px grid gap — so every band gives the identity cell exactly the room it did
  // before. Holding the thresholds fixed would have spent the identity's own budget on the
  // checkbox; the arithmetic is stated beside the ladder in the sheet.
  const LADDER = [
    [714, '.fabricate-manager .manager-recipe-row .manager-recipe-description'],
    [634, '.fabricate-manager .manager-recipe-row .manager-recipe-io'],
    [554, '.fabricate-manager .manager-recipe-row .manager-recipe-check'],
  ];

  for (const [width, selector] of LADDER) {
    const query = css.slice(css.indexOf(`@container fabricate-recipes (max-width: ${width}px)`));
    assert.ok(query.length > 0, `a ${width}px recipe-container query should exist`);
    const rule = query.slice(query.indexOf(selector));
    assert.ok(
      query.includes(selector) && rule.slice(0, rule.indexOf('}')).includes('display: none;'),
      `${selector} should drop at ${width}px of ROW width`
    );
  }

  assert.equal(
    css.includes('.fabricate-manager .manager-recipe-row .manager-status-toggle-label'),
    false,
    'the row renders no On/Off text, so nothing should still be styled to hide it'
  );

  for (const kept of ['.manager-recipe-lock', '.manager-recipe-status', '.manager-action-group']) {
    assert.equal(
      new RegExp(`\\.manager-recipe-row \\${kept} \\{\\n  display: none;`).test(css),
      false,
      `${kept} must survive every width — it is an operable control`
    );
  }

  // The three status pills are all `white-space: nowrap`, and the identity cell set no
  // overflow: they could spill out of it. The name gives way first; the row clips.
  const nameRowBlock = blockFor('.fabricate-manager .manager-recipe-name-row');
  const nameBlock = blockFor('.fabricate-manager .manager-recipe-name-row .manager-system-name');
  assert.ok(
    nameRowBlock.includes('overflow: hidden;'),
    'the pills cannot escape the identity cell'
  );
  assert.ok(
    nameBlock.includes('flex: 0 1 auto;') && nameBlock.includes('min-width: 0;'),
    'the name is what gives way, so the pills stay readable'
  );
});

// Issue 1010 — the bulk selection column. It is APPENDED to the cluster template rather
// than prepended, and that is what makes the column header's four explicit `grid-column`
// placements survive: a prepend would have shifted every one of them by a track.
//
// The ladder rewrites the template at each rung, so "appended" has to hold in ALL THREE
// declarations — the base and the two rungs — or the checkbox lands under the edit pencil
// at the very widths where the row is tightest.
test('the recipe cluster appends a bulk selection column that the ladder never drops', () => {
  const declarations = [...css.matchAll(/--fab-recipe-cluster-cols:\s*([^;]+);/g)].map(
    ([, value]) => value.replace(/\s+/g, ' ').trim()
  );
  assert.equal(
    declarations.length,
    3,
    "the base template plus the ladder's two rewrites — a fourth would be an unpinned band"
  );

  for (const declaration of declarations) {
    const tracks = [...declaration.matchAll(/var\(--fab-recipe-col-([a-z]+)\)/g)].map(
      ([, name]) => name
    );
    assert.equal(
      tracks.at(-1),
      'select',
      `the select track must be LAST in "${declaration}" — the header placements assume an append`
    );
    // Never dropped: a truncated readout is a compromise, a selection the GM cannot reach
    // is a control that has silently stopped working.
    assert.equal(
      tracks.filter((track) => track === 'select').length,
      1,
      'the select track appears exactly once in every band'
    );
  }

  assert.ok(
    blockFor('.fabricate-manager .manager-recipes-table').includes(
      '--fab-recipe-col-select: 22px;'
    ),
    'the track is the SelectionCheckbox `lg` box, declared rather than derived'
  );
});

// ── EVERY DECLARATION ON THE TAG CHIP'S RULE ACTUALLY WINS (issue 1373) ────────────────────
//
// Regression it started as: chips WERE `<li>`s in a `<ul>` on a second line, and a host
// (Foundry) global list rule giving non-last items a margin-bottom inflated only the first
// chip's box — 34px against the last chip's 30px. Maintainer round 5 moved the chips onto the
// ROW itself (`proto:2254`), so they are `<span>`s and that particular host rule can no longer
// reach them. The hostile `li` rule stays in the fixture as the negative half: it must reach
// nothing.
//
// == WHY THE OLD FIXTURE COULD NOT FAIL, AND WHAT REPAIRED IT ==============================
// It injected `styles/fabricate.css` UNLAYERED and stamped no scoping hash on its chips, which
// is a cascade production has never had. `module.json` registers the sheet with no explicit
// `layer`, so Foundry imports it at `layer(modules)`; `Chip.svelte` ships `css: 'injected'`,
// which lands its block in `document.head` unlayered — and an unlayered author declaration
// beats every layered one at ANY specificity. Unlayered, the sheet's three-class rule won
// everything it declared and the fixture measured a chip nobody renders; layered, four of that
// rule's eight declarations were being discarded in the product with nothing able to say so.
//
// Both halves are needed and both are here now: `@layer modules { … }` around the sheet
// reproduces Foundry's import, `chipCss` after it reproduces the injection order, and
// `withChipHash` stamps the real `svelte-<hash>` so the specificity matches too. Svelte 5 puts
// that hash on the LEADING compound as a real class, which is what makes the primitive's block
// (0,2,0) rather than (0,1,0).
//
// == WHAT IT ASSERTS, AND WHY THAT CANNOT GO VACUOUS =======================================
// Not a hand-listed set of values: it reads the sheet rule's OWN declarations and requires each
// one to win in the composed cascade. A value is compared against a probe carrying that exact
// declaration inline, so `var(--fab-space-chip)` and `4.5rem` resolve the same way for both
// sides and no token is frozen into this file. Add a fifth declaration the primitive already
// owns and this goes red naming the property; delete the rule and the loop reads zero
// declarations, so an explicit floor refuses that too.
test('every declaration on the recipe tag chip rule wins the real cascade', async () => {
  const selector = '.fabricate-manager .manager-chip.manager-recipe-tag-chip {';
  const ruleStart = css.indexOf(selector);
  assert.ok(ruleStart >= 0, 'the tag chip rule is still in the sheet');
  const body = css.slice(ruleStart + selector.length, css.indexOf('}', ruleStart));
  const declarations = body
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const colon = declaration.indexOf(':');
      return { property: declaration.slice(0, colon).trim(), value: declaration.slice(colon + 1).trim() };
    });
  assert.ok(
    declarations.length >= 4,
    'the rule still states the position and size the primitive has no opinion about'
  );

  const context = await openLayoutContext({
    viewport: { width: 760, height: 320 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            @layer modules {
              ${css}
            }
          </style>
          <style>
            ${chipCss}
          </style>
          <style>
            body { margin: 0; padding: 24px; font-family: Arial, sans-serif; }
            /* Simulate a host global list rhythm declared after our stylesheet. */
            li:not(:last-child) { margin-bottom: 4px; }
            .fas::before { content: "x"; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            <span class="manager-recipe-option-tags" data-recipe-option-tags>
              <span class="manager-recipe-tag-policy" data-recipe-tag-policy>Any of</span>
              ${withChipHash(
                '<span class="manager-chip is-tag manager-recipe-tag-chip" data-recipe-tag="reagent"><span>reagent</span><button type="button" class="manager-recipe-tag-remove"><i class="fas fa-times"></i></button></span>' +
                  '<span class="manager-chip is-tag manager-recipe-tag-chip" data-recipe-tag="rare"><span>rare</span><button type="button" class="manager-recipe-tag-remove"><i class="fas fa-times"></i></button></span>'
              )}
            </span>
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate((wanted) => {
      const chips = Array.from(document.querySelectorAll('.manager-recipe-tag-chip'));
      const chip = chips[0];
      // The probe is a CLONE of the chip carrying one declaration inline, so both sides resolve
      // the same tokens in the same place and the comparison is of used values, not of strings.
      const declared = wanted.map(({ property, value }) => {
        const probe = chip.cloneNode(true);
        probe.style.setProperty(property, value);
        chip.parentElement.appendChild(probe);
        const won = getComputedStyle(chip).getPropertyValue(property);
        const asked = getComputedStyle(probe).getPropertyValue(property);
        probe.remove();
        return { property, won, asked };
      });
      return {
        declared,
        chips: chips.map((each) => {
          const style = getComputedStyle(each);
          return {
            marginTop: style.marginTop,
            marginBottom: style.marginBottom,
            height: each.getBoundingClientRect().height,
          };
        }),
      };
    }, declarations);

    for (const { property, won, asked } of report.declared) {
      // A property Chromium cannot serialise would compare '' against '' and pass over an empty
      // domain, which is the failure mode a cascade gate is most likely to acquire silently.
      assert.notEqual(asked, '', `\`${property}\` resolves to a comparable used value`);
      assert.equal(
        won,
        asked,
        `the sheet declares \`${property}\` on the tag chip and it must WIN — the primitive's ` +
          'unlayered block discards a layered declaration of any specificity, so a property ' +
          'this rule and `Chip.svelte` both name is a rule that reads as covered and is not'
      );
    }

    assert.equal(report.chips.length, 2, 'both tag chips should render');
    for (const [index, chip] of report.chips.entries()) {
      assert.equal(
        chip.marginBottom,
        '0px',
        `chip ${index} should have no bottom margin despite the host list rule`
      );
      assert.equal(chip.marginTop, '0px', `chip ${index} should have no top margin`);
    }
    assert.equal(
      report.chips[0].height,
      report.chips[1].height,
      'both chips should derive the same height'
    );
  } finally {
    await context.close();
  }
});

test('the tag requirement row keeps its arm whole, and an EMPTY one is a row like any other', async () => {
  // REPLACES `recipe tag list spans the full row width on its own line below the controls`
  // (issue 1373, maintainer round 5). That test pinned the shape the design names as the
  // defect: `.manager-recipe-option-tags-detail` carried `flex: 1 1 100%`, so the tag arm
  // ALWAYS wrapped to a second full-width line whatever the row's width was, taking the match
  // toggle, an `Add tag` dropdown and a bordered `No tags set` box with it.
  //
  // `proto:2252`-`2268` draws `[Tag v] Any of [chips] [+ Tag] ... [Any of|All of] [- 1 +] [x]`.
  // The claim is geometric and this is where it can be made: nothing else in the corpus
  // computes a real cascade, and the mounted suites cannot see a wrap at all.
  //
  // == WHAT THIS GUARD COULD NOT SEE, TWICE (round 7) ======================================
  // Round 6 widened it to two widths after finding the fixture was missing the `or...` chip,
  // the divider and the real `Stepper` - most of a hundred pixels. It was still green through
  // the defect the maintainer reported next, and the reason is not the width list:
  //
  //   1. It only ever rendered a POPULATED arm. Two chips make the arm the widest flexible
  //      item in the row, so it is never the item the row squeezes, and "the arm is one line"
  //      was TRUE throughout. The row a GM meets the instant they press `Add tag` - the policy
  //      word and `+ Tag`, nothing between them - was never measured.
  //   2. It asserted nothing about the ROW at all. The maintainer's report is that an empty tag
  //      row stands at 96px where every sibling requirement row stands at 46, and an arm can be
  //      perfectly whole inside a row that has grown a second line underneath it.
  //   3. It rendered no sibling row, so it had nothing to be wrong AGAINST. A pinned constant
  //      would not have helped: the number it encodes is every control height in the row at once.
  //
  // So the fixture now renders a COMPONENT row beside the two tag rows and the empty tag row is
  // asserted against ITS height, and the `+ Tag` pill is wrapped in the `div.fabricate-picker`
  // namespace root `SearchablePopover` actually renders it inside
  // (`SearchablePopover.svelte:1209`) rather than dropped bare into the arm - a flex item the
  // shipped tree has and the old fixture did not.
  //
  // WHAT IS ASSERTED IS NOT "one line" AT BOTH WIDTHS. At the narrow width `Any of` + two chips
  // + `+ Tag` + the segments + the stepper + `or...` + `x` do not fit on one line and no CSS
  // can make them; the design's own frame is the wide one. What must hold is that the tag ARM
  // stays whole - one line, with its policy word, its chips and its `+ Tag` together - so the
  // row degrades by moving a WHOLE control down rather than by shredding the arm; and that an
  // EMPTY tag row, which asks for less room than a named component row does, is no taller.
  const stepperScoped = scopedComponentCss(
    resolve(__dirname, '../../src/ui/svelte/components/Stepper.svelte')
  );
  const segmentedScoped = scopedComponentCss(
    resolve(__dirname, '../../src/ui/svelte/apps/manager/SegmentedControl.svelte')
  );
  const stamp = (markup) =>
    [
      ['manager-chip', chipScoped.hashClass],
      ['fab-stepper', stepperScoped.hashClass],
      ['fab-stepper-input', stepperScoped.hashClass],
      ['fab-stepper-adjunct', stepperScoped.hashClass],
      ['manager-segmented', segmentedScoped.hashClass],
      ['manager-segment', segmentedScoped.hashClass],
      ['manager-segment-input', segmentedScoped.hashClass],
      ['manager-segment-label', segmentedScoped.hashClass],
    ].reduce((html, [className, hash]) => withScopeHash(html, className, hash), markup);

  // The trailing cluster is identical on every requirement row whatever its kind, so it is
  // written once: a second copy would be the very thing the two rows are supposed to share.
  const controls = `
      <div class="manager-recipe-option-controls">
        <div class="fab-stepper">
          <button type="button" class="fab-stepper-adjunct"><i class="fas fa-minus"></i></button>
          <input type="number" class="fab-stepper-input manager-recipe-option-quantity" value="2">
          <button type="button" class="fab-stepper-adjunct"><i class="fas fa-plus"></i></button>
        </div>
        <span class="manager-recipe-option-divider"></span>
        <div class="fabricate-picker manager-travel-picker manager-recipe-or-picker"><button type="button" class="manager-recipe-or-trigger"><i class="fa-solid fa-code-branch"></i><span class="manager-travel-picker-value">or…</span></button></div>
        <button type="button" class="manager-recipe-option-remove"><i class="fas fa-xmark"></i></button>
      </div>`;

  const tagChips = `
        <span class="manager-chip is-tag manager-recipe-tag-chip" data-recipe-tag="abrasive"><span>abrasive</span><button type="button" class="manager-recipe-tag-remove"><i class="fas fa-times"></i></button></span>
        <span class="manager-chip is-tag manager-recipe-tag-chip" data-recipe-tag="hide"><span>hide</span><button type="button" class="manager-recipe-tag-remove"><i class="fas fa-times"></i></button></span>`;

  // The row exactly as `RecipeIngredientOption` renders a tag requirement: the plate, the kind
  // select, the tag arm, the Any of / All of segments and the trailing control cluster.
  const tagRow = (caseName, chips) =>
    stamp(`
    <div class="manager-recipe-ingredient-option-row is-tag" data-recipe-option data-case="${caseName}">
      <span class="manager-recipe-option-lead is-tag"><i class="fas fa-tag"></i></span>
      <select class="manager-recipe-option-kind" data-recipe-option-kind>
        <option value="tags" selected>Tag</option>
      </select>
      <span class="manager-recipe-option-tags" data-recipe-option-tags>
        <span class="manager-recipe-tag-policy" data-recipe-tag-policy>Any of</span>${chips}
        <div class="fabricate-picker manager-travel-picker manager-recipe-tag-picker">
          <button type="button" class="manager-recipe-tag-trigger" data-recipe-add-tag><i class="fa-solid fa-plus"></i><span class="manager-travel-picker-value">Tag</span></button>
        </div>
      </span>
      <div class="manager-segmented is-tag" role="radiogroup" aria-label="Tag match">
        <label class="manager-segment is-active"><input type="radio" class="manager-segment-input" name="tag-match-1" checked><span class="manager-segment-label">Any of</span></label>
        <label class="manager-segment"><input type="radio" class="manager-segment-input" name="tag-match-1"><span class="manager-segment-label">All of</span></label>
      </div>${controls}
    </div>`);

  // The reference: a NAMED component requirement, the commonest row on either surface.
  const componentRow = stamp(`
    <div class="manager-recipe-ingredient-option-row is-component" data-recipe-option data-case="component">
      <span class="manager-recipe-option-lead is-component"><i class="fas fa-cube"></i></span>
      <select class="manager-recipe-option-kind" data-recipe-option-kind>
        <option value="component" selected>Component</option>
      </select>
      <span class="manager-recipe-option-name-field">
        <span class="manager-recipe-option-chosen" data-recipe-option-chosen><i class="fas fa-cube manager-recipe-option-mark is-component"></i><span class="manager-recipe-option-chosen-name">Iron Ingot</span><button type="button" class="manager-recipe-option-clear"><i class="fa-solid fa-xmark"></i></button></span>
      </span>${controls}
    </div>`);

  // `manager-recipe-edit-ingredients-cost` photographs the first; `world-tool-entry-on-break-repair`
  // and `manager-tool-stress-repair` photograph the second, and it is the one that broke.
  //
  // The third and fourth are neither, and they do NOT claim row parity. Below about 560px the
  // row's five controls do not fit on one line and no CSS makes them; what those two are here
  // to hold is the OTHER half of the report — that however hard the row is squeezed, the arm's
  // answer is a WHOLE control moving down and never the policy word parting from `+ Tag`.
  //
  // THE FOURTH RAISES THE ROOT FONT rather than narrowing the column, because that is the axis
  // the two halves of this row disagree on: the sheet sizes the policy word and the `+ Tag`
  // pill in `rem`, so Foundry's interface font-size setting widens them, while
  // `.manager-recipe-option-kind` states a 132px WIDTH and does not move. A guard that only
  // ever renders at 16px cannot see a row that only fails on a GM's own font setting, and the
  // reported stack was never reproduced at 16px at any width.
  for (const surface of [
    { label: 'the recipe tab', width: 1006, rootFontSize: 16, rowParity: true },
    { label: 'a Tool inspector', width: 622, rootFontSize: 16, rowParity: true },
    { label: 'a squeezed inspector', width: 430, rootFontSize: 16, rowParity: false },
    {
      label: 'a Tool inspector at a raised interface font',
      width: 622,
      rootFontSize: 20,
      rowParity: false,
    },
  ]) {
    const context = await openLayoutContext({
      viewport: { width: surface.width + 60, height: 500 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    try {
      await page.setContent(`
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <style>
              ${css}
              ${chipCss}
              ${stepperScoped.css}
              ${segmentedScoped.css}
              html { font-size: ${surface.rootFontSize}px; }
              body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
              .harness-row-width { width: ${surface.width}px; }
              .fas::before, .fa-solid::before { content: "x"; }
            </style>
          </head>
          <body>
            <main class="fabricate-manager">
              <div class="harness-row-width">
                ${componentRow}
                ${tagRow('populated', tagChips)}
                ${tagRow('empty', '')}
              </div>
            </main>
          </body>
        </html>
      `);

      const report = await page.evaluate(() => {
        const box = (element) => {
          const rect = element.getBoundingClientRect();
          return { top: rect.top, height: rect.height, width: rect.width };
        };
        const read = (caseName) => {
          const row = document.querySelector(`[data-case="${caseName}"]`);
          const arm = row.querySelector('[data-recipe-option-tags]');
          return {
            row: box(row),
            arm: arm ? box(arm) : null,
            // Every MEMBER of the arm, so a chip that dropped below its neighbours is visible.
            armMembers: arm ? [...arm.children].map((child) => box(child)) : [],
          };
        };
        return { component: read('component'), populated: read('populated'), empty: read('empty') };
      });

      for (const [caseName, measured] of [
        ['a populated', report.populated],
        ['an empty', report.empty],
      ]) {
        // THE ARM IS ONE LINE. Measured as "the arm is no taller than its tallest member", which
        // is the same claim as "no member wrapped" and survives a rung change on the spacing
        // ladder in a way a pinned pixel height would not.
        const tallest = Math.max(...measured.armMembers.map((member) => member.height));
        assert.ok(
          measured.arm.height <= tallest + 1,
          `${surface.label} (${surface.width}px): ${caseName} tag arm is ONE line - the policy ` +
            `word, the chips and + Tag stay together (arm ${measured.arm.height}px vs tallest ` +
            `member ${tallest}px)`
        );
        for (const [index, member] of measured.armMembers.entries()) {
          assert.ok(
            member.top - measured.arm.top < tallest,
            `${surface.label}: ${caseName} arm's member ${index} wrapped onto a line of its own ` +
              `(top +${member.top - measured.arm.top}px against a ${tallest}px member)`
          );
        }
        assert.ok(
          measured.row.width <= surface.width + 1,
          `${surface.label}: ${caseName} tag row stays inside its column ` +
            `(${measured.row.width} vs ${surface.width})`
        );
      }

      // AN EMPTY TAG ROW IS A ROW LIKE ANY OTHER, at every width the row's controls fit on one
      // line at all. It asks for LESS room than the named component row beside it - a policy
      // word and a dashed pill against an image, a name and a clear button - so there is no
      // such width at which it may stand taller. Against the SIBLING rather than a constant,
      // for the reason the third failure above gives.
      if (!surface.rowParity) continue;
      assert.equal(
        Math.round(report.empty.row.height),
        Math.round(report.component.row.height),
        `${surface.label} (${surface.width}px): an EMPTY tag requirement row is no taller than ` +
          `the component row beside it (${Math.round(report.empty.row.height)}px vs ` +
          `${Math.round(report.component.row.height)}px) - a taller one has either stacked its ` +
          `policy word above + Tag or moved a whole control onto a second line`
      );
    } finally {
      await context.close();
    }
  }
});

test('a suggestion reads from the left edge the typed query does, under the host button rule', async () => {
  // `proto:2280` draws a suggestion as `display:flex; align-items:center; gap:8px; height:30px;
  // padding:0 8px`, then a 12px glyph and a label at `font:500 11px var(--sans)`. There is no
  // centring anywhere in it, and there cannot be: the panel sits directly beneath the field it
  // completes, so a suggestion that does not start where the query starts is not continuing the
  // GM's own typing (issue 1373, maintainer round 7).
  //
  // IT SHIPPED CENTRED, and the sheet looked right. `.manager-recipe-option-suggestion` is a
  // `<button>` declaring `display: flex` and `text-align: left` - and `text-align` positions
  // the CONTENT of a text container, not the ITEMS of a flex one, so it landed on nothing.
  // What placed them was Foundry's own `a.button, button { justify-content: center }`, which
  // our rule left standing because it named no `justify-content` of its own to displace it.
  //
  // So the host rule is in the fixture, exactly as the hostile `li` margin is in the tag-chip
  // guard above. Without it this file loads `styles/fabricate.css` alone, the initial
  // `justify-content: normal` applies, the label sits at the left, and the guard passes over
  // the defect it exists for.
  //
  // AND IT IS IN ITS REAL LAYER, which is the half a specificity comparison cannot answer.
  // `foundry2.css` declares the cascade layers `reset, variables, elements, blocks,
  // applications, compatibility, layouts, system, modules, exceptions` and puts that button
  // rule in `elements.forms`; `module.json` registers `styles/fabricate.css` with no explicit
  // layer, so Foundry imports it at `modules`. The winner is decided by LAYER ORDER before
  // specificity is consulted at all - `modules` sorts after `elements`, so one declaration is
  // enough and no extra class is needed to buy it. Rendering both sheets flat would prove a
  // different cascade from the one that ships, in either direction.
  const context = await openLayoutContext({
    viewport: { width: 640, height: 400 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            /* Foundry's own layer order, its own selector and its own declaration, taken
               from the harvested \`foundry-chrome/css/foundry2.css\` the View Lab renders
               against, with our sheet at the \`modules\` layer \`module.json\` gives it. */
            @layer reset, variables, elements, blocks, applications, compatibility, layouts, system, modules, exceptions;
            @layer elements.forms {
              a.button, button { display: flex; justify-content: center; }
            }
            @layer modules { ${css} }
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
            .harness { width: 300px; }
            .fas::before, .fa-solid::before { content: "x"; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            <div class="harness">
              <span class="manager-recipe-option-name-field">
                <span class="manager-recipe-option-search is-typing">
                  <i class="fa-solid fa-magnifying-glass"></i>
                  <input type="text" data-recipe-option-search value="ingot" placeholder="Search components...">
                </span>
                <span class="manager-recipe-option-suggestions">
                  <button type="button" class="manager-recipe-option-suggestion" data-recipe-option-suggestion="sm-iron-ingot">
                    <i class="fas fa-cube manager-recipe-option-mark is-component"></i><span>Iron Ingot</span>
                  </button>
                </span>
              </span>
            </div>
            <!-- The tag picker's own option row (proto:2261), the same shape from the same
                 panel family and therefore exposed to the same host rule. It is here because
                 reading its declaration is not the same as measuring it: the question the
                 sheet cannot answer on its own is which of two declarations the cascade keeps,
                 and this fixture is where that is settled for both rows at once. -->
            <div class="fabricate-picker-popover manager-travel-popover harness">
              <button type="button" class="manager-travel-option" data-popover-option="reagent">
                <i class="fas fa-tag"></i><span class="manager-travel-option-name">reagent</span>
              </button>
            </div>
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const suggestion = document.querySelector('[data-recipe-option-suggestion]');
      const glyph = suggestion.querySelector('i');
      const label = suggestion.querySelector('span');
      const field = document.querySelector('[data-recipe-option-search]');
      const pickerOption = document.querySelector('[data-popover-option]');
      const style = getComputedStyle(suggestion);
      const left = (element) => element.getBoundingClientRect().left;
      return {
        justifyContent: style.justifyContent,
        pickerOptionJustifyContent: getComputedStyle(pickerOption).justifyContent,
        // The offset of the row's FIRST item from its own padding edge. Zero means the glyph
        // starts where the row starts; anything else is slack the row put in front of it.
        glyphIndent:
          left(glyph) - (left(suggestion) + Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.borderLeftWidth)),
        // …and where the LABEL lands against the query it is completing, which is the thing the
        // maintainer actually saw: `ingot` at the field's left edge, `Iron Ingot` mid-panel.
        labelIndent: left(label) - left(field),
        suggestionWidth: suggestion.getBoundingClientRect().width,
        fieldTextAlign: getComputedStyle(field).textAlign,
        fieldFlexBasis: getComputedStyle(field).flexBasis,
        fieldFlexGrow: getComputedStyle(field).flexGrow,
      };
    });

    assert.notEqual(
      report.justifyContent,
      'center',
      'a suggestion row must displace the host button rule rather than inherit its centring'
    );
    // The tag picker's option row already named its own justification and so was never
    // centred; asserted alongside rather than taken on trust, because the two rows sit in
    // sibling panels and the next one written in either place inherits whichever answer is
    // guarded here.
    assert.notEqual(
      report.pickerOptionJustifyContent,
      'center',
      'a tag picker option row displaces the host button rule too'
    );
    assert.ok(
      Math.abs(report.glyphIndent) <= 1,
      `the suggestion's kind glyph starts at the row's own left edge (indent ` +
        `${report.glyphIndent.toFixed(1)}px in a ${report.suggestionWidth.toFixed(1)}px row)`
    );
    // Within a glyph and a gap of the query above it: the panel is inset by its own padding,
    // so the two left edges are near-flush rather than identical, and a centred label is half
    // the panel away.
    assert.ok(
      report.labelIndent < 40,
      `the suggestion label continues the typed query rather than sitting mid-panel ` +
        `(+${report.labelIndent.toFixed(1)}px against the field's own text)`
    );
    // The field itself, measured in the same document rather than read off the sheet:
    // `proto:2276` and premium's `RewardRow` `.search input` both give it `flex: 1; min-width: 0`
    // and no alignment of its own, and this is where a disagreement would show.
    assert.equal(report.fieldTextAlign, 'start', 'the search field itself reads from the left');
    assert.equal(report.fieldFlexGrow, '1', 'the search field absorbs the row slack');
    assert.equal(report.fieldFlexBasis, '0%', 'the search field takes a zero flex base');
  } finally {
    await context.close();
  }
});

test('the picker popover is the design’s panel, field and rows, not a heavy sheet', async () => {
  // THE `+ Tag` PICKER THE MAINTAINER PUT BESIDE THE DESIGN (issue 1373). `proto:2258`-`2263`
  // states the whole panel: a 7px-inset column over `var(--bg0)` with a 10px corner and a 5px
  // gap; a 7px/9px field with a 7px corner edged in `--accent-border` over `var(--bg1)`; a 2px-
  // gapped list carrying its own scroll; and 30px rows at `0 8px` with a 7px corner. Ours drew
  // a 240px sheet on `--fab-bg-3` — the LIGHTEST rung, over a pane painted darker than it — with
  // a 6px corner, an 8px-inset divider-ruled field, an 8px-inset list and 40px rows.
  //
  // ── THE ONE SUBSTITUTION, AND WHY IT IS A JUDGEMENT ──────────────────────────────────────
  // The design's ramp is shifted a rung against ours: its `--bg1` is our `--fab-bg-0` and its
  // `--bg2` our `--fab-bg-1`, so the `--bg0` it paints this panel with sits BELOW our darkest
  // token and has no equivalent. Inventing an eighth rung across seven themes to transcribe one
  // popover would be a token-generation change; the relationship the design is expressing is
  // that the panel is DARKER than the block it floats over, separated by `--border-strong` and
  // a deep shadow. `--fab-bg-0` is the darkest rung we publish and preserves that relationship,
  // so it is what the panel takes. Every theme's ramp runs the same direction — all seven are
  // dark and `--fab-bg-0` is the darkest in each — so no theme inverts the reading.
  //
  // The 7px and 5px insets are not transcribed either: `spacing-scale-ratchet.test.js` bans a
  // new raw literal in `padding`/`margin`/`gap`, so each takes its nearest published step —
  // 7 to `--fab-space-chip` (6) and 5 to `--fab-space-1` (4) — exactly as `EmptyState`'s
  // `is-filtered` variant took the design's 26 to 24.
  //
  // ── MEASURED, NOT READ ───────────────────────────────────────────────────────────────────
  // `styles/fabricate.css` is layered at `modules` and `SearchablePopover`'s own block is
  // UNLAYERED, so a scoped declaration beats a sheet declaration at any specificity. That makes
  // "the sheet says 10px" and "the panel is 10px" different questions, and only the second one
  // is the product. The component's compiled CSS (`css: 'external'`) is appended after the
  // layered sheet and its hash stamped onto the fixture, so a compact-mode rule that grew past
  // its `.is-compact-option-rows` qualifier would be caught here rather than shipping.
  const popoverScoped = scopedComponentCss(
    resolve(__dirname, '../../src/ui/svelte/components/SearchablePopover.svelte')
  );
  const stamp = (markup) =>
    [
      'manager-travel-popover',
      'manager-travel-popover-search',
      'manager-travel-popover-options',
      'manager-travel-option',
      'manager-travel-option-name',
    ].reduce((html, className) => withScopeHash(html, className, popoverScoped.hashClass), markup);

  const context = await openLayoutContext({
    viewport: { width: 640, height: 400 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            @layer reset, variables, elements, blocks, applications, compatibility, layouts, system, modules, exceptions;
            @layer elements.forms {
              a.button, button { display: flex; justify-content: center; }
            }
            @layer modules { ${css} }
            ${popoverScoped.css}
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
            .fas::before, .fa-solid::before { content: "x"; }
            .probe { width: 10px; height: 10px; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            ${stamp(`
            <div class="fabricate-picker-popover manager-travel-popover" data-probe="panel">
              <div class="manager-travel-popover-search">
                <input type="text" data-probe="field" placeholder="Search tags...">
              </div>
              <div class="manager-travel-popover-options" role="listbox" data-probe="list">
                <button type="button" class="manager-travel-option" data-probe="row">
                  <i class="fas fa-tag"></i><span class="manager-travel-option-name">reagent</span>
                </button>
              </div>
            </div>`)}
            <div class="probe" data-probe="bg0" style="background: var(--fab-bg-0)"></div>
            <div class="probe" data-probe="bg3" style="background: var(--fab-bg-3)"></div>
            <div class="probe" data-probe="accent-edge" style="background: var(--fab-accent-border)"></div>
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const at = (name) => document.querySelector(`[data-probe="${name}"]`);
      const of = (name) => getComputedStyle(at(name));
      const panel = of('panel');
      const field = of('field');
      const list = of('list');
      const row = of('row');
      return {
        panel: {
          radius: panel.borderTopLeftRadius,
          padding: panel.paddingTop,
          gap: panel.rowGap,
          background: panel.backgroundColor,
        },
        field: {
          radius: field.borderTopLeftRadius,
          height: at('field').getBoundingClientRect().height,
          borderColour: field.borderTopColor,
          background: field.backgroundColor,
        },
        list: { gap: list.rowGap, padding: list.paddingTop, paddingLeft: list.paddingLeft },
        row: {
          radius: row.borderTopLeftRadius,
          height: at('row').getBoundingClientRect().height,
          gap: row.columnGap,
          justify: row.justifyContent,
        },
        bg0: of('bg0').backgroundColor,
        bg3: of('bg3').backgroundColor,
        accentEdge: of('accent-edge').backgroundColor,
      };
    });

    assert.equal(report.panel.radius, '10px', 'proto:2258 corners the panel at 10px');
    assert.equal(report.panel.padding, '6px', 'proto:2258 insets it by 7px, nearest step 6');
    assert.equal(report.panel.gap, '4px', 'proto:2258 gaps its column by 5px, nearest step 4');
    assert.equal(
      report.panel.background,
      report.bg0,
      'the panel takes the darkest rung we publish, as proto:2258 takes the one below its pane'
    );
    assert.notEqual(
      report.panel.background,
      report.bg3,
      'and no longer the LIGHTEST rung, which drew the panel brighter than the pane under it'
    );

    assert.equal(report.field.radius, '7px', 'proto:2259 corners the field at 7px');
    assert.equal(
      report.field.borderColour,
      report.accentEdge,
      'proto:2259 edges the field in the accent border, not the neutral one'
    );
    assert.equal(
      report.field.background,
      report.bg0,
      'proto:2259 fills the field with the rung our --fab-bg-0 answers for'
    );
    assert.ok(
      Math.abs(report.field.height - 30) <= 1,
      `the field stands on the ladder's 30 (measured ${report.field.height.toFixed(1)}px)`
    );

    assert.equal(report.list.gap, '2px', 'proto:2260 gaps the list by 2px');
    assert.equal(report.list.padding, '0px', 'proto:2260 gives the list no inset of its own');
    assert.equal(
      report.list.paddingLeft,
      '0px',
      'the panel’s own inset is what the list’s left edge sits on'
    );

    assert.equal(report.row.radius, '7px', 'proto:2261 corners an option row at 7px');
    assert.equal(report.row.gap, '8px', 'proto:2261 gaps the row’s glyph from its label by 8px');
    assert.ok(
      Math.abs(report.row.height - 30) <= 1,
      `proto:2261 stands an option row at 30px (measured ${report.row.height.toFixed(1)}px)`
    );
    assert.notEqual(
      report.row.justify,
      'center',
      'and it still displaces Foundry’s `button { justify-content: center }` host rule'
    );
  } finally {
    await context.close();
  }
});

test('the any-of / all-of toggle is edged and lit in the tag hue, not the warm one', async () => {
  // `proto:4628` is `segStyle`: the chosen segment takes the design's own translucent tag value
  // and `var(--text)`, the unchosen one is transparent over `var(--subtle)`, and `proto:2268`
  // edges the track in the same hue at a lower alpha. That hue is the tag family - it is the
  // value the row's own border, the tag chips and the `+ Tag` pill already carry here, which is
  // `--fab-purple` - so a warm track puts the one control that is ABOUT tags in a different
  // family from everything beside it (issue 1373, maintainer round 7).
  //
  // MEASURED THROUGH PROBES IN THE SAME DOCUMENT, for the reason the kind-tint guard gives: a
  // rule that reaches the element but loses the cascade reads as correct in the source. Both
  // tokens are resolved here and the assertion is a computed-value comparison.
  const segmentedScoped = scopedComponentCss(
    resolve(__dirname, '../../src/ui/svelte/apps/manager/SegmentedControl.svelte')
  );
  const stamp = (markup) =>
    [
      ['manager-segmented', segmentedScoped.hashClass],
      ['manager-segment', segmentedScoped.hashClass],
      ['manager-segment-input', segmentedScoped.hashClass],
      ['manager-segment-label', segmentedScoped.hashClass],
    ].reduce((html, [className, hash]) => withScopeHash(html, className, hash), markup);

  const context = await openLayoutContext({
    viewport: { width: 640, height: 300 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            ${css}
            ${segmentedScoped.css}
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            ${stamp(`
            <div class="manager-segmented is-tag" role="radiogroup" aria-label="Tag match" data-tag-match>
              <label class="manager-segment is-active" data-segment="any"><input type="radio" class="manager-segment-input" name="tm" checked><span class="manager-segment-label">Any of</span></label>
              <label class="manager-segment" data-segment="all"><input type="radio" class="manager-segment-input" name="tm"><span class="manager-segment-label">All of</span></label>
            </div>`)}
            <span data-probe="edge" style="color: color-mix(in srgb, var(--fab-purple) 40%, transparent)"></span>
            <span data-probe="lit" style="color: color-mix(in srgb, var(--fab-purple) 22%, transparent)"></span>
            <span data-probe="warm" style="color: var(--fab-surface-active)"></span>
            <span data-probe="resting" style="color: var(--fab-text-subtle)"></span>
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const probe = (name) =>
        getComputedStyle(document.querySelector(`[data-probe="${name}"]`)).color;
      const track = document.querySelector('[data-tag-match]');
      const lit = document.querySelector('[data-segment="any"]');
      const unlit = document.querySelector('[data-segment="all"]');
      // The ring is `:has(:focus-visible)`, so the radio has to be really focused by the
      // keyboard for the rule to match; a click leaves `:focus` without `:focus-visible`.
      unlit.querySelector('input[type="radio"]').focus();
      return {
        trackEdge: getComputedStyle(track).borderTopColor,
        trackOverflow: getComputedStyle(track).overflow,
        focusOutlineOffset: getComputedStyle(unlit).outlineOffset,
        litBackground: getComputedStyle(lit).backgroundColor,
        unlitBackground: getComputedStyle(unlit).backgroundColor,
        unlitColour: getComputedStyle(unlit).color,
        probes: {
          edge: probe('edge'),
          lit: probe('lit'),
          warm: probe('warm'),
          resting: probe('resting'),
        },
      };
    });

    assert.equal(
      report.trackEdge,
      report.probes.edge,
      'the track is edged in the tag hue the row border and the chips already carry'
    );
    assert.equal(
      report.litBackground,
      report.probes.lit,
      'the chosen segment is lit in the tag hue rather than the warm active tile'
    );
    assert.notEqual(
      report.litBackground,
      report.probes.warm,
      'the chosen segment must not fall back to the shared warm active tile'
    );
    assert.equal(
      report.unlitBackground,
      'rgba(0, 0, 0, 0)',
      'the unchosen segment paints nothing, so the track reads as one control'
    );
    assert.equal(
      report.unlitColour,
      report.probes.resting,
      'the unchosen segment takes the resting ink'
    );
    // `overflow: hidden` is what lets the segments meet the track's own rounded ends without
    // each restating a corner radius (`proto:2268`).
    assert.equal(report.trackOverflow, 'hidden', 'the track clips its segments to its own ends');
    // …and the clip is exactly why the focus ring has to turn inward. An outline paints outside
    // the border box, so the shared positive offset would be clipped away and a keyboard user
    // would see no focus at all on the one track that clips. The two are asserted together
    // because it is the clip that creates the obligation.
    assert.ok(
      Number.parseFloat(report.focusOutlineOffset) < 0,
      `a clipped track paints its focus ring INSIDE the segment (offset ${report.focusOutlineOffset})`
    );
  } finally {
    await context.close();
  }
});

test('every requirement kind marks itself in its OWN tint, on the plate and on the chosen chip', async () => {
  // `proto:4624`-`4627` is the design's `KINDMETA`, and a tint is half of every entry in it:
  // `comp` is `--success`, `tag` is `--tag`, `cur` is `--accent`, and `ess` is `--water` — an
  // essence/water hue the design's own `:root` never declares, so its own frames render that
  // one glyph uncoloured. `--fab-info` is the token that hue names here, and the other three
  // map exactly: the design's `--success`, `--accent` and `--info` are byte-for-byte our
  // `--fab-success`, `--fab-accent` and `--fab-info`, and `--fab-purple` is this repo's tag
  // family (`Chip`'s `is-tag`, the tag row's own edge, the `+ Tag` pill).
  //
  // `proto:4645` resolves the entry PER ROW, and premium's `RewardRow` puts the same
  // `presentation.tint` on the plate (`:62`) AND on the chosen chip's glyph (`:80`) and on
  // each suggestion's (`:129`). The plate shipped tinted; the chip and the suggestions did
  // not, so a NAMED row's mark was one inherited ink whatever kind the row was.
  //
  // MEASURED, NOT MATCHED. A rule that reaches the element but loses the cascade — an `<i>`
  // whose colour an ancestor pill sets, a `layer(modules)` sheet rule against a component's
  // own unlayered block — reads as correct in the source and renders as one colour. So this
  // resolves each token through a probe element in the same document and compares computed
  // values rather than asserting a selector exists.
  const context = await openLayoutContext({
    viewport: { width: 900, height: 420 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    const rowFor = (kind, icon) => `
      <div class="manager-recipe-ingredient-option-row is-${kind}" data-recipe-option>
        <span class="manager-recipe-option-lead is-${kind}" data-plate="${kind}"><i class="${icon}"></i></span>
        <select class="manager-recipe-option-kind"><option>${kind}</option></select>
        <span class="manager-recipe-option-name-field">
          <span class="manager-recipe-option-chosen" data-recipe-option-chosen>
            <i class="${icon} manager-recipe-option-mark is-${kind}" data-mark="${kind}"></i>
            <span class="manager-recipe-option-chosen-name">Named</span>
          </span>
        </span>
      </div>`;
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            ${css}
            body { margin: 0; padding: 24px; font-family: Arial, sans-serif; }
            .fas::before, .fa-solid::before { content: "x"; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            ${rowFor('component', 'fa-solid fa-cube')}
            ${rowFor('tag', 'fa-solid fa-tag')}
            ${rowFor('essence', 'fa-solid fa-flask-vial')}
            ${rowFor('currency', 'fa-solid fa-coins')}
            <span data-token="component" style="color: var(--fab-success)"></span>
            <span data-token="tag" style="color: var(--fab-purple)"></span>
            <span data-token="essence" style="color: var(--fab-info)"></span>
            <span data-token="currency" style="color: var(--fab-accent)"></span>
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const colourOf = (selector) => getComputedStyle(document.querySelector(selector)).color;
      return ['component', 'tag', 'essence', 'currency'].map((kind) => ({
        kind,
        plate: colourOf(`[data-plate="${kind}"] i`),
        mark: colourOf(`[data-mark="${kind}"]`),
        token: colourOf(`[data-token="${kind}"]`),
      }));
    });

    for (const kind of report) {
      assert.equal(
        kind.plate,
        kind.token,
        `the ${kind.kind} plate glyph carries the ${kind.kind} token, not an inherited ink`
      );
      assert.equal(
        kind.mark,
        kind.token,
        `the chosen chip's ${kind.kind} glyph takes the same tint the plate does (RewardRow.svelte:80)`
      );
    }
    // …and the four are four, not one token wearing four class names: a sheet that resolved
    // every kind to the same colour would satisfy every assertion above.
    assert.equal(
      new Set(report.map((kind) => kind.plate)).size,
      4,
      `the four kinds resolve to four distinct tints (${report.map((k) => `${k.kind}=${k.plate}`).join(', ')})`
    );
  } finally {
    await context.close();
  }
});

test('the Books & Scrolls route names one grid track per section and grows the table', () => {
  // THE PAGER IS A FOURTH CHILD AND THE SHEET NAMES THREE TRACKS, which the old hand-listed
  // matcher hid by not counting `<Pagination>` at all. It is recorded rather than repaired: an
  // unnamed trailing child falls into an IMPLICIT row, which grid sizes `auto` — the same value
  // the sheet would name — so the route renders correctly today and naming the track is a change
  // to a route this issue does not touch. What matters is that the shortfall is now written down
  // and a FIFTH child would fail here instead of passing.
  assertOneTrackPerGridChild({
    viewFile: 'BooksScrollsView.svelte',
    route: 'books-scrolls',
    expectedChildren: 4,
    impliedTrailingTracks: 1,
    growingLabel: 'the scrolling table',
    autoLabel: 'header/drop-zone/toolbar',
  });
});

// The same defect family on the Tags & Categories route (issue 878). It carried its own duplicate
// page header until then, which happened to give it exactly three children for the shared
// three-track `auto auto 1fr`. Deleting the header took it to TWO, and the shared template's `1fr`
// would have landed on an EMPTY third row — the vocabulary workspace sizing to its content with
// the panel's remaining height sitting dead below it, the mirror image of the books-scrolls
// toolbar float.
test('the Tags & Categories route names one grid track per section and grows the workspace', () => {
  assertOneTrackPerGridChild({
    viewFile: 'TagsCategoriesView.svelte',
    route: 'tags',
    expectedChildren: 2,
    growingLabel: 'the scrolling vocabulary workspace',
    autoLabel: 'the tab strip',
  });
});

// The SAME defect family, a third time, on the Component Rules route (issue 1371). Issue 1371
// added a fifth top-level child to a four-track template: the attribution banner went in FIRST,
// every child shifted one track down, and the toolbar landed in the zero-min growing track.
test('the Component Rules route names one grid track per child and grows the list', () => {
  assertOneTrackPerGridChild({
    viewFile: 'ComponentsBrowserView.svelte',
    route: 'components',
    expectedChildren: 4,
    // THE LIST IS THE THIRD OF FOUR, not the last: the pager is a real child below it, and this
    // is the one route whose sheet names a track for it. So the growing track is asserted by
    // POSITION rather than by "last".
    growingTrackIndex: 2,
    growingLabel: 'the scrolling list',
    autoLabel: 'head/toolbar/pager',
    also: (main) => {
      // THE COUNT IS UNCONDITIONAL, which is the whole repair. The banner renders inside a
      // `.manager-component-head` wrapper precisely so a null `bannerEntry` — a system whose
      // components the world corpus has no record of — leaves the same four children. A banner
      // hoisted back out to be a direct child would make this five, and a template widened to
      // five tracks would misplace the list in the state the banner is absent.
      assert.ok(
        main.includes('class="manager-component-head"'),
        'the banner and the drop zone share one head wrapper, so the child count does not ' +
          'depend on whether a component is selected'
      );
    },
  });
});

// Rendered-geometry guard for the reserved General row (issue 878). Its explanatory
// sentence used to stack under the name, making it the one card in an `align-items: start`
// grid whose content exceeded the 34px icon tile — so it stood visibly taller than every
// sibling. Source-reading cannot see that; only layout can, so this measures both cards.
//
// The fixture's tab strip and workspace are a `<div role="tablist">` / `<div role="tabpanel">`
// because that is what the view now ships (issue 924 — the `<nav>`/`<section>` forms carried
// implicit landmark roles for the ARIA roles to override). Every governing selector below is
// class-based, so nothing here depends on the element; the fixture is updated so it keeps
// MIRRORING shipped markup rather than quietly describing a shape that no longer exists.
//
// Issue 1429 moved the strip onto `EditorTabs` and corrected its mark from the neutral chip to
// the Rail Marker Family's RECORD COUNT, so the fixture's tab now carries
// `<span class="manager-editor-tab-count">` rather than a `.manager-chip`. This is a hand-written
// COPY of shipped markup, which is exactly the kind that keeps passing after the product stops
// emitting it — the `<div role="tablist">` host and both container classes are unchanged, so the
// copy is faithful again rather than merely still green.
//
// Issue 1470 added the picker root element the component actually renders around its trigger.
// That element was missing here from the start, which cost nothing while every trigger rule hung
// off `.fabricate-manager` and costs the whole block once they hang off the picker's own
// namespace root: without it this row measures an unstyled button and still reports on the
// vocabulary row's height by name.
//
// Issue 1503 added the two SHARED picker classes beside them. The picker renders through
// `SearchablePopover` now, so the root element the product writes carries the primitive's own
// pair as well as the caller's, which arrives through `pickerClass`. No area-scope clause reds
// on the shorter form — the shared `mirrored` pair keys on `manager-travel-picker`, which this
// copy did not carry — so nothing forced this edit; it is here because the copy would otherwise
// mirror a root the product no longer emits, which is exactly the failure mode a hand-written
// mirror has. It pulls `.fabricate-picker.manager-travel-picker`'s `position: relative;
// min-width: 0` onto the fixture, and the measurement was RE-RUN rather than assumed: the row
// height is unchanged, because what is measured is the trigger inside the wrapper and the
// wrapper is a containing block for nothing in this copy.
test('the reserved vocabulary row renders exactly as tall as a custom row', async () => {
  const context = await openLayoutContext({ viewport: { width: 760, height: 600 } });
  const page = await context.newPage();
  try {
    const lockedRow = `<div class="manager-vocabulary-row">
      <span class="manager-vocabulary-icon is-locked-icon"><i class="fas fa-lock"></i></span>
      <div class="manager-vocabulary-main is-inline" title="Built-in fallback &mdash; cannot be renamed or removed."><strong>General</strong></div>
      <span class="manager-chip manager-vocabulary-chip-locked"><i class="fas fa-lock"></i>Locked</span>
    </div>`;
    const customRow = `<div class="manager-vocabulary-row">
      <span class="manager-vocabulary-icon-picker" data-vocabulary-icon-picker="potions"><div class="fabricate-picker manager-travel-picker fabricate-icon-picker essence-icon-picker"><button type="button" class="essence-icon-picker-trigger icon-only manager-vocabulary-icon-trigger"><span class="essence-icon-picker-preview"><i class="fas fa-folder"></i></span><span class="essence-icon-picker-trigger-caret"><i class="fas fa-chevron-down"></i></span></button></div></span>
      <div class="manager-vocabulary-main"><strong>Potions</strong></div>
      <span class="manager-chip is-warning"><i class="fas fa-link"></i>8 references</span>
      <button type="button" class="fabricate-icon-button manager-icon-button"><i class="fas fa-trash"></i></button>
    </div>`;
    await page.setContent(
      withChipHash(
        `<style>${css}</style><style>${chipCss}</style><div class="fabricate-manager" data-manager-view="tags"><div class="manager-body"><main class="manager-main manager-tags-categories"><div class="fabricate-tabs manager-editor-tabs manager-vocabulary-tabs" role="tablist"><button type="button" class="manager-editor-tab-button is-active"><span>Recipe categories</span><span class="manager-editor-tab-count">17</span></button></div><div class="manager-tags-categories-workspace" role="tabpanel"><section class="manager-vocabulary-panel"><div class="manager-vocabulary-list"><div class="manager-vocabulary-card is-locked" data-vocabulary-locked-card>${lockedRow}</div><div class="manager-vocabulary-card" data-vocabulary-custom-card>${customRow}</div></div></section><span class="manager-chip" data-default-chip-reference>Default</span></div></main></div></div>`
      )
    );
    const geometry = await page.evaluate(() => {
      const locked = document.querySelector('[data-vocabulary-locked-card]');
      const custom = document.querySelector('[data-vocabulary-custom-card]');
      const trigger = custom.querySelector('.manager-vocabulary-icon-trigger');
      const triggerRect = trigger.getBoundingClientRect();
      return {
        lockedHeight: Math.round(locked.getBoundingClientRect().height),
        customHeight: Math.round(custom.getBoundingClientRect().height),
        hintRendered: Boolean(locked.querySelector('.manager-vocabulary-locked-hint')),
        triggerWidth: Math.round(triggerRect.width),
        triggerHeight: Math.round(triggerRect.height),
        lockedChipHeight: Math.round(
          locked.querySelector('.manager-chip').getBoundingClientRect().height
        ),
        lockedChipBackground: getComputedStyle(locked.querySelector('.manager-chip'))
          .backgroundColor,
        // A chip that exists to BE the default, named by its own hook. It used to be read off
        // `.manager-editor-tab-button .manager-chip` — the tab badge — which made an assertion
        // about the LOCKED ROW's fill depend on the vehicle the tab strip happened to draw.
        // Issue 1429 corrected that badge to the bare-numeral record count, and this clause fell
        // over with `getComputedStyle` on null rather than saying what it had lost. The
        // comparison only ever needed a default chip on the same page.
        defaultChipBackground: getComputedStyle(
          document.querySelector('[data-default-chip-reference]')
        ).backgroundColor,
      };
    });
    // The IconPicker's own `.essence-icon-picker-trigger` block is a full-width, 36px-min
    // three-column combo declared LATER in the sheet, so the row tile only stays a 34px
    // square while the vocabulary override outranks it on specificity, not source order.
    assert.deepEqual(
      { width: geometry.triggerWidth, height: geometry.triggerHeight },
      { width: 34, height: 34 },
      'the row icon picker trigger must render as the 34px vocabulary tile'
    );
    assert.equal(
      geometry.lockedHeight,
      geometry.customHeight,
      `the reserved row must match its siblings exactly (locked ${geometry.lockedHeight}px vs custom ${geometry.customHeight}px)`
    );

    // Two facts about the chip that ONLY a real browser can establish, and that the whole
    // of issue 883 rests on.
    //
    // First, the row's chip renders at the primitive's compact 20px. The global sheet has
    // no chip rule left at all, so this measures `Chip.svelte`'s own scoped block reaching
    // a real page — if the injection or the scoping hash ever stopped matching, the chip
    // would collapse to bare text and this drops well below 20.
    assert.ok(
      geometry.lockedChipHeight >= 20,
      `the locked chip renders at the primitive's compact scale, got ${geometry.lockedChipHeight}px`
    );
    // Second, `manager-vocabulary-chip-locked` still WINS its fill. It is a global rule
    // overriding a declaration the scoped block also makes, so it is written at three
    // classes; at two it would tie and lose on source order, and the locked chip would
    // silently repaint as an ordinary one. Comparing it against a default chip on the same
    // page is what makes that a fact rather than a colour constant copied out of the sheet.
    assert.notEqual(
      geometry.lockedChipBackground,
      geometry.defaultChipBackground,
      'the locked chip must keep its own fill, not fall back to the default chip fill'
    );
    // The sentence itself is gone: ellipsised at real column widths it truncated to
    // "Built…", which read as breakage beside untruncated custom rows. It survives as the
    // row's tooltip, so the card carries the name alone and the height follows for free.
    assert.equal(
      geometry.hintRendered,
      false,
      'the reserved row must not render an inline explanatory sentence'
    );
  } finally {
    await context.close();
  }
});

test('the "or…" menu is a 150px panel of four tinted, one-word entries under its own header', async () => {
  // WHY IT IS MEASURED AND NOT READ. Three of this panel's claims are cascade questions that a
  // sheet cannot answer on its own:
  //
  //   1. the ENTRY is a `<button>`, so Foundry's `a.button, button { justify-content: center }`
  //      in `@layer elements.forms` reaches it — the same host rule that centred the suggestion
  //      row one round ago. `styles/fabricate.css` imports at `layer(modules)`, which sorts
  //      after `elements`, so one declaration displaces it; whether one is WRITTEN is the
  //      question, and only a rendered cascade answers it.
  //   2. the panel's frame is stated twice — `.fabricate-picker-popover.manager-travel-popover`
  //      gives every picker an 8px corner on `--fab-bg-3`, and this menu's own rule has to
  //      out-specify it inside the same layer.
  //   3. the entry TINT is not written for this panel at all. The glyph carries the ROW's own
  //      `.manager-recipe-option-mark.is-<kind>` class, so the menu is inked by the same four
  //      rules the plate and the chosen chip are and cannot drift from them. That claim holds
  //      only if those rules still reach a glyph inside a PORTALED panel, which is a different
  //      DOM position from the row's.
  //
  // So the fixture renders the four reference marks a ROW draws beside the panel and compares
  // colour for colour, rather than pinning four token names a rename would walk away from.
  const popoverScoped = scopedComponentCss(
    resolve(__dirname, '../../src/ui/svelte/components/SearchablePopover.svelte')
  );
  const stamp = (markup) =>
    [
      'manager-travel-popover',
      'manager-travel-popover-header',
      'manager-travel-popover-title',
      'manager-travel-popover-options',
      'manager-travel-option',
      'manager-travel-option-name',
    ].reduce((html, className) => withScopeHash(html, className, popoverScoped.hashClass), markup);

  // The panel exactly as `SearchablePopover` portals it: the primitive's own two classes, the
  // caller's `popoverClass`, the header the `popoverTitle` prop renders, and one option button
  // per kind carrying the row's tinted-mark glyph. `width: 150px` is written inline because
  // that is where it comes from in the product — the primitive computes its width from
  // `minWidth`/`maxWidth` and writes it onto the node, so no rule in the sheet states it and
  // the source assertion at the foot of this test is what pins the number.
  const panel = stamp(
    '<div class="fabricate-picker-popover manager-travel-popover manager-recipe-or-popover" ' +
      'role="dialog" aria-label="Accept instead" style="width: 150px;">' +
      '<div class="manager-travel-popover-header" data-popover-header>' +
      '<span class="manager-travel-popover-title">Accept instead</span></div>' +
      '<div class="manager-travel-popover-options" role="listbox" aria-label="Accept instead">' +
      OR_MENU_KINDS.map(
        (kind) =>
          `<button type="button" class="manager-travel-option" role="option" data-recipe-add="alternative-${kind}" data-kind="${kind}">` +
          `<i class="${OR_MENU_GLYPHS[kind]} manager-recipe-option-mark is-${kind}"></i>` +
          `<span class="manager-travel-option-name">${OR_MENU_LABELS[kind]}</span></button>`
      ).join('') +
      '</div></div>'
  );

  // The reference marks: the same four classes, on the plate a requirement ROW draws.
  const referenceRows = OR_MENU_KINDS.map(
    (kind) =>
      `<span class="manager-recipe-option-lead is-${kind}">` +
      `<i class="${OR_MENU_GLYPHS[kind]} manager-recipe-option-mark is-${kind}" data-reference-mark="${kind}"></i></span>`
  ).join('');

  const context = await openLayoutContext({
    viewport: { width: 640, height: 520 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            @layer reset, variables, elements, blocks, applications, compatibility, layouts, system, modules, exceptions;
            @layer elements.forms {
              a.button, button { display: flex; justify-content: center; }
            }
            @layer modules { ${css} }
            ${popoverScoped.css}
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
            .fas::before, .fa-solid::before { content: "x"; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            ${referenceRows}
            ${panel}
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const panelNode = document.querySelector('.manager-recipe-or-popover');
      const panelStyle = getComputedStyle(panelNode);
      const heading = panelNode.querySelector('.manager-travel-popover-title');
      const entries = [...panelNode.querySelectorAll('[data-recipe-add]')].map((entry) => {
        const glyph = entry.querySelector('i');
        const label = entry.querySelector('.manager-travel-option-name');
        const style = getComputedStyle(entry);
        const box = entry.getBoundingClientRect();
        const labelStyle = getComputedStyle(label);
        return {
          kind: entry.dataset.kind,
          justifyContent: style.justifyContent,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          // The offset of the glyph from the entry's own padding edge: zero means the row
          // reads from its left edge, as `proto:4683` draws it.
          glyphIndent: Number(
            (
              glyph.getBoundingClientRect().left -
              (box.left +
                Number.parseFloat(style.paddingLeft) +
                Number.parseFloat(style.borderLeftWidth))
            ).toFixed(2)
          ),
          glyphColor: getComputedStyle(glyph).color,
          glyphWidth: getComputedStyle(glyph).width,
          glyphFontSize: getComputedStyle(glyph).fontSize,
          labelHeight: Number(label.getBoundingClientRect().height.toFixed(2)),
          labelLineHeight:
            Number.parseFloat(labelStyle.lineHeight) ||
            Number.parseFloat(labelStyle.fontSize) * 1.2,
          referenceColor: getComputedStyle(
            document.querySelector(`[data-reference-mark="${entry.dataset.kind}"]`)
          ).color,
        };
      });
      return {
        panel: {
          width: Number(panelNode.getBoundingClientRect().width.toFixed(2)),
          borderRadius: panelStyle.borderTopLeftRadius,
        },
        headerText: heading ? heading.textContent : '',
        headerTransform: heading ? getComputedStyle(heading).textTransform : '',
        entries,
      };
    });

    assert.equal(report.panel.width, 150, '`proto:2292` draws a 150px panel');
    assert.equal(report.panel.borderRadius, '9px', '`proto:2292`: a 9px corner');
    assert.equal(report.headerText, 'Accept instead');
    assert.equal(report.headerTransform, 'uppercase', '`proto:2293` sets the eyebrow in caps');

    for (const entry of report.entries) {
      assert.notEqual(
        entry.justifyContent,
        'center',
        `the ${entry.kind} entry must displace the host button rule rather than inherit its centring`
      );
      assert.ok(
        Math.abs(entry.glyphIndent) <= 1,
        `the ${entry.kind} entry's glyph starts at its own left edge (indent ${entry.glyphIndent}px)`
      );
      assert.equal(entry.fontSize, '11px', `\`proto:4683\`: the ${entry.kind} entry is 11px`);
      assert.equal(entry.fontWeight, '600', `\`proto:4683\`: the ${entry.kind} entry is 600`);
      assert.equal(entry.glyphFontSize, '10px', '`proto:4683`: a 10px glyph');
      assert.equal(entry.glyphWidth, '14px', '`proto:4683`: a 14px glyph column');
      assert.ok(
        entry.labelHeight <= entry.labelLineHeight * 1.5,
        `the ${entry.kind} entry's one-word label fits a 150px panel on one line ` +
          `(${entry.labelHeight}px over a ${entry.labelLineHeight}px line)`
      );
      // THE ANTI-DRIFT CLAIM, and the reason the reference marks are in this document at all.
      assert.equal(
        entry.glyphColor,
        entry.referenceColor,
        `the ${entry.kind} entry is inked by the same rule the row's own mark is`
      );
    }

    // …and four DIFFERENT inks, so "each carries its kind's colour" is a statement about four
    // kinds rather than about one colour applied four times.
    assert.equal(
      new Set(report.entries.map((entry) => entry.glyphColor)).size,
      4,
      `the four kinds are four colours (got ${report.entries.map((entry) => entry.glyphColor).join(', ')})`
    );
  } finally {
    await context.close();
  }

  // THE WIDTH'S OWN SOURCE. The primitive writes the computed width onto the node, so the
  // measurement above proves the geometry a 150px panel produces and this proves 150 is the
  // number the caller asks for.
  assert.match(
    orMenuGroupCardSource,
    /minWidth=\{150\}/,
    '`proto:2292` fixes the panel at 150px, so the caller must ask for exactly that'
  );
  assert.match(orMenuGroupCardSource, /maxWidth=\{150\}/, 'and must not let it grow past it');
});



test("the requirement row's two dashed affordances paint at all, and at the design's two scales", async () => {
  // MEASURED, BECAUSE THE SHEET SAID OTHERWISE AND WAS NOT PAINTING (issue 1373, round 8).
  //
  // `or…` and `+ Tag` are the two affordances a requirement row carries, and `styles/fabricate.css`
  // stated a dashed edge, a tint and a transparent fill for each — bound to the shared chip class,
  // because both rendered through `Chip`. Every one of those properties is ALSO declared in
  // `Chip.svelte`'s own scoped block, which `svelte.config.js` injects UNLAYERED while
  // `module.json` imports the sheet at `layer(modules)`. An unlayered declaration beats a layered
  // one at any specificity, so both rules matched, both were discarded, and the two shipped as
  // the default filled neutral chip: 20px tall, a SOLID `--fab-border` edge, `--fab-text` ink, a
  // 10px corner and a fill. Two rounds of this issue believed otherwise, and no gate could
  // disagree — stylelint does not read `.svelte`, Svelte's unused-selector pass never sees the
  // sheet, and a fixture that loads both flat reports the sheet winning.
  //
  // So this test is written in the LAYER ORDER THAT SHIPS, and it measures the CHIP as a control:
  // the same fixture renders a plain `Chip` beside the two, so "these two are not chips" is a
  // measured difference against the real primitive rather than an assertion about a token name.
  const chipScopedForTriggers = scopedComponentCss(
    resolve(__dirname, '../../src/ui/svelte/components/Chip.svelte')
  );
  const chipProbe = withScopeHash(
    '<button type="button" class="manager-chip" data-plain-chip><i class="fa-solid fa-plus"></i><span>Chip</span></button>',
    'manager-chip',
    chipScopedForTriggers.hashClass
  );

  const context = await openLayoutContext({
    viewport: { width: 640, height: 240 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            @layer reset, variables, elements, blocks, applications, compatibility, layouts, system, modules, exceptions;
            @layer elements.forms {
              a.button, button { display: flex; justify-content: center; height: 2rem; }
            }
            @layer modules { ${css} }
            ${chipScopedForTriggers.css}
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
            .fas::before, .fa-solid::before { content: "x"; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            <div class="fabricate-picker manager-travel-picker manager-recipe-or-picker">
              <button type="button" class="manager-recipe-or-trigger" data-or-trigger>
                <i class="fa-solid fa-code-branch"></i><span class="manager-travel-picker-value">or…</span>
              </button>
            </div>
            <div class="fabricate-picker manager-travel-picker manager-recipe-tag-picker">
              <button type="button" class="manager-recipe-tag-trigger" data-tag-trigger>
                <i class="fa-solid fa-plus"></i><span class="manager-travel-picker-value">Tag</span>
              </button>
            </div>
            ${chipProbe}
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const read = (selector) => {
        const node = document.querySelector(selector);
        const style = getComputedStyle(node);
        return {
          height: Number(node.getBoundingClientRect().height.toFixed(2)),
          borderStyle: style.borderTopStyle,
          borderRadius: style.borderTopLeftRadius,
          color: style.color,
          background: style.backgroundColor,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          justifyContent: style.justifyContent,
        };
      };
      return {
        or: read('[data-or-trigger]'),
        tag: read('[data-tag-trigger]'),
        chip: read('[data-plain-chip]'),
      };
    });

    // THE CONTROL IN BOTH SENSES. This is what the two affordances were rendering as, so every
    // claim below is a measured difference from it rather than a value read off the sheet.
    assert.equal(
      report.chip.borderStyle,
      'solid',
      'the plain chip is the filled solid-edged badge both affordances were shipping as'
    );

    // `proto:2290`: 26px — a rung on the control-height ladder, and the height of the stepper it
    // stands beside — with a 7px corner, 9.5px/600 text and a dashed `--border-strong` edge.
    assert.equal(report.or.borderStyle, 'dashed', 'the "or…" trigger is an affordance, not a fill');
    assert.equal(report.or.height, 26, '`proto:2290`: 26px');
    assert.equal(report.or.borderRadius, '7px', '`proto:2290`: a 7px corner');
    assert.equal(report.or.fontSize, '9.5px', '`proto:2290`: 9.5px');
    assert.equal(report.or.fontWeight, '600', '`proto:2290`: 600');
    assert.equal(
      report.or.background,
      'rgba(0, 0, 0, 0)',
      '`proto:2290` gives the affordance no fill of its own'
    );
    assert.notEqual(
      report.or.justifyContent,
      'center',
      'and it displaces the host `button { justify-content: center }` rather than inheriting it'
    );

    // `proto:2256`: a ~20px stadium in the TAG tint at 10px/600, which is a different scale from
    // `or…` on purpose — one is a control among controls, the other a chip among chips.
    assert.equal(report.tag.borderStyle, 'dashed', 'the `+ Tag` pill is an affordance too');
    assert.equal(report.tag.borderRadius, '999px', '`proto:2256`: a stadium');
    assert.equal(report.tag.fontSize, '10px', '`proto:2256`: 10px');
    assert.equal(report.tag.fontWeight, '600', '`proto:2256`: 600');
    assert.equal(
      report.tag.background,
      'rgba(0, 0, 0, 0)',
      '`proto:2256` gives it no fill either — the chips beside it are the filled things'
    );
    assert.ok(
      report.tag.height <= 22,
      `\`proto:2256\` draws a pill no taller than the chips it stands among (got ${report.tag.height}px)`
    );
    // The two carry DIFFERENT inks, and neither is the chip's. `+ Tag` is in the tag family
    // because a tag is what it adds; `or…` is quiet because it offers four kinds and favours none.
    assert.notEqual(report.tag.color, report.chip.color, 'the `+ Tag` pill carries the tag tint');
    assert.notEqual(report.or.color, report.tag.color, 'and `or…` is not in the tag family');
  } finally {
    await context.close();
  }

  // THE MARKUP HALF. A fixture goes on measuring itself long after the component stops emitting
  // it, so the claim that these ARE the two triggers is pinned at both call sites: neither may
  // ask for the chip shape whose own scoped block is what discarded the rules above.
  assert.doesNotMatch(
    orMenuGroupCardSource,
    /\n\s+triggerChip\b/,
    'the "or…" trigger is a bare button this sheet can style, not a Chip'
  );
  assert.doesNotMatch(
    readFileSync(
      resolve(__dirname, '../../src/ui/svelte/apps/manager/recipe/RecipeIngredientOption.svelte'),
      'utf8'
    ),
    /\n\s+triggerChip\b/,
    'and so is `+ Tag`'
  );
  for (const retired of ['manager-recipe-or-trigger', 'manager-recipe-tag-trigger']) {
    assert.doesNotMatch(
      css,
      new RegExp(`\\.manager-chip\\.${retired}`),
      `the discarded chip-bound rules for \`${retired}\` are retired rather than left reading as live`
    );
  }
});