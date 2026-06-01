import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from 'svelte/compiler';
import { flushSync, mount, tick, unmount } from '../../node_modules/svelte/src/index-client.js';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const repoRoot = resolve(import.meta.dirname, '../..');

let tempRoot;
let Component;
let mounted;
let target;

function rewriteClientImports(code) {
  return code
    .replace(/from 'svelte';/g, "from 'svelte/internal/client';")
    .replace(/(from\s+['"][^'"]+\.svelte)(['"])/g, '$1.js$2');
}

function writeCompiledSvelte(sourcePath) {
  const source = readFileSync(resolve(repoRoot, sourcePath), 'utf8');
  const compiled = compile(source, {
    filename: sourcePath,
    generate: 'client',
    dev: true,
    css: 'injected'
  });
  const destination = join(tempRoot, `${sourcePath}.js`);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, rewriteClientImports(compiled.js.code));
}

function copyModule(sourcePath) {
  const destination = join(tempRoot, sourcePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(resolve(repoRoot, sourcePath), 'utf8'));
}

async function renderComposition(props = {}) {
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(Component, {
    target,
    props: {
      kind: 'task',
      mode: 'manual',
      records: sampleRecords(),
      onSelect: () => {},
      onInclude: () => {},
      onForceInclude: () => {},
      onExclude: () => {},
      onRestore: () => {},
      onOpenSource: () => {},
      ...props
    }
  });
  flushSync();
  await tick();
  flushSync();
}

function sampleRecords() {
  return [
    record('included', 'Included', 'explicitlyIncluded', { runtimeState: 'available' }),
    record('disabled', 'Disabled', 'libraryDisabled', { libraryEnabled: false, matches: true }),
    record('candidate', 'Candidate', 'candidate', { matches: true }),
    record('excluded-nonmatching', 'Excluded Nonmatching', 'excluded', { matches: false }),
    record('excluded-matching', 'Excluded Matching', 'excluded', { matches: true }),
    record('nonmatching', 'Nonmatching', 'notMatching', { matches: false })
  ];
}

function record(id, name, compositionState, overrides = {}) {
  return {
    id,
    compositionState,
    runtimeState: overrides.runtimeState || 'unavailable',
    libraryEnabled: overrides.libraryEnabled !== false,
    matches: overrides.matches === true,
    record: {
      name,
      img: `icons/${id}.webp`,
      description: `${name} description`
    },
    ...overrides
  };
}

function sectionNames() {
  return Array.from(target.querySelectorAll('[data-section]'))
    .map(section => section.getAttribute('data-section'));
}

function rowIds(sectionName) {
  return Array.from(target.querySelectorAll(`[data-section="${sectionName}"] [data-record-id]`))
    .map(row => row.getAttribute('data-record-id'));
}

function quickAction(recordId, action) {
  return target.querySelector(`[data-record-id="${recordId}"] .manager-environment-comp-quick-action[data-action="${action}"]`);
}

async function openRowMenu(recordId) {
  target.querySelector(`[data-record-id="${recordId}"] .manager-icon-button[aria-haspopup="menu"]`).click();
  await tick();
  flushSync();
  return target.querySelector(`[data-record-id="${recordId}"] [role="menu"]`);
}

