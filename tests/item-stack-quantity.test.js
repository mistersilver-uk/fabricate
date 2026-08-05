/**
 * The canonical item stack-quantity accessor (issue 1024, #853 proposal 1).
 *
 * ## Test discipline for the ambient path
 *
 * The configured path is MODULE STATE. `node --test` isolates per file, so the blast
 * radius of a leak is one file — but within a file it is total. So: no test configures
 * the path at module scope, and every test that configures it registers
 * `t.after(resetItemStackQuantityPath)` as the FIRST statement of its body, BEFORE the
 * configure call, so a mid-test throw still resets.
 *
 * `resetItemStackQuantityPath` exists precisely so that restore does not have to
 * hand-write the default literal — which would be a second, unpoliced spelling of what
 * `tests/quantity-literal-gate.test.js` exists to eliminate, in a file the gate does not
 * scan.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_ITEM_STACK_QUANTITY_PATH,
  ITEM_STACK_QUANTITY_PATH_PRESETS,
  stackQuantityPathPresetFor,
} from '../src/config/stackQuantityPathPresets.js';
import {
  configureItemStackQuantityPath,
  hasStackQuantity,
  itemStackQuantityPath,
  normalizeStackQuantityPath,
  probeStackQuantityPath,
  readStackQuantity,
  readStoredStackQuantity,
  resetItemStackQuantityPath,
  setStackQuantity,
  stackQuantityUpdate,
  updateStackQuantity,
} from '../src/systems/itemStackQuantity.js';

/** Capture `console.warn` for the duration of one test. */
function captureWarnings(t) {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  t.after(() => {
    console.warn = original;
  });
  return warnings;
}

/** An item whose stack quantity lives at `path`, and nowhere else. */
function itemAt(path, value) {
  const item = { name: 'Iron Ingot' };
  const segments = path.split('.');
  let cursor = item;
  for (const segment of segments.slice(0, -1)) {
    cursor[segment] = {};
    cursor = cursor[segment];
  }
  cursor[segments.at(-1)] = value;
  return item;
}

// ---------------------------------------------------------------------------
// Criterion 8 — the three read semantics, table-driven over the awkward inputs.
//
// The absent-field default is a SECOND, INDEPENDENT axis from the stored-0 axis.
// Both are exercised here so that folding them together (which silently inflates or
// deflates every stack in the world by one) reds this file.
// ---------------------------------------------------------------------------

const ABSENT = Symbol('absent');

const READ_CASES = [
  //  stored value        readStackQuantity  readStored(absent:1)  readStored(absent:0)  hasStackQuantity
  { label: 'absent', stored: ABSENT, read: 1, stored1: 1, stored0: 0, has: false },
  { label: 'zero', stored: 0, read: 1, stored1: 0, stored0: 0, has: true },
  { label: 'one', stored: 1, read: 1, stored1: 1, stored0: 1, has: true },
  { label: 'twenty', stored: 20, read: 20, stored1: 20, stored0: 20, has: true },
  { label: "numeric string '3'", stored: '3', read: 3, stored1: 3, stored0: 3, has: true },
  { label: 'null', stored: null, read: 1, stored1: 1, stored0: 0, has: false },
  { label: 'NaN', stored: Number.NaN, read: 1, stored1: 1, stored0: 0, has: true },
  { label: 'fractional 2.5', stored: 2.5, read: 2.5, stored1: 2.5, stored0: 2.5, has: true },
  // Not in the criterion's list, but the ONE place the three consolidated helpers
  // disagreed before this change, so it is pinned rather than left to chance.
  { label: 'negative', stored: -3, read: 1, stored1: -3, stored0: -3, has: true },
  { label: 'non-numeric text', stored: 'many', read: 1, stored1: 1, stored0: 0, has: true },
];

