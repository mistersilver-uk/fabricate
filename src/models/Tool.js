/**
 * Represents a tool required to attempt a gathering task.
 *
 * Spec contract (002-data-models.md, gathering-and-harvesting):
 *   componentId:       string                 - required managed item reference
 *   requirement:       null | {               - optional truthy-expression gate
 *     provider:        'dnd5e'|'pf2e'|'macro',
 *     formula?:        string,                  // when provider !== 'macro'
 *     macroUuid?:      string                   // when provider === 'macro'
 *   }
 *   breakage:          { mode, ...mode-specific fields }
 *     mode === 'limitedUses':     maxUses:        number | null     (null = unlimited; usage tracked on the item)
 *     mode === 'breakageChance':  breakageChance: number (integer 0..100)
 *     mode === 'diceExpression':  formula:        string (Foundry roll), threshold: number
 *   onBreak:           { mode, ...mode-specific fields }
 *     mode === 'destroy':       (no fields)
 *     mode === 'flagBroken':    (no fields)
 *     mode === 'replaceWith':   replacementComponentId: string (must != componentId)
 *
 * Item-flag conventions:
 *   Item.flags.fabricate.toolUsage  = { timesUsed: number }   // limitedUses only
 *   Item.flags.fabricate.toolBroken = true                    // set by the flagBroken on-break action
 */
import { getFabricateFlag, setFabricateFlag } from '../config/flags.js';

const BREAKAGE_MODES = new Set(['limitedUses', 'breakageChance', 'diceExpression']);
const ON_BREAK_MODES = new Set(['destroy', 'flagBroken', 'replaceWith']);
const REQUIREMENT_PROVIDERS = new Set(['dnd5e', 'pf2e', 'macro']);

