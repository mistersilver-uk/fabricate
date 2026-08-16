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
 * ## Accounting convention: neither layout is charged its CONTAINER's envelope
 *
 * **Both layouts are counted exclusive of the container `Setting` document's own envelope**,
 * and that has to be said out loud because the baseline is one `Setting` document too. This is
 * ADR 0001's own convention: its § What a cold client receives at connect table reads the
 * baseline at 12,213,077 bytes and B(1) at 12,203,076 — serialized VALUES on both sides — and
 * the sentence under it says so, that the model "omits the per-`Setting` document envelope,
 * which one key pays once and 10,000 keys pay 10,000 times". This module adds back the
 * 10,000-times term, because that is the term the decision turns on, and does not subtract the
 * once term.
 *
 * Subtracting one layout from the other is the whole finding, and it is worth writing out:
 *
 * ```text
 * B(1) - baseline  =  n * envelope - (n + 1)  =  n * (envelope - 1) - 1
 * ```
 *
 * Charge the baseline its one envelope as well — the symmetric model a reader is likely to
 * apply — and every term but one is unchanged:
 *
 * ```text
 * B(1) - baseline  =  n * envelope - (n + 1 + envelope)  =  n * (envelope - 1) - (envelope + 1)
 * ```
 *
 * At `envelope = 340` that is `339n - 341` against this module's `339n - 1`: **the per-record
 * penalty is 339 bytes either way**, the corpus-scale delta moves by exactly one envelope
 * (340 bytes in 3.39 MB, 0.01%), and the only thing that really moves is the ordinal — the
 * layouts diverge at the SECOND record rather than the first (`-2` bytes at `n = 1`, `+337` at
 * `n = 2`). Note the direction: the convention used here reports B(1) as 340 bytes *worse* than
 * the symmetric one does, so it errs toward the conclusion this measurement reaches rather than
 * away from it.
 *
 * **Neither convention produces a size threshold, and that is the finding.** The "whole-array
 * saving" the ADR's condition weighs the envelope against is the array punctuation, which is ONE
 * byte per record, so a 340-byte envelope exceeds it immediately and the gap then grows linearly
 * forever. The `records`-shaped answer to "where is the crossover" is therefore `1` here and `2`
 * symmetrically — both degenerate answers to a question posed in the wrong units, differing by a
 * bookkeeping choice rather than by anything about the corpus. See {@link findConnectCrossover}.
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
 *   value's escaping to the envelope. On a 51-byte value that is a few bytes, and it inflates
 *   B(1)'s modelled cost.
 *
 *   **Say which use that is safe for, because it is not both.** ADR 0001 states the test: an
 *   error is in the safe direction when it favours the option being argued against. This
 *   measurement argues against B(1), so inflating B(1) biases *toward* its conclusion — the
 *   unsafe direction for that use, and the reason the residual is quantified above rather than
 *   waved at. It IS the safe direction for the other use the same number is put to: setting a
 *   conservative budget under which B(1) is KEPT, where over-charging B(1) can only tighten the
 *   bound.
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
 * Record bytes as a `Setting` document actually carries them: escaped inside a string field.
 *
 * `Setting#value` is a **string** holding `JSON.stringify(value)`, so serializing the document
 * escapes everything inside it that JSON escapes — quotes, backslashes and control characters.
 * This is that length, and it is derived from the serializer rather than from a quote tally so
 * the `\\`, `\n` and `\uXXXX` forms are counted too.
 *
 * **Minus the two quote delimiters, and that subtraction is the whole subtlety.**
 * {@link SETTING_DOCUMENT_ENVELOPE_BYTES} was derived as 391 - 51 from a real document that
 * already contained its value's delimiters, so charging them again per record double-counts
 * them. An earlier hand-computed sensitivity did exactly that and reported that escaping moved
 * the per-record penalty "from 339 to 341 bytes". It cannot, and this function exists so the
 * figure comes out of the harness instead of out of a calculator.
 *
 * The result drops straight into {@link wholeArrayConnectBytes} and
 * {@link perRecordKeyConnectBytes} in place of {@link serializedRecordBytes}: array punctuation
 * carries nothing escapable, so the escaped whole array is still `sum + n + 1`, which
 * {@link assertEscapedArrayIdentity} proves against a real double `JSON.stringify` rather than
 * asserting. Escaping therefore adds the SAME term to both layouts and cancels out of their
 * difference exactly — it moves the *relative* overhead (44.13% to 38.60% on `simple-corpus`)
 * and cannot move the per-record penalty off `envelope - 1`.
 *
 * @param {object[]} payloads
 * @returns {number[]}
 */
export function escapedRecordBytes(payloads) {
  return payloads.map((payload) => JSON.stringify(JSON.stringify(payload)).length - 2);
}

/**
 * What the whole-array `world` setting costs at connect for the first `records` of a corpus.
 *
 * Exclusive of this setting's OWN `Setting` document envelope — see the accounting convention in
 * the module header, and add {@link SETTING_DOCUMENT_ENVELOPE_BYTES} once to model it
 * symmetrically.
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
 * **The answer is one record on this module's accounting convention and two on the symmetric
 * one**, and neither is a corpus-size threshold — read the module header before quoting it.
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
 * The same proof for the escaped model: array punctuation is not escaped.
 *
 * `sum(escapedRecordBytes) + n + 1` is the claim that lets {@link escapedRecordBytes} be fed to
 * the unescaped formulae unchanged, and it holds only because `[`, `]` and `,` carry nothing
 * JSON escapes. Checked against a real double `JSON.stringify` on the caller's own corpus, on
 * the same delimiter-excluding convention as {@link escapedRecordBytes}.
 *
 * @param {object[]} payloads
 * @returns {{modelled: number, actual: number, matches: boolean}}
 */
export function assertEscapedArrayIdentity(payloads) {
  const modelled = wholeArrayConnectBytes(escapedRecordBytes(payloads));
  const actual = JSON.stringify(JSON.stringify(payloads)).length - 2;
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
