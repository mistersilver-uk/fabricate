/** One ingredient option, matched by component, tags, currency or essence. */
import { getFabricateFlag } from '../config/flags.js';

import { getMatchHandler, normalizeMatch } from './match/matchTypes.js';
import {
  isEmptyArray,
  isFalse,
  isNull,
  omitReconstructibleDefaults,
} from './reconstructibleDefaults.js';

/** Fields the constructor rebuilds exactly from absence (issue 1135). */
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

    this.componentId = this.match?.type === 'component' ? this.match.componentId || null : null;

    // Legacy transitional alias
    this.systemItemId = this.componentId;

    this.itemUuid = data.itemUuid || null;
    this.tag = this.match?.type === 'tags' ? this.match.tags?.[0] || null : data.tag || null;

    this.alternatives = data.alternatives || []; // Array of Ingredient objects

    this.extractEffects = data.extractEffects === undefined ? false : data.extractEffects;
    this.effectFilter = data.effectFilter || null; // Regex or array of effect names to extract
  }

  _normalizeMatch(data = {}) {
    return normalizeMatch(data);
  }

  matches(item) {
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

    return this.alternatives.some((alt) => alt.matches(item));
  }

  validate({ requireComplete = true } = {}) {
    const errors = [];

    // Independent of per-type validation, so an empty-tags option reports both errors.
    const handler = getMatchHandler(this.match);
    const isComplete = handler.isComplete(this.match);

    if (requireComplete && !isComplete && !this.itemUuid) {
      errors.push('Ingredient must include a match rule or specific item UUID');
    }

    errors.push(...handler.validate(this.match, { requireComplete }));

    // Currency carries its amount on the match, so its quantity is never validated.
    if (typeof this.quantity !== 'number' || this.quantity <= 0) {
      errors.push('Ingredient quantity must be a positive number');
    }

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
    // Read by the missing-items list when currency is a group's unaffordable representative.
    if (this.match?.type === 'currency' && getMatchHandler(this.match).isComplete(this.match)) {
      const spend = getMatchHandler(this.match).getCurrencySpend(this.match);
      return `Insufficient currency. Requires ${spend.amount} ${spend.unit}.`;
    }
    // An essence alternative describes its amount requirement (e.g.
    if (this.match?.type === 'essence' && getMatchHandler(this.match).isComplete(this.match)) {
      return getMatchHandler(this.match).describe(this.match);
    }
    if (this.alternatives.length > 0) {
      return `${quantity}x (${this.alternatives.length} alternatives)`;
    }
    return 'Unknown ingredient';
  }

  /** Omits reconstructible defaults and the write-retired `systemItemId` alias (issue 1135). */
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
