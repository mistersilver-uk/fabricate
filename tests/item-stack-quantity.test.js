/** The canonical item stack-quantity accessor (issue 1024, #853 proposal 1). */

import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { handlerOf, recordNoticeOutput } from './helpers/bootContractProbes.js';
import { withFabricateLifecycleReplay } from './helpers/extension-composition-harness.js';
import { calledName, walkNodes } from './helpers/moduleAst.js';
import { moduleAstOf, sourceAstEntriesUnder } from './helpers/parsedSource.js';
import { repoRoot } from './helpers/sourceScan.js';
import { defineStructureContract } from './helpers/structureContract.js';
import { keyName, shapeCount } from './helpers/structureShapes.js';
import { applyItemStackQuantityPathSetting } from '../src/bootstrap/hooks.js';
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
  STACK_QUANTITY_ADVISORY_KEYS,
  stackQuantityAdvisory,
  stackQuantityUpdate,
  updateStackQuantity,
} from '../src/systems/itemStackQuantity.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import {
  createItemReceiptCollector,
  writeItemAward,
} from '../src/systems/runHistoryEvidence.js';

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

// Criterion 8 — the three read semantics, table-driven over the awkward inputs. Consolidating four
// hand-rolled readers onto three shared ones changed behaviour at six classes of stored value, all
// of them inputs no healthy system produces.

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
  // Delta 6. `essenceResolver` clamped this to 1 before the routing change and now keeps
  // it, so a component storing half a unit multiplies essences by 0.5 rather than by 1.
  { label: 'fractional 0.5', stored: 0.5, read: 0.5, stored1: 0.5, stored0: 0.5, has: true },
  // Delta 2. `Number(Infinity) || 1` is `Infinity`, so `selectedQuantityItems` did
  // `remaining -= Infinity` and terminated after a single item. It now reads as 1.
  {
    label: 'Infinity',
    stored: Number.POSITIVE_INFINITY,
    read: 1,
    stored1: 1,
    stored0: 0,
    has: true,
  },
  // Delta 1. Not in the criterion's list, but the ONE place the three consolidated
  // helpers disagreed before this change, so it is pinned rather than left to chance.
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

// Criterion 8, second half — the per-site mapping table, checked against LIVE SOURCE.

/** Every accessor the table polices (issue 1342). */
const ACCESSORS = Object.freeze([
  'hasStackQuantity',
  'readStackQuantity',
  'readStoredStackQuantity',
  'setStackQuantity',
  'stackQuantityUpdate',
  'updateStackQuantity',
]);

/** The three READ semantics, which must not be collapsed into fewer. */
const READ_ACCESSORS = Object.freeze([
  'hasStackQuantity',
  'readStackQuantity',
  'readStoredStackQuantity',
]);

