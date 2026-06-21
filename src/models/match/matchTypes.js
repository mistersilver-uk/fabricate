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
 * @property {(data: object) => object|null} normalize
 * @property {(match: object) => boolean} isComplete
 * @property {(match: object, options: {requireComplete?: boolean}) => string[]} validate
 * @property {(match: object) => (string|null)} signature
 * @property {(match: object, systemComponents: object[]) => Set<string>} expandToComponentIds
 * @property {(match: object, item: object, options: {features?: object}) => boolean} matchesItem
 * @property {(match: object) => (string|null)} getComponentId
 * @property {(match: object, options: {quantity?: number}) => string} describe
 */
import { getFabricateFlag } from '../../config/flags.js';

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** @type {MatchHandler} */
const componentHandler = {
  type: 'component',

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

  isComplete(match) {
    return match?.type === 'component' && !!match.componentId;
  },

  validate() {
    return [];
  },

  signature(match) {
    const componentId = trimmed(match?.componentId);
    return componentId ? `component:${componentId}` : null;
  },

  expandToComponentIds(match) {
    const id = match?.componentId || match?.systemItemId || null;
    return id ? new Set([id]) : new Set();
  },

  matchesItem() {
    // Component matching stays in `ingredientMatchesItem` upstream (managed
    // component source/name resolution), so the handler never matches here.
    return false;
  },

  getComponentId(match) {
    return match?.componentId || match?.systemItemId || null;
  },

  describe(match, { quantity = 1 } = {}) {
    return `${quantity}x component`;
  },
};

/** @type {MatchHandler} */
const tagsHandler = {
  type: 'tags',

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

  isComplete(match) {
    return match?.type === 'tags' && Array.isArray(match.tags) && match.tags.length > 0;
  },

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

  getComponentId() {
    return null;
  },

  describe(match, { quantity = 1 } = {}) {
    const tags = Array.isArray(match?.tags) ? match.tags : [];
    const joined = tags.join(match?.tagMatch === 'all' ? ' & ' : ' | ');
    return `${quantity}x ${joined}`;
  },
};

/** @type {MatchHandler} */
const currencyHandler = {
  type: 'currency',

  normalize(data = {}) {
    const raw = data.match && typeof data.match === 'object' ? data.match : null;
    // A currency alternative ("100 gp") mirrors the legacy step-currency shape:
    // a unit id string plus a non-negative amount. Authored cost only today —
    // craft-time spending is a deferred follow-up.
    return {
      type: 'currency',
      unit: String(raw?.unit || '').trim(),
      amount: Math.max(0, Number(raw?.amount) || 0),
    };
  },

  isComplete(match) {
    return match?.type === 'currency' && !!match.unit && Number(match.amount) > 0;
  },

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

  expandToComponentIds() {
    // A currency alternative is not a managed component, so it contributes no
    // component ids and is ignored by alchemy signature overlap detection.
    return new Set();
  },

  matchesItem() {
    // A currency alternative matches no inventory item. Currency matches are
    // authored-only; craft-time currency spend is a separate follow-up.
    return false;
  },

  getComponentId() {
    return null;
  },

  describe(match, { quantity = 1 } = {}) {
    const unit = trimmed(match?.unit);
    const amount = Number(match?.amount) || 0;
    return `${quantity}x ${amount} ${unit}`;
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
  normalize() {
    return null;
  },
  isComplete() {
    return false;
  },
  validate() {
    return [];
  },
  signature() {
    return null;
  },
  expandToComponentIds() {
    return new Set();
  },
  matchesItem() {
    return false;
  },
  getComponentId() {
    return null;
  },
  describe() {
    return '';
  },
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

  const tags = Array.isArray(data.tags)
    ? data.tags.map((t) => String(t || '').trim()).filter(Boolean)
    : data.tag
      ? [String(data.tag).trim()]
      : [];
  if (tags.length > 0) {
    return {
      type: 'tags',
      tags,
      tagMatch: data.tagMatch === 'all' ? 'all' : 'any',
    };
  }

  return null;
}
