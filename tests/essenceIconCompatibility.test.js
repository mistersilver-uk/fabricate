import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildEssenceIconOptions,
  USER_SEARCH_ALIAS_KEYS,
  buildIconDefinitionsForMeasuredBundle,
  filterEssenceIconOptions,
  getEssenceIconOptions,
  getFoundryCuratedIconDefinitionsForMajor,
  getFoundryIconDefinitionsForMajor,
  measureLoadedFontAwesomeGlyphs,
} from '../src/ui/svelte/util/essenceIcons.js';
import {
  FOUNDRY_CURATED_ICON_DEFINITIONS,
  FOUNDRY_ICON_DEFINITIONS,
  findCuratedIcon,
} from '../src/ui/svelte/util/foundryIconVocabulary.js';
import {
  findCuratedIconRecord,
  listCuratedIconVocabulary,
} from '../src/utils/iconVocabulary.js';

// A stylesheet fixture shaped like the one a Foundry 13 client actually exposes.
//
// Foundry 13 declares its Font Awesome stylesheet as a LAYERED core style, and its layout emits a
// layered style as `@import "…" layer(variables)` inside an inline `<style>` rather than as a
// `<link>`. `document.styleSheets` therefore holds ONE sheet whose only rule is a `CSSImportRule`,
// and `CSSImportRule` does not inherit from `CSSGroupingRule`: it exposes `.styleSheet`, not
// `.cssRules`. A fixture built as a flat rules array cannot see that, which is exactly how a
// reader that measured zero glyphs on every v13 client passed its tests.
const makeStyle = (declarations) => ({
  getPropertyValue: (name) => declarations[name] ?? '',
});

const makeRule = (selectorText, declarations) => ({
  selectorText,
  style: makeStyle(declarations),
});

const makeImportRule = (rules) => ({
  href: 'fonts/fontawesome/css/all.min.css',
  media: { mediaText: '' },
  layerName: 'variables',
  styleSheet: { cssRules: rules },
});

const makeImportingDocument = (rules) => ({
  styleSheets: [{ href: null, cssRules: [makeImportRule(rules)] }],
});

// The multi-declaration classic bodies the real bundle carries: `.fa-gear{--fa:"\f013";--fa--fa:"\f013"}`.
const FOUNDRY_13_CLASSIC_RULES = [
  makeRule('.fa-gear,.fa-cog', { '--fa': '"\\f013"', '--fa--fa': '"\\f013"' }),
  makeRule('.fa-flask', { '--fa': '"\\f0c3"', '--fa--fa': '"\\f0c3"' }),
  makeRule('.fa-spin', {}),
];

