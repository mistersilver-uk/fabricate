import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEssenceIconOptions,
  DEFAULT_ESSENCE_ICON,
  ESSENCE_ICON_OPTIONS,
  filterEssenceIconOptions,
  getEssenceIconOption,
  getEssenceIconPrefix,
  normalizeEssenceIcon
} from '../src/ui/svelte/util/essenceIcons.js';

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

  it('builds the full classic free icon catalog with solid and regular variants only', () => {
    const options = buildEssenceIconOptions();

    assert.ok(options.length > 1500);
    assert.ok(options.some(option => option.iconClass === 'fas fa-soap'));
    assert.ok(options.some(option => option.iconClass === 'fas fa-fingerprint'));
    assert.ok(options.some(option => option.iconClass === 'fas fa-wine-glass'));
    assert.ok(options.some(option => option.iconClass === 'fas fa-address-book'));
    assert.ok(options.some(option => option.iconClass === 'far fa-address-book'));
    assert.ok(options.every(option => option.iconClass.startsWith('fas ') || option.iconClass.startsWith('far ')));
    assert.ok(!options.some(option => option.iconClass === 'fab fa-github'));
  });

  it('builds custom icon definitions into solid and regular picker options', () => {
    const options = buildEssenceIconOptions([
      { iconName: 'address-book', label: 'Address Book', hasRegular: true },
      { iconName: 'soap', label: 'Soap', hasRegular: false }
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

    const regularMatches = filterEssenceIconOptions(ESSENCE_ICON_OPTIONS, 'address book regular');
    assert.ok(regularMatches.some(option => option.iconClass === 'far fa-address-book'));
    assert.ok(!regularMatches.some(option => option.iconClass === 'fas fa-address-book'));
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
