/**
 * The prepared versioned check a stage or an Iterative Attempt describes on the authority: its
 * public prompt, and the private evaluation the prepare token carries. The engine is passed in,
 * so the descriptor reads the same check target, Tool bonuses and modifier choice a roll would.
 */
import { checkFlavorSuffix } from '../ui/svelte/apps/crafting/rollPrompt.js';
import { resolveRecipeImage } from '../ui/svelte/util/craftingImageDefaults.js';
import { cloneJson } from '../utils/scalars.js';

import { advantageOfferFields } from './checkAdvantage.js';
import {
  buildCheckModifierContext,
  makeRollDataExpressionResolver,
  resolveActiveCraftingCheckFormula,
  resolveCheckModifierContribution,
} from './checkModifierResolver.js';
import { resolveCheckFormulaDisplay, resolveRolledFormula } from './checkRoll.js';
import {
  attributeTargetPromptField,
  countPromptFields,
  underTargetPromptFields,
} from './checkRollDecision.js';
import { actorRollData, attributeTargetBasis } from './checkTarget.js';
import { countDecisionPolicy } from './countCheck.js';
import { selectedCheckTier } from './craftingCheckRefusal.js';

/** The executed target's opening terms: the resolution's, unless a dynamic macro replaced its
 * number, which then stands as the anchor. */
export function resolvedTargetTerms(target, dc) {
  return dc === target.target ? target.terms : [{ kind: 'anchor', value: dc }];
}

/**
 * The check `recipe`'s system rolls for `step`, described for `actor`. `prepareTools()` answers
 * the Tool pairs whose bonuses apply, after the check target is resolved and before any Tool roll.
 */
export async function describeVersionedCheck(
  engine,
  { actor, componentSourceActors, recipe, step, stepIndex, selectedSet, prepareTools }
) {
  const system = engine._getRecipeSystem(recipe);
  const activeCheck = resolveActiveCraftingCheckFormula(system);
  const checkTarget = engine._versionedCheckTarget(activeCheck, recipe, actor);
  const tools = await prepareTools();
  const { evaluation } = checkTarget;
  const preparedTools = await engine._prepareToolCheckBonuses(
    activeCheck.rollFormula,
    tools,
    evaluation
  );
  const rollFormula = preparedTools.formula;
  const modifierContext = capturePreparedModifierContext(
    buildCheckModifierContext(system, 'crafting', recipe),
    actor
  );
  const modifierChoice = engine._buildInteractiveModifierChoice(
    rollFormula,
    modifierContext,
    actor,
    true,
    evaluation
  );
  const dc =
    checkTarget.target === null
      ? null
      : await engine._resolveSimpleCheckDc(
          system,
          activeCheck.config,
          recipe,
          selectedSet,
          actor,
          checkTarget.target
        );
  return {
    required: activeCheck.checkUsable || activeCheck.requiresCheck,
    publicPrompt: versionedCheckPrompt({
      activeCheck,
      recipe,
      step,
      actor,
      rollFormula,
      dc,
      checkTarget,
      modifierContext,
      modifierChoice,
      toolContributions: preparedTools.contributions,
    }),
    privateEvaluation: {
      actorUuid: actor?.uuid ?? null,
      flavor: `${recipe.name ? `${recipe.name} — ` : ''}Crafting check${checkFlavorSuffix(dc, evaluation)}`,
      speaker: cloneJson(globalThis.ChatMessage?.getSpeaker?.({ actor })) ?? null,
      componentSourceActorUuids: (componentSourceActors || [])
        .map((source) => source?.uuid)
        .filter(Boolean),
      recipeId: recipe.id,
      stepIndex,
      stepId: step.id ?? null,
      selectedIngredientSetId: selectedSet.id,
      mode: activeCheck.mode,
      slot: activeCheck.slot,
      rollFormula,
      checkConfig: {
        ...cloneJson(activeCheck.config),
        craftingModifier: cloneJson(modifierContext),
        modifierChoice: cloneJson(modifierChoice),
        toolContributions: cloneJson(preparedTools.contributions),
      },
      decisionPolicy: versionedDecisionPolicy(activeCheck, recipe, dc, checkTarget),
    },
  };
}

/**
 * The prepared check's private routing policy. `dc` stays fixed-only and `target` is the resolved
 * pre-modifier target after any macro, so a later actor or config edit cannot move either; a
 * count check has neither and captures its resolved pool as `count` instead.
 */
