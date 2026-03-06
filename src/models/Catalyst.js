/**
 * Represents a catalyst (non-consumable component) required for crafting.
 *
 * Spec contract (002-data-models.md):
 *   componentId:        string        - required managed item reference
 *   degradesOnUse:      boolean       - whether usage is tracked on the owned item
 *   destroyWhenExhausted: boolean     - destroy the item when timesUsed >= maxUses
 *   maxUses:            number | null - null means unlimited
 *
 * Usage tracking is stored on the owned item instance via:
 *   Item.flags.fabricate.catalystItemUsage = { timesUsed: number }
 *
 * Legacy fields removed in T-002:
 *   mustBeEquipped, proximityRequired, qualityBonus, durabilityAttribute,
 *   degradeAmount, proximityDistance, qualityAttribute, itemUuid, tag,
 *   name, required, mustBeInInventory
 */
import { getFabricateFlag, setFabricateFlag } from '../config/flags.js';

export class Catalyst {
  constructor(data = {}) {
    /** @type {string|null} Managed item reference inside a crafting system */
    this.componentId = data.componentId || data.systemItemId || null;

    /** @type {boolean} Whether catalyst usage is tracked per owned item instance */
    this.degradesOnUse = data.degradesOnUse === true;

    /** @type {boolean} Destroy the owned item when timesUsed >= maxUses */
    this.destroyWhenExhausted = data.destroyWhenExhausted === true;

    /** @type {number|null} Maximum uses before the catalyst is exhausted; null = unlimited */
    this.maxUses = Number.isFinite(Number(data.maxUses)) && data.maxUses !== null
      ? Number(data.maxUses)
      : null;
  }

  /**
   * Validate the Catalyst against the spec contract.
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate() {
    const errors = [];

    if (!this.componentId) {
      errors.push('componentId is required');
    }

    if (this.degradesOnUse) {
      if (this.maxUses !== null && (!Number.isInteger(this.maxUses) || this.maxUses < 1)) {
        errors.push('maxUses must be a positive integer or null when degradesOnUse is enabled');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Serialize to a plain JSON-safe object containing only spec-defined fields.
   * Emits both componentId (primary) and systemItemId (transitional alias).
   * @returns {{ componentId: string|null, systemItemId: string|null, degradesOnUse: boolean, destroyWhenExhausted: boolean, maxUses: number|null }}
   */
  toJSON() {
    return {
      componentId: this.componentId,
      systemItemId: this.componentId,
      degradesOnUse: this.degradesOnUse,
      destroyWhenExhausted: this.destroyWhenExhausted,
      maxUses: this.maxUses,
    };
  }

  /**
   * Deserialize from a plain object.
   * Unrecognised (legacy) fields are silently ignored.
   * @param {object} data
   * @returns {Catalyst}
   */
  static fromJSON(data) {
    return new Catalyst({
      componentId: data.componentId || data.systemItemId,
      degradesOnUse: data.degradesOnUse,
      destroyWhenExhausted: data.destroyWhenExhausted,
      maxUses: data.maxUses,
    });
  }

  /**
   * Apply degradation (increment timesUsed) to an owned catalyst item after use.
   * Only acts when degradesOnUse is true.
   *
   * Legacy migration (T-006): If the spec-compliant `catalystItemUsage` flag is absent,
   * checks for the legacy `catalystUses` flag (a bare number written before T-002).
   * When found, the bare number is converted to `{ timesUsed: N }` and used as the
   * starting point. The legacy flag is left in place; subsequent calls will find the
   * new `catalystItemUsage` flag first and skip migration.
   *
   * Note on flag storage: `getFabricateFlag`/`setFabricateFlag` call
   * `document.getFlag('fabricate', 'fabricate.<key>')` due to a pre-existing
   * double-prefix in normalizeFlagKey. This is intentional for consistency.
   *
   * @param {Item} item - The owned Foundry Item instance
   */
  async applyDegradation(item) {
    if (!this.degradesOnUse) return;

    // Read current usage from the spec-compliant flag key.
    let usage = getFabricateFlag(item, 'catalystItemUsage', null);

    // If absent, check for the legacy catalystUses flag (a bare number).
    if (!usage) {
      const legacyUses = getFabricateFlag(item, 'catalystUses', null);
      if (legacyUses !== null && Number.isFinite(Number(legacyUses))) {
        usage = { timesUsed: Math.max(0, Math.floor(Number(legacyUses))) };
      } else {
        usage = { timesUsed: 0 };
      }
    }

    const timesUsed = Number(usage.timesUsed || 0) + 1;
    await setFabricateFlag(item, 'catalystItemUsage', { timesUsed });

    if (this.destroyWhenExhausted && this.maxUses !== null && timesUsed >= this.maxUses) {
      await item.delete();
    }
  }
}
