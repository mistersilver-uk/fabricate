/**
 * Represents an ingredient required for crafting
 * Supports both simple (exact item) and advanced (tag-based) matching
 */
import { getFabricateFlag } from '../config/flags.js';

import { getMatchHandler, normalizeMatch } from './match/matchTypes.js';
import {
  isEmptyArray,
  isFalse,
  isNull,
  omitReconstructibleDefaults,
} from './reconstructibleDefaults.js';

/**
 * Serialized ingredient-OPTION fields the `Ingredient` constructor rebuilds to EXACTLY this
 * value when the key is absent, so emitting them is pure payload weight (issue 1135).
 *
 * Option-level keys are the dominant term in a serialized recipe corpus, because they are
 * paid once per option, per group, per set, per recipe: an authored component option of 68
 * bytes was written as 213 — a 3.1x expansion made entirely of these defaults and one exact
 * duplicate. Ablating them is 19.66% of a simple corpus and 47.55% of a rich one.
 *
 * Absence is not a new on-disk state for any of them. `migrateEssencesToIngredientGroups`
 * has shipped options as bare `{quantity, match}` since 1.17.0, and
 * `IngredientSet._legacyIngredientsToGroups` writes the same shape, so every reader has
 * always had to cope with all seven keys missing.
 *
 * `componentId` is a CANONICAL field and is omitted only when it is `null`, which does not
 * weaken the canonical-write policy: the top-level field is DERIVED from `match` by the
 * constructor (`match.type === 'component' ? match.componentId : null`), the canonical
 * component reference is `match.componentId` and is always emitted, and a `null` here means
 * "this option is not a component match" — which absence says identically to every reader,
 * each of which coerces through `option.componentId || option.systemItemId`.
 *
 * **This is a hand-maintained mirror of the constructor**, guarded mechanically by
 * `tests/ingredient-serialization-payload.test.js`: every key here must be a key `toJSON`
 * can emit, must actually be omitted for a fully-defaulted option, and a defaulted option
 * must round-trip deep-equal through `fromJSON(toJSON(i))`.
 *
 * Deliberately ABSENT from this table:
 * - `match`, which is the option's authored requirement and its identity.
 * - `quantity`, whose `data.quantity || 1` default is omittable by the model but is read
 *   arithmetically off serialized options by shopping-list and consumption projections; it
 *   is a separate reader audit and is not part of issue 1135.
 *
 * @type {Record<string, (value: unknown) => boolean>}
 */
export const INGREDIENT_OMITTED_WHEN_DEFAULT = {
  componentId: isNull,
  itemUuid: isNull,
  tag: isNull,
  alternatives: isEmptyArray,
  extractEffects: isFalse,
  effectFilter: isNull,
};

export class Ingredient {
  constructor(data = {}) {
    this.quantity = data.quantity || 1;
    this.match = this._normalizeMatch(data);

    // componentId: resolved from match object or bare data field
    this.componentId = this.match?.type === 'component' ? this.match.componentId || null : null;

    // Legacy transitional alias
    this.systemItemId = this.componentId;

    this.itemUuid = data.itemUuid || null;
    this.tag = this.match?.type === 'tags' ? this.match.tags?.[0] || null : data.tag || null;

    this.alternatives = data.alternatives || []; // Array of Ingredient objects

    // Effect extraction settings
    this.extractEffects = data.extractEffects === undefined ? false : data.extractEffects;
    this.effectFilter = data.effectFilter || null; // Regex or array of effect names to extract
  }

  _normalizeMatch(data = {}) {
    return normalizeMatch(data);
  }

  /**
   * Check if a given item matches this ingredient requirement
   * @param {Item} item - The Foundry Item to check
   * @returns {boolean}
   */
  matches(item) {
    // Exact match by UUID
    if (this.itemUuid && item.uuid === this.itemUuid) return true;

    if (this.match?.type === 'tags') {
      const itemTags = getFabricateFlag(item, 'tags', []);
      const requiredTags = this.match.tags || [];
      const matched =
        this.match.tagMatch === 'all'
          ? requiredTags.every((tag) => itemTags.includes(tag))
          : requiredTags.some((tag) => itemTags.includes(tag));
      if (!matched) {
        return false;
      }
      return matched;
    }

    // Check alternatives
    return this.alternatives.some((alt) => alt.matches(item));
  }