describe('the three read semantics, over every awkward stored value', () => {
  for (const testCase of READ_CASES) {
    it(`${testCase.label}`, () => {
      const item =
        testCase.stored === ABSENT
          ? { name: 'Iron Ingot', system: {} }
          : itemAt(DEFAULT_ITEM_STACK_QUANTITY_PATH, testCase.stored);

      assert.equal(readStackQuantity(item), testCase.read, 'readStackQuantity');
      assert.equal(
        readStoredStackQuantity(item, { absentDefault: 1 }),
        testCase.stored1,
        'readStoredStackQuantity(absentDefault: 1)'
      );
      assert.equal(
        readStoredStackQuantity(item, { absentDefault: 0 }),
        testCase.stored0,
        'readStoredStackQuantity(absentDefault: 0)'
      );
      assert.equal(hasStackQuantity(item), testCase.has, 'hasStackQuantity');
    });
  }

  it('readStackQuantity is never below one and never truncates', () => {
    // The accessor deliberately does NOT truncate — `alchemySubmissions.js` keeps its
    // own `Math.trunc`, because "one submission = one unit" is a submission rule.
    assert.equal(readStackQuantity(itemAt(DEFAULT_ITEM_STACK_QUANTITY_PATH, 2.9)), 2.9);
    assert.equal(readStackQuantity(undefined), 1);
    assert.equal(readStackQuantity(null), 1);
  });
});

// ---------------------------------------------------------------------------
// Criterion 8, second half — the per-site mapping table.
//
// Each routed call site declares which accessor it uses and, for the stored reader,
// which absent default preserves what it did before the routing change. A reviewer can
// diff this table against the code; a deliberate change to any row has to be made here
// too, which is what makes it DECLARED rather than discovered.
// ---------------------------------------------------------------------------

const SITE_MAPPING = [
  // { site, accessor, absentDefault, storedZero }
  { site: 'componentStacking.awardedQuantityOf', accessor: 'readStackQuantity' },
  {
    site: 'componentStacking.createOrStackComponentItem (existing stack)',
    accessor: 'readStoredStackQuantity',
    absentDefault: 1,
  },
  { site: 'CraftingEngine.selectedQuantityItems', accessor: 'readStackQuantity' },
  {
    site: 'CraftingEngine._consumeAlchemyExtraItems (delete site)',
    accessor: 'readStoredStackQuantity',
    absentDefault: 1,
  },
  {
    site: 'CraftingEngine._consumeSubmittedAlchemyItems (delete site)',
    accessor: 'readStoredStackQuantity',
    absentDefault: 1,
  },
  {
    site: 'CraftingEngine._consumeIngredients (delete site, craft + timed step)',
    accessor: 'readStoredStackQuantity',
    absentDefault: 1,
  },
  { site: 'CraftingEngine salvage totalAvailable', accessor: 'readStackQuantity' },
  { site: 'CraftingEngine._consumeComponentItems (delete site)', accessor: 'readStackQuantity' },
  {
    site: 'GatheringEngine.normalizeRunItems (source term only)',
    accessor: 'readStoredStackQuantity',
    absentDefault: 1,
  },
  { site: 'RecipeManager have counts (x3)', accessor: 'readStackQuantity' },
  { site: 'InventoryListingBuilder owned counts', accessor: 'readStackQuantity' },
  { site: 'AlchemyListingBuilder held counts', accessor: 'readStackQuantity' },
  { site: 'IngredientSet._initialRemaining (ledger seed)', accessor: 'readStackQuantity' },
  { site: 'essenceResolver multiplyByQuantity', accessor: 'readStackQuantity' },
  { site: 'alchemySubmissions unit expansion (keeps its own Math.trunc)', accessor: 'readStackQuantity' },
  { site: 'SvelteCraftingSystemManagerApp knowledge owned copies', accessor: 'readStackQuantity' },
  { site: 'sourceUuid.findStackableMatch (stackability probe)', accessor: 'hasStackQuantity' },
  {
    site: 'gatheringResultCreation stack-onto-existing',
    accessor: 'readStoredStackQuantity',
    absentDefault: 0,
  },
];

