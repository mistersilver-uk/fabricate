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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { collectSources, repoRoot, stripComments } from './helpers/sourceScan.js';
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
//
// ## The SIX declared behaviour deltas
//
// Consolidating four hand-rolled readers onto three shared ones changed behaviour at six
// classes of stored value, all of them inputs no healthy system produces. They are listed
// here — in the tree, not only in a commit message — and every one is pinned by a row
// below, so a later "simplification" that quietly reverts one reds this file:
//
//   1. NEGATIVE. The `Number(x) || 1` sites passed a negative through; `readStackQuantity`
//      now returns 1. `readStoredStackQuantity` still reports it as stored, because at a
//      delete site "-3" must not read as "3 available".
//   2. `Infinity`. Same sites, same shape: `Number(Infinity) || 1` is `Infinity`, so
//      `CraftingEngine.selectedQuantityItems` did `remaining -= Infinity` and stopped
//      selecting after ONE item. `readStackQuantity` now returns 1.
//   3. NUMERIC STRING. The `?? 1` sites returned the string `'3'`; the accessors coerce.
//   4. `NaN`. The `?? 1` sites returned `NaN` (it is neither `undefined` nor `null`), which
//      propagates through every sum it touches. The accessors fall back instead.
//   5. EXPLICIT `null`. The two `!== undefined` presence probes treated a stored `null` as
//      present; `hasStackQuantity` treats it as absent, so an item whose count field is
//      explicitly null no longer counts as stackable.
//   6. A FRACTION BELOW ONE. `essenceResolver.js`'s multiplier was
//      `Math.max(1, Number(...) || 1)`, which clamped `0.5` up to `1`; `readStackQuantity`
//      keeps it fractional, because its floor is at zero and not at one. This is the only
//      delta that CHANGES A RESULT for a value a system could plausibly store, so it is
//      called out rather than filed under "inputs nobody produces".
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

// ---------------------------------------------------------------------------
// Criterion 8, second half — the per-site mapping table, checked against LIVE SOURCE.
//
// Each routed call site declares its file, which accessor it uses, how many occurrences
// it accounts for, and — for the stored reader — which absent default preserves what it
// did before the routing change.
//
// The earlier revision of this table was CIRCULAR: every assertion read `SITE_MAPPING`
// and asserted a fact about `SITE_MAPPING`, so nothing read `src/**` and the table
// discovered nothing. A reviewer proved it by flipping `gatheringResultCreation`'s
// `absentDefault: 0` to `1` — the exact "silently inflates every stack by one" failure
// the table exists to prevent — and the whole file still passed.
//
// So the table is now MECHANICAL. Every declared `(file, accessor, sites)` triple is
// reconciled against a comment-stripped scan of `src/**`, in BOTH directions: a declared
// site that no longer exists reds, and a call site in a file the table does not name reds
// too. That closes un-routing, a new site, a site moved between files, and absent-default
// drift.
//
// ## What the per-file counts CANNOT see, and what the anchors add
//
// Per-file counts are blind to two accessors being SWAPPED BETWEEN SITES IN ONE FILE:
// every reconciled count survives such a swap intact. A reviewer proved that too, by
// exchanging the accessors at `CraftingEngine.selectedQuantityItems` and
// `CraftingEngine._consumeIngredients` — `readStackQuantity` stayed at 3,
// `readStoredStackQuantity` stayed at 3, `absentDefault: 1` stayed at 3, and every suite in
// the repo passed.
//
// Including `tests/item-stack-quantity-routing.test.js`, which retires a claim this comment
// used to make. That file does NOT cover this boundary: its fixtures all carry a PRESENT,
// POSITIVE stack count, and the two readers only diverge at a stored `0`, a negative, and a
// non-numeric — the axes `READ_CASES` above isolates and no routed-path fixture exercises.
// The swap is not cosmetic: under it an item stored at `0` stops decrementing `remaining`
// in `selectedQuantityItems`, so every candidate enters the consumption plan and the delete
// branch walks them one by one.
//
// So every row belonging to a file that contributes MORE THAN ONE row also declares
// `anchors`: short source snippets pinning each accessor to the site it serves, whose match
// counts must add up to that row's declared `sites`. Deliberately NOT line numbers — a
// per-line pin rots on every edit above it.
//
// A file contributing exactly ONE row needs none, and that is a boundary rather than a
// concession: one row means one accessor, so there is no second accessor in that file to
// swap it with. `anchorsRequired` below enforces the rule instead of hand-listing files, so
// a file that GAINS a second row has to anchor both.
// ---------------------------------------------------------------------------

