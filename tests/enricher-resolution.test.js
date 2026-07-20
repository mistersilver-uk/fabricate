/**
 * Issue 800 — write-time RESOLUTION of source descriptions.
 *
 * Three concerns, deliberately in one file because they are one mechanism:
 *
 *  1. The option bag `enrichToHtml` passes to Foundry, asserted against the REAL
 *     implementation with `enrichHTML` stubbed. Asserting against a seam fake would
 *     test the fake, and would pass while a leak was live.
 *  2. `primeEnricherCache`'s real pack grouping — a call-count assertion on the seam
 *     alone proves only that a seam was called.
 *  3. The headline behaviour, bound at the COMPOSITION (`_buildComponentSourceSnapshot`
 *     and `refreshComponentMetadataForUpdatedItem`), not at the helper: a LABEL-LESS
 *     `@UUID[…]` becomes the referenced document's real NAME.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { setupDOM, teardownDOM } from './helpers/svelte-dom.js';

let _idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `id-${++_idCounter}`,
    getProperty: (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj) ?? undefined,
  },
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.fromUuid = async () => null;
globalThis.game = { user: { isGM: true }, items: [], packs: [], actors: [] };

const { enrichToHtml, primeEnricherCache } = await import('../src/ui/svelte/util/foundryBridge.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const {
  REPORTER_ENRICHER_DESCRIPTION,
  REPORTER_RESOLVED_EXPECTED,
  makeFakeEnricher,
} = await import('./helpers/enricherDescriptionFixtures.js');

// ---------------------------------------------------------------------------
// 1. The option bag — REAL enrichToHtml, stubbed enrichHTML
// ---------------------------------------------------------------------------

/**
 * Install a capturing `enrichHTML` on the V13 accessor path and return the captured
 * calls. The real enricher is never invoked, so this runs headlessly.
 */
function captureEnrichOptions({ onImplementation = true } = {}) {
  const calls = [];
  const stub = async (text, options) => {
    calls.push({ text, options });
    return `<enriched>${text}</enriched>`;
  };
  const TextEditor = onImplementation ? { implementation: { enrichHTML: stub } } : { enrichHTML: stub };
  globalThis.foundry.applications = { ux: { TextEditor } };
  return calls;
}

function clearEnrichStub() {
  delete globalThis.foundry.applications;
}

test('enrichToHtml passes secrets:false EXPLICITLY', async (t) => {
  const calls = captureEnrichOptions();
  t.after(clearEnrichStub);

  await enrichToHtml('@UUID[Item.abc]');

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].options.secrets,
    false,
    'PF2e does `options.secrets ??= game.user.isGM`. We enrich AS GM and store the ' +
      'result for PLAYERS, so an omitted key bakes a GM-only secret block into ' +
      'player-visible text. The explicit `false` is what defeats the `??=`.'
  );
});

test('enrichToHtml does NOT pass processVisibility', async (t) => {
  const calls = captureEnrichOptions();
  t.after(clearEnrichStub);

  await enrichToHtml('@UUID[Item.abc]');

  assert.ok(
    !('processVisibility' in calls[0].options),
    'Do not re-add `processVisibility: false` — it is the intuitive fix and it is ' +
      'wrong in DIRECTION. PF2e removes [data-visibility="gm"] only for NON-GM users, ' +
      'and we enrich as a GM, so `false` never closes the GM leak while additionally ' +
      're-opening the unconditional [data-visibility="none"] removal the default ' +
      'performs for free. The leak is closed by the audience-independent attribute ' +
      'scrub in plainTextDescription instead.'
  );
});

test('enrichToHtml pins the rest of the option bag', async (t) => {
  const calls = captureEnrichOptions();
  t.after(clearEnrichStub);

  const relativeTo = { uuid: 'Item.source' };
  await enrichToHtml('@UUID[Item.abc]', { relativeTo });

  const { options } = calls[0];
  assert.equal(options.documents, true, 'documents:true is the point — it names the referent');
  assert.equal(options.custom, true, 'custom:true runs CONFIG.TextEditor.enrichers');
  assert.equal(
    options.rolls,
    false,
    'rolls:true EAGERLY evaluates a command-less [[1d6]] and freezes a literal number'
  );
  assert.equal(options.embeds, false, 'embeds:true inlines an entire journal page');
  assert.equal(options.links, false);
  assert.equal(options.relativeTo, relativeTo, 'relative UUIDs resolve against the source doc');
});

