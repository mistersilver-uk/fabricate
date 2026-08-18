/**
 * The component reclaimer and the nested-residual detector — the two settled-boot questions,
 * which are NOT mirror images of each other (issue 1212).
 *
 * Acceptance items 11 and 18.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SETTING_KEYS } from '../src/config/settings.js';
import {
  detectSurvivingNestedComponents,
  reclaimOrphanedComponentRecords,
  reconcileComponentStorageLayout,
} from '../src/systems/componentStorageConversion.js';

import {
  component,
  envelopesFor,
  installComponentStorageWorld,
  PER_RECORD,
  SINGLE_ARRAY,
  system,
} from './helpers/componentStorageWorld.js';

const { world } = installComponentStorageWorld();

// ---------------------------------------------------------------------------
// 18. The reclaimer refuses undescribed documents, per document, scoped by system
// ---------------------------------------------------------------------------

describe('the reclaimer refuses what the settled container does not describe', () => {
  it('(a) nothing described: reclaims 0, keeps all three, reports both counts', async () => {
    // *Reddens when:* the reclaimer is unconditional — it then deletes the one shape that can
    // hold a record the settled corpus lacks.
    const fixture = await world({
      layout: SINGLE_ARRAY,
      target: SINGLE_ARRAY,
      systems: [system('sysA', [])],
      records: envelopesFor('sysA', [component('c1'), component('c2'), component('c3')]),
    });

    const report = await reconcileComponentStorageLayout(fixture.seams);

    assert.equal(report.action, 'reclaim-refused');
    assert.equal(report.reclaimed, 0);
    assert.equal(report.kept, 3);
    assert.equal(report.records, 0);
    assert.deepEqual(fixture.recordKeys(), ['sysA.c1', 'sysA.c2', 'sysA.c3']);
  });

  it('(b) every document described: reclaims them all, with no report', async () => {
    // *Reddens when:* it refuses unconditionally — a failed step 4 then leaks every envelope
    // forever with no detector.
    const fixture = await world({
      layout: SINGLE_ARRAY,
      target: SINGLE_ARRAY,
      systems: [system('sysA', [component('c1'), component('c2')])],
      records: envelopesFor('sysA', [component('c1'), component('c2')]),
    });

    const report = await reconcileComponentStorageLayout(fixture.seams);

    assert.equal(report.action, 'settled');
    assert.equal(report.reclaimed, 2);
    assert.deepEqual(fixture.recordKeys(), []);
  });

  it('(c) partial overlap: the described two go, the undescribed one is KEPT', async () => {
    // *Reddens when:* an all-or-nothing rule ships — it then reclaims 0 here and the envelope
    // leak survives every boot.
    const fixture = await world({
      layout: SINGLE_ARRAY,
      target: SINGLE_ARRAY,
      systems: [system('sysA', [component('c1'), component('c2')])],
      records: envelopesFor('sysA', [component('c1'), component('c2'), component('c3')]),
    });

    const report = await reclaimOrphanedComponentRecords(fixture.seams);

    assert.equal(report.reclaimed, 2);
    assert.equal(report.kept, 1);
    assert.deepEqual(fixture.recordKeys(), ['sysA.c3'], 'the undescribed document is kept');
  });

  it('containment is SCOPED BY SYSTEM, so one system cannot describe another`s document', async () => {
    const fixture = await world({
      layout: SINGLE_ARRAY,
      target: SINGLE_ARRAY,
      // `sysA` nests a component whose id matches a document owned by `sysB`.
      systems: [system('sysA', [component('shared')]), system('sysB', [])],
      records: [
        ...envelopesFor('sysA', [component('shared')]),
        ...envelopesFor('sysB', [component('shared')]),
      ],
    });

    const report = await reclaimOrphanedComponentRecords(fixture.seams);

    assert.equal(report.reclaimed, 1);
    assert.deepEqual(fixture.recordKeys(), ['sysB.shared'], 'sysB`s document is untouched');
  });
});

// ---------------------------------------------------------------------------
// 11. The residual nested key, all THREE dispositions
// ---------------------------------------------------------------------------

describe('the residual nested key has three dispositions, and all three are asserted', () => {
  it('(a) key ABSENT: no action, no report, no write', async () => {
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      // No `components` key at all — the normal state this build writes.
      systems: [{ id: 'sysA', name: 'System sysA', tools: [] }],
      records: envelopesFor('sysA', [component('c1')]),
    });
    fixture.env.writes.length = 0;

    const report = await reconcileComponentStorageLayout(fixture.seams);

    assert.equal(report.action, 'settled');
    assert.deepEqual(
      fixture.settingWrites().filter((key) => key === SETTING_KEYS.CRAFTING_SYSTEMS),
      [],
      'nothing was rewritten'
    );
  });

  it('(b) key present and EMPTY: step 4 is retried SILENTLY', async () => {
    // *Reddens when:* the detector inherits the recipe half's two-arm rule — it then emits a
    // permanent alarming report on every downgraded-and-restored world, for a state that is
    // usually harmless and, when it is not, is byte-identical to the harmless one.
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [system('sysA', [])],
      records: envelopesFor('sysA', [component('c1'), component('c2')]),
    });

    const report = await reconcileComponentStorageLayout(fixture.seams);

    assert.equal(report.action, 'settled', 'NOT a report action');
    assert.equal(
      Object.hasOwn(fixture.storedSystems()[0], 'components'),
      false,
      'the key is gone afterwards'
    );
    assert.deepEqual(fixture.recordKeys(), ['sysA.c1', 'sysA.c2'], 'and the corpus is intact');
  });

  it('(c) key present, NON-EMPTY and byte-equal: step 4 is retried', async () => {
    const nested = [component('c1'), component('c2')];
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [system('sysA', nested)],
      records: envelopesFor('sysA', nested),
    });

    const report = await reconcileComponentStorageLayout(fixture.seams);

    assert.equal(report.action, 'settled');
    assert.equal(Object.hasOwn(fixture.storedSystems()[0], 'components'), false);
    assert.deepEqual(fixture.recordKeys(), ['sysA.c1', 'sysA.c2']);
  });

  it('(d) key present, NON-EMPTY and DIVERGENT: left alone, reported with both counts', async () => {
    // *Reddens when:* it reclaims unconditionally — it then silently discards components
    // authored while downgraded, which is the one thing this arm exists to prevent.
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [
        system('sysA', [component('c1'), component('authored-while-downgraded')]),
        system('sysB', []),
      ],
      records: [
        ...envelopesFor('sysA', [component('c1'), component('c2')]),
        ...envelopesFor('sysB', [component('b1')]),
      ],
    });
    const before = JSON.stringify(fixture.storedSystems()[0].components);

    const report = await reconcileComponentStorageLayout(fixture.seams);

    assert.equal(report.action, 'residual-diverged');
    assert.equal(report.systems, 1, 'one system diverged');
    assert.equal(report.nestedRecords, 2);
    assert.equal(report.granularRecords, 2);
    assert.equal(
      JSON.stringify(fixture.storedSystems()[0].components),
      before,
      'the divergent key is left EXACTLY as found'
    );
    assert.deepEqual(
      fixture.recordKeys(),
      ['sysA.c1', 'sysA.c2', 'sysB.b1'],
      'and the granular documents are untouched'
    );
  });

  it('a divergent system does not stop a sibling`s empty key being retried', async () => {
    // Per SYSTEM, not all-or-nothing: one system's authored residual must not leave every
    // other system's debris behind forever.
    const fixture = await world({
      layout: PER_RECORD,
      target: PER_RECORD,
      systems: [system('sysA', [component('divergent')]), system('sysB', [])],
      records: [
        ...envelopesFor('sysA', [component('c1')]),
        ...envelopesFor('sysB', [component('b1')]),
      ],
    });

    const report = await detectSurvivingNestedComponents(fixture.seams);

    assert.deepEqual(report.diverged, ['sysA']);
    assert.deepEqual(report.retried, ['sysB']);
    const stored = fixture.storedSystems();
    assert.equal(Object.hasOwn(stored[0], 'components'), true, 'sysA is left alone');
    assert.equal(Object.hasOwn(stored[1], 'components'), false, 'sysB is repaired');
  });
});
