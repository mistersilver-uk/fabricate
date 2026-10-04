/**
 * A recipe's expected outputs as display rows, one per routed result of every kind (issue 1773):
 * a component by its library entry, a currency reward by its label or unit, and a knowledge reward
 * by the recipe it teaches. Shared by the crafting detail's output list and its outcome tiers.
 */
import { resolvedComponentsFor } from '../../systems/scopedEntityReads.js';
import {
  untrimmedStringOrEmpty as stringOrEmpty,
  untrimmedStringOrNull as stringOrNull,
} from '../../utils/scalars.js';

const UNKNOWN_COMPONENT_KEY = 'FABRICATE.Labels.UnknownComponent';

/** The glyph each non-component result kind draws in place of an item image. */
export const RESULT_KIND_GLYPHS = Object.freeze({
  currency: 'fa-solid fa-coins',
  knowledge: 'fa-solid fa-book-open',
});

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

function rewardRow(result, { units, recipeManager, localize }) {
  const kind = kindOf(result);
  if (kind === 'currency') {
    const unit = list(units).find((entry) => entry?.id === result.unit) ?? null;
    const unitName = stringOrEmpty(unit?.label) || stringOrEmpty(result.unit);
    return {
      kind,
      name: stringOrEmpty(result.label) || unitName,
      img: null,
      glyph: RESULT_KIND_GLYPHS.currency,
      qty: Number(result.quantity || 1),
      amountText: `${authoredAmount(result)} ${unit?.abbreviation || unitName}`.trim(),
      reason: stringOrNull(result.reason),
    };
  }
  const taught = recipeManager?.getRecipe?.(result?.recipeId) ?? null;
  return {
    kind,
    name: stringOrEmpty(taught?.name) || localize('FABRICATE.App.Crafting.Io.UnknownRecipe'),
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
 * `currencyUnits()` answers the world's normalized units, read only when a currency row needs them.
 */
export function resultOutputRows(groups, { system, currencyUnits, recipeManager, localize }) {
  const byId = new Map(resolvedComponentsFor(system).map((component) => [component.id, component]));
  return list(groups).flatMap((group) =>
    list(group?.results).map((result) => {
      if (kindOf(result) !== 'component') {
        return rewardRow(result, { units: currencyUnits?.() ?? [], recipeManager, localize });
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