describe('the per-site accessor mapping', () => {
  it('names exactly three read semantics, and no fourth', () => {
    assert.deepEqual(
      [...new Set(SITE_MAPPING.map((entry) => entry.accessor))].sort(),
      ['hasStackQuantity', 'readStackQuantity', 'readStoredStackQuantity']
    );
  });

  it('uses only 1 and 0 as absent defaults, and only on the stored reader', () => {
    for (const entry of SITE_MAPPING) {
      if (entry.accessor === 'readStoredStackQuantity') {
        assert.ok(
          entry.absentDefault === 0 || entry.absentDefault === 1,
          `${entry.site} must declare an absent default`
        );
      } else {
        assert.equal(entry.absentDefault, undefined, `${entry.site} takes no absent default`);
      }
    }
  });

  it('records exactly one site on the absent-default-0 behaviour', () => {
    // `gatheringResultCreation` is the odd one out and is deliberately NOT consolidated
    // onto `createOrStackComponentItem`, which defaults an absent field to 1.
    const zeroDefault = SITE_MAPPING.filter((entry) => entry.absentDefault === 0);
    assert.deepEqual(
      zeroDefault.map((entry) => entry.site),
      ['gatheringResultCreation stack-onto-existing']
    );
  });

  it('records exactly four delete-on-underrun sites', () => {
    const deleteSites = SITE_MAPPING.filter((entry) => entry.site.includes('delete site'));
    assert.equal(deleteSites.length, 4, 'craft, salvage, alchemy-extra, alchemy-no-match');
  });
});

// ---------------------------------------------------------------------------
// Criterion 9 — configure and normalize never throw and never store a falsy path.
// ---------------------------------------------------------------------------

describe('normalizeStackQuantityPath', () => {
  it('rejects every unusable value without throwing', () => {
    for (const bad of [
      undefined,
      null,
      '',
      '   ',
      'system.',
      '.value',
      'system..qty',
      42,
      {},
      [],
      Symbol('nope'),
    ]) {
      assert.equal(normalizeStackQuantityPath(bad), null, String(bad?.toString?.() ?? bad));
    }
  });

  it('accepts and trims a usable path', () => {
    assert.equal(normalizeStackQuantityPath('  system.qtd '), 'system.qtd');
    assert.equal(normalizeStackQuantityPath('system . stack . count'), 'system.stack.count');
    assert.equal(normalizeStackQuantityPath('quantity'), 'quantity');
  });
});

describe('configureItemStackQuantityPath', () => {
  it('retains the current path for every unusable value, and never throws', (t) => {
    t.after(resetItemStackQuantityPath);
    for (const bad of [undefined, null, '', 'system.', '.value', 'system..qty', 7, {}]) {
      const result = configureItemStackQuantityPath(bad);
      assert.equal(result, DEFAULT_ITEM_STACK_QUANTITY_PATH);
      assert.equal(itemStackQuantityPath(), DEFAULT_ITEM_STACK_QUANTITY_PATH);
      assert.ok(result, 'never a falsy path');
    }
  });

  it('keeps a GOOD configured path when a later bad value arrives', (t) => {
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath('system.qtd');
    assert.equal(itemStackQuantityPath(), 'system.qtd');
    configureItemStackQuantityPath('system.');
    assert.equal(
      itemStackQuantityPath(),
      'system.qtd',
      'a typo degrades to "unchanged", never to "reads nothing on any item"'
    );
  });

  it('takes effect through a READ, not merely through the getter', (t) => {
    t.after(resetItemStackQuantityPath);
    const item = { name: 'Iron Ingot', system: { qtd: 20 } };
    assert.equal(readStackQuantity(item), 1, 'unconfigured: the default path resolves nothing');
    configureItemStackQuantityPath('system.qtd');
    assert.equal(readStackQuantity(item), 20);
  });
});

describe('the per-system preset table', () => {
  it('falls back to the default for anything unknown, and never returns undefined', () => {
    for (const unknown of [undefined, null, '', '   ', 'dnd5e', 'pf2e', 'constructor', 42]) {
      assert.equal(stackQuantityPathPresetFor(unknown), DEFAULT_ITEM_STACK_QUANTITY_PATH);
    }
  });

  it('resolves the known per-system override', () => {
    assert.equal(stackQuantityPathPresetFor('tormenta20'), 'system.qtd');
    assert.equal(ITEM_STACK_QUANTITY_PATH_PRESETS.tormenta20, 'system.qtd');
  });
});

// ---------------------------------------------------------------------------
// Criterion 7 — a >= 3-segment path round-trips; a `.value` leaf preserves siblings;
// an object-valued parent write is refused.
// ---------------------------------------------------------------------------

