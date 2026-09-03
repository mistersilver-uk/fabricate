import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import {
  buildCompendiumImportContextOption,
  PACK_DATASET_KEY
} from '../src/ui/compendiumDirectoryContext.js';

const window = new Window();
const document = window.document;

/**
 * Build a Compendium Directory entry element with the pack collection id on its
 * dataset, mirroring the runtime `<li data-pack="...">` the context menu targets.
 */
function packTarget(packId) {
  const element = document.createElement('li');
  element.dataset[PACK_DATASET_KEY] = packId;
  return element;
}

function spy(implementation) {
  const calls = [];
  const fn = (...args) => {
    calls.push(args);
    return typeof implementation === 'function' ? implementation(...args) : implementation;
  };
  fn.calls = calls;
  return fn;
}

/**
 * Assemble the option builder's collaborators with recording stubs. `localize`
 * returns the key so notification assertions can pin which string fired.
 */
function collaborators(overrides = {}) {
  return {
    localize: spy((key) => key),
    isGM: () => true,
    isItemPack: () => true,
    getPackName: (id) => `name:${id}`,
    getSystems: () => [{ id: 'sys-1', name: 'System One' }],
    promptSelectSystem: spy('sys-1'),
    importPack: spy({ added: 1, updated: 0, skipped: 0, total: 1, sourceFallbacks: [] }),
    notify: { info: spy(), warn: spy() },
    ...overrides
  };
}

test('option uses the modern ContextMenuEntry shape (label/icon/visible/onClick)', () => {
  const option = buildCompendiumImportContextOption(collaborators());

  assert.equal(typeof option.label, 'string');
  assert.match(option.icon, /fa-hammer/);
  assert.equal(typeof option.visible, 'function');
  assert.equal(typeof option.onClick, 'function');
  // Not the deprecated shape.
  assert.equal(option.name, undefined);
  assert.equal(option.condition, undefined);
  assert.equal(option.callback, undefined);
});

test('Q1: visible returns a boolean gated on GM and Item pack', () => {
  const gmItem = buildCompendiumImportContextOption(collaborators());
  const visibleGmItem = gmItem.visible(packTarget('world.items'));
  assert.equal(typeof visibleGmItem, 'boolean');
  assert.equal(visibleGmItem, true);

  const nonGm = buildCompendiumImportContextOption(collaborators({ isGM: () => false }));
  const visibleNonGm = nonGm.visible(packTarget('world.items'));
  assert.equal(typeof visibleNonGm, 'boolean');
  assert.equal(visibleNonGm, false);

  const nonItem = buildCompendiumImportContextOption(collaborators({ isItemPack: () => false }));
  const visibleNonItem = nonItem.visible(packTarget('world.actors'));
  assert.equal(typeof visibleNonItem, 'boolean');
  assert.equal(visibleNonItem, false);
});

test('visible passes the target dataset pack id to isItemPack', () => {
  const isItemPack = spy(true);
  const option = buildCompendiumImportContextOption(collaborators({ isItemPack }));

  option.visible(packTarget('dnd5e.items'));

  assert.deepEqual(isItemPack.calls, [['dnd5e.items']]);
});

test('Q2: zero systems notifies and never calls the picker or importPack', async () => {
  const deps = collaborators({ getSystems: () => [] });
  const option = buildCompendiumImportContextOption(deps);

  await option.onClick({}, packTarget('world.items'));

  assert.equal(deps.promptSelectSystem.calls.length, 0);
  assert.equal(deps.importPack.calls.length, 0);
  assert.deepEqual(deps.notify.warn.calls, [['FABRICATE.Admin.Items.CompendiumImportNoSystems']]);
});

