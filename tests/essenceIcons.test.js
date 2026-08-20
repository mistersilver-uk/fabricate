import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEssenceIconOptions,
  DEFAULT_ESSENCE_ICON,
  ESSENCE_COLOR_TOKENS,
  filterEssenceIconOptions,
  getEssenceAllIconOptions,
  getEssenceIconOption,
  getEssenceIconOptions,
  getEssenceIconPrefix,
  normalizeEssenceColorToken,
  normalizeEssenceIcon
} from '../src/ui/svelte/util/essenceIcons.js';
import {
  FOUNDRY_CURATED_ICON_DEFINITIONS,
  FOUNDRY_ICON_BUNDLE_RELEASE,
  FOUNDRY_ICON_DEFINITIONS,
  FOUNDRY_ICON_FREE_INTERSECTION,
  findCuratedIcon,
  isExcludedIconName
} from '../src/ui/svelte/util/foundryIconVocabulary.js';

const CURATED_ICON_COUNT = 750;
const CATALOGUE_ICON_COUNT = 1420;

// EVERY claim below, positive and negative, is made against MEMBERSHIP rather than against the
// exclusion predicate.
//
// That is stronger than it used to be, and deliberately. `isExcludedIconName` answers "does any
// exclusion pattern match this string": it consults no catalogue, so it says `false` of a typo and
// of a name Foundry cannot render. Asserting it in the positive direction would pass while the icon
// was absent from every picker in the module, and generating the catalogue from Foundry's bundle
// widens that gap rather than closing it, because the predicate is now the only thing between a
// typo and a curated entry across every name the catalogue carries.
//
// `findCuratedIcon` answers from the catalogue in both directions, and it resolves ALIASES, which
// is the only honest way to ask the question of a vocabulary that offers one name per glyph.
function assertCurated(iconNames) {
  for (const iconName of iconNames) {
    assert.ok(findCuratedIcon(iconName), `Expected "${iconName}" to be in the curated vocabulary`);
  }
}

function assertNotCurated(iconNames, description) {
  for (const iconName of iconNames) {
    assert.equal(
      findCuratedIcon(iconName),
      null,
      `${description} "${iconName}" should not be in the curated vocabulary`
    );
  }
}

describe('essence colour tokens (issue 917)', () => {
  it('offers exactly the shared --fab-tag-* palette', () => {
    assert.deepEqual(
      [...ESSENCE_COLOR_TOKENS],
      ['sage', 'mist', 'lavender', 'rose', 'peach', 'butter', 'aqua', 'mauve']
    );
  });

  it('stores a palette token bare, stripping a --fab-tag- prefix', () => {
    assert.equal(normalizeEssenceColorToken('aqua'), 'aqua');
    assert.equal(normalizeEssenceColorToken('--fab-tag-aqua'), 'aqua');
    assert.equal(normalizeEssenceColorToken('  rose  '), 'rose');
  });

  it('treats unset and unrecognized colours as null, the accent default', () => {
    assert.equal(normalizeEssenceColorToken(''), null);
    assert.equal(normalizeEssenceColorToken(null), null);
    assert.equal(normalizeEssenceColorToken(undefined), null);
    assert.equal(normalizeEssenceColorToken('#ff0000'), null);
    assert.equal(normalizeEssenceColorToken('crimson'), null);
  });
});

