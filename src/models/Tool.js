/**
 * Represents a tool required to attempt a gathering task.
 *
 * Spec contract (data-models/spec.md, gathering-and-harvesting):
 *   componentId:       string | null          - OPTIONAL managed-component link (issue 561);
 *                                               null for a first-class tool registered from an
 *                                               Item uuid, populated for a whetstone or a
 *                                               migrated legacy tool (no longer the matching basis)
 *   name / img:        string | null          - registration/migration display snapshot (issue 561);
 *                                               NOT `label`, and not auto-refreshed on rename
 *   registeredItemUuid /
 *   originItemUuid /
 *   aliasItemUuids:   string / string[]      - the tool's OWN source references (issue 561), the
 *                                               matching basis; a valid tool carries EITHER a
 *                                               componentId OR its own source references
 *   requirement:       null | {               - optional truthy-expression gate
 *     formula:         string                   // dice/roll expression
 *   }
 *   breakage:          { mode, ...mode-specific fields }
 *     mode === 'limitedUses':     maxUses:        number | null     (null = unlimited; usage tracked on the item)
 *     mode === 'breakageChance':  breakageChance: number (integer 0..100)
 *     mode === 'diceExpression':  formula:        string (Foundry roll), threshold: number
 *   checkBreakable:    boolean                    separate check-driven immunity switch
 *   onBreak:           { mode, ...mode-specific fields }
 *     mode === 'destroy':       (no fields)
 *     mode === 'flagBroken':    (no fields)
 *     mode === 'replaceWith':   replacementTarget: { type: 'component', componentId }
 *                                | { type: 'item', itemUuid }
 *
 * Item-flag conventions:
 *   Item.flags.fabricate.toolUsage  = { timesUsed: number }   // limitedUses only
 *   Item.flags.fabricate.toolBroken = true                    // set by the flagBroken on-break action
 *
 * The flagBroken on-break action also appends a localized " (broken)" suffix to the
 * owned item's display name. The append is idempotent: the suffix is never doubled, and it is
 * never appended to an item that was already toolBroken-flagged before the action fired. The
 * suffix is display-only. The toolBroken flag, not the name, remains the authoritative
 * presence-gate disqualifier. Note: a component matched purely by name (no registeredItemUuid/fallback
 * ids) stops matching its component once renamed, so a GM clearing the toolBroken flag must also
 * restore the original name to regain damaged-tier recognition.
 */
import { getFabricateFlag, setFabricateFlag } from '../config/flags.js';

import { IngredientGroup } from './IngredientGroup.js';

const BREAKAGE_MODES = new Set(['limitedUses', 'breakageChance', 'diceExpression']);
const ON_BREAK_MODES = new Set(['destroy', 'flagBroken', 'replaceWith']);
const PREREQUISITE_GATE_MODES = new Set(['bonus', 'usability']);
const REPLACEMENT_TARGET_TYPES = new Set(['component', 'item']);

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
  const formula = typeof input.formula === 'string' ? input.formula : '';
  return { formula };
}

function normalizeIdList(values) {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .filter((value) => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ];
}

function normalizePrerequisites(input) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    enabled: source.enabled === true,
    ids: normalizeIdList(source.ids),
    gateMode: PREREQUISITE_GATE_MODES.has(source.gateMode) ? source.gateMode : 'usability',
  };
}

function normalizeBonus(input) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    enabled: source.enabled === true,
    expression: typeof source.expression === 'string' ? source.expression.trim() : '',
  };
}