test('enrichToHtml falls back from .implementation to the base TextEditor', async (t) => {
  const calls = captureEnrichOptions({ onImplementation: false });
  t.after(clearEnrichStub);

  const out = await enrichToHtml('hello');

  assert.equal(calls.length, 1, 'the base class is used when no implementation is registered');
  assert.equal(out, '<enriched>hello</enriched>');
});

test('enrichToHtml degrades to the raw text when no enricher is reachable', async () => {
  assert.equal(await enrichToHtml('@UUID[Item.abc]'), '@UUID[Item.abc]');
  assert.equal(await enrichToHtml(''), '');
  assert.equal(await enrichToHtml(null), '');
});

// ---------------------------------------------------------------------------
// 2. primeEnricherCache — the REAL pack grouping
// ---------------------------------------------------------------------------

/**
 * Fake compendium packs plus a `parseUuid` that resolves `Compendium.<packId>.Item.<id>`
 * against them, mirroring what Foundry's own parser yields for a compendium uuid.
 */
function installFakePacks(packIds, { cachedIds = new Set() } = {}) {
  const packs = new Map();
  for (const packId of packIds) {
    packs.set(packId, {
      id: packId,
      queries: [],
      get: (id) => (cachedIds.has(id) ? { id } : undefined),
      getDocuments(query) {
        this.queries.push(query);
        return Promise.resolve([]);
      },
    });
  }
  globalThis.foundry.utils.parseUuid = (uuid) => {
    const match = /^Compendium\.(?<pack>[^.]+\.[^.]+)\.Item\.(?<id>.+)$/.exec(uuid);
    if (!match) return {};
    return { collection: packs.get(match.groups.pack), primaryId: match.groups.id };
  };
  return packs;
}

test('primeEnricherCache issues ONE getDocuments per pack, not one per description', async (t) => {
  const packs = installFakePacks(['dnd5e.equipment24', 'dnd5e.items']);
  t.after(() => delete globalThis.foundry.utils.parseUuid);

  await primeEnricherCache([
    '@UUID[Compendium.dnd5e.equipment24.Item.acid]{Acid}',
    '@UUID[Compendium.dnd5e.equipment24.Item.oil]',
    '@UUID[Compendium.dnd5e.equipment24.Item.paper]{Paper}',
    'Bare reference Compendium.dnd5e.items.Item.rope in prose',
  ]);

  assert.equal(packs.get('dnd5e.equipment24').queries.length, 1, 'M packs, not N descriptions');
  assert.deepEqual(packs.get('dnd5e.equipment24').queries[0], {
    _id__in: ['acid', 'oil', 'paper'],
  });
  assert.equal(packs.get('dnd5e.items').queries.length, 1);
  assert.deepEqual(packs.get('dnd5e.items').queries[0], { _id__in: ['rope'] });
});

test('primeEnricherCache issues ZERO queries for ids already in the pack cache', async (t) => {
  const packs = installFakePacks(['dnd5e.equipment24'], { cachedIds: new Set(['acid', 'oil']) });
  t.after(() => delete globalThis.foundry.utils.parseUuid);

  await primeEnricherCache([
    '@UUID[Compendium.dnd5e.equipment24.Item.acid]{Acid}',
    '@UUID[Compendium.dnd5e.equipment24.Item.oil]',
  ]);

  assert.equal(packs.get('dnd5e.equipment24').queries.length, 0);
});

