/**
 * THE `toolBreakage` ABSENCE-PRESERVATION FLIP AND ITS FOUR ROUTED READERS (issue 1363,
 * criterion 12).
 *
 * The flip is verified against the SHIPPED requirement that a system with no persisted value
 * READS AS `toolSpecific` (`## CraftingSystem` requirement 21) — a read-shape change against
 * stated canonical text. And it is INERT without the reader routing: nine sites re-defaulted to
 * `toolSpecific` locally, so making the world half reachable in the resolver changed nothing
 * until the readers went through it.
 *
 * The FIVE UI sites are deliberately out of scope. At `1.30.0` no world authority is authored, so
 * their local default and the resolver agree exactly, and the divergence becomes reachable only
 * once the world tool-breakage editor ships.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { effectiveToolBreakageAuthority } from '../src/systems/toolBreakageAuthority.js';
import { installFoundryStubs, makeScopeStore } from './helpers/worldScopeCorpus.js';

installFoundryStubs();
const HERE = dirname(fileURLToPath(import.meta.url));

/** The FOUR non-UI readers Phase 7 routes, and the line each re-defaulted on before it. */
const ROUTED_READERS = Object.freeze([
  'src/toolBreakageRuntime.js',
  'src/systems/CraftingEngine.js',
  'src/systems/InventoryListingBuilder.js',
]);

/** The FIVE UI readers `#### D14` defers to the world tool-breakage editor. */
const DEFERRED_UI_READERS = Object.freeze([
  'src/ui/svelte/stores/adminSystemInspectorProjection.js',
  'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
]);

function readSource(relative) {
  return readFileSync(resolve(HERE, '..', relative), 'utf8');
}

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

test('all FOUR non-UI readers route through the resolver, and NONE re-defaults locally', () => {
  // THE MUTATION THIS PINS: leaving any one of the four un-routed. A world-authority fixture then
  // resolves `toolSpecific` at that reader while `resolveToolBreakageAuthority` answers
  // `checkDriven` — the flip goes inert exactly there, silently.
  const LOCAL_REDEFAULT =
    /toolBreakage\?\.authority === 'checkDriven'\s*\?\s*'checkDriven'\s*:\s*'toolSpecific'/;
  const LOCAL_GUARD = /system\?\.toolBreakage\?\.authority === 'checkDriven'/;
  let routedCallSites = 0;
  for (const relative of ROUTED_READERS) {
    const source = readSource(relative);
    assert.doesNotMatch(source, LOCAL_REDEFAULT, `${relative} still re-defaults locally`);
    assert.doesNotMatch(source, LOCAL_GUARD, `${relative} still reads the system value directly`);
    // The import line carries no `(`, so this counts CALL SITES and nothing else.
    const matches = source.match(/effectiveToolBreakageAuthority\(/g) ?? [];
    assert.ok(matches.length >= 1, `${relative} must CALL the shared resolver`);
    routedCallSites += matches.length;
  }
  assert.equal(
    routedCallSites,
    4,
    'FOUR non-UI readers, exactly: the shared breakage evaluator, both crafting-engine decisions, ' +
      'and the inventory listing builder exhaustion projection'
  );
});

test('the FIVE UI readers are deliberately NOT routed, and are named as a later obligation', () => {
  // A POSITIVE assertion, not an absence: the deferral is a decision with a stated reason, and a
  // test that merely failed to find them would also pass if they had been silently deleted.
  let uiRedefaults = 0;
  for (const relative of DEFERRED_UI_READERS) {
    const source = readSource(relative);
    uiRedefaults += (source.match(/toolBreakage\?\.authority/g) ?? []).length;
  }
  assert.equal(
    uiRedefaults,
    5,
    'the five UI sites still re-default locally. At 1.30.0 no world authority is authored, so ' +
      'their local default and the resolver agree exactly; routing them would have pulled ' +
      'src/ui/** into this change for no reachable visual consequence'
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
