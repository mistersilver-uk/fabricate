/**
 * Recipe browser, tag requirement and requirement-picker layout, measured in a real browser (issue 1670).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { recipeResultKinds } from '../../src/ui/svelte/components/resultRows.js';
import { scopedComponentCss, withScopeHash } from '../helpers/scoped-component-css.js';
import { openLayoutContext } from '../helpers/layout-harness.js';
import {
  createMountedComponentHarness,
  RESULT_ROW_COMPILED_MODULES,
  RESULT_ROW_RAW_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  TYPEAHEAD_RUNE_MODULES,
} from '../helpers/svelte-component-harness.js';

import {
  blockFor,
  chipCss,
  chipScoped,
  css,
  withChipHash,
} from './manager-layout-shared.js';
import {
  OR_MENU_GLYPHS,
  OR_MENU_KINDS,
  OR_MENU_LABELS,
  assertOneTrackPerGridChild,
  kindPickerFixture,
  orMenuSource,
} from './manager-layout-recipes-fixtures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The recipe library is a list of CARD rows (issue 643).
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
    headClusterBlock.includes('grid-template-columns: var(--fab-manager-recipe-cluster-cols);'),
    'the header cluster shares the row cluster column template so the two align'
  );
  assert.ok(
    clusterBlock.includes('grid-template-columns: var(--fab-manager-recipe-cluster-cols);'),
    'the row cluster consumes the same shared column template'
  );
  // The header hides at the stacked breakpoint.
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

  // The recipe row LEFT the shared 76px row-card geometry group.
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
    rowBlock.includes('padding: var(--fab-space-3);'),
    'the recipe row uses the library card padding'
  );
  // The recipe row's own radius (9px) was retired by issue 883: the edge.
  assert.equal(
    /border-radius:|border: 1px|background:/.test(rowBlock),
    false,
    'the recipe row must not restate the shared browser-row edge, corner or fill'
  );

  // A disabled row reads at .55, not .62.
  assert.ok(
    blockFor('.fabricate-manager .manager-recipe-row.is-off').includes('opacity: 0.55;'),
    'a disabled row recedes'
  );

  // Selection is the accent BORDER. A ring plus an inset left bar is the same statement
  // made twice, and the bar bit into the row's medallion. The COMPONENT row joined the
  // opt-out in issue 676: it now leads with the same Medallion, so it had the same defect.
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

// The collapse ladder (issue 643 §8). Drop order is fixed and monotonic.
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

  // The three status pills are all `white-space: nowrap`.
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
test('the recipe cluster appends a bulk selection column that the ladder never drops', () => {
  const declarations = [...css.matchAll(/--fab-manager-recipe-cluster-cols:\s*([^;]+);/g)].map(
    ([, value]) => value.replace(/\s+/g, ' ').trim()
  );
  assert.equal(
    declarations.length,
    3,
    "the base template plus the ladder's two rewrites — a fourth would be an unpinned band"
  );

  for (const declaration of declarations) {
    const tracks = [...declaration.matchAll(/var\(--fab-manager-recipe-col-([a-z]+)\)/g)].map(
      ([, name]) => name
    );
    assert.equal(
      tracks.at(-1),
      'select',
      `the select track must be LAST in "${declaration}" — the header placements assume an append`
    );
    // Never dropped: a truncated readout is a compromise.
    assert.equal(
      tracks.filter((track) => track === 'select').length,
      1,
      'the select track appears exactly once in every band'
    );
  }

  assert.ok(
    blockFor('.fabricate-manager .manager-recipes-table').includes(
      '--fab-manager-recipe-col-select: 22px;'
    ),
    'the track is the SelectionCheckbox `lg` box, declared rather than derived'
  );
});

// ── EVERY DECLARATION ON THE TAG CHIP'S RULE ACTUALLY WINS (issue 1373) ────────────────────
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
    declarations.length >= 3,
    'the rule still states the position and height the primitive has no opinion about'
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
              ${withChipHash(
                '<span class="manager-chip is-tag is-lit is-tag-run manager-recipe-tag-chip" data-recipe-tag="reagent"><span>#reagent</span><button type="button" class="manager-recipe-tag-remove"><i class="fas fa-times"></i></button></span>' +
                  '<span class="manager-chip is-tag is-lit is-tag-run manager-recipe-tag-chip" data-recipe-tag="rare"><span>#rare</span><button type="button" class="manager-recipe-tag-remove"><i class="fas fa-times"></i></button></span>'
              )}
            </span>
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate((wanted) => {
      const chips = Array.from(document.querySelectorAll('.manager-recipe-tag-chip'));
      const chip = chips[0];
      // The probe is a CLONE of the chip carrying one declaration inline.
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
  const stepperScoped = scopedComponentCss(
    resolve(__dirname, '../../src/ui/svelte/components/Stepper.svelte')
  );
  const segmentedScoped = scopedComponentCss(
    resolve(__dirname, '../../src/ui/svelte/components/SegmentedControl.svelte')
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

  // The trailing cluster is identical on every requirement row whatever its kind.
  const controls = `
      <div class="manager-recipe-option-controls">
        <div class="fab-stepper">
          <button type="button" class="fab-stepper-adjunct"><i class="fas fa-minus"></i></button>
          <input type="number" class="fab-stepper-input manager-recipe-option-quantity" value="2">
          <button type="button" class="fab-stepper-adjunct"><i class="fas fa-plus"></i></button>
        </div>
        <div class="fabricate-action-menu"><button type="button" class="manager-recipe-or-trigger"><span>or…</span></button></div>
        <button type="button" class="manager-recipe-option-remove"><i class="fas fa-xmark"></i></button>
      </div>`;

  const tagChips = `
        <span class="manager-chip is-tag is-lit is-tag-run manager-recipe-tag-chip" data-recipe-tag="abrasive"><span>#abrasive</span><button type="button" class="manager-recipe-tag-remove"><i class="fas fa-times"></i></button></span>
        <span class="manager-chip is-tag is-lit is-tag-run manager-recipe-tag-chip" data-recipe-tag="hide"><span>#hide</span><button type="button" class="manager-recipe-tag-remove"><i class="fas fa-times"></i></button></span>`;

  // The row exactly as `PickerRow` renders a tag requirement: the plate.
  const tagRow = (caseName, chips) =>
    stamp(`
    <div class="manager-recipe-ingredient-option-row is-tag" data-recipe-option data-case="${caseName}">
      <span class="manager-recipe-option-lead is-tag"><i class="fas fa-tag"></i></span>
      ${kindPickerFixture('Tag')}
      <span class="manager-recipe-option-tags" data-recipe-option-tags>${chips}
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
      ${kindPickerFixture('Component')}
      <span class="manager-recipe-option-name-field">
        <span class="manager-recipe-option-chosen" data-recipe-option-chosen><span class="manager-recipe-option-plate"><i class="fas fa-cube manager-recipe-option-mark is-component"></i></span><span class="manager-recipe-option-chosen-name">Iron Ingot</span><button type="button" class="manager-recipe-option-clear"><i class="fa-solid fa-xmark"></i></button></span>
      </span>${controls}
    </div>`);

  // `manager-recipe-edit-ingredients-cost` photographs the first.
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
        // THE ARM IS ONE LINE. Measured as "the arm is no taller than its tallest member".
        const tallest = Math.max(...measured.armMembers.map((member) => member.height));
        assert.ok(
          measured.arm.height <= tallest + 1,
          `${surface.label} (${surface.width}px): ${caseName} tag arm is ONE line - the chips ` +
            `and + Tag stay together (arm ${measured.arm.height}px vs tallest member ${tallest}px)`
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

      // AN EMPTY TAG ROW IS LEVEL WITH A COMPONENT ROW: every row stands on one 34px line (ruled 2026-10-18).
      if (!surface.rowParity) continue;
      assert.ok(
        Math.abs(report.empty.row.height - report.component.row.height) <= 1,
        `${surface.label} (${surface.width}px): an EMPTY tag requirement row is level with ` +
          `the component row beside it (${Math.round(report.empty.row.height)}px vs ` +
          `${Math.round(report.component.row.height)}px) - a taller one has moved a whole ` +
          `control onto a second line, and a shorter one has lost the row's 34px line`
      );
    } finally {
      await context.close();
    }
  }
});

// In foundry-native, the one palette where the tag ink and the tag hue part (issue 2534).
test("a tag chip is the choice-group drawing's 28px `#` pill in the tag ink", async () => {
  const context = await openLayoutContext({
    viewport: { width: 640, height: 200 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.setContent(`
      <!doctype html>
      <html lang="en" data-fabricate-theme="foundry-native">
        <head>
          <meta charset="utf-8">
          <style>
            @layer modules { ${css} }
            ${chipCss}
            body { margin: 0; padding: 24px; font-family: Arial, sans-serif; }
            .fas::before { content: "x"; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            <span class="manager-recipe-option-tags" data-recipe-option-tags>
              ${withChipHash(
                '<span class="manager-chip is-tag is-lit is-tag-run manager-recipe-tag-chip" data-recipe-tag="solvent"><span>#solvent</span><button type="button" class="manager-recipe-tag-remove"><i class="fas fa-times"></i></button></span>'
              )}
            </span>
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const chip = document.querySelector('[data-recipe-tag="solvent"]');
      const resolved = (property, value) => {
        const probe = document.createElement('span');
        probe.style.setProperty(property, value);
        chip.append(probe);
        const used = getComputedStyle(probe).getPropertyValue(property);
        probe.remove();
        return used;
      };
      const style = getComputedStyle(chip);
      return {
        height: chip.getBoundingClientRect().height,
        radius: style.borderTopLeftRadius,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        textTransform: style.textTransform,
        color: style.color,
        // ratchet-exempt(lint): innerText applies text-transform, so it reads the chip as drawn.
        text: chip.innerText.trim(),
        tagInk: resolved('color', 'var(--fab-purple-text)'),
        hue: resolved('color', 'var(--fab-purple)'),
        removeSize: getComputedStyle(chip.querySelector('.manager-recipe-tag-remove')).fontSize,
        oldChipSize: resolved('font-size', '0.62rem'),
      };
    });

    assert.equal(report.height, 28, 'the drawing: 28px');
    assert.equal(report.radius, '999px', 'the drawing: a pill');
    assert.equal(report.fontSize, '11px', 'the drawing: 11px');
    assert.equal(report.fontWeight, '600', 'the drawing: 600');
    assert.equal(report.textTransform, 'none', 'a tag is drawn as stored, never capitalised');
    assert.equal(report.text, '#solvent', 'the chip reads `#` and the stored spelling');
    assert.notEqual(report.tagInk, report.hue, 'foundry-native parts the tag ink from its hue');
    assert.equal(report.color, report.tagInk, 'the lit chip inks with `--fab-purple-text`');
    assert.equal(report.removeSize, report.oldChipSize, 'the `×` keeps its 0.62rem (ruling 4)');
  } finally {
    await context.close();
  }
});

test('a suggestion reads from the left edge the typed query does, under the host button rule', async () => {
  // `proto:2280` draws a suggestion as `display:flex; align-items:center; gap:8px; height:30px;
  // padding:0 8px`, then a 12px glyph and a label at `font:500 11px var(--sans)`. There is no
  // centring anywhere in it, and there cannot be: the panel shares the left edge of the field it
  // completes, so a suggestion that does not start where the query starts is not continuing the
  // GM's own typing (issue 1373, maintainer round 7).
  // IT SHIPPED CENTRED, and the sheet looked right. `.manager-recipe-option-suggestion` is a
  // `<button>` declaring `display: flex` and `text-align: left` - and `text-align` positions
  // the CONTENT of a text container, not the ITEMS of a flex one, so it landed on nothing.
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
                <span class="manager-recipe-option-search">
                  <i class="fa-solid fa-magnifying-glass"></i>
                  <input type="text" data-recipe-option-search value="ingot" role="combobox" placeholder="Search components...">
                </span>
              </span>
            </div>
            <!-- The list as it renders: portalled out of the row to the application root, with the
                 placement the typeahead panel action writes inline, beneath the field and sharing
                 its left edge. -->
            <span class="manager-recipe-option-suggestions" role="listbox" style="left: 0px; right: auto; width: 300px; min-width: 300px; max-width: 300px; max-height: 232px; top: 34px; bottom: auto;">
              <button type="button" class="manager-recipe-option-suggestion" data-recipe-option-suggestion="sm-iron-ingot" role="option" tabindex="-1" aria-selected="false">
                <i class="fas fa-cube manager-recipe-option-mark is-component"></i><span>Iron Ingot</span>
              </button>
            </span>
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
        // …and where the LABEL lands against the query it is completing.
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
  const popoverScoped = scopedComponentCss(
    resolve(__dirname, '../../src/ui/svelte/components/SearchablePopoverPanel.svelte')
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

    assert.equal(report.panel.radius, '11px', 'proto:2258 draws 10px; the panel rung is 11');
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

test("the tag catalogue's new-tag footer keeps a long name inside the 300px panel (issue 2515)", async () => {
  const popoverScoped = scopedComponentCss(
    resolve(__dirname, '../../src/ui/svelte/components/SearchablePopoverPanel.svelte')
  );
  const name = 'a-very-long-tag-name-that-runs-past-forty-characters';
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
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            ${withScopeHash(
              `<div class="fabricate-picker-popover manager-travel-popover" data-probe="panel" style="width: 300px; min-width: 300px; max-width: 300px">
                <div class="manager-recipe-tag-create" data-probe="footer">
                  <button type="button" class="fabricate-button fab-manager-button is-ghost is-full-width" data-recipe-tag-create title="New tag “${name}”">
                    <i class="fa-solid fa-plus"></i><span data-probe="label">New tag “${name}”</span>
                  </button>
                </div>
              </div>`,
              'manager-travel-popover',
              popoverScoped.hashClass
            )}
          </main>
        </body>
      </html>
    `);
    const report = await page.evaluate(() => {
      const at = (probe) => document.querySelector(`[data-probe="${probe}"]`);
      const panel = at('panel');
      const button = document.querySelector('[data-recipe-tag-create]');
      const label = at('label');
      const panelStyle = getComputedStyle(panel);
      return {
        panelInner: panel.getBoundingClientRect().right - Number.parseFloat(panelStyle.paddingRight),
        buttonRight: button.getBoundingClientRect().right,
        labelRight: label.getBoundingClientRect().right,
        clipped: label.scrollWidth > label.clientWidth,
        textOverflow: getComputedStyle(label).textOverflow,
        rule: getComputedStyle(at('footer')).borderTopWidth,
      };
    });
    assert.ok(
      report.buttonRight <= report.panelInner + 0.5,
      `the footer button stays inside the panel (${report.buttonRight} vs ${report.panelInner})`
    );
    assert.ok(report.labelRight <= report.buttonRight, 'and its label inside the button');
    assert.ok(report.clipped, 'the long name is cut rather than widening the panel');
    assert.equal(report.textOverflow, 'ellipsis', 'with an ellipsis');
    assert.equal(report.rule, '1px', 'the footer sits under its hairline');
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
  const segmentedScoped = scopedComponentCss(
    resolve(__dirname, '../../src/ui/svelte/components/SegmentedControl.svelte')
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
            <span data-probe="lit" style="color: var(--fab-purple-soft)"></span>
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
      // The ring is `:has(:focus-visible)`.
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
  // `proto:4645` resolves the entry PER ROW, and premium's `RewardRow` puts the same
  // `presentation.tint` on the plate (`:62`) AND on the chosen chip's glyph (`:80`) and on
  // each suggestion's (`:129`). The plate shipped tinted; the chip and the suggestions did
  // not, so a NAMED row's mark was one inherited ink whatever kind the row was.
  const context = await openLayoutContext({
    viewport: { width: 900, height: 420 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    const rowFor = (kind, icon) => `
      <div class="manager-recipe-ingredient-option-row is-${kind}" data-recipe-option>
        <span class="manager-recipe-option-lead is-${kind}" data-plate="${kind}"><i class="${icon}"></i></span>
        ${kindPickerFixture(kind)}
        <span class="manager-recipe-option-name-field">
          <span class="manager-recipe-option-chosen" data-recipe-option-chosen>
            <span class="manager-recipe-option-plate"><i class="${icon} manager-recipe-option-mark is-${kind}" data-mark="${kind}"></i></span>
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
    // …and the four are four, not one token wearing four class names.
    assert.equal(
      new Set(report.map((kind) => kind.plate)).size,
      4,
      `the four kinds resolve to four distinct tints (${report.map((k) => `${k.kind}=${k.plate}`).join(', ')})`
    );
  } finally {
    await context.close();
  }
});

test("the requirement row draws the library specimen's figures (issue 2515)", async () => {
  const context = await openLayoutContext({
    viewport: { width: 900, height: 320 },
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
            body { margin: 0; padding: 24px; font-family: Arial, sans-serif; }
            .fas::before, .fa-solid::before { content: "x"; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager" style="width: 820px">
            <div class="manager-recipe-ingredient-option-row is-component" data-recipe-option>
              <span class="manager-recipe-option-lead is-component" data-probe="lead"><i class="fas fa-cube"></i></span>
              ${kindPickerFixture('Component')}
              <span class="manager-recipe-option-name-field">
                <span class="manager-recipe-option-chosen" data-probe="cell">
                  <span class="manager-recipe-option-plate" data-probe="plate"><i class="fas fa-cube manager-recipe-option-mark is-component"></i></span>
                  <span class="manager-recipe-option-chosen-name">Ore</span>
                  <button type="button" class="manager-recipe-option-clear" data-probe="clear"><i class="fa-solid fa-xmark"></i></button>
                </span>
              </span>
              <div class="manager-recipe-option-controls">
                <div class="fabricate-action-menu"><button type="button" class="manager-recipe-or-trigger" data-probe="or"><span>or…</span></button></div>
                <button type="button" class="manager-recipe-option-remove" data-probe="remove"><i class="fas fa-xmark"></i></button>
              </div>
            </div>
            <div class="manager-progressive-stage-row">
              <div class="manager-recipe-ingredient-option-row is-component is-result" data-probe="stage">
                <span class="manager-recipe-option-name-field">
                  <span class="manager-recipe-option-chosen"><span class="manager-recipe-option-plate"><i class="fas fa-cube"></i></span><span class="manager-recipe-option-chosen-name">Herb</span></span>
                </span>
              </div>
            </div>
            <div class="manager-recipe-ingredient-option-row is-component" data-recipe-option>
              <span class="manager-recipe-option-lead is-empty"><i class="fas fa-cube"></i></span>
              <span class="manager-recipe-option-name-field">
                <span class="manager-recipe-option-search" data-probe="search">
                  <i class="fa-solid fa-magnifying-glass"></i>
                  <input type="text" placeholder="Search components...">
                </span>
              </span>
            </div>
            <span data-token="strong" style="color: var(--fab-border-strong)"></span>
            <span data-token="accent-border" style="color: var(--fab-accent-border)"></span>
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const at = (name) => document.querySelector(`[data-probe="${name}"]`);
      const read = (name) => {
        const rect = at(name).getBoundingClientRect();
        const style = getComputedStyle(at(name));
        return {
          width: rect.width,
          height: rect.height,
          right: rect.right,
          radius: style.borderTopLeftRadius,
          border: style.borderTopColor,
        };
      };
      const token = (name) =>
        getComputedStyle(document.querySelector(`[data-token="${name}"]`)).color;
      return {
        lead: read('lead'),
        plate: read('plate'),
        cell: read('cell'),
        clear: read('clear'),
        search: read('search'),
        or: read('or'),
        remove: read('remove'),
        stage: {
          ...read('stage'),
          minHeight: getComputedStyle(at('stage')).minHeight,
          tallest: Math.max(
            ...[...at('stage').children].map((child) => child.getBoundingClientRect().height)
          ),
        },
        strong: token('strong'),
        accentBorder: token('accent-border'),
      };
    });

    for (const name of ['lead', 'plate']) {
      const box = report[name];
      assert.deepEqual([box.width, box.height, box.radius], [26, 26, '6px'], `the ${name} plate`);
    }
    assert.equal(report.cell.height, 34, 'the subject cell stands at 34');
    assert.ok(
      report.cell.width >= 180,
      `the subject cell is never under 180 (${report.cell.width})`
    );
    assert.equal(report.cell.radius, '7px', 'the subject cell corners at 7');
    assert.equal(report.cell.border, report.strong, 'the subject cell is edged neutral-strong');
    assert.equal(
      report.cell.right - report.clear.right,
      5,
      "a short name's clear stands 4px plus the border inside the cell's end edge"
    );
    assert.equal(report.search.height, 34, 'the search stands at the cell height');
    assert.equal(report.search.radius, '7px', 'the search corners at 7');
    assert.equal(
      report.search.border,
      report.accentBorder,
      'the search rests on the partial accent'
    );
    assert.equal(report.or.height, 28, '`or…` stands at 28');
    assert.deepEqual(
      [report.remove.width, report.remove.height, report.remove.radius],
      [24, 24, '7px'],
      'the remove is 24 by 24 at radius 7 (ruled 2026-10-18)'
    );
    // A progressive stage row drops the row's box, so it drops the 52px floor with it.
    assert.equal(report.stage.minHeight, '0px', 'the stage row lifts the row floor');
    assert.equal(report.stage.height, report.stage.tallest, 'and stands as tall as its subject');
  } finally {
    await context.close();
  }
});

const REPO_ROOT = resolve(__dirname, '../..');
const RESULT_TREE = [...new Set([...SELECT_COMPILED_MODULES, ...RESULT_ROW_COMPILED_MODULES])];

/** `ChoiceGroup` mounted once per props object, as its callers draw it. */
async function choiceGroupMarkup(mounts) {
  const harness = createMountedComponentHarness({
    repoRoot: REPO_ROOT,
    tmpPrefix: 'fabricate-result-wrap-',
    rawModules: [...SEARCHABLE_POPOVER_RAW_MODULES, ...RESULT_ROW_RAW_MODULES],
    runeModules: TYPEAHEAD_RUNE_MODULES,
    compiledModules: RESULT_TREE,
    componentPath: 'src/ui/svelte/components/ChoiceGroup.svelte',
  });
  await harness.setup();
  try {
    const markup = [];
    for (const props of mounts) {
      markup.push((await harness.mount(props)).innerHTML);
      harness.remount();
    }
    return markup;
  } finally {
    harness.teardown();
  }
}

