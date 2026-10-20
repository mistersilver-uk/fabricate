/**
 * Every reviewed override of the button rung still wins, measured in Chromium (issue 2540).
 * Retiring `fab-manager-button` put `ArmedDangerButton` and the converted popover triggers under
 * the tripled root's (0,3,0) rung, which they never matched before. Each rule below was reviewed
 * to restate that rung on its carrier, so each is drawn on markup its own selector builds and must
 * render every property it declares: a probe that computes another value lost the cascade.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';

import { chromium } from 'playwright';
import { compile } from 'svelte/compiler';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(join(repoRoot, path), 'utf8');

/**
 * The classes each carrier writes at rest, which `armed-danger-button-mounted.test.js` and
 * `manager-button-mounted.test.js` pin by mounting each component.
 */
const ARMED_DANGER_CLASSES = 'fabricate-button is-danger';
const BUTTON_ROOT = 'fabricate-button';

/** The sheet rules reviewed as overrides of the rung, each on the carrier it was reviewed for. */
const SHEET_OVERRIDES = Object.freeze([
  ['.fabricate-manager .manager-knowledge-row-actions .fabricate-button', 'ArmedDangerButton'],
  [
    '.fabricate-manager .manager-component-entry-row-actions .fabricate-button.is-danger',
    'ArmedDangerButton',
  ],
  [
    '.fabricate-manager .manager-component-entry-row-actions .fabricate-button.is-danger:not(:disabled)',
    'ArmedDangerButton',
  ],
  [
    '.fabricate-manager .manager-component-entry-danger-body .fabricate-button.is-danger',
    'ArmedDangerButton',
  ],
  [
    '.fabricate-manager .manager-component-entry-danger-body .fabricate-button.is-danger:not(:disabled)',
    'ArmedDangerButton',
  ],
  ['.fabricate-manager .fab-bulk-edit-dock .fabricate-button.is-danger', 'ArmedDangerButton'],
  ['.fabricate-button.fabricate-button.is-danger:not(:disabled)', 'ArmedDangerButton'],
  ['.fabricate-button.fabricate-button.manager-checks-preview-actor-trigger', 'Button'],
  ['.fabricate-button.fabricate-button.manager-tool-replacement-component-trigger', 'Button'],
  [
    '.fabricate-manager .manager-tool-replacement-card .manager-tool-replacement-component-trigger',
    'Button',
  ],
  ['.fabricate-button.fabricate-button.manager-travel-parties-override-trigger', 'Button'],
  ['.fabricate-picker .manager-travel-picker-trigger', 'Button'],
  ['.fabricate-manager .manager-header-actions .fabricate-button', 'Button'],
  ['.fabricate-manager .manager-header-actions .fabricate-button.is-primary', 'Button'],
  ['.fabricate-manager .manager-knowledge-reset-actions .fabricate-button', 'Button'],
  [
    '.fabricate-manager[data-manager-view="components"] .fabricate-filter-bar .fabricate-button',
    'Button',
  ],
  ['.fabricate-button.fabricate-button.is-warning-action:not(:disabled)', 'Button'],
  ['.fabricate-button.fabricate-button.is-primary:not(:disabled)', 'Button'],
  ['.fabricate-manager .manager-setup-links .fabricate-button', 'Button'],
]);

/** Scoped overrides, keyed on the compiled selector with its scoping hash removed. */
const SCOPED_OVERRIDES = Object.freeze([
  [
    'src/ui/svelte/apps/manager/scoped/SystemRulesRoster.svelte',
    '.manager-scoped-roster-system .fabricate-button.is-danger',
    'ArmedDangerButton',
  ],
  [
    'src/ui/svelte/apps/manager/tools/ToolReplacementTarget.svelte',
    '.manager-tool-replacement .manager-tool-replacement-tile .manager-tool-replacement-component-trigger',
    'Button',
  ],
  [
    'src/ui/svelte/apps/manager/tools/ToolReplacementTarget.svelte',
    '.manager-tool-replacement .manager-tool-replacement-drop .manager-tool-replacement-component-trigger',
    'Button',
  ],
]);

/** The scoped blocks issue 2540 re-spelled; every resting rule naming the doubled root is held. */
const RESPELLED_BLOCKS = Object.freeze([
  'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte',
  'src/ui/svelte/apps/manager/GatheringEconomyView.svelte',
  'src/ui/svelte/apps/manager/ImportFolderMappingModal.svelte',
  'src/ui/svelte/apps/manager/ItemPageInspector.svelte',
  'src/ui/svelte/components/RollDataExpressionInput.svelte',
]);

const SCOPED_FILES = [...new Set([...SCOPED_OVERRIDES.map(([file]) => file), ...RESPELLED_BLOCKS])];

const compiledCss = (file) =>
  compile(read(file), { filename: join(repoRoot, file), css: 'external', generate: 'client' }).css
    .code;

let browser;
let page;

before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  const styles = [readStylesheet(), ...SCOPED_FILES.map(compiledCss)]
    .map((css) => `<style>${css}</style>`)
    .join('');
  await page.setContent(`<!doctype html><html><head>${styles}</head><body></body></html>`);
});

after(async () => browser?.close());

/**
 * In the page: every rule member matching `wanted`, drawn and measured against an inline twin.
 *
 * @param {{ wanted: string[], derive: boolean, carriers: Record<string, string> }} input the keys
 *   (hash-free selector members) and their carriers' classes; with `derive`, every resting member
 *   naming the tripled root, or a scoped block's doubled root, is added on `Button`'s root
 * @returns {Array<{ key: string, losses: string[], matched: boolean, properties: number }>}
 */