describe('a >= 3-segment configured path', () => {
  it('round-trips through creation, read, write and the stackability probe', (t) => {
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath('system.stack.count');

    // Creation: the payload is built into a fresh `system` literal, so the setter has
    // to CREATE `stack`. A reducer-shaped setter silently no-ops here.
    const itemData = { name: 'Plank', type: 'loot', system: {} };
    setStackQuantity(itemData, 20);
    assert.deepEqual(itemData.system, { stack: { count: 20 } });

    // Read + probe.
    assert.equal(readStackQuantity(itemData), 20);
    assert.equal(readStoredStackQuantity(itemData, { absentDefault: 1 }), 20);
    assert.equal(hasStackQuantity(itemData), true);

    // Write.
    assert.deepEqual(stackQuantityUpdate(itemData, 19), { 'system.stack.count': 19 });
  });

  it('a `.value` leaf write preserves sibling keys', (t) => {
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath('system.quantity.value');
    const itemData = { system: { quantity: { value: 20, max: 99 } } };
    setStackQuantity(itemData, 19);
    assert.deepEqual(itemData.system.quantity, { value: 19, max: 99 });
  });

  it('an object-valued parent write is REFUSED, reported, and no-ops', async (t) => {
    const warnings = captureWarnings(t);
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath('system.quantity');

    const itemData = { system: { quantity: { value: 20, max: 99 } } };
    setStackQuantity(itemData, 19);
    assert.deepEqual(itemData.system.quantity, { value: 20, max: 99 }, 'untouched');

    let updated = null;
    const item = {
      name: 'Iron Ingot',
      system: { quantity: { value: 20 } },
      update: async (payload) => {
        updated = payload;
      },
    };
    assert.equal(stackQuantityUpdate(item, 19), null);
    assert.equal(await updateStackQuantity(item, 19), null);
    assert.equal(updated, null, 'update was never called');

    assert.ok(warnings.length >= 3, 'the guard REPORTS rather than throwing');
    assert.ok(
      warnings.every((line) => line.includes('system.quantity.value')),
      'and suggests the leaf without ever appending one itself'
    );
  });
});

describe('the write helpers on a healthy path', () => {
  it('build a flattened payload and apply it', async (t) => {
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath('system.qtd');
    const applied = [];
    const item = {
      name: 'Iron Ingot',
      system: { qtd: 20 },
      update: async (payload) => {
        applied.push(payload);
        return payload;
      },
    };
    assert.deepEqual(stackQuantityUpdate(item, 19), { 'system.qtd': 19 });
    await updateStackQuantity(item, 19);
    assert.deepEqual(applied, [{ 'system.qtd': 19 }]);
  });

  it('tolerate an item with no update method', async (t) => {
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath('system.qtd');
    assert.equal(await updateStackQuantity({ system: { qtd: 3 } }, 2), null);
  });
});

// ---------------------------------------------------------------------------
// Criterion 10 — the probe, including the `_source` verdict.
//
// The `_source` verdict is vacuity-prone: the obvious fixture shortcut makes
// `item._source` an alias of `item`, under which prepared and source can never
// disagree, the verdict is unreachable, and the test still passes on the other three.
// Every fixture below models the divergence EXPLICITLY, and the healthy case is carried
// in the same describe so a probe that ALWAYS returns 'schema-discard' also fails.
// ---------------------------------------------------------------------------

/** An item whose PREPARED data and `_source` are genuinely distinct objects. */
function itemWithSource({ prepared, source }) {
  return { name: 'Iron Ingot', system: prepared, _source: { name: 'Iron Ingot', system: source } };
}

