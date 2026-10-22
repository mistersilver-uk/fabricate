/**
 * The published `EditorTabs` on Fabricate's real Svelte runtime (issue 2601), through a fresh seam
 * registered with the adapter's own table, under the Fabricate window root it needs: the tablist
 * and its native tab buttons, the ids built from `idStem` that a companion's panels answer, each
 * tab named by its `label`, a press and the four keys its group names with the one `id` its
 * `onSelect` takes, focus moved first and the selection drawn only on the companion's `update`,
 * `activePanelOnly`, every refusal the entry adds, what a tab member it does not publish draws
 * (nothing), no listener on the document, and the docs section's worked strip run as written.
 * Limit: happy-dom presses no button on a synthetic Enter or Space keydown, so a press is a
 * `click`, and those keys are asserted unhandled by the strip's own listener.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';

import { recorder } from '../helpers/publishedComponentFakes.js';
import {
  CALLBACK_REPORT,
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  companionTarget,
  fabricateTarget,
  harnessLoaders,
  recordEscapes,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const REFUSAL = 'Fabricate | published components: ';
const STEM = 'acme-reagents';
const TABS = Object.freeze([
  { id: 'inputs', label: 'Inputs', icon: 'fas fa-flask' },
  { id: 'outputs', label: 'Outputs', icon: 'fas fa-box-open' },
  { id: 'notes', label: 'Notes' },
]);

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-published-editor-tabs-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let seamParts;
let reports;
let escaped;
let targets;
let stopRecording;

const ui = () =>
  shippedSeam({
    ...seamParts,
    report: (...args) => {
      reports.push(args);
    },
  });

before(async () => {
  await harness.setup();
  const { publishedComponentRuntime: runtime, COMPONENTS: components } =
    await harness.loadRuneModule(PUBLISHED_ADAPTER);
  const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
  seamParts = { createPublishedComponents, runtime, components, loaders: harnessLoaders(harness) };
  stopRecording = recordEscapes((error) => {
    escaped.push(error);
  });
});

after(() => {
  stopRecording();
  return harness.teardown();
});

beforeEach(() => {
  reports = [];
  escaped = [];
  targets = [];
});

afterEach(() => {
  for (const shell of targets) shell.remove();
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
});

/** The strip's required props over `TABS`, with `onSelect` given or recorded, and `overrides`. */
const stripProps = (onSelect, overrides = {}) => ({
  tabs: TABS,
  activeTab: 'inputs',
  ariaLabel: 'Reagent sections',
  idStem: STEM,
  onSelect,
  ...overrides,
});

/** A strip mounted under a Fabricate window: its target, handle, recorded calls and its parts. */
function mountStrip(overrides = {}, onSelect = undefined) {
  const select = recorder();
  const target = fabricateTarget(targets);
  const props = stripProps(onSelect ?? select.record, overrides);
  const handle = ui().mount('EditorTabs', { target, props });
  return {
    target,
    handle,
    props,
    calls: select.calls,
    tablist: () => target.querySelector('[role="tablist"]'),
    tab: (id) => target.querySelector(`#${STEM}-tab-${id}`),
    tabs: () => [...target.querySelectorAll('[role="tab"]')],
  };
}

const press = (node, key) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  node.dispatchEvent(event);
  return event;
};

const attributeOf = (nodes, name) => nodes.map((node) => node.getAttribute(name));
const authoredClasses = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