  /**
   * Validate that this ingredient has all required data
   * @returns {{valid: boolean, errors: string[]}}
   */
  /**
   * Validate that this ingredient has all required data.
   * @param {{requireComplete?: boolean}} [options] - When `requireComplete` is
   *   false, the completeness checks (must carry a match rule / a tag) are waived
   *   so an unfinished authoring option still persists; structural checks (a
   *   positive quantity) always fire.
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate({ requireComplete = true } = {}) {
    const errors = [];

    // Completeness is computed INDEPENDENTLY of the per-type validation: the
    // shared "must include a match rule" error and the per-type tag/currency
    // errors STACK for an incomplete tags/currency match (an empty-tags option
    // yields BOTH messages). They are not mutually exclusive.
    const handler = getMatchHandler(this.match);
    const isComplete = handler.isComplete(this.match);

    if (requireComplete && !isComplete && !this.itemUuid) {
      errors.push('Ingredient must include a match rule or specific item UUID');
    }

    errors.push(...handler.validate(this.match, { requireComplete }));

    // A currency option carries its amount on the match, not the option quantity,
    // so quantity stays the default 1 and never needs validating for currency.
    if (typeof this.quantity !== 'number' || this.quantity <= 0) {
      errors.push('Ingredient quantity must be a positive number');
    }

    // Validate alternatives
    for (const alt of this.alternatives) {
      const altValidation = alt.validate({ requireComplete });
      if (!altValidation.valid) {
        errors.push(`Alternative ingredient: ${altValidation.errors.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get a simple description of this ingredient
   * @returns {string}
   */
  getDescription() {
    const quantity = this.quantity;
    if (this.match?.type === 'component' && this.match.componentId) {
      return getMatchHandler(this.match).describe(this.match, { quantity });
    }
    if (this.itemUuid) {
      return `${quantity}x specific item`;
    }
    if (
      this.match?.type === 'tags' &&
      Array.isArray(this.match.tags) &&
      this.match.tags.length > 0
    ) {
      return getMatchHandler(this.match).describe(this.match, { quantity });
    }
    // A currency alternative ("100 gp") describes its cost as an insufficient-currency
    // requirement so it surfaces sensibly in the engine's missing-items list and the
    // craftability display when it is the unaffordable representative of a group.
    if (this.match?.type === 'currency' && getMatchHandler(this.match).isComplete(this.match)) {
      const spend = getMatchHandler(this.match).getCurrencySpend(this.match);
      return `Insufficient currency. Requires ${spend.amount} ${spend.unit}.`;
    }
    // An essence alternative describes its amount requirement (e.g. "3x fire essence")
    // so it surfaces sensibly in the engine's missing-items list and the craftability
    // display when it is the unmet representative of a group.
    if (this.match?.type === 'essence' && getMatchHandler(this.match).isComplete(this.match)) {
      return getMatchHandler(this.match).describe(this.match);
    }
    if (this.alternatives.length > 0) {
      return `${quantity}x (${this.alternatives.length} alternatives)`;
    }
    return 'Unknown ingredient';
  }

  /**
   * Serialize this option, omitting every reconstructible default and the write-retired
   * `systemItemId` alias (issue 1135).
   *
   * `systemItemId` was a byte-for-byte duplicate of `componentId` on the same object, so it
   * never distinguished anything on the wire. It is WRITE-retired and READ permanently: the
   * instance property stays, and every read fallback in `match/matchTypes.js` stays, because
   * a world, an exported system file or third-party content authored before this change can
   * still carry the alias as its only component reference.
   *
   * @returns {Record<string, unknown>}
   */
  toJSON() {
    return omitReconstructibleDefaults(
      {
        match: this.match,
        componentId: this.componentId,
        itemUuid: this.itemUuid,
        quantity: this.quantity,
        tag: this.tag,
        alternatives: this.alternatives.map((alt) => alt.toJSON()),
        extractEffects: this.extractEffects,
        effectFilter: this.effectFilter,
      },
      INGREDIENT_OMITTED_WHEN_DEFAULT
    );
  }

  static fromJSON(data) {
    const ingredient = new Ingredient(data);
    if (data.alternatives) {
      ingredient.alternatives = data.alternatives.map((alt) => Ingredient.fromJSON(alt));
    }
    return ingredient;
  }
}
