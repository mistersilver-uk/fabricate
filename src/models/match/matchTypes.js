/**
 * Registry of ingredient-`match` type handlers.
 *
 * Each `match` is a PLAIN object of the shape `{ type, ... }` persisted in the
 * recipe wire format. Rather than scatter `match.type` branching across the
 * model, systems, and UI-readiness layers, every type owns its logic here in one
 * place and call sites dispatch through {@link getMatchHandler}.
 *
 * This is a pure leaf module: it imports ONLY `../../config/flags.js` (the tags
 * handler's `matchesItem` reads item flags) and constructs no class instances —
 * a `match` stays a plain object everywhere. It must NOT import Ingredient,
 * Recipe, or RecipeManager (those import the registry, so importing them back
 * would form a cycle).
 *
 * @typedef {object} MatchHandler
 * @property {string} type
 * @property {boolean} isTerminalInventoryMatch
 * @property {(data: object) => object|null} normalize
 * @property {(match: object) => boolean} isComplete
 * @property {(match: object, options: {requireComplete?: boolean}) => string[]} validate
 * @property {(match: object) => (string|null)} signature
 * @property {(match: object, systemComponents: object[]) => Set<string>} expandToComponentIds
 * @property {(match: object, item: object, options: {features?: object}) => boolean} matchesItem
 * @property {(match: object) => (string|null)} getComponentId
 * @property {(match: object, options: {quantity?: number}) => string} describe
 * @property {(match: object, options: {affordCurrency?: (match: object) => boolean}) => boolean} affords
 * @property {(match: object) => ({unit: string, amount: number}|null)} getCurrencySpend
 */
import { getFabricateFlag } from '../../config/flags.js';

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** @type {MatchHandler} */
const componentHandler = {
  type: 'component',

  // A component (or legacy systemItem) match is NOT terminal for inventory
  // matching: its id is resolved upstream against managed components, so
  // `_matchesIngredient` falls through to the bare-field / alternatives paths.
  isTerminalInventoryMatch: false,

  normalize(data = {}) {
    const raw = data.match && typeof data.match === 'object' ? data.match : null;
    // Accept both 'component' (primary) and 'systemItem' (legacy fallback),
    // folding bare top-level fields into the canonical component shape.
    const componentId =
      (raw && (raw.componentId || raw.systemItemId)) ||
      data.componentId ||
      data.systemItemId ||
      null;
    return {
      type: 'component',
      componentId,
    };
  },

  // Use the shared ID extraction so the legacy `systemItem`/`systemItemId`
  // alias is treated as complete even before normalisation folds it to
  // `componentId`.
  isComplete: (match) => !!componentHandler.getComponentId(match),

  validate: () => [],

  signature(match) {
    // Read through getComponentId so a raw `{ type: 'systemItem', systemItemId }`
    // signs identically to its normalised `{ type: 'component', componentId }`.
    const componentId = trimmed(componentHandler.getComponentId(match));
    return componentId ? `component:${componentId}` : null;
  },

  expandToComponentIds(match) {
    const id = match?.componentId || match?.systemItemId || null;
    return id ? new Set([id]) : new Set();
  },

  // Component matching stays in `ingredientMatchesItem` upstream (managed
  // component source/name resolution), so the handler never matches here.
  matchesItem: () => false,

  getComponentId: (match) => match?.componentId || match?.systemItemId || null,

  describe: (match, { quantity = 1 } = {}) => `${quantity}x component`,

  // A component option is satisfied by inventory items, never by currency.
  affords: () => false,

  getCurrencySpend: () => null,
};