function withDocument(documentObject, run) {
  const original = globalThis.document;
  globalThis.document = documentObject;
  try {
    return run();
  } finally {
    globalThis.document = original;
  }
}

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
      v13.some((definition) => definition.iconCode === 'flask'),
      false,
      'a name the committed catalogue carries is not offered when this client cannot draw it'
    );
  });

  // THE LICENCE CONSTRAINT AT RUNTIME. On any generation the module measures rather than assumes,
  // the map it measures comes from the CLIENT'S OWN Font Awesome — which is Pro, and declares every
  // Pro-only name. The only thing keeping those names out of the rebuilt vocabulary is that the
  // rebuild walks the COMMITTED catalogue's names and looks each one up in the measurement, rather
  // than walking the measurement. That direction is the whole enforcement, it is one word wide, and
  // reversing it reads like a tidy-up: iterating the measured map instead passes every other test
  // in this suite while handing back `candle-holder`.
  it('never rebuilds a name the committed catalogue may not reference, even when the client draws it', () => {
    const glyphs = new Map([
      ['gear', '--fa:"\\f013"'],
      ['cog', '--fa:"\\f013"'],
      ['candle-holder', '--fa:"\\f6bc"'],
      ['treasure-chest', '--fa:"\\f723"'],
    ]);

    const v13 = getFoundryIconDefinitionsForMajor(13, { glyphsByName: glyphs });
    const names = v13.flatMap(({ iconCode, aliases }) => [iconCode, ...aliases]);

    assert.deepEqual(names.filter((name) => name === 'candle-holder' || name === 'treasure-chest'), []);
    assert.ok(names.includes('gear'), 'the free names the client draws are still offered');
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
    const documentObject = {
      styleSheets: [
        {
          cssRules: [
            makeRule('.fa-cog,.fa-gear', { '--fa': '"\\f013"' }),
            makeRule('.fa-flask::before', { content: '"\\f0c3"' }),
            makeRule('.fa-spin', {}),
            makeRule('.fa-li', { content: '"x"' }),
          ],
        },
      ],
    };

    assert.deepEqual(measureLoadedFontAwesomeGlyphs(documentObject), new Map([
      ['cog', 'u+f013'],
      ['gear', 'u+f013'],
      ['flask', 'u+f0c3'],
    ]), 'a layout rule\'s content is not a glyph: only a ::before assignment is');
  });

  // The defect this fixture exists for. A flat rules array cannot reach the rules a v13 client
  // actually serves, so the previous reader measured nothing and every picker rendered zero rows.
  it('descends the @import a layered core style emits, not just grouping rules', () => {
    const glyphs = measureLoadedFontAwesomeGlyphs(
      makeImportingDocument(FOUNDRY_13_CLASSIC_RULES)
    );

    assert.deepEqual(glyphs, new Map([
      ['gear', 'u+f013'],
      ['cog', 'u+f013'],
      ['flask', 'u+f0c3'],
    ]), 'the glyph rules live inside the imported sheet, behind `.styleSheet` rather than `.cssRules`');
  });

  it('descends grouping rules nested inside an imported sheet', () => {
    const glyphs = measureLoadedFontAwesomeGlyphs(
      makeImportingDocument([
        { conditionText: 'screen', cssRules: [makeRule('.fa-gear', { '--fa': '"\\f013"' })] },
      ])
    );

    assert.deepEqual(glyphs, new Map([['gear', 'u+f013']]));
  });

  // Foundry behind a reverse proxy or a CDN is a supported deployment, and a cross-origin sheet
  // THROWS on access rather than answering null — at the sheet, and at an import inside it.
  it('skips a sheet it may not read instead of failing the whole measurement', () => {
    const unreadableSheet = {
      get cssRules() {
        throw new DOMException('cross-origin', 'SecurityError');
      },
    };
    const unreadableImport = {
      styleSheets: [
        {
          cssRules: [
            {
              href: 'https://cdn.example/all.min.css',
              get styleSheet() {
                throw new DOMException('cross-origin', 'SecurityError');
              },
            },
          ],
        },
      ],
    };

    assert.deepEqual(
      measureLoadedFontAwesomeGlyphs({
        styleSheets: [
          unreadableSheet,
          ...unreadableImport.styleSheets,
          ...makeImportingDocument(FOUNDRY_13_CLASSIC_RULES).styleSheets,
        ],
      }),
      new Map([['gear', 'u+f013'], ['cog', 'u+f013'], ['flask', 'u+f0c3']]),
      'an unreadable sheet costs its own rules, never the rest of the document'
    );
  });

  // Chromium resolves the escape when it serializes `content` (the literal private-use character)
  // and preserves the raw token stream of a custom property, and Foundry 13's bundle sets BOTH on
  // different rules for the same glyph. Keyed on the declaration text, one glyph became two picker
  // rows; keyed on the CODEPOINT, it is one.
  it('groups a raw --fa escape and a resolved content character as one glyph', () => {
    const glyphs = measureLoadedFontAwesomeGlyphs(
      makeImportingDocument([
        makeRule('.fa-gear', { '--fa': '"\\f013"', '--fa--fa': '"\\f013"' }),
        makeRule('.fa-cog::before', { content: '"\uf013"' }),
      ])
    );

    assert.equal(glyphs.get('gear'), glyphs.get('cog'), 'one drawing, one key');
    assert.deepEqual(buildIconDefinitionsForMeasuredBundle(FOUNDRY_ICON_DEFINITIONS, glyphs), [
      { iconCode: 'gear', label: 'Gear', aliases: ['cog'] },
    ], 'and therefore one picker row rather than two');
  });

  // `--fa:"\30 "` is the digit zero: the trailing space TERMINATES the escape rather than
  // belonging to it, which is how a minifier spells an escape followed by a hex-looking character.
  it('reads a whitespace-terminated escape as the codepoint it names', () => {
    const glyphs = measureLoadedFontAwesomeGlyphs(
      makeImportingDocument([makeRule('.fa-0', { '--fa': '"\\30 "' })])
    );

    assert.deepEqual(glyphs, new Map([['0', 'u+30']]));
  });
});

