/**
 * The switch's states as Chromium draws them (issues 2525, 2492): disabled on all three hosts,
 * hover by state, forced colours, and the reading inside the two capped status cells. The sheet
 * sits in `@layer modules`, as Foundry loads it, and every switch is `StatusToggle`'s own markup.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import {
  collectStyleCorpus,
  declarationsIn,
  rulesIn,
  splitSelectorList,
} from '../helpers/styleBlockScan.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const TOGGLE = 'src/ui/svelte/components/StatusToggle.svelte';

/** Each case: the props the switch mounts with, and the caller cell it sits in, if any. */
const CASES = Object.freeze({
  off: { props: { on: false } },
  on: { props: { on: true } },
  disabled: { props: { on: false, disabled: true } },
  'disabled-on': { props: { on: true, disabled: true } },
  'class-disabled': { props: { on: false, class: 'is-disabled' } },
  checkbox: { props: { as: 'checkbox', on: false } },
  'checkbox-disabled': { props: { as: 'checkbox', on: false, disabled: true } },
  'task-off': { cell: 'manager-task-core-status', props: { on: false, label: 'Off' } },
  'task-on': { cell: 'manager-task-core-status', props: { on: true, label: 'On' } },
  'override-on': {
    cell: 'manager-character-modifier-override-row',
    props: { on: true, label: 'Overridden' },
  },
  'override-off': {
    cell: 'manager-character-modifier-override-row',
    props: { on: false, label: 'Override?' },
  },
});

/** The three disabled hosts: the button's attribute, the class form and the checkbox's input. */
const DISABLED = Object.freeze(['disabled', 'class-disabled', 'checkbox-disabled']);

/** Transitions would leave a hover read mid-fade; the cascade under test is unchanged without them. */
const STILL = '*,*::before,*::after{transition:none !important}';

const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8')}</style>
<style>@layer modules {${readStylesheet()}}</style>
<style>${STILL}</style>
</head><body class="game"><div class="fabricate fabricate-manager" style="width:900px">
${Object.entries(markup)
  .map(([key, html]) => {
    const { cell } = CASES[key];
    const body = cell ? `<div class="${cell}">${html}</div>` : html;
    return `<div data-case="${key}" style="display:flex;padding:8px">${body}</div>`;
  })
  .join('\n')}
