import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_ESSENCE_ICON,
  ESSENCE_ICON_OPTIONS,
  filterEssenceIconOptions,
  getEssenceIconOption,
  normalizeEssenceIcon
} from '../src/ui/svelte/util/essenceIcons.js';

describe('essenceIcons utility', () => {
  it('normalizes empty icon values to the default essence icon', () => {
    assert.equal(normalizeEssenceIcon(''), DEFAULT_ESSENCE_ICON);
    assert.equal(normalizeEssenceIcon(null), DEFAULT_ESSENCE_ICON);
  });

  it('returns the full icon catalog when no search term is provided', () => {
    assert.equal(filterEssenceIconOptions('').length, ESSENCE_ICON_OPTIONS.length);
  });

  it('filters icon options by human-readable labels and keywords', () => {
    const poisonMatches = filterEssenceIconOptions('toxic');
    assert.ok(poisonMatches.some(option => option.iconClass === 'fas fa-skull-crossbones'));

    const growthMatches = filterEssenceIconOptions('sprout');
    assert.ok(growthMatches.some(option => option.iconClass === 'fas fa-seedling'));
  });

  it('includes icon classes in the search index', () => {
    const fireMatches = filterEssenceIconOptions('fa-fire');
    assert.ok(fireMatches.some(option => option.iconClass === 'fas fa-fire'));
  });

  it('returns a catalog match when one exists and a passthrough option otherwise', () => {
    const known = getEssenceIconOption('fas fa-fire');
    assert.equal(known.label, 'Fire');

    const custom = getEssenceIconOption('fas fa-dragon');
    assert.equal(custom.label, 'fas fa-dragon');
    assert.equal(custom.iconClass, 'fas fa-dragon');
  });
});