function coerceMaxUses(value) {
  if ([null, undefined, ''].includes(value)) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function coerceBreakageChance(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function coerceThreshold(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeRequirement(input) {
  if (!input || typeof input !== 'object') return null;
  const provider = REQUIREMENT_PROVIDERS.has(input.provider) ? input.provider : 'dnd5e';
  const formula = typeof input.formula === 'string' ? input.formula : '';
  const macroUuid = typeof input.macroUuid === 'string' ? input.macroUuid : '';
  return { provider, formula, macroUuid };
}

function normalizeBreakage(input) {
  const mode = BREAKAGE_MODES.has(input?.mode) ? input.mode : 'limitedUses';
  const out = { mode };
  switch (mode) {
    case 'limitedUses': {
      out.maxUses = coerceMaxUses(input?.maxUses);

      break;
    }
    case 'breakageChance': {
      out.breakageChance = coerceBreakageChance(input?.breakageChance);

      break;
    }
    case 'diceExpression': {
      out.formula = typeof input?.formula === 'string' ? input.formula : '';
      out.threshold = coerceThreshold(input?.threshold);

      break;
    }
    // No default
  }
  return out;
}

function normalizeOnBreak(input) {
  const mode = ON_BREAK_MODES.has(input?.mode) ? input.mode : 'destroy';
  const out = { mode };
  if (mode === 'replaceWith') {
    out.replacementComponentId =
      typeof input?.replacementComponentId === 'string' ? input.replacementComponentId : null;
  }
  return out;
}

export class Tool {
  constructor(data = {}) {
    /** @type {string|null} Managed item reference inside a crafting system */
    this.componentId =
      typeof data.componentId === 'string' && data.componentId ? data.componentId : null;

    /** @type {{provider: string, formula: string, macroUuid: string}|null} Optional truthy-expression gate */
    this.requirement =
      data.requirement === null || data.requirement === undefined
        ? null
        : normalizeRequirement(data.requirement);

    /** @type {{mode: string, [key: string]: any}} Breakage mechanic configuration */
    this.breakage = normalizeBreakage(data.breakage);

    /** @type {{mode: string, [key: string]: any}} On-break action configuration */
    this.onBreak = normalizeOnBreak(data.onBreak);
  }

  /**
   * Validate the Tool against the spec contract.
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate() {
    const errors = [];

    if (!this.componentId) {
      errors.push('componentId is required');
    }

    if (this.requirement) {
      if (!REQUIREMENT_PROVIDERS.has(this.requirement.provider)) {
        errors.push('requirement.provider must be one of dnd5e, pf2e, or macro');
      } else if (this.requirement.provider === 'macro') {
        if (!this.requirement.macroUuid) {
          errors.push('requirement.macroUuid is required when provider is macro');
        }
      } else if (!this.requirement.formula) {
        errors.push('requirement.formula is required for system providers');
      }
    }

    if (BREAKAGE_MODES.has(this.breakage.mode)) {
      switch (this.breakage.mode) {
        case 'limitedUses': {
          if (
            this.breakage.maxUses !== null &&
            (!Number.isInteger(this.breakage.maxUses) || this.breakage.maxUses < 1)
          ) {
            errors.push('breakage.maxUses must be null or a positive integer');
          }

          break;
        }
        case 'breakageChance': {
          const value = this.breakage.breakageChance;
          if (!Number.isInteger(value) || value < 0 || value > 100) {
            errors.push('breakage.breakageChance must be an integer between 0 and 100');
          }

          break;
        }
        case 'diceExpression': {
          if (!this.breakage.formula) {
            errors.push('breakage.formula is required for diceExpression mode');
          }
          if (!Number.isFinite(this.breakage.threshold)) {
            errors.push('breakage.threshold must be a finite number');
          }

          break;
        }
        // No default
      }
    } else {
      errors.push('breakage.mode must be one of limitedUses, breakageChance, or diceExpression');
    }

    if (!ON_BREAK_MODES.has(this.onBreak.mode)) {
      errors.push('onBreak.mode must be one of destroy, flagBroken, or replaceWith');
    } else if (this.onBreak.mode === 'replaceWith') {
      if (!this.onBreak.replacementComponentId) {
        errors.push('onBreak.replacementComponentId is required for replaceWith mode');
      } else if (this.onBreak.replacementComponentId === this.componentId) {
        errors.push('onBreak.replacementComponentId must differ from componentId');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Serialize to a plain JSON-safe object containing only spec-defined fields.
   */
  toJSON() {
    return {
      componentId: this.componentId,
      requirement: this.requirement ? { ...this.requirement } : null,
      breakage: { ...this.breakage },
      onBreak: { ...this.onBreak },
    };
  }

  /**
   * Deserialize from a plain object. Unknown fields are silently ignored.
   * @param {object} data
   * @returns {Tool}
   */
  static fromJSON(data) {
    return new Tool(data);
  }

  /**
   * Decide whether the tool breaks this attempt.
   *
   * The decision is pure (no side effects) given the injected `random` and
   * `evaluateExpression`. For `limitedUses` mode the caller is expected to
   * have already incremented the item's usage counter via {@link applyUsage}
   * before calling this method, so the comparison uses the post-increment
   * `timesUsed` value.
   *
   * @param {object} params
   * @param {object} [params.actor]
   * @param {object} [params.item]                  - owned Foundry Item (for limitedUses)
   * @param {Function} [params.evaluateExpression]  - async ({expression, actor, kind}) => number|boolean
   * @param {Function} [params.random]              - () => number in [0, 1); defaults to Math.random
   * @returns {Promise<{ broken: boolean, mode: string, evidence: object }>}
   */
  async evaluateBreakage({ actor, item, evaluateExpression, random } = {}) {
    const mode = this.breakage.mode;

    if (mode === 'limitedUses') {
      // Prefer the authoritative `toolUsage` flag; fall back to the legacy catalyst usage
      // flag (`catalystItemUsage`) so items already degraded as catalysts keep their used
      // count after the 0.6.0 Catalyst→Tool migration. Writes always go to `toolUsage`.
      const usage = getFabricateFlag(item, 'toolUsage', null) ||
        getFabricateFlag(item, 'catalystItemUsage', null) || { timesUsed: 0 };
      const timesUsed = Number(usage?.timesUsed || 0);
      const maxUses = this.breakage.maxUses;
      const broken = maxUses !== null && Number.isFinite(maxUses) && timesUsed >= maxUses;
      return { broken, mode, evidence: { timesUsed, maxUses } };
    }

    if (mode === 'breakageChance') {
      const rng = typeof random === 'function' ? random : Math.random;
      const roll = rng() * 100;
      const broken = roll < this.breakage.breakageChance;
      return { broken, mode, evidence: { roll, breakageChance: this.breakage.breakageChance } };
    }

    if (mode === 'diceExpression') {
      let raw = null;
      if (typeof evaluateExpression === 'function') {
        raw = await evaluateExpression({
          expression: this.breakage.formula,
          actor,
          kind: 'toolBreakage',
        });
      }
      const numeric = raw === null || raw === undefined ? null : Number(raw);
      const finite = numeric !== null && Number.isFinite(numeric);
      const broken = finite && numeric < this.breakage.threshold;
      return {
        broken,
        mode,
        evidence: {
          formula: this.breakage.formula,
          threshold: this.breakage.threshold,
          result: finite ? numeric : null,
        },
      };
    }

    return { broken: false, mode, evidence: {} };
  }

  /**
   * Increment the usage counter on an owned tool item. Only meaningful for the
   * `limitedUses` mode; a no-op for the other two modes which do not persist
   * state on the item.
   *
   * @param {Item} item - The owned Foundry Item instance
   */
  async applyUsage(item) {
    if (this.breakage.mode !== 'limitedUses') return;

    // Seed from `toolUsage`, falling back to the legacy `catalystItemUsage` so the very
    // first post-migration write continues the catalyst-era count rather than resetting it.
    // The result is always written to `toolUsage` (authoritative); the legacy flag is left
    // in place (idempotent — once `toolUsage` exists, the fallback is never re-entered).
    const current = getFabricateFlag(item, 'toolUsage', null) ||
      getFabricateFlag(item, 'catalystItemUsage', null) || { timesUsed: 0 };
    const timesUsed = Number(current?.timesUsed || 0) + 1;
    await setFabricateFlag(item, 'toolUsage', { timesUsed });
  }

  /**
   * Apply the configured on-break action to an owned tool item.
   *
   * @param {object} params
   * @param {Item} params.item                                       - The owned Foundry Item to act on
   * @param {object} [params.actor]                                  - Actor that owned the item
   * @param {Function} [params.createReplacement]                    - async ({ actor, componentId }) => void
   */
  async applyBreakage({ item, actor, createReplacement } = {}) {
    const mode = this.onBreak.mode;

    if (mode === 'destroy') {
      if (item && typeof item.delete === 'function') {
        await item.delete();
      }
      return { action: 'destroyed' };
    }

    if (mode === 'flagBroken') {
      await setFabricateFlag(item, 'toolBroken', true);
      return { action: 'flagged' };
    }

    if (mode === 'replaceWith') {
      const replacementComponentId = this.onBreak.replacementComponentId;
      if (item && typeof item.delete === 'function') {
        await item.delete();
      }
      if (typeof createReplacement === 'function' && replacementComponentId) {
        await createReplacement({ actor, componentId: replacementComponentId });
      }
      return { action: 'replaced', replacementComponentId };
    }

    return { action: 'none' };
  }
}

export const TOOL_BREAKAGE_MODES = [...BREAKAGE_MODES];
export const TOOL_ON_BREAK_MODES = [...ON_BREAK_MODES];
export const TOOL_REQUIREMENT_PROVIDERS = [...REQUIREMENT_PROVIDERS];