/** The refusal `mount` throws for the strip's props with `overrides`, with nothing rendered. */
function assertRefused(overrides, tail) {
  const target = fabricateTarget(targets);
  assert.throws(
    () => ui().mount('EditorTabs', { target, props: stripProps(() => {}, overrides) }),
    {
      name: 'TypeError',
      message: REFUSAL + tail,
    }
  );
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

describe('the published EditorTabs', () => {
  it('describes the six keys its manifest entry publishes, at the fabricate root', () => {
    const described = ui().describe('EditorTabs');
    assert.deepEqual(Object.keys(described.props), [
      'tabs',
      'activeTab',
      'onSelect',
      'ariaLabel',
      'idStem',
      'activePanelOnly',
    ]);
    assert.deepEqual(described.props.onSelect, { kind: 'callback', required: true });
    assert.equal(described.root, 'fabricate');
    assert.equal(described.overlays, false);
  });

  it('draws one tablist named by ariaLabel, holding one typed tab button for each item, marked for keyboard focus', async () => {
    const { target, handle, tablist, tabs } = mountStrip();
    await settle();
    assert.equal(target.children.length, 1, 'the tablist is the only element in target');
    assert.ok(target.firstElementChild === tablist());
    assert.equal(tablist().getAttribute('aria-label'), 'Reagent sections');
    assert.deepEqual(
      tabs().map((node) => [node.localName, node.getAttribute('type'), node.dataset.keyboardFocus]),
      TABS.map(() => ['button', 'button', 'true'])
    );
    assert.ok(
      tabs().every((node) => node.parentElement === tablist()),
      'each tab is the tablist’s'
    );
    handle.destroy();
    assert.equal(target.childNodes.length, 0, 'destroy leaves target empty');
    await settle();
    assert.deepEqual(reports, []);
  });

  it('builds each tab’s id and aria-controls from idStem, and a companion’s panel answers them', async () => {
    const { handle, tabs } = mountStrip();
    await settle();
    assert.deepEqual(
      attributeOf(tabs(), 'id'),
      TABS.map(({ id }) => `${STEM}-tab-${id}`)
    );
    assert.deepEqual(
      attributeOf(tabs(), 'aria-controls'),
      TABS.map(({ id }) => `${STEM}-panel-${id}`)
    );
    const panel = document.createElement('div');
    panel.id = `${STEM}-panel-inputs`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `${STEM}-tab-inputs`);
    targets.at(-1).append(panel);
    const first = tabs()[0];
    const byId = (id) => document.querySelector(`[id="${id}"]`);
    assert.ok(byId(first.getAttribute('aria-controls')) === panel);
    assert.ok(byId(panel.getAttribute('aria-labelledby')) === first);
    handle.destroy();
  });

  it('writes aria-controls on the selected tab alone under activePanelOnly, and on every tab without it', async () => {
    const { handle, props, tabs } = mountStrip({ activePanelOnly: true });
    await settle();
    assert.deepEqual(attributeOf(tabs(), 'aria-controls'), [`${STEM}-panel-inputs`, null, null]);
    handle.update({ ...props, activePanelOnly: false });
    await settle();
    assert.equal(attributeOf(tabs(), 'aria-controls').filter(Boolean).length, TABS.length);
    handle.destroy();
  });

  it('draws the activeTab item selected and the tab stop, and the first tab the stop when it names none', async () => {
    const { handle, props, tabs } = mountStrip({ activeTab: 'outputs' });
    await settle();
    assert.deepEqual(attributeOf(tabs(), 'aria-selected'), ['false', 'true', 'false']);
    assert.deepEqual(attributeOf(tabs(), 'tabindex'), ['-1', '0', '-1']);
    handle.update({ ...props, activeTab: undefined });
    await settle();
    assert.deepEqual(attributeOf(tabs(), 'aria-selected'), ['false', 'false', 'false']);
    assert.deepEqual(attributeOf(tabs(), 'tabindex'), ['0', '-1', '-1']);
    handle.destroy();
  });

  it('lands a rest data attribute on the tablist, never on a tab', async () => {
    const { handle, tablist, tabs } = mountStrip({ 'data-acme-sheet': 'reagents' });
    await settle();
    assert.equal(tablist().getAttribute('data-acme-sheet'), 'reagents');
    assert.ok(tabs().every((node) => !node.hasAttribute('data-acme-sheet')));
    handle.destroy();
  });

  it('runs the docs section’s worked strip as written', async () => {
    const docs = readFileSync(resolve(repoRoot, 'docs/api/index.md'), 'utf8');
    const section = docs.slice(
      docs.indexOf('\n### EditorTabs\n'),
      docs.indexOf('\n### The descriptor\n')
    );
    const code = /```javascript\n([\s\S]*?)```/u.exec(section)?.[1];
    assert.ok(code, 'the section carries one worked example');
    const target = fabricateTarget(targets);
    const shown = [];
    const game = { fabricate: { api: { ui: ui() } } };
    const acmeReagents = {
      showPanel: (id) => {
        shown.push(id);
      },
    };
    runInNewContext(`(() => {\n${code}\n})()`, { game, target, acmeReagents });
    await settle();
    const tab = (id) => target.querySelector(`#acme-reagents-tab-${id}`);
    assert.equal(tab('inputs').getAttribute('aria-selected'), 'true');
    assert.deepEqual(attributeOf([tab('inputs'), tab('outputs')], 'aria-controls'), [
      'acme-reagents-panel-inputs',
      null,
    ]);
    tab('inputs').focus();
    press(tab('inputs'), 'ArrowRight');
    await settle();
    assert.deepEqual(shown, ['outputs']);
    assert.ok(document.activeElement === tab('outputs'), 'focus moved to the next tab');
    assert.equal(tab('outputs').getAttribute('aria-selected'), 'true', 'its own update drew it');
    assert.deepEqual(reports, []);
  });
});

