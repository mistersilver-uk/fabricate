/**
 * Issue 2553 - the Component Studio's complications card keeps its column width when a row's
 * summary names a long unbroken compendium uuid. Mounted through the real section and measured in
 * Chromium under the manager sheet: the summary is one nowrap line, so without a bounded track it
 * would set the card's width instead of ellipsising.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import {
  COMPONENT_EDIT_VIEW_COMPILED_MODULES,
  COMPONENT_EDIT_VIEW_RAW_MODULES,
  COMPONENT_EDIT_VIEW_RUNE_MODULES,
} from '../helpers/componentEditViewModules.js';
import { borrowBrowser } from '../helpers/layout-harness.js';
import { collectScopedCss } from '../helpers/renderedManagerShell.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const SECTION = 'src/ui/svelte/apps/manager/component/ComponentComplicationsSection.svelte';
const COLUMN_PX = 596;
const LAB_UUID = 'Compendium.lab-world.retired-complication-macros.Macro.lab0retired0dust0cloud';

const compiledModules = [...COMPONENT_EDIT_VIEW_COMPILED_MODULES];
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-complications-width-rendered-',
  rawModules: COMPONENT_EDIT_VIEW_RAW_MODULES,
  runeModules: COMPONENT_EDIT_VIEW_RUNE_MODULES,
  compiledModules,
  componentPath: SECTION,
});

const dustCloud = Object.freeze({
  id: 'cx-dust',
  name: 'Choking dust',
  description: '',
  severity: 'major',
  visibility: 'gmOnly',
  activities: { crafting: true, salvage: false, gathering: false },
  match: 'any',
  when: { stageAwarded: false, stagePartial: false, stageMissed: true, checkTrigger: null },
  rollCondition: { enabled: false, expr: '1d20', cmp: 'eq', value: '1' },
  effectRoll: { enabled: true, expr: '1d4', label: '' },
  macroUuid: LAB_UUID,
});

/** Runs IN THE PAGE: the card, its list, the row and the summary against the column. */
function measureCard() {
  const box = (element) => Math.round(element.getBoundingClientRect().width * 10) / 10;
  const card = document.querySelector('[data-complications-section]');
  const body = card.querySelector('.fab-complication-row-body');
  return {
    column: box(document.querySelector('[data-probe-column]')),
    card: box(card),
    row: box(card.querySelector('.fab-complication-row')),
    rowOverhang:
      Math.round(
        (card.querySelector('.fab-complication-row').getBoundingClientRect().right -
          card.getBoundingClientRect().right) *
          10
      ) / 10,
    body: box(body),
    bodyText: body.textContent,
    bodyTitle: body.getAttribute('title'),
    clipped: body.scrollWidth > body.clientWidth,
    ellipsised: getComputedStyle(body).textOverflow === 'ellipsis',
  };
}

describe('2553 the complications card keeps its column with a long macro uuid', () => {
  const state = { markup: '', measured: null };

  before(async () => {
    await harness.setup();
    try {
      const target = await harness.mount({
        activityProgressive: { crafting: true, salvage: true, gathering: true },
        complications: [dustCloud],
      });
      state.markup = target.innerHTML;
    } finally {
      harness.teardown();
    }
    const scoped = collectScopedCss({ repoRoot, compiledModules });
    const browser = await borrowBrowser();
    try {
      const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
      await page.setContent(
        '<!doctype html><html><head><meta charset="utf-8">' +
          `<style>@layer modules { ${readStylesheet()} }</style><style>${scoped.css}</style>` +
          '<style>:root { --font-primary: Arial, sans-serif; } body { margin: 0; }</style>' +
          '</head><body><div class="fabricate fabricate-manager" data-fabricate-theme="dark">' +
          `<div data-probe-column style="width:${COLUMN_PX}px">${state.markup}</div>` +
          '</div></body></html>',
        { waitUntil: 'load' }
      );
      state.measured = await page.evaluate(measureCard);
    } finally {
      await browser.close();
    }
  });

  after(() => {
    state.measured = null;
  });

  it('names the macro by its uuid, so the fixture reaches the long unbroken token', () => {
    assert.ok(
      state.measured.bodyTitle.includes(LAB_UUID),
      'the summary reads the uuid the macro cache cannot name'
    );
  });

  it('keeps the card and its row inside the column', () => {
    const { column, card, row, rowOverhang } = state.measured;
    assert.ok(card <= column, `the card is ${card}px in a ${column}px column`);
    assert.ok(row <= column, `the row is ${row}px in a ${column}px column`);
    assert.ok(rowOverhang <= 0, `the row overhangs the card by ${rowOverhang}px`);
  });

  it('ellipsises the summary and leaves the full text on its title', () => {
    const { body, column, clipped, ellipsised, bodyText, bodyTitle } = state.measured;
    assert.ok(body < column, `the summary is ${body}px in a ${column}px column`);
    assert.ok(clipped && ellipsised, 'the overlong line is clipped with an ellipsis');
    assert.equal(bodyTitle, bodyText, 'the title carries the whole sentence');
  });
});
