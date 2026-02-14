/**
 * Represents a catalyst (non-consumable component) required for crafting
 * Examples: forge, alchemy lab, specific tools
 */
export class Catalyst {
  constructor(data = {}) {
    // Managed item reference inside a crafting system
    this.systemItemId = data.systemItemId || null;

    // Catalyst identification by Foundry Source UUID (core.sourceId flag)
    this.itemUuid = data.itemUuid || null;
    this.tag = data.tag || null; // Tag-based matching (e.g., "tool:forge")
    this.name = data.name || 'Unknown Catalyst';

    // Catalyst settings
    this.required = data.required !== undefined ? data.required : true;
    this.mustBeEquipped = data.mustBeEquipped || false;
    this.mustBeInInventory = data.mustBeInInventory !== undefined ? data.mustBeInInventory : true;
    this.proximityRequired = data.proximityRequired || false; // For placed items like forges
    this.proximityDistance = data.proximityDistance || 5; // In grid units

    // Durability (optional)
    this.degradesOnUse = data.degradesOnUse || false;
    this.degradeAmount = data.degradeAmount || 1;
    this.durabilityAttribute = data.durabilityAttribute || 'system.durability'; // Path to durability value

    // Quality affects output (optional)
    this.qualityBonus = data.qualityBonus || false;
    this.qualityAttribute = data.qualityAttribute || 'system.quality';
  }

  /**
   * Check if a given item matches this catalyst requirement
   * @param {Item} item - The Foundry Item to check
   * @returns {boolean}
   */
  matches(item) {
    // Exact match by UUID
    if (this.itemUuid && item.uuid === this.itemUuid) return true;

    // Tag-based matching
    if (this.tag) {
      const itemTags = item.getFlag('fabricate-v2', 'tags') || [];
      return itemTags.includes(this.tag);
    }

    return false;
  }

  /**
   * Validate that the catalyst is available for the given actor
   * @param {Actor} actor - The actor attempting to craft
   * @param {Scene} scene - The current scene (for proximity checks)
   * @returns {{valid: boolean, message: string}}
   */
  async validate(actor, scene = null) {
    const items = actor.items.filter(item => this.matches(item));

    if (items.length === 0) {
      return { valid: false, message: `Missing required catalyst: ${this.name}` };
    }

    const item = items[0];

    // Check if must be equipped
    if (this.mustBeEquipped) {
      const isEquipped = item.system.equipped === true;
      if (!isEquipped) {
        return { valid: false, message: `${this.name} must be equipped` };
      }
    }

    // Check proximity for placed items
    if (this.proximityRequired && scene) {
      // This would need actual implementation based on Foundry's token system
      // For now, we'll assume it's valid
      // TODO: Implement proximity checking for placed catalyst items
    }

    // Check durability if applicable
    if (this.degradesOnUse && this.durabilityAttribute) {
      const durability = foundry.utils.getProperty(item, this.durabilityAttribute);
      if (durability !== undefined && durability <= 0) {
        return { valid: false, message: `${this.name} is broken and cannot be used` };
      }
    }

    return { valid: true, item };
  }

  /**
   * Apply degradation to the catalyst after use
   * @param {Item} item - The catalyst item to degrade
   */
  async applyDegradation(item) {
    if (!this.degradesOnUse || !this.durabilityAttribute) return;

    const currentDurability = foundry.utils.getProperty(item, this.durabilityAttribute);
    if (currentDurability === undefined) return;

    const newDurability = Math.max(0, currentDurability - this.degradeAmount);
    await item.update({ [this.durabilityAttribute]: newDurability });
  }

  /**
   * Get the quality bonus from this catalyst
   * @param {Item} item - The catalyst item
   * @returns {number}
   */
  getQualityBonus(item) {
    if (!this.qualityBonus || !this.qualityAttribute) return 0;

    const quality = foundry.utils.getProperty(item, this.qualityAttribute);
    return quality || 0;
  }

  toJSON() {
    return {
      systemItemId: this.systemItemId,
      itemUuid: this.itemUuid,
      tag: this.tag,
      name: this.name,
      required: this.required,
      mustBeEquipped: this.mustBeEquipped,
      mustBeInInventory: this.mustBeInInventory,
      proximityRequired: this.proximityRequired,
      proximityDistance: this.proximityDistance,
      degradesOnUse: this.degradesOnUse,
      degradeAmount: this.degradeAmount,
      durabilityAttribute: this.durabilityAttribute,
      qualityBonus: this.qualityBonus,
      qualityAttribute: this.qualityAttribute
    };
  }

  static fromJSON(data) {
    return new Catalyst(data);
  }
}
