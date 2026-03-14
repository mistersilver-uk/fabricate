import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEssenceIconOptions,
  DEFAULT_ESSENCE_ICON,
  getEssenceAllIconOptions,
  getEssenceIconOptions,
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

  it('exports a fantasy-safe subset that is meaningfully smaller than the full catalog', () => {
    const safeCount = FONT_AWESOME_FREE_CLASSIC_FANTASY_SAFE_ICON_DEFINITIONS.length;
    const totalCount = FONT_AWESOME_FREE_CLASSIC_ICON_DEFINITIONS.length;

    assert.ok(safeCount >= 400, `Expected at least 400 fantasy-safe icons, got ${safeCount}`);
    assert.ok(safeCount <= 600, `Expected at most 600 fantasy-safe icons, got ${safeCount}`);
    assert.ok(safeCount < totalCount * 0.5, 'Fantasy-safe subset should be less than half the full catalog');
  });

  it('includes core fantasy crafting icons', () => {
    const safeCodes = new Set(FONT_AWESOME_FREE_CLASSIC_FANTASY_SAFE_ICON_DEFINITIONS.map(d => d.iconCode));

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
      assert.ok(safeCodes.has(icon), `Expected fantasy icon "${icon}" to be in the safe list`);
    }
  });

  it('excludes single-character icons (letters and digits)', () => {
    for (let i = 0; i <= 9; i++) {
      assert.equal(isFantasySafeFontAwesomeClassicFreeIcon(String(i)), false, `Digit "${i}" should not be fantasy-safe`);
    }
    for (let c = 97; c <= 122; c++) {
      const letter = String.fromCharCode(c);
      assert.equal(isFantasySafeFontAwesomeClassicFreeIcon(letter), false, `Letter "${letter}" should not be fantasy-safe`);
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
      assert.equal(isFantasySafeFontAwesomeClassicFreeIcon(icon), false, `Currency icon "${icon}" should not be fantasy-safe`);
    }
  });

  it('excludes modern technology and computing icons', () => {
    const techIcons = [
      'computer', 'computer-mouse', 'desktop', 'display', 'laptop', 'laptop-code',
      'mobile', 'mobile-screen', 'tablet', 'tablet-screen-button',
      'keyboard', 'microchip', 'memory', 'hard-drive', 'floppy-disk',
      'server', 'database', 'network-wired', 'ethernet', 'wifi', 'signal',
      'sim-card', 'sd-card', 'headphones', 'headset', 'microphone',
      'tv', 'radio', 'gamepad', 'robot', 'vr-cardboard',
      'plug', 'power-off', 'battery-full', 'battery-half',
      'satellite', 'satellite-dish', 'walkie-talkie',
      'camera', 'camera-retro', 'video', 'compact-disc', 'record-vinyl',
      'phone', 'phone-flip', 'fax', 'pager', 'podcast',
      'terminal', 'rss', 'sitemap', 'qrcode', 'barcode'
    ];

    for (const icon of techIcons) {
      assert.equal(isFantasySafeFontAwesomeClassicFreeIcon(icon), false, `Tech icon "${icon}" should not be fantasy-safe`);
    }
  });

  it('excludes modern transport icons', () => {
    const transportIcons = [
      'car', 'car-side', 'bus', 'bus-simple', 'truck', 'truck-fast',
      'train', 'train-subway', 'plane', 'plane-departure',
      'bicycle', 'motorcycle', 'taxi', 'ferry', 'shuttle-space',
      'helicopter', 'van-shuttle', 'tractor', 'snowplow', 'trailer', 'caravan'
    ];

    for (const icon of transportIcons) {
      assert.equal(isFantasySafeFontAwesomeClassicFreeIcon(icon), false, `Transport icon "${icon}" should not be fantasy-safe`);
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
      assert.equal(isFantasySafeFontAwesomeClassicFreeIcon(icon), false, `UI icon "${icon}" should not be fantasy-safe`);
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
      assert.equal(isFantasySafeFontAwesomeClassicFreeIcon(icon), false, `Face icon "${icon}" should not be fantasy-safe`);
    }
  });

  it('excludes modern office, business, and finance icons', () => {
    const officeIcons = [
      'briefcase', 'calculator', 'calendar', 'calendar-days',
      'clipboard', 'clipboard-list', 'credit-card',
      'envelope', 'envelope-open', 'folder', 'folder-open',
      'id-card', 'id-badge', 'inbox', 'paperclip', 'stapler',
      'receipt', 'cash-register', 'money-check', 'money-check-dollar',
      'store', 'shop', 'suitcase',
      'coins', 'money-bill', 'money-bill-wave', 'piggy-bank',
      'sack-dollar', 'wallet', 'hand-holding-dollar',
      'dollar-sign', 'euro-sign', 'bitcoin-sign',
      'chart-simple', 'chart-column'
    ];

    for (const icon of officeIcons) {
      assert.equal(isFantasySafeFontAwesomeClassicFreeIcon(icon), false, `Office icon "${icon}" should not be fantasy-safe`);
    }
  });

  it('excludes modern medicine, pandemic, and healthcare icons', () => {
    const medicalIcons = [
      'hospital', 'stethoscope', 'syringe', 'pills', 'capsules',
      'prescription', 'prescription-bottle', 'x-ray', 'microscope',
      'dna', 'lungs', 'bed-pulse', 'kit-medical',
      'virus', 'virus-covid', 'bacteria', 'bacterium',
      'mask-face', 'mask-ventilator', 'pump-soap', 'soap',
      'hand-sparkles', 'hands-bubbles',
      'head-side-cough', 'head-side-mask', 'head-side-virus'
    ];

    for (const icon of medicalIcons) {
      assert.equal(isFantasySafeFontAwesomeClassicFreeIcon(icon), false, `Medical icon "${icon}" should not be fantasy-safe`);
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
      assert.equal(isFantasySafeFontAwesomeClassicFreeIcon(icon), false, `Humanitarian icon "${icon}" should not be fantasy-safe`);
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
      assert.equal(isFantasySafeFontAwesomeClassicFreeIcon(icon), false, `Icon "${icon}" should not be fantasy-safe`);
    }
  });

  it('excludes modern domestic, sports, and miscellaneous non-fantasy icons', () => {
    const miscModern = [
      'toilet', 'toilet-paper', 'shower', 'bath', 'restroom',
      'dumpster', 'recycle', 'fire-extinguisher',
      'baseball', 'basketball', 'football', 'volleyball', 'hockey-puck',
      'bowling-ball', 'golf-ball-tee', 'table-tennis-paddle-ball',
      'burger', 'hotdog', 'pizza-slice', 'ice-cream', 'stroopwafel',
      'baby', 'baby-carriage', 'graduation-cap', 'school',
      'fingerprint', 'passport', 'gun', 'handcuffs',
      'jet-fighter', 'bomb', 'explosion', 'biohazard', 'radiation',
      'cannabis', 'bong', 'joint', 'smoking', 'ban-smoking',
      'bullhorn', 'rectangle-ad', 'newspaper',
      'stopwatch', 'thermometer', 'tachograph-digital',
      'paint-roller', 'spray-can', 'blender',
      'street-view', 'location-pin', 'location-dot', 'location-arrow',
      'comment', 'comment-dots', 'comments', 'blog',
      'file', 'file-pdf', 'file-code', 'file-excel', 'file-image',
      'image', 'images', 'panorama', 'clapperboard', 'film',
      'binoculars', 'screwdriver', 'dumbbell',
      'face-smile', 'face-angry', 'face-grin-tears'
    ];

    for (const icon of miscModern) {
      assert.equal(isFantasySafeFontAwesomeClassicFreeIcon(icon), false, `Icon "${icon}" should not be fantasy-safe`);
    }
  });

  it('keeps signs-post despite the -sign$ currency pattern', () => {
    assert.equal(isFantasySafeFontAwesomeClassicFreeIcon('signs-post'), true);
  });

  it('builds the fantasy-safe picker catalog by default', () => {
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
});