describe('the published EditorTabs names', () => {
  it('names each tab by its label alone, its glyph hidden, with no aria-label of its own', async () => {
    const { handle, tabs } = mountStrip();
    await settle();
    assert.deepEqual(
      tabs().map((node) => node.textContent.trim()),
      TABS.map(({ label }) => label)
    );
    assert.deepEqual(attributeOf(tabs(), 'aria-label'), [null, null, null]);
    const glyphs = tabs().flatMap((node) => [...node.querySelectorAll('i')]);
    assert.deepEqual(
      glyphs.map((glyph) => [authoredClasses(glyph), glyph.getAttribute('aria-hidden')]),
      [
        [['fas', 'fa-flask'], 'true'],
        [['fas', 'fa-box-open'], 'true'],
      ],
      'an item with no icon draws no glyph'
    );
    handle.destroy();
  });

  it('draws a label of markup as text, and renames a tab in place on an update', async () => {
    const { target, handle, props, tab } = mountStrip({
      tabs: [{ id: 'inputs', label: 'Inputs <b>now</b>' }],
    });
    await settle();
    const node = tab('inputs');
    assert.equal(node.textContent.trim(), 'Inputs <b>now</b>');
    assert.ok(!target.querySelector('b'), 'never parsed as markup');
    handle.update({ ...props, tabs: [{ id: 'inputs', label: 'Reagents in' }] });
    await settle();
    assert.ok(tab('inputs') === node, 'the same tab');
    assert.equal(node.textContent.trim(), 'Reagents in');
    handle.destroy();
  });

  it('draws no padlock, description or name of a tab’s own from a member it does not publish', async () => {
    const member = {
      tierGated: true,
      tooltip: 'About the inputs',
      tooltipKey: 'ACME.Tip',
      ariaLabel: 'Open the inputs',
      ariaLabelKey: 'ACME.Name',
      labelKey: 'ACME.Label',
    };
    const { target, handle, tab } = mountStrip({ tabs: [{ ...TABS[0], ...member }, TABS[1]] });
    await settle();
    const node = tab('inputs');
    node.dispatchEvent(new Event('mouseenter'));
    node.focus();
    await settle();
    assert.equal(node.textContent.trim(), 'Inputs', 'the label alone');
    assert.ok(!node.hasAttribute('aria-label'), 'no name of its own');
    assert.ok(!node.hasAttribute('aria-describedby'), 'no description');
    assert.equal(target.querySelectorAll('i').length, 2, 'the two glyphs, and no padlock');
    assert.ok(!document.querySelector('[role="tooltip"]'), 'no description drawn anywhere');
    handle.destroy();
  });
});