/** `ChoiceGroup`'s result side mounted once per entry, as a recipe's reward set draws it. */
function resultGroupMarkup(entries) {
  const offer = recipeResultKinds({
    componentOptions: [{ id: 'cmp-ingot', name: 'Iron Ingot' }],
    currencyUnits: [
      { id: 'gold', label: 'Gold', abbreviation: 'gp' },
      { id: 'mark', label: 'Guild mark', abbreviation: 'gold' },
    ],
    currencyEnabled: true,
  });
  return choiceGroupMarkup(
    entries.map((group) => ({ side: 'result', group, offer, reward: true }))
  );
}

/** A page drawing `body` under the core floor, the module sheet and the tree's scoped blocks. */
function mountedGroupPage(body) {
  const scoped = RESULT_TREE.filter((path) =>
    readFileSync(resolve(REPO_ROOT, path), 'utf8').includes('\n<style>')
  ).map((path) => scopedComponentCss(resolve(REPO_ROOT, path)).css);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
      <style>${readFileSync(resolve(REPO_ROOT, 'tests/fixtures/foundry-core-min.css'), 'utf8')}</style>
      <style>@layer modules { ${css} }</style>
      <style>${scoped.join('\n')}</style>
      <style>:root { --font-primary: Arial, sans-serif; } body { margin: 0; }
        .fas::before, .fa-solid::before { content: "x"; }
        .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }</style>
      </head><body>${body}</body></html>`;
}

// Arial, not Signika: its natural wrap (flat about 706-710, members about 799-800) sits 7-11px under
// the rules, so this test pins the rule values and not the real-font fit, which View Lab measures.
test('the widest result rows hold one line just over each wrap rule, and wrap by rule at it (issue 2515)', async () => {
  const ranged = (entry, from, to) => ({ ...entry, selectionRange: { from, to } });
  const markup = await resultGroupMarkup([
    { id: 'r1', kind: 'currency', unit: 'gold', quantity: 5 },
    { id: 'r2', kind: 'currency', unit: 'mark', quantity: 5 },
    {
      id: 'g1',
      chooser: 'rolled',
      selectionFormula: '1d20',
      alternatives: [
        ranged({ id: 'a', kind: 'currency', unit: 'gold', quantity: 5 }, 1, 10),
        ranged({ id: 'b', componentId: 'cmp-ingot', quantity: 1 }, 11, 20),
      ],
    },
  ]);
  const context = await openLayoutContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  try {
    await page.setContent(
      mountedGroupPage(`<main class="fabricate-manager" style="width: 1100px">
        <div class="manager-recipe-ingredient-set-groups">${markup[0]}${markup[1]}</div>
        ${markup[2]}
      </main>`)
    );
    const layoutAt = (list, width) =>
      page.evaluate(
        ([selector, inline]) => {
          const container = document.querySelector(selector);
          container.style.cssText = `width: ${inline}px; max-width: none; min-width: 0; flex: none`;
          const rows = [...container.querySelectorAll(':scope > .is-result')];
          return rows.map((row) => {
            const controls = row.querySelector(':scope > .manager-recipe-option-controls');
            const parts = [
              ...row.querySelectorAll(':scope > :not(.manager-recipe-option-controls)'),
              ...controls.children,
            ].filter(
              (part) =>
                !part.matches('.manager-recipe-reward-body, .manager-recipe-option-invalid') &&
                part.getBoundingClientRect().width > 0
            );
            const centre = (part) => {
              const box = part.getBoundingClientRect();
              return box.top + box.height / 2;
            };
            const tops = [...new Set(parts.map((part) => Math.round(centre(part))))].sort(
              (a, b) => a - b
            );
            const lineStarts = tops.filter(
              (top, index) => index === 0 || top - tops[index - 1] > 8
            );
            const lineOf = (part) =>
              lineStarts.filter((start) => Math.round(centre(part)) >= start).length;
            const remove = row.querySelector('.manager-recipe-option-remove');
            const amount = row.querySelector('[data-recipe-option-amount-mode]');
            const lastOnRemoveLine = parts
              .filter((part) => lineOf(part) === lineOf(remove))
              .every(
                (part) => part.getBoundingClientRect().right <= remove.getBoundingClientRect().right
              );
            return {
              byRule: getComputedStyle(controls).display === 'contents',
              lines: lineStarts.length,
              removeLine: lineOf(remove),
              amountLine: lineOf(amount),
              lastOnRemoveLine,
            };
          });
        },
        [list, width]
      );

    const FLAT = '.manager-recipe-ingredient-set-groups';
    const MEMBERS = '.manager-recipe-result-group-members';
    for (const [list, rule, removeLine] of [
      [FLAT, 719, 2],
      [MEMBERS, 809, 1],
    ]) {
      const over = await layoutAt(list, rule + 1);
      assert.equal(over.length, 2, `${list}: two rows measured`);
      for (const row of over) {
        assert.deepEqual([row.byRule, row.lines], [false, 1], `${list} at ${rule + 1}: one line`);
      }
      for (const row of await layoutAt(list, rule)) {
        assert.deepEqual(
          [row.byRule, row.lines, row.amountLine, row.removeLine, row.lastOnRemoveLine],
          [true, 2, 2, removeLine, true],
          `${list} at ${rule}: two lines by rule, the remove ending line ${removeLine}`
        );
      }
    }

    const unit = await page.evaluate(() => {
      const long = document.querySelectorAll('[data-recipe-option-unit]')[1];
      return {
        text: long.textContent,
        title: long.title,
        width: long.getBoundingClientRect().width,
        clipped: long.scrollWidth > long.clientWidth,
        overflow: getComputedStyle(long).textOverflow,
      };
    });
    assert.deepEqual([unit.text, unit.title], ['gold', 'gold'], 'the long unit, titled in full');
    assert.ok(unit.width <= 16 && unit.clipped, `it is cut at 16px (${unit.width})`);
    assert.equal(unit.overflow, 'ellipsis', 'with an ellipsis');
  } finally {
    await context.close();
  }
});

// Ruled 2026-10-18 (issue 2515): no separator, header to first row 8, rows 8 apart, adder 8 below.
test('a choice group stands its header, rows and 28px adder 8px apart, with no separator, on both sides', async () => {
  const offer = recipeResultKinds({
    componentOptions: [{ id: 'cmp-ingot', name: 'Iron Ingot' }],
    currencyUnits: [{ id: 'gold', label: 'Gold', abbreviation: 'gp' }],
    currencyEnabled: true,
  });
  const markup = await choiceGroupMarkup([
    {
      group: {
        id: 'g-ing',
        options: [
          { quantity: 1, match: { type: 'component', componentId: 'cmp-ingot' } },
          { quantity: 2, match: { type: 'component', componentId: 'cmp-hide' } },
          { quantity: 1, match: { type: 'tags', tags: [], tagMatch: 'any' } },
        ],
      },
      componentOptions: [
        { id: 'cmp-ingot', name: 'Iron Ingot' },
        { id: 'cmp-hide', name: 'Tanned Hide' },
      ],
      itemTags: ['abrasive'],
    },
    {
      // "Up to N", where the bundle is not exclusive and a separator would misread it.
      side: 'result',
      reward: true,
      offer,
      group: {
        id: 'g-res',
        awardStrategy: 'upTo',
        awardCount: 2,
        alternatives: [
          { id: 'a', componentId: 'cmp-ingot', quantity: 1 },
          { id: 'b', kind: 'currency', unit: 'gold', quantity: 5 },
          { id: 'c', componentId: 'cmp-ingot', quantity: 2 },
        ],
      },
    },
  ]);
  const context = await openLayoutContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  try {
    await page.setContent(
      mountedGroupPage(`<main class="fabricate-manager" style="width: 1006px">
        <div data-side="ingredient">${markup[0]}</div><div data-side="result">${markup[1]}</div>
      </main>`)
    );
    const report = await page.evaluate(() => {
      const box = (node) => node.getBoundingClientRect();
      const tokens = (name) => {
        const probe = document.createElement('span');
        probe.style.color = `var(${name})`;
        document.querySelector('main').append(probe);
        return getComputedStyle(probe).color;
      };
      const read = (side) => {
        const group = document.querySelector(`[data-side="${side}"] .has-alternatives`);
        const [head, options, adds] = group.children;
        const rows = [...options.children];
        const adder = adds.querySelector('button');
        const style = getComputedStyle(group);
        return {
          rowsOnly: rows.every((row) => row.matches('[data-recipe-option]')),
          headToRow: box(rows[0]).top - box(head).bottom,
          between: rows.slice(1).map((row, index) => box(row).top - box(rows[index]).bottom),
          rowToAdder: box(adder).top - box(rows.at(-1)).bottom,
          rowHeights: rows.map((row) => box(row).height),
          rowGround: getComputedStyle(rows[0]).backgroundColor,
          adder: [box(adder).height, getComputedStyle(adder).borderTopLeftRadius],
          ground: style.backgroundColor,
          radius: style.borderTopLeftRadius,
        };
      };
      return {
        ingredient: read('ingredient'),
        result: read('result'),
        accentSoft: tokens('--fab-accent-soft'),
        bg1: tokens('--fab-bg-1'),
      };
    });
    for (const side of ['ingredient', 'result']) {
      const group = report[side];
      const at = `the ${side} group`;
      assert.ok(group.rowsOnly, `${at}: the rows stand with nothing between them`);
      assert.equal(group.headToRow, 8, `${at}: header to first row`);
      assert.deepEqual(group.between, [8, 8], `${at}: rows 8 apart`);
      assert.equal(group.rowToAdder, 8, `${at}: the adder 8 below the last row`);
      assert.deepEqual(group.adder, [28, '7px'], `${at}: the adder at 28, radius 7`);
      assert.deepEqual([group.ground, group.radius], [report.accentSoft, '9px'], `${at}: the box`);
      assert.equal(group.rowGround, report.bg1, `${at}: member rows on bg-1`);
    }
    // Every row stands on one 34px line: the tag row is level with the named rows.
    assert.deepEqual(report.ingredient.rowHeights, [52, 52, 52], 'tag and component rows level');
  } finally {
    await context.close();
  }
});

test('kindPickerFixture spells classes Select.svelte still emits, not dead markup', () => {
  const selectSource = readFileSync(
    resolve(__dirname, '../../src/ui/svelte/components/Select.svelte'),
    'utf8'
  );
  for (const spelled of ['fabricate-select-trigger', 'fabricate-select-value']) {
    assert.ok(
      selectSource.includes(spelled),
      `${spelled} (from the kind picker fixture) is no longer in Select.svelte's source`
    );
  }
  assert.ok(
    selectSource.includes('fabricate-select-trigger-') && selectSource.includes('inline'),
    'the `inline` rung and its trigger-class template are no longer in Select.svelte'
  );
});

