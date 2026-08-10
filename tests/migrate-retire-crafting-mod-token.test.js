/**
 * Issue 1094 — 1.21.0: retire the check-modifier roll-formula placeholder.
 *
 * Three claims are pinned here that nothing else can pin:
 *
 * 1. THE TRANSFORM. Pure, clone-first, idempotent, and swept across all three activity
 *    checks plus the legacy `routed.rollExpression` read alias.
 * 2. THE UNTOUCHED CASE. A non-additive placement is left EXACTLY as authored and
 *    reported, because no arithmetic intent can be recovered from the text — and because
 *    one of those residues (`max(, 2)`) is a formula Foundry ACCEPTS and rolls as
 *    `-Infinity`, so guessing would be worse than refusing.
 * 3. THE REPORTING CHANNEL. `MigrationRunner.run()` returns a fixed object literal in
 *    three places and the pass loop spread-merges a migration's return value into the DATA
 *    payload, so a migration cannot add a summary key by returning it. The counts ride a
 *    transient `data._retiredCraftingModCounts` the runner captures and DELETES. The
 *    notice tests below drive a REAL `MigrationRunner.run()` rather than a hand-built
 *    summary object, or they would pass while the transient field never reached `main.js`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MigrationRunner } from '../src/migration/MigrationRunner.js';
import { RETIRED_PLACEMENT_CORPUS } from './helpers/retiredPlaceholderOracle.js';
import { migrateExportPayload } from '../src/migration/migrateExportPayload.js';
import {
  applyRetireCraftingModToken,
  hasRetiredCraftingModFindings,
  migrateRetireCraftingModToken,
} from '../src/migration/migrateRetireCraftingModToken.js';

const TOKEN = '@craftingmod';

/**
 * A catalogue that RESOLVES to a non-empty eligible set is what makes an inert formula a
 * BEHAVIOUR CHANGE rather than a no-op — the entries alone are not enough, because a
 * system whose default set is empty has had nothing start applying.
 */
const CATALOGUE = [{ id: 'med', label: 'Medicine', expression: '@abilities.med.mod' }];
const ELIGIBLE = { checkModifiers: CATALOGUE, defaultModifierIds: ['med'] };

function system(overrides = {}) {
  return {
    id: 'sys-1',
    name: 'Herbalism',
    resolutionMode: 'simple',
    craftingCheck: { ...ELIGIBLE, simple: { rollFormula: '1d20 + 4' } },
    ...overrides,
  };
}

function runMigration(systems) {
  return migrateRetireCraftingModToken({ systems });
}

/** The formulas swept, keyed by the path a GM would read them at. */
function everyFormula(migrated) {
  const paths = [];
  for (const [block, slots] of [
    ['craftingCheck', ['simple', 'routed', 'progressive']],
    ['salvageCraftingCheck', ['simple', 'routed', 'progressive']],
    ['gatheringCraftingCheck', ['progressive', 'routed']],
  ]) {
    for (const slot of slots) {
      const config = migrated?.[block]?.[slot];
      if (!config) continue;
      for (const key of ['rollFormula', 'rollExpression']) {
        if (typeof config[key] === 'string') paths.push([`${block}.${slot}.${key}`, config[key]]);
      }
    }
  }
  return paths;
}

// ── the per-system transform ────────────────────────────────────────────────

test('1.21.0 strips an ADDITIVE placement together with its operator', () => {
  const target = system({
    craftingCheck: { ...ELIGIBLE, simple: { rollFormula: `1d20 + ${TOKEN}` } },
  });
  applyRetireCraftingModToken(target);
  assert.equal(target.craftingCheck.simple.rollFormula, '1d20');
});

// A LEADING placement keeps the operator that FOLLOWS it, because that operator carries
// the sign of the next term and a leading `Additive` is legal (`grammar.pegjs:17`, `:89`).
// Stripping it too would turn `<token> - 2` into `2` and silently double the modifier;
// `- 2` appends to `-2 + 3[Modifiers]`, which is exactly what `(3) - 2` always totalled.
test('1.21.0 strips a LEADING placement but KEEPS the operator after it', () => {
  for (const [authored, expected] of [
    [`${TOKEN} + 1d20`, '+ 1d20'],
    [`${TOKEN} - 2`, '- 2'],
    [`${TOKEN} - 1d4`, '- 1d4'],
  ]) {
    const target = system({
      craftingCheck: { ...ELIGIBLE, simple: { rollFormula: authored } },
    });
    applyRetireCraftingModToken(target);
    assert.equal(target.craftingCheck.simple.rollFormula, expected, authored);
  }
});

