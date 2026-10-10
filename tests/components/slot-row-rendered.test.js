/**
 * Issue 2257 D16 and task 10b: SlotRow's tiles and its open slot's candidates, measured in
 * Chromium. The met, short and partial faces draw their 1px edge as a ring outside the 56px tile
 * that focusing a tile leaves in place; the open face keeps its dashed border; every pip is 16.4px
 * tall; a short candidate dims only its chip and name.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;
const SCOPED = ['SlotRow', 'SlotTile', 'ChoiceOptionList', 'Medallion', 'Kicker'];

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-slot-row-rendered-',
  compiledModules: SCOPED.map(component),
  rawModules: ['src/ui/svelte/util/focusWhenEnabled.js'],
  componentPath: component('SlotRow'),
});

const STOCK = { charcoal: 4, stylus: 2, dusk: 2 };
const essence = (id, poolsMet, poolsRequired) => ({
  id,
  kind: 'essence',
  label: `${id} essence`,
  icon: 'fas fa-atom',
  poolsMet,
  poolsRequired,
  poolsStarted: poolsMet,
});
const REQUIREMENTS = [
  { id: 'charcoal', kind: 'fixed', componentId: 'charcoal', label: 'Charcoal', needed: 1 },
  { id: 'silver', kind: 'fixed', componentId: 'silver', label: 'Moonsilver', needed: 2 },
  essence('pool', 1, 2),
  essence('flux', 1, 1),
  {
    id: 'binder',
    kind: 'choice',
    label: 'Any binder',
    needed: 1,
    selected: { id: 'stylus', label: 'Rune Stylus' },
    candidates: ['stylus', 'ash', 'dusk'].map((id) => ({ id, label: `${id} stock` })),
  },
  { id: 'solvent', kind: 'choice', label: 'Any solvent', needed: 1, candidates: [{ id: 'oil' }] },
];

const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${read('tests/fixtures/foundry-core-min.css')}</style>
<style>@layer modules {${read('styles/fabricate.css')}}</style>
<style>${SCOPED.map((name) => scopedComponentCss(resolve(repoRoot, component(name))).css).join('\n')}</style>
<style>:root{--font-primary:Arial,sans-serif}</style>
</head><body class="game"><div class="fabricate fabricate-app" style="padding:16px">${markup}</div></body></html>`;

let browser;
let tab;

/** `property` as `value` computes inside `selector`'s element, through a hidden probe. */
function expected(selector, property, value) {
  return tab.evaluate(
    ([at, name, declared]) => {
      const probe = document.createElement('span');
      probe.style.display = 'none';
      probe.style.setProperty(name, declared);
      document.querySelector(at).append(probe);
      const resolved = getComputedStyle(probe).getPropertyValue(name);
      probe.remove();
      return resolved;
    },
    [selector, property, value]
  );
}

/** The computed `properties` of `selector`'s one element. */
function computed(selector, properties) {
  return tab.evaluate(
    ([at, names]) => {
      const found = document.querySelectorAll(at);
      if (found.length !== 1) return `${at} matches ${found.length} elements`;
      const style = getComputedStyle(found[0]);
      return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
    },
    [selector, properties]
  );
}

const tile = (id) => `[data-slot-id="${id}"] .fab-slot-tile`;

before(async () => {
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 900, height: 600 } });
  await harness.setup();
  let markup;
  try {
    const target = await harness.mount({
      requirements: REQUIREMENTS,
      held: (id) => STOCK[id] ?? 0,
      claimed: (id) => (id === 'dusk' ? 2 : 0),
      openSlot: 'binder',
      slotLabel: (slot) => slot.label,
      label: 'This stage consumes',
      hint: 'tap a dashed slot',
      choiceLabel: 'Choose a component',
      candidateSummary: (count) => `${count} can fill this slot`,
      candidateReading: ({ held, needed }) => `${held} held · needs ${needed}`,
    });
    markup = target.innerHTML;
  } finally {
    harness.teardown();
  }
  await tab.setContent(page(markup), { waitUntil: 'load' });
});

after(async () => {
  await browser?.close();
});

