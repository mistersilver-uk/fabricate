/**
 * The B(1) connect-payload crossover (issue 1080).
 *
 * ADR 0001 selected B(1) — one `world` setting key per record — against its own spike's
 * recommendation, and made that selection conditional on a measurement:
 *
 * > B(1) is sufficient if real worlds sit far enough below 10,000 records that the per-key
 * > envelope never accumulates to the crossover [...] Issue 1080 MUST measure the connect
 * > payload at the corpus sizes real installations actually reach, and MUST record the crossover
 * > point at which B(1) becomes worse than doing nothing.
 *
 * This suite guards the arithmetic that answers it and the committed reading it produced. It
 * implements no backend and asserts nothing about how anything is persisted.
 *
 * ## Why the negative controls matter more than the positive ones here
 *
 * The headline result is that there is no crossover in corpus size at all: the two layouts
 * diverge immediately and never converge again. A search that returned `1` because it was broken
 * would look exactly like a search that returned `1` because that is the answer. So the crossover
 * finder is exercised against envelopes that must produce `null` (never crosses) and against an
 * envelope that must produce a crossover at a specific interior record count, before its answer
 * on the real constant is trusted.
 *
 * ## The accounting convention the ordinal depends on
 *
 * `1` is the answer with both layouts counted exclusive of the container `Setting` document's own
 * envelope, which is ADR 0001's own convention (see the module header of
 * `helpers/scale/connectPayloadModel.js`). Charge the whole-array setting its one envelope too
 * and the difference is `339n - 341` rather than `339n - 1`, so the divergence lands on the
 * SECOND record. The per-record penalty is 339 bytes either way and the corpus-scale figures move
 * by 340 bytes in 3.39 MB. Both readings are pinned below, so the convention is auditable rather
 * than implicit.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  SETTING_DOCUMENT_ENVELOPE_BYTES,
  assertWholeArrayIdentity,
  connectPayloadAt,
  connectPayloadSeries,
  findConnectCrossover,
  perRecordKeyConnectBytes,
  serializedRecordBytes,
  wholeArrayConnectBytes,
} from './helpers/scale/connectPayloadModel.js';
import { buildScaleFixture } from './helpers/scale/scaleProfiles.js';
import {
  hydrateRecipes,
  loadBenchmarkModules,
  withFreshRecordIds,
} from './helpers/scale/scaleWorld.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A corpus with a deliberately uneven record-size distribution. */
const UNEVEN = [{ a: 1 }, { b: 'xxxxxxxxxx' }, { c: [1, 2, 3, 4, 5] }, { d: null }];

function readBaseline(profile) {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, 'benchmarks', 'baselines', `${profile}.json`), 'utf8')
  );
}

describe('the whole-array baseline term', () => {
  it('matches real JSON.stringify at every prefix length, including the empty corpus', () => {
    // `sum + n + 1` is an arithmetic claim about JSON punctuation, and every conclusion in this
    // measurement is a subtraction from it. Checked against the real serializer rather than
    // restated, and at n = 0 specifically, where `"[]"` does not fit the formula.
    for (let records = 0; records <= UNEVEN.length; records++) {
      const prefix = UNEVEN.slice(0, records);
      assert.equal(
        wholeArrayConnectBytes(serializedRecordBytes(UNEVEN), records),
        JSON.stringify(prefix).length,
        `prefix of ${records} record(s)`
      );
    }
  });

  it('reports the identity against the corpus it was handed', () => {
    const held = assertWholeArrayIdentity(UNEVEN);
    assert.equal(held.matches, true);
    assert.equal(held.actual, JSON.stringify(UNEVEN).length);

    // And it must be able to say no. Hand it a payload set whose measured bytes it did not
    // produce and the identity is meaningless — so prove the reporter is not hard-wired to true.
    const bytes = serializedRecordBytes(UNEVEN);
    assert.notEqual(wholeArrayConnectBytes(bytes, 2), JSON.stringify(UNEVEN).length);
  });
});

describe('the per-record-key term', () => {
  it('is the same record payloads plus one envelope each, with no array punctuation', () => {
    const bytes = serializedRecordBytes(UNEVEN);
    const sum = bytes.reduce((total, value) => total + value, 0);
    assert.equal(perRecordKeyConnectBytes(bytes, UNEVEN.length, 340), sum + 4 * 340);
    assert.equal(perRecordKeyConnectBytes(bytes, 0, 340), 0);
  });

  it('defaults to the live-measured Setting envelope', () => {
    const bytes = serializedRecordBytes(UNEVEN);
    assert.equal(
      perRecordKeyConnectBytes(bytes),
      perRecordKeyConnectBytes(bytes, UNEVEN.length, SETTING_DOCUMENT_ENVELOPE_BYTES)
    );
    // The constant is an INPUT from the issue-1079 live spike, not something this module can
    // derive. Pinned so a silent edit is a failing test rather than a quietly different report.
    assert.equal(SETTING_DOCUMENT_ENVELOPE_BYTES, 340);
  });
});

