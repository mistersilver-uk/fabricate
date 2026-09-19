/**
 * The system-owned library Tool normalizers (issue 1713): free pure functions the
 * `CraftingSystemManager` delegates to, so a Tool from any origin loads the same persisted shape.
 * Internal to that aggregate — a private continuation of the `_normalizeSystem` chokepoint, reached
 * only through the manager, so nothing else imports it.
 */
import { Tool, TOOL_BREAKAGE_MODES as TOOL_BREAKAGE_MODE_LIST } from '../../models/Tool.js';

// Membership sets derived from the canonical Tool model vocabularies, so the
// system-owned tool normalizer enforces the exact same enumerations as the Tool
// model and the adminStore editor without duplicating the literal lists.
const TOOL_BREAKAGE_MODES = new Set(TOOL_BREAKAGE_MODE_LIST);

/** Normalize one system-owned library Tool to its canonical persisted shape — the single
 * coercion point, so a Tool from any origin loads the same. A missing `id` gets a fresh
 * `randomID()` and `enabled` defaults to `true`. */
export function normalizeTool(tool = {}, { validPrerequisiteIds = null } = {}) {
  const normalizedTool = !tool || typeof tool !== 'object' ? {} : tool;
  const id = String(normalizedTool.id || foundry.utils.randomID());
  // `label` is the PRE-EXISTING, user-authored display override — distinct from the
  // `name`/`img` display snapshot below and NEVER written by snapshot capture,
  // migration, or refresh (issue 561, R2-2). Preserved untouched here.
  const label = typeof normalizedTool.label === 'string' ? normalizedTool.label.trim() : '';
  const componentId =
    typeof normalizedTool.componentId === 'string' && normalizedTool.componentId.trim()
      ? normalizedTool.componentId.trim()
      : null;
  // First-class tool source refs plus the `name`/`img` display snapshot (issue 561). Unknown-
  // field stripping means these MUST be retained here and in the draft-path twin, or they are
  // silently dropped. New-name-first, legacy-name-tolerant (issue 560).
  const originItemUuid =
    normalizedTool.originItemUuid ||
    normalizedTool.registeredItemUuid ||
    normalizedTool.sourceItemUuid ||
    normalizedTool.sourceUuid ||
    null;
  const registeredItemUuid =
    normalizedTool.registeredItemUuid ||
    normalizedTool.originItemUuid ||
    normalizedTool.sourceUuid ||
    normalizedTool.sourceItemUuid ||
    null;
  const primaryRefs = new Set(
    [registeredItemUuid, originItemUuid].filter((ref) => typeof ref === 'string' && ref.trim())
  );
  const rawAliasItemUuids = Array.isArray(normalizedTool.aliasItemUuids)
    ? normalizedTool.aliasItemUuids
    : Array.isArray(normalizedTool.fallbackItemIds)
      ? normalizedTool.fallbackItemIds
      : null;
  const aliasItemUuids = Array.isArray(rawAliasItemUuids)
    ? [
        ...new Set(
          rawAliasItemUuids
            .filter((ref) => typeof ref === 'string')
            .map((ref) => ref.trim())
            .filter((ref) => ref && !primaryRefs.has(ref))
        ),
      ]
    : [];
  const model = new Tool({
    ...normalizedTool,
    id,
    label,
    componentId,
    registeredItemUuid,
    originItemUuid,
    aliasItemUuids,
    prerequisites: normalizeToolPrerequisites(normalizedTool.prerequisites, validPrerequisiteIds),
  });
  return model.toJSON();
}

export function normalizeToolPrerequisites(input, validIds = null) {
  const source = input && typeof input === 'object' ? input : {};
  const ids = [
    ...new Set(
      (Array.isArray(source.ids) ? source.ids : [])
        .filter((id) => typeof id === 'string')
        .map((id) => id.trim())
        .filter((id) => id && (!(validIds instanceof Set) || validIds.has(id)))
    ),
  ];
  return {
    enabled: source.enabled === true && ids.length > 0,
    ids,
    gateMode: source.gateMode === 'bonus' ? 'bonus' : 'usability',
  };
}

export function normalizeToolRequirement(input) {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object') return null;
  return {
    formula: typeof input.formula === 'string' ? input.formula : '',
  };
}

export function normalizeToolBreakage(input) {
  if (input?.mode === 'immune') return { mode: 'limitedUses', maxUses: null };
  const mode = TOOL_BREAKAGE_MODES.has(input?.mode) ? input.mode : 'limitedUses';
  if (mode === 'limitedUses') {
    const raw = input?.maxUses;
    let maxUses = null;
    if (raw !== null && raw !== undefined && raw !== '') {
      const numeric = Number(raw);
      maxUses = Number.isFinite(numeric) ? numeric : null;
    }
    return { mode, maxUses };
  }
  if (mode === 'breakageChance') {
    const raw = Number(input?.breakageChance);
    return { mode, breakageChance: Number.isFinite(raw) ? raw : 0 };
  }
  const threshold = Number(input?.threshold);
  return {
    mode,
    formula: typeof input?.formula === 'string' ? input.formula : '',
    threshold: Number.isFinite(threshold) ? threshold : 0,
  };
}

export function normalizeToolOnBreak(input) {
  return new Tool({ componentId: '_normalizer_', onBreak: input }).onBreak;
}
