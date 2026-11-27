/**
 * Issue 3039 — a one-line `RuleRow` whose head says `connective` draws its title as a joining word,
 * muted at weight 500 and 0.72rem, and a plain title stays the 600 heading; the library's one-line
 * unit draws the same type. Computed under the layered module sheet in Chromium.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, it } from 'node:test';

import { chromium } from 'playwright';
import { createRawSnippet } from 'svelte';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { readDesignLibrary } from '../helpers/designLibrary.js';
import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;
const LIBRARY_UNIT = 'one condition the caller combines (All)';
const RULE = { id: 'r1' };
const STEP = createRawSnippet(() => ({ render: () => '<input aria-label="Value" />' }));
const schemaOf = (connective) => ({
  head: () => ({ glyph: 'fas fa-bolt', title: 'When', connective }),
  steps: [{ key: 'value', render: STEP }],
  labels: { remove: 'Remove rule' },
});
const MOUNTS = Object.freeze({ connective: true, plain: false });

const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8')}</style>
<style>@layer modules {${readStylesheet()}}</style>
</head><body class="game"><div class="fabricate fabricate-manager" style="width:900px">
${Object.entries(markup)
  .map(([key, html]) => `<div data-case="${key}">${html}</div>`)
  .join('\n')}
</div></body></html>`;

/**
 * Each title's computed type and the muted ink its page resolves, read in the browser: the mounted
 * cases when no unit is named, else the library's unit of that caption.
 */
function readTitles(unitCap) {
  const probe = document.createElement('span');
  probe.style.color = 'var(--fab-text-muted)';
  document.body.append(probe);
  const read = (title) => {
    const style = getComputedStyle(title);
    return {
      color: style.color,
      weight: style.fontWeight,
      size: style.fontSize,
      muted: getComputedStyle(probe).color,
    };
  };
  if (!unitCap) {
    return Object.fromEntries(
      [...document.querySelectorAll('[data-case]')].map((host) => [
        host.dataset.case,
        read(host.querySelector('[data-rule-row-title]')),
      ])
    );
  }
  const entry = [...document.querySelectorAll('.spec')].find(
    (spec) =>
      spec.querySelector(':scope > .spec-head > h4')?.textContent === '<RuleRow> <RuleSentence>'
  );
  const unit = [...entry.querySelectorAll(':scope .unit')].find(
    (candidate) => candidate.querySelector(':scope > .cap').textContent === unitCap
  );
  return read(unit.querySelector('.grow'));
}

let browser;
let live;
let drawn;

before(async () => {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-rule-row-connective-',
    rawModules: [
      ...FOUNDRY_BRIDGE_RAW_MODULES,
      ...LOCALIZE_OR_RAW_MODULES,
      'src/ui/svelte/util/appLocalizer.js',
    ],
    compiledModules: [
      component('Button'),
      component('IconButton'),
      component('RuleSentence'),
      component('RuleRow'),
    ],
    componentPath: component('RuleRow'),
  });
  await harness.setup();
  const markup = {};
  try {
    for (const [key, connective] of Object.entries(MOUNTS)) {
      const root = await harness.mount({
        schema: schemaOf(connective),
        value: RULE,
        onChange() {},
      });
      markup[key] = root.innerHTML;
      harness.remount();
    }
  } finally {
    harness.teardown();
  }
  browser = await chromium.launch();
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await tab.setContent(page(markup), { waitUntil: 'load' });
  live = await tab.evaluate(readTitles, null);
  await tab.route(/^https?:/u, (route) => route.abort());
  await tab.setContent(readDesignLibrary());
  drawn = await tab.evaluate(readTitles, LIBRARY_UNIT);
});

after(async () => {
  await browser?.close();
});

it('draws a connective title muted at weight 500 and 11.52px', () => {
  assert.equal(live.connective.color, live.connective.muted, 'ink is --fab-text-muted');
  assert.equal(live.connective.weight, '500');
  assert.equal(live.connective.size, '11.52px');
});

it('keeps a plain title a 600 heading in the default ink', () => {
  assert.equal(live.plain.weight, '600');
  assert.notEqual(live.plain.color, live.plain.muted, 'the plain title is not muted');
  assert.notEqual(live.plain.size, '11.52px');
});

it('draws the library one-line unit’s title as the shipped connective', () => {
  assert.equal(drawn.color, drawn.muted, 'the unit’s ink is --fab-text-muted');
  assert.equal(drawn.weight, live.connective.weight);
  assert.equal(drawn.size, live.connective.size);
});
