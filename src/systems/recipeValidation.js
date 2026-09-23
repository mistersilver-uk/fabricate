/** A recipe's persistence and activation validity, as pure checks over an explicit seam bag.
 * Every check takes the recipe first and resolves its system through `deps`, never a manager. */

import { getMatchHandler } from '../models/match/matchTypes.js';
import { buildRecipeActivationIssue } from '../utils/recipeActivationMessages.js';

function noIssues() {
  return { valid: true, errors: [], issues: [] };
}

/** The `{ valid, errors, issues }` result every check returns, from its coded issues. */
function fromIssues(issues) {
  return { valid: issues.length === 0, errors: issues.map((issue) => issue.message), issues };
}

/** The crafting system whose essence definitions a recipe's references are validated against, or
 * `null` when essences do not apply. Shared by the persistence and activation validators so
 * the two cannot disagree about when `features.essences` takes them out of play. */
export function resolveEssenceValidationSystem(recipe, { system }) {
  const systemId = recipe?.craftingSystemId;
  if (!systemId) return null;

  const resolved = system(systemId);
  if (!resolved) return null;

  const features = resolved.features || {};
  const essencesEnabled = features.essences === true || resolved.enableEssences === true;
  return essencesEnabled ? resolved : null;
}

/** Every essence reference a recipe makes, in validation order: recipe- and step-level sets,
 * and within each set both the legacy per-set `essences` map and first-class essence group
 * options (issue 649). One walk serves both essence validators. */
export function collectEssenceReferences(recipe) {
  const allSets = [
    ...(recipe?.ingredientSets || []),
    ...(recipe?.steps || []).flatMap((step) => step?.ingredientSets || []),
  ];
  const references = [];
  for (const [setIndex, set] of allSets.entries()) {
    const setLabel =
      typeof set?.name === 'string' && set.name.trim() ? set.name.trim() : String(setIndex + 1);
    for (const [essenceId, quantity] of Object.entries(set.essences || {})) {
      references.push({ setLabel, essenceId, quantity });
    }
    for (const group of set.ingredientGroups || []) {
      for (const option of group?.options || []) {
        if (option?.match?.type !== 'essence') continue;
        references.push({
          setLabel,
          essenceId: String(option.match.essenceId || '').trim(),
          quantity: option.match.amount,
        });
      }
    }
  }
  return references;
}

/** An essence's display name from the system's definitions (issue 595). An unknown essence has
 * no definition and therefore no name, so its message omits it entirely. */
export function essenceNameMap(definitions) {
  return new Map(
    definitions
      .filter((def) => typeof def?.name === 'string' && def.name.trim())
      .map((def) => [def.id, def.name.trim()])
  );
}

/** Validate ingredient-set essence requirements against the crafting system's essence
 * definitions. */
export function validateEssenceReferences(recipe, deps) {
  const system = resolveEssenceValidationSystem(recipe, deps);
  if (!system) {
    return noIssues();
  }

  const definitions = deps.essencesOfSystem(system);
  const validEssenceIds = new Set(definitions.map((def) => def.id));
  const essenceNames = essenceNameMap(definitions);

  const issues = [];

  // Report a non-positive-quantity essence, preferring the named message when the
  // essence resolves to a definition (issue 595 — never surface the raw id).
  const pushBadQuantity = (setLabel, essenceId) => {
    const essenceName = essenceNames.get(essenceId);
    issues.push(
      essenceName
        ? buildRecipeActivationIssue('ingredientSetEssenceQuantityNamed', {
            set: setLabel,
            essence: essenceName,
          })
        : buildRecipeActivationIssue('ingredientSetEssenceQuantity', { set: setLabel })
    );
  };

  for (const { setLabel, essenceId, quantity } of collectEssenceReferences(recipe)) {
    if (!validEssenceIds.has(essenceId)) {
      issues.push(buildRecipeActivationIssue('ingredientSetUnknownEssence', { set: setLabel }));
    }
    const num = Number(quantity);
    if (!Number.isFinite(num) || num <= 0) {
      pushBadQuantity(setLabel, essenceId);
    }
  }

  return fromIssues(issues);
}

/**
 * Activation-only blocker: a recipe may not be enabled while it requires a disabled essence
 * (issue 1036). The placement is load-bearing, because a persistence-level blocker would abort
 * `CraftingSystemManager.deleteEssence` mid-cascade with the essence maps already mutated in
 * memory and nothing persisted. A recipe may therefore still be saved while it requires a
 * disabled essence; disabling one does not retro-disable an already-enabled recipe, because
 * the gate fires only on a `false -> true` transition.
 */
