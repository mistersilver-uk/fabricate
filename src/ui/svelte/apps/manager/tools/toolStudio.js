import { getMatchHandler } from '../../../../../models/match/matchTypes.js';
import {
  TOOL_IMAGE_SENTINEL,
  linkedComponentFor,
  resolveToolDescription,
  resolveToolDisplayImage,
  resolveToolDisplayName,
} from '../../../../../models/toolDisplay.js';
import { Tool } from '../../../../../models/Tool.js';

// The precedence itself lives in `src/models/toolDisplay.js` so the engines, chat cards and Run
// Journal projection can reach it too — importing this module from `src/systems/` would invert
// the layering, which is why those surfaces each re-derived the rule and drifted (issues 976,
// 1119). These wrappers keep the manager UI's existing `(tool, managedItems)` call shape.
const DEFAULT_TOOL_IMAGE = TOOL_IMAGE_SENTINEL;

const managedItemFor = linkedComponentFor;

export function toolDisplayName(tool, managedItems = [], fallback = 'Untitled tool') {
  return resolveToolDisplayName(tool, managedItemFor(tool, managedItems), fallback);
}

export function toolDisplayImage(tool, managedItems = []) {
  return resolveToolDisplayImage(tool, managedItemFor(tool, managedItems));
}

export function toolDescription(tool, managedItems = []) {
  return resolveToolDescription(tool, managedItemFor(tool, managedItems));
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
      replaceWith: text('FABRICATE.Admin.Manager.Tools.OnBreakReplace', 'Replace with component'),
    }[onBreakKey] || text('FABRICATE.Admin.Manager.Tools.OnBreakDestroy', 'Destroy the item');
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

  // THE BARE SHORT VALUE, beside the sentence. `title` is the sentence a fact row states
  // (`On break: replace with component`); `value` is the same answer with no framing, which is
  // what a caller states INSIDE its own frame - the rules editor's `World default: {value}`
  // sub-line is the reason this exists (issue 1373). Deriving it at the consumer would mean
  // stripping a localized prefix off a localized sentence, which is exactly the kind of second
  // copy of a rule this projection exists to prevent.
  return [
    {
      id: 'breakage',
      heading: text('FABRICATE.Admin.Manager.Tools.Breakage', 'Breakage'),
      icon: authority === 'checkDriven' ? 'fas fa-dice-d20' : 'fas fa-hourglass-half',
      title: breakageTitle,
      value: breakageTitle,
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
      value: immune
        ? text(
            'FABRICATE.Admin.Manager.Tools.Editor.OnBreakNotApplicable',
            'Not applicable while this Tool cannot break'
          )
        : onBreakAction.toLocaleLowerCase(),
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
      value: prerequisiteTitle,
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
      value: bonusTitle,
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

  const projection = VALIDATION_ERROR_PROJECTIONS.find(([fragment]) => message.includes(fragment));
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
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function filterTools(tools = [], term = '', managedItems = []) {
  const needle = String(term || '')
    .trim()
    .toLowerCase();
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
    return (
      breakage.maxUses == null ||
      (Number.isInteger(Number(breakage.maxUses)) && Number(breakage.maxUses) >= 1)
    );
  }
  if (breakage.mode === 'breakageChance') {
    const chance = Number(breakage.breakageChance);
    return Number.isInteger(chance) && chance >= 0 && chance <= 100;
  }
  if (breakage.mode === 'diceExpression') {
    return (
      Boolean(String(breakage.formula || '').trim()) && Number.isFinite(Number(breakage.threshold))
    );
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
  return (
    prerequisites.enabled !== true ||
    (Array.isArray(prerequisites.ids) && prerequisites.ids.length > 0)
  );
}

function validBonus(tool) {
  const bonus = tool?.bonus || {};
  return bonus.enabled !== true || Boolean(String(bonus.expression || '').trim());
}

function validRepair(tool) {
  const groups = Array.isArray(tool?.repairRequirements) ? tool.repairRequirements : [];
  return groups.every(
    (group) =>
      Array.isArray(group?.options) &&
      group.options.length > 0 &&
      group.options.every((option) => {
        const quantity = option?.quantity;
        if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0)
          return false;
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

/**
 * The SYSTEM Tool rules editor's validation surface.
 *
 * IDENTITY IS NOT VALIDATED HERE, AND THAT IS THE POINT (issue 1373). This used to open with a
 * `source` check reading `A game-world Item is linked`, under a `LINKED ITEM` heading, on a
 * screen that cannot link one. Identity is world scope: the linked Item, the shared name, the
 * art and the description are authored once on the world Tool and adopted by every system.
 * Asking a crafting system to satisfy a check it has no control over is asking it to repair
 * someone else's record, and while it counted toward `issueCount` it also reddened this
 * editor's tab badge over a defect no control on the screen could clear.
 *
 * The failure is not swallowed. `identityErrors` carries it out separately so the surface can
 * state it as a ROUTED notice - the thing to do about it is open the world Tool - rather than
 * as a check row. It is deliberately NOT folded into `unknownErrors`, which would
 * re-materialise it as a blocking `General` row saying nothing useful.
 *
 * @param {object|null} tool
 * @param {string} authority
 * @param {Array<string>} errors Domain validator messages.
 * @returns {{checks: Array<object>, unknownErrors: Array<object>, identityErrors: Array<string>,
 *   issueCount: number}}
 */
export function toolEditorValidation(tool, authority = 'toolSpecific', errors = []) {
  const localChecks = [
    { id: 'breakage', valid: validBreakage(tool, authority) },
    { id: 'onBreak', valid: validOnBreak(tool, authority) },
    { id: 'prerequisites', valid: validPrerequisites(tool) },
    { id: 'bonus', valid: validBonus(tool) },
    { id: 'repair', valid: validRepair(tool) },
  ];
  const failuresByCheck = new Map();
  const unknownFailures = new Set();
  const identityFailures = new Set();
  for (const error of errors || []) {
    const presentation = toolValidationPresentation(error);
    const checkId = VALIDATION_CHECK_BY_ERROR[presentation.key];
    const signature = JSON.stringify(presentation);
    if (checkId === 'source') {
      identityFailures.add(String(error ?? ''));
      continue;
    }
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
    // The WORLD Tool's own defect, reported so this screen can route to it. It never counts
    // toward `issueCount`, so it never reddens this editor's tab badge.
    identityErrors: [...identityFailures],
    issueCount: checks.filter((check) => !check.valid).length + unknownFailures.size,
  };
}

export function toolEditorChecks(tool, authority = 'toolSpecific') {
  return toolEditorValidation(tool, authority).checks;
}

/**
 * Whether a Tool actually names a game-world Item, through a managed Component or its own
 * source references.
 *
 * The predicate the retired `source` check used, kept as a named export because the system
 * rules editor still has to STATE a missing link - it just states it as the world Tool's
 * business rather than as a check of its own.
 *
 * @param {object|null} tool
 * @returns {boolean}
 */
export function toolHasLinkedSource(tool) {
  return Boolean(tool?.componentId || toolSourceUuid(tool));
}

/**
 * The `projectToolBehaviorFacts` fact id each world-default SECTION resolves through.
 *
 * The section names are the resolver's (`TOOL_SECTIONS`) and the fact ids are this module's;
 * they agree on three of four and disagree on `onBreak` / `on-break`, which is exactly the kind
 * of near-miss a caller gets silently wrong. Stated once, here.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const TOOL_SECTION_FACT_ID = Object.freeze({
  breakage: 'breakage',
  onBreak: 'on-break',
  prerequisites: 'prerequisites',
  bonus: 'bonus',
});

/**
 * What ONE section of a Tool's WORLD DEFAULTS resolves to, as a behaviour fact.
 *
 * READ THROUGH THE SHARED PROJECTION rather than re-derived, on `ToolBrowserInspector`'s
 * precedent: the world default record is shaped into a tool-like record and handed to
 * `projectToolBehaviorFacts`, so an inheriting card states the world value in exactly the words
 * the rail's effective-rules row states it in. A second derivation here is how the two drift.
 *
 * `undefined` when the world holds no defaults record for this Tool at all - a real answer, not
 * a fallback: a Tool that exists only in a crafting system has nothing to inherit FROM, and a
 * card must not claim a parent that does not exist.
 *
 * @param {string} section One of {@link TOOL_SECTION_FACT_ID}'s keys.
 * @param {object|null} worldDefault The world defaults record for this Tool.
 * @param {string} authority Active system breakage authority.
 * @param {(key: string, fallback: string) => string} text
 * @param {(key: string, data: object, fallback: string) => string} format
 * @returns {{id: string, icon: string, title: string, subtitle: string, value: string}|undefined}
 */
export function toolWorldDefaultFact(section, worldDefault, authority, text, format) {
  const factId = TOOL_SECTION_FACT_ID[section];
  if (!factId || !worldDefault || typeof worldDefault !== 'object') return undefined;
  const shaped = {
    id: String(worldDefault.id ?? ''),
    breakage: worldDefault.breakage ?? null,
    onBreak: worldDefault.onBreak ?? null,
    prerequisites: worldDefault.prerequisites ?? null,
    bonus: worldDefault.bonus ?? null,
    checkBreakable: worldDefault.checkBreakable !== false,
  };
  return projectToolBehaviorFacts(shaped, authority, text, format).find(
    (fact) => fact.id === factId
  );
}

/**
 * The player-facing preview of ONE copy of this Tool: the pill over its art, the sentence under
 * it, and what breakage does to the name.
 *
 * `broken` is a PREVIEW state, never a stored one. Nothing here writes; the GM flips it to see
 * what the on-break action actually does to a character's copy, which is the one thing the
 * effective-rules rows state in the abstract and never show.
 *
 * @param {object|null} tool
 * @param {string} authority Active system breakage authority.
 * @param {boolean} broken Show the post-breakage state.
 * @param {Array<object>} componentOptions Managed components, for a replacement target's name.
 * @param {(key: string, fallback: string) => string} text
 * @param {(key: string, data: object, fallback: string) => string} format
 * @returns {{pill: {tone: string, icon: string, label: string}, note: string, dimmed: boolean,
 *   nameSuffix: string}}
 */
export function projectToolPlayerPreview(
  tool,
  authority = 'toolSpecific',
  broken = false,
  componentOptions = [],
  text = (_key, fallback) => fallback,
  format = (_key, data, fallback) =>
    Object.entries(data || {}).reduce(
      (value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)),
      fallback
    )
) {
  const maxUses = Number(tool?.breakage?.maxUses);
  const limited =
    authority !== 'checkDriven' &&
    tool?.breakage?.mode === 'limitedUses' &&
    Number.isInteger(maxUses) &&
    maxUses > 0;
  const breakageFact = projectToolBehaviorFacts(tool, authority, text, format).find(
    (fact) => fact.id === 'breakage'
  );

  if (!broken) {
    return {
      pill: {
        tone: 'subtle',
        icon: limited ? 'fas fa-hourglass-half' : breakageFact?.icon || 'fas fa-hourglass-half',
        label: limited
          ? format(
              'FABRICATE.Admin.Manager.Tools.Editor.PlayerUsesLeft',
              { count: maxUses },
              '{count} uses left'
            )
          : breakageFact?.title || '',
      },
      note: text(
        'FABRICATE.Admin.Manager.Tools.Editor.PlayerWorking',
        'A working copy. Recipes and gathering tasks accept it.'
      ),
      dimmed: false,
      nameSuffix: '',
    };
  }

  const mode = toolOnBreakSummary(tool);
  if (mode === 'flagBroken') {
    return {
      pill: {
        tone: 'warning',
        icon: 'fas fa-triangle-exclamation',
        label: text('FABRICATE.Admin.Manager.Tools.Editor.PlayerBrokenPill', 'Broken'),
      },
      note: text(
        'FABRICATE.Admin.Manager.Tools.Editor.PlayerFlagBroken',
        'Marked broken and renamed. Recipes and gathering tasks refuse it until it is repaired.'
      ),
      dimmed: true,
      nameSuffix: text('FABRICATE.Admin.Manager.Tools.Editor.PlayerBrokenSuffix', ' (Broken)'),
    };
  }
  if (mode === 'replaceWith') {
    const componentId = tool?.onBreak?.replacementTarget?.componentId;
    const replacement = (Array.isArray(componentOptions) ? componentOptions : []).find(
      (option) => option?.id === componentId
    );
    return {
      pill: {
        tone: 'accent',
        icon: 'fas fa-arrow-right-arrow-left',
        label: text('FABRICATE.Admin.Manager.Tools.Editor.PlayerReplacedPill', 'Replaced'),
      },
      note: replacement?.name
        ? format(
            'FABRICATE.Admin.Manager.Tools.Editor.PlayerReplacedNamed',
            { component: replacement.name },
            'The copy is removed and {component} is added in its place.'
          )
        : text(
            'FABRICATE.Admin.Manager.Tools.Editor.PlayerReplaced',
            'The copy is removed and its replacement Component is added in its place.'
          ),
      dimmed: true,
      nameSuffix: '',
    };
  }
  return {
    pill: {
      tone: 'danger',
      icon: 'fas fa-trash',
      label: text('FABRICATE.Admin.Manager.Tools.Editor.PlayerDestroyedPill', 'Destroyed'),
    },
    note: text(
      'FABRICATE.Admin.Manager.Tools.Editor.PlayerDestroyed',
      'The copy is consumed and removed from the inventory it was used from.'
    ),
    dimmed: true,
    nameSuffix: '',
  };
}
