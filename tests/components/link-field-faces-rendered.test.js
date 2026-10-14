/**
 * The link field's faces as Chromium draws them (issue 2466): the 104px floor, the three grounds
 * and borders, the empty stack, the two-line caps, the action column and the compact face. The
 * sheet sits in `@layer modules` and the component's scoped block is unlayered, as Foundry loads
 * them, so each clause measures the cascade a selector reading cannot.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const ZONE = 'src/ui/svelte/components/ItemDropZone.svelte';

const noop = () => {};
const ACTIONS = { copyLabel: 'Copy uuid', unlinkLabel: 'Unlink', onCopy: noop, onUnlink: noop };
const PROMPT = { title: 'Drop a game-world item here', emptyIcon: 'fas fa-link' };
const LONG_TITLE = 'Drop a game-world item here to link it to this record. '.repeat(3).trim();
const LONG_NOTE = `From the Items directory or a compendium, ${'x'.repeat(40)} and from any pack this world has unlocked for editing.`;

/** Each case: the host's width and the props the zone mounts with. */
const CASES = Object.freeze({
  empty: { width: 280, props: { ...PROMPT, hint: 'From the Items directory or a compendium' } },
  linked: {
    width: 280,
    props: {
      item: { name: 'Blacksmith’s Compendium' },
      uuid: 'Item.kR3nQ8sT1vW2xY4z',
      hint: 'Drop another Item here to replace the linked source.',
      ...ACTIONS,
    },
  },
  missing: {
    width: 280,
    props: {
      item: { name: 'Untitled' },
      uuid: 'Item.9pQr2sT4uV6wX8yZ',
      state: 'missing',
      hint: 'This document no longer resolves.',
    },
  },
  compact: {
    width: 280,
    props: {
      compact: true,
      title: 'Drop an item to replace the source',
      hint: 'World item or compendium entry',
      emptyIcon: 'fas fa-right-left',
    },
  },
  disabled: { width: 280, props: { ...PROMPT, disabled: true } },
  'long-empty': { width: 220, props: { ...PROMPT, title: LONG_TITLE, hint: LONG_NOTE } },
  'long-linked': {
    width: 220,
    props: { item: { name: LONG_TITLE }, hint: LONG_NOTE, subline: LONG_NOTE, ...ACTIONS },
  },
});

/** The tokens the clauses compare against, each read from an element that declares it. */
const TOKENS = Object.freeze([
  'surface-soft',
  'bg-1',
  'danger-soft',
  'accent-soft',
  'border-strong',
  'danger-border',
  'accent',
  'text-secondary',
  'text-muted',
  'text-subtle',
  'danger-text',
]);

/** The page loads no Font Awesome, so the glyph is given a box; without one the stack has two rows. */
const GLYPH_BOX = String.raw`.fas{display:inline-block;line-height:1}.fas::before{content:"\25A0"}`;

const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${read('tests/fixtures/foundry-core-min.css')}</style>
<style>@layer modules {${readStylesheet()}}</style>
<style>${scopedComponentCss(resolve(repoRoot, ZONE)).css}</style>
<style>${GLYPH_BOX}</style>
</head><body class="game"><div class="fabricate fabricate-manager" style="width:900px">
${TOKENS.map((token) => `<span data-token="${token}" style="color:var(--fab-${token})"></span>`).join('')}
<span data-token="serif" style="font-family:var(--fab-font-serif)"></span>
<span data-token="none" style="color:transparent"></span>
${Object.entries(markup)
  .map(([key, html]) => `<div data-case="${key}" style="width:${CASES[key].width}px">${html}</div>`)
  .join('\n')}
