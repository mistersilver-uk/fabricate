/**
 * Issue 570 — copy-import component-id regeneration + within-payload reference remap.
 *
 * Acceptance (a)-(f), each driving the REAL production call site
 * `CraftingSystemExporter.prepareForImport(payload, 'copy')` end-to-end (no value is
 * fed straight into the transform helper). RED against pre-#570 base, which preserves
 * component ids on copy:
 *   (a) regenerate + remap every D1 category
 *   (b) residual closure — two copies from one origin share no component id
 *   (c) behaviour-preserving live-model isomorphism
 *   (d) no-dangle completeness (collector + independent literal-path sweep)
 *   (e) keep-mode untouched (green by design)
 *   (f) key-aware NEGATIVE — no blanket string-replace (green by design)
 *
 * AMENDED BY ISSUE 1364, which RETRACTS mint-everything in favour of MATCH-OR-MINT. Copy mode now
 * binds an incoming component to the destination world entity its SOURCE REFERENCES name, and
 * mints only when nothing matches. Cases (a), (c), (d) and (f) are unchanged in substance and run
 * against an EMPTY destination index, where every component is unmatched and therefore mints —
 * which is exactly the pre-1364 behaviour they were written for.
 *
 * Case (b) INVERTS, and that inversion is the point of the change rather than a casualty of it.
 * Two copies from one origin used to share no component id; they now share one for every LINKED
 * component, because sharing an id is what stops the second import creating a second world record
 * for an item the destination already holds. The old guarantee survives, restated: two copies
 * share an id only when their source-reference sets INTERSECT, which is the relation the `1.30.0`
 * grouping unions on — so an UNLINKED component still mints a disjoint id on every import.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.foundry = {
  utils: { randomID: () => `id-${Math.random().toString(36).slice(2)}` },
};
globalThis.game = { user: { name: 'Tester' } };

const { prepareForImport } = await import('../src/systems/CraftingSystemExporter.js');
const { resolveImportReferences, rebindCopyComponentIds } =
  await import('../src/systems/importReferenceResolver.js');
const { Recipe } = await import('../src/models/Recipe.js');
const {
  buildCopyImportComponentFixture,
  collectComponentRefSites,
  OLD_COMPONENT_IDS,
  COLLIDING_NON_COMPONENT_ID,
} = await import('./helpers/copyImportComponentFixture.js');

/**
 * A destination world with no entities at all, which is what makes every component UNMATCHED and
 * therefore minted. Frozen so a case cannot grow it by accident and change a sibling's meaning.
 */
const EMPTY_WORLD_ENTITY_INDEX = Object.freeze({
  components: Object.freeze([]),
  essences: Object.freeze([]),
  tools: Object.freeze([]),
});

/**
 * The real production copy-mode call site, against a given destination index.
 *
 * @param {object} [worldEntityIndex]
 * @returns {object}
 */
function copyImport(worldEntityIndex = EMPTY_WORLD_ENTITY_INDEX) {
  return prepareForImport(buildCopyImportComponentFixture(), 'copy', { worldEntityIndex });
}

function idMapFromKeepAndCopy(keep, copy) {
  const oldIds = keep.system.components.map((c) => c.id);
  const newIds = copy.system.components.map((c) => c.id);
  const map = new Map();
  for (const [i, oldId] of oldIds.entries()) map.set(oldId, newIds[i]);
  return { map, oldIds, newIds };
}