test('1.21.0 strips a placeholder-only formula to the empty string', () => {
  const target = system({
    craftingCheck: { ...ELIGIBLE, simple: { rollFormula: TOKEN } },
  });
  applyRetireCraftingModToken(target);
  assert.equal(
    target.craftingCheck.simple.rollFormula,
    '',
    'which the usability readers report as "no formula" rather than rolling new Roll("")'
  );
});

test('1.21.0 leaves a hypothetical longer token alone (word boundary)', () => {
  const target = system({
    craftingCheck: {
      checkModifiers: CATALOGUE,
      simple: { rollFormula: '1d20 + @craftingmodifier' },
    },
  });
  applyRetireCraftingModToken(target);
  assert.equal(target.craftingCheck.simple.rollFormula, '1d20 + @craftingmodifier');
});

// THE UNTOUCHED CASE. Stripping here cannot recover the GM's intent, and the residue of
// the `max(...)` row is a formula Foundry ACCEPTS and rolls as `-Infinity`, so the honest
// answer is to leave the field exactly as authored and tell the GM.
test('1.21.0 leaves a NON-ADDITIVE placement exactly as authored and reports it', () => {
  for (const rollFormula of [
    `1d20 * ${TOKEN}`,
    `1d20 / ${TOKEN}`,
    `max(${TOKEN}, 2)`,
    `(${TOKEN})`,
    `(${TOKEN})d6`,
    `1d20 + (${TOKEN})`,
  ]) {
    const target = system({
      craftingCheck: { ...ELIGIBLE, simple: { rollFormula } },
    });
    const counts = applyRetireCraftingModToken(target);
    assert.equal(target.craftingCheck.simple.rollFormula, rollFormula, rollFormula);
    assert.equal(counts.untouched, 1, `${rollFormula}: reported for GM attention`);
  }
});

// ── the four per-system counts ──────────────────────────────────────────────

test('1.21.0 counts an INERT active check — the formulas whose modifiers go live', () => {
  const counts = applyRetireCraftingModToken(system());
  assert.equal(counts.inert, 1, 'an authored, placeholder-free active formula with a catalogue');
});

test('1.21.0 counts NO inert formula when the system has no catalogue to contribute', () => {
  const counts = applyRetireCraftingModToken(
    system({ craftingCheck: { simple: { rollFormula: '1d20 + 4' } } })
  );
  assert.equal(counts.inert, 0, 'with no entries there is nothing to start adding');
});

// The catalogue is not the gate; the RESOLVED eligible set is. A system with entries but
// an empty default set has had nothing start applying, so reporting it would state a
// change that did not happen and prescribe a remedy ("clear the default set") already in
// force.
test('1.21.0 counts NO inert formula when the catalogue resolves to an EMPTY set', () => {
  for (const defaultModifierIds of [[], undefined, ['not-in-the-catalogue']]) {
    const counts = applyRetireCraftingModToken(
      system({
        craftingCheck: {
          checkModifiers: CATALOGUE,
          defaultModifierIds,
          simple: { rollFormula: '1d20 + 4' },
        },
      })
    );
    assert.equal(counts.inert, 0, JSON.stringify(defaultModifierIds));
  }
  // …and the positive control, so the gate is not simply always false.
  assert.equal(
    applyRetireCraftingModToken(
      system({ craftingCheck: { ...ELIGIBLE, simple: { rollFormula: '1d20 + 4' } } })
    ).inert,
    1
  );
});

test('1.21.0 counts inert against the ACTIVE slot only, not every authored slot', () => {
  // A `simple` system whose PROGRESSIVE slot is placeholder-free changes nothing, because
  // the progressive slot is never rolled. Counting it would only inflate the notice.
  const counts = applyRetireCraftingModToken(
    system({
      resolutionMode: 'simple',
      craftingCheck: {
        ...ELIGIBLE,
        simple: { rollFormula: `1d20 + ${TOKEN}` },
        progressive: { rollFormula: '2d6' },
      },
    })
  );
  assert.equal(counts.inert, 0, 'the active slot DID spend the placeholder');
});

