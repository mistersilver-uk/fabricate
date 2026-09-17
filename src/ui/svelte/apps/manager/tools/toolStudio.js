import { getMatchHandler } from '../../../../../models/match/matchTypes.js';
import {
  TOOL_IMAGE_SENTINEL,
  linkedComponentFor,
  resolveToolDescription,
  resolveToolDisplayImage,
  resolveToolDisplayName,
} from '../../../../../models/toolDisplay.js';
import { Tool } from '../../../../../models/Tool.js';

// The precedence lives in `src/models/toolDisplay.js` so the engines, chat cards and Run Journal
// projection reach it too — importing this module from `src/systems/` would invert the layering,
// which is why those surfaces each re-derived the rule and drifted.
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

/**
 * THE ONE ANSWER TO "what breakage mechanic does this Tool author", including the state the radio
 * group had no option for: `limitedUses` with a null `maxUses` is UNLIMITED. Splitting one MODE
 * into two presented answers is deliberately NOT a fourth `breakage.mode`, because both validators
 * already accept that null.
 */
export function toolBreakageChoice(tool, authority = 'toolSpecific') {
  const kind = toolBreakageSummary(tool, authority);
  if (kind !== 'limitedUses') return kind;
  return tool?.breakage?.maxUses == null ? 'unlimited' : 'limitedUses';
}

export function toolOnBreakSummary(tool) {
  const mode = tool?.onBreak?.mode;
  if (mode === 'flagBroken') return 'flagBroken';
  if (mode === 'replaceWith') return 'replaceWith';
  return 'destroy';
}

/**
 * The four behavior facts the Tool browser inspector and the live editor preview share. Consumers
 * own layout; wording and effective state live here so the two surfaces cannot drift.
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
    // A SINGULAR FORM, because switching to `Limited uses` seeds `maxUses` at 1, so `1 uses` is
    // the state a GM lands on the moment they choose the option.
    const useCount = Number(tool.breakage.maxUses);
    breakageTitle = format(
      useCount === 1
        ? 'FABRICATE.Admin.Manager.Tools.SummaryUseCountOne'
        : 'FABRICATE.Admin.Manager.Tools.SummaryUseCount',
      { count: useCount },
      useCount === 1 ? '{count} use' : '{count} uses'
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

  // THE BARE SHORT VALUE beside the sentence: `title` is what a fact row states and `value` is the
  // same answer with no framing, for a caller stating it inside its own frame. Deriving it at the
  // consumer would mean stripping a localized prefix off a localized sentence.
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
      // THE GROUP GLYPH, not the single-figure-with-shield: a prerequisite states WHO may wield
      // the Tool, and a shield reads as protection rather than as a roster.
      icon: 'fas fa-users',
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
      icon: 'fas fa-plus',
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
 * WHICH EDITOR TAB HOSTS EACH CHECK — the ROUTE half of a validation row's address. `general` is
 * deliberately absent, its rows being the errors the projection could not place at all.
 */
const CHECK_ROUTE = {
  breakage: 'breakage',
  onBreak: 'breakage',
  repair: 'breakage',
  prerequisites: 'requirements',
  bonus: 'requirements',
};

/**
 * WHICH CONTROL EACH FAILURE NAMES — the `data-validation-target` half, keyed by the projected ERROR
 * rather than the check, because the `breakage` check is five different controls by mechanic and
 * one address per CHECK would be wrong in the state the GM is looking at. ROUTE-ONLY IS A STATED
 * OUTCOME for the mechanic CHOICE, for a check no field was named on, and for a `general` row.
 */
const CONTROL_BY_ERROR = {
  ValidationErrorMaxUses: 'tool-max-uses',
  ValidationErrorChance: 'tool-breakage-chance',
  ValidationErrorFormula: 'tool-breakage-formula',
  ValidationErrorThreshold: 'tool-breakage-threshold',
  ValidationErrorOnBreakMode: 'tool-on-break',
  ValidationErrorReplacement: 'tool-on-break',
  ValidationErrorReplacementSame: 'tool-on-break',
  ValidationErrorRepair: 'tool-on-break',
  ValidationErrorPrerequisites: 'tool-prerequisites',
  ValidationErrorBonus: 'tool-bonus',
};

