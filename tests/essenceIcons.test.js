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
  FONT_AWESOME_FREE_CLASSIC_CURATED_ICON_DEFINITIONS,
  FONT_AWESOME_FREE_CLASSIC_ICON_DEFINITIONS,
  isCuratedFontAwesomeClassicFreeIcon
} from '../src/ui/svelte/util/fontAwesomeFreeClassicIcons.js';

const CURATED_ICON_COUNT = 510;

// Every POSITIVE claim below is made against membership, never against the predicate.
// `isCuratedFontAwesomeClassicFreeIcon` answers "does any exclusion pattern match this string", so
// it returns true for a typo, a Pro-only code, or any code Font Awesome does not ship — none of
// which a picker can ever offer. Asserting the predicate would pass while the icon was absent from
// every picker in the module.
//
// Every NEGATIVE claim keeps asserting the predicate, and that is sound in the other direction:
// these definitions ARE the catalogue filtered by that predicate, so a false answer guarantees
// absence. The asymmetry is the point.
const curatedIconCodes = new Set(
  FONT_AWESOME_FREE_CLASSIC_CURATED_ICON_DEFINITIONS.map(({ iconCode }) => iconCode)
);

function assertCurated(iconCodes) {
  for (const iconCode of iconCodes) {
    assert.ok(
      curatedIconCodes.has(iconCode),
      `Expected "${iconCode}" to be in the curated icon definitions`
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
    // Null is a FIRST-CLASS state: it renders the essence in the theme accent, which
    // is what every essence renders as today, so no migration is required. Coercing an
    // unknown token to a preset would invent a colour the GM never chose.
    assert.equal(normalizeEssenceColorToken(''), null);
    assert.equal(normalizeEssenceColorToken(null), null);
    assert.equal(normalizeEssenceColorToken(undefined), null);
    assert.equal(normalizeEssenceColorToken('#ff0000'), null);
    assert.equal(normalizeEssenceColorToken('chartreuse'), null);
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
  // 437 and the post-widening 510 is a band a pattern edit can move eighty icons inside without
  // failing anything.
  it('pins the curated subset to an exact size', () => {
    const curatedCount = FONT_AWESOME_FREE_CLASSIC_CURATED_ICON_DEFINITIONS.length;
    const totalCount = FONT_AWESOME_FREE_CLASSIC_ICON_DEFINITIONS.length;

    assert.equal(
      curatedCount,
      CURATED_ICON_COUNT,
      `Expected exactly ${CURATED_ICON_COUNT} curated icons, got ${curatedCount}. `
        + 'If a pattern change moved the membership deliberately, update this number and say which '
        + 'icons moved and why in the commit body.'
    );
    assert.ok(curatedCount < totalCount * 0.5, 'The curated subset should be less than half the full catalog');
  });

  it('includes core fantasy crafting icons', () => {
    const expectedFantasyIcons = [
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
    ];

    assertCurated(expectedFantasyIcons);
  });

  it('excludes single-character icons (letters and digits)', () => {
    for (let i = 0; i <= 9; i++) {
      assert.equal(isCuratedFontAwesomeClassicFreeIcon(String(i)), false, `Digit "${i}" should not be curated`);
    }
    for (let c = 97; c <= 122; c++) {
      const letter = String.fromCharCode(c);
      assert.equal(isCuratedFontAwesomeClassicFreeIcon(letter), false, `Letter "${letter}" should not be curated`);
    }
  });

  it('excludes all currency sign icons', () => {
    const currencyIcons = [
      'dollar-sign', 'euro-sign', 'sterling-sign', 'yen-sign', 'bitcoin-sign',
      'indian-rupee-sign', 'ruble-sign', 'won-sign', 'turkish-lira-sign',
      'cent-sign', 'litecoin-sign', 'peseta-sign', 'peso-sign', 'franc-sign',
      'florin-sign', 'austral-sign', 'baht-sign', 'cedi-sign', 'colon-sign',
      'cruzeiro-sign', 'dong-sign', 'guarani-sign', 'hryvnia-sign', 'kip-sign',
      'lari-sign', 'lira-sign', 'manat-sign', 'mill-sign', 'naira-sign',
      'rupee-sign', 'rupiah-sign', 'shekel-sign', 'tenge-sign',
      'bangladeshi-taka-sign', 'brazilian-real-sign'
    ];

    for (const icon of currencyIcons) {
      assert.equal(isCuratedFontAwesomeClassicFreeIcon(icon), false, `Currency icon "${icon}" should not be curated`);
    }
  });

  // The boundary here is no longer "anything electronic" — a science-fiction or cyberpunk game is
  // as much in scope as a dungeon, and its reactor, data core and droids are objects a fiction
  // contains. What stays out is the present-day desk: a fax machine, a games console, a mobile
  // phone. Those read as the GM's own office rather than as anything in play.
  it('excludes present-day consumer electronics and telephony', () => {
    const consumerElectronics = [
      'computer', 'computer-mouse', 'desktop', 'display', 'laptop', 'laptop-code',
      'mobile', 'mobile-screen', 'tablet', 'tablet-screen-button',
      'keyboard', 'memory', 'hard-drive', 'floppy-disk',
      'network-wired', 'ethernet', 'wifi', 'signal',
      'sim-card', 'sd-card', 'headphones', 'headset', 'microphone',
      'tv', 'radio', 'gamepad', 'vr-cardboard', 'plug', 'power-off',
      'camera', 'camera-retro', 'video', 'compact-disc', 'record-vinyl',
      'phone', 'phone-flip', 'fax', 'pager', 'podcast',
      'rss', 'sitemap', 'qrcode', 'barcode'
    ];

    for (const icon of consumerElectronics) {
      assert.equal(isCuratedFontAwesomeClassicFreeIcon(icon), false, `Consumer electronics icon "${icon}" should not be curated`);
    }
  });

  it('admits the science-fiction, industrial, and hazard vocabulary', () => {
    const fictionTechnology = [
      'rocket', 'shuttle-space', 'jet-fighter', 'helicopter', 'user-astronaut',
      'satellite', 'satellite-dish', 'tower-broadcast', 'tower-observation',
      'solar-panel', 'robot', 'microchip', 'server', 'database', 'walkie-talkie',
      'battery-empty', 'battery-full',
      'radiation', 'circle-radiation', 'biohazard',
      'industry', 'oil-well', 'city', 'explosion', 'burst'
    ];

    assertCurated(fictionTechnology);
  });

  // A rack of servers, a stack of discs and a chip are depicted objects, so they are admitted
  // above. A console prompt and a square wave are not: one is a software affordance and the other
  // is a chart type, which is the exclusion rule this module states first. Widening the vocabulary
  // to science fiction is not a reason to break that rule, and these two are what it catches.
  it('excludes a console prompt and a chart type despite the science-fiction widening', () => {
    for (const icon of ['terminal', 'wave-square']) {
      assert.equal(isCuratedFontAwesomeClassicFreeIcon(icon), false, `Icon "${icon}" should not be curated`);
    }
  });

  // Font Awesome draws several of these glyphs as a ladder: five battery fills, nine temperature
  // entries, four gauges. The picker shows seven or eight rows at a time and generates each label
  // from the icon code, so a ladder spends viewports repeating one idea. One member per idea is
  // curated -- the clearest glyph for it, which need not be the bare code -- plus any member that
  // means something different; the steps between them, the rotations, the status badges and the
  // scenery variants are not.
  it('excludes redundant variants of a glyph the subset already carries', () => {
    const redundantVariants = [
      'battery-quarter', 'battery-half', 'battery-three-quarters',
      'temperature-empty', 'temperature-quarter', 'temperature-half',
      'temperature-three-quarters', 'temperature-full',
      'temperature-arrow-up', 'temperature-arrow-down',
      'gauge', 'gauge-simple', 'gauge-simple-high',
      'shop-lock', 'shop-slash', 'store-slash',
      'mountain-city', 'tree-city',
      'jet-fighter-up', 'tower-cell'
    ];

    for (const icon of redundantVariants) {
      assert.equal(isCuratedFontAwesomeClassicFreeIcon(icon), false, `Variant "${icon}" should not be curated`);
    }

    // The glyph each of those is a variant OF stays, so the idea is still expressible.
    assertCurated([
      'battery-empty', 'battery-full', 'thermometer', 'temperature-high', 'temperature-low',
      'gauge-high', 'shop', 'store', 'city', 'jet-fighter', 'tower-broadcast', 'tower-observation'
    ]);
  });

  // A spacecraft, a gunship and a rescue helicopter are vehicles a story can be about, so they are
  // admitted above. The commuter fleet is not: a bus, a taxi and a tractor are street furniture,
  // and so are the fixtures that serve them, down to the filling station and the traffic light.
  it('excludes present-day civilian transport', () => {
    const civilianTransport = [
      'car', 'car-side', 'bus', 'bus-simple', 'truck', 'truck-fast',
      'train', 'train-subway', 'plane', 'plane-departure',
      'bicycle', 'motorcycle', 'taxi', 'ferry',
      'van-shuttle', 'tractor', 'snowplow', 'trailer', 'caravan', 'truck-monster',
      'gas-pump', 'charging-station', 'traffic-light', 'elevator',
      'road', 'road-barrier', 'road-spikes', 'road-bridge'
    ];

    for (const icon of civilianTransport) {
      assert.equal(isCuratedFontAwesomeClassicFreeIcon(icon), false, `Transport icon "${icon}" should not be curated`);
    }
  });

  it('excludes UI and editor control icons', () => {
    const uiIcons = [
      'align-left', 'align-right', 'align-center', 'align-justify',
      'bold', 'italic', 'underline', 'strikethrough', 'subscript', 'superscript',
      'indent', 'outdent', 'list', 'list-ul', 'list-ol',
      'copy', 'paste', 'clone', 'code', 'code-branch',
      'sort', 'sort-up', 'sort-down', 'filter',
      'magnifying-glass', 'magnifying-glass-plus',
      'upload', 'download', 'share', 'share-nodes',
      'backward', 'forward', 'play', 'pause', 'stop',
      'chevron-left', 'chevron-right', 'chevron-up', 'chevron-down',
      'angle-left', 'angle-right', 'caret-up', 'caret-down',
      'sliders', 'toggle-on', 'toggle-off',
      'arrow-pointer', 'i-cursor', 'spell-check',
      'chart-bar', 'chart-line', 'chart-pie', 'chart-area',
      'diagram-project', 'diagram-next',
      'circle-check', 'circle-xmark', 'circle-info', 'circle-question',
      'square-check', 'square-xmark', 'square-plus', 'square-minus',
      'ellipsis', 'ellipsis-vertical', 'bars', 'grip', 'grip-vertical',
      'compress', 'expand', 'maximize', 'minimize',
      'spinner', 'notdef'
    ];

    for (const icon of uiIcons) {
      assert.equal(isCuratedFontAwesomeClassicFreeIcon(icon), false, `UI icon "${icon}" should not be curated`);
    }
  });

  it('excludes emoji face icons', () => {
    const faceIcons = [
      'face-smile', 'face-frown', 'face-grin', 'face-angry',
      'face-laugh', 'face-meh', 'face-sad-tear', 'face-surprise',
      'face-dizzy', 'face-grimace', 'face-rolling-eyes', 'face-tired',
      'face-grin-beam', 'face-grin-hearts', 'face-grin-stars',
      'face-kiss', 'face-kiss-wink-heart', 'face-laugh-wink'
    ];

    for (const icon of faceIcons) {
      assert.equal(isCuratedFontAwesomeClassicFreeIcon(icon), false, `Face icon "${icon}" should not be curated`);
    }
  });

  // Coins, a merchant's shop and a warehouse are not modern, and excluding them was the defect that
  // pushed a companion module into keeping a rival list. They are admitted below. What stays out is
  // the paperwork of a present-day office and the instruments of a present-day bank — a cheque, a
  // credit card, a till — together with the currency SIGN glyphs, which name a real-world currency
  // in a way a coin does not.
  it('excludes office paperwork, banking instruments, and point of sale', () => {
    const officeIcons = [
      'briefcase', 'calculator', 'calendar', 'calendar-days',
      'clipboard', 'clipboard-list', 'credit-card',
      'envelope-circle-check', 'envelopes-bulk', 'folder', 'folder-open',
      'id-card', 'id-badge', 'inbox', 'paperclip', 'stapler',
      'receipt', 'cash-register', 'money-check', 'money-check-dollar',
      'suitcase', 'file-invoice', 'file-invoice-dollar',
      'money-bill', 'money-bill-wave', 'piggy-bank',
      'wallet', 'hand-holding-dollar',
      'dollar-sign', 'euro-sign', 'bitcoin-sign',
      'chart-simple', 'chart-column'
    ];

    for (const icon of officeIcons) {
      assert.equal(isCuratedFontAwesomeClassicFreeIcon(icon), false, `Office icon "${icon}" should not be curated`);
    }
  });

  // A sealed letter, an opened one and a letter with a page in it are all curated: they are
  // pre-modern objects filed under office paperwork for exactly the reason coins were. Only the
  // two that mean a mail SYSTEM rather than a letter stay out.
  //
  // A wicker basket and a flatbed hand cart are pre-modern containers; a plastic carrier bag and a
  // wheeled supermarket trolley are not, which is why bag-shopping and cart-shopping stay out.
  it('admits pre-modern commerce, trade, and record keeping', () => {
    const commerce = [
      'coins', 'sack-dollar', 'sack-xmark',
      'shop', 'store', 'warehouse',
      'basket-shopping', 'cart-flatbed', 'boxes-packing', 'people-carry-box', 'pallet', 'dolly',
      'certificate', 'stamp', 'file-contract', 'file-signature',
      'envelope', 'envelope-open', 'envelope-open-text'
    ];

    assertCurated(commerce);

    for (const icon of ['bag-shopping', 'cart-shopping', 'envelope-circle-check', 'envelopes-bulk']) {
      assert.equal(isCuratedFontAwesomeClassicFreeIcon(icon), false, `Icon "${icon}" should not be curated`);
    }
  });

  // Clinical care, pharmacy and pandemic imagery all stay out. Laboratory instruments do not: a
  // microscope is a 16th-century object and an alchemist's bench tool, and a double helix is the
  // genetics glyph a science-fiction setting reaches for. Both were miscategorised as medicine for
  // the same reason coins was miscategorised as office.
  it('excludes clinical care, pharmacy, and pandemic icons', () => {
    const medicalIcons = [
      'hospital', 'stethoscope', 'syringe', 'pills', 'capsules',
      'prescription', 'prescription-bottle', 'x-ray',
      'lungs', 'bed-pulse', 'kit-medical', 'suitcase-medical', 'user-doctor', 'user-nurse',
      'virus', 'virus-covid', 'bacteria', 'bacterium',
      'mask-face', 'mask-ventilator', 'pump-soap', 'soap',
      'hand-sparkles', 'hands-bubbles',
      'head-side-cough', 'head-side-mask', 'head-side-virus'
    ];

    for (const icon of medicalIcons) {
      assert.equal(isCuratedFontAwesomeClassicFreeIcon(icon), false, `Medical icon "${icon}" should not be curated`);
    }
  });

  it('admits the craft, labour, and laboratory tools a crafting module needs', () => {
    const craftTools = [
      'fire-burner', 'kitchen-set', 'oil-can', 'bore-hole',
      'screwdriver', 'screwdriver-wrench', 'helmet-safety',
      'gauge-high', 'thermometer', 'temperature-high', 'temperature-low',
      'microscope', 'dna'
    ];

    assertCurated(craftTools);
  });

  // Scoped by what a glyph DEPICTS, never by the Font Awesome release that shipped it. A release is
  // not a fact a GM can see; the drawing is. What stays out is a present-day relief operation's own
  // visual language — its agency-marked buildings and personnel, its camp and sanitation materiel,
  // its transfers and rations, the figures that stand for displaced, endangered and injured people,
  // and the disasters it responds to.
  it('excludes the iconography of a present-day relief operation', () => {
    const reliefOperationIcons = [
      'building-un', 'building-ngo', 'building-shield', 'building-wheat',
      'helmet-un', 'children', 'child-combatant',
      'people-group', 'people-line', 'people-roof',
      'person-rifle', 'person-military-rifle', 'person-shelter',
      'person-drowning', 'person-falling', 'person-burst',
      'house-flood-water', 'house-tsunami', 'house-lock',
      'mosquito', 'mosquito-net', 'locust',
      'tent', 'tents', 'tent-arrows-down',
      'hill-avalanche', 'hill-rockslide',
      'bridge-water', 'bridge-lock',
      'wheat-awn-circle-exclamation'
    ];

    for (const icon of reliefOperationIcons) {
      assert.equal(isCuratedFontAwesomeClassicFreeIcon(icon), false, `Relief-operation icon "${icon}" should not be curated`);
    }
  });

  // The corollary of scoping that rule by subject: a glyph Font Awesome shipped in the same release
  // is curated whenever it depicts an ordinary object or action a character handles. Scoping it by
  // release instead is what let boxes-packing in while people-carry-box — the same depicted action,
  // the adjacent catalogue entry — stayed out, an inconsistency neither rule could justify.
  it('admits the ordinary objects that shipped alongside the relief pictograms', () => {
    assertCurated([
      'boxes-packing', 'people-carry-box', 'fire-burner', 'kitchen-set',
      'bore-hole', 'sack-xmark', 'tower-observation', 'explosion', 'burst'
    ]);
  });

  it('excludes accessibility, political, and gender symbol icons', () => {
    const miscIcons = [
      'wheelchair', 'wheelchair-move', 'universal-access',
      'braille', 'closed-captioning', 'audio-description',
      'ear-deaf', 'ear-listen', 'eye-low-vision', 'person-cane',
      'democrat', 'republican', 'landmark-dome', 'check-to-slot', 'person-booth',
      'mars', 'venus', 'transgender', 'genderless', 'neuter', 'mercury',
      'mars-double', 'venus-double', 'mars-and-venus'
    ];

    for (const icon of miscIcons) {
      assert.equal(isCuratedFontAwesomeClassicFreeIcon(icon), false, `Icon "${icon}" should not be curated`);
    }
  });

  // Sanitation, competitive sport, fast food and consumer packaging stay out whatever the setting.
  it('excludes present-day domestic, sporting, and consumer icons', () => {
    const miscModern = [
      'toilet', 'toilet-paper', 'shower', 'bath', 'restroom',
      'dumpster', 'recycle', 'fire-extinguisher',
      'baseball', 'basketball', 'football', 'volleyball', 'hockey-puck',
      'bowling-ball', 'golf-ball-tee', 'table-tennis-paddle-ball',
      'burger', 'hotdog', 'pizza-slice', 'ice-cream', 'stroopwafel',
      'baby', 'baby-carriage', 'school',
      'fingerprint', 'passport',
      'cannabis', 'bong', 'joint', 'smoking', 'ban-smoking',
      'bullhorn', 'rectangle-ad', 'newspaper',
      'stopwatch', 'tachograph-digital',
      'paint-roller', 'spray-can', 'blender', 'jug-detergent',
      'street-view', 'location-pin', 'location-dot', 'location-arrow',
      'comment', 'comment-dots', 'comments', 'blog',
      'file', 'file-pdf', 'file-code', 'file-excel', 'file-image',
      'image', 'images', 'panorama', 'clapperboard', 'film',
      'binoculars', 'dumbbell', 'swatchbook',
      'face-smile', 'face-angry', 'face-grin-tears'
    ];

    for (const icon of miscModern) {
      assert.equal(isCuratedFontAwesomeClassicFreeIcon(icon), false, `Icon "${icon}" should not be curated`);
    }
  });

  // Modern arms are curated, and this is a decision rather than an omission. Fabricate's subject is
  // any fiction, so a modern or post-apocalyptic game needs a firearm, a set of restraints and a
  // mine as much as a fantasy one needs an axe — and the subset has carried swords, axes and
  // shields all along. Admitting a jet fighter and leaving the sidearm out was the inconsistency.
  it('admits modern arms for the settings that need them', () => {
    assertCurated(['gun', 'handcuffs', 'land-mine-on', 'bomb']);
  });

  // hand-spock and spaghetti-monster-flying are the two the "brand or cause" exclusion looks like
  // it should catch — one names a Star Trek trademark in its own icon code, the other is a
  // real-world parody religion. They are curated anyway, and the rule carries a qualifier saying
  // so: what stays out is a glyph whose SUBJECT is the institution, not a gesture or a symbol a
  // fiction is free to reuse. The subset already carries hand-lizard and hand-scissors from the
  // same drawn family, and every other Font Awesome religion symbol.
  it('admits scholarship, renown, and eldritch icons', () => {
    const scholarshipAndRenown = [
      'user-clock', 'user-graduate', 'graduation-cap',
      'chalkboard', 'chalkboard-user', 'person-chalkboard',
      'award', 'puzzle-piece', 'bell-concierge', 'champagne-glasses',
      'spaghetti-monster-flying', 'hand-spock'
    ];

    assertCurated(scholarshipAndRenown);
  });

  it('keeps signs-post despite the -sign$ currency pattern', () => {
    assert.equal(isCuratedFontAwesomeClassicFreeIcon('signs-post'), true);
  });

  it('builds the curated picker catalog by default', () => {
    const options = buildEssenceIconOptions();

    assert.equal(options, getEssenceIconOptions());
    assert.ok(options.some(option => option.iconClass === 'fas fa-fire'));
    assert.ok(options.some(option => option.iconClass === 'fas fa-flask'));
    assert.ok(options.some(option => option.iconClass === 'fas fa-wine-glass'));
    assert.ok(options.some(option => option.iconClass === 'fas fa-mortar-pestle'));
    assert.ok(options.some(option => option.iconClass === 'far fa-bell'));
    assert.ok(!options.some(option => option.iconClass === 'fas fa-align-right'));
    assert.ok(!options.some(option => option.iconClass === 'fas fa-computer'));
    assert.ok(!options.some(option => option.iconClass === 'fas fa-dollar-sign'));
    assert.ok(!options.some(option => option.iconClass === 'fas fa-face-smile'));
    assert.ok(!options.some(option => option.iconClass === 'fas fa-chart-bar'));
    assert.ok(!options.some(option => option.iconClass === 'fas fa-file'));
    assert.ok(!options.some(option => option.iconClass === 'fas fa-upload'));
  });

  it('can still build the full classic free icon catalog when explicitly requested', () => {
    const options = buildEssenceIconOptions(FONT_AWESOME_FREE_CLASSIC_ICON_DEFINITIONS);

    assert.ok(options.length > 1500);
    assert.ok(options.some(option => option.iconClass === 'fas fa-computer'));
    assert.ok(options.some(option => option.iconClass === 'fas fa-fingerprint'));
    assert.ok(options.some(option => option.iconClass === 'fas fa-wine-glass'));
    assert.ok(options.some(option => option.iconClass === 'fas fa-address-book'));
    assert.ok(options.some(option => option.iconClass === 'far fa-address-book'));
    assert.ok(options.every(option => option.iconClass.startsWith('fas ') || option.iconClass.startsWith('far ')));
    assert.ok(!options.some(option => option.iconClass === 'fab fa-github'));
    assert.equal(options, getEssenceAllIconOptions());
  });

  it('builds custom icon definitions into solid and regular picker options', () => {
    const options = buildEssenceIconOptions([
      { iconCode: 'address-book', label: 'Address Book', hasRegular: true },
      { iconCode: 'fire', label: 'Fire', hasRegular: false }
    ]);

    assert.deepEqual(options.map(option => option.iconClass), [
      'fas fa-address-book',
      'far fa-address-book',
      'fas fa-fire'
    ]);
  });

  it('filters icon options by icon name, class text, and style', () => {
    const wineMatches = filterEssenceIconOptions(getEssenceIconOptions(), 'wine glass');
    assert.ok(wineMatches.some(option => option.iconClass === 'fas fa-wine-glass'));

    const regularMatches = filterEssenceIconOptions(getEssenceIconOptions(), 'bell regular');
    assert.ok(regularMatches.some(option => option.iconClass === 'far fa-bell'));
    assert.ok(!regularMatches.some(option => option.iconClass === 'fas fa-bell'));
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

    const custom = getEssenceIconOption('fas fa-dragon', getEssenceIconOptions());
    assert.equal(custom.label, 'Dragon');
    assert.equal(custom.iconClass, 'fas fa-dragon');
  });

  it('memoizes both catalogs so accessors and builders share one frozen array', () => {
    assert.equal(getEssenceIconOptions(), getEssenceIconOptions());
    assert.equal(getEssenceAllIconOptions(), getEssenceAllIconOptions());
    assert.equal(buildEssenceIconOptions(), getEssenceIconOptions());
    assert.equal(buildEssenceIconOptions(FONT_AWESOME_FREE_CLASSIC_ICON_DEFINITIONS), getEssenceAllIconOptions());
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