</div></body></html>`;

/** One case's switch: its opacity, its track's paint, its knob's paint and offset, and its reading's box and budget. */
const readCase = (key) => {
  const host = globalThis.document.querySelector(`[data-case="${key}"] .fabricate-toggle`);
  const track = host.querySelector('.manager-status-toggle-track');
  const knob = host.querySelector('.manager-status-toggle-knob');
  const label = host.querySelector('.manager-status-toggle-label');
  const style = (node) => globalThis.getComputedStyle(node);
  return {
    opacity: style(host).opacity,
    cursor: style(host.querySelector('input') ?? host).cursor,
    track: { background: style(track).backgroundColor, border: style(track).borderTopColor },
    knob: {
      background: style(knob).backgroundColor,
      offset: knob.getBoundingClientRect().left - track.getBoundingClientRect().left,
    },
    label: label && {
      scrollWidth: label.scrollWidth,
      clientWidth: label.clientWidth,
      budget:
        Number.parseFloat(style(host).maxWidth) -
        track.getBoundingClientRect().width -
        Number.parseFloat(style(host).columnGap),
    },
  };
};

let browser;
let tab;

before(async () => {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-status-toggle-states-',
    compiledModules: [TOGGLE],
    componentPath: TOGGLE,
  });
  const markup = {};
  await harness.setup();
  try {
    for (const [key, { props }] of Object.entries(CASES)) {
      markup[key] = (await harness.mount({ ariaLabel: 'Enabled', ...props })).innerHTML;
      harness.remount();
    }
  } finally {
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await tab.setContent(page(markup), { waitUntil: 'load' });
});

after(async () => {
  await browser?.close();
});

/** `key`'s switch read at rest and again under the pointer. */
async function restAndHover(key) {
  await tab.mouse.move(0, 0);
  const rest = await tab.evaluate(readCase, key);
  await tab.hover(`[data-case="${key}"] .fabricate-toggle`);
  const hovered = await tab.evaluate(readCase, key);
  await tab.mouse.move(0, 0);
  return { rest, hovered };
}

it('dims a disabled switch to 0.45 on all three hosts, and leaves an enabled one opaque', async () => {
  for (const key of DISABLED) {
    const { opacity, cursor } = await tab.evaluate(readCase, key);
    assert.equal(opacity, '0.45', `${key} is dimmed`);
    assert.equal(cursor, 'not-allowed', `${key} refuses the pointer`);
  }
  for (const key of ['off', 'on', 'checkbox']) {
    assert.equal((await tab.evaluate(readCase, key)).opacity, '1', `${key} is not dimmed`);
  }
});

it('draws no hover face on a disabled switch, on any host', async () => {
  for (const key of DISABLED) {
    const { rest, hovered } = await restAndHover(key);
    assert.deepEqual(hovered.track, rest.track, `${key} answers the pointer`);
  }
});

it('hovers an off switch on its edge alone and an on switch on its fill alone', async () => {
  const off = await restAndHover('off');
  assert.notEqual(off.hovered.track.border, off.rest.track.border, 'the off edge firms');
  assert.equal(off.hovered.track.background, off.rest.track.background, 'the off fill holds');
  const on = await restAndHover('on');
  assert.notEqual(on.hovered.track.background, on.rest.track.background, 'the on fill lifts');
  assert.equal(on.hovered.track.border, on.rest.track.border, 'the on edge holds');
});

// Each cap rose by the track's 4px, so the reading keeps the width it had beside the 34px track:
// 64 - 34 - 8 in a task's status cell and 100 - 34 - 8 in the override row.
const BUDGETS = Object.freeze({
  'task-off': 22,
  'task-on': 22,
  'override-on': 58,
  'override-off': 58,
});

it('keeps each capped status cell its reading budget, and the task cell its reading whole', async () => {
  for (const [key, budget] of Object.entries(BUDGETS)) {
    const { label } = await tab.evaluate(readCase, key);
    assert.ok(label.clientWidth > 0, `${key} drew its reading`);
    assert.equal(label.budget, budget, `${key} keeps the reading width it had`);
  }
  // The override row's "Overridden" is sized to Signika, which this page does not load.
  for (const key of ['task-off', 'task-on']) {
    const { label } = await tab.evaluate(readCase, key);
    assert.ok(
      label.scrollWidth <= label.clientWidth,
      `${key} ellipsises its reading: ${label.scrollWidth} > ${label.clientWidth}`
    );
  }
});

it('keeps on and off distinct under forced colours, and draws a disabled switch whole', async () => {
  await tab.emulateMedia({ forcedColors: 'active' });
  try {
    const off = await tab.evaluate(readCase, 'off');
    const on = await tab.evaluate(readCase, 'on');
    assert.notEqual(on.track.background, off.track.background, 'the track fill tells them apart');
    assert.notEqual(on.knob.background, off.knob.background, 'so does the knob colour');
    assert.equal(off.knob.offset, 2, 'the off knob sits at the near end');
    assert.equal(on.knob.offset, 18, 'and the on knob 16px along');
    for (const key of DISABLED) {
      const disabled = await tab.evaluate(readCase, key);
      assert.equal(disabled.opacity, '1', `${key} is not dimmed under forced colours`);
      assert.notEqual(disabled.knob.background, off.knob.background, `${key} draws in GrayText`);
      assert.equal(
        disabled.knob.background,
        disabled.track.border,
        `${key}'s edge matches its knob`
      );
    }
    const disabledOn = await tab.evaluate(readCase, 'disabled-on');
    assert.equal(disabledOn.knob.offset, 18, 'a disabled on switch keeps its position');
  } finally {
    await tab.emulateMedia({ forcedColors: 'none' });
  }
});

/** The system colours a forced-colours block may name, compared case-insensitively. */
const SYSTEM_COLOURS = new Set(['canvas', 'canvastext', 'highlight', 'highlighttext', 'graytext']);

it('roots every forced-colours rule at the switch, painting in system colours alone', () => {
  const forced = Object.entries(collectStyleCorpus()).flatMap(([file, css]) =>
    rulesIn(css)
      .filter(({ context }) => /forced-colors:\s*active/u.test(context))
      .map((rule) => ({ file, rule, declarations: declarationsIn(file, rule.body) }))
  );
  assert.ok(
    forced.length >= 4,
    `only ${forced.length} forced-colours rules found; the reader broke`
  );
  const selectors = forced.flatMap(({ rule }) => splitSelectorList(rule.selector));
  assert.deepEqual(
    selectors.filter((selector) => !selector.startsWith('.fabricate-toggle')),
    [],
    'a forced-colours rule outside the switch'
  );
  const painted = forced.flatMap(({ declarations }) =>
    declarations.filter(({ property }) => property.startsWith('--fab-toggle-'))
  );
  assert.ok(painted.length > 0, 'the block repaints no family property');
  assert.deepEqual(
    painted.filter(({ value }) => !SYSTEM_COLOURS.has(value.toLowerCase())),
    [],
    'a forced-colours face painted in something other than a system colour'
  );
  const optedOut = forced
    .filter(({ declarations }) =>
      declarations.some(
        ({ property, value }) => property === 'forced-color-adjust' && value === 'none'
      )
    )
    .flatMap(({ rule }) => splitSelectorList(rule.selector));
  assert.deepEqual(optedOut, [
    '.fabricate-toggle .manager-status-toggle-track',
    '.fabricate-toggle .manager-status-toggle-knob',
  ]);
});
