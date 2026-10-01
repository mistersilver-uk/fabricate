/**
 * The die tiles of a success-counting roll (issue 2006). {@link tileModel} is the one derivation of
 * which tiles show, in which order and with which marks; `DiceTiles.svelte` and
 * {@link renderDiceTilesHtml}, the escaped renderer for stored chat content, both draw it.
 * `localize` is key-only, as every card module's is; an untranslated key reads its English copy.
 */
import { fill } from '../../utils/fillPlaceholders.js';
import { localizeWith } from '../../utils/localizeWithFallback.js';

import { esc } from './htmlEscape.js';

/** The most tiles a model holds; the rest are counted as `more`, since a pool can reach 999. */
export const DICE_TILE_LIMIT = 40;

/** The marks a tile can carry, in the order it states them (decision 28). */
export const DICE_TILE_MARKS = Object.freeze(['qualified', 'cancelled', 'exploded']);

/** The token a bought die adds to its marks hook (issue 2008); its dashed border is its only paint. */
export const DICE_TILE_BOUGHT = 'bought';

/** Font Awesome Free glyphs, one per mark. */
export const DICE_TILE_GLYPHS = Object.freeze({
  qualified: 'fa-solid fa-check',
  cancelled: 'fa-solid fa-xmark',
  exploded: 'fa-solid fa-rotate',
});

/** The hooks every tile carries unless its host names its own. */
export const DICE_TILE_HOOKS = Object.freeze({
  face: 'data-dice-tile-face',
  marks: 'data-dice-tile-marks',
  legend: 'data-dice-tiles-legend',
});

const COPY = Object.freeze({
  qualified: ['FABRICATE.Admin.Manager.Checks.Simulator.MarkQualified', 'qualified'],
  cancelled: ['FABRICATE.Admin.Manager.Checks.Simulator.MarkCancelled', 'cancelled'],
  exploded: ['FABRICATE.Admin.Manager.Checks.Simulator.MarkExploded', 'exploded'],
  generated: ['FABRICATE.Common.DiceTiles.Generated', 'rolled by an explosion'],
  join: ['FABRICATE.Admin.Manager.Checks.Simulator.MarkJoin', ' and '],
  label: ['FABRICATE.Admin.Manager.Checks.Simulator.FaceMarked', '{face}, {marks}'],
  legend: [
    'FABRICATE.Admin.Manager.Checks.Simulator.CountLegend',
    '✓ qualified · ✕ cancelled · ↻ exploded',
  ],
  more: ['FABRICATE.Common.DiceTiles.More', '+{count} more'],
  bought: ['FABRICATE.Check.BoughtDice.TileLabel', '{label}, bought'],
  boughtLegend: ['FABRICATE.Check.BoughtDice.Legend', '{legend} · dashed = bought'],
});

function copy(localize, id) {
  const [key, fallback] = COPY[id];
  return localizeWith(localize, key, undefined, fallback);
}

function tileOf(entry, bought) {
  return {
    face: entry.face,
    marks: DICE_TILE_MARKS.filter((mark) => entry[mark] === true),
    generated: Number.isInteger(entry.explodedFrom),
    ...(bought.has(entry.index) && { bought: true }),
  };
}

/** The indices of the last `count` original dice in roll order: the dice bought for the roll. */
function boughtIndices(results, count) {
  if (!Number.isInteger(count) || count < 1) return new Set();
  const originals = results
    .filter((entry) => !Number.isInteger(entry.explodedFrom))
    .map((entry) => entry.index)
    .sort((left, right) => left - right);
  return new Set(originals.slice(-count));
}

/** The projection's entries in display order: each die, then the dice its explosions rolled. */
function displayOrder(results) {
  const indices = new Set(results.map((entry) => entry.index));
  const children = new Map();
  const roots = [];
  for (const entry of results) {
    const parent = entry.explodedFrom;
    if (!Number.isInteger(parent) || parent === entry.index || !indices.has(parent)) {
      roots.push(entry);
    } else {
      children.set(parent, [...(children.get(parent) ?? []), entry]);
    }
  }
  const ordered = [];
  const stack = roots.toReversed();
  const seen = new Set();
  while (stack.length > 0) {
    const entry = stack.pop();
    if (seen.has(entry)) continue;
    seen.add(entry);
    ordered.push(entry);
    stack.push(...(children.get(entry.index) ?? []).toReversed());
  }
  return ordered;
}

/**
 * `{ tiles: [{ face, marks, generated, bought? }], more, bought? }` from an executed count
 * projection's `results` (`projectCountResults`' entries: `index`, `face`, `active`,
 * `explodedFrom` and the three mark flags) and its `bought` count. One tile per active die, capped
 * at `limit`; `more` counts the tiles the cap left out, and `bought` the dice marked bought.
 */
