/**
 * Issue 2532 — `Field` draws its first-child `<span>` caption as the kicker (8.5px/700, 0.11em,
 * upper case, muted) and its box carries the value type (12.5px/500), in any host, while a
 * caller's own caption class, a later span and a scoped rule keep what they declare.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { scopedComponentCss, withScopeHash } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const BODY_PATH = 'src/ui/svelte/components/PickerRowRewardBody.svelte';
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-field-caption-',
  rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
  compiledModules: ['src/ui/svelte/components/Field.svelte', BODY_PATH],
  componentPath: BODY_PATH,
});
const foundryCss = readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8');
const configCss = scopedComponentCss(
  resolve(repoRoot, 'src/ui/svelte/apps/InteractableConfigRoot.svelte')
);

const KICKER = { fs: '8.5px', fw: '700', ls: '0.935px', tt: 'uppercase' };
const VALUE = { fs: '12.5px', fw: '500' };

const field = (probe) =>
  `<label class="fabricate-field"><span data-m="${probe}-cap">Name</span>` +
  `<input type="text" data-m="${probe}-in" value="x"></label>`;
const inkProbes = (host) =>
  `<span data-m="${host}-muted" style="color:var(--fab-text-muted)">m</span>` +
  `<span data-m="${host}-subtle" style="color:var(--fab-text-subtle)">s</span>`;

function pageHtml(rewardBody) {
  const manager = `
    <div class="fabricate-manager" data-manager-view="recipe-edit">
      ${inkProbes('manager')}
      <div data-m="reward">${rewardBody}</div>
      ${field('manager')}
      <div class="fabricate-field">
        <span class="manager-recipe-micro-label" data-m="micro">Max</span><input type="text">
      </div>
      <div class="fabricate-field fabricate-select-field">
        <span class="fabricate-select-caption" data-m="select-cap">Mode</span>
        <div class="fabricate-picker manager-travel-picker fabricate-select"><button type="button" class="fabricate-select-trigger">x</button></div>
        <span class="fabricate-select-note" data-m="select-note">Hint</span>
      </div>
      <label class="fabricate-field fabricate-search-field">
        <span class="fabricate-search-caption">Search</span>
        <span class="fabricate-search" data-m="search-shell"><input type="search" data-m="search-in"></span>
      </label>
      <div class="fabricate-field">
        <span class="manager-condition-shortcut-label" data-m="shortcut"><i class="fas fa-cloud" data-m="shortcut-i"></i>Weather</span>
        <div class="fabricate-picker manager-travel-picker fabricate-select"></div>
      </div>
      <div class="fabricate-rule-row"><div class="fabricate-rule-row-body">
        <label class="fabricate-field"><span data-m="rule-cap">Rule</span><input type="text"></label>
      </div></div>
    </div>`;
  const config = withScopeHash(
    `<div class="fabricate-interactable-config">${field('config')}</div>`,
    'fabricate-interactable-config',
    configCss.hashClass
  );
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${foundryCss}</style><style>@layer modules { ${readStylesheet()} }</style>
    <style>${configCss.css}</style></head><body>
    <div class="fabricate" data-fabricate-theme="fabricate">
      ${manager}
      <div class="fabricate-manager" data-manager-view="world-tool-entry">${field('tool-entry')}</div>
      <div class="fabricate-app">${field('app')}</div>
      <div>${field('bare')}</div>
      ${config}
    </div></body></html>`;
}

let browser;
let m;
before(async () => {
  await harness.setup();
  const target = await harness.mount({
    kind: 'currency',
    label: 'Gold',
    reason: 'Pay',
    unitName: 'gp',
  });
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(pageHtml(target.innerHTML));
  m = await page.evaluate(() => {
    const read = (el) => {
      const s = getComputedStyle(el);
      return {
        fs: s.fontSize,
        fw: s.fontWeight,
        ls: s.letterSpacing,
        tt: s.textTransform,
        c: s.color,
      };
    };
    const all = (selector) => [...document.querySelectorAll(selector)].map(read);
    const out = Object.fromEntries(
      [...document.querySelectorAll('[data-m]')].map((el) => [el.dataset.m, read(el)])
    );
    out.rewardCaps = all('[data-m="reward"] .fabricate-field > span:first-child');
    out.rewardInputs = all('[data-m="reward"] .fabricate-field input');
    return out;
  });
});
after(async () => {
  await browser?.close();
  harness.teardown();
});

test('(a) the currency reward body draws kicker captions over 12.5/500 values', () => {
  assert.equal(m.rewardCaps.length, 2, '"Call it" and "Why they get it" both render');
  for (const caption of m.rewardCaps) {
    assert.deepEqual(caption, { ...KICKER, c: m['manager-muted'].c }, 'reward caption');
  }
  assert.equal(m.rewardInputs.length, 2, 'both reward inputs render');
  for (const input of m.rewardInputs) {
    assert.deepEqual({ fs: input.fs, fw: input.fw }, VALUE, 'reward input');
  }
});

test('(b) caption and value type is the same in a manager, an app and a bare host', () => {
  for (const host of ['app', 'bare']) {
    for (const key of ['fs', 'fw', 'ls', 'tt']) {
      assert.equal(m[`${host}-cap`][key], m['manager-cap'][key], `${host} caption ${key}`);
      assert.equal(m[`${host}-in`][key], m['manager-in'][key], `${host} input ${key}`);
    }
  }
});

test('(c) caller classes, later spans and the rule row keep their own type', () => {
  const micro = m.micro;
  assert.deepEqual(
    [micro.fs, micro.ls, micro.c],
    ['9.92px', '0.7936px', m['manager-subtle'].c],
    'micro-label keeps 0.62rem/0.08em/subtle'
  );
  const caption = m['select-cap'];
  assert.deepEqual(
    { fs: caption.fs, fw: caption.fw, ls: caption.ls, tt: caption.tt },
    KICKER,
    'select caption is the kicker'
  );
  const note = m['select-note'];
  assert.deepEqual([note.fs, note.fw, note.tt], ['10.5px', '400', 'none'], 'select note');
  assert.equal(m['search-shell'].tt, 'none', 'search shell span is not uppercased');
  assert.equal(m['search-in'].fs, VALUE.fs, 'search input reads at the value size');
  assert.equal(m['rule-cap'].fs, '8px', 'rule-row caption keeps 8px');
  const shortcut = m.shortcut;
  assert.deepEqual(
    [shortcut.fs, shortcut.fw, shortcut.tt, shortcut.c],
    [KICKER.fs, KICKER.fw, KICKER.tt, m['manager-muted'].c],
    'condition shortcut caption is a muted kicker'
  );
  assert.equal(m['shortcut-i'].fs, '12px', 'condition glyph stays at 12px');
});

test('(d) world-tool-entry and interactable-config inputs read at 500', () => {
  assert.equal(m['tool-entry-in'].fw, VALUE.fw, 'world-tool-entry input');
  assert.equal(m['config-in'].fw, VALUE.fw, 'interactable-config input');
});