/** @type {MatchHandler} */
const tagsHandler = {
  type: 'tags',

  // A tags match is terminal for inventory matching: `matchesItem` fully decides
  // the result off the match object, so `_matchesIngredient` dispatches to it.
  isTerminalInventoryMatch: true,

  normalize(data = {}) {
    const raw = data.match && typeof data.match === 'object' ? data.match : null;
    const tags = Array.isArray(raw?.tags)
      ? raw.tags.map((t) => String(t || '').trim()).filter(Boolean)
      : [];
    return {
      type: 'tags',
      tags,
      tagMatch: raw?.tagMatch === 'all' ? 'all' : 'any',
    };
  },

  isComplete: (match) =>
    match?.type === 'tags' && Array.isArray(match.tags) && match.tags.length > 0,

  validate(match, { requireComplete = true } = {}) {
    if (requireComplete && (!Array.isArray(match?.tags) || match.tags.length === 0)) {
      return ['Tag-based ingredient match requires at least one tag'];
    }
    return [];
  },

  signature(match) {
    const tags = (Array.isArray(match?.tags) ? match.tags : []).map(trimmed).filter(Boolean);
    if (tags.length === 0) return null;
    const tagMatch = match?.tagMatch === 'all' ? 'all' : 'any';
    return `tags:${[...tags].sort((a, b) => a.localeCompare(b)).join(',')}|${tagMatch}`;
  },

  expandToComponentIds(match, systemComponents) {
    const tags = Array.isArray(match?.tags) ? match.tags : [];
    const tagMatch = match?.tagMatch === 'all' ? 'all' : 'any';

    return new Set(
      (systemComponents || [])
        .filter((c) => {
          const compTags = Array.isArray(c.tags) ? c.tags : [];
          return tagMatch === 'all'
            ? tags.every((t) => compTags.includes(t))
            : tags.some((t) => compTags.includes(t));
        })
        .map((c) => c.id)
    );
  },

  matchesItem(match, item, { features } = {}) {
    if (!features?.enableTags) return false;
    const requiredTags = Array.isArray(match?.tags) ? match.tags : [];
    const itemTags = getFabricateFlag(item, 'tags', []);
    const matched =
      match?.tagMatch === 'all'
        ? requiredTags.every((tag) => itemTags.includes(tag))
        : requiredTags.some((tag) => itemTags.includes(tag));
    return matched;
  },

  getComponentId: () => null,

  describe(match, { quantity = 1 } = {}) {
    const tags = Array.isArray(match?.tags) ? match.tags : [];
    const joined = tags.join(match?.tagMatch === 'all' ? ' & ' : ' | ');
    return `${quantity}x ${joined}`;
  },

  // A tag option is satisfied by inventory items, never by currency.
  affords: () => false,

  getCurrencySpend: () => null,
};

/** @type {MatchHandler} */
const currencyHandler = {
  type: 'currency',

  // A currency match is terminal for inventory matching: it matches no inventory
  // item (satisfied by affordance, not item matching), so `matchesItem` returns
  // false and `_matchesIngredient` dispatches to it rather than falling through.
  isTerminalInventoryMatch: true,

  normalize(data = {}) {
    const raw = data.match && typeof data.match === 'object' ? data.match : null;
    // A currency alternative ("100 gp") mirrors the legacy step-currency shape:
    // a unit id string plus a non-negative amount. It is spent at craft time via
    // the currency-affordance layer (see src/systems/currencyAffordance.js).
    return {
      type: 'currency',
      unit: String(raw?.unit || '').trim(),
      amount: Math.max(0, Number(raw?.amount) || 0),
    };
  },

  isComplete: (match) => match?.type === 'currency' && !!match.unit && Number(match.amount) > 0,

  validate(match, { requireComplete = true } = {}) {
    if (requireComplete && !currencyHandler.isComplete(match)) {
      return ['Currency ingredient match requires a unit and a positive amount'];
    }
    return [];
  },

  signature(match) {
    const unit = trimmed(match?.unit);
    const amount = Number(match?.amount) || 0;
    if (!unit || amount <= 0) return null;
    return `currency:${unit}:${amount}`;
  },

  // A currency alternative is not a managed component, so it contributes no
  // component ids and is ignored by alchemy signature overlap detection.
  expandToComponentIds: () => new Set(),

  // A currency alternative matches no inventory item — it is satisfied by
  // affording its cost, handled out-of-band during ingredient selection and
  // spent by the currency-affordance layer, not by item matching here.
  matchesItem: () => false,

  getComponentId: () => null,

  describe(match) {
    // A currency alternative carries its cost on the match (`amount`/`unit`), not
    // the option quantity, so the description reads as a flat currency cost rather
    // than an "Nx" item count.
    const unit = trimmed(match?.unit);
    const amount = Number(match?.amount) || 0;
    return `${amount} ${unit}`.trim();
  },

  /**
   * Whether the actor can afford this currency option. The `affordCurrency` probe
   * (bound to the crafting actor + system currency profile in the engine) reports
   * affordability; with no probe (the default, back-compat for `canBeCraftedWith`)
   * currency is NEVER affordable, so an item plan is byte-for-byte unchanged.
   */
  affords: (match, { affordCurrency } = {}) =>
    typeof affordCurrency === 'function' ? !!affordCurrency(match) : false,

  /**
   * The `{ unit, amount }` spend this currency option requires, or null when the
   * option is incomplete (no unit / non-positive amount).
   */
  getCurrencySpend(match) {
    if (!currencyHandler.isComplete(match)) return null;
    return { unit: trimmed(match?.unit), amount: Number(match?.amount) || 0 };
  },
};