const SITE_MAPPING = [
  // { site, file, accessor, sites, absentDefault, anchors }
  {
    site: 'componentStacking.awardedQuantityOf',
    file: 'src/systems/componentStacking.js',
    accessor: 'readStackQuantity',
    sites: 1,
    anchors: ['return readStackQuantity(item);'],
  },
  {
    site: 'runHistoryEvidence.sourceItemQuantity stored source read',
    file: 'src/systems/runHistoryEvidence.js',
    accessor: 'readStoredStackQuantity',
    sites: 1,
    absentDefault: null,
    anchors: ['readStoredStackQuantity(source, { path, absentDefault: null })'],
  },
  {
    site: 'runHistoryEvidence.writeItemAward increment write',
    file: 'src/systems/runHistoryEvidence.js',
    accessor: 'updateStackQuantity',
    sites: 1,
    anchors: [
      'updateStackQuantity(existing, before + quantity, path, { throwOnRefusal: true })',
    ],
  },
  {
    site: 'runHistoryEvidence.sourceItemQuantity presence before caller default',
    file: 'src/systems/runHistoryEvidence.js',
    accessor: 'hasStackQuantity',
    sites: 1,
    anchors: ['hasStackQuantity(source, path)'],
  },
  {
    site: 'salvagePipeline.selectedQuantityItems + salvage totalAvailable',
    file: 'src/systems/salvagePipeline.js',
    accessor: 'readStackQuantity',
    sites: 2,
    // Neither is a delete-on-underrun site any more: the salvage consume's capacity read moved to
    // `pooledAllocation.planFirstFitDrain` (issue 1342) and took its delete site with it, one row
    // below.
    anchors: ['remaining -= readStackQuantity(item)', 'sum + readStackQuantity(item)'],
  },
  {
    site: 'pooledAllocation.planFirstFitDrain capacity read (was _consumeComponentItems)',
    file: 'src/systems/pooledAllocation.js',
    accessor: 'readStackQuantity',
    sites: 1,
  },
  {
    site: 'CraftingEngine award creation stackability probe',
    file: 'src/systems/CraftingEngine.js',
    accessor: 'hasStackQuantity',
    sites: 1,
    anchors: ['hasStackQuantity(itemData) || !sourceItem'],
  },
  {
    site: 'CraftingEngine versioned alchemy validation (#1648)',
    file: 'src/systems/CraftingEngine.js',
    accessor: 'readStoredStackQuantity',
    sites: 1,
    absentDefault: 1,
    anchors: ['readStoredStackQuantity(item, { absentDefault: 1 }) < count'],
  },
  {
    // The DELETE half of the boundary below, and the reason it reads the present-item accessor
    // rather than the stored one: the consumption plan counted this document with
    // `readStackQuantity`, so a stack stored at `0` was planned as one unit and must settle as one
    // unit.
    site: 'CraftingEngine._consumeItemQuantity whole-document delete delta (#1648)',
    file: 'src/systems/CraftingEngine.js',
    accessor: 'readStackQuantity',
    sites: 1,
    anchors: ['const whole = readStackQuantity(item?._source ?? item, path);'],
  },
  {
    site: 'CraftingEngine._consumeItemQuantity shared decrement write (#1648)',
    file: 'src/systems/CraftingEngine.js',
    accessor: 'updateStackQuantity',
    sites: 1,
    deleteSites: 1,
    anchors: ['updateStackQuantity(item, before - quantity, path, { throwOnRefusal: true })'],
  },
  {
    site: 'RunJournalBuilder candidate held quantity (#1648)',
    file: 'src/ui/presenters/RunJournalBuilder.js',
    accessor: 'readStackQuantity',
    sites: 1,
    anchors: ['const held = readStackQuantity(item);'],
  },
  {
    site: 'CraftingEngine._restoreComponentItem + award creation (payload writes)',
    file: 'src/systems/CraftingEngine.js',
    accessor: 'setStackQuantity',
    sites: 2,
    anchors: ['setStackQuantity(itemData, qty);', 'setStackQuantity(itemData, amount);'],
  },
  {
    // The three re-derived held totals the display states report: a group's own `have`, one
    // option choice's isolated `have`, and one held stack row's.
    site: 'recipeDisplayStates have counts',
    file: 'src/systems/recipeDisplayStates.js',
    accessor: 'readStackQuantity',
    sites: 3,
    // One probe for all three: the third sits in an object key, which no probe can parse alone.
    anchors: ['readStackQuantity(item)'],
  },
  {
    site: 'InventoryListingBuilder owned counts',
    file: 'src/ui/presenters/InventoryListingBuilder.js',
    accessor: 'readStackQuantity',
    sites: 1,
  },
  {
    // The snapshot's per-system tallies (issue 1077).
    site: 'inventorySnapshot component/tag tallies',
    file: 'src/systems/inventorySnapshot.js',
    accessor: 'readStackQuantity',
    sites: 1,
  },
  {
    // Bulk destroy removes WHOLE STACKS, so the pre-delete capture has to read the stack count
    // through the configured accessor — `unitsDeleted` is derived from it.
    site: 'BulkDestroyService pre-delete capture',
    file: 'src/systems/BulkDestroyService.js',
    accessor: 'readStackQuantity',
    sites: 1,
  },
  {
    site: 'AlchemyListingBuilder held counts',
    file: 'src/ui/presenters/AlchemyListingBuilder.js',
    accessor: 'readStackQuantity',
    sites: 1,
  },
  {
    site: 'ingredientLedger.seedRemaining (ledger seed)',
    file: 'src/models/ingredientLedger.js',
    accessor: 'readStackQuantity',
    sites: 1,
  },
  {
    site: 'essenceResolver multiplyByQuantity',
    file: 'src/utils/essenceResolver.js',
    accessor: 'readStackQuantity',
    sites: 1,
  },
  {
    site: 'alchemySubmissions unit expansion (keeps its own Math.trunc)',
    file: 'src/utils/alchemySubmissions.js',
    accessor: 'readStackQuantity',
    sites: 1,
  },
  {
    site: 'knowledgeSnapshot owned copies',
    file: 'src/systems/knowledgeSnapshot.js',
    accessor: 'readStackQuantity',
    sites: 1,
  },
  {
    site: 'sourceUuid.findStackableMatch (stackability probe)',
    file: 'src/utils/sourceUuid.js',
    accessor: 'hasStackQuantity',
    sites: 1,
  },
  {
    site: 'gatheringResultCreation award stackability probe',
    file: 'src/gatheringResultCreation.js',
    accessor: 'hasStackQuantity',
    sites: 1,
    anchors: ['hasStackQuantity(itemData) || result.quantity'],
  },
  {
    site: 'gatheringResultCreation new-award payload write',
    file: 'src/gatheringResultCreation.js',
    accessor: 'setStackQuantity',
    sites: 1,
    anchors: ['setStackQuantity(itemData, quantity)'],
  },
  {
    site: 'toolBreakageRuntime replacement payload write',
    file: 'src/toolBreakageRuntime.js',
    accessor: 'setStackQuantity',
    sites: 1,
  },
  {
    site: 'companionComponentAward payload stackability probe',
    file: 'src/systems/companionComponentAward.js',
    accessor: 'hasStackQuantity',
    sites: 1,
    anchors: ['hasStackQuantity(itemData, quantityPath) || !sourceItem'],
  },
  {
    site: 'companionComponentAward payload quantity write',
    file: 'src/systems/companionComponentAward.js',
    accessor: 'setStackQuantity',
    sites: 1,
    anchors: ['setStackQuantity(itemData, quantity, quantityPath)'],
  },
  {
    site: 'companionComponentAward WRITTEN-VALUE test on the payload',
    file: 'src/systems/companionComponentAward.js',
    accessor: 'readStoredStackQuantity',
    sites: 1,
    absentDefault: 1,
    // The award refuses `multiUnitUnsupported` when this read does not answer the quantity
    // just written, which is what a presence test cannot see: a GM who configures the PARENT
    // of the count leaves `hasStackQuantity` answering true while the write no-ops.
    anchors: [
      'readStoredStackQuantity(itemData, { absentDefault: 1, path: quantityPath }) !== quantity',
    ],
  },
  {
    site: 'companionComponentAward stack-target base read',
    file: 'src/systems/companionComponentAward.js',
    accessor: 'readStoredStackQuantity',
    sites: 1,
    // A missing stack base creates a separate document rather than inventing a count.
    absentDefault: null,
    anchors: ['readStoredStackQuantity(target, { absentDefault: null, path: quantityPath })'],
  },
  {
    site: 'companionComponentAward stack write',
    file: 'src/systems/companionComponentAward.js',
    accessor: 'updateStackQuantity',
    sites: 1,
    anchors: ['updateStackQuantity(target, before + quantity, quantityPath)'],
  },
  {
    // The pooled holdings READ counts what a party is carrying (issue 1342), and it must count it
    // with the reader the pooled CONSUME's first-fit drain spends: `pooledAllocation.js` uses
    // `readStackQuantity` and states that the choice is not a parameter.
    site: 'companionPooledHoldings pooled component count',
    file: 'src/systems/companionPooledHoldings.js',
    accessor: 'readStackQuantity',
    sites: 1,
  },
  {
    // The pooled holdings consume batches its writes per actor, so it needs the update PAYLOAD
    // rather than the live-document writer every other decrement site uses (issue 1342).
    site: 'companionPooledConsumption batched reduction and its rollback',
    file: 'src/systems/companionPooledConsumption.js',
    accessor: 'stackQuantityUpdate',
    sites: 2,
    anchors: [
      'stackQuantityUpdate(take.item, take.remainingQuantity)',
      'stackQuantityUpdate(take.item, take.available)',
    ],
  },
];