describe('the crossover search', () => {
  it('answers "never" when the envelope cannot beat the array punctuation', () => {
    // One byte of envelope per record against one byte of comma per record: B(1) is never worse,
    // so the search must return null. This is the ONLY shape of answer that would satisfy
    // ADR 0001's condition, and a search that cannot produce it cannot falsify anything.
    assert.equal(findConnectCrossover({ recordBytes: [500, 500, 500], envelopeBytes: 1 }), null);
    assert.equal(findConnectCrossover({ recordBytes: [500, 500, 500], envelopeBytes: 0 }), null);
  });

  it('finds an INTERIOR crossover when one exists', () => {
    // envelope 2: delta is `2n - (n + 1)`, i.e. exactly zero at one record and positive at two.
    // A finder stuck at "1" or at "null" fails this, which is what makes its answer on the real
    // 340-byte envelope worth reading — and the `> 0` boundary is checked here rather than
    // assumed, because a `>=` would have reported the crossover one record early.
    const crossover = findConnectCrossover({
      recordBytes: [500, 500, 500, 500],
      envelopeBytes: 2,
    });
    assert.equal(crossover.records, 2);
    assert.equal(crossover.below.deltaBytes, 0);
    assert.equal(crossover.at.deltaBytes, 1);
  });

  it('crosses at the FIRST record on the live-measured envelope, whatever the record size', () => {
    // The finding, stated as a test: the "whole-array saving" a 340-byte envelope is weighed
    // against is one byte of comma per record, so there is no corpus size below which the
    // envelope has not yet accumulated. Record size does not move it — only the size of the
    // resulting penalty, which is what `connectPayloadSeries` reports.
    //
    // "First record" is on the model's stated accounting convention: both layouts exclusive of
    // the container `Setting`'s own envelope, which is how ADR 0001's connect table counts. The
    // symmetric alternative is the test below, and it moves the ordinal and nothing else.
    for (const perRecord of [50, 768, 3773, 100_000]) {
      const crossover = findConnectCrossover({
        recordBytes: Array.from({ length: 64 }, () => perRecord),
      });
      assert.equal(crossover.records, 1, `${perRecord}-byte records`);
      assert.equal(crossover.below.deltaBytes, -2, 'the empty corpus is two bytes of "[]"');
      assert.equal(crossover.at.deltaBytes, SETTING_DOCUMENT_ENVELOPE_BYTES - 2);
    }
  });

  it('moves to the SECOND record, and nowhere else, if the baseline is charged an envelope too', () => {
    // The convention is disclosed rather than defended, so the alternative is pinned rather than
    // described. Charging the whole-array setting its own single `Setting` envelope gives
    // `339n - 341` against the model's `339n - 1`: same per-record term, one envelope of
    // difference in total, divergence at n = 2 instead of n = 1.
    const envelope = SETTING_DOCUMENT_ENVELOPE_BYTES;
    const bytes = Array.from({ length: 64 }, () => 768);
    const symmetricDelta = (records) =>
      perRecordKeyConnectBytes(bytes, records) - (wholeArrayConnectBytes(bytes, records) + envelope);

    assert.equal(symmetricDelta(1), -2, 'one record is still cheaper under B(1), by two bytes');
    assert.equal(symmetricDelta(2), envelope - 3, 'and two records are not');
    for (const records of [1, 2, 7, 64]) {
      assert.equal(symmetricDelta(records), (envelope - 1) * records - (envelope + 1));
      // The whole point of disclosing the convention rather than re-recording the numbers: the
      // two accountings differ by exactly one envelope at every corpus size, never by more.
      assert.equal(
        connectPayloadAt({ recordBytes: bytes, records }).deltaBytes - symmetricDelta(records),
        envelope
      );
    }
  });
});