describe('the catalogue Foundry can actually render', () => {
  // The catalogue is TWO measurements, and it is worth nothing unless both are true of it. The
  // glyphs and their aliases come from the bundle a Foundry client loads, which the predecessor of
  // this file got wrong by reading published free metadata for a different font. The NAMES are
  // then narrowed to the ones Font Awesome publishes for free, which is a licensing requirement
  // rather than a preference — see the header of foundryIconCatalogue.js.
  it('is measured from the bundle Foundry ships and narrowed to the free release', () => {
    assert.equal(FOUNDRY_ICON_BUNDLE_RELEASE.edition, 'Pro');
    assert.equal(FOUNDRY_ICON_BUNDLE_RELEASE.version, '7.2.0');
    assert.equal(FOUNDRY_ICON_FREE_INTERSECTION.edition, 'Free');
    assert.equal(FOUNDRY_ICON_FREE_INTERSECTION.version, '7.3.1');
    assert.equal(FOUNDRY_ICON_DEFINITIONS.length, CATALOGUE_ICON_COUNT);
  });

  // `candle-holder` is the worked example, and it runs the other way round from the way this file
  // used to read it. Foundry renders it, a companion module offers it, and Fabricate declines it:
  // Foundry's own bundled licence forbids a third-party package developer from having Pro icons
  // "used, re-packaged, or referenced in code", and an icon code in a catalogue is a reference in
  // code. Every name below is one Foundry can draw and Fabricate may not write.
  //
  // Asserted against the CATALOGUE, not only the curated set: these are absent because they are
  // unnameable, not because a curation rule held them out, and a test that only checked curation
  // would keep passing if they came back as uncurated catalogue rows.
  it('declines the Pro-only names Foundry can render but Fabricate may not reference', () => {
    for (const iconName of [
      'candle-holder', 'cauldron', 'raygun', 'starship', 'treasure-chest', 'scythe'
    ]) {
      assert.ok(
        FOUNDRY_ICON_DEFINITIONS.every(
          ({ iconCode, aliases }) => iconCode !== iconName && !aliases.includes(iconName)
        ),
        `"${iconName}" is a Pro-only name and must not appear in the catalogue under any spelling`
      );
      assert.equal(findCuratedIcon(iconName), null);
    }
  });

  // `Object.freeze` is shallow, and the curated vocabulary is a FILTER of this array, so its
  // entries are these entries. An unfrozen entry hands any caller a writable handle on a row every
  // Fabricate picker renders from, in both sets at once, with nothing to trace it to.
  it('freezes every entry, not just the array holding them', () => {
    const [entry] = FOUNDRY_ICON_DEFINITIONS;
    assert.ok(Object.isFrozen(FOUNDRY_ICON_DEFINITIONS));
    assert.ok(Object.isFrozen(entry), 'catalogue entries must be frozen individually');
    assert.ok(Object.isFrozen(entry.aliases), 'an entry alias list must be frozen too');
  });

  // Aliases are why offering one name per glyph refuses no name. They are also why the exclusions
  // are sound: an exclusion describes what a glyph DEPICTS, and a depiction cannot be dodged by
  // spelling.
  it('records every name the bundle gives a glyph, and resolves each of them', () => {
    const gear = findCuratedIcon('gear');
    assert.ok(gear);
    assert.ok(gear.aliases.includes('cog'));
    assert.equal(findCuratedIcon('cog'), gear);
    assert.equal(findCuratedIcon('tools').iconCode, 'screwdriver-wrench');
  });

  it('excludes a glyph under every one of its names, not just the one a pattern lists', () => {
    // The transport-control rule names `play-...`. `circle-play` is the same button under the
    // other spelling, and a rule that caught only the name it happened to list would offer it.
    assert.equal(findCuratedIcon('play-circle'), null);
    assert.equal(
      findCuratedIcon('circle-play'),
      null,
      'circle-play is the same drawing as play-circle, so excluding one must exclude the other'
    );
  });

  // The predicate is not membership, and this test exists so nobody mistakes it for one.
  it('answers the predicate for a name no font contains, which is why membership is asked instead', () => {
    assert.equal(isExcludedIconName('definitely-not-an-icon'), false);
    assert.equal(findCuratedIcon('definitely-not-an-icon'), null);
  });
});

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

  // The membership IS this module's product, and it is what the icon-vocabulary API publishes, so
  // the size is pinned EXACTLY rather than to a band. A band wide enough to hold the pre-widening
  // 510 and the post-widening 750 is a band a pattern edit can move two hundred icons inside
  // without failing anything.
  it('pins the curated vocabulary to an exact size', () => {
    const curatedCount = FOUNDRY_CURATED_ICON_DEFINITIONS.length;

    assert.equal(
      curatedCount,
      CURATED_ICON_COUNT,
      `Expected exactly ${CURATED_ICON_COUNT} curated icons, got ${curatedCount}. `
        + 'If a pattern change moved the membership deliberately, update this number and say which '
        + 'icons moved and why in the commit body.'
    );
  });

  // The single construction site. A curated entry is a CATALOGUE entry, which is what makes the
  // vocabulary publishable at all: a name added beside the filter rather than to the catalogue
  // would be a name the catalogue cannot vouch for, and the exclusion predicate would wave it
  // through because it consults no catalogue.
  it('draws every curated entry from the catalogue by identity', () => {
    const catalogueEntries = new Set(FOUNDRY_ICON_DEFINITIONS);
    for (const definition of FOUNDRY_CURATED_ICON_DEFINITIONS) {
      assert.ok(catalogueEntries.has(definition), `"${definition.iconCode}" is not a catalogue entry`);
    }
  });

  it('includes core fantasy crafting icons', () => {
    assertCurated([
      'mortar-pestle', 'flask', 'flask-vial', 'vial', 'vials',
      'fire', 'fire-flame-curved', 'fire-flame-simple',
      'water', 'wind', 'bolt', 'bolt-lightning',
      'snowflake', 'sun', 'moon', 'star', 'meteor',
      'scroll', 'book', 'book-skull', 'book-open',
      'wand-magic', 'wand-magic-sparkles', 'wand-sparkles',
      'hat-wizard', 'dragon', 'skull', 'skull-crossbones',
      'gem', 'diamond', 'ring', 'crown', 'shield',
      'feather', 'feather-pointed', 'leaf', 'seedling', 'tree',
      'spider', 'frog', 'crow', 'dove', 'fish', 'horse', 'cat', 'dog', 'worm',
      'key', 'lock', 'lock-open',
      'hammer', 'gavel', 'wrench', 'scissors',
      'eye', 'eye-dropper', 'hand', 'brain', 'bone',
      'heart', 'droplet', 'ghost',
      'dungeon', 'church', 'monument', 'archway',
      'mountain', 'volcano', 'tornado', 'hurricane', 'rainbow',
      'dice-d20', 'dice-d6', 'chess-knight', 'chess-rook',
      'anchor', 'ship', 'sailboat', 'compass',
      'hourglass', 'clock', 'bell',
      'flag', 'map', 'route',
      'wine-glass', 'mug-hot', 'utensils', 'egg', 'bread-slice',
      'scale-balanced', 'weight-hanging',
      'paintbrush', 'palette', 'pen', 'pencil',
      'staff-snake', 'cross', 'ankh', 'yin-yang', 'om',
      'user', 'user-ninja', 'user-secret', 'users',
      'mask', 'masks-theater',
      'tag', 'tags'
    ]);
  });

  // THE NO-REGRESSION CONTRACT. A companion module hand-maintains its own icon list and is going to
  // bind to this vocabulary. Seventeen of the icons its list offers were missing from the
  // pre-widening curated set; these are the SIXTEEN of them Fabricate can now offer, every one
  // held out before by rules drawn for "fantasy alone" and admitted now by rules that predict
  // them. A syringe is a med-bay, a stopwatch times a training montage, a dumbbell IS the training
  // montage, a checkered flag ends a race, and a blighted ear of wheat is the oldest fantasy plot
  // there is. None of them is here by name on an allow-list.
  //
  // The seventeenth was `candle-holder`, and it is deliberately NOT here. It is a Pro-only name:
  // Foundry draws it, and offering it would mean Fabricate referencing a Pro icon in code, which
  // the licence Foundry ships with its own bundle forbids a third-party package developer from
  // doing. The companion may keep offering it — it is not bound by what Fabricate can write down —
  // so this contract is sixteen icons wide, not seventeen, and the gap is a licence rather than a
  // regression.
  it('carries every icon a companion offered that Fabricate is free to name', () => {
    assertCurated([
      'hand-sparkles', 'virus', 'prescription-bottle', 'pills', 'capsules', 'syringe', 'lungs',
      'blender', 'jug-detergent', 'plug', 'circle-nodes', 'stopwatch', 'flag-checkered',
      'list-check', 'wheat-awn-circle-exclamation', 'dumbbell'
    ]);
    assert.equal(
      findCuratedIcon('candle-holder'),
      null,
      'candle-holder is Pro-only: it is out on the licence, and re-admitting it needs a Pro licence'
    );
  });

  it('excludes single-character icons and the marks that only punctuate', () => {
    const singleCharacters = [];
    for (let digit = 0; digit <= 9; digit += 1) singleCharacters.push(String(digit));
    for (let code = 97; code <= 122; code += 1) singleCharacters.push(String.fromCharCode(code));
    assertNotCurated(singleCharacters, 'Single character');
    // `comma`, `period`, `semicolon`, `apostrophe`, `tilde`, `pipe`, `accent-grave` and
    // `brackets-curly` used to stand here and are all Pro-only names, so the catalogue no longer
    // carries anything for those assertions to be about. These are the free members of the same
    // two patterns; the bracket family has none left, and that pattern is retained for the reason
    // foundryIconVocabulary.js gives rather than because anything here still exercises it.
    assertNotCurated(['at', 'hashtag', 'slash', 'quote-left', 'quote-right'], 'Punctuation mark');
    assertNotCurated(
      ['divide', 'equals', 'percent', 'plus-minus', 'not-equal'],
      'Mathematical operator'
    );
  });

  // Not every mark is only a mark. These three read as a drawing as readily as a character — they
  // are what a story hangs over a character's head — and the first of them is a star.
  it('admits the marks a story hangs over a character, and one companion depends on it', () => {
    assertCurated(['asterisk', 'exclamation', 'question']);
  });

  it('excludes real-world currency signs and the money instruments built around them', () => {
    assertNotCurated([
      'dollar-sign', 'euro-sign', 'sterling-sign', 'yen-sign', 'bitcoin-sign',
      'indian-rupee-sign', 'ruble-sign', 'won-sign', 'turkish-lira-sign',
      'circle-dollar-to-slot', 'money-bill-wave', 'money-check',
      'money-bill', 'money-check-dollar', 'credit-card', 'cash-register', 'receipt'
    ], 'Currency icon');
  });

  // Treasure is not a currency sign. A coin, a sack of gold and a merchant's shop belong to every
  // fiction that has ever had a market in it, and excluding them was the defect that pushed a
  // companion module into keeping a rival list in the first place.
  it('admits treasure, trade and the pre-modern market', () => {
    assertCurated([
      'coins', 'sack-dollar', 'sack-xmark', 'shop', 'store', 'warehouse',
      'basket-shopping', 'cart-flatbed', 'boxes-packing', 'people-carry-box', 'pallet', 'dolly',
      'certificate', 'stamp', 'file-contract', 'file-signature',
      'envelope', 'envelope-open', 'envelope-open-text'
    ]);
  });

  it('excludes UI, editor and navigation controls', () => {
    assertNotCurated([
      'align-left', 'align-right', 'align-center', 'align-justify',
      'bold', 'italic', 'underline', 'strikethrough', 'subscript', 'superscript',
      'indent', 'outdent', 'list', 'list-ul', 'list-ol',
      'copy', 'paste', 'clone', 'code', 'code-branch',
      'sort', 'sort-up', 'sort-down', 'filter',
      'magnifying-glass', 'magnifying-glass-plus',
      'upload', 'download', 'share', 'share-nodes',
      'backward', 'forward', 'play', 'pause', 'stop',
      'chevron-left', 'chevron-right', 'angle-left', 'caret-up',
      'arrow-up', 'arrow-down', 'arrows-rotate', 'arrow-right-arrow-left', 'circle-arrow-right',
      'angles-up', 'caret-down', 'right-from-bracket', 'table-columns',
      'sliders', 'toggle-on', 'toggle-off',
      'arrow-pointer', 'i-cursor', 'spell-check',
      'chart-bar', 'chart-line', 'chart-pie', 'chart-area',
      'diagram-project', 'diagram-next',
      'circle-check', 'circle-xmark', 'circle-info', 'circle-question',
      'square-check', 'square-xmark', 'square-plus', 'square-minus',
      'ellipsis', 'ellipsis-vertical', 'bars', 'grip', 'grip-vertical',
      'compress', 'expand', 'maximize', 'minimize',
      'spinner', 'notdef',
      'file', 'file-pdf', 'file-code', 'file-excel', 'file-image',
      'folder', 'folder-open', 'inbox', 'paperclip',
      'terminal', 'wave-square'
    ], 'UI icon');
  });

  // The line the affordance rule draws, and it is a real one. A rack of servers, a stack of discs,
  // a chip, a satellite dish and a laptop are DEPICTED OBJECTS. A console prompt and a square-wave
  // chart are not: one is a software affordance, the other is literally a chart type.
  it('admits depicted machines while excluding the console prompt and the chart', () => {
    assertCurated([
      'rocket', 'shuttle-space', 'jet-fighter', 'helicopter', 'user-astronaut',
      'satellite', 'satellite-dish', 'tower-broadcast', 'tower-observation',
      'solar-panel', 'robot', 'microchip', 'server', 'database', 'walkie-talkie',
      'battery-empty', 'battery-full', 'radiation', 'circle-radiation', 'biohazard',
      'industry', 'oil-well', 'city', 'explosion', 'burst',
      'laptop', 'desktop', 'computer', 'keyboard', 'camera', 'gamepad', 'mobile'
    ]);
    assertNotCurated(['terminal', 'wave-square'], 'Affordance');
  });

  it('excludes emoji reactions under both the face- prefix and the bare Pro names', () => {
    assertNotCurated([
      'face-smile', 'face-frown', 'face-grin', 'face-angry',
      'face-laugh', 'face-meh', 'face-sad-tear', 'face-surprise',
      'face-dizzy', 'face-grimace', 'face-rolling-eyes', 'face-tired',
      'grin', 'grin-beam', 'laugh-wink', 'kiss-wink-heart', 'angry', 'weary', 'woozy'
    ], 'Emoji reaction');
  });

  // Font Awesome draws several glyphs as a ladder: five battery fills, nine temperature entries,
  // four gauges, twenty-four clock faces. The picker shows seven or eight rows at a time and
  // generates each label from the icon code, so a ladder spends viewports repeating one idea. One
  // member per idea is curated — the clearest glyph for it, which need not be the bare code — plus
  // any member that means something DIFFERENT; the steps between them, the rotations, the status
  // badges and the scenery variants are not.
  it('excludes redundant variants of a glyph the vocabulary already carries', () => {
    assertNotCurated([
      'battery-quarter', 'battery-half', 'battery-three-quarters',
      'temperature-empty', 'temperature-quarter', 'temperature-half',
      'temperature-three-quarters', 'temperature-full',
      'temperature-arrow-up', 'temperature-arrow-down',
      'gauge', 'gauge-simple', 'gauge-simple-high',
      'shop-lock', 'shop-slash', 'store-slash',
      'mountain-city', 'tree-city',
      'jet-fighter-up', 'tower-cell', 'gauge-med',
      'hourglass-start', 'hourglass-end', 'calendar-check', 'calendar-days', 'comment-dots',
      'user-gear', 'mobile-screen-button'
    ], 'Variant');

    // The glyph each of those is a variant OF stays, so the idea is still expressible.
    assertCurated([
      'battery-empty', 'battery-full', 'thermometer', 'temperature-high', 'temperature-low',
      'gauge-high', 'shop', 'store', 'city', 'jet-fighter', 'tower-broadcast', 'tower-observation',
      'hourglass', 'calendar', 'comment', 'user', 'mobile'
    ]);
  });

  // A `-slash` is not a fill level. A crossed-out droplet means "no water", which is a different
  // statement from "water", and fiction says both — which is why the redundancy rule catches fill
  // levels, needle positions, rotations and status badges and stops there.
  it('keeps a crossed-out glyph, because "no water" is not less water', () => {
    assertCurated(['droplet-slash', 'user-slash', 'eye-slash', 'bell-slash']);
  });

  // A tick on a circle is a control saying "done"; a warning on an ear of wheat is a blighted crop
  // and a cross on a road is a road nobody is getting down. The badge is the point of the drawing
  // rather than a status light stuck on it, which is the line that keeps the crop failure in while
  // the shape badges go.
  it('keeps a badge on a depicted object while excluding one stuck on a shape', () => {
    assertCurated(['wheat-awn-circle-exclamation', 'road-circle-xmark', 'plane-circle-exclamation']);
    assertNotCurated(['circle-check', 'square-xmark', 'circle-exclamation'], 'Shape badge');
  });

  it('excludes the iconography of a present-day relief operation', () => {
    assertNotCurated([
      'building-un', 'building-ngo', 'building-shield', 'building-wheat',
      'helmet-un', 'children', 'child-combatant',
      'people-group', 'people-line', 'people-roof',
      'person-rifle', 'person-military-rifle', 'person-shelter',
      'person-drowning', 'person-falling', 'person-burst',
      'house-flood-water', 'house-tsunami', 'house-lock',
      'mosquito', 'mosquito-net', 'locust',
      'tent', 'tents', 'tent-arrows-down',
      'hill-avalanche', 'hill-rockslide',
      'bridge-water', 'bridge-lock'
    ], 'Relief-operation icon');
  });

  // The corollary of scoping that rule by subject. A glyph Font Awesome shipped in the same release
  // is curated whenever it depicts an ordinary object or action a character handles — including a
  // blighted ear of wheat, which this list used to catch and no longer does, because a harvest
  // failing is a story rather than an operation and the category's own wording never predicted it.
  it('admits the ordinary objects that shipped alongside the relief pictograms', () => {
    assertCurated([
      'boxes-packing', 'people-carry-box', 'fire-burner', 'kitchen-set',
      'bore-hole', 'sack-xmark', 'tower-observation', 'explosion', 'burst',
      'wheat-awn-circle-exclamation'
    ]);
  });

  it('excludes the symbols that stand for a present-day cause or access provision', () => {
    assertNotCurated([
      'wheelchair', 'wheelchair-move', 'universal-access',
      'braille', 'closed-captioning', 'audio-description',
      'ear-deaf', 'ear-listen', 'eye-low-vision', 'person-cane',
      'democrat', 'republican', 'landmark-dome', 'check-to-slot', 'person-booth',
      'transgender', 'genderless', 'neuter', 'flag-usa'
    ], 'Cause symbol');
  });

  // The gender block used to take the planetary symbols with it. Mars is iron and Venus is copper:
  // they are alchemical signs, which is Fabricate's own subject, and the widened rule keeps them
  // while the identity-category symbols above still go.
  it('admits the planetary and alchemical signs the gender block used to sweep up', () => {
    assertCurated(['mars', 'venus', 'mercury']);
  });

  // What survives of a category that used to hold the whole present-day street: the pictograms that
  // label a building rather than depict a thing inside it. A restroom sign is a drawing of a sign.
  it('excludes present-day signage while admitting what the signs point at', () => {
    // `do-not-enter` and `escalator` used to stand here and are Pro-only names; `street-view`,
    // `ban` and `location-dot` are free members of the same pattern.
    assertNotCurated(
      ['restroom', 'square-parking', 'elevator', 'hospital-symbol', 'street-view', 'ban',
        'location-dot'],
      'Signage'
    );
    assertCurated(['toilet', 'bath', 'shower', 'ambulance', 'hospital', 'car', 'bus', 'train']);
  });

  // The widening in one test. Every one of these was held out as "present-day clinical or domestic
  // furniture no fiction is reaching for". General fiction reaches for all of them and science
  // fiction reaches for the med-bay twice, so the blocks that held them are gone, not trimmed.
  it('admits the med-bay, the kitchen and the training montage the old rule held out', () => {
    assertCurated([
      'stethoscope', 'x-ray', 'kit-medical', 'suitcase-medical', 'bandage', 'user-injured',
      'user-doctor', 'user-nurse', 'bed-pulse', 'prescription-bottle-medical', 'notes-medical',
      'hospital-user', 'bacteria', 'mask-face', 'soap', 'tooth',
      'burger', 'pizza-slice', 'hotdog', 'ice-cream', 'bowl-food', 'cheese',
      'baseball', 'basketball', 'football', 'volleyball', 'hockey-puck', 'person-running',
      'golf-ball-tee'
    ]);
  });

  it('admits the craft, labour, and laboratory tools a crafting module needs', () => {
    assertCurated([
      'fire-burner', 'kitchen-set', 'oil-can', 'bore-hole',
      'screwdriver', 'screwdriver-wrench', 'helmet-safety',
      'gauge-high', 'thermometer', 'temperature-high', 'temperature-low',
      'microscope', 'dna'
    ]);
  });

  // Modern arms are curated, and this is a decision rather than an omission. Fabricate's subject is
  // any fiction, so a modern or post-apocalyptic game needs a firearm, a set of restraints and a
  // mine as much as a fantasy one needs an axe.
  it('admits modern arms while excluding the arrows that mean "go that way"', () => {
    assertCurated(['gun', 'handcuffs', 'land-mine-on', 'bomb', 'explosion']);
    assertNotCurated(['arrow-right', 'arrow-up-long'], 'Directional arrow');
  });

  // The other half of that rule, and the ONE place in this file where the predicate is the honest
  // question rather than membership. `/^arrows?-(?!archery)/` sweeps some nine hundred directional
  // arrows out and pulls one back, because `arrow-archery` draws a projectile rather than a
  // direction. Both `arrow-archery` and `bow-arrow` are Pro-only names, so Fabricate may not offer
  // either however well they fit, and there is no catalogue entry left to ask about — asserting
  // membership here would be asserting the licence, which the catalogue's own guard already does.
  // The lookahead is still what the rule turns on, and it is still guarded, so that promoting the
  // icon into the free set is all it would take to get it back.
  it('keeps the projectile carve-out alive, though no free name exercises it', () => {
    assert.equal(
      isExcludedIconName('arrow-archery'),
      false,
      'the projectile carve-out must survive: the arrow that is a weapon is not a direction'
    );
    assert.equal(isExcludedIconName('arrow-right'), true, 'every other arrow means "go that way"');
    assert.equal(findCuratedIcon('arrow-archery'), null, 'and it is Pro-only, so it is unofferable');
  });

  // hand-spock and spaghetti-monster-flying are the two the "institution or cause" exclusion looks
  // like it should catch — one names a Star Trek trademark in its own icon code, the other is a
  // real-world parody religion. They are curated anyway, because what stays out is a glyph whose
  // SUBJECT is the institution, not a gesture or a symbol a fiction is free to reuse.
  it('admits scholarship, renown, and eldritch icons', () => {
    assertCurated([
      'user-clock', 'user-graduate', 'graduation-cap',
      'chalkboard', 'chalkboard-user', 'person-chalkboard',
      'award', 'puzzle-piece', 'bell-concierge', 'champagne-glasses',
      'spaghetti-monster-flying', 'hand-spock'
    ]);
  });

  it('keeps signs-post despite the -sign$ currency pattern', () => {
    assert.ok(findCuratedIcon('signs-post'));
  });

  it('builds the curated picker catalog by default', () => {
    const options = buildEssenceIconOptions();

    assert.equal(options, getEssenceIconOptions());
    assert.ok(options.some((option) => option.iconClass === 'fas fa-fire'));
    assert.ok(options.some((option) => option.iconClass === 'fas fa-flask'));
    assert.ok(options.some((option) => option.iconClass === 'fas fa-wine-glass'));
    assert.ok(options.some((option) => option.iconClass === 'fas fa-mortar-pestle'));
    assert.ok(options.some((option) => option.iconClass === 'fas fa-hat-wizard'));
    assert.ok(!options.some((option) => option.iconClass === 'fas fa-align-right'));
    assert.ok(!options.some((option) => option.iconClass === 'fas fa-dollar-sign'));
    assert.ok(!options.some((option) => option.iconClass === 'fas fa-face-smile'));
    assert.ok(!options.some((option) => option.iconClass === 'fas fa-chart-bar'));
    assert.ok(!options.some((option) => option.iconClass === 'fas fa-file'));
    assert.ok(!options.some((option) => option.iconClass === 'fas fa-upload'));
  });

  // Solid only. Foundry's classic solid and regular faces carry an identical cmap, so a regular row
  // for every icon would double a two-thousand-row picker to say the same things at a lighter
  // weight. `far` stays a prefix the module accepts and Foundry renders; it is not a second row.
  it('offers one row per glyph at the solid weight', () => {
    const options = getEssenceIconOptions();

    assert.equal(options.length, CURATED_ICON_COUNT);
    assert.ok(options.every((option) => option.iconClass.startsWith('fas ')));
    assert.ok(!options.some((option) => option.iconClass === 'far fa-bell'));
    assert.ok(!options.some((option) => option.iconClass === 'fas fa-cog'), 'an alias is not a second row');
  });

  it('can still build the whole catalogue when explicitly requested', () => {
    const options = buildEssenceIconOptions(FOUNDRY_ICON_DEFINITIONS);

    assert.equal(options.length, CATALOGUE_ICON_COUNT);
    assert.ok(options.some((option) => option.iconClass === 'fas fa-fingerprint'));
    assert.ok(options.some((option) => option.iconClass === 'fas fa-wine-glass'));
    assert.ok(options.some((option) => option.iconClass === 'fas fa-address-book'));
    assert.ok(!options.some((option) => option.iconClass === 'fas fa-github'));
    assert.equal(options, getEssenceAllIconOptions());
  });

  it('builds custom icon definitions into one solid option each', () => {
    const options = buildEssenceIconOptions([
      { iconCode: 'address-book', label: 'Address Book', aliases: ['contact-book'] },
      { iconCode: 'fire', label: 'Fire', aliases: [] }
    ]);

    assert.deepEqual(options.map((option) => option.iconClass), [
      'fas fa-address-book',
      'fas fa-fire'
    ]);
  });

  it('filters icon options by label, icon name, and alias', () => {
    const wineMatches = filterEssenceIconOptions(getEssenceIconOptions(), 'wine glass');
    assert.ok(wineMatches.some((option) => option.iconClass === 'fas fa-wine-glass'));

    // The alias search is what makes one row per glyph refuse no name: `cog` is not offered, and
    // typing it still finds the gear.
    const cogMatches = filterEssenceIconOptions(getEssenceIconOptions(), 'cog');
    assert.ok(cogMatches.some((option) => option.iconClass === 'fas fa-gear'));
  });

  it('detects style prefixes from stored icon classes', () => {
    assert.equal(getEssenceIconPrefix('fas fa-fire'), 'fas');
    assert.equal(getEssenceIconPrefix('fa-regular fa-address-book'), 'far');
    assert.equal(getEssenceIconPrefix('fa-duotone fa-leaf'), 'fa-duotone');
  });

  it('returns a catalog match when one exists and a humanized passthrough otherwise', () => {
    const known = getEssenceIconOption('fas fa-fire', getEssenceIconOptions());
    assert.equal(known.label, 'Fire');
    assert.equal(known.variant, 'solid');

    const custom = getEssenceIconOption('fas fa-align-right', getEssenceIconOptions());
    assert.equal(custom.label, 'Align Right');
    assert.equal(custom.iconClass, 'fas fa-align-right');
  });

  // A system that persisted an alias before this vocabulary existed still selects the glyph's row,
  // with the glyph's label, rather than falling through to a synthesised option no list contains.
  it('selects a glyph row from a stored alias', () => {
    const stored = getEssenceIconOption('fas fa-cog', getEssenceIconOptions());
    assert.equal(stored.iconClass, 'fas fa-gear');
    assert.equal(stored.label, 'Gear');
  });

  it('memoizes both catalogs so accessors and builders share one frozen array', () => {
    assert.equal(getEssenceIconOptions(), getEssenceIconOptions());
    assert.equal(getEssenceAllIconOptions(), getEssenceAllIconOptions());
    assert.equal(buildEssenceIconOptions(), getEssenceIconOptions());
    assert.equal(buildEssenceIconOptions(FOUNDRY_ICON_DEFINITIONS), getEssenceAllIconOptions());
  });
});