describe('probeStackQuantityPath', () => {
  it("returns 'no-items' for an empty world", () => {
    const report = probeStackQuantityPath([], { path: 'system.qtd' });
    assert.equal(report.verdict, 'no-items');
    assert.equal(report.total, 0);
  });

  it("returns 'unresolved' with counts when the path resolves on nothing", () => {
    const items = [
      itemWithSource({ prepared: { quantity: 20 }, source: { quantity: 20 } }),
      itemWithSource({ prepared: { quantity: 3 }, source: { quantity: 3 } }),
    ];
    const report = probeStackQuantityPath(items, { path: 'system.qty' });
    assert.equal(report.verdict, 'unresolved');
    assert.equal(report.total, 2);
    assert.equal(report.resolved, 0);
    assert.equal(report.defaultResolved, 2, 'and names how the default would have fared');
    assert.equal(report.defaultPath, DEFAULT_ITEM_STACK_QUANTITY_PATH);
  });

  it("returns 'ok' when prepared AND _source both resolve — the negative control", () => {
    const items = [itemWithSource({ prepared: { qtd: 20 }, source: { qtd: 20 } })];
    const report = probeStackQuantityPath(items, { path: 'system.qtd' });
    assert.equal(report.verdict, 'ok');
    assert.equal(report.resolved, 1);
    assert.equal(report.sourceResolved, 1);
  });

  it("returns 'schema-discard' when it reads prepared but is ABSENT from _source", () => {
    // The load-bearing fixture: `_source.system` has NO `qtd` key at all, while the
    // prepared document does. This is what a module or an active effect produces, and
    // what `SchemaField._cleanType` silently discards on every write.
    const items = [
      itemWithSource({ prepared: { qtd: 20, quantity: 20 }, source: { quantity: 20 } }),
      itemWithSource({ prepared: { qtd: 3, quantity: 3 }, source: { quantity: 3 } }),
    ];
    const report = probeStackQuantityPath(items, { path: 'system.qtd' });
    assert.equal(report.verdict, 'schema-discard');
    assert.equal(report.resolved, 2, 'reads fine on the prepared document');
    assert.equal(report.sourceCandidates, 2);
    assert.equal(report.sourceResolved, 0, 'and writes nowhere');
  });

  it('does not claim a schema discard when no item exposes an _source at all', () => {
    // A bare item-like object (a compendium payload, a fixture) is not evidence of a
    // discard; only a present-but-missing-the-key `_source` is.
    const report = probeStackQuantityPath([{ system: { qtd: 20 } }], { path: 'system.qtd' });
    assert.equal(report.verdict, 'ok');
    assert.equal(report.sourceCandidates, 0);
  });

  it('never counts a non-numeric value as resolving', () => {
    const items = [
      itemWithSource({ prepared: { qtd: {} }, source: { qtd: {} } }),
      itemWithSource({ prepared: { qtd: [] }, source: { qtd: [] } }),
      itemWithSource({ prepared: { qtd: '' }, source: { qtd: '' } }),
      itemWithSource({ prepared: { qtd: null }, source: { qtd: null } }),
    ];
    const report = probeStackQuantityPath(items, { path: 'system.qtd' });
    assert.equal(report.resolved, 0, 'an empty array must not read as the number 0');
    assert.equal(report.verdict, 'unresolved');
  });

  it('probes the AMBIENT path when none is passed', (t) => {
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath('system.qtd');
    const report = probeStackQuantityPath([
      itemWithSource({ prepared: { qtd: 20 }, source: { qtd: 20 } }),
    ]);
    assert.equal(report.path, 'system.qtd');
    assert.equal(report.verdict, 'ok');
  });

  it('skips junk entries rather than throwing', () => {
    const report = probeStackQuantityPath([null, undefined, 4, 'text'], { path: 'system.qtd' });
    assert.equal(report.total, 0);
    assert.equal(report.verdict, 'no-items');
  });
});

// ---------------------------------------------------------------------------
// The accessor is Foundry-free. `src/models/IngredientSet.js` is a call site and
// `openspec/specs/data-models/spec.md:1328` commits the ingredient model to being
// Foundry-free, so this is a contract, not a preference.
// ---------------------------------------------------------------------------

