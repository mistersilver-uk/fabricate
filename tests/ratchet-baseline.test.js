/** Direct proof for the shared ratchet in `tests/helpers/ratchetBaseline.js` (issue 1391). */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

import {
  assertRatchet,
  ceilingLedgerGate,
  formatLedger,
  parseLedger,
  ratchetFindings,
  tallyByKey,
} from './helpers/ratchetBaseline.js';

/** A three-row baseline totalling six, small enough to reason about by eye. */
const BASELINE = Object.freeze([
  Object.freeze({ key: 'a.css height 40', count: 3 }),
  Object.freeze({ key: 'b.svelte height 36', count: 2 }),
  Object.freeze({ key: 'c.svelte min-height 32', count: 1 }),
]);

/** The clean observation: exactly the baseline. */
const clean = () =>
  new Map([
    ['a.css height 40', 3],
    ['b.svelte height 36', 2],
    ['c.svelte min-height 32', 1],
  ]);

/** Run the ratchet over `observed`, with everything else healthy. */
const run = (observed, overrides = {}) =>
  assertRatchet({
    label: 'retired heights',
    baseline: BASELINE,
    pinnedTotal: 6,
    observed,
    scanned: 900,
    floor: 800,
    guidance: 'pick a rung from the published ladder',
    ...overrides,
  });

test('a baseline that matches the tree passes and reports its total', () => {
  assert.deepEqual(run(clean()), { total: 6 });
});

test('a new key fails as new debt', () => {
  const observed = clean().set('d.svelte height 40', 1);
  assert.throws(() => run(observed), {
    message: /APPEARED[\s\S]*d\.svelte height 40 \(1x, not in the baseline\)/,
  });
  // The guidance travels with the failure: a gate that only says "no" makes the reader guess.
  assert.throws(() => run(observed), { message: /pick a rung from the published ladder/ });
});

test('an existing key that grows fails, which a per-file total would absorb', () => {
  assert.throws(() => run(clean().set('a.css height 40', 4)), {
    message: /GREW[\s\S]*a\.css height 40 \(3x pinned, 4x found\)/,
  });
});

test('paying debt down without banking it fails, and says so in the other direction', () => {
  assert.throws(() => run(clean().set('a.css height 40', 2)), {
    message: /SHRANK[\s\S]*Bank it[\s\S]*a\.css height 40 \(3x pinned, 2x found\)/,
  });
});

test('a baseline row that no longer exists fails as a stale permission', () => {
  const observed = clean();
  observed.delete('c.svelte min-height 32');
  assert.throws(() => run(observed), {
    message: /VANISHED[\s\S]*c\.svelte min-height 32 \(1x pinned, none found\)/,
  });
});

test('every discrepancy is reported at once, not one run at a time', () => {
  const observed = clean();
  observed.set('a.css height 40', 4);
  observed.set('d.svelte height 32', 1);
  observed.delete('c.svelte min-height 32');

  // A ratchet is edited in bulk. Reporting the first finding turns one fix into three runs, and
  // hides from the reader that the third change is a payment they were entitled to bank.
  assert.throws(() => run(observed), {
    message: /APPEARED[\s\S]*GREW[\s\S]*VANISHED/,
  });
});

test('a pinned total that disagrees with the sum fails before anything is compared', () => {
  // Deliberately with a CLEAN observation: this must fail on the baseline's own arithmetic, so a
  // row edited without updating the headline cannot ride along on a green tree.
  assert.throws(() => run(clean(), { pinnedTotal: 7 }), {
    message: /holds 6 across 3 keys but the pinned total says 7/,
  });
});

test('a scan that looked at almost nothing fails instead of reporting a clean tree', () => {
  assert.throws(() => run(clean(), { scanned: 12 }), {
    message: /only 12 candidates, below the floor of 800[\s\S]*broken scan reported as a clean tree/,
  });
});

test('a malformed or duplicated baseline row is rejected rather than half-counted', () => {
  const duplicated = [...BASELINE, { key: 'a.css height 40', count: 1 }];
  assert.throws(() => run(clean(), { baseline: duplicated }), {
    message: /"a\.css height 40" appears twice/,
  });
  assert.throws(() => run(clean(), { baseline: [{ key: '', count: 1 }] }), {
    message: /non-empty string `key`/,
  });
  assert.throws(() => run(clean(), { baseline: [{ key: 'a', count: 0 }] }), {
    message: /needs a positive integer `count`/,
  });
});