export function validateEnabledEssenceReferences(recipe, deps) {
  const system = resolveEssenceValidationSystem(recipe, deps);
  if (!system) {
    return noIssues();
  }

  const definitions = deps.essencesOfSystem(system);
  // Only a defined essence can be disabled; an unknown id is `validateEssenceReferences`'s
  // business and is already reported there, so it is not reported twice here.
  const disabled = new Map(
    definitions
      .filter((def) => def?.enabled === false)
      .map((def) => [def.id, String(def.name || def.id)])
  );
  if (disabled.size === 0) {
    return noIssues();
  }

  const issues = [];
  const reported = new Set();
  for (const { setLabel, essenceId } of collectEssenceReferences(recipe)) {
    const essenceName = disabled.get(essenceId);
    if (!essenceName) continue;
    // One issue per (set, essence) pair: a set naming the same essence in both its
    // legacy map and a group option is one authoring fact, not two.
    const signature = JSON.stringify([setLabel, essenceId]);
    if (reported.has(signature)) continue;
    reported.add(signature);
    issues.push(
      buildRecipeActivationIssue('ingredientSetDisabledEssence', {
        set: setLabel,
        essence: essenceName,
      })
    );
  }

  return fromIssues(issues);
}

/** Refuse a tag placeholder naming a tag the recipe's system does not define. */
export function validateTagPlaceholders(recipe, { system }) {
  const systemId = recipe?.craftingSystemId;
  if (!systemId) {
    return noIssues();
  }

  const resolved = system(systemId);
  if (!resolved) {
    return noIssues();
  }

  const validTags = new Set(
    [
      ...(resolved.itemTags || []).map((tag) => String(tag || '').trim()),
      ...(resolved.tags || []).map((tag) => String(tag || '').trim()),
    ].filter(Boolean)
  );

  const issues = [];
  const steps =
    typeof recipe.getExecutionSteps === 'function'
      ? recipe.getExecutionSteps()
      : [{ id: 'implicit', ingredientSets: recipe.ingredientSets || [] }];
  for (const step of steps) {
    for (const ingredientSet of step.ingredientSets || []) {
      const groups =
        Array.isArray(ingredientSet.ingredientGroups) && ingredientSet.ingredientGroups.length > 0
          ? ingredientSet.ingredientGroups
          : (ingredientSet.ingredients || []).map((ingredient) => ({ options: [ingredient] }));

      for (const [groupIndex, group] of groups.entries()) {
        // Name the group by author-name or 1-based position, never its id (595).
        const groupLabel =
          typeof group?.name === 'string' && group.name.trim()
            ? group.name.trim()
            : String(groupIndex + 1);
        for (const option of group.options || []) {
          const match = option.match || null;
          if (getMatchHandler(match).type !== 'tags') continue;
          const tagIds = Array.isArray(match.tags) ? match.tags : [];

          for (const tagId of tagIds) {
            const normalized = String(tagId || '').trim();
            if (!normalized) continue;
            if (validTags.has(normalized)) continue;
            issues.push(
              buildRecipeActivationIssue('ingredientGroupUnknownTag', {
                group: groupLabel,
                tag: normalized,
              })
            );
          }
        }
      }
    }
  }

  return fromIssues(issues);
}

/** Validation required to persist a recipe: structural and completeness integrity plus
 * essence, tag-placeholder and resolution-mode checks. Signature uniqueness is excluded — a
 * conflict never blocks persistence, only activation. `deps.roll` reaches `Result.validate` from
 * here, so a rolled amount that can never award anything is refused at the write. */
export function validateRecipeForPersistence(recipe, deps, { requireComplete = true } = {}) {
  const injected = { Roll: deps.roll };
  const baseValidation = requireComplete
    ? recipe.validate(injected)
    : recipe.validateStructure(injected);
  // Structured issues in the same order as the raw error strings, carrying a stable `code` plus
  // id-free params so the UI can localize them; a string-only validator rides uncoded (issue 595).
  const issues = [];
  const pushPlain = (list) => {
    for (const message of list || []) issues.push({ code: null, params: {}, message });
  };
  const pushValidation = (validation) => {
    if (Array.isArray(validation?.issues)) issues.push(...validation.issues);
    else pushPlain(validation?.errors);
  };
  pushValidation(baseValidation);
  pushValidation(validateEssenceReferences(recipe, deps));
  pushValidation(validateTagPlaceholders(recipe, deps));
  pushValidation(deps.resolutionMode(recipe, { requireComplete }));

  return fromIssues(issues);
}

/** Full validity required to activate a recipe: completeness, every persistence check and
 * signature uniqueness. `issues` mirrors `errors` with a stable `code` (issue 550). */
export function validateRecipeForActivation(recipe, deps) {
  const persistence = validateRecipeForPersistence(recipe, deps, { requireComplete: true });
  const errors = [...persistence.errors];
  // Coded issues run in parallel with the raw strings so a UI caller can localize them (550).
  const issues = [...persistence.issues];
  const signatureValidation = deps.signatures(recipe);
  errors.push(...signatureValidation.errors);
  issues.push(...(signatureValidation.issues || []));
  // A disabled essence blocks activation only (issue 1036) — never persistence.
  const disabledEssenceValidation = validateEnabledEssenceReferences(recipe, deps);
  errors.push(...disabledEssenceValidation.errors);
  issues.push(...disabledEssenceValidation.issues);

  return {
    valid: errors.length === 0,
    errors,
    issues,
  };
}
