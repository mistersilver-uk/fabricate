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
 * THE UI SITES ARE ROUTED TOO NOW, at ONE point rather than five (issue 1374). Issue 1363
 * deferred them to the world tool-breakage editor, and that editor cannot discharge the
 * obligation: four of the five are in `CraftingSystemManagerRoot.svelte`, which
 * `### GM World Scoped Entity Routes` requirement 7 closes to that lane. The fifth IS the
 * projection the other four read, so resolving there routes all five and costs no root edit.
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
test('the UI readers are routed at ONE point: the selected-system projection (issue 1374)', () => {
  // THE STATE THIS REPLACES. Issue 1363 routed the four non-UI readers and deferred the five UI
  // ones, and this test asserted the deferral positively — five local re-defaults, counted. The
  // deferral named the world tool-breakage editor as the obligation holder, and that editor
  // cannot discharge it: four of the five sites are in `CraftingSystemManagerRoot.svelte`, a
  // file `### GM World Scoped Entity Routes` requirement 7 closes to that lane.
  //
  // SO IT IS DISCHARGED AT THE PROJECTION INSTEAD, and the count stops growing with the screens.
  // The projection resolves once and publishes the resolved authority; the four root sites read
  // that published field through `selectedSystem`, which IS the projection, so they needed no
  // edit and gained no second re-default.
  //
  // BOTH HALVES ARE ASSERTED POSITIVELY. An absence check alone would also pass if the readers
  // had been deleted, which is the same trap the version of this test it replaces named.
  const projection = readSource('src/ui/svelte/stores/adminSystemInspectorProjection.js');
  assert.doesNotMatch(
    projection,
    /toolBreakage\?\.authority === 'checkDriven'/,
    'the projection must not re-default locally: that is the re-created unreachability'
  );
  assert.equal(
    (projection.match(/resolveToolBreakageAuthority\(/g) ?? []).length,
    1,
    'it resolves the authority exactly once, through this requirement resolver'
  );
  assert.match(
    projection,
    /source:\s*_toolBreakageAuthoritySource\(/,
    'and publishes the AUTHORING SCOPE beside it, which a resolved token cannot carry'
  );

  // The four carrier sites, all reading the PUBLISHED field off `selectedSystem`. A fifth
  // `.authority` read rooted anywhere else would be a screen re-defaulting on a raw system.
  const root = readSource('src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
  const authorityReads = root.match(/[A-Za-z?.]*toolBreakage\?\.authority/g) ?? [];
  assert.equal(
    authorityReads.length,
    4,
    'four manager surfaces draw or gate on the authority: the Tool library radiogroup, the Tool ' +
      'editor, and the two check editors'
  );
  for (const read of authorityReads) {
    assert.equal(
      read,
      'selectedSystem?.toolBreakage?.authority',
      'every one reads the PUBLISHED projection field, never a raw crafting system'
    );
  }
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
