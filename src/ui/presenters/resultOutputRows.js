/**
 * A recipe's expected outputs as display rows, one per routed result of every kind (issue 1773):
 * a component by its library entry, a currency reward by its label, and a knowledge reward by the
 * recipe it teaches when the viewer may see that recipe. Shared by the crafting detail's output
 * list and its outcome tiers.
 */
import { currencyUnitDisplayName, findCurrencyUnit } from '../../systems/currencyProfile.js';
import { resolvedComponentsFor } from '../../systems/scopedEntityReads.js';
import {
  untrimmedStringOrEmpty as stringOrEmpty,
  untrimmedStringOrNull as stringOrNull,
} from '../../utils/scalars.js';

import { RESULT_KIND_GLYPHS } from './resultKindGlyphs.js';

const UNKNOWN_COMPONENT_KEY = 'FABRICATE.Labels.UnknownComponent';

const list = (value) => (Array.isArray(value) ? value : []);
const kindOf = (result) => result?.kind ?? 'component';

/** The authored amount: the expression when rolled, the number otherwise (issue 1645). */
const authoredAmount = (result) => result?.quantityFormula || Number(result?.quantity || 1);

/**
 * Canonical, order-independent signature of a set of resolved result groups, built from what each
 * result awards (`componentId`, `unit` or `recipeId` by kind) and its count, never from resolved
 * names, so unknown or renamed records still group correctly. Empty/failure resolves to `''`.
 */
export function resultSignature(groups) {
  const pairs = list(groups).flatMap((group) =>
    list(group?.results).map((result) => {
      const kind = kindOf(result);
      const quantity = Number(result?.quantity || 1);
      if (kind === 'component') return `${stringOrEmpty(result?.componentId)}:${quantity}`;
      const subject = kind === 'currency' ? result?.unit : result?.recipeId;
      return `${kind}:${stringOrEmpty(subject)}:${quantity}`;
    })
  );
  return pairs.sort((a, b) => a.localeCompare(b)).join(',');
}

/**
 * A knowledge reward's taught recipe name as this viewer may read it, or `null`, which renders
 * `FABRICATE.App.Crafting.Io.UnknownRecipe`: the GM reads every name, a player only an enabled
 * recipe `evaluateRecipeAccess` finds visible and not a teaser (`recipe-visibility`).
 */
export function taughtNameReader(
  { recipeManager, recipeVisibility },
  { isGM, viewer, craftingActor, knowledgeSources }
) {
  return (recipeId) => {
    const taught = recipeManager?.getRecipe?.(recipeId) ?? null;
    if (!taught || isGM) return taught?.name ?? null;
    if (taught.enabled === false) return null;
    const access = recipeVisibility?.evaluateRecipeAccess?.({
      recipe: taught,
      viewer,
      craftingActor,
      componentSourceActors: knowledgeSources,
    });
    return access?.visible === true && access.reason !== 'teaser' ? taught.name : null;
  };
}

function rewardRow(result, { units, taughtName, localize }) {
  const kind = kindOf(result);
  if (kind === 'currency') {
    const unitName =
      currencyUnitDisplayName(findCurrencyUnit(units, result.unit)) || stringOrEmpty(result.unit);
    return {
      kind,
      name: stringOrEmpty(result.label) || localize('FABRICATE.App.Crafting.Io.CurrencyReward'),
      img: null,
      glyph: RESULT_KIND_GLYPHS.currency,
      qty: Number(result.quantity || 1),
      amountText: `${authoredAmount(result)} ${unitName}`.trim(),
      reason: stringOrNull(result.reason),
    };
  }
  return {
    kind,
    name:
      stringOrEmpty(taughtName?.(result?.recipeId)) ||
      localize('FABRICATE.App.Crafting.Io.UnknownRecipe'),
    img: null,
    glyph: RESULT_KIND_GLYPHS.knowledge,
    qty: 1,
    amountText: localize('FABRICATE.App.Crafting.Io.RecipeKnowledge'),
    reason: null,
  };
}

/**
 * Flatten resolved result groups into `{ name, img, qty }` rows; a non-component row adds `kind`,
 * `glyph`, `amountText` and `reason`, so a component row is exactly the row it always was.
 * `currencyUnits()` answers the world's normalized units, read only when a currency row needs them,
 * and `taughtName(recipeId)` a taught recipe's name only where the viewer may read it.
 */
export function resultOutputRows(groups, { system, currencyUnits, taughtName, localize }) {
  const byId = new Map(resolvedComponentsFor(system).map((component) => [component.id, component]));
  return list(groups).flatMap((group) =>
    list(group?.results).map((result) => {
      if (kindOf(result) !== 'component') {
        return rewardRow(result, { units: currencyUnits?.() ?? [], taughtName, localize });
      }
      const component = result?.componentId ? byId.get(result.componentId) : null;
      return {
        name: stringOrEmpty(component?.name) || localize(UNKNOWN_COMPONENT_KEY),
        img: stringOrNull(component?.img),
        qty: Number(result?.quantity || 1),
      };
    })
  );
}