describe('SlotTile faces, rendered (issue 2257 D16)', () => {
  const RINGS = {
    charcoal: '--fab-border',
    silver: '--fab-danger-border',
    pool: '--fab-warning-border',
    flux: '--fab-border',
    binder: '--fab-border',
  };

  it('draws the met, short and partial edge as a 1px ring outside a borderless 56px tile', async () => {
    for (const [id, ink] of Object.entries(RINGS)) {
      const style = await computed(tile(id), ['box-shadow', 'border-top-width', 'width', 'height']);
      assert.deepEqual(
        style,
        {
          'box-shadow': await expected(tile(id), 'box-shadow', `0 0 0 1px var(${ink})`),
          'border-top-width': '0px',
          width: '56px',
          height: '56px',
        },
        `${id}'s tile`
      );
    }
  });

  it('keeps the open face on its dashed 1px accent border with no ring', async () => {
    const style = await computed(tile('solvent'), ['box-shadow', 'border-top', 'width']);
    assert.deepEqual(style, {
      'box-shadow': 'none',
      'border-top': await expected(
        tile('solvent'),
        'border-top',
        '1px dashed var(--fab-accent-border)'
      ),
      width: '56px',
    });
  });

  it('draws every pip 16.4px tall', async () => {
    const heights = await tab.evaluate(() =>
      [...document.querySelectorAll('.fab-slot-pip')].map(
        (pip) => Math.round(pip.getBoundingClientRect().height * 10) / 10
      )
    );
    assert.deepEqual(
      heights,
      Array.from(REQUIREMENTS, () => 16.4)
    );
  });

  it('draws the tick on the pressed tile alone', async () => {
    const ticks = await tab.evaluate(() =>
      [...document.querySelectorAll('.fab-slot-tick')].map(
        (tick) => tick.closest('[data-slot-id]').dataset.slotId
      )
    );
    assert.deepEqual(ticks, ['binder']);
  });

  // The focus ring itself is the module's outline; only the pressed tile's outline is its own.
  it('keeps the ring, and the pressed outline, on a focused tile', async () => {
    for (const [id, properties] of [
      ['flux', ['box-shadow']],
      ['binder', ['box-shadow', 'outline-style', 'outline-width', 'outline-color']],
    ]) {
      const before = await computed(tile(id), properties);
      const focused = await tab.evaluate((at) => {
        const button = document.querySelector(at);
        button.focus();
        return document.activeElement === button && button.matches(':focus');
      }, tile(id));
      assert.ok(focused, `${id}'s tile takes focus`);
      assert.deepEqual(await computed(tile(id), properties), before, `${id}'s focused tile`);
      assert.notEqual(before['box-shadow'], 'none');
    }
  });

  it('names the row with the shared Kicker over a 1.5 hint line', async () => {
    const style = await computed('.fab-slot-row-heading .fab-kicker', ['font-size', 'color']);
    assert.deepEqual(style, {
      'font-size': '8.5px',
      color: await expected('.fab-slot-row-heading', 'color', 'var(--fab-text-muted)'),
    });
    assert.deepEqual(await computed('.fab-slot-row-hint', ['line-height']), {
      'line-height': '15.75px',
    });
  });
});

describe('ChoiceOptionList candidates, rendered (issue 2257 task 10b)', () => {
  const option = (id) => `[data-choice-id="${id}"]`;

  it('marks each candidate with a borderless radius-7 chip and an 11px glyph', async () => {
    for (const id of ['stylus', 'ash', 'dusk']) {
      assert.deepEqual(
        await computed(`${option(id)} .fab-medallion`, [
          'border-top-width',
          'border-top-left-radius',
          'font-size',
          'width',
        ]),
        {
          'border-top-width': '0px',
          'border-top-left-radius': '7px',
          'font-size': '11px',
          width: '26px',
        },
        `${id}'s mark`
      );
    }
  });

  it('sets the summary at line height 1.5', async () => {
    assert.deepEqual(await computed('.fab-choice-option-summary', ['line-height']), {
      'line-height': '15.75px',
    });
  });

  it('dims only a short candidate’s chip and name, keeping its reading at full opacity', async () => {
    const short = option('ash');
    const parts = [
      short,
      `${short} .fab-choice-option-copy`,
      `${short} .fab-choice-option-reading`,
      `${short} .fab-medallion`,
      `${short} .fab-choice-option-name`,
      option('dusk'),
    ];
    const opacities = [];
    for (const at of parts) opacities.push((await computed(at, ['opacity'])).opacity);
    assert.deepEqual(
      opacities,
      ['1', '1', '1', '0.6', '0.6', '0.6'],
      'button, copy and reading at 1; chip and name at .6; a claimed candidate dims whole'
    );
  });
});
