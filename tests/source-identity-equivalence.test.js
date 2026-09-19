/**
 * Issue 1699 — the source-identity extraction must be INVISIBLE. This suite drives a real
 * `CraftingSystemManager` through every source-identity entry point and pins the WRITE JOURNALS,
 * the SEAM CALL LOGS and the returned summaries against a checked-in golden. It lands green
 * against the unchanged manager and is byte-frozen thereafter.
 */

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';

import { observeScenario, SCENARIOS } from './helpers/sourceIdentityCorpus.js';

const GOLDEN_URL = new URL('./fixtures/sourceIdentity.golden.json', import.meta.url);
const REGENERATE = process.env.UPDATE_SOURCE_IDENTITY_GOLDEN === '1';

/** Every scenario's two passes, keyed by scenario id. */
const observed = {};
let golden;

/** Total journal entries across every document a pass touched. */
function writeCount(pass) {
  return Object.values(pass.journals).reduce((total, entries) => total + entries.length, 0);
}

before(async () => {
  for (const scenario of SCENARIOS) observed[scenario.id] = await observeScenario(scenario);
  if (REGENERATE) {
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(observed)),
      observed,
      'an observable that JSON cannot round-trip must be projected before it is recorded'
    );
    writeFileSync(GOLDEN_URL, `${JSON.stringify(observed, null, 2)}\n`);
  }
  golden = JSON.parse(readFileSync(GOLDEN_URL, 'utf8'));
});

describe('source-identity equivalence — the recorded observables', () => {
  it('records exactly the scenarios the matrix declares', () => {
    assert.deepStrictEqual(
      Object.keys(golden).sort(),
      SCENARIOS.map((scenario) => scenario.id).sort(),
      'a scenario was added or dropped; regenerate the golden deliberately rather than editing it'
    );
  });

  for (const scenario of SCENARIOS) {
    it(`${scenario.id} — writes, seam calls and result are unchanged`, () => {
      assert.deepStrictEqual(
        observed[scenario.id],
        golden[scenario.id],
        `${scenario.id} no longer produces the recorded writes, seam calls and summary`
      );
    });
  }

  it('is idempotent: a second pass over the same world performs no writes', () => {
    const rewriting = SCENARIOS.map((scenario) => scenario.id).filter(
      (id) => writeCount(observed[id].second) > 0
    );
    assert.deepStrictEqual(
      rewriting,
      [],
      'a conditional write became unconditional — the second pass must be silent'
    );
  });

  it('is not vacuous: the corpus provokes a substantial number of writes', () => {
    const counts = SCENARIOS.map((scenario) => writeCount(observed[scenario.id].first));
    const total = counts.reduce((sum, count) => sum + count, 0);
    const writing = counts.filter((count) => count > 0).length;
    assert.ok(total >= 15, `the corpus performs only ${total} writes; that cannot police this code`);
    assert.ok(writing >= 8, `only ${writing} scenarios write; the no-write rows cannot stand alone`);
  });
});

describe('source-identity equivalence — the named observables', () => {
  it('refuses to stamp a source living in an UNLOCKED pack, called directly', () => {
    const pass = observed['stamp/unlocked-pack-source-directly'].first;
    assert.equal(writeCount(pass), 0, 'the compendium-source guard refuses a packed source');
  });

  it('DOES auto-stamp that same unlocked-pack source, once per arm', () => {
    const pass = observed['autostamp/unlocked-pack-source'].first;
    assert.equal(writeCount(pass), 3, 'one write per auto-stamp arm');
    for (const summary of Object.values(pass.result)) {
      assert.equal(summary.stamped, 1, 'each arm stamped exactly once');
      assert.equal(summary.skippedLocked, 0, 'the pack is unlocked');
    }
  });

  it('skips a locked pack and counts it, rather than writing into it', () => {
    const pass = observed['autostamp/locked-pack-source'].first;
    assert.equal(writeCount(pass), 0);
    for (const summary of Object.values(pass.result)) assert.equal(summary.skippedLocked, 1);
  });

  it('stamps a registered-uuid-only component and tool, and skips the recipe item', () => {
    const { result } = observed['autostamp/registered-uuid-only'].first;
    assert.equal(result.recipeItems.scanned, 0, 'the recipe-item arm reads originItemUuid alone');
    assert.equal(result.components.stamped, 1, 'the component arm falls back to registeredItemUuid');
    assert.equal(result.tools.stamped, 1, 'and so does the tool arm');
  });

  it('leaves a flagged owned copy authoritative even when its definition cannot be resolved', () => {
    const pass = observed['repair/owned-copy-flagged-for-an-unresolvable-definition'].first;
    assert.equal(writeCount(pass), 0, 'a flagged owned copy is never re-resolved');
    assert.equal(pass.result.cleared, 0, 'and its flag is never cleared');
  });

  it('refuses to re-point an owned copy whose name matches two definitions', () => {
    const pass = observed['repair/owned-copy-whose-name-is-ambiguous'].first;
    assert.equal(pass.result.skippedAmbiguous, 1);
    assert.equal(writeCount(pass), 0, "an 'ambiguous' name resolves to nothing");
  });

  it('never keys a CLONE source on the original it was duplicated from', () => {
    const pass = observed['repair/self-corrupting-clone-source'].first;
    assert.deepStrictEqual(pass.journals['Item.embercap-copy'], [], 'the clone is left alone');
    assert.equal(pass.result.stamped, 1, 'the original is still stamped');
  });

  it('asks the enricher for the source document as `relativeTo`', () => {
    const { calls } = observed['descriptions/label-less-uuid-link'].first;
    assert.deepStrictEqual(calls.enrichToHtml, [
      ['@UUID[Compendium.dnd5e.items.Item.pouch]', { relativeTo: { document: 'Item.supplies' } }],
    ]);
  });

  it('resolves that label-less reference to the linked document name', () => {
    assert.equal(observed['descriptions/label-less-uuid-link'].first.result, 'Component Pouch');
  });

  it('primes the enricher cache once per repair, from the raw source text', () => {
    const pass = observed['repair/definition-sourced-from-a-locked-pack'].first;
    assert.deepStrictEqual(pass.calls.primeEnricherCache, [
      [['@UUID[Compendium.dnd5e.equipment24.Item.pouch]']],
    ]);
    assert.equal(pass.result.descriptions.refreshed, 1);
    assert.equal(pass.persistence.save, 1, 'a refreshed description is persisted');
  });

  it('never lets a description-less source wipe stored text', () => {
    const pass = observed['repair/definition-whose-source-carries-no-description'].first;
    assert.equal(pass.result.descriptions.skippedEmpty, 1);
    assert.equal(pass.persistence.save, 0, 'nothing was persisted');
  });

  it('separates an unresolvable source from an empty one', () => {
    const pass = observed['repair/definition-whose-source-is-gone'].first;
    assert.equal(pass.result.descriptions.skippedUnresolved, 1);
    assert.equal(pass.result.descriptions.skippedEmpty, 0);
  });

  it('passes the source document to the import-source resolver, not just its uuid', () => {
    const { calls } = observed['snapshots/broken-compendium-source'].first;
    assert.deepStrictEqual(calls.resolveImportedComponentSourceData, [
      ['Item.relic-src', { document: 'Item.relic-src' }],
      ['Item.relic-src', { document: 'Item.relic-src' }],
      ['Item.relic-src', { document: 'Item.relic-src' }],
    ]);
  });
});