describe('the accessor never reaches for a Foundry global', () => {
  it('names none of game, ui, Hooks or CONFIG', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(
      resolve(import.meta.dirname, '../src/systems/itemStackQuantity.js'),
      'utf8'
    );
    // Strip the module docblock and comments' prose mentions by matching CODE shapes.
    for (const forbidden of [/\bgame\s*[.?]/, /\bui\s*[.?]/, /\bHooks\s*[.?]/, /\bCONFIG\s*[.?]/]) {
      assert.equal(forbidden.test(source), false, `must not reference ${forbidden}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Registration: the per-system default overlay, and the player-write guardrail.
// ---------------------------------------------------------------------------

const { registerFabricateSettings, SETTING_KEYS, WORLD_SCOPED_SETTING_KEYS } = await import(
  '../src/config/settings.js'
);
const { makeSettingsSeam } = await import('./helpers/settings.js');

/** Register against a `game` stub and hand back the captured definitions. */
function captureRegistrations({ systemId, i18n } = {}) {
  const registrations = [];
  const previousGame = globalThis.game;
  globalThis.game = {
    system: systemId === undefined ? undefined : { id: systemId },
    i18n,
    settings: {
      register: (namespace, key, definition) => registrations.push({ namespace, key, definition }),
      registerMenu: () => {},
    },
  };
  try {
    registerFabricateSettings();
  } finally {
    globalThis.game = previousGame;
  }
  return registrations;
}

describe('the item stack-quantity path setting', () => {
  it('registers as a world-scoped, configurable free-text string', () => {
    const entry = captureRegistrations({ systemId: 'dnd5e' }).find(
      (registration) => registration.key === SETTING_KEYS.ITEM_STACK_QUANTITY_PATH
    );
    assert.ok(entry, 'the setting is registered');
    assert.equal(entry.definition.scope, 'world');
    assert.equal(entry.definition.config, true);
    assert.equal(entry.definition.type, String);
    assert.equal(entry.definition.choices, undefined, 'free text, never a choices dropdown');
    assert.equal(entry.definition.onChange, undefined, 'no onChange — the shared listener drives it');
  });

  it('overlays the ACTIVE system default without mutating the frozen base definition', () => {
    const tormenta = captureRegistrations({ systemId: 'tormenta20' }).find(
      (registration) => registration.key === SETTING_KEYS.ITEM_STACK_QUANTITY_PATH
    );
    assert.equal(tormenta.definition.default, 'system.qtd');

    // Registering again under a different system must NOT see the previous overlay:
    // `Object.freeze` is shallow and `register()` mutates the object it is handed, so
    // the overlay has to build a NEW object every time.
    const dnd = captureRegistrations({ systemId: 'dnd5e' }).find(
      (registration) => registration.key === SETTING_KEYS.ITEM_STACK_QUANTITY_PATH
    );
    assert.equal(dnd.definition.default, DEFAULT_ITEM_STACK_QUANTITY_PATH);
  });

  it('never yields an undefined default, even with no game.system at all', () => {
    // Load-bearing: `ClientSettings#register` applies `data.default ??= null`, which
    // would make every read return `null` rather than a usable path. Existing tests call
    // `registerFabricateSettings()` against a stub with no `system` key.
    const entry = captureRegistrations({}).find(
      (registration) => registration.key === SETTING_KEYS.ITEM_STACK_QUANTITY_PATH
    );
    assert.equal(entry.definition.default, DEFAULT_ITEM_STACK_QUANTITY_PATH);
  });

  it("names the active system's default VERBATIM in the hint", () => {
    const formatted = [];
    const entry = captureRegistrations({
      systemId: 'tormenta20',
      i18n: {
        format: (key, data) => {
          formatted.push({ key, data });
          return `hint for ${data.default}`;
        },
      },
    }).find((registration) => registration.key === SETTING_KEYS.ITEM_STACK_QUANTITY_PATH);
    assert.equal(entry.definition.hint, 'hint for system.qtd');
    assert.deepEqual(formatted, [
      {
        key: 'FABRICATE.Settings.ItemStackQuantityPath.Hint',
        data: { default: 'system.qtd' },
      },
    ]);
  });

  it('falls back to the raw hint key when i18n is not up yet', () => {
    const entry = captureRegistrations({ systemId: 'dnd5e' }).find(
      (registration) => registration.key === SETTING_KEYS.ITEM_STACK_QUANTITY_PATH
    );
    assert.equal(entry.definition.hint, 'FABRICATE.Settings.ItemStackQuantityPath.Hint');
  });

  it('localizes every key the setting and its advisories use', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const lang = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../lang/en.json'), 'utf8')
    );
    const strings = lang.FABRICATE.Settings.ItemStackQuantityPath;
    for (const key of ['Name', 'Hint', 'Unresolved', 'SchemaDiscard']) {
      assert.equal(typeof strings?.[key], 'string', `missing FABRICATE…ItemStackQuantityPath.${key}`);
    }
    assert.match(strings.Hint, /\{default}/, 'the hint interpolates the active default');
    // The probe advisories are the entire remaining defence against a typo destroying
    // stacks, so each must name the CONSEQUENCE in plain language, not just counts.
    for (const key of ['Unresolved', 'SchemaDiscard']) {
      assert.match(strings[key], /delete/i, `${key} must name what goes wrong`);
      assert.match(strings[key], /\{path}/, `${key} must name the configured path`);
      assert.match(strings[key], /\{default}/, `${key} must suggest the system default`);
    }
  });
});