/**
 * The two addresses one Validation row carries: `target` the ROUTE, `focusTarget` the CONTROL. An
 * empty one produces NO key, because the host resolves any non-empty string and would report the
 * row as focus-wired while focusing nothing. A PASSING check gets no address at all.
 */
export function toolIssueAddress(check) {
  if (!check || check.valid) return {};
  const route = CHECK_ROUTE[check.id];
  if (!route) return {};
  const firstError = Array.isArray(check.errors) ? check.errors[0] : undefined;
  const control = firstError ? CONTROL_BY_ERROR[toolValidationPresentation(firstError).key] : '';
  return control ? { target: route, focusTarget: control } : { target: route };
}

/**
 * Project validation details onto stable presentation categories; an unknown detail collapses to a
 * generic message rather than exposing field paths or implementation terminology.
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
 * Project a Tool through the canonical domain validator for browse surfaces, at this shared
 * boundary so row and inspector status cannot drift from the save gate.
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
 * The SYSTEM Tool rules editor's validation surface. IDENTITY IS NOT VALIDATED HERE, AND THAT IS
 * THE POINT: it is authored once on the world Tool, so a `source` check reddened this editor's tab
 * badge over a defect no control on the screen could clear. The failure is not swallowed —
 * `identityErrors` carries it out so the surface states it as a ROUTED notice — and deliberately
 * not folded into `unknownErrors`, which would re-materialise it as a blocking `General` row.
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
 * Whether a Tool names a game-world Item. The retired `source` check's predicate, kept exported
 * because the system rules editor still STATES a missing link, as the world Tool's business.
 */
export function toolHasLinkedSource(tool) {
  return Boolean(tool?.componentId || toolSourceUuid(tool));
}

/**
 * THE PLAIN-LANGUAGE BAND A BREAK PERCENTAGE FALLS IN: `5%` is a quantity, and `Rarely breaks` is
 * what a GM was deciding. THE FIVE BANDS AND THEIR CUTS ARE THE DESIGN'S, but its raw hex literals
 * are deliberately not copied — this repository's colour contract scans comments as well as code —
 * so they map onto the SEMANTIC ramp the track already interpolates, which keeps the chip and its
 * track the same colour in all seven themes. `0` IS ITS OWN BAND AND ITS OWN HUE.
 */
export function toolBreakageChanceBand(chance, text = (_key, fallback) => fallback) {
  const percent = Number(chance);
  const value = Number.isFinite(percent) ? percent : 0;
  if (value <= 0) {
    return {
      tone: 'info',
      color: 'var(--fab-info)',
      label: text('FABRICATE.Admin.Manager.Tools.ChanceBandNever', 'Unbreakable'),
    };
  }
  if (value <= 10) {
    return {
      tone: 'success',
      color: 'var(--fab-success)',
      label: text('FABRICATE.Admin.Manager.Tools.ChanceBandRare', 'Rarely breaks'),
    };
  }
  if (value <= 30) {
    return {
      tone: 'warning',
      color: 'var(--fab-warning)',
      label: text('FABRICATE.Admin.Manager.Tools.ChanceBandOccasional', 'Breaks now and then'),
    };
  }
  if (value <= 60) {
    return {
      tone: 'warning',
      color: 'var(--fab-badge-gold)',
      label: text('FABRICATE.Admin.Manager.Tools.ChanceBandOften', 'Breaks often'),
    };
  }
  return {
    tone: 'danger',
    color: 'var(--fab-danger)',
    label: text('FABRICATE.Admin.Manager.Tools.ChanceBandConstant', 'Breaks almost every use'),
  };
}

/**
 * Resolve a drag payload onto ONE managed Component, or `''`. PURE, because the two Tool editors
 * are leaves with no `game`, so a drop can only be answered against the option list the caller
 * already holds. Two payload shapes a GM can produce are accepted — a Foundry document drag matched
 * on `registeredItemUuid` then `originItemUuid`, and a Fabricate component drag carrying an `id`.
 */
