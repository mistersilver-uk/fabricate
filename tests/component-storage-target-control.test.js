/**
 * The component storage TARGET control, the Valid Id Basis in both directions, and the
 * reconciler's disposition table — hooks included (issue 1212).
 *
 * Acceptance items 15 and 30.
 *
 * Item 30 exists because "no shipped test may be edited" is necessary and NOT sufficient:
 * five plausible extraction slips were applied to `reconcileRecipeStorageLayout` against the
 * seven nominated suites and THREE passed 154/154 — removing the `target-reverted`
 * disposition, hoisting the deferral above the settled check, and weakening the `unreadable`
 * guard to layout-only. This suite asserts the returned `action` AND whether the settled
 * HOOKS ran, over a matrix whose layout and target axes each include an UNRECOGNISED value,
 * because the weakened-guard slip reddens on that row alone.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  COMPONENT_STORAGE_TARGET_CHOICES,
  componentStorageArrangementLabelKey,
  DEFINITION_STORAGE_LAYOUTS,
  DEFINITION_STORAGE_TARGETS,
  SETTING_KEYS,
} from '../src/config/settings.js';
import { reconcileDefinitionStorageLayout } from '../src/systems/definitionStorageReconciler.js';
import {
  basisFromInputs,
  DEFINITION_STORAGE_KEY_PAIRS,
  GRANULAR_DEFINITION_REPOSITORY_KINDS,
  readValidIdBasisInputs,
} from '../src/systems/validIdBasis.js';

const LANG = JSON.parse(
  readFileSync(fileURLToPath(new URL('../lang/en.json', import.meta.url)), 'utf8')
);

const { SINGLE_ARRAY, PER_RECORD, UNSETTLED } = DEFINITION_STORAGE_LAYOUTS;

// ---------------------------------------------------------------------------
// The GM-facing control
// ---------------------------------------------------------------------------

describe('the component target control offers every arrangement, in its own words', () => {
  it('labels every target, and every label resolves in en.json', () => {
    // The mirror rots silently otherwise: a `choices` map missing a stored value renders the
    // raw key in the dropdown and offers the GM no way back to it.
    for (const target of Object.values(DEFINITION_STORAGE_TARGETS)) {
      const key = COMPONENT_STORAGE_TARGET_CHOICES[target];
      assert.ok(key, `${target} has no label`);
      assert.equal(
        typeof key.split('.').reduce((value, part) => value?.[part], LANG),
        'string',
        `${key} does not resolve`
      );
    }
  });

  it('does not reuse the recipe wording, which is misleading for a component', () => {
    // "One combined record" is accurate for recipes and misleading here: a GM reading it
    // cannot tell WHICH record, and the truthful answer is that a component sits nested inside
    // the crafting system that owns it.
    const strings = LANG.FABRICATE.Settings.ComponentStorageTarget;
    assert.match(strings.SingleArray, /Nested inside each crafting system/);
    assert.notEqual(strings.SingleArray, LANG.FABRICATE.Settings.RecipeStorageTarget.SingleArray);
    assert.notEqual(strings.Hint, LANG.FABRICATE.Settings.RecipeStorageTarget.Hint);
    assert.match(strings.Hint, /EMPTY component library/, 'the hint names the actual loss');
  });

  it('the label helper is TOTAL and cannot render an unmapped value', () => {
    // *Reddens when:* a `String(value)` fallback is reintroduced while the helper is
    // generalised. The leak is reachable: the LAYOUT enumeration carries `unsettled` and the
    // operator-facing choices map has no entry for it and never will.
    assert.equal(COMPONENT_STORAGE_TARGET_CHOICES[UNSETTLED], undefined);
    const miss = 'FABRICATE.Settings.ComponentStorageTarget.UnknownArrangement';
    for (const value of [UNSETTLED, null, undefined, '', 'nonsense', 42]) {
      assert.equal(componentStorageArrangementLabelKey(value), miss, `${value} leaks`);
    }
    assert.equal(
      componentStorageArrangementLabelKey(PER_RECORD),
      COMPONENT_STORAGE_TARGET_CHOICES[PER_RECORD]
    );
  });
});

// ---------------------------------------------------------------------------
// 15. Valid Id Basis, in BOTH directions
// ---------------------------------------------------------------------------

describe('the component Valid Id Basis fails in both directions', () => {
  const HIGHEST = '99.0.0';

  /**
   * @param {object} [overrides]
   * @returns {Record<string, boolean>}
   */
  function basisFor({
    settings = {},
    componentStorage = {
      granular: false,
      arrangement: SINGLE_ARRAY,
      layoutAtCorpusRead: SINGLE_ARRAY,
    },
    systemStorage = { granular: false, arrangement: null, layoutAtCorpusRead: null },
  } = {}) {
    const values = new Map([
      [SETTING_KEYS.RECIPE_STORAGE_LAYOUT, SINGLE_ARRAY],
      [SETTING_KEYS.RECIPE_STORAGE_TARGET, SINGLE_ARRAY],
      [SETTING_KEYS.COMPONENT_STORAGE_LAYOUT, SINGLE_ARRAY],
      [SETTING_KEYS.COMPONENT_STORAGE_TARGET, SINGLE_ARRAY],
      [SETTING_KEYS.MIGRATION_VERSION, HIGHEST],
      ...Object.entries(settings),
    ]);
    return basisFromInputs(
      readValidIdBasisInputs({
        getSetting: (key) => values.get(key),
        getHighestRegisteredMigrationVersion: () => HIGHEST,
        storage: {
          recipes: { granular: false, arrangement: SINGLE_ARRAY, layoutAtCorpusRead: SINGLE_ARRAY },
          systems: systemStorage,
          components: componentStorage,
        },
      })
    );
  }

  it('(a) pair registered and kind declared: a settled world is known-complete', () => {
    // *Reddens when:* the pair is omitted from `DEFINITION_STORAGE_KEY_PAIRS` — the component
    // basis is then `false` FOREVER on every world, permanently withholding two destructive
    // passes with no way out.
    assert.ok(DEFINITION_STORAGE_KEY_PAIRS.components, 'the pair is registered');
    assert.ok(
      GRANULAR_DEFINITION_REPOSITORY_KINDS.includes('components'),
      'and the kind is declared granular'
    );
    assert.equal(basisFor().components, true);
  });

  it('(b) an unsettled component layout omits the component-basis passes', () => {
    // *Reddens when:* the kind is NOT declared granular — `isKindKnownComplete` then answers
    // `true` BY CONSTRUCTION whenever the repository does not report itself granular, and
    // every destructive pass runs against a half-written corpus.
    assert.equal(
      basisFor({ settings: { [SETTING_KEYS.COMPONENT_STORAGE_LAYOUT]: UNSETTLED } }).components,
      false
    );
    assert.equal(
      basisFor({
        settings: { [SETTING_KEYS.COMPONENT_STORAGE_LAYOUT]: UNSETTLED },
        componentStorage: { granular: true, arrangement: PER_RECORD, layoutAtCorpusRead: UNSETTLED },
      }).components,
      false
    );
  });

  it('(c) declared but pair NOT registered: the basis fails closed', () => {
    // The window `validIdBasis.js` names by number: landing a granular repository for a kind
    // before registering its settings pair.
    assert.equal(
      basisFromInputs({ components: { declaredGranular: true, pairRegistered: false } })
        .components,
      false
    );
  });

  it('(d) a NON-granular system repository beside a MID-CONVERSION component one', () => {
    // *Reddens when:* the composition site keeps answering `components: systemStorage` — the
    // component basis then inherits the container's report, which is never granular, and a
    // half-written component corpus is declared known-complete by construction.
    const basis = basisFor({
      settings: { [SETTING_KEYS.COMPONENT_STORAGE_LAYOUT]: UNSETTLED },
      systemStorage: { granular: false, arrangement: null, layoutAtCorpusRead: null },
      componentStorage: { granular: true, arrangement: PER_RECORD, layoutAtCorpusRead: UNSETTLED },
    });
    assert.equal(basis.components, false, 'the component passes are omitted');
    assert.equal(basis.systems, true, 'while the system-basis ones still run');
  });
});

