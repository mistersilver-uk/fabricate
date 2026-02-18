/**
 * Represents an ingredient required for crafting
 * Supports both simple (exact item) and advanced (tag-based) matching
 */
import { getFabricateFlag } from '../config/flags.js';

export class Ingredient {
  constructor(data = {}) {
    this.quantity = data.quantity || 1;
    this.match = this._normalizeMatch(data);

    // Legacy fields retained for compatibility with existing editor and imports.
    this.systemItemId = this.match?.type === 'systemItem' ? (this.match.systemItemId || null) : null;
    this.itemUuid = data.itemUuid || null;
    this.tag = this.match?.type === 'tags' ? (this.match.tags?.[0] || null) : (data.tag || null);

    this.tier = data.tier || null; // e.g., "common", "rare", "legendary"
    this.alternatives = data.alternatives || []; // Array of Ingredient objects

    // Effect extraction settings
    this.extractEffects = data.extractEffects !== undefined ? data.extractEffects : false;
    this.effectFilter = data.effectFilter || null; // Regex or array of effect names to extract
  }

  _normalizeMatch(data = {}) {
    const raw = data.match && typeof data.match === 'object' ? data.match : null;
    if (raw) {
      if (raw.type === 'tags') {
        const tags = Array.isArray(raw.tags)
          ? raw.tags.map(t => String(t || '').trim()).filter(Boolean)
          : [];
        return {
          type: 'tags',
          tags,
          tagMatch: raw.tagMatch === 'all' ? 'all' : 'any'
        };
      }

      return {
        type: 'systemItem',
        systemItemId: raw.systemItemId || data.systemItemId || null
      };
    }

    if (data.systemItemId) {
      return {
        type: 'systemItem',
        systemItemId: data.systemItemId
      };
    }

    const tags = Array.isArray(data.tags)
      ? data.tags.map(t => String(t || '').trim()).filter(Boolean)
      : (data.tag ? [String(data.tag).trim()] : []);
    if (tags.length > 0) {
      return {
        type: 'tags',
        tags,
        tagMatch: data.tagMatch === 'all' ? 'all' : 'any'
      };
    }

    return null;
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
      const matched = this.match.tagMatch === 'all'
        ? requiredTags.every(tag => itemTags.includes(tag))
        : requiredTags.some(tag => itemTags.includes(tag));
      if (!matched) {
        return false;
      }

      if (this.tier) {
        const itemTier = getFabricateFlag(item, 'tier', null);
        return itemTier === this.tier;
      }
      return true;
    }

    // Check alternatives
    return this.alternatives.some(alt => alt.matches(item));
  }

  /**
   * Validate that this ingredient has all required data
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate() {
    const errors = [];
    const hasSystemItemMatch = this.match?.type === 'systemItem' && !!this.match.systemItemId;
    const hasTagMatch = this.match?.type === 'tags' && Array.isArray(this.match.tags) && this.match.tags.length > 0;

    if (!hasSystemItemMatch && !hasTagMatch && !this.itemUuid) {
      errors.push('Ingredient must include a match rule or specific item UUID');
    }

    if (this.match?.type === 'tags' && (!Array.isArray(this.match.tags) || this.match.tags.length === 0)) {
      errors.push('Tag-based ingredient match requires at least one tag');
    }

    if (typeof this.quantity !== 'number' || this.quantity <= 0) {
      errors.push('Ingredient quantity must be a positive number');
    }

    // Validate alternatives
    for (const alt of this.alternatives) {
      const altValidation = alt.validate();
      if (!altValidation.valid) {
        errors.push(`Alternative ingredient: ${altValidation.errors.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get a simple description of this ingredient
   * @returns {string}
   */
  getDescription() {
    if (this.match?.type === 'systemItem' && this.match.systemItemId) {
      return `${this.quantity}x managed item`;
    }
    if (this.itemUuid) {
      return `${this.quantity}x specific item`;
    }
    if (this.match?.type === 'tags' && Array.isArray(this.match.tags) && this.match.tags.length > 0) {
      const joined = this.match.tags.join(this.match.tagMatch === 'all' ? ' & ' : ' | ');
      const tierStr = this.tier ? ` (${this.tier})` : '';
      return `${this.quantity}x ${joined}${tierStr}`;
    }
    if (this.alternatives.length > 0) {
      return `${this.quantity}x (${this.alternatives.length} alternatives)`;
    }
    return 'Unknown ingredient';
  }

  toJSON() {
    return {
      match: this.match,
      systemItemId: this.systemItemId,
      itemUuid: this.itemUuid,
      quantity: this.quantity,
      tag: this.tag,
      tier: this.tier,
      alternatives: this.alternatives.map(alt => alt.toJSON()),
      extractEffects: this.extractEffects,
      effectFilter: this.effectFilter
    };
  }

  static fromJSON(data) {
    const ingredient = new Ingredient(data);
    if (data.alternatives) {
      ingredient.alternatives = data.alternatives.map(alt => Ingredient.fromJSON(alt));
    }
    return ingredient;
  }
}