/** The accessor module itself, which DEFINES these names and must not be counted. */
const ACCESSOR_MODULE = 'src/systems/itemStackQuantity.js';

const srcSyntaxTrees = () =>
  sourceAstEntriesUnder('src').filter(([path]) => path !== ACCESSOR_MODULE);

/**
 * Count the calls of each accessor per file across the whole `src` tree; a comment is no call.
 *
 * @returns {Map<string, number>} `${file}::${accessor}` -> occurrences.
 */
function countAccessorCallSites() {
  const counts = new Map();
  for (const [path, ast] of srcSyntaxTrees()) {
    for (const node of walkNodes(ast)) {
      const accessor = calledName(node);
      if (!ACCESSORS.includes(accessor)) continue;
      const key = `${path}::${accessor}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/** The same shape, built from the declared table. */
function declaredAccessorCallSites() {
  const counts = new Map();
  for (const entry of SITE_MAPPING) {
    const key = `${entry.file}::${entry.accessor}`;
    counts.set(key, (counts.get(key) ?? 0) + entry.sites);
  }
  return counts;
}

/** `[key, count]` pairs, sorted, so a diff names the file and accessor that drifted. */
const asSortedPairs = (counts) => [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));

/** The `absentDefault: <value>` keys each file writes, as literals. */
function countAbsentDefaults(value) {
  const counts = new Map();
  for (const [path, ast] of srcSyntaxTrees()) {
    const matches = [...walkNodes(ast)].filter(
      (node) =>
        node.type === 'Property' &&
        keyName(node) === 'absentDefault' &&
        node.value?.type === 'Literal' &&
        node.value.value === value
    ).length;
    if (matches > 0) counts.set(path, matches);
  }
  return counts;
}

/** Files contributing more than one row, which therefore have accessors to swap. */
function anchorsRequired() {
  const rowsPerFile = new Map();
  for (const entry of SITE_MAPPING) {
    rowsPerFile.set(entry.file, (rowsPerFile.get(entry.file) ?? 0) + 1);
  }
  return new Set([...rowsPerFile].filter(([, rows]) => rows > 1).map(([file]) => file));
}

describe('the per-site accessor mapping', () => {
  it('matches live src/** occurrence-for-occurrence, in both directions', () => {
    // THE load-bearing assertion of this whole table. Un-routing a site, adding a new one
    // in a file the table does not name, or moving a site between files all red here.
    assert.deepEqual(asSortedPairs(countAccessorCallSites()), asSortedPairs(declaredAccessorCallSites()));
  });

  it('pins every row of a multi-row file to the source snippet it serves', () => {
    // The assertion the per-file counts cannot make. Each anchor is a parsed probe, counted
    // shape for shape, so a comment or a reflow neither satisfies nor breaks it.
    for (const entry of SITE_MAPPING) {
      if (!entry.anchors) continue;
      const { ast } = moduleAstOf(entry.file);
      let matched = 0;
      for (const anchor of entry.anchors) {
        const occurrences = shapeCount(ast, anchor);
        assert.ok(occurrences > 0, `${entry.site}: \`${anchor}\` matches nothing in ${entry.file}`);
        matched += occurrences;
      }
      assert.equal(matched, entry.sites, `${entry.site}: anchors must account for every site`);
    }
  });

  it('requires those anchors on every row of every multi-row file', () => {
    // A rule, not a hand-picked file list: a file that gains a second row — and therefore
    // a second accessor to be confused with — has to anchor both of them.
    const required = anchorsRequired();
    assert.ok(required.size >= 3, `expected the multi-row files, found ${[...required]}`);
    for (const entry of SITE_MAPPING) {
      if (!required.has(entry.file)) continue;
      assert.ok(
        entry.anchors?.length > 0,
        `${entry.site} shares ${entry.file} with another accessor and must declare anchors`
      );
    }
  });

  it('scanned real source — a scan that matched nothing would pass vacuously', () => {
    const counts = countAccessorCallSites();
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    assert.ok(total >= 30, `expected the routed call sites, counted ${total}`);
    assert.ok(counts.has('src/systems/CraftingEngine.js::readStackQuantity'));
  });

  it('names exactly three read semantics, and no fourth', () => {
    const readSites = SITE_MAPPING.filter((entry) => READ_ACCESSORS.includes(entry.accessor));
    assert.deepEqual([...new Set(readSites.map((entry) => entry.accessor))].sort(), [
      ...READ_ACCESSORS,
    ]);
    for (const entry of SITE_MAPPING) {
      assert.ok(ACCESSORS.includes(entry.accessor), `${entry.site} names an unknown accessor`);
    }
  });

  it('uses only 1, 0 and null as absent defaults, and only on the stored reader', () => {
    // `null` is the third value, and it is a DIFFERENT KIND of answer from the other two:
    // 1 and 0 supply a base, while `null` says the item carries no readable count at all and
    // hands the decision back to the caller.
    const ABSENT_DEFAULTS = [0, 1, null];
    for (const entry of SITE_MAPPING) {
      if (entry.accessor === 'readStoredStackQuantity') {
        assert.ok(
          ABSENT_DEFAULTS.includes(entry.absentDefault),
          `${entry.site} must declare an absent default`
        );
      } else {
        assert.equal(entry.absentDefault, undefined, `${entry.site} takes no absent default`);
      }
    }
  });

  it('records exactly one absent-default-0 site, and live source agrees', () => {
    // `gatheringResultCreation` is the odd one out and is deliberately NOT consolidated
    // onto `createOrStackComponentItem`, which defaults an absent field to 1. Flipping
    // that 0 to a 1 inflates every gathered stack by one on the very first award onto an
    // existing item, and it is the drift a reviewer used to prove the earlier table
    // discovered nothing — so it is asserted against SOURCE, not against the table.
    assert.deepEqual(
      [...countAbsentDefaults(0).entries()],
      [['src/gatheringResultCreation.js', 1]],
      'exactly one `absentDefault: 0` in src/**, and only in gatheringResultCreation.js'
    );
  });

  it('records the stored-reader and measured-delta unknown defaults exactly', () => {
    const nullDefault = SITE_MAPPING.filter((entry) => entry.absentDefault === null);
    assert.deepEqual(
      nullDefault.map((entry) => entry.site),
      ['runHistoryEvidence.sourceItemQuantity stored source read', 'companionComponentAward stack-target base read']
    );
    // Sorted, like its sibling below (issue 1648).
    assert.deepEqual(
      asSortedPairs(countAbsentDefaults(null)),
      asSortedPairs(
        new Map([
          ['src/systems/companionComponentAward.js', 1],
          ['src/systems/CraftingEngine.js', 1],
          ['src/systems/runHistoryEvidence.js', 2],
        ])
      ),
      'post-write measurements remain unknown when the quantity field is absent'
    );
  });

  it('every declared absent-default-1 site is spelled that way in live source', () => {
    const declared = new Map();
    for (const entry of SITE_MAPPING) {
      if (entry.absentDefault !== 1) continue;
      declared.set(entry.file, (declared.get(entry.file) ?? 0) + entry.sites);
    }
    assert.deepEqual(asSortedPairs(countAbsentDefaults(1)), asSortedPairs(declared));
  });

  it('records one shared consumption delete/decrement boundary', () => {
    // Counted from an explicit field rather than parsed out of the label: a label-substring
    // filter reads as a check while actually depending on prose nobody validates.
    const total = SITE_MAPPING.reduce((sum, entry) => sum + (entry.deleteSites ?? 0), 0);
    // The failure message names the rows the count is made of rather than restating a list of
    // site labels in prose: the labels drifted once already, and a stale one in an assertion
    // message reads as a fact about the codebase while depending on nothing.
    const contributors = SITE_MAPPING.filter((entry) => (entry.deleteSites ?? 0) > 0).map(
      (entry) => `${entry.site} (${entry.deleteSites})`
    );
    assert.equal(total, 1, `expected one shared delete-on-underrun site: ${contributors.join('; ')}`);
    for (const entry of SITE_MAPPING) {
      assert.ok(
        (entry.deleteSites ?? 0) <= entry.sites,
        `${entry.site} cannot have more delete sites than call sites`
      );
    }
    // Each delete site has an `await (underrun ? item.delete() : updateStackQuantity(...))`
    // partner, so the engine's write count must equal its delete-site count.
    const engineWrites = SITE_MAPPING.filter(
      (entry) =>
        entry.file === 'src/systems/CraftingEngine.js' && entry.accessor === 'updateStackQuantity'
    ).reduce((sum, entry) => sum + entry.sites, 0);
    assert.equal(engineWrites, 1);
  });
});

