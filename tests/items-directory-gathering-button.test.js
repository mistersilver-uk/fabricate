import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Window } from 'happy-dom';

import { findItemsDirectoryActionsContainer, syncGatheringDirectoryButton } from '../src/ui/itemsDirectoryButtons.js';
import { openDeferredApp } from '../src/utils/deferredEntryNotice.js';
import { moduleFunctionSource } from './helpers/boundedSource.js';

function setupDirectory() {
  const window = new Window();
  const document = window.document;
  const root = document.createElement('section');
  root.innerHTML = `
    <header class="directory-header">
      <div class="header-actions action-buttons flexrow">
        <button type="button" class="create-document" data-fabricate-action="craft">
          <span>Craft Item</span>
        </button>
      </div>
    </header>
  `;
  return {
    document,
    itemsDirectory: { element: root },
    actions: root.querySelector('.header-actions')
  };
}

function createGatheringButton(document) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'create-document';
  button.dataset.fabricateAction = 'gathering';
  button.textContent = 'Gathering';
  return button;
}

test('syncGatheringDirectoryButton inserts the Gathering button when gathering becomes enabled', () => {
  const { document, itemsDirectory, actions } = setupDirectory();

  syncGatheringDirectoryButton({
    itemsDirectory,
    enabled: true,
    createButton: () => createGatheringButton(document),
    documentRef: document
  });

  assert.ok(actions.querySelector('[data-fabricate-action="gathering"]'));
  assert.deepEqual(
    Array.from(actions.querySelectorAll('button')).map(button => button.dataset.fabricateAction),
    ['gathering', 'craft']
  );
});

test('syncGatheringDirectoryButton removes a stale Gathering button when gathering becomes disabled everywhere', () => {
  const { document, itemsDirectory, actions } = setupDirectory();

  syncGatheringDirectoryButton({
    itemsDirectory,
    enabled: true,
    createButton: () => createGatheringButton(document),
    documentRef: document
  });
  syncGatheringDirectoryButton({
    itemsDirectory,
    enabled: false,
    createButton: () => createGatheringButton(document),
    documentRef: document
  });

  assert.equal(actions.querySelector('[data-fabricate-action="gathering"]'), null);
  assert.ok(actions.querySelector('[data-fabricate-action="craft"]'));
});

test('syncGatheringDirectoryButton does not duplicate an existing Gathering button on repeated syncs', () => {
  const { document, itemsDirectory, actions } = setupDirectory();

  syncGatheringDirectoryButton({
    itemsDirectory,
    enabled: true,
    createButton: () => createGatheringButton(document),
    documentRef: document
  });
  syncGatheringDirectoryButton({
    itemsDirectory,
    enabled: true,
    createButton: () => createGatheringButton(document),
    documentRef: document
  });

  assert.equal(actions.querySelectorAll('[data-fabricate-action="gathering"]').length, 1);
});

