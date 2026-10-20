/**
 * Every reviewed override of the button rung still wins, measured in Chromium (issue 2540).
 * Retiring `fab-manager-button` put `ArmedDangerButton` and the converted popover triggers under
 * the tripled root's (0,3,0) rung, which they never matched before. Each rule below was reviewed
 * to restate that rung on its carrier, and every sheet rule naming the root twice or more, plus
 * every scoped rule issue 2540 re-spelled, is derived beside them; each is drawn on markup its own
 * selector builds and must render every property it declares, by winning the cascade or by a tie
 * that renders the value it states.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from 'playwright';

import {
  ROOT,
  cascadeMembers,
  isProbeable,
  openCascadePage,
  probeMembers,
} from '../helpers/buttonCascadeProbe.js';

/**
 * The classes each carrier writes at rest, which `armed-danger-button-mounted.test.js` and
 * `manager-button-mounted.test.js` pin by mounting each component.
 */
const CARRIERS = Object.freeze({ ArmedDangerButton: `${ROOT} is-danger`, Button: ROOT });

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
    'src/ui/svelte/apps/manager/BulkDeleteCard.svelte',
    '.fabricate-card.fab-bulk-delete-card .fabricate-button',
    'ArmedDangerButton',
  ],
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

let browser;
let page;

before(async () => {
  browser = await chromium.launch();
  page = await openCascadePage(browser, SCOPED_FILES);
});

after(async () => browser?.close());

/** How many times a member names the root as a class. */
const rootCount = (member) =>
  member.match(new RegExp(String.raw`\.${ROOT}(?![\w-])`, 'g'))?.length ?? 0;

/**
 * The base family's own doubled-root rules — the root and its roles, with nothing else — which the
 * primitive's tripled rung is designed to beat; `manager-button-cascade-inventory.test.js` holds
 * that each still wins something.
 */
const BASE_FAMILY = /^(?:\.fabricate-button){2}(?:\.is-[\w-]+|:not\([^)]*\)|:hover|:is\(a\))*$/;

/** The longhands a probe lost: neither won nor tied on the value it states. */
const lossesOf = ({ member, longhands, hovered }) =>
  longhands
    .filter(({ wins, rendered, declared }) => !wins && (hovered || rendered !== declared))
    .map(({ property, winner }) => `${member}: ${property} lost to ${winner}`);

test('every reviewed override still renders each property it declares', async () => {
  const keys = new Map(
    [...SHEET_OVERRIDES, ...SCOPED_OVERRIDES.map(([, key, carrier]) => [key, carrier])].map(
      ([key, carrier]) => [key, CARRIERS[carrier]]
    )
  );
  const members = await cascadeMembers(page);
  const canonical = await page.evaluate(
    (list) =>
      list.map((key) => {
        const sheet = new CSSStyleSheet();
        sheet.insertRule(`${key} {}`);
        return sheet.cssRules[0].selectorText;
      }),
    [...keys.keys()]
  );
  const byCanonical = new Map(
    [...keys].map(([key, carrier], at) => [canonical[at], { key, carrier }])
  );
  const targets = members
    .filter(({ bare }) => byCanonical.has(bare))
    .map(({ order, member, bare }) => ({ order, member, carrier: byCanonical.get(bare).carrier }));
  const seen = new Set(
    members.filter(({ bare }) => byCanonical.has(bare)).map(({ bare }) => byCanonical.get(bare).key)
  );
  assert.deepEqual(
    [...keys.keys()].filter((key) => !seen.has(key)),
    [],
    'every reviewed override is still a rule in the sheet or its component'
  );
  const results = await probeMembers(page, targets);
  for (const { member, matched, longhands } of results) {
    assert.ok(matched, `${member}: the markup its selector builds must match it`);
    assert.ok(longhands.length > 0, `${member} declares something`);
  }
  assert.deepEqual(
    results.flatMap(lossesOf),
    [],
    'an override the tripled root now beats has stopped painting its carrier'
  );
});

test('every rule naming the root twice or more, or re-spelled in a scoped block, still wins', async () => {
  // The first sheet is the module's; the rest are compiled component blocks, each re-spelled
  // rule of which names the root at least twice too.
  const targets = (await cascadeMembers(page))
    .filter(({ bare }) => rootCount(bare) >= 2 && !BASE_FAMILY.test(bare) && isProbeable(bare))
    .map(({ order, member }) => ({ order, member, carrier: ROOT }));
  const results = (await probeMembers(page, targets)).filter(({ longhands }) => longhands.length);
  assert.ok(results.length >= 60, `only ${results.length} rules naming the root twice were drawn`);
  for (const { member, matched } of results)
    assert.ok(matched, `${member}: its markup must match it`);
  const split = results.filter(({ member }) => !member.includes(`.${ROOT}.${ROOT}.${ROOT}`));
  assert.ok(
    split.length >= 10,
    `the doubled and split re-spellings are measured too: ${split.length}`
  );
  assert.deepEqual(
    results.flatMap(lossesOf),
    [],
    'a rule re-spelled on the root has stopped painting the button it names'
  );
});
