/**
 * Issue 676, decision 7 — the salvage DC control's option model, and its five
 * otherwise-unspecified cases.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SALVAGE_DC_CUSTOM,
  SALVAGE_DC_SYSTEM_DEFAULT,
  buildSalvageDcOptions,
  resolveSalvageDcSelection,
  salvageDcOverrideForSelection,
  salvageOverrideField,
  salvagePresetTiers,
  usableSalvageAdjustmentTiers,
  usableSalvageDcTiers,
} from '../../src/ui/svelte/apps/manager/component/salvageDcPresets.js';
import { buildSalvageDcSelectOptions } from '../../src/ui/svelte/apps/manager/component/componentEditSelectOptions.js';

const TIERS = [
  { id: 't1', name: 'Standard', dc: 12 },
  { id: 't2', name: 'Hard', dc: 17 },
];

const values = (options) => options.map((option) => option.value);
const labels = (options) => options.map((option) => option.label);

describe('salvage DC presets (issue 676, decision 7)', () => {
  it('offers the SYSTEM\'S OWN authored tiers, not a hard-coded DC list', () => {
    // The brief's hard-coded `Standard 12 / Difficult 15 / Hard 17 / Very Hard 19` was
    // rejected precisely because it misreports the world's real DCs.
    const options = buildSalvageDcOptions({ tiers: TIERS, systemDc: 15 });
    assert.deepEqual(values(options), ['system', 'dc:12', 'dc:17', 'custom']);
    assert.deepEqual(labels(options), [
      'System default — DC 15',
      'Standard — DC 12',
      'Hard — DC 17',
      'Custom…',
    ]);
  });

  it('case 1: names the static system DC even when the crafting check is macro-driven (#2081)', () => {
    // Salvage never runs a DC macro: it grades the override, else the slot's DC, else 15.
    const options = buildSalvageDcOptions({ tiers: TIERS, dcMode: 'dynamic', systemDc: 15 });
    assert.equal(options[0].label, 'System default — DC 15');
    assert.deepEqual(values(options), ['system', 'dc:12', 'dc:17', 'custom']);
    const bound = buildSalvageDcSelectOptions(TIERS, 15, englishText, null);
    assert.equal(bound[0].label, 'System default — DC 15');
    assert.ok(!labels(bound).some((label) => /macro/.test(label)), 'no option names a macro');
  });

  it('case 2: zero authored tiers — the COMMON case — degrades to System default + Custom…', () => {
    // `tiers` defaults to []. A preset control with no presets; this case is exactly
    // why decision 7 kept the "Manage presets" link.
    assert.deepEqual(values(buildSalvageDcOptions({ tiers: [], systemDc: 15 })), ['system', 'custom']);
    assert.deepEqual(values(buildSalvageDcOptions({})), ['system', 'custom']);
  });

  it('case 3: blank-name and non-positive-DC tiers are NOT authored presets', () => {
    // `_normalizeSimpleTier` permits `name: ''` and coerces a non-finite dc to 0, which
    // would otherwise render an unlabelled "— DC 0" option.
    const messy = [
      { id: 'a', name: '', dc: 14 },
      { id: 'b', name: '   ', dc: 14 },
      { id: 'c', name: 'Zero', dc: 0 },
      { id: 'd', name: 'Negative', dc: -3 },
      { id: 'e', name: 'Real', dc: 13 },
    ];
    assert.deepEqual(usableSalvageDcTiers(messy).map((tier) => tier.id), ['e']);
    assert.deepEqual(values(buildSalvageDcOptions({ tiers: messy })), ['system', 'dc:13', 'custom']);
  });

  it('case 4: duplicate-DC tiers match the FIRST tier, and the ambiguity is immaterial', () => {
    // The stored value is the DC, not the tier id — so which of two same-DC tiers
    // "wins" cannot change what is persisted.
    const duplicates = [
      { id: 't1', name: 'Standard', dc: 12 },
      { id: 't2', name: 'Also Standard', dc: 12 },
    ];
    assert.equal(resolveSalvageDcSelection(12, duplicates), 'dc:12');
    assert.equal(salvageDcOverrideForSelection('dc:12', null), 12);
  });

  it('case 4: lists one option per DC or adjustment, keeping the first tier, so ids stay unique', () => {
    const duplicates = [
      { id: 't1', name: 'Standard', dc: 12, adjustment: -2 },
      { id: 't2', name: 'Also Standard', dc: 12, adjustment: -2 },
      { id: 't3', name: 'Hard', dc: 16, adjustment: -4 },
    ];
    const fixed = buildSalvageDcOptions({ tiers: duplicates });
    assert.deepEqual(values(fixed), ['system', 'dc:12', 'dc:16', 'custom']);
    assert.equal(fixed[1].label, 'Standard — DC 12', 'the first tier names the option');
    const adjusted = buildSalvageDcOptions({ tiers: duplicates, evaluation: attribute() });
    assert.deepEqual(values(adjusted), ['system', 'adj:-2', 'adj:-4', 'custom']);
    assert.equal(adjusted[1].label, 'Standard — -2');
  });

  it('an override matching no tier selects Custom… and is never snapped to a tier', () => {
    assert.equal(resolveSalvageDcSelection(14, TIERS), SALVAGE_DC_CUSTOM);
    assert.equal(resolveSalvageDcSelection(99, TIERS), SALVAGE_DC_CUSTOM);
    // ...and a blank/absent override is the system default, not a spurious 0.
    assert.equal(resolveSalvageDcSelection(null, TIERS), SALVAGE_DC_SYSTEM_DEFAULT);
    assert.equal(resolveSalvageDcSelection(undefined, TIERS), SALVAGE_DC_SYSTEM_DEFAULT);
    assert.equal(resolveSalvageDcSelection('', TIERS), SALVAGE_DC_SYSTEM_DEFAULT);
  });

  it('a tier-matching override selects that tier', () => {
    assert.equal(resolveSalvageDcSelection(12, TIERS), 'dc:12');
    assert.equal(resolveSalvageDcSelection(17, TIERS), 'dc:17');
  });

  it('storage is unchanged: system default persists null, a tier persists its DC', () => {
    assert.equal(salvageDcOverrideForSelection(SALVAGE_DC_SYSTEM_DEFAULT, 14), null);
    assert.equal(salvageDcOverrideForSelection('dc:17', null), 17);
  });

  it('switching TO Custom… keeps the current value rather than rewriting it', () => {
    assert.equal(salvageDcOverrideForSelection(SALVAGE_DC_CUSTOM, 14), 14);
    // From the system default there is no current value to keep.
    assert.equal(salvageDcOverrideForSelection(SALVAGE_DC_CUSTOM, null), null);
  });

  it('tolerates junk tier input without throwing', () => {
    assert.deepEqual(usableSalvageDcTiers(null), []);
    assert.deepEqual(usableSalvageDcTiers('tiers'), []);
    assert.deepEqual(usableSalvageDcTiers([null, undefined, 42]), []);
  });
});

// ── Issue 2005: the preset source follows the salvage check's target ─────────────────────
const attribute = (adjustmentKind = 'add', direction = 'under') => ({
  product: 'sum',
  direction,
  target: { source: 'attribute', expression: '@skills.smith.level', adjustmentKind },
});
const FIXED_UNDER = { product: 'sum', direction: 'under', target: { source: 'fixed' } };
const ADJUSTED_TIERS = [
  { id: 'e', name: 'Easy', dc: 10, adjustment: 2 },
  { id: 's', name: 'Standard', dc: 15, adjustment: 0 },
  { id: 'h', name: 'Hard', dc: 20, adjustment: -2 },
  { id: 'x', name: 'Unset', dc: 25, adjustment: null },
  { id: 'b', name: '', dc: 30, adjustment: 3 },
];
const englishText = (_key, fallback) => fallback;

describe('salvage override presets under a character value (issue 2005)', () => {
  it('reads simple.tiers in every mode and never the routed tiers', () => {
    const check = {
      simple: { tiers: [{ id: 's1', name: 'Simple', dc: 12 }] },
      routed: { tiers: [{ id: 'r1', name: 'Routed', dc: 99 }] },
    };
    assert.deepEqual(salvagePresetTiers(check).map((tier) => tier.id), ['s1']);
    assert.deepEqual(salvagePresetTiers({ routed: check.routed }), []);
    assert.deepEqual(salvagePresetTiers(null), []);
  });

  it('edits the adjustment override under a character value and the DC override otherwise', () => {
    assert.equal(salvageOverrideField(attribute()), 'adjustmentOverride');
    assert.equal(salvageOverrideField(FIXED_UNDER), 'dcOverride');
    assert.equal(salvageOverrideField(null), 'dcOverride');
  });

  it('lists only named tiers whose adjustment is valid for the kind, never by their DC', () => {
    assert.deepEqual(usableSalvageAdjustmentTiers(ADJUSTED_TIERS, 'add').map((t) => t.id), [
      'e',
      's',
      'h',
    ]);
    assert.deepEqual(
      usableSalvageAdjustmentTiers(ADJUSTED_TIERS, 'multiply').map((t) => t.id),
      ['e'],
      'a multiplier must be above zero'
    );
    const options = buildSalvageDcOptions({ tiers: ADJUSTED_TIERS, evaluation: attribute() });
    assert.deepEqual(values(options), ['system', 'adj:2', 'adj:0', 'adj:-2', 'custom']);
  });

  it('labels adjustment presets with the true minus and the base adjustment default', () => {
    const options = buildSalvageDcSelectOptions(ADJUSTED_TIERS, 15, englishText, attribute());
    assert.deepEqual(labels(options), [
      'System default — base adjustment',
      'Easy — +2',
      'Standard — 0',
      'Hard — −2',
      'Custom…',
    ]);
    const multiply = buildSalvageDcSelectOptions(
      [{ id: 'd', name: 'Demanding', adjustment: 0.5 }],
      15,
      englishText,
      attribute('multiply')
    );
    assert.deepEqual(labels(multiply), ['System default — base adjustment', 'Demanding — ×½', 'Custom…']);
  });

  it('names a roll-under fixed preset as a Target, and leaves a roll-high one on DC', () => {
    const under = buildSalvageDcSelectOptions(TIERS, 15, englishText, FIXED_UNDER);
    assert.deepEqual(labels(under), [
      'System default — Target 15',
      'Standard — Target 12',
      'Hard — Target 17',
      'Custom…',
    ]);
    const over = buildSalvageDcSelectOptions(TIERS, 15, englishText, null);
    assert.deepEqual(labels(over), [
      'System default — DC 15',
      'Standard — DC 12',
      'Hard — DC 17',
      'Custom…',
    ]);
  });

  it('matches an adjustment override by value, and an off-list multiplier selects Custom…', () => {
    assert.equal(resolveSalvageDcSelection(-2, ADJUSTED_TIERS, attribute()), 'adj:-2');
    assert.equal(resolveSalvageDcSelection(0, ADJUSTED_TIERS, attribute()), 'adj:0');
    assert.equal(resolveSalvageDcSelection(15, ADJUSTED_TIERS, attribute()), SALVAGE_DC_CUSTOM);
    assert.equal(resolveSalvageDcSelection(0.7, ADJUSTED_TIERS, attribute('multiply')), 'custom');
    assert.equal(resolveSalvageDcSelection(null, ADJUSTED_TIERS, attribute()), 'system');
  });

  it('persists an adjustment exactly, never truncated, and System default as null', () => {
    const multiply = attribute('multiply');
    assert.equal(salvageDcOverrideForSelection('adj:0.5', null, multiply), 0.5);
    assert.equal(salvageDcOverrideForSelection(SALVAGE_DC_CUSTOM, 0.7, multiply), 0.7);
    assert.equal(salvageDcOverrideForSelection('adj:-2', null, attribute()), -2);
    assert.equal(salvageDcOverrideForSelection(SALVAGE_DC_SYSTEM_DEFAULT, 0.7, multiply), null);
    assert.equal(salvageDcOverrideForSelection(SALVAGE_DC_CUSTOM, 14.6, FIXED_UNDER), 14, 'a DC is whole');
  });
});
