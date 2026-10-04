/**
 * The four `EditorTabs` capabilities issue 1779 adds — the tab-stop fallback, the per-tab name
 * override, the per-tab description and the premium padlock — plus click-to-focus, the sheet rules
 * that draw the description, and the scoped danger rules (spec.md "A tab strip always keeps a tab
 * stop, and names and describes a tab from its own entry").
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync, tick } from 'svelte';

import { censusRules } from '../../scripts/lib/stylesheetSelectorCensus.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const PRIMITIVE = 'src/ui/svelte/components/EditorTabs.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-editor-tabs-capabilities-',
  rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES],
  compiledModules: ['src/ui/svelte/components/Chip.svelte', PRIMITIVE],
  componentPath: PRIMITIVE,
});

let shippedLocalize;
before(async () => {
  await harness.setup();
  shippedLocalize = globalThis.game.i18n.localize;
});
after(() => harness.teardown());
afterEach(() => {
  globalThis.game.i18n.localize = shippedLocalize;
  harness.remount();
});

async function settle() {
  flushSync();
  await tick();
  flushSync();
}

const TABS = Object.freeze([
  { id: 'overview', icon: 'fas fa-circle-info', labelKey: 'x.Overview', label: 'Overview' },
  { id: 'inputs', icon: 'fas fa-list', labelKey: 'x.Inputs', label: 'Inputs' },
  { id: 'outputs', icon: 'fas fa-box', labelKey: 'x.Outputs', label: 'Outputs' },
]);

const DESCRIBED = Object.freeze(
  TABS.map((tab) => ({ ...tab, tooltipKey: `x.${tab.id}.Tip`, tooltip: `About ${tab.label}` }))
);

const buttons = (root) => [...root.querySelectorAll('[role="tab"]')];
const button = (root, id) => root.querySelector(`#editor-tab-${id}`);
const attributeOf = (root, name) => buttons(root).map((node) => node.getAttribute(name));
const shown = (root) =>
  [...root.querySelectorAll('[role="tooltip"]')]
    .filter((tip) => tip.classList.contains('is-described'))
    .map((tip) => tip.id);
const fire = (node, type) => node.dispatchEvent(new globalThis.Event(type, { bubbles: false }));
const press = (node, key) =>
  node.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key, bubbles: true }));

describe('the tab stop falls back to the first tab', () => {
  it('gives the first tab the stop and selects none when activeTab names no rendered tab', async () => {
    const root = await harness.mount({ tabs: TABS, activeTab: 'missing' });
    assert.deepEqual(attributeOf(root, 'tabindex'), ['0', '-1', '-1']);
    assert.deepEqual(attributeOf(root, 'aria-selected'), ['false', 'false', 'false']);
  });

  it('moves the stop to the first tab when a re-render removes the active one', async () => {
    const root = await harness.mount({ tabs: TABS, activeTab: 'inputs' });
    assert.deepEqual(attributeOf(root, 'tabindex'), ['-1', '0', '-1']);
    await harness.setProps({ tabs: TABS.filter((tab) => tab.id !== 'inputs') });
    await settle();
    assert.deepEqual(attributeOf(root, 'tabindex'), ['0', '-1']);
    assert.deepEqual(attributeOf(root, 'aria-selected'), ['false', 'false']);
  });
});

describe('a tab entry may override its accessible name', () => {
  it('writes the localized override, and no attribute for an entry without one', async () => {
    globalThis.game.i18n.localize = (key) => (key === 'x.Name' ? 'Open the inputs' : key);
    const root = await harness.mount({
      tabs: [TABS[0], { ...TABS[1], ariaLabelKey: 'x.Name', ariaLabel: 'Inputs (fallback)' }],
      activeTab: 'overview',
    });
    assert.equal(button(root, 'inputs').getAttribute('aria-label'), 'Open the inputs');
    assert.ok(!button(root, 'overview').hasAttribute('aria-label'), 'no override, no attribute');
  });

  it('falls back to the English name when the key is untranslated', async () => {
    const root = await harness.mount({
      tabs: [{ ...TABS[0], ariaLabelKey: 'x.Missing', ariaLabel: 'Open the overview' }],
      activeTab: 'overview',
    });
    assert.equal(button(root, 'overview').getAttribute('aria-label'), 'Open the overview');
  });
});

describe('a tab entry may carry a description', () => {
  it('renders each description beside the tablist and points its tab at it', async () => {
    const root = await harness.mount({
      tabs: DESCRIBED,
      activeTab: 'overview',
      idStem: 'world-downtime',
      tooltipDataAttr: 'data-x-tooltip',
    });
    const tablist = root.querySelector('[role="tablist"]');
    assert.equal(
      tablist.querySelectorAll('[role="tooltip"]').length,
      0,
      'a tablist owns only tabs'
    );
    for (const tab of DESCRIBED) {
      const tip = root.querySelector(`#world-downtime-tooltip-${tab.id}`);
      assert.ok(Boolean(tip), `${tab.id} has a description node`);
      assert.ok(tip.parentElement === tablist.parentElement, 'the description is a sibling');
      assert.equal(tip.getAttribute('data-x-tooltip'), tab.id);
      assert.equal(tip.textContent, tab.tooltip);
      assert.equal(
        root.querySelector(`#world-downtime-tab-${tab.id}`).getAttribute('aria-describedby'),
        `world-downtime-tooltip-${tab.id}`
      );
    }
  });

  it('renders no description node and no describedby when no entry carries one', async () => {
    const root = await harness.mount({ tabs: TABS, activeTab: 'overview' });
    assert.equal(root.querySelectorAll('[role="tooltip"]').length, 0);
    assert.deepEqual(attributeOf(root, 'aria-describedby'), [null, null, null]);
  });

  it('honours a tooltip id stem of the caller`s own', async () => {
    const root = await harness.mount({
      tabs: DESCRIBED,
      activeTab: 'overview',
      tooltipIdStem: 'x-tip',
    });
    assert.equal(button(root, 'inputs').getAttribute('aria-describedby'), 'x-tip-inputs');
    assert.ok(Boolean(root.querySelector('#x-tip-inputs')));
  });

  it('shows the hovered tab over the focused one and falls back to focus when hover leaves', async () => {
    const root = await harness.mount({ tabs: DESCRIBED, activeTab: 'overview' });
    assert.deepEqual(shown(root), [], 'nothing is described before any interaction');

    fire(button(root, 'overview'), 'focus');
    await settle();
    assert.deepEqual(shown(root), ['editor-tooltip-overview']);

    fire(button(root, 'outputs'), 'mouseenter');
    await settle();
    assert.deepEqual(shown(root), ['editor-tooltip-outputs'], 'hover wins over focus');

    fire(button(root, 'outputs'), 'mouseleave');
    await settle();
    assert.deepEqual(
      shown(root),
      ['editor-tooltip-overview'],
      'the focused tab is described again'
    );

    fire(button(root, 'overview'), 'blur');
    await settle();
    assert.deepEqual(shown(root), [], 'blur with no hover hides it');
  });

  it('hides the shown description on Escape until that tab is next hovered or focused', async () => {
    const selected = [];
    const root = await harness.mount({
      tabs: DESCRIBED,
      activeTab: 'inputs',
      onSelect: (id) => {
        selected.push(id);
      },
    });
    const inputs = button(root, 'inputs');
    inputs.focus();
    fire(inputs, 'focus');
    await settle();
    assert.deepEqual(shown(root), ['editor-tooltip-inputs']);

    press(inputs, 'Escape');
    await settle();
    assert.deepEqual(shown(root), [], 'Escape hides it');
    assert.ok(globalThis.document.activeElement === inputs, 'without moving focus');
    assert.deepEqual(selected, [], 'or selection');
    assert.equal(inputs.getAttribute('aria-selected'), 'true');

    fire(button(root, 'outputs'), 'mouseenter');
    fire(button(root, 'outputs'), 'mouseleave');
    await settle();
    assert.deepEqual(shown(root), [], 'another tab`s hover does not re-arm it');

    fire(inputs, 'mouseenter');
    await settle();
    assert.deepEqual(shown(root), ['editor-tooltip-inputs'], 'its own next hover re-arms it');
  });

  it('focuses the tab a pointer click selects', async () => {
    const selected = [];
    const root = await harness.mount({
      tabs: DESCRIBED,
      activeTab: 'overview',
      onSelect: (id) => {
        selected.push(id);
      },
    });
    button(root, 'overview').focus();
    button(root, 'outputs').click();
    await settle();
    assert.deepEqual(selected, ['outputs']);
    assert.ok(
      globalThis.document.activeElement === button(root, 'outputs'),
      'the clicked tab holds focus'
    );
  });
});

describe('a tier-gated tab carries the premium padlock', () => {
  const GATED = Object.freeze([
    { ...TABS[0], tierGated: true },
    TABS[1],
    { ...TABS[2], tierGated: true },
  ]);
  const locks = (node) => node.querySelectorAll('.manager-editor-tab-lock');

  it('draws one hidden padlock per gated tab and none on an ungated one', async () => {
    const root = await harness.mount({ tabs: GATED, activeTab: 'overview' });
    assert.deepEqual(
      buttons(root).map((node) => locks(node).length),
      [1, 0, 1]
    );
    for (const lock of root.querySelectorAll('.manager-editor-tab-lock')) {
      assert.equal(lock.getAttribute('aria-hidden'), 'true');
    }
  });

  it('keeps a gated tab focusable and selectable by click and by arrow', async () => {
    const selected = [];
    const root = await harness.mount({
      tabs: GATED,
      activeTab: 'overview',
      onSelect: (id) => {
        selected.push(id);
      },
    });
    const overview = button(root, 'overview');
    assert.equal(overview.getAttribute('tabindex'), '0');
    assert.ok(!overview.hasAttribute('disabled') && !overview.hasAttribute('aria-disabled'));
    button(root, 'outputs').click();
    press(overview, 'ArrowRight');
    assert.deepEqual(selected, ['outputs', 'inputs']);
  });

  it('keeps the stop, the selection and focus when the focused tab re-renders gated', async () => {
    const root = await harness.mount({ tabs: TABS, activeTab: 'inputs' });
    const inputs = button(root, 'inputs');
    inputs.focus();
    await harness.setProps({ tabs: GATED });
    await settle();
    assert.ok(button(root, 'inputs') === inputs, 'the keyed button survives');
    assert.ok(globalThis.document.activeElement === inputs, 'focus stays on the re-rendered tab');
    assert.equal(inputs.getAttribute('tabindex'), '0');
    assert.equal(inputs.getAttribute('aria-selected'), 'true');
    harness.remount();
    const gated = await harness.mount({ tabs: GATED, activeTab: 'overview' });
    const overview = button(gated, 'overview');
    overview.focus();
    assert.equal(overview.getAttribute('aria-selected'), 'true');
    assert.ok(!overview.hasAttribute('disabled') && !overview.hasAttribute('aria-disabled'));
  });
});

describe('the sheet draws the description, and the danger tint stays scoped', () => {
  const rules = censusRules(readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8'));
  const declared = (selector, property) =>
    rules
      .flatMap((rule) => (rule.selectors.includes(selector) ? rule.declarations : []))
      .filter((declaration) => declaration.property === property)
      .map((declaration) => declaration.value);

  it('hides a description by visibility and shows the described one', () => {
    assert.deepEqual(declared('.fabricate-tabs ~ .fabricate-tabs-tooltip', 'visibility'), [
      'hidden',
    ]);
    assert.deepEqual(
      declared('.fabricate-tabs ~ .fabricate-tabs-tooltip.is-described', 'visibility'),
      ['visible']
    );
    assert.deepEqual(
      rules
        .flatMap((rule) => rule.selectors)
        .filter((selector) => selector.includes('.fabricate-tabs .fabricate-tabs-tooltip')),
      [],
      'the description is a sibling of the tablist, so a descendant rule matches nothing'
    );
  });

  it('emits both danger rules with the primitive`s scoping class', () => {
    const { css, hashClass } = scopedComponentCss(resolve(repoRoot, PRIMITIVE));
    for (const selector of [
      `.manager-editor-tab-button.is-danger.${hashClass}`,
      `.manager-editor-tab-button.is-danger.is-active.${hashClass}`,
    ]) {
      assert.ok(css.includes(`${selector} {`), `the compiled block carries ${selector}`);
    }
  });
});
