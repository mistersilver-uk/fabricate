/**
 * The connect-payload model for the B(1) persistence backend (issue 1080).
 *
 * ADR 0001 selected **B(1) — one `world` setting key per record** against its own spike's
 * recommendation, and recorded the condition that selection rests on:
 *
 * > B(1) is sufficient if real worlds sit far enough below 10,000 records that the per-key
 * > envelope never accumulates to the crossover — which is at roughly the point where key
 * > count x 340 bytes exceeds the whole-array saving.
 *
 * This module is the arithmetic that answers it, and nothing else. It implements **no backend**:
 * it takes the payloads `RecipeManager.save()` actually writes and reports what the same corpus
 * would cost a connecting client under the two storage layouts.
 *
 * ## The two layouts, stated as formulae so the model is auditable
 *
 * Both replicate in full to every client at connect — issue 1088 Q4 settled that no key
 * granularity changes that — so the only question is how many bytes each layout adds around the
 * same record payloads.
 *
 * - **Baseline (today).** One `recipes` world setting holding the whole array:
 *   `sum(recordBytes) + n + 1` — the records, `n - 1` commas and two brackets.
 *   {@link assertWholeArrayIdentity} proves that against real `JSON.stringify` rather than
 *   trusting the arithmetic.
 * - **B(1).** One `world` setting key per record: `sum(recordBytes) + n * envelope`. The records
 *   pay no array punctuation and instead pay one `Setting` document envelope each.
 *
 * Subtracting one from the other is the whole finding, and it is worth writing out:
 *
 * ```text
 * B(1) - baseline  =  n * envelope - (n + 1)  =  n * (envelope - 1) - 1
 * ```
 *
 * **That has no crossover in `n`.** The "whole-array saving" the ADR's condition weighs the
 * envelope against is the array punctuation, which is ONE byte per record, so a 340-byte
 * envelope exceeds it at the first record and the gap then grows linearly forever. The
 * `records`-shaped answer to "where is the crossover" is therefore `1`, which is a degenerate
 * answer to a question posed in the wrong units — see {@link findConnectCrossover}.
 *
 * The question that is NOT degenerate is the one {@link connectPayloadSeries} answers: how large
 * the penalty is **relative to the corpus**, which is
 * `(envelope - 1) / meanRecordBytes` and therefore a function of the RECORD SHAPE, not of the
 * record count. That is why this model reports a basis-point overhead per series point: three
 * near-identical readings at 100, 1,000 and 10,000 records are the evidence that corpus size is
 * not the variable the ADR's condition assumed it was.
 *
 * ## The envelope is an input, not a derivation
 *
 * {@link SETTING_DOCUMENT_ENVELOPE_BYTES} cannot be computed headlessly. It was measured inside
 * a real Foundry by the issue-1079 spike and is quoted here so a re-measurement replaces one
 * named constant instead of an assumption spread across a report.
 */

/**
 * The per-`Setting`-document envelope, in bytes.
 *
 * **A live-measured input, not a derived value.** ADR 0001's `persistence-experiments` scenario
 * registered a per-record-shaped setting key inside a real Foundry 14.365 and read the resulting
 * `Setting` document back out of `game.settings.storage`: the stored value was 51 bytes, the
 * whole document 391, so the envelope is 340. Nothing headless can produce that number, because
 * it is the `_id`, `key`, `user` and `_stats` fields the server wraps a value in.
 *
 * Two things a re-measurement should know, because both would move it:
 *
 * - It is an **upper bound on the fixed term**. A `Setting`'s `value` is a string field holding
 *   `JSON.stringify(value)`, so the document's own serialization escapes every quote in it. The
 *   spike subtracted the UNESCAPED 51-byte value from the 391-byte document, which charges the
 *   value's escaping to the envelope. On a 51-byte value that is a few bytes; the direction of
 *   the error inflates B(1)'s modelled cost, which is the safe direction for a number being used
 *   to question B(1).
 * - It scales with the **key name**, which the spike shaped like a per-record key. A longer key
 *   prefix than the one it probed makes this an under-estimate.
 *
 * @type {number}
 */
export const SETTING_DOCUMENT_ENVELOPE_BYTES = 340;

/**
 * Serialized byte length of each record, in the shape storage holds.
 *
 * Bytes are `JSON.stringify(value).length` — UTF-16 code units of the serialized form, exactly
 * as `benchmarkCases.js`'s `settingBytes` counts them. Not what a socket compresses it to; a
 * consistent size that makes two layouts comparable.
 *
 * @param {object[]} payloads The array a `save()` wrote, i.e. `Recipe#toJSON` output.
 * @returns {number[]}
 */
export function serializedRecordBytes(payloads) {
  return payloads.map((payload) => JSON.stringify(payload).length);
}

/**
 * What the whole-array `world` setting costs at connect for the first `records` of a corpus.
 *
 * @param {number[]} recordBytes
 * @param {number} [records] Defaults to the whole corpus.
 * @returns {number}
 */
export function wholeArrayConnectBytes(recordBytes, records = recordBytes.length) {
  const count = boundedCount(recordBytes, records);
  // `JSON.stringify([])` is `"[]"`, which the `sum + n + 1` form does not describe.
  if (count === 0) return 2;
  return prefixSum(recordBytes, count) + count + 1;
}

