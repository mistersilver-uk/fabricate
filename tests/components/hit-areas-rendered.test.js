/**
 * Issue 1523 — every small pointer target offers 24 by 24 pixels (WCAG 2.2 section 2.5.8) without
 * its paint moving, measured in Chromium. For each control: the target (its box, joined with the
 * `::before` that extends it) is at least 24 by 24; the painted box keeps its pinned size and its
 * neighbour keeps its pinned gap; a point inside the extension resolves to the control, and a point
 * on the neighbour's own edge resolves to the neighbour, so no two hit areas overlap.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;

const snippet = (html) => createRawSnippet(() => ({ render: () => html }));
const GLYPH = '<i class="fas fa-xmark" aria-hidden="true"></i>';

/** The mounted primitives, each by the harness that compiles it. */
const MOUNTS = Object.freeze({
  stepper: { name: 'Stepper', props: { value: 3, min: 0, max: 9, ariaLabel: 'Count' } },
  fill: { name: 'Stepper', props: { value: 3, min: 0, max: 9, ariaLabel: 'Count', fill: true } },
  vertical: {
    name: 'Stepper',
    props: { value: 3, min: 0, max: 9, ariaLabel: 'Count', orientation: 'vertical' },
  },
  compact: { name: 'SelectionCheckbox', props: { density: 'compact', ariaLabel: 'Pick' } },
  default: { name: 'SelectionCheckbox', props: { density: 'default', ariaLabel: 'Pick' } },
  comfortable: {
    name: 'SelectionCheckbox',
    props: { density: 'comfortable', ariaLabel: 'Pick' },
  },
  chip: {
    name: 'Chip',
    props: {
      removable: true,
      removeLabel: 'Remove',
      onRemove: () => {},
      children: snippet('<span>Tag</span>'),
    },
  },
  recipeChip: {
    name: 'Chip',
    props: {
      tone: 'info',
      class: 'manager-recipe-filter-chip',
      children: snippet(
        `<span style="display:contents"><span>Filter</span><button type="button" class="manager-recipe-chip-clear" aria-label="Clear">${GLYPH}</button></span>`
      ),
    },
  },
  tagPill: {
    name: 'Chip',
    props: {
      tone: 'positive',
      class: 'manager-selected-tag-pill',
      children: snippet(
        `<span style="display:contents"><span>Tag</span><button type="button" aria-label="Remove">${GLYPH}</button></span>`
      ),
    },
  },
  componentChip: {
    name: 'Chip',
    props: {
      tone: 'info',
      class: 'manager-component-filter-chip',
      children: snippet(
        `<span style="display:contents"><span>Filter</span><button type="button" class="manager-component-chip-clear" aria-label="Clear">${GLYPH}</button></span>`
      ),
    },
  },
});

/** Sheet controls with no component to mount, drawn in their real parents. [class, wrapper class, w, h] */
const SHEET_CONTROLS = Object.freeze([
  ['manager-scope-collapse', '', 22, 22],
  ['manager-recipe-tool-remove', '', 22, 22],
  ['manager-recipe-option-clear', '', 20, 20],
  ['manager-recipe-option-remove', '', 22, 22],
  ['manager-availability-remove', 'fabricate-pill-select', 20, 20],
  ['manager-danger-tag-remove', '', 20, 20],
  ['manager-drop-rank-button', '', 18, 18],
  ['manager-condition-remove', '', 22, 22],
]);

/** The narrowest gap any of these sits beside another control: the chip rung's 6px. */
const GAP = 6;

const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${read('tests/fixtures/foundry-core-min.css')}
@layer blocks{button{height:28px;overflow:hidden}}</style>
<style>@layer modules {${read('styles/fabricate.css')}}</style>
${['Stepper', 'SelectionCheckbox', 'Chip']
  .map((name) => `<style>${scopedComponentCss(resolve(repoRoot, component(name))).css}</style>`)
  .join('\n')}