// main.js imports CSS, so execute its bounded declarations and actual registration instead.
// Only the external app openers and Foundry state are doubles; DOM creation/sync are real.
function directoryHarness(t, { isGM = true, resolveActions = findItemsDirectoryActionsContainer } = {}) {
  const window = new Window();
  t.after(() => window.happyDOM.close());
  const document = window.document;
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const declarations = ['addModuleButtonsToItemsDirectory', 'hasGatheringEnabledSystems', 'createHeaderButton']
    .map(name => moduleFunctionSource(source, name)).join('\n');
  const registrations = source.match(/^  Hooks\.on\('(?:renderItemDirectory|fabricate\.craftingSystemsChanged)',[^\n]+$/gm);
  assert.equal(registrations?.length, 2, 'locate both real directory synchronization registrations');
  const hooks = new Map();
  const errors = [];
  const opened = [];
  const reported = [];
  const ui = {};
  const system = { features: { gathering: true } };
  const manager = { failure: null };
  const sync = runInNewContext(`${declarations}\n${registrations.join('\n')}\naddModuleButtonsToItemsDirectory;`, {
    document,
    ui,
    game: { user: { isGM }, fabricate: { getCraftingSystemManager: () => ({ getSystems: () => [system] }) } },
    Hooks: { on: (name, callback) => hooks.set(name, callback) },
    console: { error: (...args) => errors.push(args) },
    findItemsDirectoryActionsContainer: resolveActions,
    syncGatheringDirectoryButton,
    openDeferredApp,
    getFabricateAppClass: () => ({ show: tab => opened.push(tab) }),
    showCraftingSystemManagerApp: async () => {
      opened.push('manager');
      if (manager.failure) throw manager.failure;
    },
    reportManagerLoadFailure: error => reported.push(error)
  });
  const directory = (html = '<header class="directory-header"></header>') => {
    const element = document.createElement('section');
    element.innerHTML = html;
    document.body.appendChild(element);
    return { element };
  };
  return { document, ui, system, manager, errors, opened, reported, sync, directory,
    render: hooks.get('renderItemDirectory'), systemsChanged: hooks.get('fabricate.craftingSystemsChanged') };
}

function directoryActions(app) {
  return Array.from(app.element.querySelectorAll('[data-fabricate-action]'))
    .map(button => button.dataset.fabricateAction);
}

test('Items Directory synchronization silently defers absent directory/element until the real render hook', t => {
  const h = directoryHarness(t);
  for (const items of [undefined, {}, { element: undefined }, { element: null }]) {
    h.ui.items = items;
    h.sync();
    assert.deepEqual(h.errors, [], 'unrendered or torn-down directory is deferred work');
    assert.equal(h.document.querySelectorAll('button').length, 0);
  }
  h.ui.items = h.directory();
  h.render(h.ui.items);
  assert.deepEqual(directoryActions(h.ui.items), ['manage', 'gathering', 'craft']);
  assert.deepEqual(h.errors, []);
});

test('the registered render hook targets the non-primary Items Directory and repeated calls preserve real handlers', async t => {
  const h = directoryHarness(t);
  h.ui.items = h.directory();
  const popout = h.directory();
  h.render(popout);
  h.render(popout);
  assert.deepEqual(directoryActions(popout), ['manage', 'gathering', 'craft']);
  assert.deepEqual(directoryActions(h.ui.items), [], 'rendering a popout must not mutate the global directory');
  for (const action of ['craft', 'gathering', 'manage']) {
    popout.element.querySelector(`[data-fabricate-action="${action}"]`).click();
  }
  await Promise.resolve();
  assert.deepEqual(h.opened, ['crafting', 'gathering', 'manager']);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.reported, []);
});

test('default-directory sync creates missing actions under a valid header and respects player/gathering availability', t => {
  const h = directoryHarness(t, { isGM: false });
  h.ui.items = h.directory();
  h.sync();
  assert.equal(h.ui.items.element.querySelectorAll('.header-actions').length, 1);
  assert.deepEqual(directoryActions(h.ui.items), ['gathering', 'craft']);
  h.system.features.gathering = false;
  h.systemsChanged();
  assert.deepEqual(directoryActions(h.ui.items), ['craft']);
  h.system.features.gathering = true;
  h.render(h.ui.items);
  assert.deepEqual(directoryActions(h.ui.items), ['gathering', 'craft']);
  assert.deepEqual(h.errors, []);
});

test('rendered directory with no header retains its diagnostic', t => {
  const h = directoryHarness(t);
  h.ui.items = h.directory('<div class="directory-list"></div>');
  h.sync();
  assert.deepEqual(h.errors, [['Fabricate | Items directory header not found']]);
  assert.deepEqual(directoryActions(h.ui.items), []);
});

test('an actions resolver failure retains its distinct diagnostic', t => {
  const h = directoryHarness(t, { resolveActions: () => null });
  h.ui.items = h.directory();
  h.sync();
  assert.deepEqual(h.errors, [['Fabricate | Items directory actions container not found']]);
  assert.deepEqual(directoryActions(h.ui.items), []);
});

test('the real rendered manager click reports and absorbs a deferred opener rejection', async t => {
  const h = directoryHarness(t);
  h.ui.items = h.directory();
  h.render(h.ui.items);
  const failure = new Error('deferred manager failed to load');
  h.manager.failure = failure;
  h.ui.items.element.querySelector('[data-fabricate-action="manage"]').click();
  // Drain the async opener and both real deferred wrappers, including any unhandled rejection.
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.opened, ['manager']);
  assert.deepEqual(h.reported, [failure]);
  assert.deepEqual(h.errors, []);
});