/**
 * What one `world` setting key per record costs at connect for the first `records` of a corpus.
 *
 * @param {number[]} recordBytes
 * @param {number} [records] Defaults to the whole corpus.
 * @param {number} [envelopeBytes]
 * @returns {number}
 */
export function perRecordKeyConnectBytes(
  recordBytes,
  records = recordBytes.length,
  envelopeBytes = SETTING_DOCUMENT_ENVELOPE_BYTES
) {
  const count = boundedCount(recordBytes, records);
  return prefixSum(recordBytes, count) + count * envelopeBytes;
}

/**
 * One point of the connect-payload curve.
 *
 * `overheadBasisPoints` is the decision-relevant figure and is an integer so it can be committed
 * as a class-1 count: `10000` would mean B(1) doubles the connect payload, `2773` means it is
 * 27.73% larger. It is reported per point precisely so a reader can see it barely move across
 * three orders of magnitude of corpus size.
 *
 * @param {object} options
 * @param {number[]} options.recordBytes
 * @param {number} options.records
 * @param {number} [options.envelopeBytes]
 * @returns {{records: number, wholeArrayBytes: number, perRecordKeyBytes: number,
 *   deltaBytes: number, overheadBasisPoints: number, meanRecordBytes: number}}
 */
export function connectPayloadAt({
  recordBytes,
  records,
  envelopeBytes = SETTING_DOCUMENT_ENVELOPE_BYTES,
}) {
  const count = boundedCount(recordBytes, records);
  const wholeArrayBytes = wholeArrayConnectBytes(recordBytes, count);
  const perRecordKeyBytes = perRecordKeyConnectBytes(recordBytes, count, envelopeBytes);
  return {
    records: count,
    wholeArrayBytes,
    perRecordKeyBytes,
    deltaBytes: perRecordKeyBytes - wholeArrayBytes,
    overheadBasisPoints: Math.round(
      ((perRecordKeyBytes - wholeArrayBytes) / wholeArrayBytes) * 10_000
    ),
    meanRecordBytes: count === 0 ? 0 : prefixSum(recordBytes, count) / count,
  };
}

/**
 * The curve across a sweep of corpus sizes.
 *
 * Sizes above the corpus are dropped rather than extrapolated: a mean-per-record extrapolation
 * would report a curve the fixture cannot support, and this measurement exists to replace an
 * extrapolation with a measurement.
 *
 * @param {object} options
 * @param {number[]} options.recordBytes
 * @param {number[]} options.sizes
 * @param {number} [options.envelopeBytes]
 * @returns {object[]}
 */
export function connectPayloadSeries({
  recordBytes,
  sizes,
  envelopeBytes = SETTING_DOCUMENT_ENVELOPE_BYTES,
}) {
  return sizes
    .filter((size) => size <= recordBytes.length)
    .map((records) => connectPayloadAt({ recordBytes, records, envelopeBytes }));
}

/**
 * The record count at which B(1) first costs more at connect than the whole-array setting.
 *
 * Scanned rather than solved, so the answer stays a measurement over the real corpus and stays
 * correct for an envelope small enough never to cross. `null` means it never crosses within the
 * measured corpus, which is the only outcome that would satisfy ADR 0001's condition.
 *
 * @param {object} options
 * @param {number[]} options.recordBytes
 * @param {number} [options.envelopeBytes]
 * @returns {{records: number, below: object, at: object}|null}
 */
export function findConnectCrossover({
  recordBytes,
  envelopeBytes = SETTING_DOCUMENT_ENVELOPE_BYTES,
}) {
  // A running sum rather than a `connectPayloadAt` per candidate: the scan is over every record
  // in the corpus, so re-summing the prefix each time would make a 10,000-record search
  // quadratic for a question whose answer is usually the first record.
  let sum = 0;
  for (let records = 1; records <= recordBytes.length; records++) {
    sum += recordBytes[records - 1];
    if (sum + records * envelopeBytes > sum + records + 1) {
      return {
        records,
        below: connectPayloadAt({ recordBytes, records: records - 1, envelopeBytes }),
        at: connectPayloadAt({ recordBytes, records, envelopeBytes }),
      };
    }
  }
  return null;
}

/**
 * Prove the whole-array formula against real `JSON.stringify` instead of trusting it.
 *
 * The baseline term is the one this model could get wrong silently: `sum + n + 1` is an
 * arithmetic claim about JSON punctuation, and every conclusion here is a subtraction from it.
 * Callers hand it the payloads they measured so the identity is checked on the real corpus.
 *
 * @param {object[]} payloads
 * @returns {{modelled: number, actual: number, matches: boolean}}
 */
export function assertWholeArrayIdentity(payloads) {
  const modelled = wholeArrayConnectBytes(serializedRecordBytes(payloads));
  const actual = JSON.stringify(payloads).length;
  return { modelled, actual, matches: modelled === actual };
}

/**
 * @param {number[]} recordBytes
 * @param {number} records
 * @returns {number}
 */
function boundedCount(recordBytes, records) {
  if (!Number.isInteger(records) || records < 0) {
    throw new Error(`records must be a non-negative integer, got ${records}`);
  }
  return Math.min(records, recordBytes.length);
}

/**
 * @param {number[]} recordBytes
 * @param {number} count
 * @returns {number}
 */
function prefixSum(recordBytes, count) {
  let total = 0;
  for (let index = 0; index < count; index++) total += recordBytes[index];
  return total;
}