test('the four categories are separable without parsing a message', () => {
  const found = ratchetFindings(
    new Map([
      ['kept', 1],
      ['grown', 1],
      ['shrunk', 2],
      ['gone', 1],
    ]),
    new Map([
      ['kept', 1],
      ['grown', 2],
      ['shrunk', 1],
      ['new', 1],
    ])
  );

  assert.deepEqual(found.appeared, ['new (1x, not in the baseline)']);
  assert.deepEqual(found.grew, ['grown (1x pinned, 2x found)']);
  assert.deepEqual(found.shrank, ['shrunk (2x pinned, 1x found)']);
  assert.deepEqual(found.vanished, ['gone (1x pinned, none found)']);
});

test('tallying counts repeats rather than collapsing them', () => {
  // Counted, not set-valued, for the reason `manager-button-source-contract.test.js` gives:
  // deleting one of two identical probes must not be silently absorbed.
  const counts = tallyByKey(
    [{ file: 'a' }, { file: 'b' }, { file: 'a' }],
    (entry) => entry.file
  );
  assert.deepEqual([...counts], [
    ['a', 2],
    ['b', 1],
  ]);
});

const TEMP_LEDGERS = mkdtempSync(join(tmpdir(), 'ceiling-ledger-'));
after(() => rmSync(TEMP_LEDGERS, { recursive: true, force: true }));

let probeSequence = 0;

/**
 * A ceiling gate over a throwaway ledger, with its own env names so no two probes can collide.
 * The default rule gives every observation one unit of headroom.
 */
function ceilingProbe({ rows, observed, scanned = 10, detail, ceiling, staleRows = 'fail' }) {
  probeSequence += 1;
  const ledgerPath = join(TEMP_LEDGERS, `probe-${probeSequence}.txt`);
  writeFileSync(ledgerPath, formatLedger(rows));
  const updateEnv = `UPDATE_PROBE_${probeSequence}_LEDGER`;
  const tightenEnv = `TIGHTEN_PROBE_${probeSequence}_LEDGER`;
  let registered;
  const gate = ceilingLedgerGate({
    test: (_title, fn) => {
      registered = fn;
    },
    assert,
    title: 'the probe ledger',
    ledgerPath,
    updateEnv,
    tightenEnv,
    build: () => ({ observed, scanned, detail }),
    ceiling: ceiling ?? ((key, value) => Math.ceil(value) + 1),
    staleRows,
    floor: 5,
    wording: {
      subject: 'probe counts',
      update: `${updateEnv}=1 npm test`,
      tighten: `${tightenEnv}=1 npm test`,
      addedHint: 'A probe appears when it is written.',
      staleHint: 'A probe vanishes when it is deleted.',
    },
  });
  const withEnv = (name, run) => {
    process.env[name] = '1';
    try {
      return run();
    } finally {
      delete process.env[name];
    }
  };
  return {
    gate,
    run: (t) => registered(t),
    update: (t) => withEnv(updateEnv, () => registered(t)),
    tighten: (t) => withEnv(tightenEnv, () => registered(t)),
    both: (t) => withEnv(updateEnv, () => withEnv(tightenEnv, () => registered(t))),
    text: () => readFileSync(ledgerPath, 'utf8'),
    read: () => parseLedger(readFileSync(ledgerPath, 'utf8')),
  };
}

/** A stand-in for the `node:test` context, so a diagnostic is observable rather than printed. */
function diagnosticSpy() {
  const lines = [];
  return { context: { diagnostic: (line) => lines.push(line) }, lines };
}

test('a key with no row fails as new debt, naming the ceiling an update would write', () => {
  const probe = ceilingProbe({ rows: { a: 5 }, observed: { a: 4, b: 7 } });
  assert.throws(() => probe.run(), {
    message: /NO ROW[\s\S]*b \(7, would be pinned 8\)[\s\S]*UPDATE_PROBE/,
  });
});

test('a key that grew past its ceiling fails, naming both numbers', () => {
  const probe = ceilingProbe({ rows: { a: 5 }, observed: { a: 6 } });
  assert.throws(() => probe.run(), {
    message: /OVER CEILING[\s\S]*a \(ceiling 5, found 6, would be pinned 7\)/,
  });
});