// ---------------------------------------------------------------------------
// 30. The reconciler's disposition table survives the extraction, HOOKS INCLUDED
// ---------------------------------------------------------------------------

describe('the reconciler`s dispositions and its settled hooks, over the whole matrix', () => {
  /** A value neither enumeration recognises. Its own row, because one slip reddens only here. */
  const UNRECOGNISED = 'perrecord';

  /**
   * Drive the neutral reconciler with a recording descriptor.
   *
   * @param {object} options
   * @returns {Promise<{action: string, hooks: string[], writes: string[]}>}
   */
  async function drive({ layout, target, migrated = false, tableHasRow = true }) {
    const hooks = [];
    const writes = [];
    const values = new Map([
      ['layoutKey', layout],
      ['targetKey', target],
    ]);
    const report = await reconcileDefinitionStorageLayout(
      {
        layoutKey: 'layoutKey',
        targetKey: 'targetKey',
        conversionFor: () => (tableHasRow ? async () => ({ records: 0 }) : null),
        isRefusal: () => false,
        isSelfCompensated: () => false,
        onSettledLegacy: async () => {
          hooks.push('legacy');
          return { reclaimed: 0 };
        },
        onSettledGranular: async () => {
          hooks.push('granular');
          return { reclaimed: 0 };
        },
      },
      {
        getSetting: (key) => values.get(key),
        setSetting: async (key, value) => {
          writes.push(key);
          values.set(key, value);
        },
        migrationPassPersistedCorpusKey: migrated,
      }
    );
    return { action: report.action, hooks, writes };
  }

  it('an UNRECOGNISED layout or target is `unreadable`, and runs NO hook', async () => {
    // *Reddens when:* the guard is weakened to the layout alone — the target axis is what a
    // GM writes, and this row is the only one that catches it. A matrix over recognised values
    // only leaves the slip uncovered entirely.
    assert.deepEqual(await drive({ layout: UNRECOGNISED, target: SINGLE_ARRAY }), {
      action: 'unreadable',
      hooks: [],
      writes: [],
    });
    assert.deepEqual(await drive({ layout: SINGLE_ARRAY, target: UNRECOGNISED }), {
      action: 'unreadable',
      hooks: [],
      writes: [],
    });
    assert.deepEqual(await drive({ layout: UNSETTLED, target: UNRECOGNISED }), {
      action: 'unreadable',
      hooks: [],
      writes: [],
    });
  });

  it('a SETTLED world runs its arm`s hook, even on a migrating boot', async () => {
    // *Reddens when:* the deferral is hoisted above the settled check — every migrating boot
    // then returns `deferred` for a settled world (telling the GM a change is pending when
    // none is) AND skips `_reconcileSettled`, which silently disables the residual-key
    // detector on exactly those boots.
    assert.deepEqual(await drive({ layout: SINGLE_ARRAY, target: SINGLE_ARRAY }), {
      action: 'settled',
      hooks: ['legacy'],
      writes: [],
    });
    assert.deepEqual(await drive({ layout: PER_RECORD, target: PER_RECORD }), {
      action: 'settled',
      hooks: ['granular'],
      writes: [],
    });
    assert.deepEqual(
      await drive({ layout: PER_RECORD, target: PER_RECORD, migrated: true }),
      { action: 'settled', hooks: ['granular'], writes: [] },
      'the hook still runs on a migrating boot — this is the row the hoist slip fails'
    );
  });

  it('an UNSETTLED world runs NO settled hook, because neither arm describes it', async () => {
    assert.deepEqual(await drive({ layout: UNSETTLED, target: SINGLE_ARRAY, tableHasRow: false }), {
      action: 'unsettled-unresolvable',
      hooks: [],
      writes: [],
    });
  });

  it('a migrating boot DEFERS an actual conversion, and runs no hook', async () => {
    assert.deepEqual(
      await drive({ layout: SINGLE_ARRAY, target: PER_RECORD, migrated: true }),
      { action: 'deferred', hooks: [], writes: [] }
    );
  });

  it('a settled layout with NO table row REVERTS the target', async () => {
    // *Reddens when:* the `target-reverted` disposition is removed — the world is then
    // stranded at `layout !== target` permanently, which Valid Id Basis clause 2 refuses
    // forever.
    assert.deepEqual(
      await drive({ layout: SINGLE_ARRAY, target: PER_RECORD, tableHasRow: false }),
      { action: 'target-reverted', hooks: [], writes: ['targetKey'] }
    );
  });

  it('a table row CONVERTS, and runs no settled hook on the way', async () => {
    assert.deepEqual(await drive({ layout: SINGLE_ARRAY, target: PER_RECORD }), {
      action: 'converted',
      hooks: [],
      writes: [],
    });
  });
});
