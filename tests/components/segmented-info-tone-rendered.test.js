/**
 * Issue 2774: in Chromium, `tone="info"` paints the chosen segment solid info with the on-info ink
 * and leaves the idle ones bare on every density and in the pill shape, and an option whose
 * `variant` is `info` keeps its soft info tint inside an accent track while a success one does not,
 * because every `--fab-*` token is pinned to a sentinel colour that reads
 * back as the token it came from.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, it } from 'node:test';

import { chromium } from 'playwright';

import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const COMPONENT = 'src/ui/svelte/components/SegmentedControl.svelte';
const shipped = scopedComponentCss(resolve(repoRoot, COMPONENT));
const TOKENS = [...new Set([...shipped.css.matchAll(/--fab-[a-z0-9-]+/g)].map(([t]) => t))];
const sentinel = (index) => `rgb(251, 1, ${index + 1})`;
const SENTINELS = `<style>*{${TOKENS.map((t, i) => `${t}:${sentinel(i)} !important`).join(';')}}</style>`;

const OPTIONS = [
  { value: 'plain', label: 'Plain' },
  { value: 'group', label: 'Group', variant: 'info' },
];
const SUCCESS_OPTIONS = [
  { value: 'plain', label: 'Plain' },
  { value: 'group', label: 'Group', variant: 'success' },
];
const CASES = Object.freeze({
  info: { tone: 'info', value: 'plain' },
  infoVariant: { tone: 'info', value: 'group' },
  accentVariant: { tone: 'accent', value: 'group' },
  softVariant: { tone: 'accent-soft', value: 'group' },
  softPlain: { tone: 'accent-soft', value: 'plain' },
  infoField: { tone: 'info', value: 'plain', density: 'field' },
  infoInline: { tone: 'info', value: 'plain', density: 'inline' },
  infoCompact: { tone: 'info', value: 'plain', density: 'compact' },
  infoPill: { tone: 'info', value: 'plain', shape: 'pill' },
  accentSuccess: { tone: 'accent', value: 'group', options: SUCCESS_OPTIONS },
});

let browser;
let read;

/** Each case's chosen and idle segment paint, as the token names the sentinels stand for. */
function paintOf({ cases, tokenNames }) {
  const name = (value) => {
    const hit = value.match(/^rgb\(251, 1, (\d+)\)$/);
    if (hit) return tokenNames[Number(hit[1]) - 1];
    return value === 'rgba(0, 0, 0, 0)' ? 'transparent' : value;
  };
  const paint = (element) => {
    const style = getComputedStyle(element);
    return {
      background: name(style.backgroundColor),
      border: name(style.borderTopColor),
      color: name(style.color),
    };
  };
  return Object.fromEntries(
    cases.map((id) => {
      const track = document.querySelector(`[data-case="${id}"] > .manager-segmented`);
      return [
        id,
        {
          chosen: paint(track.querySelector('.manager-segment.is-active')),
          idle: paint(track.querySelector('.manager-segment:not(.is-active)')),
        },
      ];
    })
  );
}

before(async () => {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-segmented-info-',
    rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
    compiledModules: [COMPONENT],
    componentPath: COMPONENT,
  });
  await harness.setup();
  const markup = [];
  try {
    for (const [id, { options = OPTIONS, ...props }] of Object.entries(CASES)) {
      const root = await harness.mount({ options, groupName: id, ...props });
      markup.push(`<div data-case="${id}">${root.innerHTML}</div>`);
      harness.remount();
    }
  } finally {
    harness.teardown();
  }
  browser = await chromium.launch();
  const tab = await browser.newPage();
  await tab.setContent(
    `<!doctype html><html><head><style>${shipped.css}</style>${SENTINELS}</head><body>${markup.join('')}</body></html>`
  );
  read = await tab.evaluate(paintOf, { cases: Object.keys(CASES), tokenNames: TOKENS });
});

after(async () => {
  await browser?.close();
});

it('paints the info tone solid on the chosen segment and bare on the idle one', () => {
  assert.deepEqual(read.info.chosen, {
    background: '--fab-info',
    border: '--fab-info',
    color: '--fab-on-info',
  });
  assert.deepEqual(read.info.idle, {
    background: 'transparent',
    border: 'transparent',
    color: '--fab-text-muted',
  });
});

it('keeps an info option’s soft tint inside the solid and soft accent tracks', () => {
  const tint = {
    background: '--fab-info-soft',
    border: '--fab-info-border',
    color: '--fab-info-text',
  };
  assert.deepEqual(read.accentVariant.chosen, tint);
  assert.deepEqual(read.softVariant.chosen, tint);
});

it('paints the info tone alike on every density and in the pill shape', () => {
  for (const id of ['infoField', 'infoInline', 'infoCompact', 'infoPill']) {
    assert.deepEqual(read[id].chosen, read.info.chosen, `${id} chosen`);
    assert.deepEqual(read[id].idle, read.info.idle, `${id} idle`);
  }
});

it('restores only the info variant inside an accent track, so a success option keeps the solid accent', () => {
  assert.equal(read.accentSuccess.chosen.background, '--fab-accent');
  assert.equal(read.accentSuccess.chosen.color, '--fab-on-accent');
});

it('leaves the accent tracks’ own chosen paint to a segment with no variant', () => {
  assert.equal(read.softPlain.chosen.background, '--fab-accent-soft');
  assert.equal(
    read.infoVariant.chosen.background,
    '--fab-info',
    'the info track out-ranks the ramp'
  );
});
