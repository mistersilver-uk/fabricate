/**
 * Issue 2445 — the GM read-only complication list both studios render in a stage row's body: a
 * non-reorderable, unnumbered `SortableList` of the library's complication rows, under the muted
 * "Complications" kicker, named for its count and owner, and drawing no control or severity tile.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const LIST_PATH = 'src/ui/svelte/apps/manager/StageComplicationList.svelte';
const repoRoot = resolve(import.meta.dirname, '../..');
const STYLED = Object.freeze([
  'src/ui/svelte/components/Chip.svelte',
  'src/ui/svelte/components/Kicker.svelte',
  'src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte',
  LIST_PATH,
]);

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-stage-complication-list-',
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/model/complicationSummary.js',
    'src/systems/characterPrerequisites.js',
    'src/ui/svelte/util/appLocalizer.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/RowDisclosure.svelte',
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/Kicker.svelte',
    'src/ui/svelte/components/SortableList.svelte',
    'src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte',
    LIST_PATH,
  ],
  componentPath: LIST_PATH,
});

const MACRO_UUID = 'Macro.shrapnel';

const COMPLICATIONS = Object.freeze([
  {
    id: 'cx-dust',
    name: 'Choking dust',
    severity: 'severe',
    visibility: 'visible',
    when: { stageMissed: true },
    effectRoll: { enabled: true, expr: '2d6' },
  },
  { id: 'cx-spoiled', name: 'Spoiled batch', severity: 'minor', visibility: 'gmOnly', when: {} },
  {
    id: 'cx-burst',
    name: 'Glass burst',
    severity: 'major',
    visibility: 'gmOnly',
    when: { stagePartial: true },
    macroUuid: MACRO_UUID,
  },
]);

function mountList(complications = COMPLICATIONS) {
  return harness.mount({
    complications,
    ownerId: 'cmp-reagent',
    ownerName: 'Ground Reagent',
    macroNames: new Map([[MACRO_UUID, 'Shrapnel Burst']]),
    triggerLabels: new Map(),
  });
}

/** The rows, addressed by the row primitive's own variant hook rather than a caller's. */
const rowsOf = (target) => [...target.querySelectorAll('[data-complication-row="readonly-gm"]')];

describe('2445 StageComplicationList', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('RED: is a SortableList named for its count and owner, carrying its owner’s hook', async () => {
    const target = await mountList();
    const list = target.querySelector('ul.fabricate-sortable-list');
    assert.ok(Boolean(list), 'the complications are a list of the shared ordered list’s rows');
    assert.equal(list.getAttribute('aria-label'), '3 complications on Ground Reagent');
    assert.equal(
      list.getAttribute('data-stage-complications'),
      'cmp-reagent',
      'the owner hook is on the list'
    );
    harness.remount();

    const one = await mountList(COMPLICATIONS.slice(0, 1));
    assert.equal(
      one.querySelector('ul.fabricate-sortable-list')?.getAttribute('aria-label'),
      '1 complication on Ground Reagent'
    );
  });

  it('RED: holds one list row per complication, each the read-only summary row', async () => {
    const target = await mountList();
    const list = target.querySelector('ul.fabricate-sortable-list');
    assert.ok(Boolean(list), 'the list renders');
    const rows = [...list.querySelectorAll(':scope > .fabricate-sortable-list-row')];
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map(
        (row) =>
          row.querySelectorAll('[data-complication-row="readonly-gm"][data-stage-complication]')
            .length
      ),
      [1, 1, 1]
    );
    assert.deepEqual(
      rows.map((row) =>
        row.querySelector('[data-stage-complication]').getAttribute('data-stage-complication')
      ),
      ['cx-dust', 'cx-spoiled', 'cx-burst']
    );
  });

  it('RED: draws no grip, rocker, delete, disclosure, ordinal or control of any kind', async () => {
    const target = await mountList();
    assert.ok(Boolean(target.querySelector('ul.fabricate-sortable-list')), 'the list renders');
    const controls = [
      '[data-sortable-grip]',
      '[data-sortable-move]',
      '[data-sortable-remove]',
      '[data-sortable-disclosure]',
      '[data-sortable-ordinal]',
      'button, input, select, textarea',
    ].filter((selector) => target.querySelector(selector));
    assert.deepEqual(controls, [], 'nothing in the list edits or reorders a complication');
  });

  it('RED: draws no severity tile — the badge alone carries severity', async () => {
    const target = await mountList();
    assert.equal(rowsOf(target).length, 3, 'the rows render');
    assert.ok(!target.querySelector('.fab-complication-severity'), 'no 30px square tile');
  });

  it('GUARD: chips read the severity word, and only the visible complication says Player', async () => {
    const target = await mountList();
    const chips = rowsOf(target).map((row) =>
      [...row.querySelectorAll('.manager-chip')].map((chip) => chip.textContent.trim())
    );
    assert.deepEqual(chips, [['Player', 'Severe'], ['Minor'], ['Major']]);
  });

  it('RED: names each complication in the display face', async () => {
    const target = await mountList();
    const names = rowsOf(target).map((row) => row.querySelector('.fab-complication-row-name'));
    assert.equal(names.length, 3, 'the rows render');
    assert.ok(
      names.every((name) => name.classList.contains('is-display')),
      'the library’s complication row name: serif 12.5/600'
    );
  });

  it('RED: titles each body with its full sentence, resolving the macro’s name', async () => {
    const target = await mountList();
    const bodies = rowsOf(target).map((row) =>
      row.querySelector('.fab-complication-row-body').getAttribute('title')
    );
    assert.deepEqual(bodies, [
      'When the award is missed · rolls 2d6',
      'No trigger set — never fires',
      'When the award is only partly covered · runs Shrapnel Burst',
    ]);
  });

  it('RED: introduces the list with the muted "Complications" kicker', async () => {
    const target = await mountList();
    const kicker = target.querySelector('.fab-kicker');
    assert.ok(Boolean(kicker), 'the kicker renders');
    assert.equal(kicker.textContent.trim(), 'Complications');
    assert.ok(!kicker.classList.contains('is-accent'), 'in the default muted tone');
    const list = target.querySelector('ul.fabricate-sortable-list');
    assert.ok(
      Boolean(list) &&
        Boolean(
          kicker.compareDocumentPosition(list) & globalThis.window.Node.DOCUMENT_POSITION_FOLLOWING
        ),
      'above the list'
    );
  });

  // GUARD: red when the list's `font-weight: 400` is deleted.
  it('GUARD: the trigger sentence keeps 400 inside the Component Studio’s 500 field', async () => {
    const { innerHTML } = await mountList();
    const css = STYLED.map((path) => scopedComponentCss(resolve(repoRoot, path)).css).join('\n');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(
        '<!doctype html><html><head><meta charset="utf-8">' +
          `<style>@layer modules { ${readStylesheet()} }</style><style>${css}</style></head><body>` +
          '<div class="fabricate fabricate-manager" data-fabricate-theme="fabricate">' +
          `<div class="fabricate-field" style="width:420px">${innerHTML}</div></div></body></html>`
      );
      const weights = await page.$$eval('.fab-complication-row-body', (bodies) =>
        bodies.map((body) => getComputedStyle(body).fontWeight)
      );
      assert.deepEqual(weights, ['400', '400', '400']);
    } finally {
      await browser.close();
    }
  });

  it('GUARD: renders nothing at all for no complications', async () => {
    const target = await mountList([]);
    assert.equal(target.textContent.trim(), '', 'no kicker, no list, no status region');
    assert.equal(target.children.length, 0);
  });
});
