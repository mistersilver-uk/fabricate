import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEssenceIconOptions,
  DEFAULT_ESSENCE_ICON,
  extractFontAwesomeIconNamesFromCss,
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

  it('preserves the detected style prefix when normalizing an icon class', () => {
    assert.equal(normalizeEssenceIcon('fa-duotone fa-flask'), 'fa-duotone fa-flask');
    assert.equal(normalizeEssenceIcon('fas fa-fire'), 'fas fa-fire');
  });

  it('extracts icon names from Font Awesome CSS declarations with aliases', () => {
    const css = [
      '.fa-fire{--fa:"\\\\f06d";--fa--fa:"\\\\f06d\\\\f06d"}',
      '.fa-person-dress-simple,.fa-female{--fa:"\\\\f182";--fa--fa:"\\\\f182\\\\f182"}',
      '.fa-solid{font-weight:900}',
      '.fa-spin{animation:fa-spin 2s linear infinite}'
    ].join('');

    assert.deepEqual(extractFontAwesomeIconNamesFromCss(css), [
      'female',
      'fire',
      'person-dress-simple'
    ]);
  });

  it('builds icon options with the supplied prefix and humanized labels', () => {
    const options = buildEssenceIconOptions(['mortar-pestle', 'seedling'], 'fa-duotone');

    assert.deepEqual(options.map(option => option.iconClass), [
      'fa-duotone fa-mortar-pestle',
      'fa-duotone fa-seedling'
    ]);
    assert.deepEqual(options.map(option => option.label), [
      'Mortar Pestle',
      'Seedling'
    ]);
  });

  it('filters icon options by icon name and class text', () => {
    const options = buildEssenceIconOptions(['skull-crossbones', 'seedling', 'fire']);

    const poisonMatches = filterEssenceIconOptions(options, 'skull');
    assert.ok(poisonMatches.some(option => option.iconClass === 'fas fa-skull-crossbones'));

    const classMatches = filterEssenceIconOptions(options, 'fa-fire');
    assert.ok(classMatches.some(option => option.iconClass === 'fas fa-fire'));
  });

  it('detects short and long style prefixes from an icon class', () => {
    assert.equal(getEssenceIconPrefix('fas fa-fire'), 'fas');
    assert.equal(getEssenceIconPrefix('fa-duotone fa-flask'), 'fa-duotone');
    assert.equal(getEssenceIconPrefix('fa-sharp-duotone fa-leaf'), 'fa-sharp-duotone');
  });

  it('returns a catalog match when one exists and a humanized passthrough otherwise', () => {
    const options = buildEssenceIconOptions(['fire', 'leaf']);

    const known = getEssenceIconOption('fas fa-fire', options);
    assert.equal(known.label, 'Fire');

    const custom = getEssenceIconOption('fas fa-dragon', options);
    assert.equal(custom.label, 'Dragon');
    assert.equal(custom.iconClass, 'fas fa-dragon');
  });
});
