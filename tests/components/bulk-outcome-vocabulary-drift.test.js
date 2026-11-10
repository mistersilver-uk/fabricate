/**
 * The bulk salvage outcome vocabulary has two hand-kept mirrors: the aggregate chat card's copy
 * keys and the bulk report's row visuals. Every outcome `BulkSalvageService` can report must reach
 * its own copy key on the card and its own visual in the report, never the report's `error`
 * fallback; the vocabulary is read from the service's own tally, so a new outcome fails here first.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { BulkSalvageService } from '../../src/systems/BulkSalvageService.js';
import {
  BULK_SALVAGE_CHAT_KEYS,
  buildBulkSalvageChatContent,
} from '../../src/ui/presenters/BulkSalvageChatCard.js';
import { cardSubject, craftingSystemLookup } from '../helpers/bulkSalvageFixtures.js';
import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import {
  MARKS_AND_NOTICES_COMPILED_MODULES,
  PLAYER_APP_COMPILED_MODULES,
  STATUS_TONE_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

/** Every outcome the service tallies, read from an empty run's always-total `counts`. */
async function serviceOutcomes() {
  const service = new BulkSalvageService({
    salvage: async () => ({ success: true, results: [] }),
    getCraftingSystem: craftingSystemLookup([]),
    postChatMessage: async () => null,
  });
  const { counts } = await service.run({ targets: [], interactive: false });
  return Object.keys(counts).filter((key) => key !== 'total');
}

describe('the aggregate chat card names every service outcome', () => {
  const copyKeys = new Set(Object.values(BULK_SALVAGE_CHAT_KEYS));

  it('renders a known outcome copy key for each outcome', async () => {
    const outcomes = await serviceOutcomes();
    assert.ok(outcomes.includes('refused'), 'the vocabulary was read, not assumed');
    for (const outcome of outcomes) {
      const keys = [];
      const html = buildBulkSalvageChatContent(
        {
          status: 'mixed',
          actorNames: ['Akra'],
          counts: { total: 1 },
          subjects: [cardSubject({ outcome })],
        },
        (key) => {
          keys.push(key);
          return key;
        }
      );
      const outcomeKeys = keys.filter((key) => copyKeys.has(key) && /Outcome/u.test(key));
      assert.equal(outcomeKeys.length, 1, `${outcome} has its own copy key`);
      assert.ok(html.includes(outcomeKeys[0]), `${outcome}'s copy is rendered`);
    }
  });

  it('gives a definite refusal its own copy', () => {
    const keys = [];
    buildBulkSalvageChatContent(
      {
        status: 'failed',
        actorNames: ['Akra'],
        counts: { total: 1 },
        subjects: [cardSubject({ outcome: 'refused' })],
      },
      (key) => {
        keys.push(key);
        return key;
      }
    );
    assert.ok(keys.includes('FABRICATE.Chat.BulkSalvageOutcomeRefused'));
  });
});

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-bulk-outcome-drift-',
  rawModules: [
    ...STATUS_TONE_RAW_MODULES,
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/ui/svelte/util/craftingArtResolution.js',
    'src/ui/svelte/util/essenceTint.js',
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    'src/ui/svelte/util/appLocalizer.js',
  ],
  compiledModules: [
    ...PLAYER_APP_COMPILED_MODULES,
    ...MARKS_AND_NOTICES_COMPILED_MODULES,
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/apps/inventory/bulk/InventoryBulkRow.svelte',
    'src/ui/svelte/apps/inventory/bulk/InventoryBulkSection.svelte',
    'src/ui/svelte/apps/inventory/bulk/InventoryBulkReport.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/inventory/bulk/InventoryBulkReport.svelte',
});

describe('the bulk report draws every service outcome', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  const row = (outcome) => ({
    key: `sys:${outcome}`,
    name: outcome,
    img: null,
    outcome,
    results: outcome === 'succeeded' ? [{ name: 'Shard', img: null, quantity: 1 }] : [],
  });
  const mountReport = (outcomes) =>
    harness.mount({
      report: { mode: 'salvage', cancelled: false, counts: null, items: outcomes.map(row) },
    });
  const subject = (root, key) => root.querySelector(`[data-inventory-bulk-subject="${key}"]`);
  const chipOf = (node) => node.querySelector('.manager-chip');
  const toneOf = (node) => [...chipOf(node).classList].find((name) => name.startsWith('is-'));

  it('maps each outcome to its own visual, never the error fallback', async () => {
    const outcomes = await serviceOutcomes();
    const root = await mountReport(outcomes);
    for (const outcome of outcomes) {
      assert.ok(Boolean(subject(root, outcome)), `${outcome} draws its own visual`);
    }
  });

  it('draws a refusal as not consumed, apart from a misconfiguration', async () => {
    const root = await mountReport(['refused', 'misconfigured']);
    const refused = subject(root, 'refused');
    const misconfigured = subject(root, 'misconfigured');
    assert.equal(chipOf(refused).textContent.trim(), 'FABRICATE.App.Inventory.Bulk.OutcomeRefused');
    assert.equal(toneOf(refused), toneOf(misconfigured), 'the same non-danger tone');
    assert.notEqual(
      chipOf(refused).querySelector('i').className,
      chipOf(misconfigured).querySelector('i').className,
      'a shared tone differs on its glyph'
    );
  });

  it('counts a refusal as unresolved, not empty-handed', async () => {
    const root = await mountReport(['refused', 'succeeded']);
    const banner = root.querySelector('[data-inventory-bulk-banner]');
    assert.equal(banner.getAttribute('data-inventory-bulk-banner'), 'mixed');
    assert.match(banner.textContent, /"succeeded":1,"failed":0,"other":1/u);
    assert.ok(!root.querySelector('[data-inventory-bulk-lost]'), 'the item is still in the pack');
  });
});
