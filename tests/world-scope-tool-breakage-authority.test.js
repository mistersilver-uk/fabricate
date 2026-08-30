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

  // ── EVERY `toolBreakage` READ IN THE SHELL, NOT JUST TODAY'S SPELLING OF ONE ───────────
  //
  // The version of this that shipped in the first round matched the literal
  // `toolBreakage?.authority`, and three separate re-default spellings walked straight past it
  // — each measured, each leaving the suite green:
  //
  //   1. `selectedSystem.toolBreakage.authority === 'checkDriven' ? … : 'toolSpecific'`
  //   2. `const rawTb = $derived(allSystems[0]?.toolBreakage);` then `rawTb?.authority === …`
  //   3. `allSystems[0]?.toolBreakage?.['authority'] ?? 'toolSpecific'`
  //
  // The SECOND is the one that matters, and no widening of an `…authority` pattern can ever
  // see it: an alias binds the BLOCK and re-defaults off the alias, so the word `authority`
  // never appears next to the word `toolBreakage` at all. So this does not scan for authority
  // reads. It scans for every property access named `toolBreakage` and requires each one to be
  // a member of a closed set.
  //
  // WHY THAT IS THE LOAD-BEARING GUARD RATHER THAN A TIDIER ONE. Of the four manager surfaces
  // that read this field, exactly ONE has behavioural coverage — the Tool Studio radiogroup, in
  // `manager-mounted.test.js`. A projection mutated to ignore the world scope entirely leaves
  // this file green, `stores/adminStore.test.js` green, and reds only that one mounted case.
  // The other three reads have no behavioural gate anywhere, and this assertion is all they
  // have. A row taken from `$viewState.systems` is a RAW crafting system that, after the
  // 1.30.0 flip, carries no `toolBreakage` key at all when nothing was authored — so
  // `systemRow.toolBreakage.authority || 'toolSpecific'` answers `toolSpecific` while the world
  // says `checkDriven`, silently, at a surface nothing photographs.
  //
  // PROSE IS NOT A READ. The pattern requires a `.` or `?.` immediately before the name, so a
  // comment discussing `toolBreakage`, and the unrelated `toolBreakagePolicy` on the gathering
  // realm rules, are both outside it — the latter by the word boundary.
  const root = readSource('src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');

  // ── THE DESTRUCTURE HOLE, CLOSED SEPARATELY ───────────────────────────────────────────
  //
  // `const { toolBreakage } = allSystems[0] ?? {};` has no leading dot on the binding OR on
  // the use, so the read scan below cannot see either half — measured green while a surface
  // re-defaulted off the binding. It is not a contrived spelling: `const { valid, errors } =`
  // is a live idiom in this very file, twice.
  //
  // A second pattern is the cheap close, and it is narrower than forbidding the bare name
  // outright: that would red on the comment prose the scan below deliberately permits.
  //
  // THE LOOKAHEAD ADMITS `=`, AND THAT CHARACTER IS THE WHOLE POINT. The first version of
  // this guard accepted only `}`, `,` and `:` after the binding, so a DEFAULT VALUE —
  // `const { toolBreakage = {} } = selectedSystem ?? {};` — put an `=` there and matched
  // nothing, while the read scan stayed blind for the usual reason. Three spellings of it
  // were measured green. That is the most on-target spelling in the whole class rather than
  // an exotic one: a default value IS a local re-default, it is the dominant `$props()`
  // idiom in this neighbourhood (`AccessTabView.svelte` uses it seven times consecutively),
  // and the version that gets it wrong is the one a Svelte component is most likely to grow.
  //
  // KNOWN LIMITATION, ACCEPTED RATHER THAN UNNOTICED. This also reds on an object LITERAL
  // that carries the key — `{ toolBreakage }` or `{ toolBreakage: … }` — because the two are
  // not distinguishable by text. That is acceptable HERE and would not be everywhere: the
  // shell consumes the published projection and never constructs a crafting system, so it has
  // no reason to build such a literal; the write path that does lives in `adminStore`. If one
  // ever becomes legitimate here, this guard is the wrong shape and should be replaced rather
  // than exempted.
  assert.deepEqual(
    root.match(/[{,]\s*toolBreakage\s*(?=[},:=])/g) ?? [],
    [],
    'the shell must not DESTRUCTURE the tool-breakage block: a binding has no leading dot, so ' +
      'the read scan below cannot see it or any re-default taken off it'
  );

  // ── TWO RESIDUALS NO TEXT SCAN CLOSES, RECORDED RATHER THAN CHASED ────────────────────
  //
  // 1. A bracket-string ROOT — `selectedSystem['toolBreakage'].authority` — puts the name
  //    inside a string, where neither pattern above looks for it.
  // 2. A COMPENSATED SWAP: delete one legitimate read and add a hostile one, and the tally
  //    still totals four.
  //
  // Both need an AST, and an AST parse of a `.svelte` file is a compiler dependency this
  // suite does not have. They are named so the next reader knows the boundary of this guard
  // rather than inferring a completeness it does not have.
  const TOOL_BREAKAGE_READ = /[A-Za-z0-9_$?.[\]'"]*\??\.toolBreakage\b[A-Za-z0-9_$?.[\]'"]*/g;
  const reads = root.match(TOOL_BREAKAGE_READ) ?? [];
  assert.ok(reads.length > 0, 'the shell reads this field somewhere; a zero count is a broken scan');
  const tally = new Map();
  for (const read of reads) tally.set(read, (tally.get(read) ?? 0) + 1);
  assert.deepEqual(
    [...tally.entries()].sort(([left], [right]) => left.localeCompare(right)),
    [
      ['selectedSystem?.toolBreakage?.authority', 4],
      ['selectedSystem?.toolBreakage?.source', 1],
    ],
    'every `toolBreakage` access in the shell reads the PUBLISHED projection off ' +
      '`selectedSystem`. FOUR read the resolved authority — `ChecksView` gates on it (and fans ' +
      'out internally to crafting, salvage and gathering rather than being three editors), ' +
      '`ToolsBrowserView` authors it, `ToolEditView` reads it, and `tools/ToolBrowserInspector` ' +
      'draws the per-tool behaviour copy from it — and ONE carries the authoring scope to the ' +
      'control. If your change adds a LEGITIMATE fifth read off `selectedSystem`, this pin is ' +
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