<style>:root{--font-primary:Arial,sans-serif}
.row{display:flex;align-items:center;gap:${GAP}px;margin:12px}
.row .neighbour{width:30px;height:30px;padding:0;border:1px solid #888}</style>
</head><body class="game"><div class="fabricate fabricate-manager" style="width:900px">
  <div data-case="stepper" class="row">${markup.stepper}</div>
  <div data-case="fill" class="row" style="width:240px">${markup.fill}</div>
  <div data-case="vertical" class="row" style="width:80px">${markup.vertical}</div>
  ${['compact', 'default', 'comfortable']
    .map(
      (key) =>
        `<div data-case="${key}" class="row"><button class="neighbour" data-neighbour="before"></button>${markup[key]}<button class="neighbour" data-neighbour="after"></button></div>`
    )
    .join('\n')}
  <div data-case="chip" class="row">${markup.chip}<button class="neighbour" data-neighbour="after"></button></div>
  <div data-case="recipeChip" class="row">${markup.recipeChip}</div>
  <div data-case="componentChip" class="row">${markup.componentChip}</div>
  <div data-case="tagPill" class="row">${markup.tagPill}</div>
  ${SHEET_CONTROLS.map(
    ([cls, wrapper, width, height]) =>
      `<div data-case="${cls}" class="row ${wrapper}"><button class="neighbour" data-neighbour="before"></button><button type="button" class="${cls}" style="--w:${width};--h:${height}">${GLYPH}</button><button class="neighbour" data-neighbour="after"></button></div>`
  ).join('\n')}
  <div data-case="range" class="row manager-gathering-task-edit-view"><input type="range" min="0" max="10" value="5" /></div>
</div></body></html>`;

let browser;
let tab;

before(async () => {
  const markup = {};
  for (const name of new Set(Object.values(MOUNTS).map((mount) => mount.name))) {
    const harness = createMountedComponentHarness({
      repoRoot,
      tmpPrefix: `fabricate-hit-areas-${name}-`,
      compiledModules: [component(name)],
      componentPath: component(name),
    });
    await harness.setup();
    try {
      for (const [key, mount] of Object.entries(MOUNTS)) {
        if (mount.name !== name) continue;
        markup[key] = (await harness.mount(mount.props)).innerHTML;
        harness.remount();
      }
    } finally {
      harness.teardown();
    }
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  await tab.setContent(page(markup), { waitUntil: 'load' });
});

after(async () => {
  await browser?.close();
});

/**
 * Measures a control in the page: its painted box, its target (the box joined with its
 * `::before`), and what `elementFromPoint` resolves just inside each extended edge, just outside
 * it, and on the neighbour's near edge.
 */
const measure = (caseId, selector, neighbourSelector) =>
  tab.evaluate(
    ({ caseId, selector, neighbourSelector }) => {
      const root = document.querySelector(`[data-case="${caseId}"]`);
      const control = root.querySelector(selector);
      const box = control.getBoundingClientRect();
      const pseudo = getComputedStyle(control, '::before');
      const pw = pseudo.content === 'none' ? 0 : Number.parseFloat(pseudo.width) || 0;
      const ph = pseudo.content === 'none' ? 0 : Number.parseFloat(pseudo.height) || 0;
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const target = { width: Math.max(box.width, pw), height: Math.max(box.height, ph) };
      const owner = (x, y) => {
        const hit = document.elementFromPoint(x, y);
        if (hit === control || control.contains(hit)) return 'control';
        if (hit?.closest(neighbourSelector ?? '[data-neighbour]')) return 'neighbour';
        return hit ? hit.tagName.toLowerCase() : 'nothing';
      };
      // A probe sits at the centre of the pixel just inside the target's edge, and at the centre of
      // the second pixel past it: Chromium's hit test counts the pixel touching a transformed edge.
      const reach = { x: target.width / 2, y: target.height / 2 };
      const EDGE = 0.5;
      const PAST = 1.5;
      const near = (neighbourEdge) => {
        const neighbour = root.querySelector(neighbourEdge.selector);
        if (!neighbour) return null;
        const nb = neighbour.getBoundingClientRect();
        return owner(nb.left + neighbourEdge.dx(nb), nb.top + nb.height / 2);
      };
      return {
        box: { width: box.width, height: box.height },
        target,
        inside: {
          left: owner(cx - reach.x + EDGE, cy),
          right: owner(cx + reach.x - EDGE, cy),
          top: owner(cx, cy - reach.y + EDGE),
          bottom: owner(cx, cy + reach.y - EDGE),
        },
        outside: { left: owner(cx - reach.x - PAST, cy), right: owner(cx + reach.x + PAST, cy) },
        gaps: [...root.querySelectorAll('[data-neighbour]')].map((neighbour) => {
          const nb = neighbour.getBoundingClientRect();
          return nb.left >= box.right ? nb.left - box.right : box.left - nb.right;
        }),
        nearEdges: ['before', 'after'].map((which) =>
          near({
            selector: `[data-neighbour="${which}"]`,
            dx: (nb) => (which === 'before' ? nb.width - EDGE : EDGE),
          })
        ),
      };
    },
    { caseId, selector, neighbourSelector }
  );

const assertTarget = (label, result, painted) => {
  assert.ok(
    result.target.width >= 24 && result.target.height >= 24,
    `${label}: target ${result.target.width}x${result.target.height} is under 24x24`
  );
  assert.deepEqual(result.box, painted, `${label}: the painted box moved`);
  for (const [edge, owner] of Object.entries(result.inside)) {
    assert.equal(owner, 'control', `${label}: a point just inside the ${edge} of the target`);
  }
  for (const [edge, owner] of Object.entries(result.outside)) {
    assert.notEqual(owner, 'control', `${label}: a point just past the ${edge} of the target`);
  }
  for (const owner of result.nearEdges.filter(Boolean)) {
    assert.equal(owner, 'neighbour', `${label}: the neighbour's own edge belongs to the control`);
  }
  for (const gap of result.gaps) {
    assert.ok(
      (result.target.width - result.box.width) / 2 <= gap + 0.01,
      `${label}: the extension reaches the neighbour (gap ${gap})`
    );
  }
};