/** Live-model ingredient/result componentIds for isomorphism checks (case c). */
function liveRecipeComponentIds(recipeJson) {
  const recipe = Recipe.fromJSON(recipeJson);
  const ids = [];
  const walkIngredient = (ing) => {
    if (ing.componentId) ids.push(ing.componentId);
    for (const alt of ing.alternatives || []) walkIngredient(alt);
  };
  for (const set of recipe.ingredientSets) {
    for (const group of set.ingredientGroups) {
      for (const opt of group.options) walkIngredient(opt);
    }
  }
  for (const step of recipe.steps || []) {
    for (const set of step.ingredientSets || []) {
      for (const group of set.ingredientGroups || []) {
        for (const opt of group.options) walkIngredient(opt);
      }
    }
    for (const group of step.resultGroups || []) {
      for (const res of group.results || []) if (res.componentId) ids.push(res.componentId);
    }
  }
  for (const group of recipe.resultGroups) {
    for (const res of group.results) if (res.componentId) ids.push(res.componentId);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// (a) Regenerate + remap every D1 category
// ---------------------------------------------------------------------------

test('(a) copy-import regenerates every component id and remaps every D1 reference site', () => {
  const keep = prepareForImport(buildCopyImportComponentFixture(), 'keep');
  const copy = copyImport();
  const { map, oldIds, newIds } = idMapFromKeepAndCopy(keep, copy);
  const oldIdSet = new Set(oldIds);

  // Every component id changed.
  for (const [i, comp] of copy.system.components.entries()) {
    assert.notEqual(comp.id, oldIds[i], `component[${i}] id should be regenerated`);
    assert.ok(!oldIdSet.has(comp.id), `regenerated id ${comp.id} must not collide with an old id`);
  }

  // Every enumerated reference now points at the CORRESPONDING new id.
  const keepSites = collectComponentRefSites(keep);
  const copySites = collectComponentRefSites(copy);
  assert.equal(copySites.length, keepSites.length, 'same set of reference sites in both modes');
  assert.ok(copySites.length >= 20, 'fixture exercises a rich set of reference sites');

  for (const [i, site] of copySites.entries()) {
    assert.equal(site.path, keepSites[i].path, 'site order stable across modes');
    const expected = map.get(keepSites[i].value) ?? keepSites[i].value;
    assert.equal(
      site.value,
      expected,
      `site ${site.path} must point at the remapped new id (was ${keepSites[i].value})`
    );
    assert.ok(!oldIdSet.has(site.value), `site ${site.path} still holds an old id: ${site.value}`);
  }

  // Spot-check a representative from each D1 category resolves into the new-id set.
  const newIdSet = new Set(newIds);
  for (const { path, value } of copySites) {
    assert.ok(newIdSet.has(value), `site ${path} value ${value} is not a regenerated component id`);
  }
});

// ---------------------------------------------------------------------------
// (b) Residual closure
// ---------------------------------------------------------------------------

test('(b) a second copy from one origin BINDS to the first copy\'s world entities (issue 1364)', () => {
  // The shared, GROWING destination index: the first import's world entities are what the second
  // import matches against, which is exactly what the two live call sites build from the three
  // world-scope entity stores.
  const worldEntityIndex = { components: [], essences: [], tools: [] };

  const copy1 = copyImport(worldEntityIndex);
  worldEntityIndex.components.push(...copy1.componentScope.entities);
  const copy2 = copyImport(worldEntityIndex);

  const ids1 = copy1.system.components.map((c) => c.id);
  const ids2 = copy2.system.components.map((c) => c.id);

  // Every fixture component is LINKED — each carries an `originItemUuid` — so every one of them
  // binds rather than minting. Pre-1364 this assertion was its exact negation.
  assert.deepEqual(ids2, ids1, 'a second copy must bind to the first copy\'s world entity ids');
  assert.equal(
    copy2.componentScope.entities.length,
    0,
    'a MATCHED entity adds no world entity — its incoming roster record is dropped'
  );

  // The RETAINED half of the old guarantee: an UNLINKED component has no source references to
  // intersect, so it can never bind and mints a disjoint id on every import.
  const unlinkedOrigin = buildCopyImportComponentFixture();
  for (const component of unlinkedOrigin.system.components) {
    delete component.originItemUuid;
    delete component.registeredItemUuid;
    component.aliasItemUuids = [];
  }
  const unlinked1 = prepareForImport(unlinkedOrigin, 'copy', { worldEntityIndex });
  worldEntityIndex.components.push(...unlinked1.componentScope.entities);
  const unlinked2 = prepareForImport(unlinkedOrigin, 'copy', { worldEntityIndex });
  const unlinkedIds1 = new Set(unlinked1.system.components.map((c) => c.id));
  for (const id of unlinked2.system.components.map((c) => c.id)) {
    assert.ok(!unlinkedIds1.has(id), `an unlinked component must still mint a disjoint id: ${id}`);
  }
});

// ---------------------------------------------------------------------------
// (c) Behaviour-preserving live-model isomorphism
// ---------------------------------------------------------------------------

test('(c) the copied system is craftable identically to its origin (live-model isomorphism)', () => {
  const keep = prepareForImport(buildCopyImportComponentFixture(), 'keep');
  const copy = copyImport();
  const { map, oldIds, newIds } = idMapFromKeepAndCopy(keep, copy);
  const newIdSet = new Set(newIds);
  const oldIdSet = new Set(oldIds);

  for (const [i, keepRecipe] of keep.recipes.entries()) {
    const originIds = liveRecipeComponentIds(keepRecipe);
    const copyIds = liveRecipeComponentIds(copy.recipes[i]);
    assert.ok(originIds.length > 0, 'recipe resolves at least one live component ref');
    assert.equal(copyIds.length, originIds.length, 'no live component reference is dropped');

    for (const [j, copyId] of copyIds.entries()) {
      // Live model still matches its OWN (regenerated) components, and NONE of the
      // origin's ids — the copy is a distinct component graph, isomorphic under the map.
      assert.ok(newIdSet.has(copyId), `live copy ref ${copyId} must be a regenerated component`);
      assert.ok(!oldIdSet.has(copyId), `live copy ref ${copyId} must not be an origin id`);
      // Isomorphism under the old→new map.
      assert.equal(
        copyId,
        map.get(originIds[j]),
        `live copy ref must be the origin ref ${originIds[j]} under the id map`
      );
    }
  }

  // Salvage / essence / tool refs preserve their component-graph edge under the map.
  const originOreSalvage = keep.system.components[0].salvage.resultGroups[0].results[0].componentId;
  const copyOreSalvage = copy.system.components[0].salvage.resultGroups[0].results[0].componentId;
  assert.equal(copyOreSalvage, map.get(originOreSalvage), 'salvage yield edge preserved under map');

  const copyEssenceSource = copy.system.essenceDefinitions[0].sourceComponentId;
  assert.equal(copyEssenceSource, map.get('comp-ore'), 'essence source edge preserved under map');

  const copyTool = copy.system.tools[0];
  assert.equal(copyTool.componentId, map.get('comp-whetstone'), 'tool component edge preserved');
  assert.equal(
    copyTool.onBreak.replacementComponentId,
    map.get('comp-ore'),
    'tool onBreak replacement edge preserved'
  );
});

// ---------------------------------------------------------------------------
// (d) No dangle — completeness (collector + independent literal-path sweep)
// ---------------------------------------------------------------------------

test('(d) no within-payload component reference dangles after the copy transform', async () => {
  const copy = copyImport();
  const oldIdSet = new Set(OLD_COMPONENT_IDS);
  const newIdSet = new Set(copy.system.components.map((c) => c.id));

  // The reused enumerator (via the public resolver) reports no broken component link.
  const { unresolvedReferences } = await resolveImportReferences(copy);
  const danglingComponentLinks = unresolvedReferences.filter((r) => r.kind === 'componentLink');
  assert.equal(
    danglingComponentLinks.length,
    0,
    `collector reported dangling component links: ${JSON.stringify(danglingComponentLinks)}`
  );

  // Independent literal-path sweep — the load-bearing check for every site (incl. the
  // flat ingredients[] alias, alternatives[] recursion, both onBreak paths, catalysts).
  const sites = collectComponentRefSites(copy);
  assert.ok(sites.length >= 20, 'the sweep visits every enumerated reference site');
  for (const { path, value } of sites) {
    assert.ok(!oldIdSet.has(value), `enumerated site ${path} still holds old id ${value}`);
    assert.ok(
      newIdSet.has(value),
      `enumerated site ${path} value ${value} is not a live component`
    );
  }
});

// ---------------------------------------------------------------------------
// (e) keep-mode untouched
// ---------------------------------------------------------------------------

test('(e) keep-mode leaves every component id and reference byte-identical', () => {
  const keep = prepareForImport(buildCopyImportComponentFixture(), 'keep');

  assert.deepEqual(
    keep.system.components.map((c) => c.id),
    OLD_COMPONENT_IDS,
    'keep mode preserves component ids'
  );
  for (const { path, value } of collectComponentRefSites(keep)) {
    assert.ok(
      OLD_COMPONENT_IDS.includes(value) || value === COLLIDING_NON_COMPONENT_ID,
      `keep-mode site ${path} must retain its original value`
    );
  }
});

// ---------------------------------------------------------------------------
// (f) Key-aware NEGATIVE — no blanket string-replace
// ---------------------------------------------------------------------------

test('(f) a non-reference value equal to a component id is NOT rewritten', () => {
  const copy = copyImport();

  // recipeIds[] (book membership) is NOT a component reference: it must survive verbatim
  // even though its value equals a pre-regeneration component id.
  assert.deepEqual(
    copy.system.recipeItemDefinitions[0].recipeIds,
    [COLLIDING_NON_COMPONENT_ID],
    'recipeIds entry equal to an old component id must be untouched'
  );

  // A salvage-GROUP id equal to a pre-regeneration component id must survive verbatim.
  assert.equal(
    copy.system.components[0].salvage.resultGroups[0].id,
    COLLIDING_NON_COMPONENT_ID,
    'salvage-group id equal to an old component id must be untouched'
  );

  // A blanket string-replace would have rewritten these to the regenerated id.
  const regeneratedOre = copy.system.components[0].id;
  assert.notEqual(copy.system.recipeItemDefinitions[0].recipeIds[0], regeneratedOre);
  assert.notEqual(copy.system.components[0].salvage.resultGroups[0].id, regeneratedOre);
});

// ---------------------------------------------------------------------------
// Scope pin — the transform lives on the real prepareForImport('copy') path
// ---------------------------------------------------------------------------

test('scope pin: rebindCopyComponentIds is the exported copy transform on importReferenceResolver', () => {
  // A refactor that moves the remap out of importReferenceResolver (or drops the
  // export) breaks this pin, and the acceptance cases above pin it to the real
  // prepareForImport('copy') call site.
  assert.equal(
    typeof rebindCopyComponentIds,
    'function',
    'copy component-id transform is exported'
  );

  // keep-mode never regenerates; copy-mode does — anchoring behaviour to the call site.
  const keep = prepareForImport(buildCopyImportComponentFixture(), 'keep');
  const copy = copyImport();
  assert.equal(keep.system.components[0].id, 'comp-ore', 'keep mode preserves the authored id');
  assert.notEqual(copy.system.components[0].id, 'comp-ore', 'copy mode regenerates the id');
});