// Criterion 9 — configure and normalize never throw and never store a falsy path.

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

// Criterion 7 — a >= 3-segment path round-trips; a `.value` leaf preserves siblings; an
// object-valued parent write is refused.

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

// Criterion 10 — the probe, including the `_source` verdict.

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
    // The load-bearing fixture: `_source.system` has NO `qtd` key at all, while the prepared
    // document does.
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

  it('measures the SUGGESTED default it was given, not the built-in one', () => {
    // On tormenta20 the suggested correction is `system.qtd`, and the counts printed beside it in
    // the advisory have to be counts FOR IT.
    const items = [
      itemWithSource({ prepared: { qtd: 20 }, source: { qtd: 20 } }),
      itemWithSource({ prepared: { qtd: 3 }, source: { qtd: 3 } }),
    ];
    const report = probeStackQuantityPath(items, {
      path: 'system.quantidade',
      defaultPath: 'system.qtd',
    });
    assert.equal(report.verdict, 'unresolved');
    assert.equal(report.defaultPath, 'system.qtd');
    assert.equal(report.defaultResolved, 2, 'counted against the PASSED default');
    assert.equal(report.resolved, 0);
  });
});

// The advisory selector. The hooks edge reaches Foundry globals at call time, which is exactly why
// this decision lives in the accessor module: a three-way branch pinned only by grepping `main.js`
// is not evidence that the right string reaches the right world.

