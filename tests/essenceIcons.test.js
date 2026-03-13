import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEssenceIconOptions,
  DEFAULT_ESSENCE_ICON,
  ESSENCE_ALL_ICON_OPTIONS,
  ESSENCE_ICON_OPTIONS,
  filterEssenceIconOptions,
  getEssenceIconOption,
  getEssenceIconPrefix,
  normalizeEssenceIcon
} from '../src/ui/svelte/util/essenceIcons.js';
import {
  FONT_AWESOME_FREE_CLASSIC_FANTASY_SAFE_ICON_DEFINITIONS,
  FONT_AWESOME_FREE_CLASSIC_ICON_DEFINITIONS,
  isFantasySafeFontAwesomeClassicFreeIcon
} from '../src/ui/svelte/util/fontAwesomeFreeClassicIcons.js';

describe('essenceIcons utility', () => {
  it('normalizes empty icon values to the default essence icon', () => {
    assert.equal(normalizeEssenceIcon(''), DEFAULT_ESSENCE_ICON);
    assert.equal(normalizeEssenceIcon(null), DEFAULT_ESSENCE_ICON);
  });

  it('canonicalizes solid and regular aliases while preserving other known prefixes', () => {
    assert.equal(normalizeEssenceIcon('fa-solid fa-fire'), 'fas fa-fire');
    assert.equal(normalizeEssenceIcon('fa-regular fa-address-book'), 'far fa-address-book');
    assert.equal(normalizeEssenceIcon('fa-duotone fa-flask'), 'fa-duotone fa-flask');
  });

  it('exports a fantasy-safe icon definition subset from the full free catalog', () => {
    assert.ok(FONT_AWESOME_FREE_CLASSIC_FANTASY_SAFE_ICON_DEFINITIONS.length > 1000);
    assert.ok(FONT_AWESOME_FREE_CLASSIC_FANTASY_SAFE_ICON_DEFINITIONS.length < FONT_AWESOME_FREE_CLASSIC_ICON_DEFINITIONS.length);
    assert.ok(FONT_AWESOME_FREE_CLASSIC_FANTASY_SAFE_ICON_DEFINITIONS.some((entry) => entry.iconCode === 'mortar-pestle'));
    assert.ok(!FONT_AWESOME_FREE_CLASSIC_FANTASY_SAFE_ICON_DEFINITIONS.some((entry) => entry.iconCode === 'align-right'));
    assert.ok(!FONT_AWESOME_FREE_CLASSIC_FANTASY_SAFE_ICON_DEFINITIONS.some((entry) => entry.iconCode === 'arrow-down-a-z'));
    assert.equal(isFantasySafeFontAwesomeClassicFreeIcon('mortar-pestle'), true);
    assert.equal(isFantasySafeFontAwesomeClassicFreeIcon('align-right'), false);
  });

  it('builds the fantasy-safe picker catalog by default', () => {
    const options = buildEssenceIconOptions();

    assert.equal(options, ESSENCE_ICON_OPTIONS);
    assert.ok(options.some(option => option.iconClass === 'fas fa-soap'));
    assert.ok(options.some(option => option.iconClass === 'fas fa-fingerprint'));
    assert.ok(options.some(option => option.iconClass === 'fas fa-wine-glass'));
    assert.ok(options.some(option => option.iconClass === 'far fa-bell'));
    assert.ok(!options.some(option => option.iconClass === 'fas fa-align-right'));
    assert.ok(!options.some(option => option.iconClass === 'fas fa-arrow-down-a-z'));
  });

  it('can still build the full classic free icon catalog when explicitly requested', () => {
    const options = buildEssenceIconOptions(FONT_AWESOME_FREE_CLASSIC_ICON_DEFINITIONS);

    assert.ok(options.length > 1500);
    assert.ok(options.some(option => option.iconClass === 'fas fa-soap'));
    assert.ok(options.some(option => option.iconClass === 'fas fa-fingerprint'));
    assert.ok(options.some(option => option.iconClass === 'fas fa-wine-glass'));
    assert.ok(options.some(option => option.iconClass === 'fas fa-address-book'));
    assert.ok(options.some(option => option.iconClass === 'far fa-address-book'));
    assert.ok(options.every(option => option.iconClass.startsWith('fas ') || option.iconClass.startsWith('far ')));
    assert.ok(!options.some(option => option.iconClass === 'fab fa-github'));
    assert.equal(options, ESSENCE_ALL_ICON_OPTIONS);
  });

  it('builds custom icon definitions into solid and regular picker options', () => {
    const options = buildEssenceIconOptions([
      { iconCode: 'address-book', label: 'Address Book', hasRegular: true },
      { iconCode: 'soap', label: 'Soap', hasRegular: false }
    ]);

    assert.deepEqual(options.map(option => option.iconClass), [
      'fas fa-address-book',
      'far fa-address-book',
      'fas fa-soap'
    ]);
  });

  it('filters icon options by icon name, class text, and style', () => {
    const wineMatches = filterEssenceIconOptions(ESSENCE_ICON_OPTIONS, 'wine glass');
    assert.ok(wineMatches.some(option => option.iconClass === 'fas fa-wine-glass'));

    const regularMatches = filterEssenceIconOptions(ESSENCE_ICON_OPTIONS, 'bell regular');
    assert.ok(regularMatches.some(option => option.iconClass === 'far fa-bell'));
    assert.ok(!regularMatches.some(option => option.iconClass === 'fas fa-bell'));
  });

  it('detects style prefixes from stored icon classes', () => {
    assert.equal(getEssenceIconPrefix('fas fa-fire'), 'fas');
    assert.equal(getEssenceIconPrefix('fa-regular fa-address-book'), 'far');
    assert.equal(getEssenceIconPrefix('fa-duotone fa-leaf'), 'fa-duotone');
  });

  it('returns a catalog match when one exists and a humanized passthrough otherwise', () => {
    const known = getEssenceIconOption('far fa-address-book', ESSENCE_ICON_OPTIONS);
    assert.equal(known.label, 'Address Book');
    assert.equal(known.variant, 'regular');

    const custom = getEssenceIconOption('fas fa-dragon', ESSENCE_ICON_OPTIONS);
    assert.equal(custom.label, 'Dragon');
    assert.equal(custom.iconClass, 'fas fa-dragon');
  });
});
