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
  usableSalvageDcTiers,
} from '../../src/ui/svelte/apps/manager/component/salvageDcPresets.js';

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

  it('case 1: dynamic dcMode renders the system default with NO DC suffix', () => {
    // A macro computes the DC, so there is no static number to name.
    const options = buildSalvageDcOptions({ tiers: TIERS, dcMode: 'dynamic', systemDc: 15 });
    assert.equal(options[0].label, 'System default — set by macro');
    assert.ok(!options[0].label.includes('15'));
    // Presets and Custom… remain available.
    assert.deepEqual(values(options), ['system', 'dc:12', 'dc:17', 'custom']);
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