// ---------------------------------------------------------------------------
// Criterion 10's wiring half. `src/main.js` is the module entry point and cannot be
// imported under `node --test`, so its wiring is pinned against its SOURCE — the same
// shape the actor-type lane's criterion-14 pins use.
// ---------------------------------------------------------------------------

describe('main.js wiring', () => {
  const mainSource = (async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    return readFileSync(resolve(import.meta.dirname, '../src/main.js'), 'utf8');
  })();

  it('configures the path during initialize(), after registerSettings and before migrations', async () => {
    const source = await mainSource;
    const register = source.indexOf('this.registerSettings();');
    const configure = source.indexOf('applyItemStackQuantityPathSetting();');
    const migrate = source.indexOf('await this._runMigrations();');
    assert.ok(register >= 0 && configure >= 0 && migrate >= 0, 'all three call sites exist');
    assert.ok(register < configure, 'the key is not readable until it is registered');
    assert.ok(
      configure < migrate,
      'a migration may touch owned items, so the path must already be live'
    );
  });

  it('RE-CONFIGURES before it probes', async () => {
    const source = await mainSource;
    // Without this ordering a GM editing the path mid-session gets a notification
    // reporting counts for the NEW path while every engine read and write continues on
    // the OLD one until reload — an advisory asserting a state that is not live.
    assert.ok(
      source.indexOf('configureItemStackQuantityPath(stored)') <
        source.indexOf('probeStackQuantityPath('),
      'configure must precede the probe'
    );
  });

  it('drives re-configuration and the probe from the shared setting listener', async () => {
    const source = await mainSource;
    const listener = source.slice(
      source.indexOf('const handleFabricateSettingDocumentChange = (setting) => {'),
      source.indexOf("Hooks.on('updateSetting', handleFabricateSettingDocumentChange);")
    );
    assert.ok(listener.length > 0, 'the shared listener exists');
    assert.match(listener, /SETTING_KEYS\.ITEM_STACK_QUANTITY_PATH/);
    assert.match(listener, /applyItemStackQuantityPathSetting\(\{ notify: true }\)/);
    // A throw inside a setting callback propagates out of `#handleUpdateDocuments`
    // BEFORE `Hooks.callAll("updateSetting")`, killing the broadcast for the whole batch
    // on every client.
    assert.match(listener, /try \{/, 'the listener body is wrapped in try/catch');
    assert.match(listener, /} catch \(error\) \{/);
  });

  it('registers the listener on BOTH createSetting and updateSetting', async () => {
    const source = await mainSource;
    for (const hook of ['updateSetting', 'createSetting']) {
      assert.ok(
        source.includes(`Hooks.on('${hook}', handleFabricateSettingDocumentChange);`),
        `${hook} must reach the shared listener — the FIRST ever write is a create`
      );
    }
  });

  it('also runs the probe from the ready pass', async () => {
    const source = await mainSource;
    const occurrences = source.split('applyItemStackQuantityPathSetting({ notify: true })').length - 1;
    assert.equal(occurrences, 2, 'the setting listener AND the ready pass');
  });
});

describe('player-write guardrail for the stack-quantity key', () => {
  it('the new key is world-scoped, so the seam is capable of refusing it', async () => {
    assert.equal(WORLD_SCOPED_SETTING_KEYS.has(SETTING_KEYS.ITEM_STACK_QUANTITY_PATH), true);
    const seam = makeSettingsSeam({ isGM: false });
    await assert.rejects(
      () => seam.setSetting(SETTING_KEYS.ITEM_STACK_QUANTITY_PATH, 'system.qtd'),
      /lacks permission to update Setting/
    );
    assert.deepEqual(seam.refused, [SETTING_KEYS.ITEM_STACK_QUANTITY_PATH]);
  });

  it('configuring the accessor writes no setting at all', (t) => {
    t.after(resetItemStackQuantityPath);
    const seam = makeSettingsSeam({ isGM: false });
    configureItemStackQuantityPath('system.qtd');
    assert.equal(itemStackQuantityPath(), 'system.qtd');
    assert.deepEqual(seam.writes, [], 'the push is one-way — the accessor never writes back');
    assert.deepEqual(seam.refused, []);
  });
});
