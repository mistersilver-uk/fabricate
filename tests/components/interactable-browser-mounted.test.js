/** The GM interactable browser, mounted: its `EditorTabs` strip and its `EmptyState` notes (issue 1779). */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-interactable-browser-',
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    'src/ui/svelte/actions/dragSource.js',
    'src/canvas/interactableDragPayload.js',
    'src/models/toolDisplay.js',
    'src/ui/gatheringTaskDefaults.js',
    'src/gatheringImageDefaults.js',
    'src/ui/svelte/util/systemDisambiguation.js',
  ],
  compiledModules: [
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/components/EditorTabs.svelte',
    'src/ui/svelte/components/FilterBar.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/SearchField.svelte',
    'src/ui/svelte/apps/InteractableBrowserRoot.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/InteractableBrowserRoot.svelte',
  rootClass: 'fabricate-interactable-browser-app',
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

function services({
  systems = [{ id: 'smithing', name: 'Smithing' }],
  tools = [],
  tasks = [],
} = {}) {
  return {
    listSystems: () => systems,
    listToolsForSystem: () => tools,
    listTasksForSystem: () => tasks,
    getComponentForSystem: () => null,
    placeOnScene: () => {},
  };
}

const POPULATED = Object.freeze({
  tools: [
    { id: 'forge', label: 'Forge' },
    { id: 'anvil', label: 'Anvil' },
  ],
  tasks: [{ id: 'mine', name: 'Mine ore' }],
});

async function settle() {
  flushSync();
  await tick();
  flushSync();
}

const tab = (root, id) => root.querySelector(`#fab-ib-tab-${id}`);
const empty = (root, value) =>
  root.querySelector(`.manager-empty.is-note[data-interactable-browser-empty="${value}"]`);

async function press(root, button, key) {
  button.focus();
  const event = new globalThis.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  button.dispatchEvent(event);
  await settle();
  return event;
}

async function search(root, value) {
  const input = root.querySelector('[data-interactable-browser-search]');
  input.value = value;
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  await settle();
}

describe('the browser tabs are the shared strip', () => {
  it('moves selection and focus with the arrows, Home and End, preventing each default', async () => {
    const root = await harness.mount({ services: services(POPULATED) });
    const steps = [
      ['ArrowRight', 'tools', 'tasks'],
      ['ArrowLeft', 'tasks', 'tools'],
      ['End', 'tools', 'tasks'],
      ['Home', 'tasks', 'tools'],
    ];
    for (const [key, from, to] of steps) {
      const event = await press(root, tab(root, from), key);
      assert.ok(event.defaultPrevented, `${key} on ${from} is prevented`);
      assert.equal(document.activeElement?.id, `fab-ib-tab-${to}`, `${key} focuses ${to}`);
      assert.equal(tab(root, to).getAttribute('aria-selected'), 'true', `${key} selects ${to}`);
      assert.equal(
        tab(root, from).getAttribute('aria-selected'),
        'false',
        `${key} deselects ${from}`
      );
      assert.ok(
        Boolean(root.querySelector(`#fab-ib-panel-${to}`)),
        `${key} swaps in the ${to} panel`
      );
    }
  });

  it('points only the selected tab at its panel', async () => {
    const root = await harness.mount({ services: services(POPULATED) });
    assert.equal(tab(root, 'tools').getAttribute('aria-controls'), 'fab-ib-panel-tools');
    assert.ok(
      !tab(root, 'tasks').hasAttribute('aria-controls'),
      'the hidden panel is not referenced'
    );
    tab(root, 'tasks').click();
    await settle();
    assert.equal(tab(root, 'tasks').getAttribute('aria-controls'), 'fab-ib-panel-tasks');
    assert.ok(
      !tab(root, 'tools').hasAttribute('aria-controls'),
      'the hidden panel is not referenced'
    );
    assert.ok(!root.querySelector('#fab-ib-panel-tools'), 'only the selected panel renders');
    assert.ok(
      Boolean(root.querySelector(':scope #fab-ib-panel-tasks .fab-ib-list .fab-ib-row')),
      'the tasks rows render'
    );
  });

  it('keeps the keyboard-focus declarations on both tabs and both panels', async () => {
    const root = await harness.mount({ services: services(POPULATED) });
    for (const id of ['tools', 'tasks']) {
      assert.equal(
        tab(root, id).getAttribute('data-keyboard-focus'),
        'true',
        `the ${id} tab declares focus`
      );
      tab(root, id).click();
      await settle();
      const panel = root.querySelector(`#fab-ib-panel-${id}`);
      assert.equal(panel.getAttribute('tabindex'), '0', `the ${id} panel is a tab stop`);
      assert.equal(
        panel.getAttribute('data-keyboard-focus'),
        'true',
        `the ${id} panel declares focus`
      );
      assert.equal(panel.getAttribute('aria-labelledby'), `fab-ib-tab-${id}`);
    }
  });
});

describe('the browser empties are EmptyState notes', () => {
  it('states that there is no crafting system', async () => {
    const root = await harness.mount({ services: services({ systems: [] }) });
    assert.ok(Boolean(empty(root, 'no-systems')), 'the no-systems note renders');
    assert.ok(!root.querySelector('[role="tablist"]'), 'no strip renders without a system');
  });

  it('states that the system has no tools, and no tasks', async () => {
    const root = await harness.mount({ services: services() });
    assert.ok(
      Boolean(root.querySelector('#fab-ib-panel-tools') && empty(root, 'no-tools')),
      'no tools'
    );
    tab(root, 'tasks').click();
    await settle();
    assert.ok(
      Boolean(root.querySelector('#fab-ib-panel-tasks') && empty(root, 'no-tasks')),
      'no tasks'
    );
  });

  it('states a search that matches nothing on either tab, and clearing it restores the rows', async () => {
    const root = await harness.mount({ services: services(POPULATED) });
    await search(root, 'zzzz');
    assert.ok(
      Boolean(root.querySelector('#fab-ib-panel-tools') && empty(root, 'no-matches')),
      'tools'
    );
    assert.ok(!empty(root, 'no-tools'), 'a filtered-out list is not an empty system');
    tab(root, 'tasks').click();
    await settle();
    assert.ok(
      Boolean(root.querySelector('#fab-ib-panel-tasks') && empty(root, 'no-matches')),
      'tasks'
    );
    assert.ok(!empty(root, 'no-tasks'), 'a filtered-out list is not an empty system');
    await search(root, '');
    assert.ok(!root.querySelector('.manager-empty'), 'no note survives the cleared search');
    assert.equal(
      root.querySelectorAll(':scope #fab-ib-panel-tasks .fab-ib-row').length,
      1,
      'the task row returns'
    );
  });
});