</div></body></html>`;

/** Every case's parts, with the box, the computed style and the scroll extent of each. */
const readFaces = () => {
  const doc = globalThis.document;
  const STYLES = [
    'background-color',
    'border-top-color',
    'border-top-style',
    'border-top-left-radius',
    'min-height',
    'padding-top',
    'opacity',
    'color',
    'font-size',
    'font-weight',
    'font-family',
    'line-height',
  ];
  const PARTS = {
    root: '.manager-item-drop-zone',
    icon: '.manager-item-drop-zone-icon',
    glyph: '.manager-item-drop-zone-icon > i',
    name: '.manager-item-drop-zone-copy > strong',
    uuid: '.manager-item-drop-zone-uuid',
    hint: '.manager-item-drop-zone-copy > small:not([data-item-drop-zone-subline])',
    subline: '[data-item-drop-zone-subline]',
  };
  const part = (node) => {
    if (!node) return null;
    const computed = globalThis.getComputedStyle(node);
    const { top, bottom, left, right, width, height } = node.getBoundingClientRect();
    return {
      box: { top, bottom, left, right, width, height },
      style: Object.fromEntries(STYLES.map((name) => [name, computed.getPropertyValue(name)])),
      scroll: {
        width: node.scrollWidth,
        height: node.scrollHeight,
        clientWidth: node.clientWidth,
        clientHeight: node.clientHeight,
      },
    };
  };
  const faces = {};
  for (const host of doc.querySelectorAll('[data-case]')) {
    const face = Object.fromEntries(
      Object.entries(PARTS).map(([name, selector]) => [name, part(host.querySelector(selector))])
    );
    face.buttons = [...host.querySelectorAll(':scope .manager-item-drop-zone-actions button')].map(
      (button) => part(button).box
    );
    faces[host.dataset.case] = face;
  }
  const tokens = {};
  for (const probe of doc.querySelectorAll('[data-token]')) {
    const computed = globalThis.getComputedStyle(probe);
    tokens[probe.dataset.token] =
      probe.dataset.token === 'serif' ? computed.fontFamily : computed.color;
  }
  return { faces, tokens };
};

let browser;
let tab;
let faces;
let tokens;

before(async () => {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-link-field-faces-',
    rawModules: [
      ...FOUNDRY_BRIDGE_RAW_MODULES,
      'src/ui/svelte/actions/dragDrop.js',
      'src/ui/svelte/util/dropUtils.js',
    ],
    compiledModules: ['src/ui/svelte/components/IconButton.svelte', ZONE],
    componentPath: ZONE,
  });
  const markup = {};
  await harness.setup();
  try {
    for (const [key, { props }] of Object.entries(CASES)) {
      markup[key] = (await harness.mount(props)).innerHTML;
      harness.remount();
    }
  } finally {
    harness.teardown();
  }
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await tab.setContent(page(markup), { waitUntil: 'load' });
  ({ faces, tokens } = await tab.evaluate(readFaces));
});

after(async () => {
  await browser?.close();
});

const px = (value) => Number.parseFloat(value);
const centre = ({ left, right }) => (left + right) / 2;
const middle = ({ top, bottom }) => (top + bottom) / 2;

/** Whether a line is cut at its cap: more text than its box shows, in at most two of its lines. */
function assertCapped(line, label) {
  assert.ok(
    line.scroll.height > line.scroll.clientHeight,
    `${label} holds no more than it shows, so the cap is not reached and nothing is measured`
  );
  assert.ok(
    line.box.height <= 2 * px(line.style['line-height']) + 0.5,
    `${label} is ${line.box.height}px tall at a ${line.style['line-height']} line: more than two lines`
  );
}

it('reads each token from the page, and no two the clauses tell apart are equal', () => {
  const colours = TOKENS.map((token) => tokens[token]);
  assert.equal(new Set(colours).size, TOKENS.length, `two tokens compute alike: ${colours}`);
  assert.match(tokens.serif, /Spectral/u);
});

it('draws the empty prompt as a centred stack on a dashed 104px box', () => {
  const { root, icon, glyph, name, hint } = faces.empty;
  assert.equal(root.box.height, 104);
  assert.equal(root.style['border-top-left-radius'], '11px');
  assert.equal(root.style['border-top-style'], 'dashed');
  assert.equal(root.style['border-top-color'], tokens['border-strong']);
  assert.equal(root.style['background-color'], tokens['surface-soft']);

  assert.equal(glyph.style['font-size'], '18px');
  assert.equal(glyph.box.height, 18, 'the glyph has an 18px box, so the stack has three rows');
  assert.equal(icon.style.color, tokens['text-subtle']);
  assert.ok(Math.abs(centre(glyph.box) - centre(root.box)) <= 1, 'the glyph is centred on the box');

  assert.equal(name.style['font-size'], '12px');
  assert.equal(name.style['font-weight'], '600');
  assert.equal(name.style.color, tokens['text-secondary']);
  assert.equal(hint.style.color, tokens['text-muted']);
  assert.ok(glyph.box.bottom <= name.box.top, 'the glyph sits above the title');
  assert.ok(name.box.bottom <= hint.box.top, 'and the title above the hint');
  assert.ok(
    Math.abs((glyph.box.top + hint.box.bottom) / 2 - middle(root.box)) <= 1,
    'the stack is centred between the box`s top and bottom'
  );
});