export function resolveDroppedComponentId(payload, componentOptions = []) {
  const options = Array.isArray(componentOptions) ? componentOptions : [];
  if (!payload || typeof payload !== 'object') return '';
  const droppedId = String(payload.componentId ?? payload.id ?? '').trim();
  if (droppedId && options.some((option) => option?.id === droppedId)) return droppedId;
  const uuid = String(payload.uuid ?? '').trim();
  if (!uuid) return '';
  const byRegistered = options.find((option) => option?.registeredItemUuid === uuid);
  if (byRegistered) return String(byRegistered.id);
  const byOrigin = options.find((option) => option?.originItemUuid === uuid);
  return byOrigin ? String(byOrigin.id) : '';
}

/**
 * The `projectToolBehaviorFacts` fact id each world-default SECTION resolves through: the two
 * vocabularies agree on three of four and disagree on the fourth, exactly the near-miss a caller
 * gets silently wrong.
 */
export const TOOL_SECTION_FACT_ID = Object.freeze({
  breakage: 'breakage',
  onBreak: 'on-break',
  prerequisites: 'prerequisites',
  bonus: 'bonus',
});

/**
 * What ONE section of a Tool's WORLD DEFAULTS resolves to, as a behaviour fact. READ THROUGH THE
 * SHARED PROJECTION rather than re-derived, so an inheriting card states the world value in exactly
 * the rail's words. `undefined` when the world holds no defaults record — a real answer, since a
 * Tool existing only in a crafting system has nothing to inherit FROM.
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
 * The player-facing preview of ONE copy of this Tool: the pill over its art, the sentence under it,
 * and what breakage does to the name. `broken` is a PREVIEW state, never a stored one.
 *
 * THE PREVIEW SHOWS THE CONSEQUENCE, NOT A WORD FOR IT, where all three on-break actions drew the
 * same dimmed art under a differently-worded chip. DESTROY empties the box; REPLACE shows the
 * REPLACEMENT COMPONENT's art and name, falling back to the Tool's own when the target is unset or
 * unaddressable, which the Validation tab reports; MARK AS BROKEN keeps its pill, being the only
 * thing that says the flag is set. The two changed branches carry NO pill, because a chip naming
 * the outcome beside a picture of it is the same statement twice.
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
              maxUses === 1
                ? 'FABRICATE.Admin.Manager.Tools.Editor.PlayerUsesLeftOne'
                : 'FABRICATE.Admin.Manager.Tools.Editor.PlayerUsesLeft',
              { count: maxUses },
              maxUses === 1 ? '{count} use left' : '{count} uses left'
            )
          : breakageFact?.title || '',
      },
      note: text(
        'FABRICATE.Admin.Manager.Tools.Editor.PlayerWorking',
        'A working copy. Recipes and gathering tasks accept it.'
      ),
      dimmed: false,
      nameSuffix: '',
      imageKind: 'tool',
      image: '',
      name: '',
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
      imageKind: 'tool',
      image: '',
      name: '',
    };
  }
  if (mode === 'replaceWith') {
    const componentId = tool?.onBreak?.replacementTarget?.componentId;
    const replacement = (Array.isArray(componentOptions) ? componentOptions : []).find(
      (option) => option?.id === componentId
    );
    return {
      // NO PILL: the tile carries the replacement's own art and name.
      pill: null,
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
      // NOT DIMMED: the replacement is a real, working copy of something else.
      dimmed: false,
      nameSuffix: '',
      imageKind: replacement ? 'replacement' : 'tool',
      image: String(replacement?.img || ''),
      name: String(replacement?.name || ''),
    };
  }
  return {
    // NO PILL, for the reason `replaceWith` has none: the empty box is the statement.
    pill: null,
    note: text(
      'FABRICATE.Admin.Manager.Tools.Editor.PlayerDestroyed',
      'The copy is consumed and removed from the inventory it was used from.'
    ),
    dimmed: true,
    nameSuffix: '',
    imageKind: 'none',
    image: '',
    name: '',
  };
}
