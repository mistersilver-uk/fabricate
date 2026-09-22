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

/** A ledger's rows in file order as `[key, count]` pairs, with duplicates still separate. */
function ledgerEntries(text) {
  const entries = [];
  for (const line of String(text).split('\n')) {
    if (line.trim() === '') continue;
    const separator = line.lastIndexOf('\t');
    entries.push([line.slice(0, separator), Number(line.slice(separator + 1))]);
  }
  return entries;
}

/** Read a tab-separated ledger back into a `key -> count` map. */
export function parseLedger(text) {
  return Object.fromEntries(ledgerEntries(text));
}

/** Write a `key -> count` map as a tab-separated ledger, ordered so a diff reads cleanly. */
export function formatLedger(ledger) {
  return `${Object.entries(ledger)
    .sort(([left], [right]) => byCodePoint(left, right))
    .map(([key, count]) => `${key}\t${count}`)
    .join('\n')}\n`;
}

/** Ledger rows as a `key -> ceiling` map, rejecting a duplicated or malformed row (issue 1914). */
function indexCeilings(entries, title) {
  const rows = new Map();
  for (const [key, value] of entries) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(
        `${title}: row "${key}" holds ${String(value)}, and a ceiling is a positive ` +
          'integer. A zero or malformed row bounds nothing while still reading as a satisfied ' +
          'gate, which is the one failure a ceiling cannot afford.'
      );
    }
    if (rows.has(key)) {
      throw new Error(
        `${title}: row "${key}" appears twice. Two rows bound one key differently depending on ` +
          'which one a reader trusts, and a regenerate run keeps only the last — merge them into ' +
          'one row carrying the ceiling you mean.'
      );
    }
    rows.set(key, value);
  }
  return rows;
}

