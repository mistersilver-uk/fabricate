/**
 * Issue 800 — the GM-only startup DETECTOR. For a world whose stored descriptions predate
 * write-time resolution there is otherwise zero signal: the GM sees raw text and has no reason to
 * connect it to a settings button.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withFabricateLifecycleReplay } from './helpers/extension-composition-harness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

globalThis.foundry = { utils: { getProperty: () => undefined } };

const { countUnresolvedDirectiveDescriptions, notifyUnresolvedItemDescriptions, runItemDataRepair } =
  await import('../src/config/repairItemData.js');
const { REPORTER_ENRICHER_DESCRIPTION, REPORTER_RESOLVED_EXPECTED } = await import(
  './helpers/enricherDescriptionFixtures.js'
);

function installWorld({ isGM = true, systems = [] } = {}) {
  const infos = [];
  globalThis.ui = { notifications: { info: (msg) => infos.push(msg), warn() {}, error() {} } };
  globalThis.game = {
    user: { isGM },
    i18n: { format: (key, data) => `${key}:${data.count}`, localize: (key) => key },
    fabricate: { getCraftingSystemManager: () => ({ getSystems: () => systems }) },
  };
  return infos;
}

// REPORTER_ENRICHER_DESCRIPTION carries a LABEL-LESS `@UUID[…]`, so it is visibly
// broken and counts. A labelled directive does not — see the next test.
const RAW_SYSTEM = {
  id: 'sys1',
  components: [
    { id: 'c1', description: REPORTER_ENRICHER_DESCRIPTION },
    { id: 'c2', description: REPORTER_RESOLVED_EXPECTED },
  ],
  recipeItemDefinitions: [{ id: 'd1', description: '@UUID[Compendium.dnd5e.items.Item.oil]' }],
  // Tools carry no description and are excluded from the description leg entirely.
  tools: [{ id: 't1', description: REPORTER_ENRICHER_DESCRIPTION }],
};

test('counts components and recipe-item definitions carrying raw directives, excluding tools', () => {
  assert.equal(countUnresolvedDirectiveDescriptions([RAW_SYSTEM]), 2);
  assert.equal(countUnresolvedDirectiveDescriptions([]), 0);
  assert.equal(
    countUnresolvedDirectiveDescriptions([
      { id: 'sys2', components: [{ id: 'c', description: REPORTER_RESOLVED_EXPECTED }] },
    ]),
    0
  );
});

test('does NOT count a fully LABELLED description — it already reads cleanly', () => {
  // The notice must not claim a defect the GM can disprove by looking.
  const labelledOnly = [
    {
      id: 'sys1',
      components: [{ id: 'c1', description: '@UUID[Compendium.dnd5e.items.Item.acid]{Acid}' }],
      recipeItemDefinitions: [{ id: 'd1', description: '&Reference[prone]{Prone}' }],
    },
  ];
  assert.equal(countUnresolvedDirectiveDescriptions(labelledOnly), 0);

  const infos = installWorld({ systems: labelledOnly });
  assert.equal(notifyUnresolvedItemDescriptions(), 0);
  assert.equal(infos.length, 0, 'no notice for a world that already reads cleanly');
});

test('emits exactly ONE GM notice naming the settings path, and none once repaired', () => {
  const infos = installWorld({ systems: [RAW_SYSTEM] });

  const count = notifyUnresolvedItemDescriptions();

  assert.equal(count, 2);
  assert.equal(infos.length, 1, 'exactly one notice');
  assert.match(infos[0], /RepairItemData\.UnresolvedDetected/);

  // After a successful repair the scan finds nothing, so the notice self-clears —
  // which is why no "already notified" flag is needed.
  const repaired = installWorld({
    systems: [{ id: 'sys1', components: [{ id: 'c1', description: REPORTER_RESOLVED_EXPECTED }] }],
  });
  assert.equal(notifyUnresolvedItemDescriptions(), 0);
  assert.equal(repaired.length, 0);
});

test('stays silent for a non-GM', () => {
  const infos = installWorld({ isGM: false, systems: [RAW_SYSTEM] });

  assert.equal(notifyUnresolvedItemDescriptions(), 0);
  assert.equal(infos.length, 0);
});

// The other half of the loop: what the repair TELLS the GM afterwards.

/** Install a world whose repair returns `descriptions`, capturing every toast by level. */
function installRepairWorld(descriptions) {
  const toasts = { info: [], warn: [], error: [] };
  globalThis.ui = {
    notifications: {
      info: (msg) => toasts.info.push(msg),
      warn: (msg) => toasts.warn.push(msg),
      error: (msg) => toasts.error.push(msg),
    },
  };
  globalThis.game = {
    user: { isGM: true },
    i18n: { format: (key) => key, localize: (key) => key },
    fabricate: {
      getCraftingSystemManager: () => ({
        repairItemData: async () => ({
          scanned: 0,
          stamped: 0,
          stripped: 0,
          cleared: 0,
          repointed: 0,
          skippedAmbiguous: 0,
          skippedLocked: 0,
          descriptions,
        }),
      }),
    },
  };
  return toasts;
}