export function tileModel(countDisplay, { limit = DICE_TILE_LIMIT } = {}) {
  const results = Array.isArray(countDisplay?.results) ? countDisplay.results : [];
  const bought = boughtIndices(results, countDisplay?.bought);
  const active = displayOrder(results)
    .filter((entry) => entry.active !== false)
    .map((entry) => tileOf(entry, bought));
  return {
    tiles: active.slice(0, limit),
    more: Math.max(0, active.length - limit),
    ...(bought.size > 0 && { bought: bought.size }),
  };
}

/** The tokens a tile's marks hook carries: each mark, then `bought` for a bought die. */
export function tileMarkTokens(tile) {
  return [...tile.marks, ...(tile.bought === true ? [DICE_TILE_BOUGHT] : [])].join(' ');
}

/** A tile's tone: a cancel reads danger, a qualifying or exploding die success, else none. */
export function tileTone(marks) {
  if (marks.includes('cancelled')) return 'danger';
  return marks.includes('qualified') || marks.includes('exploded') ? 'success' : '';
}

function markedLabel(tile, localize) {
  const words = tile.marks.map((mark) => copy(localize, mark));
  if (tile.generated) words.push(copy(localize, 'generated'));
  if (words.length === 0) return String(tile.face);
  const joined =
    words.length > 1
      ? `${words.slice(0, -1).join(', ')}${copy(localize, 'join')}${words.at(-1)}`
      : words[0];
  return fill(copy(localize, 'label'), { face: tile.face, marks: joined });
}

/**
 * "10, qualified and exploded": the face, then every mark, and whether an explosion rolled it; a
 * bought die appends ", bought".
 */
export function tileLabel(tile, localize) {
  const label = markedLabel(tile, localize);
  return tile.bought === true ? fill(copy(localize, 'bought'), { label }) : label;
}

/** `+{count} more`, for the tiles the cap left out. */
export function moreText(count, localize) {
  return fill(copy(localize, 'more'), { count });
}

/** The key under the tiles: which glyph means which mark, and the dashed border when `bought`. */
export function legendText(localize, bought = 0) {
  const legend = copy(localize, 'legend');
  return Number(bought) > 0 ? fill(copy(localize, 'boughtLegend'), { legend }) : legend;
}

function tileHtml(tile, localize) {
  const tone = tileTone(tile.marks);
  const classes = [
    'fabricate-dice-tiles__tile',
    tone && `fabricate-dice-tiles__tile--${tone}`,
    tile.bought === true && 'fabricate-dice-tiles__tile--bought',
  ];
  const marks = tile.marks
    .map((mark) => `<i class="${DICE_TILE_GLYPHS[mark]}" aria-hidden="true"></i>`)
    .join('');
  return [
    `<li class="${classes.filter(Boolean).join(' ')}"`,
    ` ${DICE_TILE_HOOKS.face}="${esc(tile.face)}" ${DICE_TILE_HOOKS.marks}="${tileMarkTokens(tile)}"`,
    tile.generated ? ' data-dice-tile-generated=""' : '',
    ` aria-label="${esc(tileLabel(tile, localize))}">`,
    `<span class="fabricate-dice-tiles__face" aria-hidden="true">${esc(tile.face)}</span>`,
    marks ? `<span class="fabricate-dice-tiles__marks" aria-hidden="true">${marks}</span>` : '',
    '</li>',
  ].join('');
}

/**
 * The model as escaped HTML for a chat card, or '' when it holds no tile. The same markup
 * `DiceTiles.svelte` renders; `legend` adds the key under the tiles.
 */
export function renderDiceTilesHtml(model, localize = (key) => key, { legend = false } = {}) {
  const tiles = Array.isArray(model?.tiles) ? model.tiles : [];
  const more = Number(model?.more) > 0 ? Number(model.more) : 0;
  if (tiles.length === 0 && more === 0) return '';
  return [
    '<div class="fabricate-dice-tiles">',
    '<ul class="fabricate-dice-tiles__list">',
    ...tiles.map((tile) => tileHtml(tile, localize)),
    more
      ? `<li class="fabricate-dice-tiles__more" data-dice-tiles-more="${more}">${esc(moreText(more, localize))}</li>`
      : '',
    '</ul>',
    legend
      ? `<p class="fabricate-dice-tiles__legend" ${DICE_TILE_HOOKS.legend}="">${esc(legendText(localize, model?.bought))}</p>`
      : '',
    '</div>',
  ].join('');
}