test('1.21.0 counts a SUBTRACTIVE placement — the 2x-scalar sign swing', () => {
  const counts = applyRetireCraftingModToken(
    system({
      craftingCheck: { ...ELIGIBLE, simple: { rollFormula: `1d20 - ${TOKEN}` } },
    })
  );
  assert.equal(counts.subtractive, 1);
  assert.equal(counts.inert, 0, 'it DID spend the placeholder, so it was never inert');
});

test('1.21.0 counts a REPEATED placement — double-counting collapses to one', () => {
  const counts = applyRetireCraftingModToken(
    system({
      craftingCheck: {
        ...ELIGIBLE,
        simple: { rollFormula: `${TOKEN} + 1d20 + ${TOKEN}` },
      },
    })
  );
  assert.equal(counts.repeated, 1);
});

test('hasRetiredCraftingModFindings is false only when every count is zero', () => {
  assert.equal(hasRetiredCraftingModFindings({}), false);
  assert.equal(
    hasRetiredCraftingModFindings({ inert: 0, subtractive: 0, repeated: 0, untouched: 0 }),
    false
  );
  for (const key of ['inert', 'subtractive', 'repeated', 'untouched']) {
    assert.equal(hasRetiredCraftingModFindings({ [key]: 1 }), true, key);
  }
});

// ── the defensive salvage / gathering sweep ─────────────────────────────────

test('1.21.0 sweeps salvage and gathering, including the legacy routed.rollExpression', () => {
  const target = system({
    salvageCraftingCheck: {
      simple: { rollFormula: `1d20 + ${TOKEN}` },
      routed: { rollFormula: `2d6 + ${TOKEN}`, rollExpression: `1d100 + ${TOKEN}` },
      progressive: { rollFormula: `1d8 + ${TOKEN}` },
    },
    gatheringCraftingCheck: {
      progressive: { rollFormula: `1d12 + ${TOKEN}` },
      routed: { rollFormula: `1d4 + ${TOKEN}`, rollExpression: `1d6 + ${TOKEN}` },
    },
  });
  applyRetireCraftingModToken(target);
  for (const [path, formula] of everyFormula(target)) {
    assert.equal(formula.includes(TOKEN), false, `${path} still carries the placeholder`);
  }
  assert.equal(target.salvageCraftingCheck.routed.rollExpression, '1d100');
  assert.equal(target.gatheringCraftingCheck.routed.rollExpression, '1d6');
});

// ── purity, idempotency, malformed payloads ─────────────────────────────────

test('1.21.0 is pure and clone-first — the input payload is never touched', () => {
  const input = [
    system({
      craftingCheck: { ...ELIGIBLE, simple: { rollFormula: `1d20 + ${TOKEN}` } },
    }),
  ];
  const snapshot = JSON.stringify(input);
  const result = runMigration(input);
  assert.equal(JSON.stringify(input), snapshot, 'the caller-owned payload is untouched');
  assert.equal(result.systems[0].craftingCheck.simple.rollFormula, '1d20');
});

test('1.21.0 is idempotent under re-run', () => {
  const first = runMigration([
    system({
      craftingCheck: {
        ...ELIGIBLE,
        simple: { rollFormula: `1d20 - ${TOKEN}` },
        routed: { rollFormula: `max(${TOKEN}, 2)` },
      },
    }),
  ]);
  const second = runMigration(first.systems);
  assert.deepEqual(second.systems, first.systems, 'a second pass changes no DATA');

  // The counts are a description of the data the pass looked at, not a log of what it
  // wrote, so two of them legitimately re-report on already-migrated data: `untouched`
  // because that formula is still on disk exactly as authored, and `inert` because the
  // now-stripped active formula genuinely no longer spends a placeholder. Neither can
  // reach a GM twice — the runner is version-gated, so the world pass runs once — and the
  // export upcast discards counts entirely.
  const [report] = second._retiredCraftingModCounts;
  assert.equal(report.subtractive, 0, 'nothing was re-stripped');
  assert.equal(report.repeated, 0, 'and nothing was re-collapsed');
  assert.equal(report.untouched, 1, 'the non-additive formula is still on disk, still reported');
});