function versionedDecisionPolicy(activeCheck, recipe, dc, checkTarget) {
  const { evaluation, policy, source } = checkTarget;
  const count = policy ? countDecisionPolicy(evaluation, policy, dc) : null;
  const target = !count && Number.isFinite(dc) ? dc : null;
  return {
    dc: source === 'fixed' ? target : null,
    target,
    targetSource: target === null ? null : source,
    targetTerms: target === null ? null : resolvedTargetTerms(checkTarget, target),
    ...(count && { count }),
    thresholdMode: activeCheck.config?.thresholdMode ?? null,
    type: activeCheck.config?.type ?? null,
    relativeOutcomes: cloneJson(activeCheck.config?.relativeOutcomes) ?? [],
    fixedOutcomes: cloneJson(activeCheck.config?.fixedOutcomes) ?? [],
    clampToNearest: activeCheck.slot === 'routed',
    minOutcomeId:
      activeCheck.mode === 'routedByCheck' ? (recipe.minSuccessOutcomeId ?? null) : null,
  };
}

/** The character-value basis a roll prompt names its target by, unless a DC macro moved the
 * target off what that basis resolves to. */
export function promptTargetBasis(config, recipe, actor, target, dc) {
  if (dc !== target.target) return null;
  const tier = selectedCheckTier(config, recipe);
  return attributeTargetBasis(config, {
    override: tier?.adjustment,
    label: tier?.name ?? '',
    readRollData: () => actorRollData(actor),
  });
}

function capturePreparedModifierContext(context, actor) {
  const resolveExpression = makeRollDataExpressionResolver(actor);
  return {
    ...cloneJson(context),
    catalogue: (context?.catalogue ?? []).map((entry) => ({
      ...cloneJson(entry),
      expression: resolveExpression(entry?.expression) ?? '',
    })),
  };
}

function versionedCheckPrompt({
  activeCheck,
  recipe,
  step,
  actor,
  rollFormula,
  dc,
  checkTarget,
  modifierContext,
  modifierChoice,
  toolContributions,
}) {
  const { evaluation, policy: countPolicy } = checkTarget;
  const selectedModifiers = modifierChoice
    ? []
    : resolveCheckModifierContribution(modifierContext, makeRollDataExpressionResolver(actor))
        .selected.filter((entry) => !entry.blocked)
        .map(publicModifierDisplay);
  const counts = evaluation.product === 'count';
  // A count check's retained formula is inert, so its prompt never shows it.
  const shown = counts ? '' : rollFormula;
  const formula = modifierChoice
    ? shown
    : resolveRolledFormula(shown, actor, modifierContext, undefined, evaluation);
  const target = !counts && activeCheck.slot === 'simple' && Number.isFinite(dc) ? dc : null;
  const routedFixed = activeCheck.slot === 'routed' && activeCheck.config?.type === 'fixed';
  const comparison = activeCheck.config?.thresholdMode === 'exceed' ? 'exceed' : 'meet';
  const activityKey = 'FABRICATE.App.Nav.Crafting';
  const localizedActivity = globalThis.game?.i18n?.localize?.(activityKey);
  return {
    label: recipe.name || step.name || 'Crafting',
    activity:
      localizedActivity && localizedActivity !== activityKey ? localizedActivity : 'Crafting',
    subject: recipe.name || step.name || '',
    actorName: actor?.name ?? '',
    img: resolveRecipeImage(recipe),
    formula,
    resolvedFormula:
      resolveCheckFormulaDisplay(formula, actor, null, undefined, evaluation)?.display ?? null,
    // The itemised `selectedModifiers` are chips, so the prompt's formula omits their terms.
    displayFormula:
      resolveCheckFormulaDisplay(shown, actor, null, undefined, evaluation)?.display ?? shown,
    target,
    direction: target === null ? null : evaluation.direction,
    comparison: target === null ? null : comparison,
    ...(target !== null && attributeTargetPromptField(evaluation)),
    ...(target !== null &&
      underTargetPromptFields(evaluation, {
        targetBasis: promptTargetBasis(activeCheck.config, recipe, actor, checkTarget, dc),
        toolContributions,
      })),
    selectedModifiers,
    mode: activeCheck.mode,
    allowsSituationalModifier: activeCheck.checkUsable,
    offerSituationalBonus: activeCheck.config?.offerSituationalBonus !== false,
    ...advantageOfferFields(activeCheck.config, evaluation, activeCheck.rollFormula),
    modifierChoice: publicModifierChoice(modifierChoice),
    // The pool with any Tool bonus folded in, and the macro's required count; fixed ranges read none.
    ...(counts &&
      countPromptFields(evaluation, countPolicy, routedFixed ? null : dc, toolContributions)),
  };
}

/** `value` is the flat number `display` already shows, so a roll-under prompt can add it up. */
function publicModifierDisplay({ label, icon, display, value }) {
  return { label, icon, display, value: Number.isFinite(value) ? value : null };
}

function publicModifierChoice(choice) {
  if (!choice) return null;
  return {
    modifiers: choice.modifiers.map((modifier) => ({
      id: modifier.id,
      ...publicModifierDisplay(modifier),
    })),
    maxPicks: choice.maxPicks,
    defaultSelectedIds: choice.defaultSelectedIds,
    defaultSelectedId: choice.defaultSelectedId,
  };
}