/**
 * Fallback handler for a null match or an unrecognized `match.type`. Every method
 * is a safe no-op so call sites can dispatch without guarding the type.
 *
 * @type {MatchHandler}
 */
const unknownHandler = {
  type: 'unknown',
  // A null/unrecognized match is NOT terminal: `_matchesIngredient` falls through
  // to the bare-field `ingredient.tag` block and the `alternatives` recursion.
  isTerminalInventoryMatch: false,
  normalize: () => null,
  isComplete: () => false,
  validate: () => [],
  signature: () => null,
  expandToComponentIds: () => new Set(),
  matchesItem: () => false,
  getComponentId: () => null,
  describe: () => '',
  affords: () => false,
  getCurrencySpend: () => null,
};

/**
 * Type → handler registry. `systemItem` is a legacy alias for `component`
 * resolved by {@link getMatchHandler}, not a distinct entry.
 *
 * @type {{ component: MatchHandler, tags: MatchHandler, currency: MatchHandler }}
 */
export const HANDLERS = {
  component: componentHandler,
  tags: tagsHandler,
  currency: currencyHandler,
};

/**
 * Resolve the handler for a match by its `type`, aliasing `systemItem` to
 * `component`. Returns the safe fallback handler for null/undefined matches and
 * unrecognized types.
 *
 * @param {object|null|undefined} match
 * @returns {MatchHandler}
 */
export function getMatchHandler(match) {
  const type = match?.type === 'systemItem' ? 'component' : match?.type;
  return HANDLERS[type] || unknownHandler;
}

/**
 * Resolve the managed-component id an ingredient/result reference points at, or
 * `null`. Takes the REF (ingredient or result), not a bare match, because the
 * non-component branch reads the legacy bare top-level `ref.componentId` /
 * `ref.systemItemId`. A `component` (or aliased `systemItem`) match resolves its
 * id through the handler; every other type (tags/currency/null/unknown) resolves
 * `null` from the handler and falls back to the bare fields. The trailing
 * `|| null` normalises `undefined`/`''` to `null` uniformly.
 *
 * @param {object|null|undefined} ref
 * @returns {string|null}
 */
export function getIngredientComponentId(ref) {
  const handler = getMatchHandler(ref?.match);
  const id =
    handler.type === 'component'
      ? handler.getComponentId(ref.match)
      : ref?.componentId || ref?.systemItemId;
  return id || null;
}

/**
 * Normalize raw ingredient data into a canonical `match` object (or null when no
 * match can be derived). Dispatches per declared `match.type`, then falls back to
 * legacy bare top-level fields (`componentId`/`systemItemId`, then `tags`/`tag`).
 *
 * @param {object} [data]
 * @returns {object|null}
 */
export function normalizeMatch(data = {}) {
  const raw = data.match && typeof data.match === 'object' ? data.match : null;
  if (raw) {
    if (raw.type === 'tags') {
      return tagsHandler.normalize(data);
    }
    if (raw.type === 'currency') {
      return currencyHandler.normalize(data);
    }
    // Accept both 'component' (primary) and 'systemItem' (legacy fallback).
    return componentHandler.normalize(data);
  }

  // Bare componentId or systemItemId field.
  const bareComponentId = data.componentId || data.systemItemId || null;
  if (bareComponentId) {
    return {
      type: 'component',
      componentId: bareComponentId,
    };
  }

  let tags = [];
  if (Array.isArray(data.tags)) {
    tags = data.tags.map((t) => String(t || '').trim()).filter(Boolean);
  } else if (data.tag) {
    tags = [String(data.tag).trim()];
  }
  if (tags.length > 0) {
    return {
      type: 'tags',
      tags,
      tagMatch: data.tagMatch === 'all' ? 'all' : 'any',
    };
  }

  return null;
}