describe('the overhead is a property of record SHAPE, not of record COUNT', () => {
  it('reports a near-identical ratio across four orders of magnitude of corpus size', () => {
    // ADR 0001's condition assumes corpus size is the variable. Over a uniform corpus it is not
    // one at all: the payload term and the envelope term both scale linearly in `n`, so their
    // ratio is constant and only the ABSOLUTE penalty grows.
    const uniform = Array.from({ length: 10_000 }, () => 768);
    const series = connectPayloadSeries({ recordBytes: uniform, sizes: [1, 100, 1000, 10_000] });
    const readings = series.map((row) => row.overheadBasisPoints);
    // Not exactly constant: the baseline's two array brackets are a fixed cost that a
    // one-record corpus pays in full and a 10,000-record corpus does not notice, which moves
    // the ratio by a few tenths of a percent OF ITSELF and by nothing else.
    const spread = Math.max(...readings) - Math.min(...readings);
    assert.ok(
      spread / Math.max(...readings) < 0.01,
      `overhead moved by ${spread} of ${Math.max(...readings)} basis points across the sweep`
    );
    assert.equal(series.at(-1).deltaBytes, 10_000 * (SETTING_DOCUMENT_ENVELOPE_BYTES - 1) - 1);
  });

  it('separates two record shapes that differ only in size', () => {
    const small = connectPayloadAt({
      recordBytes: Array.from({ length: 1000 }, () => 768),
      records: 1000,
    });
    const large = connectPayloadAt({
      recordBytes: Array.from({ length: 1000 }, () => 3773),
      records: 1000,
    });
    // Same records, same envelope, same count — five times the relative penalty on the smaller
    // shape. This is why the measurement is registered against two corpora rather than one.
    assert.equal(small.deltaBytes, large.deltaBytes);
    assert.ok(
      small.overheadBasisPoints > large.overheadBasisPoints * 4,
      `${small.overheadBasisPoints} bp vs ${large.overheadBasisPoints} bp`
    );
  });

  it('drops sweep points above the corpus rather than extrapolating them', () => {
    const series = connectPayloadSeries({
      recordBytes: [100, 100, 100],
      sizes: [1, 3, 10, 10_000],
    });
    assert.deepEqual(
      series.map((row) => row.records),
      [1, 3]
    );
  });

  it('refuses a nonsensical record count instead of guessing one', () => {
    assert.throws(() => connectPayloadAt({ recordBytes: [1], records: -1 }), /non-negative/);
    assert.throws(() => connectPayloadAt({ recordBytes: [1], records: 1.5 }), /integer/);
  });
});

describe('the committed reading', () => {
  // The measurement is only useful if it is re-derived when the payload shape changes, which is
  // what the benchmark drift guard does. These assertions pin the CONCLUSION so that a future
  // payload change cannot quietly turn "B(1) is 44% worse at connect" into a different sentence
  // without someone having to restate it.
  for (const [profile, caseId] of [
    ['simple-corpus', 'persistence.connectPayload.simpleRecipes'],
    ['rich-corpus', 'persistence.connectPayload.richRecipes'],
  ]) {
    it(`${profile} records a crossover at the first record, on the stated convention`, () => {
      const counts = readBaseline(profile).cases[caseId].counts;
      assert.equal(counts.connectEnvelopeBytesPerRecord, SETTING_DOCUMENT_ENVELOPE_BYTES);
      assert.equal(counts.wholeArrayPunctuationModelHolds, 1);
      assert.equal(counts.connectCrossoverRecords, 1);
      assert.equal(counts.connectCrossoverDeltaBytesBelow, -2);
      assert.equal(counts.connectCrossoverDeltaBytesAt, 338);
      assert.equal(counts.connectDeltaBytesPerRecord, 339);
      assert.equal(
        counts.perRecordKeyConnectBytes - counts.wholeArrayConnectBytes,
        counts.connectDeltaBytes
      );
    });
  }

  it('records the simple shape as materially worse than the rich one', () => {
    const simple = readBaseline('simple-corpus').cases['persistence.connectPayload.simpleRecipes'];
    const rich = readBaseline('rich-corpus').cases['persistence.connectPayload.richRecipes'];
    assert.ok(
      simple.counts['connectOverheadBasisPoints@1000'] >
        rich.counts['connectOverheadBasisPoints@1000'] * 4,
      'the shape sensitivity this measurement exists to expose has gone'
    );
  });
});

describe('the fresh id space that makes these bytes reproducible', () => {
  it('produces identical bytes however many records were hydrated before it', async () => {
    // `Recipe.fromJSON` mints sub-record ids from a process-lifetime counter, so ids get wider as
    // a process runs and a byte count taken second is larger than the same count taken first.
    // Measured on `rich-corpus`, that is a 6,074-byte difference between running the profile
    // alone and running it after `simple-corpus` — enough to report class-1 drift for no reason.
    const modules = await loadBenchmarkModules();
    const fixture = buildScaleFixture({ profile: 'rich-corpus' });
    const sample = fixture.recipes.slice(0, 40);

    const first = withFreshRecordIds(() => hydrateRecipes(modules, sample)).map((recipe) =>
      JSON.stringify(recipe.toJSON())
    );
    // Burn the ambient counter hard between the two readings.
    hydrateRecipes(modules, sample);
    hydrateRecipes(modules, sample);
    const second = withFreshRecordIds(() => hydrateRecipes(modules, sample)).map((recipe) =>
      JSON.stringify(recipe.toJSON())
    );

    assert.deepEqual(second, first);
  });

  it('restores the ambient id source, including when the work throws', async () => {
    const modules = await loadBenchmarkModules();
    const ambient = globalThis.foundry.utils.randomID;
    assert.throws(
      () =>
        withFreshRecordIds(() => {
          throw new Error('boom');
        }),
      /boom/
    );
    assert.equal(globalThis.foundry.utils.randomID, ambient);
    assert.ok(modules.Recipe, 'the module graph is loaded');
  });
});