test('1.21.0 returns a payload with no systems array untouched', () => {
  for (const systems of [undefined, null, 'nope', 42, {}]) {
    assert.equal(runMigration(systems).systems, systems, String(systems));
  }
});

test('1.21.0 tolerates malformed systems without throwing', () => {
  const result = runMigration([
    null,
    'not a system',
    42,
    {},
    { craftingCheck: 'nope' },
    { craftingCheck: { simple: 'nope' } },
    { craftingCheck: { simple: { rollFormula: 42 } } },
  ]);
  assert.equal(result.systems.length, 7);
  assert.deepEqual(result._retiredCraftingModCounts, []);
});

test('1.21.0 reports only the systems that had a finding, named for the GM', () => {
  const result = runMigration([
    system({ id: 'clean', name: 'Clean', craftingCheck: { simple: { rollFormula: '1d20' } } }),
    system({
      id: 'dirty',
      name: 'Dirty',
      craftingCheck: { ...ELIGIBLE, simple: { rollFormula: `1d20 - ${TOKEN}` } },
    }),
    // No name: the id stands in rather than an empty string in a notification.
    system({
      id: 'unnamed-sys',
      name: '',
      craftingCheck: { ...ELIGIBLE, simple: { rollFormula: `1d20 * ${TOKEN}` } },
    }),
  ]);
  assert.deepEqual(
    result._retiredCraftingModCounts.map((entry) => entry.system),
    ['Dirty', 'unnamed-sys']
  );
});

// ── the export-payload upcast ───────────────────────────────────────────────

test('the export upcast strips the placeholder from an imported bundle', () => {
  const migrated = migrateExportPayload({
    schemaVersion: 2,
    runtimeStateIncluded: false,
    gatheringEnvironments: [],
    gatheringConfig: { system: {}, shared: {} },
    system: {
      id: 'imported',
      craftingCheck: { simple: { rollFormula: `1d20 + ${TOKEN}` } },
      salvageCraftingCheck: { simple: { rollFormula: `2d6 + ${TOKEN}` } },
    },
  });
  assert.equal(migrated.system.craftingCheck.simple.rollFormula, '1d20');
  assert.equal(migrated.system.salvageCraftingCheck.simple.rollFormula, '2d6');
});

test('the export upcast runs on the LEGACY branch too, not only the current schema', () => {
  const migrated = migrateExportPayload({
    fabricateVersion: '0.9.0',
    system: { id: 'legacy', craftingCheck: { simple: { rollFormula: `1d20 + ${TOKEN}` } } },
    recipes: [],
  });
  assert.equal(migrated.system.craftingCheck.simple.rollFormula, '1d20');
});

test('the export upcast is idempotent and never mutates its input', () => {
  const payload = {
    schemaVersion: 2,
    runtimeStateIncluded: false,
    gatheringEnvironments: [],
    gatheringConfig: { system: {}, shared: {} },
    system: { id: 'imported', craftingCheck: { simple: { rollFormula: `1d20 + ${TOKEN}` } } },
  };
  const snapshot = JSON.stringify(payload);
  const once = migrateExportPayload(payload);
  assert.equal(JSON.stringify(payload), snapshot);
  assert.deepEqual(migrateExportPayload(once), once);
});

// ── the runner: registration, and the transient reporting channel ───────────

function runnerOver(store) {
  return new MigrationRunner({
    getSetting: (key) => store.get(key),
    setSetting: async (key, value) => store.set(key, value),
  });
}

test('1.21.0 is registered with the behaviour-lossy downgrade target', () => {
  const entry = runnerOver(new Map())._migrations.find(
    (migration) => migration.version === '1.21.0'
  );
  assert.ok(entry, '1.21.0 is registered');
  assert.equal(entry.downgradeTo, '1.20.0', 'the last release before the retirement');
  assert.ok(
    /placeholder/i.test(entry.label),
    'the label names what retired, so the GM-facing log is legible'
  );
});

test('the runner applies 1.21.0 to craftingSystems and bumps the migration version', async () => {
  const store = new Map([
    ['migrationVersion', '1.20.0'],
    [
      'craftingSystems',
      [
        system({
          craftingCheck: { ...ELIGIBLE, simple: { rollFormula: `1d20 + ${TOKEN}` } },
        }),
      ],
    ],
    ['recipes', []],
  ]);

  const result = await runnerOver(store).run();

  assert.equal(result.ran, 1);
  assert.equal(store.get('craftingSystems')[0].craftingCheck.simple.rollFormula, '1d20');
  assert.equal(store.get('migrationVersion'), '1.21.0');
});