describe('stackQuantityAdvisory', () => {
  const reportFor = (overrides) => ({
    path: 'system.qtd',
    defaultPath: 'system.qtd',
    total: 10,
    resolved: 0,
    sourceCandidates: 0,
    sourceResolved: 0,
    defaultResolved: 0,
    verdict: 'unresolved',
    ...overrides,
  });

  it('says nothing for a healthy world, an empty one, or a missing report', () => {
    assert.equal(stackQuantityAdvisory(reportFor({ verdict: 'ok', resolved: 10 })), null);
    assert.equal(stackQuantityAdvisory(reportFor({ verdict: 'no-items', total: 0 })), null);
    assert.equal(stackQuantityAdvisory(null), null);
    assert.equal(stackQuantityAdvisory(undefined), null);
  });

  it('asserts the CERTAINTY when the configured path is not the suggested one', () => {
    const advisory = stackQuantityAdvisory(
      reportFor({ path: 'system.quantidade', defaultPath: 'system.qtd', defaultResolved: 10 })
    );
    assert.equal(advisory.key, STACK_QUANTITY_ADVISORY_KEYS.unresolved);
    assert.deepEqual(advisory.data, {
      path: 'system.quantidade',
      total: 10,
      resolved: 0,
      default: 'system.qtd',
      defaultResolved: 10,
    });
  });

  it('keeps the certainty even when the suggested default resolves on nothing either', () => {
    // The tempting "suppress whenever the default resolves nothing" shortcut would delete
    // the warning for a GM who typo'd on a system whose real field is neither path — the
    // exact user this advisory exists for.
    const advisory = stackQuantityAdvisory(
      reportFor({ path: 'system.qty', defaultPath: 'system.qtd', defaultResolved: 0 })
    );
    assert.equal(advisory.key, STACK_QUANTITY_ADVISORY_KEYS.unresolved);
  });

  it('states the CONDITIONAL when the configured path already IS the suggested default', () => {
    // A dnd5e world whose Item directory holds only spells, feats, classes and backgrounds.
    const advisory = stackQuantityAdvisory(
      reportFor({ path: 'system.quantity', defaultPath: 'system.quantity', defaultResolved: 0 })
    );
    assert.equal(advisory.key, STACK_QUANTITY_ADVISORY_KEYS.unresolvedAtDefault);
    assert.notEqual(advisory.key, STACK_QUANTITY_ADVISORY_KEYS.unresolved);
    assert.equal(advisory.data.path, 'system.quantity');
  });

  it('still WARNS in that case — the defence is reworded, never removed', () => {
    const advisory = stackQuantityAdvisory(
      reportFor({ path: 'system.quantity', defaultPath: 'system.quantity', defaultResolved: 0 })
    );
    assert.ok(advisory, 'a world on the default with nothing resolving still gets a warning');
  });

  it('routes a schema discard ahead of every unresolved branch', () => {
    const advisory = stackQuantityAdvisory(
      reportFor({ verdict: 'schema-discard', resolved: 10, sourceCandidates: 10 })
    );
    assert.equal(advisory.key, STACK_QUANTITY_ADVISORY_KEYS.schemaDiscard);
  });

  it('puts the report defaultPath — and nothing else — into {default}', () => {
    // `{default}` is what the GM is told to type.
    for (const defaultPath of ['system.qtd', 'system.quantity', 'system.stack.count']) {
      const advisory = stackQuantityAdvisory(reportFor({ path: 'system.nope', defaultPath }));
      assert.equal(advisory.data.default, defaultPath);
    }
    assert.notEqual(
      stackQuantityAdvisory(reportFor({ path: 'system.nope', defaultPath: 'system.qtd' })).data
        .default,
      DEFAULT_ITEM_STACK_QUANTITY_PATH,
      'the built-in default must not leak in when a preset was supplied'
    );
  });
});