function normalizeBreakage(input) {
  if (input?.mode === 'immune') {
    return { mode: 'limitedUses', maxUses: null };
  }
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

function normalizeReplacementTarget(input) {
  if (!input || typeof input !== 'object') return null;
  if (!REPLACEMENT_TARGET_TYPES.has(input.type)) return null;
  const hasComponentId = typeof input.componentId === 'string' && !!input.componentId.trim();
  const hasItemUuid = typeof input.itemUuid === 'string' && !!input.itemUuid.trim();
  if (hasComponentId === hasItemUuid) return null;
  if (input.type === 'component') {
    return hasComponentId ? { type: 'component', componentId: input.componentId.trim() } : null;
  }
  return hasItemUuid ? { type: 'item', itemUuid: input.itemUuid.trim() } : null;
}

function normalizeOnBreak(input) {
  const mode = ON_BREAK_MODES.has(input?.mode) ? input.mode : 'destroy';
  const out = { mode };
  if (mode === 'replaceWith') {
    const legacyComponentId =
      typeof input?.replacementComponentId === 'string' ? input.replacementComponentId.trim() : '';
    out.replacementTarget =
      normalizeReplacementTarget(input?.replacementTarget) ||
      (legacyComponentId ? { type: 'component', componentId: legacyComponentId } : null);
  }
  return out;
}

function normalizeRepairRequirements(input) {
  if (!Array.isArray(input)) return [];
  return input.map((group) =>
    group instanceof IngredientGroup ? group : IngredientGroup.fromJSON(group)
  );
}

export class Tool {
  constructor(data = {}) {
    this.id = typeof data.id === 'string' && data.id.trim() ? data.id.trim() : null;
    this.enabled = data.enabled !== false;
    /**
     * @type {string|null} OPTIONAL managed-component link (issue 561). A first-class
     * tool registered from an Item uuid carries `componentId: null` and its own source
     * references. A whetstone (also a component) or a tool migrated from a legacy
     * componentId-tool keeps `componentId` populated for `onBreak.replaceWith` resolution
     * and the UI's linked-component display, but it is no longer the matching basis.
     */
    this.componentId =
      typeof data.componentId === 'string' && data.componentId ? data.componentId : null;

    /**
     * @type {string} OPTIONAL, pre-existing, USER-authored display label override. A
     * distinct field — NOT part of the registration/migration display snapshot below,
     * which is `name` + `img` only. Never written by snapshot capture, migration, or any
     * refresh, so a GM's authored label is never clobbered.
     */
    this.label = typeof data.label === 'string' ? data.label : '';

    /**
     * @type {string|null} Display-snapshot name captured at registration/migration
     * (issue 561). NOT auto-refreshed on source-Item rename (recipe-item parity). Used as
     * the presence name-fallback string and the UI display source for an item-sourced tool.
     */
    this.name = typeof data.name === 'string' && data.name ? data.name : null;

    /** @type {string|null} Display-snapshot image, captured with {@link Tool#name}. */
    this.img = typeof data.img === 'string' && data.img ? data.img : null;

    /** @type {string} Display-snapshot description captured with name/image. */
    this.description = typeof data.description === 'string' ? data.description : '';

    /** @type {string|null} The tool's own registered source document uuid. */
    this.registeredItemUuid =
      typeof data.registeredItemUuid === 'string' && data.registeredItemUuid
        ? data.registeredItemUuid
        : null;

    /** @type {string|null} The tool's own canonical/compendium source uuid. */
    this.originItemUuid =
      typeof data.originItemUuid === 'string' && data.originItemUuid ? data.originItemUuid : null;

    /** @type {string[]} Additional source references for runtime matching. */
    this.aliasItemUuids = Array.isArray(data.aliasItemUuids)
      ? [
          ...new Set(
            data.aliasItemUuids
              .filter((id) => typeof id === 'string')
              .map((id) => id.trim())
              .filter(Boolean)
          ),
        ]
      : [];

    /** @type {{formula: string}|null} Optional truthy-expression gate */
    this.requirement =
      data.requirement === null || data.requirement === undefined
        ? null
        : normalizeRequirement(data.requirement);

    /** @type {{enabled: boolean, ids: string[], gateMode: 'bonus'|'usability'}} */
    this.prerequisites = normalizePrerequisites(data.prerequisites);

    /** @type {{enabled: boolean, expression: string}} */
    this.bonus = normalizeBonus(data.bonus);

    /** @type {{mode: string, [key: string]: any}} Breakage mechanic configuration */
    this.breakage = normalizeBreakage(data.breakage);

    // Legacy `immune` was overloaded across both breakage authorities. Read it forward
    // without erasing the safe tool-specific configuration; canonical writes never emit it.
    this.checkBreakable = data.breakage?.mode === 'immune' ? false : data.checkBreakable !== false;

    /** @type {{mode: string, [key: string]: any}} On-break action configuration */
    this.onBreak = normalizeOnBreak(data.onBreak);

    /** @type {IngredientGroup[]} Authoring-only materials required to repair a flagged copy. */
    this.repairRequirements = normalizeRepairRequirements(data.repairRequirements);
  }

  dispName(fallback = 'Untitled tool') {
    return this.label.trim() || this.name || fallback;
  }

  /**
   * Validate the Tool against the spec contract.
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate() {
    const errors = [];

    // A first-class tool is valid with EITHER a managed-component link (`componentId`)
    // OR its own source references (`registeredItemUuid`/`originItemUuid`); a tool with NEITHER
    // cannot be matched, so it is invalid (issue 561).
    const hasSourceRefs = !!(this.registeredItemUuid || this.originItemUuid);
    if (!this.componentId && !hasSourceRefs) {
      errors.push('a tool requires either a componentId or its own source references');
    }

    if (this.requirement && !this.requirement.formula) {
      errors.push('requirement.formula is required');
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
      const target = this.onBreak.replacementTarget;
      if (!target) {
        errors.push('onBreak.replacementTarget is required for replaceWith mode');
      } else if (
        target.type === 'component' &&
        this.componentId &&
        target.componentId === this.componentId
      ) {
        // Only meaningful when the tool HAS a componentId; a null-component (item-sourced)
        // tool can never collide with its own component id, so the differ-check is skipped.
        errors.push('onBreak.replacementTarget componentId must differ from componentId');
      }
    }

    if (this.prerequisites.enabled && this.prerequisites.ids.length === 0) {
      errors.push('prerequisites.ids must include at least one shared prerequisite when enabled');
    }
    if (this.bonus.enabled && !this.bonus.expression) {
      errors.push('bonus.expression is required when bonus is enabled');
    }
    for (const [index, group] of this.repairRequirements.entries()) {
      const result = group.validate({ requireComplete: true });
      if (!result.valid) {
        errors.push(...result.errors.map((error) => `repairRequirements[${index}]: ${error}`));
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Serialize to a plain JSON-safe object containing only spec-defined fields.
   */
  toJSON() {
    return {
      ...(this.id && { id: this.id }),
      enabled: this.enabled,
      componentId: this.componentId,
      label: this.label,
      name: this.name,
      img: this.img,
      description: this.description,
      registeredItemUuid: this.registeredItemUuid,
      originItemUuid: this.originItemUuid,
      aliasItemUuids: [...this.aliasItemUuids],
      requirement: this.requirement ? { ...this.requirement } : null,
      prerequisites: { ...this.prerequisites, ids: [...this.prerequisites.ids] },
      bonus: { ...this.bonus },
      breakage: { ...this.breakage },
      checkBreakable: this.checkBreakable,
      onBreak: {
        ...this.onBreak,
        ...(this.onBreak.replacementTarget && {
          replacementTarget: { ...this.onBreak.replacementTarget },
        }),
      },
      repairRequirements: this.repairRequirements.map((group) => group.toJSON()),
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
   * For the `flagBroken` action, in addition to setting the `toolBroken` flag, a localized
   * " (broken)" suffix is appended to the item's display name. The append is idempotent: it is
   * skipped when the item was already broken-flagged before this call or when the name already
   * ends with the suffix. The suffix is display-only. The flag remains the authoritative
   * presence-gate disqualifier. A component matched purely by name (no registeredItemUuid/fallback ids)
   * stops matching its component once renamed, so a GM clearing the flag must also restore the name.
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
      const wasBroken = getFabricateFlag(item, 'toolBroken', false);
      await setFabricateFlag(item, 'toolBroken', true);
      const suffix =
        globalThis.game?.i18n?.localize?.('FABRICATE.Tool.BrokenNameSuffix') || ' (broken)';
      if (
        typeof item?.update === 'function' &&
        typeof item?.name === 'string' &&
        item.name &&
        !wasBroken &&
        !item.name.endsWith(suffix)
      ) {
        await item.update({ name: `${item.name}${suffix}` });
      }
      return { action: 'flagged' };
    }

    if (mode === 'replaceWith') {
      const replacementTarget = this.onBreak.replacementTarget;
      if (!replacementTarget || typeof createReplacement !== 'function') {
        return { action: 'none' };
      }
      const created = await createReplacement({ actor, target: { ...replacementTarget } });
      const succeeded =
        created === true || created?.success === true || created?.documentName === 'Item';
      if (!succeeded) return { action: 'none' };
      if (item && typeof item.delete === 'function') await item.delete();
      return {
        action: 'replaced',
        replacementTarget: { ...replacementTarget },
        ...(replacementTarget.type === 'component' && {
          replacementComponentId: replacementTarget.componentId,
        }),
      };
    }

    return { action: 'none' };
  }
}

export const TOOL_BREAKAGE_MODES = [...BREAKAGE_MODES];
export const TOOL_ON_BREAK_MODES = [...ON_BREAK_MODES];
