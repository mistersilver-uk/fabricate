/**
 * THE `toolBreakage` ABSENCE-PRESERVATION FLIP AND ITS FOUR ROUTED READERS (issue 1363, criterion
 * 12).
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
  // THE MUTATION THIS PINS: leaving any one of the four un-routed.
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
  // ones, and this test asserted the deferral positively — five local re-defaults, counted.
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

  // EVERY `toolBreakage` READ IN THE SHELL, NOT JUST TODAY'S SPELLING OF ONE. The version of this
  // that shipped in the first round matched the literal `toolBreakage?.authority`, and three
  // separate re-default spellings walked straight past it — each measured, each leaving the suite
  // green:
  const root = readSource('src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');

  // THE DESTRUCTURE HOLE, CLOSED SEPARATELY. `const { toolBreakage } = allSystems[0] ?? {};` has no
  // leading dot on the binding OR on the use, so the read scan below cannot see either half —
  // measured green while a surface re-defaulted off the binding.
  assert.deepEqual(
    root.match(/[{,]\s*toolBreakage\s*(?=[},:=])/g) ?? [],
    [],
    'the shell must not DESTRUCTURE the tool-breakage block: a binding has no leading dot, so ' +
      'the read scan below cannot see it or any re-default taken off it'
  );

  // TWO RESIDUALS NO TEXT SCAN CLOSES, RECORDED RATHER THAN CHASED. 1. A bracket-string ROOT —
  // `selectedSystem['toolBreakage'].authority` — puts the name inside a string, where neither
  // pattern above looks for it.
  const TOOL_BREAKAGE_READ = /[A-Za-z0-9_$?.[\]'"]*\??\.toolBreakage\b[A-Za-z0-9_$?.[\]'"]*/g;
  const reads = root.match(TOOL_BREAKAGE_READ) ?? [];
  assert.ok(reads.length > 0, 'the shell reads this field somewhere; a zero count is a broken scan');
  const tally = new Map();
  for (const read of reads) tally.set(read, (tally.get(read) ?? 0) + 1);
  assert.deepEqual(
    [...tally.entries()].sort(([left], [right]) => left.localeCompare(right)),
    [
      ['selectedSystem?.toolBreakage?.authority', 4],
      ['selectedSystem?.toolBreakage?.source', 2],
    ],
    'every `toolBreakage` access in the shell reads the PUBLISHED projection off ' +
      '`selectedSystem`. FOUR read the resolved authority — `ChecksView` gates on it (and fans ' +
      'out internally to crafting, salvage and gathering rather than being three editors), ' +
      '`ToolsBrowserView` authors it, `ToolEditView` reads it, and `tools/ToolBrowserInspector` ' +
      'draws the per-tool behaviour copy from it — and ONE carries the authoring scope to the ' +
      'control TWICE — the rules list authors the mode and the rules EDITOR states, in the ' +
      'words the reference uses, whether the mode it is showing is the world default or a ' +
      'departure this system authored (issue 1373). If your change adds a LEGITIMATE further ' +
      'read off `selectedSystem`, this pin is ' +
      'not a verdict on it: bump the expected count and say so. What it is a verdict on is a ' +
      'read rooted anywhere ELSE, including an alias bound to the block — that is a screen ' +
      're-defaulting on a raw crafting system'
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