// THE CHANNEL. The counts reach `main.js` ONLY through a transient field the runner
// captures and deletes, so this drives the real `run()` and reads its summary rather than
// hand-building one — the mistake that would let the notice ship dead with a green suite.
test('runner: the per-system counts surface on the summary and are NEVER persisted', async () => {
  const store = new Map([
    ['migrationVersion', '1.20.0'],
    [
      'craftingSystems',
      [
        system({
          name: 'Inert world',
          craftingCheck: { ...ELIGIBLE, simple: { rollFormula: '1d20 + 4' } },
        }),
        system({
          id: 'sys-2',
          name: 'Subtractive world',
          craftingCheck: {
            ...ELIGIBLE,
            simple: { rollFormula: `1d20 - ${TOKEN} + ${TOKEN}` },
            routed: { rollFormula: `max(${TOKEN}, 2)` },
          },
        }),
      ],
    ],
    ['recipes', []],
  ]);

  const result = await runnerOver(store).run();

  assert.deepEqual(result.retiredCraftingModCounts, [
    { system: 'Inert world', inert: 1, subtractive: 0, repeated: 0, untouched: 0 },
    { system: 'Subtractive world', inert: 0, subtractive: 1, repeated: 1, untouched: 1 },
  ]);
  for (const persisted of store.get('craftingSystems')) {
    assert.equal(
      Object.hasOwn(persisted, '_retiredCraftingModCounts'),
      false,
      'the transient field never reaches a setting payload'
    );
  }
  assert.equal(
    JSON.stringify(store.get('craftingSystems')).includes('_retiredCraftingModCounts'),
    false
  );
});

test('runner: the summary key is present on EVERY return path, never undefined', async () => {
  // The no-pending early return. `main.js` reads this key unconditionally, so a path that
  // omitted it would hand the notice block `undefined` and throw on the `.length` read.
  const settled = new Map([
    ['migrationVersion', '99.0.0'],
    ['craftingSystems', []],
    ['recipes', []],
  ]);
  const noPending = await runnerOver(settled).run();
  assert.equal(noPending.ran, 0);
  assert.deepEqual(noPending.retiredCraftingModCounts, []);

  // The ABORT return, driven through an injected fatal migration.
  const { FatalMigrationError } = await import('../src/migration/migrationErrors.js');
  const aborting = new MigrationRunner({
    getSetting: (key) => new Map([['migrationVersion', '0.0.0']]).get(key) ?? [],
    setSetting: async () => {},
    migrations: [
      {
        version: '9.9.9',
        label: 'boom',
        downgradeTo: '9.9.8',
        migrate: () => {
          throw new FatalMigrationError('boom', { documents: [] });
        },
      },
    ],
  });
  const aborted = await aborting.run();
  assert.equal(aborted.aborted, true);
  assert.deepEqual(aborted.retiredCraftingModCounts, []);
});

test('runner: a clean world reports NO findings, so the GM notice never fires', async () => {
  const store = new Map([
    ['migrationVersion', '1.20.0'],
    [
      'craftingSystems',
      [system({ craftingCheck: { simple: { rollFormula: '1d20 + @abilities.med.mod' } } })],
    ],
    ['recipes', []],
  ]);
  const result = await runnerOver(store).run();
  assert.deepEqual(result.retiredCraftingModCounts, [], 'no catalogue, no placeholder, no notice');
});

test('runner: a malformed transient report is coerced rather than passed to a notification', () => {
  // Defensive: the notice formats these numbers straight into a localized string, so a
  // `NaN` or an object reaching it would render as GM-facing garbage.
  const runner = new MigrationRunner({
    getSetting: () => [],
    setSetting: async () => {},
    migrations: [
      {
        version: '9.9.9',
        label: 'reports junk',
        migrate: (data) => ({
          ...data,
          _retiredCraftingModCounts: [
            null,
            'nope',
            { system: 7, inert: 'two', subtractive: -1, repeated: 2.9, untouched: undefined },
          ],
        }),
      },
    ],
  });
  return runner.run().then((result) => {
    assert.deepEqual(result.retiredCraftingModCounts, [
      { system: '7', inert: 0, subtractive: 0, repeated: 2, untouched: 0 },
    ]);
  });
});

