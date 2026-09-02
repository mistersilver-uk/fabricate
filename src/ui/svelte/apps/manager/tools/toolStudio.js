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

/**
 * THE ONE ANSWER TO "what breakage mechanic does this Tool author", including the state the
 * radio group had no option for (issue 1373).
 *
 * `breakage.mode: 'limitedUses'` carries `maxUses: number | null`, and `src/models/Tool.js:23`
 * has always said what the null means: UNLIMITED — the copy is never used up, so it never
 * breaks. `Tool#evaluateBreakage` and `toolBreakageRuntime` both short-circuit on it, and
 * `normalizeBreakage` reads the retired `mode: 'immune'` FORWARD onto it, so it is also the
 * model's own spelling of "does not break". A brand-new Tool defaults to it.
 *
 * Every reading surface already said `Unlimited uses`; only the editor's radio group and its
 * uses stepper did not, because they keyed off `breakage.mode` alone — which cannot tell the
 * two limited-uses states apart — and drew the null as `1`. This splits the presentation of one
 * MODE into the two answers a GM actually authors. It is deliberately NOT a fourth
 * `breakage.mode`: `Tool#validate` and `validBreakage` both already accept a null `maxUses`
 * under `limitedUses`, so a new mode would be a migration for a state the model holds today.
 *
 * @param {object|null} tool
 * @param {string} authority Active system breakage authority.
 * @returns {string} `unlimited`, `limitedUses`, `breakageChance`, `diceExpression`,
 *   `breakable` or `immune`.
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
    // A SINGULAR FORM, because `1 uses` is now reachable and photographed. Switching a Tool
    // from `Unlimited uses` to `Limited uses` seeds `maxUses` at 1 (issue 1373), which is the
    // state a GM lands on the moment they choose the option.
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
      // THE GROUP GLYPH, not the single-figure-with-shield. The design draws `fa-users` on
      // this rule row, on the Requirements tab and on the rail's `No prerequisites to use`
      // alike; a prerequisite is a statement about WHO may wield the Tool, and the shield
      // glyph reads as protection rather than as a roster (issue 1373).
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
 * THE PLAIN-LANGUAGE BAND A BREAK PERCENTAGE FALLS IN (issue 1373, maintainer round 2).
 *
 * The design states the band beside the slider and runs the track through the same ramp, so a
 * number and a sentence say the same thing about one value. `5%` is a quantity; `Rarely breaks`
 * is what a GM was actually deciding, and the screen shipped only the quantity.
 *
 * THE FIVE BANDS AND THEIR CUTS ARE THE DESIGN'S (`proto:4618`): `0`, `<=10`, `<=30`, `<=60`,
 * above. Its own colours are five RAW HEX LITERALS from an older palette that never entered the
 * theme's `:root` and are deliberately not copied here (this repository's colour contract scans
 * comments as well as code). They are mapped instead onto the SEMANTIC ramp
 * `--fab-tool-breakage-chance-track-gradient` already interpolates — blue, green, gold, amber,
 * red, in that order — which is what keeps the chip and the track it labels the same colour in
 * all seven themes.
 *
 * `0` IS ITS OWN BAND AND ITS OWN HUE. An unbreakable Tool is not "very rarely breaks", it is a
 * different rule, and the design tints it informational rather than green for that reason.
 *
 * @param {unknown} chance The authored break percentage.
 * @param {(key: string, fallback: string) => string} [text]
 * @returns {{tone: string, color: string, label: string}}
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
 * Resolve a drag payload onto ONE managed Component, or `null`.
 *
 * PURE, and that is why it is here rather than in a component: the two Tool editors are leaves
 * with no `game`, so a drop can only ever be answered against the option list the caller was
 * already handed. Two payload shapes are accepted, and both are ones a GM can actually produce:
 * a Foundry document drag (`{uuid}` / `{type: 'Item', uuid}`), matched against each option's
 * `registeredItemUuid` then `originItemUuid`; and a Fabricate component drag carrying an `id`.
 *
 * A payload naming a Component this scope cannot address answers `null`, and the caller writes
 * nothing — which is the honest answer for an Item that is not managed here.
 *
 * @param {unknown} payload The parsed drag data.
 * @param {Array<object>} componentOptions
 * @returns {string} The resolved component id, or `''`.
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
 * == THE PREVIEW SHOWS THE CONSEQUENCE, NOT A WORD FOR IT (issue 1373, maintainer round 2) ====
 * All three on-break actions used to draw the SAME picture — the Tool's own art, dimmed, under a
 * differently-worded chip. `Destroyed` and `Replaced` are labels for two outcomes a GM can only
 * check by looking at the tile, and the tile was showing neither of them:
 *
 *  - DESTROY empties the box. The copy is gone from the inventory, so the one honest picture of
 *    it is an inventory slot with nothing in it. `imageKind: 'none'`.
 *  - REPLACE shows the REPLACEMENT COMPONENT's art and name — the thing the Tool becomes. A GM
 *    picking a replacement can then see the swap they authored rather than read that one
 *    happened. `imageKind: 'replacement'`, with `image` and `name` resolved out of
 *    `componentOptions`; both fall back to the Tool's own when the target is unset or names a
 *    Component this scope cannot address, because an unset replacement is a real state and the
 *    Validation tab is where it is reported.
 *  - MARK AS BROKEN is unchanged and keeps its pill: a broken copy IS still the Tool, dimmed,
 *    renamed, and the pill is the only thing that says the flag is set.
 *
 * The two changed branches therefore carry NO pill (`pill: null`). A chip that names the outcome
 * beside a picture of the outcome is the same statement twice.
 *
 * @param {object|null} tool
 * @param {string} authority Active system breakage authority.
 * @param {boolean} broken Show the post-breakage state.
 * @param {Array<object>} componentOptions Managed components, for a replacement target's art.
 * @param {(key: string, fallback: string) => string} text
 * @param {(key: string, data: object, fallback: string) => string} format
 * @returns {{pill: {tone: string, icon: string, label: string}|null, note: string,
 *   dimmed: boolean, nameSuffix: string, imageKind: string, image: string, name: string}}
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
      // NO PILL. The tile beside it now carries the replacement's own art and name, which is
      // the statement `Replaced` was standing in for.
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
      // NOT DIMMED. The replacement is a real, working copy of something else in the inventory,
      // so dimming it would say it is unusable.
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