function measureInPage({ wanted, derive, carriers }) {
  const HASH = /:where\(\.svelte-[\w-]+\)|\.svelte-[\w-]+/g;
  const DOUBLED = '.fabricate-button.fabricate-button';
  const TRIPLED = `${DOUBLED}.fabricate-button`;
  const canonical = (selector) => {
    const sheet = new CSSStyleSheet();
    sheet.insertRule(`${selector} {}`);
    return sheet.cssRules[0].selectorText;
  };
  const membersOf = (list) => {
    const members = [];
    let depth = 0;
    let start = 0;
    for (let index = 0; index < list.length; index += 1) {
      if ('(['.includes(list[index])) depth += 1;
      else if (')]'.includes(list[index])) depth -= 1;
      else if (list[index] === ',' && depth === 0) {
        members.push(list.slice(start, index).trim());
        start = index + 1;
      }
    }
    return [...members, list.slice(start).trim()];
  };
  const resting = (member) =>
    !/:(?!not\(|where\(|is\()/.test(member.replaceAll(/:not\([^)]*\)/g, ''));
  const compounds = (member) => member.split(/\s*>\s*|\s+/).filter(Boolean);
  const draw = (compound, tag) => {
    const named = /^[a-z][\w-]*/i.exec(compound)?.[0];
    const element = document.createElement(named ?? tag);
    const plain = compound
      .replaceAll(/:not\([^)]*\)/g, '')
      .replaceAll(/:(?:where|is)\(([^)]*)\)/g, '$1');
    for (const [, name] of plain.matchAll(/\.([\w-]+)/g)) element.classList.add(name);
    for (const [, name, value] of plain.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
      element.setAttribute(name, value ?? '');
    }
    return element;
  };
  const flatten = (list) =>
    [...list].flatMap((rule) => {
      if (rule instanceof CSSStyleRule) return [rule];
      if (rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches) return [];
      return rule.cssRules ? flatten(rule.cssRules) : [];
    });
  const keys = new Map(wanted.map((key) => [canonical(key), { key, carrier: carriers[key] }]));
  const found = [];
  for (const [index, sheet] of [...document.styleSheets].entries()) {
    // The first sheet is the module's; the rest are compiled component blocks.
    const respelled = index === 0 ? TRIPLED : DOUBLED;
    for (const rule of flatten(sheet.cssRules)) {
      for (const member of membersOf(rule.selectorText)) {
        const bare = member.replaceAll(HASH, '');
        const derived = derive && resting(member) && bare.includes(respelled);
        const entry = keys.get(bare) ?? (derived ? { key: bare, carrier: carriers.derived } : null);
        if (entry) found.push({ rule, member, ...entry });
      }
    }
  }
  return found.map(({ rule, member, key, carrier }) => {
    const parts = compounds(member);
    let parent = document.body;
    let subject;
    for (const [index, part] of parts.entries()) {
      const last = index === parts.length - 1;
      const element = draw(part, last ? 'button' : 'div');
      if (last) {
        for (const name of carrier.split(/\s+/)) element.classList.add(name);
        element.textContent = 'Delete';
        subject = element;
      }
      parent.append(element);
      parent = element;
    }
    const twin = subject.cloneNode(true);
    twin.style.cssText = rule.style.cssText;
    subject.after(twin);
    const losses = [];
    const probe = getComputedStyle(subject);
    const stated = getComputedStyle(twin);
    for (const property of rule.style) {
      if (property.startsWith('--')) continue;
      const rendered = probe.getPropertyValue(property);
      const declared = stated.getPropertyValue(property);
      if (rendered !== declared) losses.push(`${property} renders ${rendered}, states ${declared}`);
    }
    const matched = subject.matches(member);
    document.body.replaceChildren();
    return { key, losses, matched, properties: rule.style.length };
  });
}

/** Measures `keys` in the page and returns one result per rule member that names a key. */
async function measure(keys, { derive = false } = {}) {
  const carriers = Object.fromEntries(keys.map(([key, carrier]) => [key, classesOf(carrier)]));
  carriers.derived = BUTTON_ROOT;
  return page.evaluate(measureInPage, { wanted: keys.map(([key]) => key), derive, carriers });
}

function classesOf(carrier) {
  return carrier === 'ArmedDangerButton' ? ARMED_DANGER_CLASSES : BUTTON_ROOT;
}

test('every reviewed override still renders each property it declares', async () => {
  const keys = [...SHEET_OVERRIDES, ...SCOPED_OVERRIDES.map(([, key, carrier]) => [key, carrier])];
  const results = await measure(keys);
  const seen = new Set(results.map(({ key }) => key));
  assert.deepEqual(
    keys.map(([key]) => key).filter((key) => !seen.has(key)),
    [],
    'every reviewed override is still a rule in the sheet or its component'
  );
  for (const { key, matched, properties } of results) {
    assert.ok(matched, `${key}: the markup its selector builds must match it`);
    assert.ok(properties > 0, `${key} declares something`);
  }
  assert.deepEqual(
    results.flatMap(({ key, losses }) => losses.map((loss) => `${key}: ${loss}`)),
    [],
    'an override the tripled root now beats has stopped painting its carrier'
  );
});

test('every resting rule spelled on the tripled or re-spelled root still wins on Button', async () => {
  const results = (await measure([], { derive: true })).filter(({ properties }) => properties > 0);
  assert.ok(results.length >= 40, `only ${results.length} re-spelled rules were derived`);
  for (const { key, matched } of results) assert.ok(matched, `${key}: its markup must match it`);
  assert.deepEqual(
    results.flatMap(({ key, losses }) => losses.map((loss) => `${key}: ${loss}`)),
    [],
    'a rule re-spelled on the root has stopped painting the button it names'
  );
});