describe('an unreadable or unparsed bundle never empties a picker', () => {
  it('falls back to the committed catalogue for an empty injected measurement', () => {
    assert.equal(
      getFoundryIconDefinitionsForMajor(13, { glyphsByName: new Map() }),
      FOUNDRY_ICON_DEFINITIONS,
      'zero rows is an unusable icon field; a name this client may not draw is one cosmetic row'
    );
    assert.equal(
      getFoundryCuratedIconDefinitionsForMajor(13, { glyphsByName: new Map() }).length,
      getFoundryCuratedIconDefinitionsForMajor(14).length
    );
  });

  // The reason the empty answer must not be memoized: Foundry serves the bundle through an
  // `@import`, so a picker built before that import resolves measures nothing, and a memoized
  // empty result would decide every picker for the rest of the session.
  it('measures again after an early call found an unparsed stylesheet', () => {
    const documentObject = { styleSheets: [] };

    withDocument(documentObject, () => {
      assert.equal(
        getFoundryIconDefinitionsForMajor(13),
        FOUNDRY_ICON_DEFINITIONS,
        'before the import resolves, the committed catalogue is the honest answer'
      );

      documentObject.styleSheets = makeImportingDocument(FOUNDRY_13_CLASSIC_RULES).styleSheets;
      const measured = getFoundryIconDefinitionsForMajor(13);

      assert.deepEqual(
        measured.map(({ iconCode }) => iconCode),
        ['flask', 'gear'],
        'the retry reads the bundle the earlier call could not'
      );
      assert.equal(getFoundryIconDefinitionsForMajor(13), measured, 'and THAT answer is memoized');
    });
  });

  // `currentFoundryMajor()` cannot always tell which generation it is on, and v14 is the one
  // branch that never measures. Defaulting the unknown case to v14 would offer a v13 client the
  // whole Font Awesome 7 name list, every added name of which draws as a blank square and any of
  // which a GM can persist into world data.
  it('measures rather than assuming the newest generation when it cannot tell', () => {
    const originalGame = globalThis.game;
    globalThis.game = undefined;

    try {
      withDocument(makeImportingDocument(FOUNDRY_13_CLASSIC_RULES), () => {
        assert.deepEqual(
          getFoundryIconDefinitionsForMajor().map(({ iconCode }) => iconCode),
          ['flask', 'gear'],
          'when in doubt, measure'
        );
      });

      withDocument({ styleSheets: [] }, () => {
        assert.equal(
          getFoundryIconDefinitionsForMajor(),
          FOUNDRY_ICON_DEFINITIONS,
          'and when the measurement is empty, use the committed catalogue'
        );
      });
    } finally {
      globalThis.game = originalGame;
    }
  });
});

// The published API and the pickers must offer ONE vocabulary. Reading the committed catalogue
// directly published names an older client cannot draw, contradicting what every picker offers.
describe('the published vocabulary answers for the client that asked', () => {
  it('lists and resolves the measured vocabulary, not the committed catalogue', () => {
    withDocument(makeImportingDocument([
      makeRule('.fa-gear,.fa-cog', { '--fa': '"\\f013"', '--fa--fa': '"\\f013"' }),
    ]), () => {
      assert.deepEqual(
        listCuratedIconVocabulary(),
        [{ iconCode: 'gear', label: 'Gear', aliases: ['cog'] }],
        'the published list is the set this client can draw'
      );
      assert.deepEqual(findCuratedIconRecord('cog'), {
        iconCode: 'gear',
        label: 'Gear',
        aliases: ['cog'],
      }, 'an alias still resolves to the row that draws it');
      assert.equal(
        findCuratedIconRecord('flask'),
        null,
        'and a catalogue name this bundle does not declare resolves to nothing, as the picker offers nothing'
      );
    });
  });
});