describe('the keyboard on the published EditorTabs', () => {
  for (const [key, from, to] of [
    ['ArrowRight', 'inputs', 'outputs'],
    ['ArrowRight', 'notes', 'inputs'],
    ['ArrowLeft', 'outputs', 'inputs'],
    ['ArrowLeft', 'inputs', 'notes'],
    ['Home', 'notes', 'inputs'],
    ['End', 'inputs', 'notes'],
  ]) {
    it(`moves focus from ${from} to ${to} on ${key}, then calls onSelect with that id, its default prevented`, async () => {
      const focused = [];
      const select = recorder();
      const onSelect = (...args) => {
        focused.push(document.activeElement?.id);
        select.record(...args);
      };
      const { handle, tab } = mountStrip({ activeTab: from }, onSelect);
      await settle();
      const heard = [];
      targets.at(-1).addEventListener('keydown', (event) => {
        heard.push(event.key);
      });
      tab(from).focus();
      const event = press(tab(from), key);
      assert.ok(event.defaultPrevented, 'the key’s default is prevented');
      assert.deepEqual(heard, [key], 'and it bubbles to a listener above target');
      assert.deepEqual(select.calls, [[to]], 'onSelect once, with the reached tab’s id');
      assert.deepEqual(focused, [`${STEM}-tab-${to}`], 'focus had moved when onSelect ran');
      handle.destroy();
    });
  }

  for (const key of ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'Tab', 'Escape', 'a']) {
    it(`leaves ${JSON.stringify(key)} to the platform: no default prevented, no focus moved, no onSelect`, async () => {
      const { handle, calls, tab } = mountStrip();
      await settle();
      tab('inputs').focus();
      const event = press(tab('inputs'), key);
      assert.ok(!event.defaultPrevented);
      assert.ok(document.activeElement === tab('inputs'));
      assert.deepEqual(calls, []);
      handle.destroy();
    });
  }
});

describe('a selection on the published EditorTabs', () => {
  it('calls onSelect once with the pressed tab’s id, and again for the tab already selected, and focuses the pressed tab', async () => {
    const { handle, calls, tab } = mountStrip();
    await settle();
    tab('inputs').focus();
    tab('outputs').click();
    assert.deepEqual(calls, [['outputs']]);
    assert.ok(document.activeElement === tab('outputs'), 'the pressed tab holds focus');
    tab('inputs').click();
    assert.deepEqual(calls, [['outputs'], ['inputs']], 'the selected tab’s press is reported too');
    handle.destroy();
    assert.deepEqual(reports, []);
  });

  it('draws the reached tab selected only once an update passes it, and keeps focus on it across that update', async () => {
    const { target, handle, props, calls, tab, tabs } = mountStrip();
    await settle();
    tab('inputs').focus();
    press(tab('inputs'), 'ArrowRight');
    await settle();
    const reached = tab('outputs');
    assert.ok(document.activeElement === reached, 'focus moved');
    assert.deepEqual(attributeOf(tabs(), 'aria-selected'), ['true', 'false', 'false']);
    assert.deepEqual(attributeOf(tabs(), 'tabindex'), ['0', '-1', '-1'], 'no update, no change');
    assert.equal(handle.update({ ...props, activeTab: calls[0][0] }), true);
    await settle();
    assert.ok(tab('outputs') === reached, 'the same tab node');
    assert.ok(document.activeElement === reached, 'focus stays on it');
    assert.deepEqual(attributeOf(tabs(), 'aria-selected'), ['false', 'true', 'false']);
    assert.deepEqual(attributeOf(tabs(), 'tabindex'), ['-1', '0', '-1']);
    assert.ok(target.querySelector('[aria-selected="true"]') === reached, 'the focus return');
    handle.destroy();
  });

  it('draws the selection a companion passes from inside onSelect, before any await', async () => {
    const companion = {};
    const onSelect = (id) => {
      companion.handle.update(stripProps(onSelect, { activeTab: id }));
    };
    const mounted = mountStrip({}, onSelect);
    companion.handle = mounted.handle;
    await settle();
    mounted.tab('inputs').focus();
    press(mounted.tab('inputs'), 'End');
    await settle();
    assert.equal(mounted.tab('notes').getAttribute('aria-selected'), 'true');
    assert.ok(document.activeElement === mounted.tab('notes'));
    mounted.handle.destroy();
  });

  const failure = new Error('the companion write failed');
  for (const [what, onSelect] of [
    [
      'throws',
      () => {
        throw failure;
      },
    ],
    ['rejects', () => Promise.reject(failure)],
  ]) {
    it(`reports an onSelect that ${what} once, and stays drawn and live`, async () => {
      const { handle, props, tab } = mountStrip({}, onSelect);
      await settle();
      tab('outputs').click();
      await settle();
      assert.deepEqual(reports, [[CALLBACK_REPORT, 'EditorTabs', 'onSelect', failure]]);
      assert.equal(tab('outputs').textContent.trim(), 'Outputs', 'the strip is still drawn');
      assert.equal(handle.update({ ...props, onSelect() {} }), true);
      handle.destroy();
    });
  }
});

