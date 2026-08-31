/**
 * The shared shape of a ratchet: a keyed, counted baseline that may only shrink (issue 1391).
 *
 * Three gates in this repository already police debt this way and each hand-wrote its own
 * comparison — `view-lab-source-coverage.test.js` checks membership and a stated reason,
 * `manager-button-source-contract.test.js` compares counts keyed on file plus class string,
 * and `scripts-lint-gate-coverage.test.js` pins a list length and rejects stale entries. They
 * share a family resemblance rather than duplicated code, so this module is a GENERALISATION
 * offered to new callers, not an extraction: none of the three is migrated onto it here, and
 * migrating one is its own change with its own risk. Its second stated customer is the
 * spacing/px gate that will reuse `styleBlockScan.js`.
 *
 * ── WHAT A RATCHET HAS TO CHECK, AND WHY EACH PART IS LOAD-BEARING ──────────────────────
 * PER-KEY COUNTS, not a total. A ceiling on a total absorbs a net-zero swap: trade one banned
 * value for another and the number is unchanged. A per-FILE count absorbs a swap inside a
 * file, which matters when one file holds 51 of 86 entries. The key is the caller's to
 * choose, and it should be as fine as the thing being policed.
 *
 * A PINNED TOTAL, asserted equal to the sum of the counts. Not a redundant assertion: it is
 * the one figure a reviewer can check against the issue without reading the table, and it
 * fails when a hand edit changes a count and forgets the headline — the exact drift that
 * makes a baseline stop describing the tree it claims to describe.
 *
 * EVERY ENTRY STILL PRESENT AND STILL EARNING ITS PLACE. A baseline row for something that no
 * longer exists is a standing permission nobody is using, and the next author gets to lean on
 * the precedent of an unchecked list.
 *
 * A SHRINK IS A FAILURE TOO. Paying debt down without banking it means the slot stays open for
 * the next author to fill for free, so the ratchet never actually tightens. The message says
 * which direction it moved, because the remedies are opposite.
 *
 * A NON-VACUITY FLOOR on the POPULATION SCANNED, not on the findings. An absence check over an
 * empty corpus passes forever and reports itself satisfied; a wrong root, a broken extractor
 * or a filter that stopped matching all read as "no findings". The floor has to be stated over
 * something the gate is not asserting the absence of.
 *
 * This file is deliberately NOT named `*.test.js`: `tests/helpers/` is outside the `npm test`
 * glob. Its guarantees are proved from inside the glob by `tests/ratchet-baseline.test.js`.
 */

/**
 * Tally observed keys.
 *
 * @param {Iterable<unknown>} items
 * @param {(item: unknown) => string} keyOf
 * @returns {Map<string, number>} key to count, insertion-ordered.
 */
