/**
 * THE `toolBreakage` ABSENCE-PRESERVATION FLIP AND ITS FOUR ROUTED READERS (issue 1363, criterion
 * 12).
 */

import assert from 'node:assert/strict';
import test, { describe, it } from 'node:test';

import { effectiveToolBreakageAuthority } from '../src/systems/toolBreakageAuthority.js';
import { buildSelectedSystemViewData } from '../src/ui/svelte/stores/adminSystemInspectorProjection.js';
import { defineStructureContract } from './helpers/structureContract.js';
import { installFoundryStubs, makeScopeStore } from './helpers/worldScopeCorpus.js';

installFoundryStubs();

/** The three files holding the FOUR non-Svelte readers Phase 7 routes. */
const ROUTED_READERS = Object.freeze([
  'src/toolBreakageRuntime.js',
  'src/systems/CraftingEngine.js',
  'src/ui/presenters/InventoryListingBuilder.js',
]);

test('the resolver preserves the shipped read shape when no world value is authored', () => {
  assert.equal(effectiveToolBreakageAuthority({}, null), 'toolSpecific');
  assert.equal(effectiveToolBreakageAuthority({ toolBreakage: {} }, null), 'toolSpecific');
  assert.equal(effectiveToolBreakageAuthority(null, {}), 'toolSpecific');
  assert.equal(
    effectiveToolBreakageAuthority(
      { toolBreakage: { authority: 'bogus' } },
      { authority: 'checkDriven' }
    ),
    'checkDriven',
    'an unrecognized SYSTEM token is treated as absent, for the same reason an absent one is'
  );
});

test('a system that authored nothing INHERITS the world authority — the flip made reachable', () => {
  assert.equal(effectiveToolBreakageAuthority({}, { authority: 'checkDriven' }), 'checkDriven');
  assert.equal(
    effectiveToolBreakageAuthority(
      { toolBreakage: { authority: 'toolSpecific' } },
      { authority: 'checkDriven' }
    ),
    'toolSpecific',
    'and an AUTHORED system value still overrides the world one'
  );
});

test('the world authority is read from the published tool scope store when none is passed', () => {
  const store = makeScopeStore('tools', {
    entities: [],
    defaults: {},
    membership: {},
    toolBreakage: { authority: 'checkDriven' },
  });
  const previous = globalThis.game;
  globalThis.game = { fabricate: { getToolScopeStore: () => store } };
  try {
    assert.equal(effectiveToolBreakageAuthority({}), 'checkDriven');
    assert.equal(
      effectiveToolBreakageAuthority({ toolBreakage: { authority: 'toolSpecific' } }),
      'toolSpecific'
    );
  } finally {
    globalThis.game = previous;
  }
});

test('a store that throws degrades to "no world authority" rather than taking a craft down', () => {
  const previous = globalThis.game;
  globalThis.game = {
    fabricate: {
      getToolScopeStore: () => {
        throw new Error('unreadable');
      },
    },
  };
  try {
    assert.equal(effectiveToolBreakageAuthority({}), 'toolSpecific');
  } finally {
    globalThis.game = previous;
  }
});

// THE MUTATION THIS PINS: leaving any one of the four non-Svelte readers un-routed — the shared
// breakage evaluator, both crafting-engine decisions and the inventory exhaustion projection.
describe('all FOUR non-Svelte readers route through the resolver, and NONE re-defaults locally', () => {
  defineStructureContract(
    'the shared breakage evaluator answers the resolver',
    { file: 'src/toolBreakageRuntime.js', fn: 'resolveAuthority' },
    { contains: ['return effectiveToolBreakageAuthority(system);'] }
  );
  const DECISIONS = ['_resolveCraftingBreakageDecision', '_resolveSalvageBreakageDecision'];
  defineStructureContract('both engine decisions call it', 'src/systems/CraftingEngine.js', {
    callers: [['effectiveToolBreakageAuthority', DECISIONS]],
  });
  defineStructureContract(
    'and so does the inventory listing builder',
    'src/ui/presenters/InventoryListingBuilder.js',
    { callers: [['effectiveToolBreakageAuthority', ['_isToolBroken']]] }
  );
  // No `.toolBreakage` read at all, bracket spelling included, so no local re-default or guard.
  for (const reader of ROUTED_READERS) {
    defineStructureContract(`${reader} reads no tool-breakage block itself`, reader, {
      propertyReads: [['toolBreakage', []]],
    });
  }
});

