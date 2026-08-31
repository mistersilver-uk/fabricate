import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from 'svelte/compiler';
import { flushSync, mount, tick, unmount } from '../../node_modules/svelte/src/index-client.js';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';
import { rewriteClientImports } from '../helpers/rewriteClientImports.js';

const repoRoot = resolve(import.meta.dirname, '../..');

let tempRoot;
let Component;
let mounted;
let target;


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
      // The manager's ONE chip (issue 883). A `.svelte` the tree renders but the
      // harness omits HANGS the suite (# cancelled) rather than failing it.
      'src/ui/svelte/apps/manager/Chip.svelte',
      // The shared no-state primitive (issue 785). A `.svelte` the tree renders but
      // the harness omits HANGS the suite (# cancelled) rather than failing it.
      'src/ui/svelte/apps/manager/EmptyState.svelte',
      // THE manager's labelled push-button (issue 1118). Restore and the warning Force add
      // both render it. Omitting a rendered `.svelte` HANGS the suite (# cancelled).
      'src/ui/svelte/components/ManagerButton.svelte',
      'src/ui/svelte/apps/manager/environment/CompositionList.svelte',
      'src/ui/svelte/apps/manager/environment/RuntimeStatePill.svelte',
      'src/ui/svelte/apps/manager/environment/CompositionStatePill.svelte',
      'src/ui/svelte/apps/manager/environment/OverrideIndicator.svelte',
      'src/ui/svelte/components/Pagination.svelte',
      // The shared numeric stepper (issue 1050): the blind-weight cell renders it.
      'src/ui/svelte/components/Stepper.svelte'
    ]) {
      writeCompiledSvelte(component);
    }
    for (const modulePath of [
      // The ONE answer to "does this record compose into this environment?" (issue 1321),
      // which this component imports for the four-state included set, plus the match
      // evaluator it delegates to; the second is import-free, so the pair closes that
      // subgraph. `CompositionStatePill` reaches the third — the per-state tone / glyph /
      // copy map extracted out of its own `<script>` so the vocabulary can be asserted
      // against it — and that one is import-free too. This suite hand-rolls its compile
      // loop with NO dependency validator, so omitting any of the three does not fail a
      // test: the whole file is reported as `# cancelled` behind one ERR_MODULE_NOT_FOUND
      // in the hook. `tests/components/record-inspector-node-max.test.js` registers the
      // same map through `createMountedComponentHarness`, whose closure validator names
      // the missing file instead.
      'src/systems/gatheringComposition.js',
      'src/systems/gatheringMatch.js',
      'src/ui/svelte/apps/manager/environment/compositionStateMeta.js',
      'src/ui/svelte/util/foundryBridge.js',
      'src/ui/svelte/util/listReorderAnnouncement.js',
      'src/ui/svelte/components/stepperLabels.js',
      'src/ui/svelte/actions/dismissOnOutsideClick.js',
      'src/gatheringImageDefaults.js'
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

    // A non-matching row in MANUAL mode is plainly added (issue #1315): manual composes exactly
    // the GM's picked list with no match filter, so there is no filter for a force to override and
    // the row offers the same Add as a matching one.
    const nonMatchingQuick = quickAction('nonmatching', 'include');
    assert.ok(nonMatchingQuick, 'non-matching available task rows render the same quick add action');
    assert.equal(nonMatchingQuick.getAttribute('title'), 'Add');
    assert.equal(nonMatchingQuick.getAttribute('aria-label'), 'Add');
    nonMatchingQuick.click();
    assert.deepEqual(calls.at(-1), ['include', 'task', 'nonmatching']);
    assert.ok(
      !target.querySelector('[data-action="force-include"]'),
      'and manual mode renders no force add anywhere: not on this row, not in any menu'
    );
    assert.ok(
      !target.querySelector('.manager-environment-force-include'),
      'nor the labelled one, which lives in the automatic-mode Non-matching section'
    );

    assert.ok(
      !target.querySelector('[data-record-id="disabled"] .manager-environment-comp-quick-action'),
      'library-disabled rows do not render a quick composition action'
    );

    menu = await openRowMenu('candidate');
    menu.querySelector('[data-action="include"]').click();
    assert.deepEqual(calls.at(-1), ['include', 'task', 'candidate']);

    menu = await openRowMenu('nonmatching');
    menu.querySelector('[data-action="include"]').click();
    assert.deepEqual(calls.at(-1), ['include', 'task', 'nonmatching']);

    menu = await openRowMenu('disabled');
    assert.ok(menu.textContent.includes('Enable in library first'));
    assert.ok(!menu.querySelector('[data-action="include"]'), 'the library gate precedes both modes, so a disabled record cannot be added');
    assert.ok(!menu.querySelector('[data-action="force-include"]'), 'and no force can reach past it either');
    menu.querySelectorAll('button').item(1).click();
    assert.deepEqual(calls.at(-1), ['openSource', 'task', 'disabled']);
  });

  it('task automatic mode retains Excluded and standalone Non-matching sections, and force-adds from the row menu', async () => {
    const calls = [];
    await renderComposition({
      kind: 'task',
      mode: 'automatic',
      onForceInclude: (kind, id) => calls.push(['forceInclude', kind, id])
    });

    assert.deepEqual(sectionNames(), ['included', 'excluded', 'non-matching']);
    assert.ok(!target.querySelector('[data-section="available-to-add"]'), 'automatic mode has no Available to add list');
    assert.deepEqual(rowIds('excluded'), ['excluded-nonmatching', 'excluded-matching']);
    assert.deepEqual(rowIds('non-matching'), ['disabled', 'nonmatching']);
    assert.ok(!target.querySelector('.manager-environment-comp-quick-action'), 'automatic rows carry no icon-only quick actions');

    // The revived control (issue #1315). Its guard demanded `mode === 'manual'` inside a section
    // gated `mode !== 'manual'`, so it rendered in NO state at all; rendering it is half the fix,
    // and CLICKING it is the other half — a control that renders and calls nothing is exactly the
    // state this issue found it in.
    const menu = await openRowMenu('nonmatching');
    const forceAdd = menu.querySelector('[data-action="force-include"]');
    assert.ok(Boolean(forceAdd), 'the automatic-mode Non-matching row menu offers Force add');
    assert.ok(forceAdd.textContent.includes('Force add'));
    forceAdd.click();
    assert.deepEqual(calls.at(-1), ['forceInclude', 'task', 'nonmatching']);

    const disabledMenu = await openRowMenu('disabled');
    assert.ok(disabledMenu.textContent.includes('Enable in library first'));
    assert.ok(
      !disabledMenu.querySelector('[data-action="force-include"]'),
      'a force cannot revive a library-disabled record, so the row offers a note instead'
    );
  });

  it('event manual mode renders Included plus Available to add with task-style quick actions', async () => {
    const calls = [];
    await renderComposition({
      kind: 'event',
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
    assert.equal(target.querySelector('.manager-environment-comp-handle'), null, 'all-drops event mode does not render rank handles');
    assert.equal(target.querySelector('[data-record-id="included"]').getAttribute('draggable'), null, 'all-drops event rows are not draggable');

    const removeQuick = quickAction('included', 'exclude');
    assert.ok(removeQuick, 'included manual event rows render a quick remove action');
    assert.equal(removeQuick.getAttribute('title'), 'Remove');
    removeQuick.click();
    assert.deepEqual(calls.at(-1), ['exclude', 'event', 'included']);
    assert.equal(
      target.querySelector('[data-record-id="included"] .manager-icon-button[aria-label="Open source event"]'),
      null,
      'included manual event rows do not render a standalone edit-source action'
    );

    const includeQuick = quickAction('candidate', 'include');
    assert.ok(includeQuick, 'matching available event rows render a quick add action');
    includeQuick.click();
    assert.deepEqual(calls.at(-1), ['include', 'event', 'candidate']);

    const nonMatchingQuick = quickAction('nonmatching', 'include');
    assert.ok(nonMatchingQuick, 'non-matching available event rows render the same quick add action');
    nonMatchingQuick.click();
    assert.deepEqual(calls.at(-1), ['include', 'event', 'nonmatching']);

    // The absence assertion this file has always carried, kept and re-scoped rather than deleted
    // (issue #1315 settled the contradiction it described). The labelled Force add sits in the
    // standalone Non-matching section, which is gated `mode !== 'manual'`; its own guard used to
    // demand `mode === 'manual'`, so it rendered in NO state. The guard now takes its mode from
    // the enclosing section, which makes this absence structural AND correct — manual mode has no
    // filter for a force to override — and puts the control's presence, its amber class and its
    // click-through in the automatic-mode test below, where they can be asserted for real.
    assert.ok(
      !target.querySelector('.manager-environment-force-include'),
      'the labelled Force add belongs to automatic mode and must not render in manual mode'
    );
    assert.ok(
      !target.querySelector('[data-action="force-include"]'),
      'and neither does its row-menu twin: manual mode is plain add and remove'
    );

    assert.ok(
      !target.querySelector('[data-record-id="disabled"] .manager-environment-comp-quick-action'),
      'library-disabled event rows do not render a quick composition action'
    );

    const menu = await openRowMenu('disabled');
    assert.ok(menu.textContent.includes('Enable in library first'));
    menu.querySelectorAll('button').item(1).click();
    assert.deepEqual(calls.at(-1), ['openSource', 'event', 'disabled']);
  });

  it('event highest-ranked mode renders rank handles only on included rows', async () => {
    const calls = [];
    await renderComposition({
      kind: 'event',
      eventSelectionMode: 'highestRankedDrop',
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
    assert.ok(includedRow.classList.contains('has-rank-controls'), 'included ranked event rows opt into the handle grid');
    assert.equal(includedRow.getAttribute('draggable'), 'true', 'included ranked event rows are draggable');
    assert.ok(includedRow.querySelector('.manager-environment-comp-handle .fa-grip-vertical'), 'included ranked event rows render the grip handle');
    assert.ok(includedRow.querySelector('.manager-environment-comp-order').textContent.includes('1'), 'included ranked event rows render the rank number');
    const forcedRow = target.querySelector('[data-section="included"] [data-record-id="forced"]');
    assert.ok(forcedRow.classList.contains('has-rank-controls'), 'force-included event rows also opt into rank controls');
    assert.equal(forcedRow.getAttribute('draggable'), 'true', 'force-included ranked event rows are draggable');
    assert.ok(forcedRow.querySelector('.manager-environment-comp-order').textContent.includes('4'), 'force-included rows receive their visible rank');
    const blockedRow = target.querySelector('[data-section="included"] [data-record-id="blocked"]');
    assert.ok(blockedRow.classList.contains('has-rank-controls'), 'condition-blocked included event rows opt into rank controls');
    assert.equal(blockedRow.getAttribute('draggable'), 'true', 'condition-blocked included event rows are draggable');
    assert.ok(blockedRow.querySelector('.manager-environment-comp-order').textContent.includes('3'), 'condition-blocked included rows receive their visible rank');

    assert.equal(
      target.querySelector('[data-section="available-to-add"] .manager-environment-comp-handle'),
      null,
      'available-to-add events do not reserve a blank handle placeholder'
    );
    assert.equal(
      target.querySelector('[data-section="available-to-add"] .manager-environment-comp-row.has-rank-controls'),
      null,
      'available-to-add events keep the non-handle grid'
    );

    const menu = await openRowMenu('first');
    assert.ok(menu.textContent.includes('Move up'), 'ranked event menus include move up');
    assert.ok(menu.textContent.includes('Move down'), 'ranked event menus include move down');
    menu.querySelectorAll('button').item(1).click();
    assert.deepEqual(calls.at(-1), ['reorder', 'event', 0, 1]);
  });

  it('event all-drops mode hides rank controls and move actions', async () => {
    await renderComposition({
      kind: 'event',
      eventSelectionMode: 'allDrops',
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

  it('event limited-drops mode hides rank controls for force-included rows', async () => {
    await renderComposition({
      kind: 'event',
      eventSelectionMode: 'limitedDrops',
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

  it('event automatic mode retains Excluded and standalone Non-matching sections, and renders the labelled Force add', async () => {
    const calls = [];
    await renderComposition({
      kind: 'event',
      mode: 'automatic',
      onForceInclude: (kind, id) => calls.push(['forceInclude', kind, id])
    });

    assert.deepEqual(sectionNames(), ['included', 'excluded', 'non-matching']);
    assert.ok(!target.querySelector('[data-section="available-to-add"]'), 'automatic mode has no Available to add list');
    assert.ok(!target.querySelector('[data-section="candidates"]'), 'nor a separate candidates list');
    assert.deepEqual(rowIds('excluded'), ['excluded-nonmatching', 'excluded-matching']);
    assert.deepEqual(rowIds('non-matching'), ['disabled', 'nonmatching']);
    assert.ok(!target.querySelector('[data-section="excluded"] .manager-environment-comp-handle'), 'excluded rows reserve no rank handle');
    assert.ok(!target.querySelector('[data-section="non-matching"] .manager-environment-comp-handle'), 'non-matching rows reserve no rank handle');

    // THE `warning` role's first reachable call site (issues 1118 and #1315), asserted from a
    // MOUNT. It could only be pinned from source before, because the control rendered in no state
    // at all: the section is gated `mode !== 'manual'` and the control's own guard demanded
    // `mode === 'manual'`. That is also how it shipped asking for `is-warning`, a class the sheet
    // declares nowhere — nobody ever saw it. The source-level guard in
    // `tests/manager-button-source-contract.test.js` is retired in favour of these four lines.
    const forceAdd = target.querySelector('[data-record-id="nonmatching"] .manager-environment-force-include');
    assert.ok(Boolean(forceAdd), 'the automatic-mode Non-matching list renders the labelled Force add');
    assert.ok(forceAdd.textContent.includes('Force add'));
    assert.ok(
      forceAdd.classList.contains('fab-manager-button'),
      `the labelled Force add renders through the ManagerButton primitive, got ${forceAdd.className}`
    );
    assert.ok(
      forceAdd.classList.contains('is-warning-action'),
      `and carries the amber class the sheet actually declares, got ${forceAdd.className}`
    );
    assert.ok(
      !/\bis-warning\b(?!-action)/.test(forceAdd.className),
      `and not the misspelling that matches no rule at all, got ${forceAdd.className}`
    );
    forceAdd.click();
    assert.deepEqual(calls.at(-1), ['forceInclude', 'event', 'nonmatching']);

    assert.ok(
      !target.querySelector('[data-record-id="disabled"] .manager-environment-force-include'),
      'a library-disabled row gets the enable-in-library note instead, because no force can revive it'
    );
    assert.ok(
      target.querySelector('[data-record-id="disabled"]').textContent.includes('Enable in library first'),
      'and that note is what it renders'
    );
  });
});