// ── the GM notice in src/main.js ────────────────────────────────────────────
//
// `src/main.js` cannot be imported by a unit test (module-level Foundry side effects and
// a `.css` asset import), so this repo's established pattern for covering it is a
// source-text guard. The runner tests above already prove the transient field reaches
// `run()`'s summary through a REAL pass; these pin the last hop, which is the one an
// eyeball reviewing a diff most easily believes without checking.

const MAIN_SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../src/main.js'),
  'utf8'
);

test('main.js reads the counts off the runner SUMMARY, not off the data payload', () => {
  assert.ok(
    /summary\?\.retiredCraftingModCounts/.test(MAIN_SOURCE),
    'the notice reads the summary key the runner returns'
  );
  assert.equal(
    MAIN_SOURCE.includes('_retiredCraftingModCounts'),
    false,
    'and never the transient field, which the runner deletes before main.js ever sees it'
  );
});

test('main.js fires the notice GM-only and only when a count is non-zero', () => {
  const block = MAIN_SOURCE.slice(MAIN_SOURCE.indexOf('const retiredCraftingModCounts'));
  const guard = block.slice(0, block.indexOf('{'));
  assert.ok(/retiredCraftingModCounts\.length > 0/.test(guard), 'gated on a non-empty report');
  assert.ok(/game\.user\?\.isGM/.test(guard), 'and on the user being a GM');
});

// SEVERITY IS LOAD-BEARING, and this was found the hard way. The View Lab boots the REAL
// migration runner over its fixtures on every build (they seed no `migrationVersion`, so
// `lastRunVersion` is `0.0.0` and every migration runs), and `installFoundryShim` routes
// `ui.notifications.warn` to a prefixed `console.warn` that FAILS a capture. A blanket
// `warn` therefore failed all three affected View Lab cases at once — and one bad case
// fails the capture job whole and publishes NOTHING. `untouched` is the only count that
// leaves a world needing hand repair, so it alone warns; everything else takes the `info`
// channel the 0.6.0 and 0.9.0 notices this block is modelled on use.
test('main.js warns PERMANENTLY for the untouched count, and informs otherwise', () => {
  const block = MAIN_SOURCE.slice(MAIN_SOURCE.indexOf('const retiredCraftingModCounts'));
  const dispatch = block.slice(0, block.indexOf('\n  }'));
  assert.ok(
    /if \(totals\.untouched > 0\)\s*ui\.notifications\?\.warn\?\.\(message, \{ permanent: true \}\);/.test(
      dispatch
    ),
    'a check that will not roll until rewritten must not scroll away unread'
  );
  assert.ok(
    /else ui\.notifications\?\.info\?\.\(message\);/.test(dispatch),
    'every other finding is informational, so it cannot fail a View Lab capture'
  );
});

// The clauses are separate keys joined only when non-zero, so the common single-cause
// world does not read three sentences reporting zero.
test('main.js joins only the non-zero clauses', () => {
  const block = MAIN_SOURCE.slice(MAIN_SOURCE.indexOf('const retiredCraftingModCounts'));
  assert.ok(/if \(count <= 0\) return null;/.test(block), 'a zero clause is dropped entirely');
  assert.ok(/\.filter\(Boolean\)/.test(block), 'and the survivors are joined');
  for (const key of ['Inert', 'Subtractive', 'Repeated', 'Untouched']) {
    assert.ok(block.includes(`clause('${key}'`), `${key} is its own clause`);
  }
});