/** Every accessor the table polices. `stackQuantityUpdate` had no `src` call site until the
 *  pooled holdings consume needed a BATCHED decrement (issue 1342); it was listed here before
 *  it had one, so that acquiring a site without a row was a red test rather than a silent gap. */
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
    anchors: [/return readStackQuantity\(item\);/],
  },
  {
    site: 'componentStacking.createOrStackComponentItem (existing stack)',
    file: 'src/systems/componentStacking.js',
    accessor: 'readStoredStackQuantity',
    sites: 1,
    absentDefault: 1,
    anchors: [
      /const base = readStoredStackQuantity\(existing, \{ absentDefault: 1, path: quantityPath \}\)/,
    ],
  },
  {
    site: 'componentStacking.createOrStackComponentItem (increment write)',
    file: 'src/systems/componentStacking.js',
    accessor: 'updateStackQuantity',
    sites: 1,
    anchors: [/updateStackQuantity\(existing, base \+ delta, quantityPath\)/],
  },
  {
    site: 'CraftingEngine.selectedQuantityItems + salvage totalAvailable',
    file: 'src/systems/CraftingEngine.js',
    accessor: 'readStackQuantity',
    sites: 2,
    // Neither is a delete-on-underrun site any more: the salvage consume's capacity read
    // moved to `pooledAllocation.planFirstFitDrain` (issue 1342) and took its delete site
    // with it, one row below. These two are the selection helper and the salvage
    // availability gate.
    // The first anchor is the one that matters most. `selectedQuantityItems` is the
    // hazard-COMPOUNDING site: read it with the stored reader and an item stored at 0
    // stops decrementing `remaining`, so every candidate enters the plan the delete
    // branch then walks.
    anchors: [/remaining -= readStackQuantity\(item\);/, /sum \+ readStackQuantity\(item\)/],
  },
  {
    site: 'pooledAllocation.planFirstFitDrain capacity read (was _consumeComponentItems)',
    file: 'src/systems/pooledAllocation.js',
    accessor: 'readStackQuantity',
    sites: 1,
    // The read that decides delete-versus-decrement for the salvage consume. It is the
    // coercing reader on purpose: a stored 0 read as 0 would make every take exhaust its
    // item, so the consume would DELETE where it should decrement.
    deleteSites: 1,
  },
  {
    site: 'CraftingEngine._consumeAlchemyExtraItems + _consumeSubmittedAlchemyItems + _consumeIngredients',
    file: 'src/systems/CraftingEngine.js',
    accessor: 'readStoredStackQuantity',
    sites: 3,
    absentDefault: 1,
    deleteSites: 3,
    // The two alchemy consume sites are spelled identically, so the first anchor accounts
    // for two of the three occurrences and the totals assertion covers the rest.
    anchors: [
      /const qty = readStoredStackQuantity\(item, \{ absentDefault: 1 \}\);/,
      /const itemQuantity = readStoredStackQuantity\(item, \{ absentDefault: 1 \}\);/,
    ],
  },
  {
    site: 'CraftingEngine award creation stackability probe',
    file: 'src/systems/CraftingEngine.js',
    accessor: 'hasStackQuantity',
    sites: 1,
    anchors: [/if \(hasStackQuantity\(itemData\) \|\| !sourceItem\)/],
  },
  {
    site: 'CraftingEngine._restoreComponentItem + award creation (payload writes)',
    file: 'src/systems/CraftingEngine.js',
    accessor: 'setStackQuantity',
    sites: 2,
    anchors: [/setStackQuantity\(itemData, qty\);/, /setStackQuantity\(itemData, result\.quantity\);/],
  },
  {
    site: 'CraftingEngine decrement writes on the four delete sites',
    file: 'src/systems/CraftingEngine.js',
    accessor: 'updateStackQuantity',
    sites: 4,
    anchors: [
      /updateStackQuantity\(item, qty - count\)/,
      /updateStackQuantity\(item, itemQuantity - quantity\)/,
      /updateStackQuantity\(take\.item, take\.remainingQuantity\)/,
    ],
  },
  {
    site: 'GatheringEngine.normalizeRunItems (source term only)',
    file: 'src/systems/GatheringEngine.js',
    accessor: 'readStoredStackQuantity',
    sites: 1,
    absentDefault: 1,
  },
  {
    site: 'RecipeManager have counts',
    file: 'src/systems/RecipeManager.js',
    accessor: 'readStackQuantity',
    sites: 3,
  },
  {
    site: 'InventoryListingBuilder owned counts',
    file: 'src/systems/InventoryListingBuilder.js',
    accessor: 'readStackQuantity',
    sites: 1,
  },
  {
    // The snapshot's per-system tallies (issue 1077). It counts held UNITS, not stacks, for
    // both the per-component quantity and the per-tag quantity the optimistic availability
    // projection compares against, so it must read through the configured accessor exactly
    // as the listing builders do — a snapshot counting raw documents would report a
    // different "have" than the listing shows for every stackable system.
    site: 'inventorySnapshot component/tag tallies',
    file: 'src/systems/inventorySnapshot.js',
    accessor: 'readStackQuantity',
    sites: 1,
  },
  {
    // Bulk destroy removes WHOLE STACKS, so the pre-delete capture has to read the
    // stack count through the configured accessor — `unitsDeleted` is derived from it.
    // `updateStackQuantity` is deliberately absent: a delete is not a schema-filtered
    // update, so this file contributes exactly one row and needs no anchors.
    site: 'BulkDestroyService pre-delete capture',
    file: 'src/systems/BulkDestroyService.js',
    accessor: 'readStackQuantity',
    sites: 1,
  },
  {
    site: 'AlchemyListingBuilder held counts',
    file: 'src/systems/AlchemyListingBuilder.js',
    accessor: 'readStackQuantity',
    sites: 1,
  },
  {
    site: 'IngredientSet._initialRemaining (ledger seed)',
    file: 'src/models/IngredientSet.js',
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
    site: 'SvelteCraftingSystemManagerApp knowledge owned copies',
    file: 'src/ui/SvelteCraftingSystemManagerApp.svelte.js',
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
    anchors: [/if \(hasStackQuantity\(itemData\) \|\| result\.quantity\)/],
  },
  {
    site: 'gatheringResultCreation new-award payload write',
    file: 'src/gatheringResultCreation.js',
    accessor: 'setStackQuantity',
    sites: 1,
    anchors: [/setStackQuantity\(itemData, Number\(result\.quantity \|\| 1\)\)/],
  },
  {
    site: 'gatheringResultCreation stack-onto-existing',
    file: 'src/gatheringResultCreation.js',
    accessor: 'readStoredStackQuantity',
    sites: 1,
    absentDefault: 0,
    anchors: [/readStoredStackQuantity\(existing, \{ absentDefault: 0 \}\)/],
  },
  {
    site: 'gatheringResultCreation stack-onto-existing write',
    file: 'src/gatheringResultCreation.js',
    accessor: 'updateStackQuantity',
    sites: 1,
    anchors: [/updateStackQuantity\(existing, next\)/],
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
    anchors: [/if \(hasStackQuantity\(itemData, quantityPath\) \|\| !sourceItem\)/],
  },
  {
    site: 'companionComponentAward payload quantity write',
    file: 'src/systems/companionComponentAward.js',
    accessor: 'setStackQuantity',
    sites: 1,
    anchors: [/setStackQuantity\(itemData, quantity, quantityPath\)/],
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
      /readStoredStackQuantity\(itemData, \{ absentDefault: 1, path: quantityPath \}\) !== quantity/,
    ],
  },
  {
    site: 'companionComponentAward stack-target base read',
    file: 'src/systems/companionComponentAward.js',
    accessor: 'readStoredStackQuantity',
    sites: 1,
    // The ONLY `absentDefault: null` site in `src/**`, and it is the whole of the award's
    // "nothing is invented" rule: a target carrying no readable count is not stacked onto at
    // all, so the award creates a second document instead of authoring a count field on an
    // item type that has none.
    absentDefault: null,
    anchors: [
      /readStoredStackQuantity\(target, \{ absentDefault: null, path: quantityPath \}\)/,
    ],
  },
  {
    site: 'companionComponentAward stack write',
    file: 'src/systems/companionComponentAward.js',
    accessor: 'updateStackQuantity',
    sites: 1,
    anchors: [/updateStackQuantity\(target, before \+ quantity, quantityPath\)/],
  },
  {
    // The pooled holdings READ counts what a party is carrying (issue 1342), and it must count
    // it with the reader the pooled CONSUME's first-fit drain spends: `pooledAllocation.js` uses
    // `readStackQuantity` and states that the choice is not a parameter. A read on
    // `readStoredStackQuantity` would honour a stored `0` the drain reads as `1`, so a pool the
    // read called short would pay in full — a gate that lies in the direction that matters.
    // One row, so no anchors: there is no second accessor in that file to be swapped with.
    site: 'companionPooledHoldings pooled component count',
    file: 'src/systems/companionPooledHoldings.js',
    accessor: 'readStackQuantity',
    sites: 1,
  },
  {
    // The pooled holdings consume batches its writes per actor, so it needs the update PAYLOAD
    // rather than the live-document writer every other decrement site uses (issue 1342). Two
    // sites, and they are each other's inverse: one writes the post-take remainder, the other
    // writes back the `available` the drain plan read. Anchored even though a single-accessor
    // file needs none, because a rollback that wrote the wrong one of those two numbers is the
    // failure that costs a player their inventory and no count could see it.
    site: 'companionPooledConsumption batched reduction and its rollback',
    file: 'src/systems/companionPooledConsumption.js',
    accessor: 'stackQuantityUpdate',
    sites: 2,
    anchors: [
      /stackQuantityUpdate\(take\.item, take\.remainingQuantity\)/,
      /stackQuantityUpdate\(take\.item, take\.available\)/,
    ],
  },
];

