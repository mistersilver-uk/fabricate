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

  it('exports a curated subset that is meaningfully smaller than the full catalog', () => {
    const curatedCount = FONT_AWESOME_FREE_CLASSIC_CURATED_ICON_DEFINITIONS.length;
    const totalCount = FONT_AWESOME_FREE_CLASSIC_ICON_DEFINITIONS.length;

    assert.ok(curatedCount >= 400, `Expected at least 400 curated icons, got ${curatedCount}`);
    assert.ok(curatedCount <= 600, `Expected at most 600 curated icons, got ${curatedCount}`);
    assert.ok(curatedCount < totalCount * 0.5, 'The curated subset should be less than half the full catalog');
  });

  it('includes core fantasy crafting icons', () => {
    const curatedCodes = new Set(FONT_AWESOME_FREE_CLASSIC_CURATED_ICON_DEFINITIONS.map(d => d.iconCode));

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

    for (const icon of expectedFantasyIcons) {
      assert.ok(curatedCodes.has(icon), `Expected fantasy icon "${icon}" to be in the curated list`);
    }
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
      'rocket', 'shuttle-space', 'jet-fighter', 'jet-fighter-up', 'helicopter', 'user-astronaut',
      'satellite', 'satellite-dish', 'tower-broadcast', 'tower-cell', 'tower-observation',
      'solar-panel', 'robot', 'microchip', 'server', 'database', 'terminal', 'wave-square',
      'walkie-talkie',
      'battery-empty', 'battery-quarter', 'battery-half', 'battery-three-quarters', 'battery-full',
      'radiation', 'circle-radiation', 'biohazard',
      'industry', 'city', 'mountain-city', 'tree-city', 'explosion', 'burst'
    ];

    for (const icon of fictionTechnology) {
      assert.equal(isCuratedFontAwesomeClassicFreeIcon(icon), true, `Icon "${icon}" should be curated`);
    }
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
      'envelope', 'envelope-open', 'folder', 'folder-open',
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

  it('admits pre-modern commerce, trade, and record keeping', () => {
    const commerce = [
      'coins', 'sack-dollar', 'sack-xmark',
      'shop', 'shop-lock', 'shop-slash', 'store', 'store-slash', 'warehouse',
      'basket-shopping', 'cart-flatbed', 'boxes-packing', 'pallet', 'dolly',
      'certificate', 'stamp', 'file-contract', 'file-signature', 'envelope-open-text'
    ];

    for (const icon of commerce) {
      assert.equal(isCuratedFontAwesomeClassicFreeIcon(icon), true, `Icon "${icon}" should be curated`);
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
      'gauge', 'gauge-high', 'gauge-simple', 'gauge-simple-high',
      'thermometer', 'temperature-empty', 'temperature-quarter', 'temperature-half',
      'temperature-three-quarters', 'temperature-full',
      'temperature-high', 'temperature-low', 'temperature-arrow-up', 'temperature-arrow-down',
      'microscope', 'dna'
    ];

    for (const icon of craftTools) {
      assert.equal(isCuratedFontAwesomeClassicFreeIcon(icon), true, `Icon "${icon}" should be curated`);
    }
  });

  it('excludes humanitarian, NGO, and crisis response icons', () => {
    const humanitarianIcons = [
      'building-un', 'building-ngo', 'building-shield', 'building-wheat',
      'helmet-un', 'children', 'child-combatant',
      'people-group', 'people-line', 'people-roof',
      'person-rifle', 'person-military-rifle', 'person-shelter',
      'person-drowning', 'person-falling', 'person-burst',
      'house-flood-water', 'house-tsunami', 'house-lock',
      'land-mine-on', 'mosquito', 'locust',
      'tent', 'tents', 'tent-arrows-down',
      'hill-avalanche', 'hill-rockslide',
      'bridge-water', 'bridge-lock',
      'wheat-awn-circle-exclamation'
    ];

    for (const icon of humanitarianIcons) {
      assert.equal(isCuratedFontAwesomeClassicFreeIcon(icon), false, `Humanitarian icon "${icon}" should not be curated`);
    }
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
  // So do the weapons drawn as instruments of harm to a person — gun, handcuffs, land-mine-on.
  // Those are a content decision for the maintainer rather than a vocabulary one, and are
  // deliberately left where they were.
  it('excludes present-day domestic, sporting, and consumer icons', () => {
    const miscModern = [
      'toilet', 'toilet-paper', 'shower', 'bath', 'restroom',
      'dumpster', 'recycle', 'fire-extinguisher',
      'baseball', 'basketball', 'football', 'volleyball', 'hockey-puck',
      'bowling-ball', 'golf-ball-tee', 'table-tennis-paddle-ball',
      'burger', 'hotdog', 'pizza-slice', 'ice-cream', 'stroopwafel',
      'baby', 'baby-carriage', 'school',
      'fingerprint', 'passport', 'gun', 'handcuffs', 'land-mine-on', 'bomb',
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

  it('admits scholarship, renown, and eldritch icons', () => {
    const scholarshipAndRenown = [
      'user-clock', 'user-graduate', 'graduation-cap',
      'chalkboard', 'chalkboard-user', 'person-chalkboard',
      'award', 'puzzle-piece', 'bell-concierge', 'champagne-glasses',
      'spaghetti-monster-flying', 'hand-spock'
    ];

    for (const icon of scholarshipAndRenown) {
      assert.equal(isCuratedFontAwesomeClassicFreeIcon(icon), true, `Icon "${icon}" should be curated`);
    }
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