/** An observation as text: a share is fractional, a count is not. */
function showObserved(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * Sort an observation against its ceilings into the four things a reader can act on.
 *
 * @returns {{added: object[], exceeded: object[], stale: object[], slack: object[]}} `slack` is a
 * row a tighten run would lower, which is the win the epic's sweeps are looking for.
 */
function ceilingFindings(rows, observed, ceilingOf) {
  const added = [];
  const exceeded = [];
  const stale = [];
  const slack = [];
  for (const [key, value] of Object.entries(observed)) {
    const row = rows.get(key);
    const tight = ceilingOf(key, value);
    if (row === undefined) added.push({ key, value, tight });
    else if (value > row) exceeded.push({ key, value, row, tight });
    else if (tight < row) slack.push({ key, value, row, tight });
  }
  for (const [key, row] of rows) {
    if (!Object.hasOwn(observed, key)) stale.push({ key, row });
  }
  const byKey = (left, right) => byCodePoint(left.key, right.key);
  return {
    added: added.sort(byKey),
    exceeded: exceeded.sort(byKey),
    stale: stale.sort(byKey),
    slack: slack.sort(byKey),
  };
}

/** The ledger a run in either regenerate mode writes. */
function regeneratedLedger({ mode, rows, observed, ceilingOf }) {
  if (mode === 'tighten') {
    return Object.fromEntries(
      Object.entries(observed).map(([key, value]) => [key, ceilingOf(key, value)])
    );
  }
  const next = Object.fromEntries(rows);
  const { added, exceeded } = ceilingFindings(rows, observed, ceilingOf);
  for (const { key, tight } of [...added, ...exceeded]) next[key] = tight;
  return next;
}

/** The mode a run asked for, rejecting the pair that would leave the file's contents undefined. */
function regenerateMode({ title, updateEnv, tightenEnv }) {
  const update = Boolean(process.env[updateEnv]);
  const tighten = Boolean(process.env[tightenEnv]);
  if (update && tighten) {
    throw new Error(
      `${title}: ${updateEnv} and ${tightenEnv} are both set, and they write different files — ` +
        'one raises only the failing rows, the other rewrites every row and drops stale ones. ' +
        'Run the one you meant.'
    );
  }
  if (update) return 'update';
  return tighten ? 'tighten' : 'assert';
}

/** The failure a ceiling gate raises, or the empty string when nothing crossed. */
function describeCeilingBreaches({ title, wording, added, exceeded, stale, slack, shrink }) {
  const vanished = shrink === 'fail' ? stale : [];
  const loosened = shrink === 'fail' ? slack : [];
  if (added.length + exceeded.length + vanished.length + loosened.length === 0) return '';
  const takeOn =
    added.length + exceeded.length === 0
      ? ''
      : `\n\nTake the debt on deliberately with \`${wording.update}\`, which rewrites only the ` +
        `rows above and leaves every other row byte-identical, and state the reason in the PR. ` +
        wording.addedHint;
  const bank =
    vanished.length + loosened.length === 0
      ? ''
      : `\n\nBank the win with \`${wording.tighten}\`.` +
        (vanished.length === 0 ? '' : ` ${wording.staleHint}`);
  return (
    `${title}: ${wording.subject} crossed the ledger.` +
    section(
      'NO ROW — new debt, which is what a ceiling gate exists to make visible:',
      added.map(({ key, value, tight }) => `${key} (${showObserved(value)}, would be pinned ${tight})`)
    ) +
    section(
      'OVER CEILING — a listed unit grew past the ceiling it was given:',
      exceeded.map(
        ({ key, value, row, tight }) =>
          `${key} (ceiling ${row}, found ${showObserved(value)}, would be pinned ${tight})`
      )
    ) +
    section(
      'STALE — the row bounds nothing, so it stands as a permission for whoever finds it next:',
      vanished.map(({ key, row }) => `${key} (ceiling ${row}, nothing found)`)
    ) +
    section(
      'SLACK — a listed unit shrank, and this ledger carries no headroom, so the gap between ' +
        'the row and the unit is a standing permission to spend the win straight back:',
      loosened.map(
        ({ key, value, row, tight }) =>
          `${key} (ceiling ${row}, found ${showObserved(value)}, would be pinned ${tight})`
      )
    ) +
    takeOn +
    bank
  );
}

/**
 * A ledger whose rows are ceilings rather than exact counts (issue 1914): a unit that stays under
 * its row passes without touching the file, so only new or grown debt reaches the diff.
 *
 * @param {() => {observed: object, scanned: number, detail?: object}} options.build The scan.
 * @param {(key: string, observed: number, detail?: object) => number} options.ceiling The row to
 * write for an observation, which is where each gate states its own headroom rule.
 * @param {'fail'|'allow'} options.shrink What a row above its unit means for this gate, covering
 * both a unit that fell below its ceiling and one that vanished entirely.
 * @returns {{current: Function, regenerated: Function}} `current()` is the memoised `build()`
 * result; `regenerated()` is true under either mode.
 */
export function ceilingLedgerGate({
  test,
  assert,
  title,
  ledgerPath,
  updateEnv,
  tightenEnv,
  build,
  ceiling,
  shrink,
  floor,
  wording,
}) {
  let cached;
  const current = () => {
    cached ??= build();
    return cached;
  };
  const gate = {
    current,
    /** True when this run rewrote the ledger instead of asserting against it. */
    regenerated: () => Boolean(process.env[updateEnv] || process.env[tightenEnv]),
    check(t) {
      const mode = regenerateMode({ title, updateEnv, tightenEnv });
      const { observed, scanned, detail } = current();
      if (scanned < floor) {
        assert.fail(
          `${title}: the scan looked at only ${scanned} candidates, below the floor of ${floor}. ` +
            'An empty or truncated corpus observes nothing, and a gate that only bounds what it ' +
            'observes would read that as every row stale and every ceiling met.'
        );
      }
      // A tighten run writes every row from the observation without reading one, so a malformed
      // row must not block the run that would repair it.
      const rows =
        mode === 'tighten'
          ? new Map()
          : indexCeilings(ledgerEntries(readFileSync(ledgerPath, 'utf8')), title);
      const ceilingOf = (key, value) => {
        const bound = ceiling(key, value, detail);
        if (!Number.isInteger(bound) || bound < 1) {
          throw new Error(`${title}: the ceiling rule returned ${bound} for "${key}"`);
        }
        return bound;
      };
      if (mode !== 'assert') {
        writeFileSync(ledgerPath, formatLedger(regeneratedLedger({ mode, rows, observed, ceilingOf })));
        return;
      }
      const { added, exceeded, stale, slack } = ceilingFindings(rows, observed, ceilingOf);
      const failure = describeCeilingBreaches({
        title,
        wording,
        added,
        exceeded,
        stale,
        slack,
        shrink,
      });
      if (failure !== '') assert.fail(failure);
      // Under `fail` both lists are empty by the time this runs, so no branch is needed.
      reportHeadroom(t, { wording, stale, slack });
    },
  };
  test(title, (t) => gate.check(t));
  return gate;
}

/** What a tighten run would reclaim, printed so the epic's sweeps can see it without a scan. */
function reportHeadroom(t, { wording, stale, slack }) {
  if (typeof t?.diagnostic !== 'function') return;
  if (stale.length > 0) {
    t.diagnostic(
      `${stale.length} stale row(s) a \`${wording.tighten}\` run would drop: ` +
        stale.map(({ key, row }) => `${key} (${row})`).join(', ')
    );
  }
  if (slack.length > 0) {
    t.diagnostic(
      `${slack.length} row(s) a \`${wording.tighten}\` run would lower: ` +
        slack.map(({ key, row, tight }) => `${key} (${row} -> ${tight})`).join(', ')
    );
  }
}