/** The accessor module itself, which DEFINES these names and must not be counted. */
const ACCESSOR_MODULE = 'src/systems/itemStackQuantity.js';

/**
 * Count comment-stripped `accessor(` occurrences per file across the whole `src` tree.
 *
 * Comments are stripped for the same reason the two literal gates strip them: the routed
 * modules DESCRIBE their accessor choice in prose (`componentStacking.js` names
 * `readStackQuantity` in a comment explaining why it does NOT use it), and counting prose
 * would make the table unmaintainable and then vacuous.
 *
 * @returns {Map<string, number>} `${file}::${accessor}` -> occurrences.
 */
function countAccessorCallSites() {
  const sources = collectSources(join(repoRoot, 'src'));
  const counts = new Map();
  for (const [path, text] of Object.entries(sources)) {
    if (path === ACCESSOR_MODULE) continue;
    const code = stripComments(text);
    for (const accessor of ACCESSORS) {
      const matches = code.match(new RegExp(String.raw`\b${accessor}\s*\(`, 'g'));
      if (matches?.length) counts.set(`${path}::${accessor}`, matches.length);
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

/** Comment-stripped occurrences of `absentDefault: <value>` per file. */
function countAbsentDefaults(value) {
  const sources = collectSources(join(repoRoot, 'src'));
  const counts = new Map();
  for (const [path, text] of Object.entries(sources)) {
    if (path === ACCESSOR_MODULE) continue;
    const matches = stripComments(text).match(
      new RegExp(String.raw`absentDefault:\s*${value}\b`, 'g')
    );
    if (matches?.length) counts.set(path, matches.length);
  }
  return counts;
}

/** Occurrences of `pattern` in `text`, counted with a fresh global regex. */
function countMatches(text, pattern) {
  return text.match(new RegExp(pattern.source, 'g'))?.length ?? 0;
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
    // The assertion the per-file counts cannot make. Exchanging two accessors between
    // sites in one file leaves every declared count intact; it moves an anchor's match
    // count to zero, which reds here.
    const sources = collectSources(join(repoRoot, 'src'));
    for (const entry of SITE_MAPPING) {
      if (!entry.anchors) continue;
      const code = stripComments(sources[entry.file] ?? '');
      let matched = 0;
      for (const anchor of entry.anchors) {
        const occurrences = countMatches(code, anchor);
        assert.ok(occurrences > 0, `${entry.site}: ${anchor} matches nothing in ${entry.file}`);
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
    // hands the decision back to the caller. Exactly one site uses it (issue 1301).
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
    const zeroDefault = SITE_MAPPING.filter((entry) => entry.absentDefault === 0);
    assert.deepEqual(
      zeroDefault.map((entry) => entry.site),
      ['gatheringResultCreation stack-onto-existing']
    );
    assert.deepEqual(
      [...countAbsentDefaults(0).entries()],
      [['src/gatheringResultCreation.js', 1]],
      'exactly one `absentDefault: 0` in src/**, and only in gatheringResultCreation.js'
    );
  });

  it('records exactly one absent-default-null site, and live source agrees', () => {
    // Pinned in both directions for the same reason the `0` site is: `null` is the value that
    // makes the component award REFUSE to stack rather than inventing a base, so a second site
    // adopting it — or this one losing it — is a behavioural change that must be deliberate.
    const nullDefault = SITE_MAPPING.filter((entry) => entry.absentDefault === null);
    assert.deepEqual(
      nullDefault.map((entry) => entry.site),
      ['companionComponentAward stack-target base read']
    );
    assert.deepEqual(
      [...countAbsentDefaults('null').entries()],
      [['src/systems/companionComponentAward.js', 1]],
      'exactly one `absentDefault: null` in src/**, and only in the component award'
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

  it('records exactly four delete-on-underrun sites, and four decrement writes beside them', () => {
    // Counted from an explicit field rather than parsed out of the label: a label-substring
    // filter reads as a check while actually depending on prose nobody validates.
    const total = SITE_MAPPING.reduce((sum, entry) => sum + (entry.deleteSites ?? 0), 0);
    assert.equal(total, 4, 'craft, salvage, alchemy-extra, alchemy-no-match');
    for (const entry of SITE_MAPPING) {
      assert.ok(
        (entry.deleteSites ?? 0) <= entry.sites,
        `${entry.site} cannot have more delete sites than call sites`
      );
    }
    // Each delete site has an `await (underrun ? item.delete() : updateStackQuantity(...))`
    // partner, so the engine's write count must equal its delete-site count. A routed read
    // whose write half was missed reads 20 and writes 19 to another field forever.
    const engineWrites = SITE_MAPPING.filter(
      (entry) =>
        entry.file === 'src/systems/CraftingEngine.js' && entry.accessor === 'updateStackQuantity'
    ).reduce((sum, entry) => sum + entry.sites, 0);
    assert.equal(engineWrites, 4);
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

  it('measures the SUGGESTED default it was given, not the built-in one', () => {
    // On tormenta20 the suggested correction is `system.qtd`, and the counts printed
    // beside it in the advisory have to be counts FOR IT. Measuring `system.quantity`
    // while naming `system.qtd` is worse than printing no counts at all.
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

// ---------------------------------------------------------------------------
// The advisory selector. `src/main.js` cannot be imported under `node --test`, which is
// exactly why this decision lives in the accessor module: a three-way branch pinned only
// by grepping `main.js` is not evidence that the right string reaches the right world.
// ---------------------------------------------------------------------------

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
    // A dnd5e world whose Item directory holds only spells, feats, classes and
    // backgrounds. Nothing is wrong, nothing has been typed, and the previous copy told
    // this GM — permanently, on every login — to change the setting to the value it
    // already had, while asserting imminent inventory destruction that is not happening.
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
    // `{default}` is what the GM is told to type. It has to be the ACTIVE SYSTEM's preset,
    // which `main.js` supplies as the probe's `defaultPath`; the built-in
    // `system.quantity` is wrong on tormenta20 and contradicts the setting's own hint.
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

  it('suggests the ACTIVE SYSTEM preset, not the built-in default', async () => {
    // `stackQuantityAdvisory` puts `report.defaultPath` into `{default}`, so whatever
    // `main.js` passes here is literally the field the GM is told to type. Passing no
    // `defaultPath` falls back to `system.quantity`, which on tormenta20 — the one system
    // this whole feature exists for — resolves on 0 items and contradicts the setting's
    // own hint, formatted from the same preset by `withActiveSystemDefaults`.
    const source = await mainSource;
    assert.match(
      source,
      /probeStackQuantityPath\(game\.items \?\? \[], \{\s*path,\s*defaultPath: stackQuantityPathPresetFor\(game\.system\?\.id\),\s*}\)/,
      'the probe must be given the active system preset as its suggested correction'
    );
    assert.match(
      source,
      /import \{ stackQuantityPathPresetFor } from '\.\/config\/stackQuantityPathPresets\.js';/
    );
  });

  it('formats the advisory from the shared pure selector', async () => {
    // The three-way branch lives in the accessor module because `main.js` cannot be
    // imported here; if it moved back inline, the branch would only ever be grep-pinned.
    const source = await mainSource;
    assert.match(source, /stackQuantityAdvisory\(report\)/);
    assert.match(source, /game\.i18n\?\.format\?\.\(advisory\.key, advisory\.data\)/);
    assert.equal(
      /'FABRICATE\.Settings\.ItemStackQuantityPath\.(Unresolved|SchemaDiscard)'/.test(source),
      false,
      'main.js must not re-spell the advisory keys it no longer selects'
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
    // The listener body is wrapped so a failure in ONE branch is logged as Fabricate's
    // own line naming the setting, rather than as a core `Hooks.onError` entry against an
    // anonymous listener. `Hooks.#call` already try/catches each listener, so this is not
    // what stops a throw escaping into the broadcast — that hazard belongs to
    // `SettingConfig.onChange`, and is why `settings.js` registers none.
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