describe('24px hit areas, paint unchanged (issue 1523)', () => {
  it('gives the stepper adjuncts a 24px target inside the 2px gap to the input', async () => {
    for (const selector of ['[data-stepper-decrement]', '[data-stepper-increment]']) {
      const adjunct = await measure('stepper', selector, '[data-stepper-input]');
      assert.deepEqual(adjunct.box, { width: 22, height: 22 });
      assert.ok(adjunct.target.width >= 24 && adjunct.target.height >= 24, selector);
      assert.equal(adjunct.inside.left, 'control');
      assert.equal(adjunct.inside.right, 'control');
      assert.equal(adjunct.inside.top, 'control');
      assert.equal(adjunct.inside.bottom, 'control');
    }
    // The input beside them keeps its own edge.
    const edges = await tab.evaluate(() => {
      const root = document.querySelector('[data-case="stepper"]');
      const input = root.querySelector('[data-stepper-input]');
      const box = input.getBoundingClientRect();
      const at = (x, y) => document.elementFromPoint(x, y);
      const cy = box.top + box.height / 2;
      return {
        left: at(box.left + 0.5, cy) === input,
        right: at(box.right - 0.5, cy) === input,
        top: at(box.left + box.width / 2, box.top + 0.5) === input,
        bottom: at(box.left + box.width / 2, box.bottom - 0.5) === input,
        outsideTop: at(box.left + box.width / 2, box.top - 1.5) === input,
        height: box.height,
      };
    });
    assert.deepEqual(edges, {
      left: true,
      right: true,
      top: true,
      bottom: true,
      outsideTop: false,
      height: 24,
    });
  });

  it('keeps the stepper row at its drawn size', async () => {
    const sizes = await tab.evaluate(() => {
      const size = (selector) => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return { width: box.width, height: box.height };
      };
      const input = document.querySelector('[data-case="stepper"] [data-stepper-input]');
      return {
        stepper: size('[data-case="stepper"] .fab-stepper'),
        margin: getComputedStyle(input).marginBlockStart,
        fillInput: size('[data-case="fill"] [data-stepper-input]'),
        fillStepper: size('[data-case="fill"] .fab-stepper'),
      };
    });
    assert.deepEqual(sizes.stepper, { width: 102, height: 28 });
    assert.equal(sizes.margin, '-1px');
    assert.equal(sizes.fillStepper.height, 38);
    assert.equal(sizes.fillInput.height, 32);
  });

  it('leaves the vertical stepper, whose targets are already 26px or more, unextended', async () => {
    const adjunct = await measure('vertical', '[data-stepper-increment]', '[data-stepper-input]');
    assert.deepEqual(adjunct.box.height, 26);
    assert.equal(adjunct.target.height, 26);
  });

  for (const [key, size] of [
    ['compact', 16],
    ['default', 20],
    ['comfortable', 22],
  ]) {
    it(`gives the ${key} selection checkbox a 24px target beside a neighbour`, async () => {
      const label = await measure(key, '.fab-selection-checkbox');
      assertTarget(`${key} selection checkbox`, label, { width: size, height: size });
      const box = await tab.evaluate((caseId) => {
        const check = document.querySelector(`[data-case="${caseId}"] .fab-selection-check`);
        const { width, height } = check.getBoundingClientRect();
        return { width, height };
      }, key);
      assert.deepEqual(box, { width: size, height: size }, 'the drawn box');
    });
  }

  it('gives the chip remove a 24px target inside its chip', async () => {
    const remove = await measure('chip', '.manager-chip-remove');
    assertTarget('chip remove', remove, { width: 20, height: 20 });
  });

  for (const [key, box] of [
    ['recipeChip', 14],
    ['componentChip', 14],
    ['tagPill', 18],
  ]) {
    it(`gives the ${key} clear a 24px target inside its chip`, async () => {
      const clear = await measure(key, 'button', '.manager-chip');
      assert.deepEqual(clear.box, { width: box, height: box });
      assert.ok(
        clear.target.width >= 24 && clear.target.height >= 24,
        `${key}: ${JSON.stringify(clear.target)}`
      );
      assert.equal(clear.inside.left, 'control');
      assert.equal(clear.inside.right, 'control');
      assert.equal(clear.inside.top, 'control', 'the chip clips the target at its top');
      assert.equal(clear.inside.bottom, 'control', 'the chip clips the target at its bottom');
    });
  }

  for (const [cls, , width, height] of SHEET_CONTROLS) {
    it(`gives .${cls} a 24px target beside its neighbours`, async () => {
      const control = await measure(cls, `.${cls}`);
      assertTarget(`.${cls}`, control, { width, height });
    });
  }

  it('gives the task range a 24px track the row does not feel', async () => {
    const range = await tab.evaluate(() => {
      const input = document.querySelector('[data-case="range"] input');
      const box = input.getBoundingClientRect();
      const style = getComputedStyle(input);
      return {
        height: box.height,
        occupied:
          box.height + Number.parseFloat(style.marginTop) + Number.parseFloat(style.marginBottom),
      };
    });
    assert.deepEqual(range, { height: 24, occupied: 22 });
  });
});