test('main.js formats every notice clause through a localized key that exists in en.json', () => {
  const lang = JSON.parse(
    readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../lang/en.json'), 'utf8')
  );
  const copyFor = (key) =>
    `FABRICATE.Migration.RetireCheckModifierPlaceholder.${key}`
      .split('.')
      .reduce((node, segment) => (node == null ? undefined : node[segment]), lang);

  assert.ok(
    MAIN_SOURCE.includes("'FABRICATE.Migration.RetireCheckModifierPlaceholder.Lead'"),
    'the lead sentence is localized rather than English-only'
  );
  assert.ok(copyFor('Lead').includes('{systems}'), 'and names the affected systems');

  for (const key of ['Inert', 'Subtractive', 'Repeated', 'Untouched']) {
    const copy = copyFor(key);
    assert.equal(typeof copy, 'string', `${key} resolves`);
    assert.ok(copy.includes('{count}'), `${key} interpolates its own count`);
  }

  // THE REMEDY IS SPELLED OUT, and it names ONE action. An earlier draft also offered
  // "choose a combination rule whose set resolves to 0", which names no rule that does
  // that: every rule reduces the same eligible set, so switching cannot zero it.
  const inert = copyFor('Inert');
  assert.ok(/clear the Default modifiers set/i.test(inert), 'the real remedy is named');
  assert.equal(/resolves to 0/i.test(inert), false, 'and the remedy that does not exist is gone');

  // The untouched clause states the CONSEQUENCE, not just the fact, because that is the
  // one clause whose world is broken until the GM acts.
  assert.ok(/will not roll until you rewrite them/i.test(copyFor('Untouched')));
});

// ── the on-disk invariant, over the whole refusal corpus ────────────────────
//
// The migration is the ONLY caller that writes, and it passes no dice engine, so the
// shim's structural check is the sole guard on what lands in the setting. This drives the
// same corpus the shim tests drive: a shape refused there but written here is exactly how
// a formula reaches disk in a state the shim would refuse at roll time — and, because the
// token is gone by then, the shim short-circuits and `new Roll(...)` throws as a rolled,
// consuming, permanent failure.

const OPERATOR_BOUNDED_RE = /^\s*[*/%]|[+\-*/%]\s*$/;

test('1.21.0 never writes a residue bounded by a binary operator, over the whole corpus', () => {
  assert.ok(RETIRED_PLACEMENT_CORPUS.length >= 20, 'the corpus is the shared one, not a stub');

  for (const [label, rollFormula] of RETIRED_PLACEMENT_CORPUS) {
    const target = system({
      craftingCheck: { ...ELIGIBLE, simple: { rollFormula } },
    });
    const counts = applyRetireCraftingModToken(target);
    const persisted = target.craftingCheck.simple.rollFormula;

    assert.equal(persisted, rollFormula, `${label}: left EXACTLY as authored`);
    assert.equal(counts.untouched, 1, `${label}: reported for GM attention`);
    assert.equal(
      OPERATOR_BOUNDED_RE.test(persisted),
      OPERATOR_BOUNDED_RE.test(rollFormula),
      `${label}: the migration introduced no new dangling operator`
    );
  }
});

// The positive half, so the invariant above cannot pass by refusing everything.
test('1.21.0 DOES rewrite a top-level additive placement, and what it writes is whole', () => {
  for (const [authored, expected] of [
    ['1d20 + @craftingmod', '1d20'],
    ['1d20 - @craftingmod', '1d20'],
    ['2 + @craftingmod + 4', '2 + 4'],
    ['@craftingmod - 2', '- 2'],
    ['@craftingmod', ''],
  ]) {
    const target = system({
      craftingCheck: { ...ELIGIBLE, simple: { rollFormula: authored } },
    });
    const counts = applyRetireCraftingModToken(target);
    const persisted = target.craftingCheck.simple.rollFormula;
    assert.equal(persisted, expected, authored);
    assert.equal(counts.untouched, 0, `${authored}: rewritten, not refused`);
    if (persisted !== '') {
      assert.equal(OPERATOR_BOUNDED_RE.test(persisted), false, `${authored}: whole residue`);
    }
  }
});

// The reproduction that started this: a formula whose residue would dangle is left alone
// rather than persisted, so the next craft rolls the authored formula (and fails the
// readiness check) instead of throwing inside `Roll` and consuming the ingredients.
test('1.21.0 leaves a formula whose residue would DANGLE exactly as authored', () => {
  for (const rollFormula of ['1d20 - -@craftingmod', '1d20 - @craftingmod -', '@craftingmod +']) {
    const target = system({
      craftingCheck: { ...ELIGIBLE, simple: { rollFormula } },
    });
    const counts = applyRetireCraftingModToken(target);
    assert.equal(target.craftingCheck.simple.rollFormula, rollFormula, rollFormula);
    assert.equal(counts.untouched, 1);
  }
});
