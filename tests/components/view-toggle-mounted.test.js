/**
 * Issue 2412 — `<ViewToggle>`: `SegmentedControl`'s icon-only form over the closed list and grid
 * pair, and the one place the product passes `iconOnly` to it.
 */
import assert from 'node:assert/strict';
import path, { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync } from 'svelte';
import { createClassComponent } from 'svelte/legacy';

import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { componentAstOf } from '../helpers/parsedSource.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { propNone, rendersComponent } from '../helpers/svelteStructureContract.js';
import { svelteFiles } from '../helpers/svelteTemplateScan.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const SEGMENTED = 'src/ui/svelte/components/SegmentedControl.svelte';
const VIEW_TOGGLE = 'src/ui/svelte/components/ViewToggle.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-view-toggle-',
  rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
  compiledModules: [SEGMENTED, VIEW_TOGGLE],
  componentPath: VIEW_TOGGLE,
});

const LABELS = Object.freeze({
  listLabel: 'List',
  gridLabel: 'Grid',
  ariaLabel: 'Essence presentation',
});

/** A second tree beside the harness's own, from the same compiled module instance. */
const extraMounts = [];
async function mountBeside(modulePath, props) {
  const { default: Component } = await harness.loadRawModule(`${modulePath}.js`);
  const target = document.createElement('div');
  target.className = 'fabricate-manager';
  document.body.appendChild(target);
  const instance = createClassComponent({ component: Component, target, props });
  flushSync();
  extraMounts.push({ instance, target });
  return target;
}

function destroyBeside() {
  for (const { instance, target } of extraMounts) {
    instance.$destroy();
    target.remove();
  }
  extraMounts.length = 0;
}

const radio = (root, view) => root.querySelector(`input[type="radio"][value="${view}"]`);
const labelOf = (root, view) => radio(root, view).closest('label');

function choose(root, view) {
  radio(root, view).dispatchEvent(new globalThis.Event('change', { bubbles: true }));
  flushSync();
}

