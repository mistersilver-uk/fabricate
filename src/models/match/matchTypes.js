/** Registry of ingredient-`match` type handlers. */
import { getFabricateFlag } from '../../config/flags.js';
import { trimString as trimmed } from '../../utils/scalars.js';

const componentHandler = {
  type: 'component',

  // Not terminal: the id resolves upstream against managed components, so `_matchesIngredient`
  // falls through to the bare-field and alternatives paths.
  isTerminalInventoryMatch: false,

  normalize(data = {}) {
    const raw = data.match && typeof data.match === 'object' ? data.match : null;
    // Reads the legacy `systemItem` alias and bare top-level fields too.
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

  // The legacy `systemItemId` alias is complete even before normalisation.
  isComplete: (match) => !!componentHandler.getComponentId(match),

  validate: () => [],

  signature(match) {
    // A raw `systemItem` match signs identically to its normalised `component` form.
    const componentId = trimmed(componentHandler.getComponentId(match));
    return componentId ? `component:${componentId}` : null;
  },

  expandToComponentIds(match) {
    const id = match?.componentId || match?.systemItemId || null;
    return id ? new Set([id]) : new Set();
  },

  // Component matching happens upstream in `ingredientMatchesItem`.
  matchesItem: () => false,

  getComponentId: (match) => match?.componentId || match?.systemItemId || null,

  describe: (match, { quantity = 1 } = {}) => `${quantity}x component`,

  affords: () => false,

  getCurrencySpend: () => null,
};

const tagsHandler = {
  type: 'tags',

  // Terminal: `matchesItem` fully decides from the match object.
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

  matchesItem(match, item, { features, itemTags } = {}) {
    if (!features?.enableTags) return false;
    const requiredTags = Array.isArray(match?.tags) ? match.tags : [];
    // Tags live on the managed component; Fabricate never stamps `flags.fabricate.tags` on
    // inventory items (issue 857).
    const resolvedTags = Array.isArray(itemTags) ? itemTags : getFabricateFlag(item, 'tags', []);
    const matched =
      match?.tagMatch === 'all'
        ? requiredTags.every((tag) => resolvedTags.includes(tag))
        : requiredTags.some((tag) => resolvedTags.includes(tag));
    return matched;
  },

  getComponentId: () => null,

  describe(match, { quantity = 1 } = {}) {
    const tags = Array.isArray(match?.tags) ? match.tags : [];
    const joined = tags.join(match?.tagMatch === 'all' ? ' & ' : ' | ');
    return `${quantity}x ${joined}`;
  },

  affords: () => false,

  getCurrencySpend: () => null,
};

const currencyHandler = {
  type: 'currency',

  // Terminal, matching no item: currency is satisfied by affordance, spent out of band.
  isTerminalInventoryMatch: true,

  normalize(data = {}) {
    const raw = data.match && typeof data.match === 'object' ? data.match : null;
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

  // No component ids, so alchemy signature overlap detection ignores it.
  expandToComponentIds: () => new Set(),

  matchesItem: () => false,

  getComponentId: () => null,

  describe(match) {
    // The cost is on the match, not the option quantity, so no "Nx" count.
    const unit = trimmed(match?.unit);
    const amount = Number(match?.amount) || 0;
    return `${amount} ${unit}`.trim();
  },

  affords: (match, { affordCurrency } = {}) =>
    typeof affordCurrency === 'function' ? !!affordCurrency(match) : false,

  /** `{ unit, amount }`, or null for an incomplete option. */
  getCurrencySpend(match) {
    if (!currencyHandler.isComplete(match)) return null;
    return { unit: trimmed(match?.unit), amount: Number(match?.amount) || 0 };
  },
};

const essenceHandler = {
  type: 'essence',

  // Terminal, matching no single item: the consumption planner accumulates the amount across
  // every item carrying the essence.
  isTerminalInventoryMatch: true,

  normalize(data = {}) {
    const raw = data.match && typeof data.match === 'object' ? data.match : null;
    return {
      type: 'essence',
      essenceId: String(raw?.essenceId || '').trim(),
      amount: Math.max(0, Number(raw?.amount) || 0),
    };
  },

  isComplete: (match) =>
    match?.type === 'essence' && !!trimmed(match.essenceId) && Number(match.amount) > 0,

  validate(match, { requireComplete = true } = {}) {
    if (requireComplete && !essenceHandler.isComplete(match)) {
      return ['Essence ingredient match requires an essence and a positive amount'];
    }
    return [];
  },

  signature(match) {
    const essenceId = trimmed(match?.essenceId);
    const amount = Number(match?.amount) || 0;
    if (!essenceId || amount <= 0) return null;
    return `essence:${essenceId}:${amount}`;
  },

  // Every component carrying the essence, which readiness overlap detection and the alchemy
  // SignatureValidator rely on.
  expandToComponentIds(match, systemComponents) {
    const essenceId = trimmed(match?.essenceId);
    if (!essenceId) return new Set();
    return new Set(
      (systemComponents || []).filter((c) => Number(c?.essences?.[essenceId]) > 0).map((c) => c.id)
    );
  },

  matchesItem: () => false,

  getComponentId: () => null,

  describe(match) {
    const essenceId = trimmed(match?.essenceId);
    const amount = Number(match?.amount) || 0;
    return `${amount}x ${essenceId} essence`.trim();
  },

  affords: () => false,

  getCurrencySpend: () => null,
};

/** For a null match or an unrecognized `match.type`. */
const unknownHandler = {
  type: 'unknown',
  // Not terminal: falls through to the bare `ingredient.tag` block and `alternatives`.
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

export const HANDLERS = {
  component: componentHandler,
  tags: tagsHandler,
  currency: currencyHandler,
  essence: essenceHandler,
};

/** Resolve the handler for a match by its `type`, aliasing `systemItem` to `component`. */
export function getMatchHandler(match) {
  const type = match?.type === 'systemItem' ? 'component' : match?.type;
  return HANDLERS[type] || unknownHandler;
}

/** The managed-component id a reference points at, or `null`. */
export function getIngredientComponentId(ref) {
  const handler = getMatchHandler(ref?.match);
  const id =
    handler.type === 'component'
      ? handler.getComponentId(ref.match)
      : ref?.componentId || ref?.systemItemId;
  return id || null;
}

/** A canonical `match`, or null when none can be derived. */
export function normalizeMatch(data = {}) {
  const raw = data.match && typeof data.match === 'object' ? data.match : null;
  if (raw) {
    if (raw.type === 'tags') {
      return tagsHandler.normalize(data);
    }
    if (raw.type === 'currency') {
      return currencyHandler.normalize(data);
    }
    // Before the component fallback, which would silently turn an essence match into
    // `{ type: 'component', componentId: null }`.
    if (raw.type === 'essence') {
      return essenceHandler.normalize(data);
    }
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
