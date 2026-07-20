/**
 * Issue 800 — the GM-only startup DETECTOR.
 *
 * For a world whose stored descriptions predate write-time resolution there is
 * otherwise zero signal: the GM sees raw text and has no reason to connect it to a
 * settings button. This is a detector, NOT a flattener — it must never rewrite
 * displayed text, and it self-clears once the repair has run.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = { utils: { getProperty: () => undefined } };

const { countUnresolvedDirectiveDescriptions, notifyUnresolvedItemDescriptions } = await import(
  '../src/config/repairItemData.js'
);
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

const RAW_SYSTEM = {
  id: 'sys1',
  components: [
    { id: 'c1', description: REPORTER_ENRICHER_DESCRIPTION },
    { id: 'c2', description: REPORTER_RESOLVED_EXPECTED },
  ],
  recipeItemDefinitions: [{ id: 'd1', description: '&Reference[prone]{Prone}' }],
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