// The accessor is Foundry-free. `src/models/ingredientLedger.js` is a call site and
// `openspec/specs/data-models/spec.md` commits the ingredient model to being Foundry-free, so this
// is a contract, not a preference.

defineStructureContract(
  'the accessor never reaches for a Foundry global',
  ACCESSOR_MODULE,
  { namesNo: ['game', 'ui', 'Hooks', 'CONFIG'], exports: ['readStackQuantity'] }
);

// Registration: the per-system default overlay, and the player-write guardrail.

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
    // Load-bearing: `ClientSettings#register` applies `data.default ??= null`, which would make
    // every read return `null` rather than a usable path.
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
    for (const key of ['Name', 'Hint', 'Unresolved', 'UnresolvedAtDefault', 'SchemaDiscard']) {
      assert.equal(typeof strings?.[key], 'string', `missing FABRICATE…ItemStackQuantityPath.${key}`);
    }
    assert.match(strings.Hint, /\{default}/, 'the hint interpolates the active default');
    // The probe advisories are the remaining defence against a typo destroying stacks, so
    // each must name the CONSEQUENCE in plain language, not just counts.
    for (const key of ['Unresolved', 'SchemaDiscard']) {
      assert.match(strings[key], /delete/i, `${key} must name what goes wrong`);
      assert.match(strings[key], /\{path}/, `${key} must name the configured path`);
      assert.match(strings[key], /\{default}/, `${key} must suggest the system default`);
    }
  });

  it('resolves EVERY advisory key the selector can return', () => {
    // The selector and the language file are two hand-maintained halves of one contract:
    // a key added to one and not the other renders as the raw key id in a toast.
    const lang = JSON.parse(readFileSync(join(repoRoot, 'lang', 'en.json'), 'utf8'));
    for (const key of Object.values(STACK_QUANTITY_ADVISORY_KEYS)) {
      const resolved = key
        .split('.')
        .reduce((node, segment) => (node === undefined ? undefined : node?.[segment]), lang);
      assert.equal(typeof resolved, 'string', `${key} has no entry in lang/en.json`);
      assert.notEqual(resolved.trim(), '');
    }
  });

  it('states the already-on-the-default case CONDITIONALLY, not as a certainty', () => {
    const lang = JSON.parse(readFileSync(join(repoRoot, 'lang', 'en.json'), 'utf8'));
    const copy = lang.FABRICATE.Settings.ItemStackQuantityPath.UnresolvedAtDefault;
    assert.match(copy, /\{path}/, 'it still names the configured path');
    assert.match(copy, /delete/i, 'and still names the consequence');
    // The two halves of the conditional, which is the whole point of this third string:
    // the benign reading has to be offered, and the destructive one has to be hedged.
    assert.match(copy, /no stackable items yet|has no stackable items/i, 'offers the benign reading');
    assert.match(copy, /\bif your items do carry stack counts\b/i, 'and hedges the destructive one');
    // The retired copy told a GM already on the default to change the setting to the
    // value it already had, and asserted destruction that was not happening.
    assert.equal(
      /Until you correct it/i.test(copy),
      false,
      'a world sitting on its own default has not necessarily got anything to correct'
    );
  });
});

// Criterion 10's wiring half: `applyItemStackQuantityPathSetting` is the edge both the ready pass
// and the shared setting listener call. The ORDERING half — registerSettings, then the path, then
// the migration pass — is pinned by the composition log in
// `tests/bootstrap/fabricate-boot-contract.test.js` (issue 1715), which also holds
// `createSetting` and `updateSetting` to one listener.

