import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildEssenceIconOptions,
  buildIconDefinitionsForMeasuredBundle,
  filterEssenceIconOptions,
  getFoundryIconDefinitionsForMajor,
  measureLoadedFontAwesomeGlyphs,
} from '../src/ui/svelte/util/essenceIcons.js';
import { FOUNDRY_ICON_DEFINITIONS } from '../src/ui/svelte/util/foundryIconVocabulary.js';

describe('version-aware Foundry icon definitions', () => {
  it('uses the committed Foundry 14 catalogue unchanged on v14', () => {
    assert.equal(getFoundryIconDefinitionsForMajor(14), FOUNDRY_ICON_DEFINITIONS);
  });

  it('filters the v14 classic name superset by names the measured v13 bundle actually declares', () => {
    const glyphs = new Map([
      ['gear', 'content:"\\f013"'],
      ['cog', 'content:"\\f013"'],
    ]);
    const v13 = getFoundryIconDefinitionsForMajor(13, { glyphsByName: glyphs });

    assert.deepEqual(v13, [
      { iconCode: 'gear', label: 'Gear', aliases: ['cog'] },
    ]);
    assert.equal(
      v13.some((definition) => definition.iconCode === 'caret-large-left'),
      false,
      'a v14-only name is not offered just because the committed catalogue knows it'
    );
  });

  it('regroups aliases by the glyph mapping of the measured generation', () => {
    const source = [
      { iconCode: 'gear', label: 'Gear', aliases: ['cog'] },
      { iconCode: 'merged', label: 'Merged', aliases: ['old-name'] },
    ];
    const glyphs = new Map([
      ['gear', 'glyph-a'],
      ['cog', 'glyph-a'],
      ['merged', 'glyph-b'],
      ['old-name', 'glyph-c'],
    ]);

    assert.deepEqual(buildIconDefinitionsForMeasuredBundle(source, glyphs), [
      { iconCode: 'gear', label: 'Gear', aliases: ['cog'] },
      { iconCode: 'merged', label: 'Merged', aliases: [] },
      { iconCode: 'old-name', label: 'Old Name', aliases: [] },
    ]);
  });

  it('reads both FA7 --fa and FA6 content glyph assignments from a loaded CSSOM', () => {
    const makeStyle = (values) => ({
      getPropertyValue: (name) => values[name] ?? '',
    });
    const documentObject = {
      styleSheets: [
        {
          cssRules: [
            {
              selectorText: '.fa-cog,.fa-gear',
              style: makeStyle({ '--fa': '"\\f013"' }),
            },
            {
              selectorText: '.fa-flask::before',
              style: makeStyle({ content: '"\\f0c3"' }),
            },
            {
              selectorText: '.fa-spin',
              style: makeStyle({}),
            },
          ],
        },
      ],
    };

    assert.deepEqual(measureLoadedFontAwesomeGlyphs(documentObject), new Map([
      ['cog', 'fa:"\\f013"'],
      ['gear', 'fa:"\\f013"'],
      ['flask', 'content:"\\f0c3"'],
    ]));
  });
});

describe('human icon search aliases', () => {
  const options = buildEssenceIconOptions([
    { iconCode: 'flask', label: 'Flask', aliases: [] },
    { iconCode: 'coins', label: 'Coins', aliases: [] },
    { iconCode: 'user-wizard', label: 'User Wizard', aliases: [] },
    { iconCode: 'hammer', label: 'Hammer', aliases: [] },
  ]);

  it('adds a frozen search-alias vocabulary to every picker row', () => {
    for (const option of options) {
      assert.ok(option.searchAliases.length > 0, `${option.iconName} has no search aliases`);
      assert.ok(Object.isFrozen(option.searchAliases));
    }
  });

  it('finds icons by plain-language concepts instead of requiring Font Awesome names', () => {
    assert.deepEqual(
      filterEssenceIconOptions(options, 'potion').map((option) => option.iconName),
      ['flask']
    );
    assert.deepEqual(
      filterEssenceIconOptions(options, 'gold').map((option) => option.iconName),
      ['coins']
    );
    assert.deepEqual(
      filterEssenceIconOptions(options, 'character mage').map((option) => option.iconName),
      ['user-wizard']
    );
    assert.deepEqual(
      filterEssenceIconOptions(options, 'forge tool').map((option) => option.iconName),
      ['hammer']
    );
  });
});