export function tallyByKey(items, keyOf) {
  const counts = new Map();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Order two strings by code point.
 *
 * Explicit rather than a bare `sort()`, whose default is "stringify, then order by code point"
 * and which SonarCloud flags (`javascript:S2871`); and never `localeCompare`, whose result is
 * locale-dependent, so a baseline could sort differently on two machines and produce a diff
 * nobody authored. Exported because every consumer of a ratchet has the same need for the same
 * reason, and a third hand-rolled copy is what the duplication gate counts.
 *
 * @param {string} left
 * @param {string} right
 * @returns {number} negative, zero or positive, per the `Array#sort` contract
 */
export function byCodePoint(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** The baseline as a `key -> count` map, rejecting a duplicated or malformed row. */
function indexBaseline(baseline, label) {
  const counts = new Map();
  for (const entry of baseline) {
    if (typeof entry?.key !== 'string' || entry.key.length === 0) {
      throw new Error(`${label}: every baseline entry needs a non-empty string \`key\``);
    }
    if (!Number.isInteger(entry.count) || entry.count < 1) {
      throw new Error(`${label}: baseline entry "${entry.key}" needs a positive integer \`count\``);
    }
    if (counts.has(entry.key)) {
      throw new Error(
        `${label}: baseline entry "${entry.key}" appears twice. Two rows for one key make the ` +
          'sum disagree with the table depending on which one a reader trusts — merge them into ' +
          'one row carrying the combined count.'
      );
    }
    counts.set(entry.key, entry.count);
  }
  return counts;
}

/**
 * Compare an observed tally against a baseline, without asserting anything.
 *
 * Exported separately from {@link assertRatchet} so a caller can render its own message, and
 * so the four categories can be proved directly rather than through a composed string.
 *
 * @param {Map<string, number>} baseline
 * @param {Map<string, number>} observed
 * @returns {{appeared: string[], vanished: string[], grew: string[], shrank: string[]}}
 */
export function ratchetFindings(baseline, observed) {
  const appeared = [];
  const vanished = [];
  const grew = [];
  const shrank = [];

  for (const [key, count] of observed) {
    const pinned = baseline.get(key);
    if (pinned === undefined) appeared.push(`${key} (${count}x, not in the baseline)`);
    else if (count > pinned) grew.push(`${key} (${pinned}x pinned, ${count}x found)`);
    else if (count < pinned) shrank.push(`${key} (${pinned}x pinned, ${count}x found)`);
  }
  for (const [key, count] of baseline) {
    if (!observed.has(key)) vanished.push(`${key} (${count}x pinned, none found)`);
  }

  return {
    appeared: appeared.sort(byCodePoint),
    vanished: vanished.sort(byCodePoint),
    grew: grew.sort(byCodePoint),
    shrank: shrank.sort(byCodePoint),
  };
}

/** One labelled block of findings, or the empty string when there are none. */
function section(heading, lines) {
  return lines.length === 0 ? '' : `\n\n${heading}\n  ${lines.join('\n  ')}`;
}

/**
 * Assert that `observed` still matches `baseline` exactly, that `pinnedTotal` is the sum of
 * the baseline's counts, and that the scan was not vacuous.
 *
 * Throws one aggregated `Error` naming every discrepancy rather than the first, because a
 * ratchet is usually edited in bulk and a one-at-a-time failure turns one fix into ten runs.
 *
 * @param {object} options
 * @param {string} options.label What is being ratcheted, used to open every message.
 * @param {ReadonlyArray<{key: string, count: number}>} options.baseline
 * @param {number} options.pinnedTotal The headline figure, asserted equal to the sum.
 * @param {Map<string, number>} options.observed From {@link tallyByKey}.
 * @param {number} options.scanned Size of the population the scan looked at.
 * @param {number} options.floor Lowest `scanned` that is credible.
 * @param {string} options.guidance What a reader should DO about a new entry.
 * @returns {{total: number}} The baseline total, once everything agrees.
 */
export function assertRatchet({
  label,
  baseline,
  pinnedTotal,
  observed,
  scanned,
  floor,
  guidance,
}) {
  const counts = indexBaseline(baseline, label);
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);

  if (total !== pinnedTotal) {
    throw new Error(
      `${label}: the baseline holds ${total} across ${counts.size} keys but the pinned total says ` +
        `${pinnedTotal}. The pinned total is the one number a reviewer checks against the issue ` +
        'without reading the table, so it is pinned exactly rather than derived — set it to ' +
        `${total}, having satisfied yourself that ${total} is what the tree actually holds.`
    );
  }

  if (scanned < floor) {
    throw new Error(
      `${label}: the scan looked at only ${scanned} candidates, below the floor of ${floor}. ` +
        'That is a broken scan reported as a clean tree, which is the one failure this gate ' +
        'cannot afford: a wrong root, a corpus extractor that stopped matching, or a filter that ' +
        'now excludes everything all look exactly like "nothing to report" from the outside.'
    );
  }

  const { appeared, vanished, grew, shrank } = ratchetFindings(counts, observed);
  if (appeared.length + vanished.length + grew.length + shrank.length === 0) return { total };

  throw new Error(
    `${label}: the baseline no longer describes the tree.` +
      section('APPEARED — new debt, which is what this gate exists to stop:', appeared) +
      section('GREW — an existing entry gained occurrences:', grew) +
      section(
        'SHRANK — debt was PAID DOWN. Bank it by lowering the count and the pinned total, so ' +
          'the slot does not stay open for the next author to fill for free:',
        shrank
      ) +
      section(
        'VANISHED — a baseline entry no longer exists. Delete the row and lower the pinned ' +
          'total; a row nobody is using is a standing permission for whoever finds it next:',
        vanished
      ) +
      `\n\n${guidance}`
  );
}