test('the Books & Scrolls route names one grid track per section and grows the table', () => {
  // THE PAGER IS A FOURTH CHILD AND THE SHEET NAMES THREE TRACKS.
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
// three-track `auto auto 1fr`. Deleting the header took it to two, and issue 1915 to ONE: the tab
// strip is retired and the shared vocabulary shell is `<main>`'s only child, so a leading `auto`
// track would size the shell's status line and leave the growing track to the panels below it.
test('the Tags & Categories route names one grid track for the shell it now renders', () => {
  assertOneTrackPerGridChild({
    viewFile: 'TagsCategoriesView.svelte',
    route: 'tags',
    expectedChildren: 1,
    growingLabel: 'the scrolling vocabulary shell',
    autoLabel: 'nothing else',
  });
});

// The SAME defect family, a third time.
test('the Component Rules route names one grid track per child and grows the list', () => {
  assertOneTrackPerGridChild({
    viewFile: 'ComponentsBrowserView.svelte',
    route: 'components',
    expectedChildren: 4,
    // THE LIST IS THE THIRD OF FOUR, not the last: the pager is a real child below it.
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
      <button type="button" class="fabricate-icon-button"><i class="fas fa-trash"></i></button>
    </div>`;
    await page.setContent(
      withChipHash(
        `<style>${css}</style><style>${chipCss}</style><div class="fabricate-manager" data-manager-view="tags"><div class="manager-body"><main class="manager-main manager-tags-categories"><div class="manager-vocabulary-shell"><div class="manager-vocabulary-shell-grid"><section class="manager-vocabulary-shell-panel" data-vocabulary-panel="recipeCategories"><section class="manager-vocabulary-panel"><div class="manager-vocabulary-list"><div class="manager-vocabulary-card is-locked" data-vocabulary-locked-card>${lockedRow}</div><div class="manager-vocabulary-card" data-vocabulary-custom-card>${customRow}</div></div></section></section></div><span class="manager-chip" data-default-chip-reference>Default</span></div></main></div></div>`
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
        // A chip that exists to BE the default.
        defaultChipBackground: getComputedStyle(
          document.querySelector('[data-default-chip-reference]')
        ).backgroundColor,
      };
    });
    // The IconPicker's own `.essence-icon-picker-trigger` block is a full-width.
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

    // Two facts about the chip that ONLY a real browser can establish.
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
  const kickerScoped = scopedComponentCss(
    resolve(__dirname, '../../src/ui/svelte/components/Kicker.svelte')
  );

  // The panel exactly as `ActionMenu` portals it with a heading: the heading beside the menu.
  const panel = withScopeHash(
    '<div class="fabricate-action-menu-panel manager-action-menu-panel manager-recipe-or-menu">' +
      '<div class="manager-action-menu-heading" id="or-menu-heading">' +
      '<span class="fab-kicker">Accept instead</span></div>' +
      '<div class="manager-action-menu-list" role="menu" aria-labelledby="or-menu-heading">' +
      OR_MENU_KINDS.map(
        (kind) =>
          `<button type="button" class="manager-action-menu-item is-${kind}" role="menuitem" data-recipe-add="alternative-${kind}" data-kind="${kind}">` +
          `<i class="${OR_MENU_GLYPHS[kind]}"></i>` +
          `<span>${OR_MENU_LABELS[kind]}</span></button>`
      ).join('') +
      '</div></div>',
    'fab-kicker',
    kickerScoped.hashClass
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
            ${kickerScoped.css}
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
      const panelNode = document.querySelector('.manager-recipe-or-menu');
      const panelStyle = getComputedStyle(panelNode);
      const heading = panelNode.querySelector('.fab-kicker');
      const entries = [...panelNode.querySelectorAll('[data-recipe-add]')].map((entry) => {
        const glyph = entry.querySelector('i');
        const label = entry.querySelector('span');
        const style = getComputedStyle(entry);
        const box = entry.getBoundingClientRect();
        const labelStyle = getComputedStyle(label);
        return {
          kind: entry.dataset.kind,
          justifyContent: style.justifyContent,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          minHeight: style.minHeight,
          borderRadius: style.borderTopLeftRadius,
          height: Number(box.height.toFixed(2)),
          // The offset of the glyph from the entry's own padding edge.
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
    assert.equal(report.panel.borderRadius, '11px', "the shared menu panel's 11 (issue 2257)");
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
      assert.equal(entry.minHeight, '28px', `\`proto:4683\`: a 28px ${entry.kind} entry`);
      assert.equal(entry.borderRadius, '7px', `the ${entry.kind} entry is concentric at 7`);
      assert.ok(entry.height >= 28, `the ${entry.kind} entry paints 28px or more (${entry.height}px)`);
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

  // The width's own source. The sheet sizes the panel by the class the caller hands the menu.
  assert.match(
    orMenuSource,
    /menuClass="manager-recipe-or-menu"/,
    '`proto:2292` fixes the panel at 150px through the class the measured panel carries'
  );
});



test("the requirement row's two dashed affordances paint at all, and at the design's two scales", async () => {
  // MEASURED, BECAUSE THE SHEET SAID OTHERWISE AND WAS NOT PAINTING (issue 1373, round 8).
  // In foundry-native, the one palette where the tag ink parts from the tag hue (issue 2534).
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
      <html lang="en" data-fabricate-theme="foundry-native">
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
            <div class="fabricate-action-menu">
              <button type="button" class="manager-recipe-or-trigger" data-or-trigger>
                <span>or…</span>
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
          paddingInline: [style.paddingLeft, style.paddingRight],
        };
      };
      const ink = (value) => {
        const probe = document.createElement('span');
        probe.style.color = value;
        document.querySelector('main').append(probe);
        return getComputedStyle(probe).color;
      };
      return {
        muted: ink('var(--fab-text-muted)'),
        tagInk: ink('var(--fab-purple-text)'),
        or: read('[data-or-trigger]'),
        tag: read('[data-tag-trigger]'),
        chip: read('[data-plain-chip]'),
      };
    });

    // THE CONTROL IN BOTH SENSES. This is what the two affordances were rendering as.
    assert.equal(
      report.chip.borderStyle,
      'solid',
      'the plain chip is the filled solid-edged badge both affordances were shipping as'
    );

    // The library `<PickerRow>` specimen's dashed button: 28px, level with the stepper it stands
    // beside, a 7px corner, and 11px/600 muted text at 12px padding (ruled 2026-10-18).
    assert.equal(report.or.borderStyle, 'dashed', 'the "or…" trigger is an affordance, not a fill');
    assert.equal(report.or.height, 28, 'the specimen: 28px');
    assert.equal(report.or.borderRadius, '7px', 'the specimen: a 7px corner');
    assert.equal(report.or.fontSize, '11px', 'the specimen: 11px');
    assert.equal(report.or.fontWeight, '600', 'the specimen: 600');
    assert.equal(report.or.color, report.muted, 'the specimen: muted ink');
    assert.deepEqual(report.or.paddingInline, ['12px', '12px'], 'the specimen: 12px padding');
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

    // The library choice-group unit's dashed `button.k-chip`: a 28px pill in the tag ink at
    // 11px/600, level with the 28px chips it stands among (issue 2534).
    assert.equal(report.tag.borderStyle, 'dashed', 'the `+ Tag` pill is an affordance too');
    assert.equal(report.tag.height, 28, 'the drawing: 28px, the chips\' height');
    assert.equal(report.tag.borderRadius, '999px', 'the drawing: a pill');
    assert.equal(report.tag.fontSize, '11px', 'the drawing: 11px');
    assert.equal(report.tag.fontWeight, '600', 'the drawing: 600');
    assert.deepEqual(report.tag.paddingInline, ['12px', '12px'], 'the drawing: 12px padding');
    assert.equal(report.tag.color, report.tagInk, 'the drawing: the tag ink, `--fab-purple-text`');
    assert.equal(
      report.tag.background,
      'rgba(0, 0, 0, 0)',
      'the drawing gives it no fill either — the chips beside it are the filled things'
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
    orMenuSource,
    /\n\s+triggerChip\b/,
    'the "or…" trigger is a bare button this sheet can style, not a Chip'
  );
  assert.doesNotMatch(
    readFileSync(
      resolve(__dirname, '../../src/ui/svelte/components/PickerRow.svelte'),
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

test('Repeats is the "up to N, by roll" drawing\'s quiet 26px status button (issue 2534)', async () => {
  const button = (hook, disabled = '') =>
    `<button type="button" class="fabricate-button fab-manager-button manager-recipe-award-repeats" ${hook} ${disabled}><i class="fa-solid fa-ellipsis" aria-hidden="true"></i><span>Unique</span></button>`;
  const context = await openLayoutContext({
    viewport: { width: 640, height: 200 },
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
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
            .fa-solid::before { content: "x"; }
          </style>
        </head>
        <body>
          <main class="fabricate-manager">
            ${button('data-repeats')}
            ${button('data-repeats-off', 'disabled')}
            <button type="button" class="fabricate-button fab-manager-button" data-family-off disabled>Off</button>
          </main>
        </body>
      </html>
    `);

    const report = await page.evaluate(() => {
      const repeats = document.querySelector('[data-repeats]');
      const style = getComputedStyle(repeats);
      const probe = document.createElement('span');
      probe.style.color = 'var(--fab-text-secondary)';
      document.querySelector('main').append(probe);
      const edge = (selector) => getComputedStyle(document.querySelector(selector)).borderTopColor;
      return {
        height: repeats.getBoundingClientRect().height,
        radius: style.borderTopLeftRadius,
        border: style.borderTopColor,
        color: style.color,
        secondary: getComputedStyle(probe).color,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        markSize: getComputedStyle(repeats.querySelector('i.fa-ellipsis')).fontSize,
        offEdge: edge('[data-repeats-off]'),
        familyOffEdge: edge('[data-family-off]'),
      };
    });

    assert.equal(report.height, 26, 'the drawing: 26px, under the family\'s 34px');
    assert.equal(report.radius, '7px', 'the drawing: a 7px corner (A3)');
    assert.equal(report.border, 'rgba(0, 0, 0, 0)', 'the drawing: no edge');
    assert.equal(report.color, report.secondary, 'the drawing: secondary ink');
    assert.equal(report.fontSize, '10.5px', 'the drawing: 10.5px');
    assert.equal(report.fontWeight, '500', 'the drawing: 500');
    assert.equal(report.markSize, '11px', 'the `···` mark is 11px');
    assert.equal(report.offEdge, report.familyOffEdge, 'a disabled Repeats keeps the family edge');
  } finally {
    await context.close();
  }
});