test('Q2: exactly one system opens the picker (preselected) then imports', async () => {
  const deps = collaborators();
  const option = buildCompendiumImportContextOption(deps);

  await option.onClick({}, packTarget('world.items'));

  assert.equal(deps.promptSelectSystem.calls.length, 1);
  const [systems, options] = deps.promptSelectSystem.calls[0];
  assert.equal(systems.length, 1);
  assert.equal(systems[0].id, 'sys-1');
  assert.equal(options.packName, 'name:world.items');
  assert.deepEqual(deps.importPack.calls, [['sys-1', 'world.items']]);
});

test('Q2: a null picker return (cancel) aborts without calling importPack', async () => {
  const deps = collaborators({
    getSystems: () => [
      { id: 'sys-1', name: 'System One' },
      { id: 'sys-2', name: 'System Two' }
    ],
    promptSelectSystem: spy(null)
  });
  const option = buildCompendiumImportContextOption(deps);

  await option.onClick({}, packTarget('world.items'));

  assert.equal(deps.promptSelectSystem.calls.length, 1);
  assert.equal(deps.importPack.calls.length, 0);
});

test('delegation: importPack receives the picked system id and the target dataset pack', async () => {
  const deps = collaborators({ promptSelectSystem: spy('sys-99') });
  const option = buildCompendiumImportContextOption(deps);

  await option.onClick({}, packTarget('module.pack-name'));

  assert.deepEqual(deps.importPack.calls, [['sys-99', 'module.pack-name']]);
});

test('Q3: a total of zero emits the no-items notice, not the summary', async () => {
  const deps = collaborators({
    importPack: spy({ added: 0, updated: 0, skipped: 0, total: 0, sourceFallbacks: [] })
  });
  const option = buildCompendiumImportContextOption(deps);

  await option.onClick({}, packTarget('world.empty'));

  // notify.info fired the localized no-items key (localize returns the key).
  assert.deepEqual(deps.notify.info.calls, [['FABRICATE.Admin.Items.CompendiumImportNoItems']]);
  // and localize interpolated the pack name into that string.
  assert.ok(
    deps.localize.calls.some(
      ([key, data]) => key === 'FABRICATE.Admin.Items.CompendiumImportNoItems' && data?.name === 'name:world.empty'
    )
  );
  // the success summary is never emitted on an empty pack.
  assert.equal(
    deps.localize.calls.some(([key]) => key === 'FABRICATE.Admin.Items.CompendiumImportSummary'),
    false
  );
});

test('summary: a normal result renders the compendium import summary', async () => {
  const deps = collaborators({
    importPack: spy({ added: 3, updated: 1, skipped: 2, total: 6, sourceFallbacks: [] })
  });
  const option = buildCompendiumImportContextOption(deps);

  await option.onClick({}, packTarget('world.items'));

  assert.deepEqual(deps.notify.info.calls, [['FABRICATE.Admin.Items.CompendiumImportSummary']]);
  assert.ok(
    deps.localize.calls.some(
      ([key, data]) =>
        key === 'FABRICATE.Admin.Items.CompendiumImportSummary' &&
        data?.added === 3 &&
        data?.updated === 1 &&
        data?.skipped === 2 &&
        data?.total === 6 &&
        data?.name === 'name:world.items'
    )
  );
  assert.equal(deps.notify.warn.calls.length, 0);
});

test('fallback: a result with sourceFallbacks also warns with the fallback summary', async () => {
  const deps = collaborators({
    importPack: spy({
      added: 1,
      updated: 0,
      skipped: 0,
      total: 1,
      sourceFallbacks: [{ itemName: 'Sword', brokenUuid: 'a', fallbackUuid: 'b' }]
    })
  });
  const option = buildCompendiumImportContextOption(deps);

  await option.onClick({}, packTarget('world.items'));

  assert.equal(deps.notify.info.calls.length, 1);
  assert.deepEqual(deps.notify.warn.calls, [['FABRICATE.Admin.Items.SourceFallbackSummary']]);
  assert.ok(
    deps.localize.calls.some(
      ([key, data]) => key === 'FABRICATE.Admin.Items.SourceFallbackSummary' && data?.count === 1
    )
  );
});
