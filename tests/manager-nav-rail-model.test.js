/**
 * The manager rail's expansion and collapse model (issue 1717). Both route inputs are reactive here — a
 * `SvelteMap` per thunk — because the model's deriveds must be invalidated by the caller's own
 * source, as the root's route `$derived`s are; a plain object is read once and cached forever,
 * which would make every liveness assertion below vacuous. Two of the six mutation controls can be
 * killed only here: `expanded` dropping its lock disjunct, and `collapsedDisplay` dropping
 * `&& !railLockedOpen`. Both are asserted without calling `syncLocks()`, which is what makes them
 * observable at all.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SvelteMap } from 'svelte/reactivity';

import { flushSync } from '../node_modules/svelte/src/index-client.js';
import { createSvelteModuleCompiler } from './helpers/compile-svelte-module.js';

const MODULE_PATH = 'src/ui/svelte/apps/manager/navRailModel.svelte.js';

const GROUPS = Object.freeze([
  'crafting',
  'checks',
  'gathering',
  'worldTravel',
  'worldRules',
  'worldDowntime',
]);

describe('navRailModel', () => {
  let compiler;
  let createNavRailModel;

  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-nav-rail-model-');
    ({ createNavRailModel } = await compiler.loadWithClosure(MODULE_PATH));
  });

  after(() => {
    compiler.cleanup();
  });

  /** One model over a live lock table and a live rail lock, with the setting seam logged. */
  function openModel({ locks = {}, railLocked = false, stored = false } = {}) {
    const groupLocks = new SvelteMap(GROUPS.map((group) => [group, locks[group] === true]));
    const railLock = new SvelteMap([['locked', railLocked === true]]);
    const writes = [];
    const model = createNavRailModel({
      services: () => ({
        getSetting: (key) => (key === 'managerRailCollapsed' ? stored : undefined),
        setSetting: (key, value) => writes.push([key, value]),
      }),
      groupLocks: () => Object.fromEntries(groupLocks),
      railLocked: () => railLock.get('locked') === true,
    });
    return { model, groupLocks, railLock, writes };
  }

  const expandedIds = (model) => GROUPS.filter((group) => model.expanded[group]);

  it('opens a locked group before any intent has been recorded', () => {
    const { model } = openModel({ locks: { crafting: true } });

    assert.deepEqual(
      expandedIds(model),
      ['crafting'],
      'expansion is user intent OR the route lock, so the lock alone opens the group'
    );
    assert.equal(model.lockedOpen.crafting, true, 'and the lock is readable in its own right');
  });

  it('keeps a locked group open when the intent alone would close it', () => {
    const { model, groupLocks } = openModel({ locks: { checks: true } });

    model.setGroupExpanded('checks', false);
    flushSync();
    assert.ok(model.expanded.checks, 'the lock outranks the recorded intent while it holds');

    groupLocks.set('checks', false);
    flushSync();
    assert.ok(!model.expanded.checks, 'and releasing the lock leaves the intent it was given');
  });

  it('records intent for every locked group through syncLocks, and sticks after the release', () => {
    const { model, groupLocks } = openModel({ locks: { gathering: true, worldRules: true } });

    model.syncLocks();
    flushSync();
    groupLocks.set('gathering', false);
    groupLocks.set('worldRules', false);
    flushSync();

    assert.deepEqual(
      expandedIds(model),
      ['gathering', 'worldRules'],
      'leaving a group does not slam it shut behind the GM'
    );
  });

  it('toggles one group at a time, stops the event, and refuses while that group is locked', () => {
    const { model, groupLocks } = openModel();
    let stopped = 0;
    const event = { stopPropagation: () => (stopped += 1) };

    model.toggleGroup('worldTravel', event);
    flushSync();
    assert.deepEqual(expandedIds(model), ['worldTravel'], 'the groups are independent');
    assert.equal(stopped, 1, 'the disclosure never bubbles into the parent row');

    model.toggleGroup('worldTravel', event);
    flushSync();
    assert.deepEqual(expandedIds(model), [], 'and the same control closes it again');

    groupLocks.set('worldTravel', true);
    flushSync();
    model.toggleGroup('worldTravel', event);
    flushSync();
    assert.ok(model.expanded.worldTravel, 'a locked group ignores a programmatic toggle too');

    // Observed after the lock releases: while it holds, `expanded` is true either way, so the
    // assertion above cannot tell a refused toggle from a recorded one.
    groupLocks.set('worldTravel', false);
    flushSync();
    assert.ok(
      !model.expanded.worldTravel,
      'and the refused toggle never recorded intent behind the lock'
    );
  });

  it('expands unconditionally through expandGroup and both ways through setGroupExpanded', () => {
    const { model } = openModel();

    model.expandGroup('crafting');
    model.expandGroup('crafting');
    flushSync();
    assert.ok(model.expanded.crafting, 'expandGroup is an open, never a flip');

    model.setGroupExpanded('crafting', false);
    flushSync();
    assert.ok(!model.expanded.crafting, 'setGroupExpanded carries the value it is given');
  });

  it('reads the stored collapse preference once and writes it back on every toggle', () => {
    const { model, writes } = openModel({ stored: true });

    assert.equal(model.collapsed, true, 'the stored preference seeds the state');
    assert.equal(model.collapsedDisplay, true);

    model.toggleRail();
    flushSync();
    assert.equal(model.collapsed, false);
    assert.deepEqual(writes, [['managerRailCollapsed', false]], 'the seam records the new value');
  });

  it('shows a locked-open rail expanded without ever overwriting the stored preference', () => {
    const { model, railLock, writes } = openModel({ stored: true, railLocked: true });

    assert.equal(model.railLockedOpen, true);
    assert.equal(model.collapsed, true, 'the stored preference is untouched by the lock');
    assert.equal(
      model.collapsedDisplay,
      false,
      'collapsedDisplay is display-only: a locked rail renders open'
    );

    model.toggleRail();
    flushSync();
    assert.equal(model.collapsed, true, 'and the control is inert while the lock holds');
    assert.deepEqual(writes, [], 'so the GM leaves the route with their preference intact');

    railLock.set('locked', false);
    flushSync();
    assert.equal(model.collapsedDisplay, true, 'losing the lock returns the stored collapse');
  });

  it('defaults to an expanded rail when the setting seam is absent', () => {
    const model = createNavRailModel({ groupLocks: () => ({}), railLocked: () => false });

    assert.equal(model.collapsed, false);
    assert.deepEqual(expandedIds(model), [], 'and with every group collapsed');
    assert.doesNotThrow(() => model.toggleRail(), 'the optional seam is genuinely optional');
    assert.equal(model.collapsed, true);
  });
});
