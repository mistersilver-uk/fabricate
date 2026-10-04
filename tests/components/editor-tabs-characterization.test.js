/**
 * What `EditorTabs` renders for every shipped shape of entry (issue 1779), pinned against a golden
 * recorded from the primitive before that issue edited it, so a new capability that leaks into an
 * entry naming none of it reds here.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, afterEach, before, test } from 'node:test';

import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const GOLDEN_URL = new URL('../fixtures/editorTabsCharacterization.golden.json', import.meta.url);
const RECORD_ENV = 'UPDATE_EDITOR_TABS_CHARACTERIZATION_GOLDEN';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-editor-tabs-characterization-',
  rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES],
  compiledModules: [
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/EditorTabs.svelte',
  ],
  componentPath: 'src/ui/svelte/components/EditorTabs.svelte',
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const TABS = Object.freeze([
  { id: 'overview', icon: 'fas fa-circle-info', labelKey: 'x.Overview', label: 'Overview' },
  { id: 'inputs', icon: 'fas fa-list', labelKey: 'x.Inputs', label: 'Inputs' },
  {
    id: 'validation',
    icon: 'fas fa-triangle-exclamation',
    labelKey: 'x.Validation',
    label: 'Validation',
  },
]);

/** Every scenario names a rendered `activeTab`, and every entry carries an `icon`. */
const SCENARIOS = Object.freeze({
  defaults: { tabs: TABS, activeTab: 'overview' },
  marks: {
    tabs: TABS,
    activeTab: 'inputs',
    ariaLabelKey: 'x.Strip',
    ariaLabel: 'Editor sections',
    badgeDataAttr: 'data-x-badge',
    countDataAttr: 'data-x-count',
    dotDataAttr: 'data-x-dot',
    badges: {
      overview: [
        { vehicle: 'count', label: 3 },
        { vehicle: 'dot', name: 'Authored' },
        { vehicle: 'dot' },
      ],
      inputs: [
        { vehicle: 'issue', label: 2, tone: 'warning', name: 'Two issues', class: 'is-x' },
        0,
      ],
      validation: [
        { vehicle: 'count', label: 0, suppressZero: false },
        { label: 1, tone: 'positive' },
      ],
    },
  },
  danger: {
    tabs: TABS,
    activeTab: 'validation',
    danger: true,
    badges: { validation: 4, inputs: { label: 1, tone: 'danger' } },
  },
  activePanelOnly: { tabs: TABS, activeTab: 'inputs', activePanelOnly: true, idStem: 'fab-x' },
  customStems: {
    tabs: TABS,
    activeTab: 'overview',
    buttonIdStem: 'x-button',
    panelIdStem: 'x-panel',
    tabDataAttr: '',
    containerClass: 'x-tabs',
    buttonClass: 'x-tab',
    badgeClass: 'x-badge',
    badges: { inputs: 5 },
    'data-x-tablist': '',
  },
});

/**
 * The stated reduction: Svelte's empty `<!---->` anchors, its `svelte-<hash>` scoping classes and
 * the whitespace it keeps after the tablist, ahead of the description block, are compile artefacts
 * rather than rendered contract, so all three are dropped before comparing.
 */
function characterize(target) {
  return target.innerHTML
    .replaceAll('<!---->', '')
    .replaceAll(/ ?\bsvelte-[a-z0-9]+\b/g, '')
    .trimEnd();
}

async function renderAll() {
  const rendered = {};
  for (const [name, props] of Object.entries(SCENARIOS)) {
    rendered[name] = characterize(await harness.mount(props));
    harness.remount();
  }
  return rendered;
}

test('every shipped entry shape renders exactly the recorded markup', async () => {
  const rendered = await renderAll();
  if (process.env[RECORD_ENV] === '1')
    writeFileSync(GOLDEN_URL, `${JSON.stringify(rendered, null, 2)}\n`);
  const golden = JSON.parse(readFileSync(GOLDEN_URL, 'utf8'));
  assert.deepEqual(Object.keys(golden), Object.keys(SCENARIOS), 'the golden covers every scenario');
  for (const name of Object.keys(SCENARIOS)) {
    assert.ok(golden[name].includes('role="tab"'), `${name}: the golden recorded a rendered strip`);
    assert.equal(
      rendered[name],
      golden[name],
      `${name}: the strip's markup changed; re-record with ${RECORD_ENV}=1 only when the change is intended`
    );
  }
});

test('an icon-less entry renders no glyph element', async () => {
  const root = await harness.mount({
    tabs: [
      { id: 'tools', labelKey: 'x.Tools', label: 'Tools' },
      { id: 'tasks', icon: '', labelKey: 'x.Tasks', label: 'Tasks' },
    ],
    activeTab: 'tools',
  });
  const buttons = [...root.querySelectorAll('[role="tab"]')];
  assert.equal(buttons.length, 2, 'both tabs render');
  for (const button of buttons) {
    assert.equal(
      button.querySelectorAll('i').length,
      0,
      `${button.id} draws an empty glyph element`
    );
    assert.ok(button.textContent.trim().length > 0, `${button.id} still renders its label`);
  }
});