test('an observation at its ceiling passes, and one below it passes without a rewrite', () => {
  const atCeiling = ceilingProbe({ rows: { a: 5 }, observed: { a: 5 } });
  atCeiling.run();
  assert.equal(atCeiling.text(), 'a\t5\n', 'a passing run never writes');

  const below = ceilingProbe({ rows: { a: 50 }, observed: { a: 5 } });
  const spy = diagnosticSpy();
  below.run(spy.context);
  assert.equal(below.text(), 'a\t50\n');
  assert.match(spy.lines.join('\n'), /1 row\(s\)[\s\S]*a \(50 -> 6\)/);
});

test('a stale row passes with a diagnostic under `allow` and fails under `fail`', () => {
  const allowed = ceilingProbe({ rows: { a: 5, gone: 3 }, observed: { a: 5 }, staleRows: 'allow' });
  const spy = diagnosticSpy();
  allowed.run(spy.context);
  assert.match(spy.lines.join('\n'), /1 stale row\(s\)[\s\S]*gone \(3\)/);

  const failed = ceilingProbe({ rows: { a: 5, gone: 3 }, observed: { a: 5 }, staleRows: 'fail' });
  assert.throws(() => failed.run(), {
    message: /STALE[\s\S]*gone \(ceiling 3, nothing found\)[\s\S]*TIGHTEN_PROBE/,
  });
});

test('an empty observation fails on the floor rather than passing as all-stale', () => {
  // The failure a ceiling gate is uniquely exposed to: it bounds only what it observes, so a
  // corpus that read nothing meets every ceiling it was given.
  const probe = ceilingProbe({ rows: { a: 5 }, observed: {}, scanned: 0, staleRows: 'allow' });
  assert.throws(() => probe.run(), {
    message: /only 0 candidates, below the floor of 5[\s\S]*every ceiling met/,
  });
});

test('setting both regenerate modes at once is rejected instead of picking one', () => {
  const probe = ceilingProbe({ rows: { a: 5 }, observed: { a: 9 } });
  assert.throws(() => probe.both(), { message: /are both set, and they write different files/ });
});

test('the update mode rewrites only the failing rows', () => {
  const probe = ceilingProbe({
    rows: { grown: 5, slack: 90, gone: 4 },
    observed: { grown: 9, slack: 5, fresh: 2 },
    staleRows: 'allow',
  });
  probe.update();
  assert.deepEqual(probe.read(), { fresh: 3, gone: 4, grown: 10, slack: 90 });
});

test('the tighten mode rewrites every row, drops stale rows, and is idempotent', () => {
  const probe = ceilingProbe({
    rows: { grown: 5, slack: 90, gone: 4 },
    observed: { grown: 9, slack: 5, fresh: 2 },
    staleRows: 'allow',
  });
  probe.tighten();
  assert.deepEqual(probe.read(), { fresh: 3, grown: 10, slack: 6 });
  const once = probe.text();
  probe.tighten();
  assert.equal(probe.text(), once, 'a second tighten run is byte-identical');
  probe.run();
});

test('the ceiling rule sees the key, so a file row and a function row take different steps', () => {
  const probe = ceilingProbe({
    rows: {},
    observed: { 'a.js': 100, 'a.js::fn': 100 },
    ceiling: (key, value) => (key.includes('::') ? value + 10 : value + 50),
  });
  probe.update();
  assert.deepEqual(probe.read(), { 'a.js': 150, 'a.js::fn': 110 });
});

test('the ceiling rule reads the detail the scan carried, not only the observation', () => {
  const probe = ceilingProbe({
    rows: {},
    observed: { dir: 20 },
    detail: { dir: { commentLines: 20, totalLines: 100 } },
    ceiling: (key, _value, detail) =>
      Math.ceil((100 * (detail[key].commentLines + 25)) / (detail[key].totalLines + 25)),
  });
  probe.update();
  assert.deepEqual(probe.read(), { dir: 36 });
});

test('a zero or malformed row is rejected rather than read as a satisfied ceiling', () => {
  const zeroed = ceilingProbe({ rows: { a: 5 }, observed: { a: 5 } });
  writeFileSync(join(TEMP_LEDGERS, `probe-${probeSequence}.txt`), 'a\t0\n');
  assert.throws(() => zeroed.run(), { message: /row "a" holds 0[\s\S]*positive integer/ });

  const malformed = ceilingProbe({ rows: { a: 5 }, observed: { a: 5 } });
  writeFileSync(join(TEMP_LEDGERS, `probe-${probeSequence}.txt`), 'a\tmany\n');
  assert.throws(() => malformed.run(), { message: /row "a" holds NaN/ });
});
