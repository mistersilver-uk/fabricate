import { getMatchHandler } from '../../../../../models/match/matchTypes.js';
import { Tool } from '../../../../../models/Tool.js';

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

/**
 * Project the four behavior facts shared by the Tool browser inspector and the
 * live editor preview. Consumers own layout; wording and effective state live
 * here so the two surfaces cannot drift.
 *
 * @param {object} tool Tool draft or persisted Tool.
 * @param {string} authority Active system breakage authority.
 * @param {(key:string, fallback:string) => string} text Localization adapter.
 * @param {(key:string, data:object, fallback:string) => string} format Formatted localization adapter.
 * @returns {Array<{id:string, icon:string, heading:string, title:string, subtitle:string}>}
 */
export function projectToolBehaviorFacts(
  tool,
  authority = 'toolSpecific',
  text = (_key, fallback) => fallback,
  format = (_key, data, fallback) => {
    return Object.entries(data || {}).reduce(
      (value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)),
      fallback
    );
  }
) {
  const breakageKind = toolBreakageSummary(tool, authority);
  let breakageTitle = text('FABRICATE.Admin.Manager.Tools.SummaryUnlimitedUses', 'Unlimited uses');
  if (breakageKind === 'immune') {
    breakageTitle = text('FABRICATE.Admin.Manager.Tools.SummaryImmune', 'Immune');
  } else if (breakageKind === 'breakable') {
    breakageTitle = text('FABRICATE.Admin.Manager.Tools.SummaryCheckDriven', 'Roll to break');
  } else if (breakageKind === 'breakageChance') {
    breakageTitle = format(
      'FABRICATE.Admin.Manager.Tools.SummaryChanceValue',
      { count: tool?.breakage?.breakageChance ?? 0 },
      '{count}% break'
    );
  } else if (breakageKind === 'diceExpression') {
    breakageTitle = format(
      'FABRICATE.Admin.Manager.Tools.SummaryDiceValue',
      { formula: tool?.breakage?.formula || '—' },
      '{formula} roll'
    );
  } else if (
    Number.isInteger(Number(tool?.breakage?.maxUses)) &&
    Number(tool?.breakage?.maxUses) > 0
  ) {
    breakageTitle = format(
      'FABRICATE.Admin.Manager.Tools.SummaryUseCount',
      { count: Number(tool.breakage.maxUses) },
      '{count} uses'
    );
  }

  const immune = authority === 'checkDriven' && tool?.checkBreakable === false;
  const onBreakKey = toolOnBreakSummary(tool);
  const onBreakAction =
    {
      destroy: text('FABRICATE.Admin.Manager.Tools.OnBreakDestroy', 'Destroy the item'),
      flagBroken: text('FABRICATE.Admin.Manager.Tools.OnBreakFlag', 'Mark as broken'),
      replaceWith: text('FABRICATE.Admin.Manager.Tools.OnBreakReplace', 'Replace with item'),
    }[onBreakKey] ||
    text('FABRICATE.Admin.Manager.Tools.OnBreakDestroy', 'Destroy the item');
  const prerequisiteCount = tool?.prerequisites?.ids?.length || 0;
  const prerequisiteTitle = tool?.prerequisites?.enabled
    ? format(
        prerequisiteCount === 1
          ? 'FABRICATE.Admin.Manager.Tools.Editor.PrerequisiteOne'
          : 'FABRICATE.Admin.Manager.Tools.Editor.PrerequisiteCount',
        { count: prerequisiteCount },
        prerequisiteCount === 1 ? '1 prerequisite' : '{count} prerequisites'
      )
    : text(
        'FABRICATE.Admin.Manager.Tools.Editor.PreviewPrerequisitesDisabled',
        'No prerequisites to use'
      );
  const bonusExpression = String(tool?.bonus?.expression || '').trim();
  const bonusTitle =
    tool?.bonus?.enabled && bonusExpression
      ? format(
          'FABRICATE.Admin.Manager.Tools.Editor.PreviewBonusValue',
          { expression: bonusExpression },
          'Adds {expression}'
        )
      : text('FABRICATE.Admin.Manager.Tools.Editor.PreviewBonusDisabled', 'No check bonus');

  return [
    {
      id: 'breakage',
      heading: text('FABRICATE.Admin.Manager.Tools.Breakage', 'Breakage'),
      icon: authority === 'checkDriven' ? 'fas fa-dice-d20' : 'fas fa-hourglass-half',
      title: breakageTitle,
      subtitle:
        authority === 'checkDriven'
          ? text(
              'FABRICATE.Admin.Manager.Tools.Editor.PreviewCheckDriven',
              'Check-driven · follows the crafting roll'
            )
          : text(
              'FABRICATE.Admin.Manager.Tools.Editor.PreviewToolSpecific',
              'Tool-specific · tracked per copy'
            ),
    },
    {
      id: 'on-break',
      heading: text('FABRICATE.Admin.Manager.Tools.OnBreak', 'On break'),
      icon: immune ? 'fas fa-shield' : 'fas fa-heart-crack',
      title: immune
        ? text(
            'FABRICATE.Admin.Manager.Tools.Editor.OnBreakNotApplicable',
            'Not applicable while this Tool cannot break'
          )
        : format(
            'FABRICATE.Admin.Manager.Tools.Editor.PreviewOnBreakValue',
            { action: onBreakAction.toLocaleLowerCase() },
            'On break: {action}'
          ),
      subtitle: immune
        ? text(
            'FABRICATE.Admin.Manager.Tools.Editor.PreviewInactive',
            'Inactive while this Tool is immune'
          )
        : text(
            'FABRICATE.Admin.Manager.Tools.Editor.PreviewOnBreak',
            'Runs immediately after breakage'
          ),
    },
    {
      id: 'prerequisites',
      heading: text('FABRICATE.Admin.Manager.Tools.Editor.Prerequisites', 'Prerequisites'),
      icon: 'fas fa-user-shield',
      title: prerequisiteTitle,
      subtitle: tool?.prerequisites?.enabled
        ? text(
            'FABRICATE.Admin.Manager.Tools.Editor.PreviewPrerequisites',
            'A character must satisfy every selected prerequisite'
          )
        : text(
            'FABRICATE.Admin.Manager.Tools.Editor.PreviewNoPrerequisites',
            'Any character may use it'
          ),
    },
    {
      id: 'bonus',
      heading: text('FABRICATE.Admin.Manager.Tools.Editor.Bonus', 'Check bonus'),
      icon: 'fas fa-plus-minus',
      title: bonusTitle,
      subtitle: tool?.bonus?.enabled
        ? text('FABRICATE.Admin.Manager.Tools.Editor.PreviewBonus', 'Added to the crafting check')
        : text(
            'FABRICATE.Admin.Manager.Tools.Editor.PreviewNoBonus',
            'Adds nothing to the crafting check'
          ),
    },
  ];
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

const VALIDATION_CHECK_BY_ERROR = {
  ValidationErrorSource: 'source',
  ValidationErrorMaxUses: 'breakage',
  ValidationErrorChance: 'breakage',
  ValidationErrorFormula: 'breakage',
  ValidationErrorThreshold: 'breakage',
  ValidationErrorBreakageMode: 'breakage',
  ValidationErrorOnBreakMode: 'onBreak',
  ValidationErrorReplacement: 'onBreak',
  ValidationErrorReplacementSame: 'onBreak',
  ValidationErrorPrerequisites: 'prerequisites',
  ValidationErrorBonus: 'bonus',
  ValidationErrorRepair: 'repair',
};

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

/**
 * Project a Tool through the canonical domain validator for browse surfaces.
 * Keeping this at the shared Tool Studio boundary prevents row and inspector
 * status from drifting from the save gate.
 */
export function toolValidationStatus(tool) {
  const validation = Tool.fromJSON(tool).validate();
  return {
    valid: validation.valid,
    errorCount: validation.errors.length,
  };
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
    validation: toolValidationStatus(tool),
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

function validPrerequisites(tool) {
  const prerequisites = tool?.prerequisites || {};
  return prerequisites.enabled !== true || (Array.isArray(prerequisites.ids) && prerequisites.ids.length > 0);
}

function validBonus(tool) {
  const bonus = tool?.bonus || {};
  return bonus.enabled !== true || Boolean(String(bonus.expression || '').trim());
}

function validRepair(tool) {
  const groups = Array.isArray(tool?.repairRequirements) ? tool.repairRequirements : [];
  return groups.every((group) =>
    Array.isArray(group?.options) &&
    group.options.length > 0 &&
    group.options.every((option) => {
      const quantity = option?.quantity;
      if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) return false;
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

export function toolEditorValidation(tool, authority = 'toolSpecific', errors = []) {
  const localChecks = [
    { id: 'source', valid: Boolean(tool?.componentId || toolSourceUuid(tool)) },
    { id: 'breakage', valid: validBreakage(tool, authority) },
    { id: 'onBreak', valid: validOnBreak(tool, authority) },
    { id: 'prerequisites', valid: validPrerequisites(tool) },
    { id: 'bonus', valid: validBonus(tool) },
    { id: 'repair', valid: validRepair(tool) },
  ];
  const failuresByCheck = new Map();
  const unknownFailures = new Set();
  for (const error of errors || []) {
    const presentation = toolValidationPresentation(error);
    const checkId = VALIDATION_CHECK_BY_ERROR[presentation.key];
    const signature = JSON.stringify(presentation);
    if (!checkId) {
      unknownFailures.add(signature);
      continue;
    }
    const failures = failuresByCheck.get(checkId) || new Map();
    failures.set(signature, String(error ?? ''));
    failuresByCheck.set(checkId, failures);
  }
  const checks = localChecks.map((check) => ({
    ...check,
    valid: check.valid && !failuresByCheck.has(check.id),
    errors: [...(failuresByCheck.get(check.id)?.values() || [])],
  }));
  return {
    checks,
    unknownErrors: [...unknownFailures].map((signature) => JSON.parse(signature)),
    issueCount: checks.filter((check) => !check.valid).length + unknownFailures.size,
  };
}

export function toolEditorChecks(tool, authority = 'toolSpecific') {
  return toolEditorValidation(tool, authority).checks;
}
