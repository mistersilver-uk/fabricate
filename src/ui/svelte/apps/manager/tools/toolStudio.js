import { getMatchHandler } from '../../../../../models/match/matchTypes.js';

const DEFAULT_TOOL_IMAGE = 'icons/svg/item-bag.svg';

function managedItemFor(tool, managedItems = []) {
  if (!tool?.componentId) return null;
  return managedItems.find((item) => String(item.id) === String(tool.componentId)) || null;
}

export function toolDisplayName(tool, managedItems = [], fallback = 'Untitled tool') {
  return String(tool?.label || '').trim() || tool?.name || managedItemFor(tool, managedItems)?.name || fallback;
}

export function toolDisplayImage(tool, managedItems = []) {
  return tool?.img || managedItemFor(tool, managedItems)?.img || DEFAULT_TOOL_IMAGE;
}

export function toolDescription(tool, managedItems = []) {
  return String(tool?.description || managedItemFor(tool, managedItems)?.description || '').trim();
}

export function toolBreakageSummary(tool, authority = 'toolSpecific') {
  if (authority === 'checkDriven') return tool?.checkBreakable === false ? 'immune' : 'breakable';
  const mode = tool?.breakage?.mode;
  if (mode === 'breakageChance') return 'breakageChance';
  if (mode === 'diceExpression') return 'diceExpression';
  return 'limitedUses';
}

export function toolOnBreakSummary(tool) {
  const mode = tool?.onBreak?.mode;
  if (mode === 'flagBroken') return 'flagBroken';
  if (mode === 'replaceWith') return 'replaceWith';
  return 'destroy';
}

const VALIDATION_ERROR_PROJECTIONS = [
  ['requires either a componentId or its own source references', 'ValidationErrorSource'],
  ['Item source is required', 'ValidationErrorSource'],
  ['requirement.formula', 'ValidationErrorRequirement'],
  ['breakage.maxUses', 'ValidationErrorMaxUses'],
  ['breakage.breakageChance', 'ValidationErrorChance'],
  ['breakage.formula', 'ValidationErrorFormula'],
  ['breakage.threshold', 'ValidationErrorThreshold'],
  ['breakage.mode', 'ValidationErrorBreakageMode'],
  ['onBreak.mode', 'ValidationErrorOnBreakMode'],
  ['onBreak.replacementTarget is required', 'ValidationErrorReplacement'],
  ['onBreak.replacementTarget componentId', 'ValidationErrorReplacementSame'],
  ['prerequisites.ids', 'ValidationErrorPrerequisites'],
  ['bonus.expression', 'ValidationErrorBonus'],
];

/**
 * Project model validation details onto stable presentation categories.
 * Unknown model or service details deliberately collapse to a safe generic
 * message instead of exposing field paths or implementation terminology.
 */
export function toolValidationPresentation(error) {
  const message = String(error || '');
  const repairMatch = /^repairRequirements\[(\d+)\]:/.exec(message);
  if (repairMatch) {
    return {
      key: 'ValidationErrorRepair',
      data: { group: Number(repairMatch[1]) + 1 },
    };
  }

  const projection = VALIDATION_ERROR_PROJECTIONS.find(([fragment]) =>
    message.includes(fragment)
  );
  return {
    key: projection?.[1] || 'ValidationErrorGeneric',
    data: {},
  };
}

export function toolSearchText(tool, managedItems = []) {
  return [
    toolDisplayName(tool, managedItems),
    toolDescription(tool, managedItems),
    tool?.name,
    tool?.bonus?.expression,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function filterTools(tools = [], term = '', managedItems = []) {
  const needle = String(term || '').trim().toLowerCase();
  if (!needle) return [...tools];
  return tools.filter((tool) => toolSearchText(tool, managedItems).includes(needle));
}

export function projectToolRow(tool, managedItems = [], authority = 'toolSpecific') {
  return {
    id: String(tool?.id || ''),
    name: toolDisplayName(tool, managedItems),
    img: toolDisplayImage(tool, managedItems),
    description: toolDescription(tool, managedItems),
    enabled: tool?.enabled !== false,
    breakage: toolBreakageSummary(tool, authority),
    onBreak: toolOnBreakSummary(tool),
  };
}

export function toolSourceUuid(tool) {
  return tool?.registeredItemUuid || tool?.originItemUuid || '';
}

export function toolSourceSnapshot(tool, worldItems = [], managedItems = []) {
  const uuid = toolSourceUuid(tool);
  const worldItem = worldItems.find((item) => item.uuid === uuid);
  const managedItem = managedItemFor(tool, managedItems);
  const source = worldItem || managedItem || tool || {};
  return {
    uuid: uuid || managedItem?.originItemUuid || '',
    name: source.name || 'Unlinked Tool',
    img: source.img || DEFAULT_TOOL_IMAGE,
    description: source.description || tool?.description || '',
    linked: Boolean(uuid || tool?.componentId),
  };
}

function validBreakage(tool, authority) {
  if (authority === 'checkDriven') return typeof tool?.checkBreakable === 'boolean';
  const breakage = tool?.breakage || {};
  if (breakage.mode === 'limitedUses') {
    return breakage.maxUses == null || (Number.isInteger(Number(breakage.maxUses)) && Number(breakage.maxUses) >= 1);
  }
  if (breakage.mode === 'breakageChance') {
    const chance = Number(breakage.breakageChance);
    return Number.isInteger(chance) && chance >= 0 && chance <= 100;
  }
  if (breakage.mode === 'diceExpression') {
    return Boolean(String(breakage.formula || '').trim()) && Number.isFinite(Number(breakage.threshold));
  }
  return false;
}

function validOnBreak(tool, authority) {
  if (authority === 'checkDriven' && tool?.checkBreakable === false) return true;
  const onBreak = tool?.onBreak || {};
  if (['destroy', 'flagBroken'].includes(onBreak.mode)) return true;
  if (onBreak.mode !== 'replaceWith') return false;
  const target = onBreak.replacementTarget;
  return target?.type === 'component'
    ? Boolean(target.componentId)
    : target?.type === 'item' && Boolean(target.itemUuid);
}

function validRequirements(tool) {
  const prerequisites = tool?.prerequisites || {};
  const bonus = tool?.bonus || {};
  const prerequisitesValid = prerequisites.enabled !== true || (Array.isArray(prerequisites.ids) && prerequisites.ids.length > 0);
  const bonusValid = bonus.enabled !== true || Boolean(String(bonus.expression || '').trim());
  return prerequisitesValid && bonusValid;
}

function validRepair(tool) {
  const groups = Array.isArray(tool?.repairRequirements) ? tool.repairRequirements : [];
  return groups.every((group) =>
    Array.isArray(group?.options) &&
    group.options.length > 0 &&
    group.options.every((option) => {
      if (Number(option?.quantity) <= 0) return false;
      if (option?.itemUuid) return true;

      const match = option?.match;
      const handler = getMatchHandler(match);
      return (
        handler.isComplete(match) &&
        handler.validate(match, { requireComplete: true }).length === 0
      );
    })
  );
}

export function toolEditorChecks(tool, authority = 'toolSpecific') {
  return [
    { id: 'source', valid: Boolean(tool?.componentId || toolSourceUuid(tool)) },
    { id: 'breakage', valid: validBreakage(tool, authority) },
    { id: 'onBreak', valid: validOnBreak(tool, authority) },
    { id: 'requirements', valid: validRequirements(tool) },
    { id: 'repair', valid: validRepair(tool) },
  ];
}