describe('ViewToggle (issue 2412)', () => {
  before(() => harness.setup());
  afterEach(() => {
    destroyBeside();
    harness.remount();
  });
  after(() => harness.teardown());

  it('is a radiogroup named by ariaLabel whose two glyph radios are named by their labels', async () => {
    const i18n = globalThis.game.i18n;
    const localize = i18n.localize;
    i18n.localize = () => 'UNTRANSLATED';
    try {
      const root = await harness.mount({ ...LABELS, listLabel: 'Rows', gridLabel: 'Tiles' });
      const group = root.querySelector('[role="radiogroup"]');
      assert.equal(group.getAttribute('aria-label'), 'Essence presentation');
      for (const [view, word, glyph] of [
        ['list', 'Rows', 'fa-list'],
        ['grid', 'Tiles', 'fa-table-cells-large'],
      ]) {
        const label = labelOf(root, view);
        assert.equal(label.querySelector('.manager-segment-label').textContent, word);
        assert.equal(
          label.getAttribute('title'),
          word,
          `the ${view} option is titled with its name`
        );
        assert.ok(label.querySelector(`i.${glyph}[aria-hidden="true"]`), `the ${view} glyph`);
      }
      assert.equal(group.querySelectorAll('input[type="radio"]').length, 2, 'a closed pair');
    } finally {
      i18n.localize = localize;
    }
  });

  it('checks the option `view` names, and list for any value outside the pair', async () => {
    let root = await harness.mount({ ...LABELS, view: 'grid' });
    assert.equal(radio(root, 'grid').checked, true);
    assert.equal(radio(root, 'list').checked, false);
    harness.remount();
    root = await harness.mount({ ...LABELS, view: 'table' });
    assert.equal(radio(root, 'list').checked, true, 'anything but grid reads as list');
    assert.ok(labelOf(root, 'list').classList.contains('is-active'));
  });

  it('follows a new `view` and label without remounting', async () => {
    const root = await harness.mount({ ...LABELS, view: 'list' });
    await harness.setProps({ view: 'grid' });
    assert.equal(radio(root, 'grid').checked, true);
    assert.ok(labelOf(root, 'grid').classList.contains('is-active'));
    assert.ok(!labelOf(root, 'list').classList.contains('is-active'));
    await harness.setProps({ listLabel: 'Rows' });
    assert.equal(labelOf(root, 'list').querySelector('.manager-segment-label').textContent, 'Rows');
  });

  it('hands back the chosen view, and nothing for the one already checked', async () => {
    const calls = [];
    const root = await harness.mount({
      ...LABELS,
      view: 'list',
      onChange: (v) => {
        calls.push(v);
      },
    });
    choose(root, 'list');
    assert.deepEqual(calls, [], 'the checked option fires nothing');
    choose(root, 'grid');
    assert.deepEqual(calls, ['grid']);
  });

  it('lands the option hook on each label, and class and rest on the root', async () => {
    const root = await harness.mount({
      ...LABELS,
      optionDataAttr: 'data-probe-option',
      class: 'probe-class',
      'data-probe-root': 'yes',
    });
    for (const view of ['list', 'grid']) {
      assert.equal(labelOf(root, view).getAttribute('data-probe-option'), view);
      assert.ok(!radio(root, view).hasAttribute('data-probe-option'), 'never on the radio');
    }
    const group = root.querySelector('[role="radiogroup"]');
    assert.ok(group.classList.contains('manager-segmented'), 'the class extends the root');
    assert.ok(group.classList.contains('probe-class'));
    assert.equal(group.getAttribute('data-probe-root'), 'yes');
  });

  it('keeps the icon-only track when rest names a fixed prop', async () => {
    const root = await harness.mount({ ...LABELS, iconOnly: false, density: 'compact' });
    const group = root.querySelector('[role="radiogroup"]');
    assert.ok(group.classList.contains('is-icon-only'), 'iconOnly is not the caller’s');
    assert.ok(!group.classList.contains('is-compact'), 'density is not the caller’s');
  });

  it('names one control’s radios alike and two controls’ apart', async () => {
    const first = await harness.mount({ ...LABELS });
    const second = await mountBeside(VIEW_TOGGLE, { ...LABELS });
    const names = (root) => [...root.querySelectorAll('input[type="radio"]')].map((r) => r.name);
    const [a, b] = names(first);
    assert.ok(a, 'the group carries a name');
    assert.equal(a, b, 'one control is one radio group');
    assert.notEqual(names(second)[0], a, 'two controls are two radio groups');
  });

  it('renders the essence browser’s base call exactly, apart from the radio name', async () => {
    const translations = {
      'FABRICATE.Admin.Manager.Essence.ViewList': 'Liste',
      'FABRICATE.Admin.Manager.Essence.ViewGrid': 'Raster',
    };
    const i18n = globalThis.game.i18n;
    const localize = i18n.localize;
    i18n.localize = (key) => translations[key] ?? key;
    try {
      for (const view of ['list', 'grid']) {
        const shared = {
          ariaLabel: 'Essence presentation',
          'data-essence-view-mode': true,
          optionDataAttr: 'data-essence-view-option',
        };
        const adopted = await harness.mount({
          ...shared,
          view,
          listLabel: 'Liste',
          gridLabel: 'Raster',
        });
        const base = await mountBeside(SEGMENTED, {
          ...shared,
          value: view,
          iconOnly: true,
          groupName: 'manager-essence-view-mode',
          options: [
            {
              value: 'list',
              labelKey: 'FABRICATE.Admin.Manager.Essence.ViewList',
              fallback: 'List',
              icon: 'fas fa-list',
            },
            {
              value: 'grid',
              labelKey: 'FABRICATE.Admin.Manager.Essence.ViewGrid',
              fallback: 'Grid',
              icon: 'fas fa-table-cells-large',
            },
          ],
        });
        const groupOf = (root) => root.querySelector('[role="radiogroup"]');
        const checked = (root) =>
          [...root.querySelectorAll('input[type="radio"]')].map((r) => r.checked);
        assert.deepEqual(checked(adopted), checked(base), `the checked radio at ${view}`);
        const unnamed = (root) => {
          const clone = groupOf(root).cloneNode(true);
          for (const input of clone.querySelectorAll('input[type="radio"]')) input.name = 'group';
          return clone.outerHTML;
        };
        assert.equal(unnamed(adopted), unnamed(base), `the markup at ${view}`);
        destroyBeside();
        harness.remount();
      }
    } finally {
      i18n.localize = localize;
    }
  });
});

/** Icon-only controls that are not an arrangement switch, each with its reason. None yet. */
const ICON_ONLY_ALLOWED = Object.freeze({});

// Limit: it sees neither an aliased import nor a spread, only the literal tag and attribute.
it('passes iconOnly to SegmentedControl only through ViewToggle', () => {
  const passingAll = svelteFiles(path.join(repoRoot, 'src'))
    .map((full) => path.relative(repoRoot, full).split(path.sep).join('/'))
    .filter((file) => {
      // One site passing iconOnly is enough, so a file with a second,
      // labelled track is still caught.
      const ast = componentAstOf(file);
      return (
        rendersComponent(ast, 'SegmentedControl') && !propNone(ast, 'SegmentedControl', 'iconOnly')
      );
    });
  for (const file of Object.keys(ICON_ONLY_ALLOWED)) {
    assert.ok(passingAll.includes(file), `${file} is allowed but no longer passes iconOnly`);
  }
  const passing = passingAll.filter((file) => !Object.hasOwn(ICON_ONLY_ALLOWED, file));
  assert.deepEqual(passing, [VIEW_TOGGLE]);
});