test('primeEnricherCache no-ops safely without Foundry, and stays linear on adversarial input', async () => {
  await primeEnricherCache(['@UUID[Compendium.dnd5e.items.Item.acid]']);
  await primeEnricherCache(null);

  // The priming regex is subject to the same bounded-quantifier rule as the roll
  // family: an unterminated run must not force a quadratic re-scan.
  const start = performance.now();
  await primeEnricherCache(['@UUID['.repeat(100000), '['.repeat(100000)]);
  const elapsedMs = performance.now() - start;
  assert.ok(elapsedMs < 5000, `priming took ${elapsedMs.toFixed(0)}ms — expected linear`);
});

// ---------------------------------------------------------------------------
// 3. The headline behaviour, bound at the COMPOSITION
// ---------------------------------------------------------------------------

const SOURCE_ITEM = Object.freeze({
  uuid: 'Compendium.dnd5e.equipment24.Item.supplies',
  name: "Alchemist's Supplies",
  img: 'icons/tools.webp',
  system: { description: { value: REPORTER_ENRICHER_DESCRIPTION } },
});

function makeResolvingManager() {
  return new CraftingSystemManager(
    { getRecipes: () => [] },
    { enrichToHtml: makeFakeEnricher() }
  );
}

test('_buildComponentSourceSnapshot resolves a LABEL-LESS @UUID to the document name', async (t) => {
  // With a DOM present, so this exercises the production strip path (parsed tree +
  // privacy scrub + broken-anchor pass), not just the headless regex fallback.
  setupDOM();
  t.after(teardownDOM);
  const manager = makeResolvingManager();

  const snapshot = await manager._buildComponentSourceSnapshot(SOURCE_ITEM.uuid, SOURCE_ITEM, null, {
    currentUuid: SOURCE_ITEM.uuid,
    canonicalUuid: SOURCE_ITEM.uuid,
    aliasItemUuids: [],
    sourceFallbacks: [],
    references: [],
  });

  assert.equal(
    snapshot.description,
    REPORTER_RESOLVED_EXPECTED,
    'the label-less @UUID must render as "Component Pouch" — the referenced ' +
      "document's real name. Removing the `await this._enrichToHtml(…)` call from " +
      '_extractSourceDescription leaves it as raw directive text and fails here.'
  );
  assert.ok(!/@[A-Za-z]+\[/.test(snapshot.description), 'no raw directive survives');
});

test('_buildRecipeItemSourceSnapshot resolves through the same path', async () => {
  const manager = makeResolvingManager();
  globalThis.fromUuid = async () => null;

  const snapshot = await manager._buildRecipeItemSourceSnapshot(SOURCE_ITEM.uuid, SOURCE_ITEM);

  assert.equal(snapshot.description, REPORTER_RESOLVED_EXPECTED);
});

test('refreshComponentMetadataForUpdatedItem resolves the edited item description', async () => {
  const manager = makeResolvingManager();
  manager.save = async () => {};
  manager._notifySystemsChanged = () => {};
  const component = {
    id: 'comp-1',
    name: "Alchemist's Supplies",
    registeredItemUuid: SOURCE_ITEM.uuid,
    originItemUuid: SOURCE_ITEM.uuid,
    aliasItemUuids: [],
    description: 'stale',
  };
  manager.systems = new Map([['sys1', { id: 'sys1', components: [component] }]]);

  const result = await manager.refreshComponentMetadataForUpdatedItem(SOURCE_ITEM, {
    system: { description: { value: REPORTER_ENRICHER_DESCRIPTION } },
  });

  assert.equal(result.updated, 1);
  assert.equal(
    component.description,
    REPORTER_RESOLVED_EXPECTED,
    'item-sync must RESOLVE too — otherwise an edit to the source item ' +
      're-propagates raw directives over a description the GM already repaired'
  );
});

test('the pass-through default seam leaves headless behaviour unchanged', async () => {
  // The ~87 single-argument construction sites keep working: with no seam supplied,
  // resolution is a no-op and the text is merely normalized.
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const description = await manager._extractSourceDescription({
    system: { description: { value: 'Plain prose, nothing to resolve.' } },
  });
  assert.equal(description, 'Plain prose, nothing to resolve.');
});
