/** The shared shape of a ratchet: a keyed, counted baseline that may only shrink (issue 1391). */
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Tally observed keys.
 *
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

/** Compare an observed tally against a baseline, without asserting anything. */
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
 * Assert that `observed` still matches `baseline` exactly, that `pinnedTotal` is the sum of the
 * baseline's counts, and that the scan was not vacuous.
 *
 * @param {string} options.label What is being ratcheted, used to open every message.
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

/**
 * The spine both exact-count ledger gates share (issues 1657, 1658): read a pinned `key -> count`
 * map, compare a freshly built one against it in BOTH directions, and describe the drift so a
 * reader can act on it.
 *
 * @param {object} actual Freshly derived `key -> count`.
 * @param {object} expected The pinned ledger.
 * @param {{subject: string, regenerate: string, structuralHint: string, roseHint: string, fellHint:
 * string}} wording `structuralHint` speaks to a key appearing or vanishing, which is a different
 * event from a count moving and needs each gate's own guidance.
 * @returns {string|undefined} A message, or undefined when the two agree.
 */
export function describeLedgerDrift(actual, expected, wording) {
  const added = Object.keys(actual)
    .filter((key) => !(key in expected))
    .sort(byCodePoint);
  const removed = Object.keys(expected)
    .filter((key) => !(key in actual))
    .sort(byCodePoint);
  if (added.length > 0 || removed.length > 0) {
    return (
      `the set of ${wording.subject} changed — added: [${added.join(', ')}], ` +
      `removed: [${removed.join(', ')}]. ${wording.structuralHint} These gates scan the working ` +
      'tree, not the git index, so a stray untracked file under a scanned root is the other ' +
      `likely cause (\`git status\` will show it). Re-derive with ${wording.regenerate}.`
    );
  }
  const changed = Object.keys(expected)
    .filter((key) => actual[key] !== expected[key])
    .sort(byCodePoint)
    .map((key) => `${key}: pinned ${expected[key]} -> actual ${actual[key]}`);
  if (changed.length === 0) return undefined;
  return (
    `${wording.subject} drifted: ${changed.join('; ')}. This gate fails in both directions: a ` +
    `count that ROSE ${wording.roseHint}, and a count that FELL ${wording.fellHint}. ` +
    `Re-derive with ${wording.regenerate}.`
  );
}

/** One exact-count ledger gate (issues 1657, 1658). */
/** Read a tab-separated ledger back into a `key -> count` map. */
export function parseLedger(text) {
  const entries = [];
  for (const line of String(text).split('\n')) {
    if (line.trim() === '') continue;
    const separator = line.lastIndexOf('\t');
    entries.push([line.slice(0, separator), Number(line.slice(separator + 1))]);
  }
  return Object.fromEntries(entries);
}

/** Write a `key -> count` map as a tab-separated ledger, ordered so a diff reads cleanly. */
export function formatLedger(ledger) {
  return `${Object.entries(ledger)
    .sort(([left], [right]) => byCodePoint(left, right))
    .map(([key, count]) => `${key}\t${count}`)
    .join('\n')}\n`;
}

/** A `ledgerGate` plus the baseline assertion every ledger repeats, registered in one call. */
export function pinnedLedgerGate({
  test,
  assert,
  title,
  ledgerPath,
  regenerateEnv,
  build,
  subject,
  regenerate,
  structuralHint,
  roseHint,
  fellHint,
}) {
  const gate = ledgerGate({
    ledgerPath,
    regenerateEnv,
    build,
    wording: { subject, regenerate, structuralHint, roseHint, fellHint },
  });
  test(title, () => gate.check(assert));
  return gate;
}

export function ledgerGate({ ledgerPath, regenerateEnv, build, wording }) {
  let cached;
  const current = () => {
    cached ??= build();
    return cached;
  };
  return {
    current,
    /** The pinned ledger as committed. */
    pinned: () => parseLedger(readFileSync(ledgerPath, 'utf8')),
    /** True when this run rewrote the ledger instead of asserting against it. */
    regenerated: () => Boolean(process.env[regenerateEnv]),
    /** Assert the fresh ledger against the pinned one, or rewrite it when regenerating. */
    check(assert) {
      const actual = current();
      if (process.env[regenerateEnv]) {
        writeFileSync(ledgerPath, formatLedger(actual));
        return;
      }
      const expected = parseLedger(readFileSync(ledgerPath, 'utf8'));
      assert.deepStrictEqual(actual, expected, describeLedgerDrift(actual, expected, wording));
    },
  };
}