describe('the UI readers are routed at ONE point: the selected-system projection (issue 1374)', () => {
  // Issue 1363 routed the four non-Svelte readers and deferred the five UI ones; the projection
  // resolves once for all of them and publishes the AUTHORING SCOPE a resolved token cannot carry.
  it('resolves the world authority for a system that authored none, and says whence', () => {
    const project = (toolBreakage, world) =>
      buildSelectedSystemViewData({ id: 'sys', toolBreakage }, [], [], [], [], [], world)
        .toolBreakage;
    const world = { authority: 'checkDriven' };
    assert.deepEqual(project(undefined, world), { authority: 'checkDriven', source: 'world' });
    assert.deepEqual(project({ authority: 'toolSpecific' }, world), {
      authority: 'toolSpecific',
      source: 'system',
    });
    assert.deepEqual(project(undefined, null), { authority: 'toolSpecific', source: 'default' });
  });
  defineStructureContract(
    'and reads the system block only to hand it to the resolver and the scope',
    'src/ui/svelte/stores/adminSystemInspectorProjection.js',
    { propertyReads: [['toolBreakage', [['selectedSystem.toolBreakage', 2]]]] }
  );

  // EVERY `toolBreakage` READ IN THE SHELL, NOT JUST TODAY'S SPELLING OF ONE: three re-default
  // spellings walked past a literal match of `toolBreakage?.authority`. FOUR surfaces read the
  // resolved authority off `selectedSystem` — `ChecksView` (which fans out to crafting, salvage and
  // gathering), `ToolsBrowserView`, `ToolEditView` and `tools/ToolBrowserInspector` — and the
  // authoring scope reaches the rules list and the rules EDITOR (issue 1373). A LEGITIMATE further
  // read off `selectedSystem` is no verdict: bump the count and say so. A read rooted anywhere
  // ELSE, a bracket spelling or an alias bound to the block is a screen re-defaulting on a raw
  // crafting system, and a destructure has no member read to tally, so no record may name the key.
  defineStructureContract(
    'every tool-breakage read in the shell is the PUBLISHED projection',
    'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
    {
      propertyReads: [
        [
          'toolBreakage',
          [
            ['selectedSystem.toolBreakage.authority', 4],
            ['selectedSystem.toolBreakage.source', 2],
          ],
        ],
      ],
      keysNo: ['toolBreakage'],
    }
  );
});

test('the normalizer flip is absence-preserving and keeps a recognised token', async () => {
  const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  assert.equal('toolBreakage' in manager._normalizeSystem({ id: 's' }), false);
  assert.equal('toolBreakage' in manager._normalizeSystem({ id: 's', toolBreakage: {} }), false);
  assert.equal(
    'toolBreakage' in manager._normalizeSystem({ id: 's', toolBreakage: { authority: 'nope' } }),
    false
  );
  for (const authority of ['toolSpecific', 'checkDriven']) {
    assert.deepEqual(
      manager._normalizeSystem({ id: 's', toolBreakage: { authority } }).toolBreakage,
      { authority },
      'a RECOGNISED authored token is never stripped — every existing value is AUTHORED'
    );
  }
});

test('the source pill names all three layers, including the one no frame can reach', async () => {
  // THE UNPHOTOGRAPHABLE BRANCH (issue 1373).
  const { breakModeSourcePill } = await import(
    '../src/ui/svelte/apps/manager/scoped/worldToolStudio.js'
  );
  const text = (key, fallback) => fallback;

  assert.deepEqual(breakModeSourcePill('system', text), {
    state: 'system',
    tone: 'warning',
    label: 'Overridden here',
  });
  assert.deepEqual(breakModeSourcePill('world', text), {
    state: 'world',
    tone: 'info',
    label: 'World default',
  });
  // `Fabricate default`, never `World default`: naming the world here would credit it with a
  // choice it did not make, which is the distinction this three-state pill exists for.
  assert.deepEqual(breakModeSourcePill('default', text), {
    state: 'default',
    tone: 'info',
    label: 'Fabricate default',
  });
  assert.deepEqual(
    breakModeSourcePill(undefined, text),
    breakModeSourcePill('default', text),
    'an absent source is the unauthored one, not an unrecognised fourth state'
  );
});