test('the repair reports the description outcome even when NOTHING could be refreshed', async () => {
  // The nag loop's exit. A GM sent here by the startup notice whose definitions all land in
  // `skipped` — the uninstalled-module case — would otherwise be told nothing about descriptions at
  // all, learn nothing, and get the same notice at next login, forever.
  const toasts = installRepairWorld({
    refreshed: 0,
    unchanged: 0,
    skipped: 3,
    skippedUnresolved: 2,
    skippedEmpty: 1,
  });

  await runItemDataRepair();

  assert.ok(
    toasts.warn.some((msg) => msg.includes('DescriptionsNoneRefreshed')),
    'a zero-refresh run must still say what happened to the descriptions'
  );
  assert.ok(!toasts.info.some((msg) => msg.includes('DescriptionsRefreshed')));
});

test('the repair reports the success line when descriptions WERE refreshed', async () => {
  const toasts = installRepairWorld({
    refreshed: 2,
    unchanged: 1,
    skipped: 0,
    skippedUnresolved: 0,
    skippedEmpty: 0,
  });

  await runItemDataRepair();

  assert.ok(toasts.info.some((msg) => msg.includes('DescriptionsRefreshed')));
  assert.ok(!toasts.warn.some((msg) => msg.includes('DescriptionsNoneRefreshed')));
});

test('the repair stays silent about descriptions when nothing was attempted', async () => {
  const toasts = installRepairWorld({
    refreshed: 0,
    unchanged: 4,
    skipped: 0,
    skippedUnresolved: 0,
    skippedEmpty: 0,
  });

  await runItemDataRepair();

  assert.ok(!toasts.warn.some((msg) => msg.includes('Descriptions')));
  assert.ok(!toasts.info.some((msg) => msg.includes('Descriptions')));
});

test('never rewrites the descriptions it inspects', () => {
  const system = {
    id: 'sys1',
    components: [{ id: 'c1', description: REPORTER_ENRICHER_DESCRIPTION }],
  };
  installWorld({ systems: [system] });

  notifyUnresolvedItemDescriptions();

  assert.equal(
    system.components[0].description,
    REPORTER_ENRICHER_DESCRIPTION,
    'a DETECTOR, not a flattener — it must not touch the rendering path'
  );
});

// Production wiring. Both seams default to PASS-THROUGHS, so deleting the wiring reverts the entire
// feature in production while every unit test — which constructs its own manager with its own fakes
// — stays green. So the composed manager is asked, and the `ready` sequence is run, in a real boot.

test('the composed manager enriches through Foundry, and ready tells the GM once', { timeout: 300000 }, async () => {
  await withFabricateLifecycleReplay(async ({ ready, loadModule }) => {
    const { default: facade } = await loadModule('/src/main.js');
    const { countUnresolvedDirectiveDescriptions } = await loadModule('/src/config/repairItemData.js');
    const { foundry } = globalThis;
    const editor = foundry.applications.ux.TextEditor.implementation;
    const { enrichHTML } = editor;
    const { parseUuid } = foundry.utils;
    const enriched = [];
    const fetched = [];
    const pack = { get: () => null, getDocuments: async (query) => fetched.push(query) };
    editor.enrichHTML = async (text, options) => {
      enriched.push([text, options.secrets, options.rolls]);
      return '<p>enriched</p>';
    };
    foundry.utils.parseUuid = () => ({ collection: pack, primaryId: 'probe-id' });
    try {
      const manager = facade.craftingSystemManager;
      assert.equal(await manager._enrichToHtml('@UUID[Item.x]', {}), '<p>enriched</p>');
      assert.deepEqual(enriched, [['@UUID[Item.x]', false, false]], 'as GM, stored for players');
      await manager._primeEnricherCache(['@UUID[Compendium.probe.items.Item.probe-id]']);
      assert.deepEqual(fetched, [{ _id__in: ['probe-id'] }], 'one fetch primes the pack');
    } finally {
      editor.enrichHTML = enrichHTML;
      foundry.utils.parseUuid = parseUuid;
    }

    const count = countUnresolvedDirectiveDescriptions(facade.craftingSystemManager.getSystems());
    assert.ok(count > 0, 'the premise: the lab world holds a label-less content link');
    const lang = JSON.parse(readFileSync(resolve(__dirname, '../lang/en.json'), 'utf8'));
    const expected = lang.FABRICATE.Settings.RepairItemData.UnresolvedDetected.replace(
      '{count}',
      String(count)
    );
    const infos = [];
    const { info } = globalThis.ui.notifications;
    globalThis.ui.notifications.info = (message) => infos.push(message);
    try {
      await ready();
    } finally {
      globalThis.ui.notifications.info = info;
    }
    assert.deepEqual(
      infos.filter((message) => message === expected),
      [expected],
      'nothing else gates this call site: without it an un-repaired world gets no cue at all'
    );
  });
});