it('draws a linked zone as a solid bg-1 row on the same floor, with its actions in a column', () => {
  const { root, icon, name, uuid, hint, buttons } = faces.linked;
  assert.equal(root.style['min-height'], '104px');
  assert.ok(root.box.height >= 104, `the linked box is ${root.box.height}px, under its floor`);
  assert.equal(root.style['border-top-style'], 'solid');
  assert.equal(root.style['border-top-color'], tokens['border-strong']);
  assert.equal(root.style['background-color'], tokens['bg-1']);

  assert.deepEqual([icon.box.width, icon.box.height], [44, 44]);
  assert.equal(name.style['font-size'], '14px');
  assert.equal(name.style['font-weight'], '600');
  assert.equal(name.style['font-family'], tokens.serif);
  assert.equal(px(name.style['line-height']), 18.2);
  assert.equal(uuid.style.color, tokens['text-muted']);
  assert.equal(hint.style.color, tokens['text-muted']);

  assert.equal(buttons.length, 2);
  assert.ok(buttons[1].top >= buttons[0].bottom, 'unlink sits under copy, not beside it');
});

it('draws a missing zone on the danger ground, and lets a drag take it', async () => {
  const { root, icon, name, uuid, hint } = faces.missing;
  assert.equal(root.style['border-top-style'], 'solid');
  assert.equal(root.style['border-top-color'], tokens['danger-border']);
  assert.equal(root.style['background-color'], tokens['danger-soft']);
  assert.equal(name.style.color, tokens['danger-text']);
  assert.equal(icon.style.color, tokens['danger-text']);
  assert.equal(uuid.style.color, tokens['text-secondary']);
  assert.equal(hint.style.color, tokens['text-secondary']);

  const dragged = await tab.evaluate(() => {
    const zone = globalThis.document.querySelector('[data-case="missing"] .manager-item-drop-zone');
    zone.classList.add('is-drop-active');
    const { borderTopColor, backgroundColor } = globalThis.getComputedStyle(zone);
    zone.classList.remove('is-drop-active');
    return { borderTopColor, backgroundColor };
  });
  assert.equal(
    dragged.borderTopColor,
    tokens.accent,
    'a drag over a missing zone takes its border'
  );
  assert.equal(dragged.backgroundColor, tokens['accent-soft'], 'and its ground');
});

it('draws the compact prompt with no ground, no floor and no tile, in muted ink', () => {
  const { root, icon, name, hint } = faces.compact;
  assert.equal(root.style['background-color'], tokens.none);
  assert.equal(root.style['padding-top'], '12px');
  assert.equal(root.style['border-top-left-radius'], '9px');
  assert.equal(root.style['border-top-style'], 'dashed');
  assert.equal(root.style['min-height'], '0px');
  assert.ok(root.box.height < 104, `the compact box is ${root.box.height}px, so it kept the floor`);

  assert.equal(icon.style['background-color'], tokens.none, 'no tile behind the glyph');
  assert.equal(icon.style.color, tokens['text-subtle']);
  assert.equal(name.style['font-size'], '10.08px');
  assert.equal(name.style['font-weight'], '500');
  assert.equal(name.style.color, tokens['text-muted']);
  assert.equal(hint.style.color, tokens['text-muted']);
});

it('dims a disabled zone to 0.55', () => {
  assert.equal(faces.disabled.root.style.opacity, '0.55');
});

it('caps a title, a name, a hint and a subline at two lines, and grows the box instead', () => {
  const empty = faces['long-empty'];
  assertCapped(empty.name, 'the empty title');
  assertCapped(empty.hint, 'the empty hint');
  assert.ok(empty.root.box.height > 104, 'two capped lines of each stand taller than the floor');

  const linked = faces['long-linked'];
  assertCapped(linked.name, 'the linked name');
  assertCapped(linked.hint, 'the linked hint');
  assertCapped(linked.subline, 'the subline');

  for (const [label, { root }] of [
    ['the empty box', empty],
    ['the linked box', linked],
  ]) {
    assert.ok(root.scroll.width <= root.scroll.clientWidth, `${label} scrolls sideways`);
    assert.ok(root.scroll.height <= root.scroll.clientHeight, `${label} scrolls down`);
  }
});
