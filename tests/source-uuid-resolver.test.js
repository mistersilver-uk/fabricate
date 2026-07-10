/**
 * Unit tests for getSourceUuid() helper (T-087)
 *
 * Covers:
 *   1. Returns _stats.compendiumSource when present (Foundry v12+)
 *   2. Falls back to flags.core.sourceId when _stats.compendiumSource is absent
 *   3. Returns null when neither field is set
 *   4. Prefers _stats.compendiumSource over flags.core.sourceId when both are set
 *   5. Handles null/undefined item gracefully
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Ensure foundry global is NOT defined so we exercise the no-foundry path
if (typeof globalThis.foundry !== 'undefined') {
  delete globalThis.foundry;
}

const {
  getSourceUuid,
  getDuplicateSourceUuid,
  getItemSourceReferences,
  getItemIdentityReferences,
  getComponentSourceReferences,
  getRecipeItemSourceReferences,
  resolveComponentForItem,
  itemResolvesToComponent,
  matchRecipeItemDefinition,
  itemMatchesRecipeItemSource,
  findStackableMatch
} = await import('../src/utils/sourceUuid.js');

const { component, componentSet, roleItem } = await import('./helpers/componentIdentityFixtures.js');

// An item-like object whose `getFlag` returns the durable recipe-item flag, mirroring
// how getFabricateFlag normalizes 'recipeItemDefinitionId' -> 'fabricate.recipeItemDefinitionId'.
function itemWithRecipeItemFlag(definitionId, extra = {}) {
  return {
    getFlag(scope, key) {
      if (scope === 'fabricate' && key === 'fabricate.recipeItemDefinitionId') return definitionId;
      return undefined;
    },
    ...extra
  };
}

test('1 - returns _stats.compendiumSource when present (v12+ canonical field)', () => {
  const item = {
    _stats: { compendiumSource: 'Compendium.world.items.abc123' },
    flags: {}
  };
  assert.equal(getSourceUuid(item), 'Compendium.world.items.abc123');
});

test('2 - falls back to flags.core.sourceId when _stats.compendiumSource is absent', () => {
  const item = {
    flags: { core: { sourceId: 'Compendium.world.items.legacy' } }
  };
  assert.equal(getSourceUuid(item), 'Compendium.world.items.legacy');
});

test('3 - returns null when neither field is set', () => {
  const item = { flags: {}, _stats: {} };
  assert.equal(getSourceUuid(item), null);
});

test('4 - prefers _stats.compendiumSource over flags.core.sourceId when both set', () => {
  const item = {
    _stats: { compendiumSource: 'Compendium.world.items.v12' },
    flags: { core: { sourceId: 'Compendium.world.items.legacy' } }
  };
  assert.equal(getSourceUuid(item), 'Compendium.world.items.v12');
});

test('5 - returns null for null item', () => {
  assert.equal(getSourceUuid(null), null);
});

test('6 - returns null for undefined item', () => {
  assert.equal(getSourceUuid(undefined), null);
});

test('7 - reads system._stats.compendiumSource as secondary v12+ location', () => {
  const item = {
    system: { _stats: { compendiumSource: 'Compendium.world.items.sys' } },
    flags: {}
  };
  assert.equal(getSourceUuid(item), 'Compendium.world.items.sys');
});

test('8 - returns null when item has no flags and no _stats', () => {
  assert.equal(getSourceUuid({}), null);
});

test('9 - getItemSourceReferences returns item uuid and canonical source without duplicates', () => {
  const item = {
    uuid: 'Item.actor-owned-1',
    _stats: { compendiumSource: 'Compendium.world.items.iron-ore' },
    flags: {}
  };
  assert.deepEqual(getItemSourceReferences(item), [
    'Item.actor-owned-1',
    'Compendium.world.items.iron-ore'
  ]);
});

test('10 - getComponentSourceReferences includes sourceUuid, sourceItemUuid, and unique fallbacks', () => {
  const component = {
    sourceUuid: 'Compendium.world.items.iron-ore-live',
    sourceItemUuid: 'Compendium.source.items.iron-ore',
    fallbackItemIds: ['Compendium.world.items.iron-ore-live', 'Compendium.world.items.iron-ore-old']
  };
  assert.deepEqual(getComponentSourceReferences(component), [
    'Compendium.world.items.iron-ore-live',
    'Compendium.source.items.iron-ore',
    'Compendium.world.items.iron-ore-old'
  ]);
});

test('11 - resolveComponentForItem matches canonical sourceItemUuid when live uuid differs (raw-ref tier)', () => {
  const item = {
    uuid: 'Item.actor-owned-2',
    _stats: { compendiumSource: 'Compendium.source.items.iron-ore' },
    flags: {}
  };
  const ironOre = component('comp-iron', {
    sourceUuid: 'Compendium.world.items.iron-ore-live',
    sourceItemUuid: 'Compendium.source.items.iron-ore'
  });
  assert.equal(resolveComponentForItem(item, [ironOre], 'sysA'), ironOre);
});

test('12 - getDuplicateSourceUuid reads item._stats.duplicateSource', () => {
  const item = { _stats: { duplicateSource: 'Item.world-pick' }, flags: {} };
  assert.equal(getDuplicateSourceUuid(item), 'Item.world-pick');
});

test('13 - getDuplicateSourceUuid reads system._stats.duplicateSource (second OR-branch)', () => {
  const item = { system: { _stats: { duplicateSource: 'Item.world-pick-sys' } }, flags: {} };
  assert.equal(getDuplicateSourceUuid(item), 'Item.world-pick-sys');
});

test('14 - getDuplicateSourceUuid returns null when unset / null item', () => {
  assert.equal(getDuplicateSourceUuid({ _stats: {}, flags: {} }), null);
  assert.equal(getDuplicateSourceUuid(null), null);
});

test('15 - getSourceUuid stays null for a duplicate-source-only item (compendium contract separate)', () => {
  const item = {
    uuid: 'Item.actor-drag-copy',
    _stats: { compendiumSource: null, duplicateSource: 'Item.world-pick' },
    flags: {}
  };
  assert.equal(getSourceUuid(item), null);
});

test('16 - getItemSourceReferences includes duplicateSource as a third reference', () => {
  const item = {
    uuid: 'Item.actor-drag-copy',
    _stats: { compendiumSource: 'Compendium.world.items.pick', duplicateSource: 'Item.world-pick' },
    flags: {}
  };
  assert.deepEqual(getItemSourceReferences(item), [
    'Item.actor-drag-copy',
    'Compendium.world.items.pick',
    'Item.world-pick'
  ]);
});

test('17 - resolveComponentForItem matches a duplicate-source-only item via sourceItemUuid (raw-ref tier)', () => {
  const item = {
    uuid: 'Item.actor-drag-copy',
    _stats: { compendiumSource: null, duplicateSource: 'Item.world-pick' },
    flags: {}
  };
  const pick = component('comp-pick', {
    sourceUuid: 'Compendium.world.items.pick-live',
    sourceItemUuid: 'Item.world-pick'
  });
  assert.equal(resolveComponentForItem(item, [pick], 'sysA'), pick);
});

test('18 - resolveComponentForItem does NOT produce identity from an irrelevant flags.fabricate.mythwrightId (negative guard)', () => {
  const item = {
    uuid: 'Item.actor-seeded',
    _stats: {},
    flags: { fabricate: { mythwrightId: 'mw-pick' } },
    // An unrelated third-party flag: getFabricateFlag('roles'/'componentId') must miss.
    getFlag: (scope, key) =>
      scope === 'fabricate' && key === 'fabricate.mythwrightId' ? 'mw-pick' : undefined
  };
  const pick = component('comp-pick', {
    sourceUuid: 'Compendium.world.items.pick-live',
    sourceItemUuid: 'Item.world-pick'
  });
  // No roles, no legacy scalar, no overlapping raw refs ⇒ no match.
  assert.equal(resolveComponentForItem(item, [pick], 'sysA'), null);
  assert.equal(itemResolvesToComponent(item, pick, [pick], 'sysA'), false);
});

test('19 - findStackableMatch: returns an existing quantity item sharing the source uuid', () => {
  const source = { uuid: 'Compendium.world.items.raw-ore' };
  const items = [
    { name: 'Sword', uuid: 'Item.sword', system: {} }, // no quantity → not stackable
    { name: 'Raw Ore', uuid: 'Item.owned-ore', system: { quantity: 3 }, flags: { core: { sourceId: 'Compendium.world.items.raw-ore' } } }
  ];
  const match = findStackableMatch(items, source);
  assert.equal(match?.uuid, 'Item.owned-ore');
});

test('20 - findStackableMatch: no match when no item has a quantity field', () => {
  const source = { uuid: 'Compendium.world.items.raw-ore' };
  const items = [
    { name: 'Raw Ore', uuid: 'Item.owned-ore', system: {}, flags: { core: { sourceId: 'Compendium.world.items.raw-ore' } } }
  ];
  assert.equal(findStackableMatch(items, source), null);
});

test('21 - findStackableMatch: no match when source refs do not overlap', () => {
  const source = { uuid: 'Compendium.world.items.raw-ore' };
  const items = [
    { name: 'Gemstone', uuid: 'Item.gem', system: { quantity: 1 }, flags: { core: { sourceId: 'Compendium.world.items.gemstone' } } }
  ];
  assert.equal(findStackableMatch(items, source), null);
});

test('22 - findStackableMatch: empty source refs never match (no false positives)', () => {
  const items = [{ uuid: 'Item.x', system: { quantity: 1 } }];
  assert.equal(findStackableMatch(items, {}), null);
});

// findStackableMatch durable-identity guard (issue 556). Tests 19-22 above are the
// documented 2-arg degrade (B7): resolver returns null on both sides ⇒ pure raw-ref.

test('A2 - findStackableMatch does NOT fold an award into a candidate resolving to a DIFFERENT component (both source shapes)', () => {
  const compA = component('comp-a', { sourceItemUuid: 'Item.a-src' });
  const compB = component('comp-b', { sourceItemUuid: 'Item.b-src' });
  const components = [compA, compB];
  // The candidate resolves to compB (roles) but shares the award source's raw ref via a
  // transitive duplicateSource. On origin/main (raw-ref only) the award folds into it —
  // the bug. After the fix the differing identities skip it.
  const candidate = roleItem({
    uuid: 'Item.owned-b',
    duplicateSource: 'Item.award-src',
    roles: { sysA: { componentId: 'comp-b' } },
    quantity: 4
  });

  // Foundry-Item award source resolving to compA. Trap: its Foundry .id collides with
  // the candidate's claimed id (comp-b) — that is NOT identity agreement.
  const itemSource = roleItem({
    uuid: 'Item.award-src',
    roles: { sysA: { componentId: 'comp-a' } }
  });
  itemSource.id = 'comp-b';
  assert.equal(findStackableMatch([candidate], itemSource, components, 'sysA'), null);

  // Bare-component award source (its identity is itself, compA).
  assert.equal(findStackableMatch([candidate], compA, components, 'sysA'), null);
});

test('B3 - findStackableMatch still stacks on a shared raw ref when identities agree or are absent (both source shapes)', () => {
  const compA = component('comp-a', { sourceItemUuid: 'Item.a-src' });
  const components = [compA];
  // Identity agreement: candidate resolves to compA and shares a raw ref.
  const agreeing = roleItem({
    uuid: 'Item.owned-a',
    compendiumSource: 'Item.a-src',
    roles: { sysA: { componentId: 'comp-a' } },
    quantity: 2
  });
  assert.equal(findStackableMatch([agreeing], compA, components, 'sysA'), agreeing);

  // Flagless candidate: it resolves to compA only via the raw-ref tier (its
  // duplicateSource), agreeing with the source ⇒ the shared raw ref stacks it.
  const flagless = {
    uuid: 'Item.owned-flagless',
    _stats: { duplicateSource: 'Item.a-src' },
    flags: {},
    system: { quantity: 3 }
  };
  const itemSource = roleItem({ uuid: 'Item.a-src', roles: { sysA: { componentId: 'comp-a' } } });
  assert.equal(findStackableMatch([flagless], itemSource, components, 'sysA'), flagless);
});

test('B4 - findStackableMatch does NOT stack a correct-identity candidate with zero ref overlap (a new document is created)', () => {
  const compA = component('comp-a', { sourceItemUuid: 'Item.a-src' });
  // Candidate resolves to compA (agreement) but shares NO raw ref with the source, so
  // the raw-ref positive signal is absent and nothing stacks.
  const candidate = roleItem({
    uuid: 'Item.owned-a',
    compendiumSource: 'Item.unrelated',
    roles: { sysA: { componentId: 'comp-a' } },
    quantity: 2
  });
  const itemSource = roleItem({ uuid: 'Item.a-src', roles: { sysA: { componentId: 'comp-a' } } });
  assert.equal(findStackableMatch([candidate], itemSource, [compA], 'sysA'), null);
});

test('23 - getItemIdentityReferences returns uuid and compendium source, EXCLUDING duplicateSource', () => {
  const item = {
    uuid: 'Item.actor-drag-copy',
    _stats: { compendiumSource: 'Compendium.world.items.pick', duplicateSource: 'Item.world-pick' },
    flags: {}
  };
  assert.deepEqual(getItemIdentityReferences(item), [
    'Item.actor-drag-copy',
    'Compendium.world.items.pick'
  ]);
});

test('24 - getItemIdentityReferences for a clone with no compendium source returns only its own uuid', () => {
  // Mirrors the Talonvine shape: a world item cloned from another world item.
  const item = {
    uuid: 'Item.talonvine',
    _stats: { compendiumSource: null, duplicateSource: 'Item.moonsilver-weed' },
    flags: {}
  };
  assert.deepEqual(getItemIdentityReferences(item), ['Item.talonvine']);
});

test('25 - getItemIdentityReferences still includes the compendium source (parity with getSourceUuid)', () => {
  const item = {
    uuid: 'Item.actor-owned-1',
    _stats: { compendiumSource: 'Compendium.world.items.iron-ore' },
    flags: {}
  };
  assert.deepEqual(getItemIdentityReferences(item), [
    'Item.actor-owned-1',
    'Compendium.world.items.iron-ore'
  ]);
});

test('26 - getItemIdentityReferences returns [] for null/non-object', () => {
  assert.deepEqual(getItemIdentityReferences(null), []);
  assert.deepEqual(getItemIdentityReferences('Item.x'), []);
});

// ---------------------------------------------------------------------------
// resolveComponentForItem — list-aware, system-scoped, per-system `roles` map +
// legacy-scalar identity tiers with a raw-reference fall-through.
// ---------------------------------------------------------------------------

test('27 - resolveComponentForItem matches on the legacy scalar flags.fabricate.componentId even when source UUIDs differ', () => {
  // A restamp not yet run: identity carried by the legacy scalar. The scalar has no
  // system, so it stays list-aware — it names a component in the set.
  const item = roleItem({
    uuid: 'Item.actor-templated',
    duplicateSource: 'Item.some-template',
    componentId: 'comp-abc'
  });
  const abc = component('comp-abc', {
    sourceUuid: 'Item.component-source',
    sourceItemUuid: 'Item.component-source'
  });
  assert.equal(resolveComponentForItem(item, [abc], 'sysA'), abc);
});

test('A1 - within-system exclusivity: a roles-flagged item whose duplicateSource overlaps a sibling resolves to its flagged component ONLY', () => {
  // (Migrated from the vacuous committed test 28.) On origin/main the matcher reads
  // only the scalar and falls through to the raw-ref tier, which matches sibling Y via
  // the transitive duplicateSource — the bug. The resolver reads roles and returns X.
  const compX = component('comp-x', { sourceItemUuid: 'Item.x-src' });
  const compY = component('comp-y', { sourceItemUuid: 'Item.y-src' });
  const item = roleItem({
    uuid: 'Item.actor-templated',
    duplicateSource: 'Item.y-src', // overlaps sibling Y's source ref
    roles: { sysA: { componentId: 'comp-x' } }
  });
  assert.equal(resolveComponentForItem(item, [compX, compY], 'sysA'), compX);
  assert.equal(itemResolvesToComponent(item, compY, [compX, compY], 'sysA'), false);
});

test('A0-map - roles map is the sole identity: refs decoupled from the flagged component still resolve to it', () => {
  // Identity carried SOLELY by roles; the item's raw refs do NOT overlap compA. On
  // origin/main the matcher cannot read roles and the decoupled refs miss ⇒ null.
  const compA = component('comp-a', { sourceItemUuid: 'Item.a-src' });
  const item = roleItem({
    uuid: 'Item.decoupled',
    compendiumSource: 'Item.unrelated',
    roles: { sysA: { componentId: 'comp-a' } }
  });
  assert.equal(resolveComponentForItem(item, [compA], 'sysA'), compA);
});

test('A4 - read-side cross-system: one source registered in two systems resolves to the right component in EACH (map load-bearing, no scalar)', () => {
  // roles names compA under sysA and compB under sysB; refs decoupled from both; NO
  // legacy scalar (post-restamp). Both halves fail on main (decoupled refs, no scalar).
  const sysA = componentSet('sysA', [component('comp-a', { sourceItemUuid: 'Item.a-src' })]);
  const sysB = componentSet('sysB', [component('comp-b', { sourceItemUuid: 'Item.b-src' })]);
  const item = roleItem({
    uuid: 'Item.shared-source',
    compendiumSource: 'Item.unrelated',
    roles: { sysA: { componentId: 'comp-a' }, sysB: { componentId: 'comp-b' } }
  });
  assert.equal(resolveComponentForItem(item, sysA.components, sysA.id).id, 'comp-a');
  assert.equal(resolveComponentForItem(item, sysB.components, sysB.id).id, 'comp-b');
});

test('A6 - systemId keying defeats copy-import id-collision: same component id in two systems resolves per system', () => {
  // Both systems own a DIFFERENT-source component with id comp-5 (copy-import id reuse).
  // The item's roles names comp-5 ONLY under sysA; refs decoupled. It must resolve to
  // sysA's comp-5 and NOT sysB's. The sysB half additionally defeats any systemId-free
  // or union-over-roles-values resolver.
  const sysA = componentSet('sysA', [component('comp-5', { sourceItemUuid: 'Item.a5-src' })]);
  const sysB = componentSet('sysB', [component('comp-5', { sourceItemUuid: 'Item.b5-src' })]);
  const item = roleItem({
    uuid: 'Item.decoupled',
    compendiumSource: 'Item.unrelated',
    roles: { sysA: { componentId: 'comp-5' } }
  });
  assert.equal(resolveComponentForItem(item, sysA.components, 'sysA'), sysA.components[0]);
  assert.equal(resolveComponentForItem(item, sysB.components, 'sysB'), null);
});

test('B2 - flag-irrelevant item still matches on raw refs (including via duplicateSource)', () => {
  // No roles, no scalar — a pre-#555 unstamped world. The raw-ref fall-through is
  // load-bearing and unchanged. Green both ways.
  const compA = component('comp-a', { sourceItemUuid: 'Item.a-src' });
  const item = { uuid: 'Item.owned', _stats: { duplicateSource: 'Item.a-src' }, flags: {} };
  assert.equal(resolveComponentForItem(item, [compA], 'sysA'), compA);
});

test('B5 - hygiene tier: an empty or nullish roles[sys] never yields identity, even against a nullish-id component', () => {
  // {} or { componentId: null } (a restamp interrupted midway) must be NO identity,
  // tested before the membership check. Guards the hygiene tier before #561 adds toolId.
  const nullishIdComp = component(undefined, { sourceItemUuid: 'Item.other-src' });
  const emptyRoles = roleItem({ uuid: 'Item.mid-restamp', roles: { sysA: {} } });
  const nullComponentId = roleItem({
    uuid: 'Item.mid-restamp',
    roles: { sysA: { componentId: null } }
  });
  assert.equal(resolveComponentForItem(emptyRoles, [nullishIdComp], 'sysA'), null);
  assert.equal(resolveComponentForItem(nullComponentId, [nullishIdComp], 'sysA'), null);
});

test('B6 - scalar multi-system (anti-pairwise guard): item IS compA, legacy scalar = compB, refs overlap compA ⇒ resolves compA under sysA', () => {
  // Protects against re-introducing the pairwise fail-close (which would flip true→false
  // for a system whose scalar was overwritten by a later registration in another system).
  const compA = component('comp-a', { sourceItemUuid: 'Item.a-src' });
  const item = roleItem({
    uuid: 'Item.owned',
    compendiumSource: 'Item.a-src', // raw ref overlaps compA
    componentId: 'comp-b' // legacy scalar names a component absent from sysA's set
  });
  // Scalar comp-b names nothing in [compA] ⇒ fall through to raw refs ⇒ compA.
  assert.equal(resolveComponentForItem(item, [compA], 'sysA'), compA);
});

test('B8 - three-system + stale-entry boundary: a claimed id absent from the set under test falls through; a dead-system roles entry is inert', () => {
  const compA = component('comp-a', { sourceItemUuid: 'Item.a-src' });
  // The item's roles names comp-3, which lives only in a THIRD system, absent here; its
  // refs overlap compA ⇒ fall through to raw refs ⇒ compA.
  const thirdSystemClaim = roleItem({
    uuid: 'Item.owned',
    compendiumSource: 'Item.a-src',
    roles: { sysC: { componentId: 'comp-3' } }
  });
  assert.equal(resolveComponentForItem(thirdSystemClaim, [compA], 'sysA'), compA);
  // A stale roles entry for a dead system, queried against a live system's set with no
  // ref overlap, is inert (no match).
  const staleOnly = roleItem({
    uuid: 'Item.stale',
    compendiumSource: 'Item.unrelated',
    roles: { deadSys: { componentId: 'comp-x' } }
  });
  assert.equal(resolveComponentForItem(staleOnly, [compA], 'sysA'), null);
});

test('A11b - an unsafe (dotted) systemId skips the roles tier and still resolves via raw refs (unstamped behaviour), while a safe systemId resolves via the map', () => {
  const compRoles = component('comp-roles', { sourceItemUuid: 'Item.roles-src' });
  const compDup = component('comp-dup', { sourceItemUuid: 'Item.dup-src' });
  const components = [compRoles, compDup];

  // Safe systemId: the durable `roles` map resolves to compRoles via tier 1, exclusively.
  const safeItem = roleItem({ uuid: 'Item.safe', roles: { sysA: { componentId: 'comp-roles' } } });
  assert.equal(resolveComponentForItem(safeItem, components, 'sysA'), compRoles);

  // Unsafe (dotted) systemId carrying a stray FLAT dotted `roles` key (the shape a naive
  // reader would wrongly honour). Such a key can never have been WRITTEN — every stamp
  // site skips an unsafe id and `setFlag` would nest on the dot anyway — so tier 1 is
  // skipped and matching falls through to the load-bearing raw-ref tier (the ordinary
  // UNSTAMPED case), NOT refused. Refusing would break crafting for a legacy dotted-id
  // world entirely, which is worse than the pre-#556 mis-attribution it would prevent.
  const unsafeItem = roleItem({
    uuid: 'Item.unsafe',
    duplicateSource: 'Item.dup-src', // raw-ref overlaps compDup
    roles: { 'my.system': { componentId: 'comp-roles' } }
  });
  assert.equal(resolveComponentForItem(unsafeItem, components, 'my.system'), compDup);
});

// ---------------------------------------------------------------------------
// matchRecipeItemDefinition — four-tier precedence, no fall-through, union refs
// ---------------------------------------------------------------------------

const BOOK_DEF = { id: 'def-book', sourceUuid: 'Item.book', sourceItemUuid: 'Compendium.mod.book', fallbackItemIds: [] };

test('29 - matchRecipeItemDefinition: tier 1 (durable flag) wins even when source uuids point elsewhere', () => {
  const item = itemWithRecipeItemFlag('def-book', { uuid: 'Item.unrelated', _stats: {} });
  assert.deepEqual(matchRecipeItemDefinition(item, [BOOK_DEF]), { definition: BOOK_DEF, tier: 'identity' });
});

test('30 - matchRecipeItemDefinition: tier 2 (own uuid) matches sourceUuid via the union', () => {
  const item = { uuid: 'Item.book', _stats: {}, getFlag: () => undefined };
  assert.deepEqual(matchRecipeItemDefinition(item, [BOOK_DEF]), { definition: BOOK_DEF, tier: 'uuid' });
});

test('31 - matchRecipeItemDefinition: tier 3 (compendium source) matches sourceItemUuid', () => {
  const item = { uuid: 'Item.copy', _stats: { compendiumSource: 'Compendium.mod.book' }, getFlag: () => undefined };
  assert.deepEqual(matchRecipeItemDefinition(item, [BOOK_DEF]), { definition: BOOK_DEF, tier: 'compendium' });
});

test('32 - matchRecipeItemDefinition: tier 4 (duplicate source) is the last resort', () => {
  const item = { uuid: 'Item.copy', _stats: { duplicateSource: 'Item.book' }, getFlag: () => undefined };
  assert.deepEqual(matchRecipeItemDefinition(item, [BOOK_DEF]), { definition: BOOK_DEF, tier: 'duplicate' });
});

test('33 - matchRecipeItemDefinition: no fall-through — a flag match to one def never falls to a uuid match on another', () => {
  const flagged = { id: 'def-flag', sourceItemUuid: 'Item.nowhere' };
  const bySource = { id: 'def-src', sourceUuid: 'Item.book', sourceItemUuid: 'Item.book' };
  const item = itemWithRecipeItemFlag('def-flag', { uuid: 'Item.book', _stats: {} });
  // Tier 1 resolves def-flag; it must NOT fall through to the tier-2 uuid match on def-src.
  assert.deepEqual(matchRecipeItemDefinition(item, [flagged, bySource]), { definition: flagged, tier: 'identity' });
});

test('34 - matchRecipeItemDefinition: union resolves BOTH drag routes of a compendium-imported book', () => {
  const fromCompendium = { uuid: 'Item.a', _stats: { compendiumSource: 'Compendium.mod.book' }, getFlag: () => undefined };
  const fromWorldItem = { uuid: 'Item.b', _stats: { compendiumSource: 'Compendium.mod.book', duplicateSource: 'Item.book' }, getFlag: () => undefined };
  assert.equal(matchRecipeItemDefinition(fromCompendium, [BOOK_DEF]).definition, BOOK_DEF);
  assert.equal(matchRecipeItemDefinition(fromWorldItem, [BOOK_DEF]).definition, BOOK_DEF);
});

// False-positive guards (companions to tests 16-17, 19-22 which only assert true-positives).

test('35 - matchRecipeItemDefinition: an item sharing NO ref returns no match', () => {
  const item = { uuid: 'Item.other', _stats: { compendiumSource: 'Compendium.mod.other', duplicateSource: 'Item.other' }, getFlag: () => undefined };
  assert.deepEqual(matchRecipeItemDefinition(item, [BOOK_DEF]), { definition: null, tier: null });
  assert.equal(itemMatchesRecipeItemSource(item, [BOOK_DEF]), false);
});

test('36 - matchRecipeItemDefinition: a non-matching durable flag does NOT match (no false positive on flag)', () => {
  const item = itemWithRecipeItemFlag('def-other', { uuid: 'Item.x', _stats: {} });
  assert.deepEqual(matchRecipeItemDefinition(item, [BOOK_DEF]), { definition: null, tier: null });
});

test('37 - matchRecipeItemDefinition: empty definitions, null item, and blank refs never match', () => {
  assert.deepEqual(matchRecipeItemDefinition({ uuid: 'Item.book', getFlag: () => undefined }, []), { definition: null, tier: null });
  assert.deepEqual(matchRecipeItemDefinition(null, [BOOK_DEF]), { definition: null, tier: null });
  const blankDef = { id: 'blank', sourceItemUuid: '  ' };
  const item = { uuid: '', _stats: {}, getFlag: () => undefined };
  assert.equal(itemMatchesRecipeItemSource(item, [blankDef]), false);
});

test('38 - getRecipeItemSourceReferences unions sourceUuid, sourceItemUuid, and fallbacks like the component helper', () => {
  const def = { sourceUuid: 'Item.book', sourceItemUuid: 'Compendium.mod.book', fallbackItemIds: ['Item.old', 'Item.book'] };
  assert.deepEqual(getRecipeItemSourceReferences(def), ['Item.book', 'Compendium.mod.book', 'Item.old']);
});