describe('human icon search aliases', () => {
  const options = buildEssenceIconOptions([
    { iconCode: 'flask', label: 'Flask', aliases: [] },
    { iconCode: 'coins', label: 'Coins', aliases: [] },
    { iconCode: 'hat-wizard', label: 'Hat Wizard', aliases: [] },
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
      ['hat-wizard']
    );
    assert.deepEqual(
      filterEssenceIconOptions(options, 'forge tool').map((option) => option.iconName),
      ['hammer']
    );
  });
});

// The search-alias tables are a hand-maintained mirror of a GENERATED catalogue, so a key that
// resolves to nothing is invisible: it costs nothing at load and simply never fires. Three had
// already stranded — `user-wizard` (the icon is `hat-wizard`), and the `anvil` and `armor` name
// tokens, neither of which appears in any name the bundle ships.
describe('the search-alias tables cannot strand a key', () => {
  it('hangs every icon-keyed alias list on an icon the vocabulary offers', () => {
    for (const iconName of USER_SEARCH_ALIAS_KEYS.iconNames) {
      assert.ok(
        findCuratedIcon(iconName),
        `${iconName} carries search aliases but is in no curated row, so none of them can ever match`
      );
    }
  });

  it('hangs every token-keyed alias list on a token some offered name is spelled with', () => {
    const nameTokens = new Set();
    for (const definition of FOUNDRY_CURATED_ICON_DEFINITIONS) {
      for (const name of [definition.iconCode, ...definition.aliases]) {
        for (const token of name.split('-')) nameTokens.add(token);
      }
    }

    for (const token of USER_SEARCH_ALIAS_KEYS.nameTokens) {
      assert.ok(
        nameTokens.has(token),
        `no curated name is spelled with the token \`${token}\`, so its aliases are unreachable`
      );
    }
  });
});

describe('icon search ranks the row a GM named above the rows that mention it', () => {
  const options = buildEssenceIconOptions([
    { iconCode: 'car-key', label: 'Car Key', aliases: [] },
    { iconCode: 'field-hockey-stick-ball', label: 'Field Hockey Stick Ball', aliases: [] },
    { iconCode: 'glass-whiskey', label: 'Glass Whiskey', aliases: [] },
    { iconCode: 'key', label: 'Key', aliases: [] },
    { iconCode: 'key-skeleton', label: 'Key Skeleton', aliases: [] },
    { iconCode: 'gear', label: 'Gear', aliases: ['cog'] },
  ]);

  const filteredNames = (searchTerm) =>
    filterEssenceIconOptions(options, searchTerm).map((option) => option.iconName);

  it('puts an exact name first, then a name that starts with the query', () => {
    assert.deepEqual(filteredNames('key'), [
      'key',
      'key-skeleton',
      'car-key',
      'field-hockey-stick-ball',
      'glass-whiskey',
    ]);
  });

  it('ranks a word inside a name above a bare substring of one', () => {
    assert.deepEqual(filteredNames('hockey'), ['field-hockey-stick-ball']);
    assert.deepEqual(filteredNames('whis'), ['glass-whiskey']);
  });

  it('ranks an alias with the names, since an alias is the name a GM typed', () => {
    assert.deepEqual(filteredNames('cog'), ['gear']);
  });

  it('preserves catalogue order inside a tier', () => {
    assert.deepEqual(filteredNames('e'), [
      'car-key',
      'field-hockey-stick-ball',
      'glass-whiskey',
      'key',
      'key-skeleton',
      'gear',
    ]);
  });

  // Every row used to carry the literal `fas solid` in its search text, so the second keystroke of
  // `solid`, `lightning`, `asterisk` or `astronaut` matched the entire vocabulary. Nothing read it:
  // a caller filtering by weight reads `variant`.
  it('does not match every row on the style prefix and weight it shares with them', () => {
    const curated = getEssenceIconOptions();

    for (const query of ['fas', 'solid']) {
      assert.ok(
        filterEssenceIconOptions(curated, query).length < curated.length,
        `\`${query}\` is on every row, so searching it used to match the whole vocabulary`
      );
    }
    assert.ok(
      curated.every((option) => !option.searchText.split(' ').includes('solid')),
      'the weight is a FIELD, and nothing searches it: the picker reads `variant`'
    );
    assert.deepEqual(filteredNames('solid'), []);
    assert.ok(options.every((option) => option.variant === 'solid'), 'the weight is still reported');
  });
});
