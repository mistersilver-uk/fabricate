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

  it('hazard manual mode retains Matching candidates, Excluded, and Non-matching sections', async () => {
    await renderComposition({ kind: 'hazard', mode: 'manual' });

    assert.deepEqual(sectionNames(), ['included', 'candidates', 'excluded', 'non-matching']);
    assert.equal(target.querySelector('[data-section="available-to-add"]'), null);
    assert.deepEqual(rowIds('candidates'), ['candidate']);
    assert.deepEqual(rowIds('excluded'), ['excluded-nonmatching', 'excluded-matching']);
    assert.deepEqual(rowIds('non-matching'), ['disabled', 'nonmatching']);
    assert.equal(target.querySelector('.manager-environment-comp-quick-action'), null);
  });

  it('hazard automatic mode retains Excluded and standalone Non-matching sections', async () => {
    await renderComposition({ kind: 'hazard', mode: 'automatic' });

    assert.deepEqual(sectionNames(), ['included', 'excluded', 'non-matching']);
    assert.equal(target.querySelector('[data-section="available-to-add"]'), null);
    assert.equal(target.querySelector('[data-section="candidates"]'), null);
    assert.deepEqual(rowIds('excluded'), ['excluded-nonmatching', 'excluded-matching']);
    assert.deepEqual(rowIds('non-matching'), ['disabled', 'nonmatching']);
  });
});