describe('the hooks edge configures the stored path, then probes it', () => {
  /** Run the edge in a world storing `stored`, recording what it formats and posts. */
  function applyInWorld({ stored, items, systemId = 'tormenta20', isGM = true, notify = true }) {
    const formatted = [];
    const warned = [];
    const previous = { game: globalThis.game, ui: globalThis.ui };
    globalThis.game = {
      user: { isGM },
      system: { id: systemId },
      items,
      settings: {
        get: (namespace, key) => {
          assert.deepEqual([namespace, key], ['fabricate', SETTING_KEYS.ITEM_STACK_QUANTITY_PATH]);
          return stored;
        },
      },
      i18n: { format: (key, data) => formatted.push({ key, data }) && `formatted ${key}` },
    };
    globalThis.ui = { notifications: { warn: (...args) => warned.push(args) } };
    try {
      return { path: applyItemStackQuantityPathSetting({ notify }), formatted, warned };
    } finally {
      Object.assign(globalThis, previous);
      resetItemStackQuantityPath();
    }
  }

  const heldAt = (path) => [itemAt(path, 3), itemAt(path, 5)];

  it('suggests the ACTIVE SYSTEM preset, formatted from the shared pure selector', () => {
    // `stackQuantityAdvisory` puts `report.defaultPath` into `{default}`, so whatever the edge
    // passes is literally the field the GM is told to type; the three-way branch lives in the
    // accessor module, so the edge must not re-spell the keys it selects.
    const schemaDiscard = [itemWithSource({ prepared: { count: 3 }, source: { quantity: 3 } })];
    const keys = [];
    for (const items of [heldAt('system.quantity'), schemaDiscard]) {
      const { formatted, warned } = applyInWorld({ stored: 'system.count', items });
      const report = probeStackQuantityPath(items, {
        path: 'system.count',
        defaultPath: stackQuantityPathPresetFor('tormenta20'),
      });
      const advisory = stackQuantityAdvisory(report);
      assert.equal(advisory.data.default, 'system.qtd', 'the tormenta20 preset, not the default');
      assert.deepEqual(formatted, [{ key: advisory.key, data: advisory.data }]);
      assert.deepEqual(warned, [[`formatted ${advisory.key}`, { permanent: true }]]);
      keys.push(advisory.key);
    }
    assert.deepEqual(keys, [
      STACK_QUANTITY_ADVISORY_KEYS.unresolved,
      STACK_QUANTITY_ADVISORY_KEYS.schemaDiscard,
    ]);
  });

  it('RE-CONFIGURES before it probes', () => {
    // Otherwise a GM editing the path mid-session is told about the NEW path while every read and
    // write continues on the OLD one until reload. Healthy at the new path: nothing to report.
    const { path, warned } = applyInWorld({ stored: 'system.qtd', items: heldAt('system.qtd') });
    assert.equal(path, 'system.qtd');
    assert.deepEqual(warned, [], 'the probe read the path just configured');
    const unread = applyInWorld({ stored: null, items: heldAt('system.quantity') });
    assert.deepEqual([unread.path, unread.warned], ['system.quantity', []]);
  });

  it('configures on every client, and notifies only a GM that asked', () => {
    for (const [isGM, notify] of [
      [false, true],
      [true, false],
    ]) {
      const items = heldAt('system.quantity');
      const run = applyInWorld({ stored: 'system.count', items, isGM, notify });
      assert.equal(run.path, 'system.count', 'the engine path is live everywhere');
      assert.deepEqual([run.formatted, run.warned], [[], []], 'and nobody else is told');
    }
  });
});

const LAB_BOOT = { timeout: 300000 };