describe('CompositionList mounted layout', () => {
  before(async () => {
    setupDOM();
    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-composition-list-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');
    for (const component of [
      'src/ui/svelte/apps/manager/environment/CompositionList.svelte',
      'src/ui/svelte/apps/manager/environment/RuntimeStatePill.svelte',
      'src/ui/svelte/apps/manager/environment/CompositionStatePill.svelte',
      'src/ui/svelte/apps/manager/environment/OverrideIndicator.svelte',
      'src/ui/svelte/components/Pagination.svelte'
    ]) {
      writeCompiledSvelte(component);
    }
    for (const modulePath of [
      'src/ui/svelte/util/foundryBridge.js',
      'src/ui/svelte/actions/dismissOnOutsideClick.js'
    ]) {
      copyModule(modulePath);
    }
    Component = (await import(pathToFileURL(join(
      tempRoot,
      'src/ui/svelte/apps/manager/environment/CompositionList.svelte.js'
    )).href)).default;
  });

  afterEach(() => {
    if (mounted) {
      unmount(mounted);
      mounted = null;
    }
    target?.remove();
    target = null;
  });

  after(() => {
    teardownDOM();
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('task manual mode renders Included plus Available to add with action menus wired', async () => {
    const calls = [];
    await renderComposition({
      onInclude: (kind, id) => calls.push(['include', kind, id]),
      onForceInclude: (kind, id) => calls.push(['forceInclude', kind, id]),
      onExclude: (kind, id) => calls.push(['exclude', kind, id]),
      onOpenSource: (kind, id) => calls.push(['openSource', kind, id])
    });

    assert.deepEqual(sectionNames(), ['included', 'available-to-add']);
    assert.deepEqual(rowIds('included'), ['included']);
    assert.deepEqual(rowIds('available-to-add'), [
      'candidate',
      'nonmatching',
      'disabled'
    ]);
    assert.equal(target.querySelector('[data-section="excluded"]'), null);
    assert.equal(target.querySelector('[data-section="non-matching"]'), null);
    assert.ok(!target.textContent.includes('Excluded'), 'manual task mode does not present excluded task rows');

    const excludeQuick = quickAction('included', 'exclude');
    assert.ok(excludeQuick, 'included manual task rows render a quick remove action');
    assert.equal(excludeQuick.getAttribute('title'), 'Remove');
    assert.equal(excludeQuick.getAttribute('aria-label'), 'Remove');
    assert.ok(excludeQuick.querySelector('.fa-ban'), 'quick remove uses the ban icon');
    excludeQuick.click();
    assert.deepEqual(calls.at(-1), ['exclude', 'task', 'included']);

    let menu = await openRowMenu('included');
    const removeItem = menu.querySelector('[data-action="exclude"]');
    assert.ok(removeItem, 'included manual task menu exposes the removal action');
    assert.ok(removeItem.textContent.includes('Remove from environment'));
    removeItem.click();
    assert.deepEqual(calls.at(-1), ['exclude', 'task', 'included']);

    const includeQuick = quickAction('candidate', 'include');
    assert.ok(includeQuick, 'matching available task rows render a quick add action');
    assert.equal(includeQuick.getAttribute('title'), 'Add');
    assert.equal(includeQuick.getAttribute('aria-label'), 'Add');
    assert.ok(includeQuick.querySelector('.fa-circle-plus'), 'quick add uses the circle-plus icon');
    includeQuick.click();
    assert.deepEqual(calls.at(-1), ['include', 'task', 'candidate']);

    const forceIncludeQuick = quickAction('nonmatching', 'force-include');
    assert.ok(forceIncludeQuick, 'non-matching available task rows render a quick force-add action');
    assert.equal(forceIncludeQuick.getAttribute('title'), 'Force add');
    assert.equal(forceIncludeQuick.getAttribute('aria-label'), 'Force add');
    assert.ok(forceIncludeQuick.querySelector('.fa-circle-plus'), 'quick force add uses the circle-plus icon');
    forceIncludeQuick.click();
    assert.deepEqual(calls.at(-1), ['forceInclude', 'task', 'nonmatching']);

    assert.equal(
      target.querySelector('[data-record-id="disabled"] .manager-environment-comp-quick-action'),
      null,
      'library-disabled rows do not render a quick composition action'
    );

    menu = await openRowMenu('candidate');
    menu.querySelector('[data-action="include"]').click();
    assert.deepEqual(calls.at(-1), ['include', 'task', 'candidate']);

    menu = await openRowMenu('nonmatching');
    menu.querySelector('[data-action="force-include"]').click();
    assert.deepEqual(calls.at(-1), ['forceInclude', 'task', 'nonmatching']);

    menu = await openRowMenu('disabled');
    assert.ok(menu.textContent.includes('Enable in library first'));
    assert.equal(menu.querySelector('[data-action="include"]'), null);
    assert.equal(menu.querySelector('[data-action="force-include"]'), null);
    menu.querySelectorAll('button').item(1).click();
    assert.deepEqual(calls.at(-1), ['openSource', 'task', 'disabled']);
  });

  it('task automatic mode retains Excluded and standalone Non-matching sections', async () => {
    await renderComposition({ kind: 'task', mode: 'automatic' });

    assert.deepEqual(sectionNames(), ['included', 'excluded', 'non-matching']);
    assert.equal(target.querySelector('[data-section="available-to-add"]'), null);
    assert.deepEqual(rowIds('excluded'), ['excluded-nonmatching', 'excluded-matching']);
    assert.deepEqual(rowIds('non-matching'), ['disabled', 'nonmatching']);
    assert.equal(target.querySelector('.manager-environment-comp-quick-action'), null);
  });

  it('hazard manual mode renders Included plus Available to add with task-style quick actions', async () => {
    const calls = [];
    await renderComposition({
      kind: 'hazard',
      mode: 'manual',
      onInclude: (kind, id) => calls.push(['include', kind, id]),
      onForceInclude: (kind, id) => calls.push(['forceInclude', kind, id]),
      onExclude: (kind, id) => calls.push(['exclude', kind, id]),
      onOpenSource: (kind, id) => calls.push(['openSource', kind, id])
    });

    assert.deepEqual(sectionNames(), ['included', 'available-to-add']);
    assert.deepEqual(rowIds('included'), ['included']);
    assert.deepEqual(rowIds('available-to-add'), [
      'candidate',
      'nonmatching',
      'disabled'
    ]);
    assert.equal(target.querySelector('[data-section="candidates"]'), null);
    assert.equal(target.querySelector('[data-section="excluded"]'), null);
    assert.equal(target.querySelector('[data-section="non-matching"]'), null);
    assert.equal(target.querySelector('.manager-environment-comp-handle'), null, 'all-drops hazard mode does not render rank handles');
    assert.equal(target.querySelector('[data-record-id="included"]').getAttribute('draggable'), null, 'all-drops hazard rows are not draggable');

    const removeQuick = quickAction('included', 'exclude');
    assert.ok(removeQuick, 'included manual hazard rows render a quick remove action');
    assert.equal(removeQuick.getAttribute('title'), 'Remove');
    removeQuick.click();
    assert.deepEqual(calls.at(-1), ['exclude', 'hazard', 'included']);
    assert.equal(
      target.querySelector('[data-record-id="included"] .manager-icon-button[aria-label="Open source hazard"]'),
      null,
      'included manual hazard rows do not render a standalone edit-source action'
    );

    const includeQuick = quickAction('candidate', 'include');
    assert.ok(includeQuick, 'matching available hazard rows render a quick add action');
    includeQuick.click();
    assert.deepEqual(calls.at(-1), ['include', 'hazard', 'candidate']);

    const forceIncludeQuick = quickAction('nonmatching', 'force-include');
    assert.ok(forceIncludeQuick, 'non-matching available hazard rows render a quick force-add action');
    forceIncludeQuick.click();
    assert.deepEqual(calls.at(-1), ['forceInclude', 'hazard', 'nonmatching']);

    assert.equal(
      target.querySelector('[data-record-id="disabled"] .manager-environment-comp-quick-action'),
      null,
      'library-disabled hazard rows do not render a quick composition action'
    );

    const menu = await openRowMenu('disabled');
    assert.ok(menu.textContent.includes('Enable in library first'));
    menu.querySelectorAll('button').item(1).click();
    assert.deepEqual(calls.at(-1), ['openSource', 'hazard', 'disabled']);
  });

  it('hazard highest-ranked mode renders rank handles only on included rows', async () => {
    const calls = [];
    await renderComposition({
      kind: 'hazard',
      hazardSelectionMode: 'highestRankedDrop',
      records: [
        record('first', 'First', 'explicitlyIncluded', { runtimeState: 'available' }),
        record('second', 'Second', 'explicitlyIncluded', { runtimeState: 'available' }),
        record('blocked', 'Blocked', 'explicitlyIncluded', { runtimeState: 'unavailable', conditionsMet: false }),
        record('forced', 'Forced', 'forceIncluded', { runtimeState: 'unavailable' }),
        record('candidate', 'Candidate', 'candidate', { matches: true }),
        record('nonmatching', 'Nonmatching', 'notMatching', { matches: false }),
        record('disabled', 'Disabled', 'libraryDisabled', { libraryEnabled: false, matches: true })
      ],
      onReorder: (kind, from, to) => calls.push(['reorder', kind, from, to])
    });

    const includedRow = target.querySelector('[data-section="included"] [data-record-id="first"]');
    assert.ok(includedRow.classList.contains('has-rank-controls'), 'included ranked hazard rows opt into the handle grid');
    assert.equal(includedRow.getAttribute('draggable'), 'true', 'included ranked hazard rows are draggable');
    assert.ok(includedRow.querySelector('.manager-environment-comp-handle .fa-grip-vertical'), 'included ranked hazard rows render the grip handle');
    assert.ok(includedRow.querySelector('.manager-environment-comp-order').textContent.includes('1'), 'included ranked hazard rows render the rank number');
    const forcedRow = target.querySelector('[data-section="included"] [data-record-id="forced"]');
    assert.ok(forcedRow.classList.contains('has-rank-controls'), 'force-included hazard rows also opt into rank controls');
    assert.equal(forcedRow.getAttribute('draggable'), 'true', 'force-included ranked hazard rows are draggable');
    assert.ok(forcedRow.querySelector('.manager-environment-comp-order').textContent.includes('4'), 'force-included rows receive their visible rank');
    const blockedRow = target.querySelector('[data-section="included"] [data-record-id="blocked"]');
    assert.ok(blockedRow.classList.contains('has-rank-controls'), 'condition-blocked included hazard rows opt into rank controls');
    assert.equal(blockedRow.getAttribute('draggable'), 'true', 'condition-blocked included hazard rows are draggable');
    assert.ok(blockedRow.querySelector('.manager-environment-comp-order').textContent.includes('3'), 'condition-blocked included rows receive their visible rank');

    assert.equal(
      target.querySelector('[data-section="available-to-add"] .manager-environment-comp-handle'),
      null,
      'available-to-add hazards do not reserve a blank handle placeholder'
    );
    assert.equal(
      target.querySelector('[data-section="available-to-add"] .manager-environment-comp-row.has-rank-controls'),
      null,
      'available-to-add hazards keep the non-handle grid'
    );

    const menu = await openRowMenu('first');
    assert.ok(menu.textContent.includes('Move up'), 'ranked hazard menus include move up');
    assert.ok(menu.textContent.includes('Move down'), 'ranked hazard menus include move down');
    menu.querySelectorAll('button').item(1).click();
    assert.deepEqual(calls.at(-1), ['reorder', 'hazard', 0, 1]);
  });

  it('hazard all-drops mode hides rank controls and move actions', async () => {
    await renderComposition({
      kind: 'hazard',
      hazardSelectionMode: 'allDrops',
      records: [
        record('included', 'Included', 'explicitlyIncluded', { runtimeState: 'available' }),
        record('forced', 'Forced', 'forceIncluded', { runtimeState: 'unavailable' })
      ]
    });

    assert.equal(target.querySelector('.manager-environment-comp-head.has-rank-controls'), null);
    assert.equal(target.querySelector('.manager-environment-comp-row.has-rank-controls'), null);
    assert.equal(target.querySelector('.manager-environment-comp-handle'), null);
    assert.equal(target.querySelector('[draggable="true"]'), null);

    const menu = await openRowMenu('included');
    assert.equal(menu.textContent.includes('Move up'), false);
    assert.equal(menu.textContent.includes('Move down'), false);
  });

  it('hazard limited-drops mode hides rank controls for force-included rows', async () => {
    await renderComposition({
      kind: 'hazard',
      hazardSelectionMode: 'limitedDrops',
      records: [
        record('included', 'Included', 'explicitlyIncluded', { runtimeState: 'available' }),
        record('blocked', 'Blocked', 'explicitlyIncluded', { runtimeState: 'unavailable', conditionsMet: false }),
        record('forced', 'Forced', 'forceIncluded', { runtimeState: 'unavailable' })
      ]
    });

    assert.deepEqual(rowIds('included'), ['included', 'blocked', 'forced']);
    assert.equal(target.querySelector('.manager-environment-comp-handle'), null);
    assert.equal(target.querySelector('[data-record-id="forced"]').getAttribute('draggable'), null);
    assert.equal(target.querySelector('[data-record-id="blocked"]').getAttribute('draggable'), null);
  });

  it('hazard automatic mode retains Excluded and standalone Non-matching sections', async () => {
    await renderComposition({ kind: 'hazard', mode: 'automatic' });

    assert.deepEqual(sectionNames(), ['included', 'excluded', 'non-matching']);
    assert.equal(target.querySelector('[data-section="available-to-add"]'), null);
    assert.equal(target.querySelector('[data-section="candidates"]'), null);
    assert.deepEqual(rowIds('excluded'), ['excluded-nonmatching', 'excluded-matching']);
    assert.deepEqual(rowIds('non-matching'), ['disabled', 'nonmatching']);
    assert.equal(target.querySelector('[data-section="excluded"] .manager-environment-comp-handle'), null);
    assert.equal(target.querySelector('[data-section="non-matching"] .manager-environment-comp-handle'), null);
  });
});