describe('the published EditorTabs and the document', () => {
  it('adds no capturing listener of its own to the document, on mount, hover or focus', async () => {
    const captured = [];
    const original = document.addEventListener;
    document.addEventListener = function (type, listener, options) {
      if (options === true || options?.capture === true) captured.push(type);
      return original.call(this, type, listener, options);
    };
    try {
      const { handle, tab } = mountStrip();
      await settle();
      tab('inputs').dispatchEvent(new Event('mouseenter'));
      tab('inputs').focus();
      await settle();
      assert.deepEqual(captured, [], 'Svelte’s own delegation binds in the bubble phase alone');
      handle.destroy();
    } finally {
      document.addEventListener = original;
    }
  });

  it('lets Escape reach a listener above target with the pointer over a tab and focus outside the strip', async () => {
    const { handle, tab } = mountStrip();
    await settle();
    const heard = [];
    const onPage = (event) => {
      heard.push(event.key);
    };
    document.addEventListener('keydown', onPage);
    try {
      tab('outputs').dispatchEvent(new Event('mouseenter'));
      await settle();
      document.body.focus();
      press(document.body, 'Escape');
      assert.deepEqual(heard, ['Escape']);
    } finally {
      document.removeEventListener('keydown', onPage);
    }
    handle.destroy();
  });
});

describe('what the published EditorTabs refuses', () => {
  for (const key of [
    'badges',
    'annotated',
    'danger',
    'buttonIdStem',
    'panelIdStem',
    'tooltipIdStem',
    'tabDataAttr',
    'tooltipDataAttr',
    'badgeDataAttr',
    'countDataAttr',
    'dotDataAttr',
    'containerClass',
    'buttonClass',
    'badgeClass',
    'class',
    'aria-label',
  ]) {
    it(`refuses ${key}, which it does not publish (M13)`, () => {
      assertRefused({ [key]: 'x' }, `"${key}" is not a data attribute`);
    });
  }

  for (const [claim, overrides, tail] of [
    ['an absent tabs (M9)', { tabs: undefined }, 'EditorTabs requires a non-empty "tabs"'],
    [
      'an absent ariaLabel (M9)',
      { ariaLabel: undefined },
      'EditorTabs requires a non-empty "ariaLabel"',
    ],
    ['an empty ariaLabel (M9)', { ariaLabel: '' }, 'EditorTabs requires a non-empty "ariaLabel"'],
    ['an absent idStem (M9)', { idStem: undefined }, 'EditorTabs requires a non-empty "idStem"'],
    ['an empty idStem (M9)', { idStem: '' }, 'EditorTabs requires a non-empty "idStem"'],
    [
      'an absent onSelect (M9)',
      { onSelect: undefined },
      'EditorTabs requires a non-empty "onSelect"',
    ],
    ['a string for onSelect (M17)', { onSelect: 'select' }, '"onSelect" must be a function'],
    [
      'a function in a tab (M10)',
      { tabs: [{ id: 'inputs', label: () => 'Inputs' }] },
      '"tabs" must not hold a function',
    ],
  ]) {
    it(`refuses ${claim}, and renders nothing`, () => {
      assertRefused(overrides, tail);
    });
  }

  it('refuses a companion’s own shell (M16), and renders nothing', () => {
    const shell = companionTarget(targets);
    assert.throws(() => ui().mount('EditorTabs', { target: shell, props: stripProps(() => {}) }), {
      name: 'TypeError',
      message: `${REFUSAL}EditorTabs needs a Fabricate window ancestor`,
    });
    assert.equal(shell.childNodes.length, 0);
  });
});