test('the ready pass and the setting listener both reach the edge, wrapped', LAB_BOOT, async () => {
  await withFabricateLifecycleReplay(async ({ ready, loadModule }) => {
    await loadModule('/src/main.js');
    const lab = await loadModule('/src/systems/itemStackQuantity.js');
    const store = (path) =>
      globalThis.game.settings.set('fabricate', SETTING_KEYS.ITEM_STACK_QUANTITY_PATH, path);
    const probed = (output, path) =>
      output.posted.some(
        ([level, message, options]) =>
          level === 'warn' && String(message).includes(path) && options?.permanent === true
      );

    await store('system.labready');
    const booted = await recordNoticeOutput(() => ready());
    assert.equal(lab.itemStackQuantityPath(), 'system.labready', 'the ready pass configures');
    assert.ok(probed(booted, 'system.labready'), 'and probes, notifying the GM');

    // Core `createSetting` passes `(document, options, userId)`; the first write is a create.
    const listener = handlerOf('createSetting');
    const key = `fabricate.${SETTING_KEYS.ITEM_STACK_QUANTITY_PATH}`;
    await store('system.labedit');
    const edited = await recordNoticeOutput(() => listener({ key }, {}, 'user-lab-gm'));
    assert.equal(lab.itemStackQuantityPath(), 'system.labedit', 'the listener re-configures');
    assert.ok(probed(edited, 'system.labedit'), 'and probes on change, not only at startup');

    // A failure in one branch is logged as Fabricate's own line naming the setting change, not a
    // core `Hooks.onError` entry against an anonymous listener.
    const items = Object.getOwnPropertyDescriptor(globalThis.game, 'items');
    Object.defineProperty(globalThis.game, 'items', {
      configurable: true,
      get: () => {
        throw new Error('the world scan exploded');
      },
    });
    try {
      const failed = await recordNoticeOutput(() => listener({ key }, {}, 'user-lab-gm'));
      assert.ok(
        failed.logged.some(
          ([level, line]) =>
            level === 'error' && line === 'Fabricate | Failed to handle a Fabricate setting change'
        )
      );
    } finally {
      Object.defineProperty(globalThis.game, 'items', items);
    }
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

// The hole the two `stackQuantityUpdate` anchors in `SITE_MAPPING` cannot close: which function
// writes which half of the pair.
for (const [name, own, other] of [
  ['reduceStacks', 'take.remainingQuantity', 'take.available'],
  ['restoreStacks', 'take.available', 'take.remainingQuantity'],
]) {
  defineStructureContract(
    `the pooled ${name} writes ${own}, never the other half of the pair`,
    { file: 'src/systems/companionPooledConsumption.js', fn: name },
    {
      contains: [`stackQuantityUpdate(take.item, ${own})`],
      containsNo: [`stackQuantityUpdate(take.item, ${other})`],
    }
  );
}

// A GUARD REFUSAL IS NOT A LOST ACKNOWLEDGEMENT (#1648 A4).

describe('a refused write is distinguishable from an unacknowledged one', () => {
  // The divergence is modelled EXPLICITLY, and it is what makes the guard reachable from an
  // acknowledgement site at all: the quantity is read from `_source` (a number, so the site
  // proceeds) while the guard reads the PREPARED document, where derived data or an Active Effect
  // has put an object.
  function divergentItem() {
    return {
      name: 'Iron Ingot',
      system: { quantity: { value: 20 } },
      _source: { system: { quantity: 20 } },
      update: async () => {
        throw new Error('update must never be reached on a refusal');
      },
    };
  }

  it('throws its own definite error rather than answering the acknowledgement null', async (t) => {
    captureWarnings(t);
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath('system.quantity');
    await assert.rejects(
      () => updateStackQuantity(divergentItem(), 19, undefined, { throwOnRefusal: true }),
      (error) => error.code === 'STACK_QUANTITY_PATH_REFUSED' && error.path === 'system.quantity'
    );
  });

  it('keeps answering null for a caller whose null does not mean uncertainty', async (t) => {
    captureWarnings(t);
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath('system.quantity');
    // The companion-award stack branch publishes `awardFailed` as RETRY-SAFE from this `null`,
    // which is already the right reading of a write that never happened.
    assert.equal(await updateStackQuantity(divergentItem(), 19), null);
  });

  it('reports a refused consumption as definite rather than as needing reconciliation', async (t) => {
    captureWarnings(t);
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath('system.quantity');
    const engine = new CraftingEngine({ getRecipe: () => null }, null);
    await assert.rejects(
      () => engine._consumeIngredients([{ item: divergentItem(), quantity: 1, ingredient: null }]),
      (error) => {
        assert.equal(error.code, 'STACK_QUANTITY_PATH_REFUSED', 'a definite failure');
        return true;
      }
    );
  });

  it('reports a refused award as definite rather than as needing reconciliation', async (t) => {
    captureWarnings(t);
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath('system.quantity');
    await assert.rejects(
      () => writeItemAward({ existing: divergentItem(), quantity: 1 }),
      (error) => {
        assert.equal(error.code, 'STACK_QUANTITY_PATH_REFUSED', 'a definite failure');
        return true;
      }
    );
  });

  it('still reports an unacknowledged decrement as uncertain', async (t) => {
    // THE OTHER DIRECTION, on the same code path: a healthy path whose `update` resolves
    // nothing is a real lost acknowledgement and must keep demanding reconciliation.
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath('system.qtd');
    const engine = new CraftingEngine({ getRecipe: () => null }, null);
    const item = {
      name: 'Iron Ingot',
      system: { qtd: 20 },
      _source: { system: { qtd: 20 } },
      update: async () => undefined,
    };
    await assert.rejects(
      () => engine._consumeIngredients([{ item, quantity: 1, ingredient: null }]),
      (error) => error.code === 'HISTORY_EFFECT_UNCERTAIN'
    );
  });
});

// AN ACKNOWLEDGED SHORT WRITE IS NOT A COMPLETE ONE (#1648 Q-M1).

describe('an acknowledged write that landed short still demands reconciliation', () => {
  /** A document that acknowledges its own update but only moves the stack by `moved`. */
  function shortItem(before, moved) {
    return {
      name: 'Iron Ingot',
      uuid: 'Actor.a.Item.ingot',
      system: { quantity: before },
      _source: { system: { quantity: before } },
      async update() {
        this._source.system.quantity = before + moved;
        this.system.quantity = before + moved;
        return this;
      },
    };
  }

  /** An actor that acknowledges the creation but with `created` in the stack, not what was asked. */
  function shortActor(created) {
    const actor = { uuid: 'Actor.a' };
    actor.createEmbeddedDocuments = async (_type, [data]) => [
      {
        ...data,
        uuid: `${actor.uuid}.Item.ingot`,
        parent: actor,
        system: { quantity: created },
        _source: { system: { quantity: created } },
      },
    ];
    return actor;
  }

  const uncertain = (error) => {
    assert.equal(error.code, 'HISTORY_EFFECT_UNCERTAIN');
    return true;
  };

  it('refuses an increment the document acknowledged but applied short', async (t) => {
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath('system.quantity');
    const receiptCollector = createItemReceiptCollector();

    // The control: the full delta lands, so the award settles and its receipt is the whole of it.
    const exact = shortItem(2, 5);
    assert.equal(await writeItemAward({ existing: exact, quantity: 5, receiptCollector }), exact);
    assert.deepEqual(
      receiptCollector.snapshot().map((receipt) => receipt.quantity),
      [5]
    );

    await assert.rejects(
      () => writeItemAward({ existing: shortItem(2, 1), quantity: 5, receiptCollector }),
      uncertain
    );
    // The partial delta is RETAINED, because reconciliation needs to know what really landed.
    assert.deepEqual(
      receiptCollector.snapshot().map((receipt) => receipt.quantity),
      [5, 1]
    );
  });

  it('refuses a creation the actor acknowledged with a smaller stack than requested', async (t) => {
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath('system.quantity');
    const receiptCollector = createItemReceiptCollector();
    const award = (actor, quantity) =>
      writeItemAward({
        actor,
        itemData: { name: 'Iron Ingot', system: { quantity } },
        quantity,
        receiptCollector,
      });

    assert.equal((await award(shortActor(4), 4)).uuid, 'Actor.a.Item.ingot');
    await assert.rejects(() => award(shortActor(1), 4), uncertain);
    assert.deepEqual(
      receiptCollector.snapshot().map((receipt) => receipt.quantity),
      [4, 1]
    );
  });
});