describe('essenceIcons lazy initialization', () => {
  it('freezes no icon option at import and defers construction to the first accessor call', async () => {
    const originalFreeze = Object.freeze;
    const optionFreezeCount = { value: 0 };

    // An icon option is the only frozen object carrying a `searchText` field, so this
    // fingerprint ignores the module-load frozen STYLE_PREFIXES/NON_ICON_TOKENS/PREFIX_ALIASES.
    Object.freeze = function trackingFreeze(target) {
      if (target && typeof target === 'object' && Object.hasOwn(target, 'searchText')) {
        optionFreezeCount.value += 1;
      }
      return originalFreeze(target);
    };

    try {
      // A fresh, cache-busted module instance has its own empty memo caches. Date.now is
      // permitted here because this is a node --test file, not a build/runtime script.
      const fresh = await import(`../src/ui/svelte/util/essenceIcons.js?fresh=${Date.now()}`);

      assert.equal(optionFreezeCount.value, 0, 'importing essenceIcons.js must not build any icon option');

      const options = fresh.getEssenceIconOptions();
      assert.ok(options.length > 0, 'the first accessor call must build the curated catalog');
      assert.ok(optionFreezeCount.value > 0, 'building the catalog must freeze option-shaped objects');

      // The fresh instance memoizes independently of the shared module under test.
      assert.equal(fresh.getEssenceIconOptions(), fresh.getEssenceIconOptions());
      assert.equal(fresh.getEssenceAllIconOptions(), fresh.getEssenceAllIconOptions());
      assert.equal(fresh.buildEssenceIconOptions(), fresh.getEssenceIconOptions());
    } finally {
      Object.freeze = originalFreeze;
    }
  });
});
