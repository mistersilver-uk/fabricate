/** The ingredient and essence display states a craftability evaluation renders: per-group tiles,
 * per-group option and stack choices, essence rows and the shared essence pool.
 * Every builder takes the recipe first and reads its system through `deps`, never a manager. */

import { getMatchHandler } from '../models/match/matchTypes.js';
import { findMatchingComponent } from '../utils/essenceResolver.js';

import { formatCurrencyRequirement } from './currencyProfile.js';
import { readStackQuantity } from './itemStackQuantity.js';

// Foundry's generic default Item image. On a MATERIAL tile it is a sentinel meaning "no image"
// (issue 917), so a tile resolving to it draws its glyph instead. It must stay equal to
// `FALLBACK_COMPONENT_IMG` in `RecipeManager.js`, which `resolveIngredientVisual` composes with.
const GENERIC_ITEM_IMG = 'icons/svg/item-bag.svg';
// A currency match never resolves to an inventory item, so it always shows a coin icon.
const FALLBACK_CURRENCY_IMG = 'icons/svg/coins.svg';

/** A material tile's image, or null: the generic item-bag literal is the "no image" sentinel
 * (issue 917), so the tile falls back to its glyph, never to the recipe blueprint. */
function materialImg(img) {
  const resolved = typeof img === 'string' ? img.trim() : '';
  return !resolved || resolved === GENERIC_ITEM_IMG ? null : resolved;
}

/** The GM-authored `--fab-tag-*` colour token for an essence definition, or null when
 * unauthored, which every surface renders as the theme accent. */
function essenceColorToken(definition) {
  const token = typeof definition?.colorToken === 'string' ? definition.colorToken.trim() : '';
  return token || null;
}

/** Missing-group entries keyed by group id, for O(1) lookup. */
function missingEntriesByGroupId(selection) {
  const byGroupId = new Map();
  for (const entry of selection?.missingGroups || []) {
    const groupId = entry?.group?.id;
    if (groupId && !byGroupId.has(groupId)) byGroupId.set(groupId, entry);
  }
  return byGroupId;
}

/** Essence-block requirement states keyed by group id. */
function essenceRequirementsByGroupId(selection) {
  return new Map(
    (selection?.essencePool?.requirements || []).map((requirement) => [
      requirement.groupId,
      requirement,
    ])
  );
}

/** The inventory item the consumption plan spends for a group. An essence requirement resolves
 * through `essenceGroupIds` first, because the block emits one entry per item key. */
function consumedItemForGroup(selection, group, chosenOption) {
  const entries = selection?.plan || [];
  const groupId = group?.id ?? null;
  if (groupId) {
    const byGroup = entries.find((entry) => entry?.essenceGroupIds?.includes(groupId));
    if (byGroup) return byGroup.item ?? null;
  }
  return entries.find((entry) => entry.ingredient === chosenOption)?.item || null;
}

/** The groups a display state is built for: the authored ingredient groups, or a synthetic
 * one-option group per legacy flat ingredient. */
export function displayGroups(ingredientSet) {
  const groups = ingredientSet.ingredientGroups;
  if (Array.isArray(groups) && groups.length > 0) return groups;
  return (ingredientSet.ingredients || []).map((ingredient) => ({ options: [ingredient] }));
}

/** Map each group id to the option the resolver chose. `resolveIngredientSelection` appends
 * exactly one entry per non-missing group in group order, so satisfied groups read by index. */
export function chosenOptionByGroup(ingredientSet, selection) {
  const map = new Map();
  const groups = Array.isArray(ingredientSet?.ingredientGroups)
    ? ingredientSet.ingredientGroups
    : [];
  const missingIds = new Set(
    (selection?.missingGroups || []).map((mg) => mg?.group?.id).filter(Boolean)
  );
  let satisfiedIndex = 0;
  for (const group of groups) {
    if (missingIds.has(group?.id)) {
      const entry = (selection?.missingGroups || []).find((mg) => mg?.group?.id === group?.id);
      map.set(group?.id, entry?.ingredient ?? group?.options?.[0] ?? null);
    } else {
      map.set(
        group?.id,
        selection?.selectedIngredients?.[satisfiedIndex] ?? group?.options?.[0] ?? null
      );
      satisfiedIndex += 1;
    }
  }
  return map;
}

/** Resolve a human-readable description for an ingredient, using the resolved component name
 * instead of generic "component" text. */
export function resolveIngredientDescription(recipe, deps, ingredient) {
  if (!ingredient) return '';
  const match = ingredient.match || null;
  if (match?.type === 'component' && match.componentId) {
    const name = deps.componentName(recipe, match.componentId);
    return `${ingredient.quantity || 1}x ${name}`;
  }
  // Resolve the essence name, not the raw generated essenceId, so a tile reads "3x Fire essence"
  // (the issue-595 opaque-id class). The pure handler's describe stays generic.
  if (match?.type === 'essence' && match.essenceId) {
    const name = deps.essenceName(recipe, match.essenceId);
    const amount = Math.max(0, Number(match.amount) || 0);
    return `${amount}x ${name} essence`;
  }
  // Currency is the same opaque-id class (issue 1410): both describers print the generated
  // `match.unit`, so `formatCurrencyRequirement`, the renderer `costLabel` uses, resolves it.
  if (match?.type === 'currency' && getMatchHandler(match).isComplete(match)) {
    return formatCurrencyRequirement(match, deps.currencyUnits(recipe));
  }
  return ingredient.getDescription?.() || '';
}

/** Resolve the tile presentation for an ingredient. A tag tile shows the img of `consumedItem`,
 * the item the engine will spend (issue 553), else of any held item matching the tag (551). */
export function resolveIngredientVisual(
  recipe,
  deps,
  ingredient,
  availableItems = [],
  consumedItem = null
) {
  const match = ingredient?.match || null;
  if (match?.type === 'component' && match.componentId) {
    return {
      componentId: match.componentId,
      name: deps.componentName(recipe, match.componentId),
      img: materialImg(deps.componentImg(recipe, match.componentId)),
    };
  }

  // An essence tile resolves its name and authored icon from the definition, never the raw
  // essenceId, and carries the GM-authored colour token that tints the glyph (issue 917).
  if (match?.type === 'essence') {
    const definition = deps.essenceDefinition(recipe, match.essenceId);
    const essenceName = resolveIngredientDescription(recipe, deps, ingredient);
    const icon =
      typeof definition?.icon === 'string' && definition.icon.trim() ? definition.icon : null;
    return {
      componentId: null,
      name: essenceName,
      img: null,
      isEssence: true,
      icon,
      colorToken: essenceColorToken(definition),
    };
  }

  const name = ingredient?.getDescription?.() || '';

  if (match?.type === 'tags') {
    const matchingItem =
      consumedItem ||
      (availableItems || []).find((item) => deps.matchesItem(recipe, ingredient, item));
    return { componentId: null, name, img: materialImg(matchingItem?.img) };
  }

  if (match?.type === 'currency') {
    // Resolve the unit through the recipe's units rather than `getDescription()` (issue 1410):
    // this name wins at the option-choice site, so the raw-id sentence would surface there.
    return {
      componentId: null,
      name: resolveIngredientDescription(recipe, deps, ingredient) || name,
      img: FALLBACK_CURRENCY_IMG,
    };
  }

  return { componentId: null, name, img: null };
}

/** A group's tile caption: only the chosen option's description (issue 552), with the OR-join
 * of every option name retained as the fallback when it describes to nothing. */
export function resolveGroupDescription(recipe, deps, chosenOption, options) {
  const chosen = resolveIngredientDescription(recipe, deps, chosenOption);
  if (chosen) return chosen;
  return options.map((o) => resolveIngredientDescription(recipe, deps, o) || '').join(' OR ');
}

/** The display state for a group whose chosen option is a currency cost (issue 1493). Neither
 * number is reported — an occurrence count is not a price — and `affordable` is the
 * resolver's own verdict, never re-derived. */
function buildCurrencyIngredientState(recipe, deps, option, context, { isMissing, ...base }) {
  const handler = getMatchHandler(option.match);
  const spend = handler.isComplete(option.match) ? handler.getCurrencySpend(option.match) : null;
  const affordable = !isMissing;
  return {
    ...resolveIngredientVisual(recipe, deps, option, context.availableItems),
    ...base,
    need: spend?.amount ?? 0,
    have: 0,
    satisfied: affordable,
    isCurrency: true,
    affordable,
    // The world-scoped reason the option could not be resolved at all: a configuration refusal
    // must not present as an affordability shortfall.
    issue: context.currencyIssue || '',
  };
}

/** The display state for one essence requirement, which is amount-based: it reports
 * `delivered` beside `owned`, never the component/tag `have`, which is not net of plan (917). */
function buildEssenceIngredientState(recipe, deps, group, option, selection, context) {
  const { requirement, isMissing, missingEntry, availableItems, ...base } = context;
  const consumedItem = consumedItemForGroup(selection, group, option);
  const need = Math.max(0, Number(option?.match?.amount) || 0);
  // A selection with no pool at all (a duck-typed set that never resolved one) falls
  // back to the missing-group verdict rather than silently reading satisfied.
  const delivered = requirement
    ? requirement.delivered
    : Number(missingEntry?.have) || (isMissing ? 0 : need);
  return {
    ...resolveIngredientVisual(recipe, deps, option, availableItems, consumedItem),
    ...base,
    need,
    delivered: Number(delivered) || 0,
    owned: Number(requirement?.owned ?? delivered) || 0,
    satisfied: requirement ? requirement.satisfied === true : !isMissing,
  };
}

/** The display state for one ingredient group, dispatched on the chosen option's kind: an
 * essence share, a short group's missing entry, or a satisfied group's held quantity. */
function buildIngredientState(recipe, deps, group, context) {
  const options = group.options || [];
  const chosenOption = context.chosenByGroup.get(group?.id) ?? options[0] ?? null;
  const base = {
    groupId: group?.id ?? null,
    description: resolveGroupDescription(recipe, deps, chosenOption, options),
  };
  const missingEntry = context.missingByGroup.get(group?.id) ?? null;

  if (chosenOption?.match?.type === 'essence') {
    return buildEssenceIngredientState(recipe, deps, group, chosenOption, context.selection, {
      ...base,
      requirement: context.essenceByGroup.get(group?.id ?? null) ?? null,
      isMissing: Boolean(missingEntry),
      missingEntry,
      availableItems: context.availableItems,
    });
  }

  if (chosenOption?.match?.type === 'currency') {
    return buildCurrencyIngredientState(recipe, deps, chosenOption, context, {
      ...base,
      isMissing: Boolean(missingEntry),
    });
  }

  if (missingEntry) {
    return {
      ...resolveIngredientVisual(recipe, deps, chosenOption, context.availableItems),
      ...base,
      need: Number(missingEntry.need || chosenOption?.quantity || 1),
      have: Number(missingEntry.have || 0),
      satisfied: false,
    };
  }

  // The specific item the engine will consume for this option, so a shared tag/component tile
  // shows the consumed item rather than the first matching one (issue 553).
  const consumedItem = consumedItemForGroup(context.selection, group, chosenOption);
  const matching = context.availableItems.filter((item) =>
    deps.matchesItem(recipe, chosenOption, item)
  );
  return {
    ...resolveIngredientVisual(recipe, deps, chosenOption, context.availableItems, consumedItem),
    ...base,
    need: Number(chosenOption?.quantity || 1),
    have: matching.reduce((sum, item) => sum + readStackQuantity(item), 0),
    satisfied: true,
  };
}

/** Derive per-group ingredient display states from the same selection that determined
 * craftability. `currencyIssue` is resolved once per evaluation by the caller. */
export function buildIngredientStates(
  recipe,
  deps,
  ingredientSet,
  selection,
  availableItems,
  currencyIssue = ''
) {
  if (!ingredientSet) return [];

  const context = {
    availableItems,
    selection,
    currencyIssue,
    missingByGroup: missingEntriesByGroupId(selection),
    // The option the engine chose per group (issue 553), so the tile always mirrors
    // the option/stack the craft consumes.
    chosenByGroup: chosenOptionByGroup(ingredientSet, selection),
    // Every essence requirement's attributed share of the block, keyed by group id (issue 917) —
    // the sole source of an essence tile's reported quantity, satisfied or missing.
    essenceByGroup: essenceRequirementsByGroupId(selection),
  };

  return displayGroups(ingredientSet).map((group) =>
    buildIngredientState(recipe, deps, group, context)
  );
}

/** Fallback group label when a group has no authored name. */
function defaultGroupName(recipe, deps, options) {
  const first = options?.[0] ?? null;
  return resolveIngredientDescription(recipe, deps, first) || 'Alternatives';
}

/** Build one option descriptor for the choices model. `have` is the raw total held quantity
 * matching the option, an isolated indicator independent of the shared remaining pool. */
function buildOptionChoice(
  recipe,
  deps,
  option,
  optionIndex,
  availableItems,
  affordCurrency,
  currencyUnits = []
) {
  const visual = resolveIngredientVisual(recipe, deps, option, availableItems);
  const isCurrency = option?.match?.type === 'currency';
  if (isCurrency) {
    const handler = getMatchHandler(option.match);
    const spend = handler.isComplete(option.match) ? handler.getCurrencySpend(option.match) : null;
    const affordable = handler.affords(option.match, { affordCurrency });
    return {
      optionIndex,
      name: visual.name || resolveIngredientDescription(recipe, deps, option),
      img: visual.img,
      need: spend?.amount ?? 0,
      have: 0,
      satisfied: affordable,
      isCurrency: true,
      costLabel: spend ? formatCurrencyRequirement(spend, currencyUnits) : '',
      affordable,
    };
  }
  const matchingItems = availableItems.filter((item) => deps.matchesItem(recipe, option, item));
  const have = matchingItems.reduce((sum, item) => sum + readStackQuantity(item), 0);
  const need = Number(option?.quantity || 1);
  const choice = {
    optionIndex,
    name: visual.name || resolveIngredientDescription(recipe, deps, option),
    img: visual.img,
    need,
    have,
    satisfied: have >= need,
    isCurrency: false,
    costLabel: '',
    affordable: true,
  };
  if (visual.isEssence === true) {
    choice.isEssence = true;
    choice.icon = visual.icon ?? null;
    choice.colorToken = visual.colorToken ?? null;
  }
  return choice;
}

/** The distinct held stacks a tag option matches, or `[]` when the option is not a tag option
 * (component/currency/exact-item options resolve to a single item and offer no stack choice). */
function heldStacksForTagOption(recipe, deps, option, availableItems) {
  if (option?.match?.type !== 'tags') return [];
  return (availableItems || [])
    .filter((item) => deps.matchesItem(recipe, option, item))
    .map((item) => ({
      itemId: item.uuid || item.id,
      name: item.name ?? '',
      img: item.img ?? null,
      have: readStackQuantity(item),
    }));
}

/** Build the player-facing per-group option/stack choices (issue 552). An insufficient option
 * is included — selectable but `satisfied: false` — matching the resolver. */
export function buildIngredientChoices(
  recipe,
  deps,
  ingredientSet,
  selection,
  availableItems,
  optionOverrides,
  affordCurrency,
  currencyUnits = []
) {
  const groups = Array.isArray(ingredientSet?.ingredientGroups)
    ? ingredientSet.ingredientGroups
    : [];
  if (groups.length === 0) return [];

  const chosenByGroup = chosenOptionByGroup(ingredientSet, selection);
  const choices = [];

  for (const group of groups) {
    const options = group.options || [];
    if (options.length === 0) continue;
    const groupName =
      (typeof group.name === 'string' && group.name.trim()) ||
      defaultGroupName(recipe, deps, options);
    const chosenOption = chosenByGroup.get(group?.id) ?? options[0] ?? null;
    let selectedOptionIndex = options.indexOf(chosenOption);
    if (selectedOptionIndex < 0) selectedOptionIndex = 0;

    if (options.length > 1) {
      choices.push({
        kind: 'option',
        groupId: group?.id ?? null,
        groupName,
        selectedOptionIndex,
        options: options.map((option, idx) =>
          buildOptionChoice(
            recipe,
            deps,
            option,
            idx,
            availableItems,
            affordCurrency,
            currencyUnits
          )
        ),
      });
    }

    // Tag-stack sub-choice for the currently-selected option only.
    const selectedOption = options[selectedOptionIndex] ?? null;
    const stacks = heldStacksForTagOption(recipe, deps, selectedOption, availableItems);
    if (stacks.length > 1) {
      const consumedItem =
        (selection?.plan || []).find((entry) => entry.ingredient === selectedOption)?.item || null;
      const overrideHeldId = optionOverrides?.[group?.id]?.heldItemId ?? null;
      const selectedHeldItemId =
        overrideHeldId ?? (consumedItem?.uuid || consumedItem?.id) ?? stacks[0].itemId;
      choices.push({
        kind: 'stack',
        groupId: group?.id ?? null,
        groupName,
        optionIndex: selectedOptionIndex,
        selectedHeldItemId,
        stacks,
      });
    }
  }

  return choices;
}

/** Build essence display states for the given ingredient set: one
 * `{ type, name, icon, isEssence, need, have, satisfied }` row per requirement. */
export function buildEssenceStates(recipe, deps, ingredientSet, availableItems, features) {
  if (!ingredientSet || !features.enableEssences) return [];
  const essences = ingredientSet.essences || {};
  if (Object.keys(essences).length === 0) return [];

  const accumulatedEssences = deps.accumulateEssences(availableItems, recipe);
  return Object.entries(essences).map(([type, need]) => {
    const have = accumulatedEssences[type] || 0;
    const definition = deps.essenceDefinition(recipe, type);
    const name = definition?.name;
    const icon = definition?.icon;
    return {
      type,
      name: typeof name === 'string' && name.trim() ? name : String(type ?? ''),
      icon: typeof icon === 'string' && icon.trim() ? icon : null,
      colorToken: essenceColorToken(definition),
      isEssence: true,
      need,
      have,
      satisfied: have >= need,
    };
  });
}

/** The shared essence-funding model for one ingredient set (issue 917), `null` when essences
 * are disabled. Every quantity comes from the resolver's ledger, never the raw stack. */
export function buildEssencePool(recipe, deps, ingredientSet, selection, features) {
  const pool = selection?.essencePool ?? null;
  if (!pool || !features?.enableEssences) return null;

  const components = deps.systemComponents(recipe);
  const systemId = recipe?.craftingSystemId;

  return {
    scopeKey: ingredientSet?.id ?? null,
    requirements: pool.requirements.map((requirement) => {
      const definition = deps.essenceDefinition(recipe, requirement.essenceId);
      const name = definition?.name;
      const icon = definition?.icon;
      return {
        groupId: requirement.groupId,
        essenceId: requirement.essenceId,
        name: typeof name === 'string' && name.trim() ? name : String(requirement.essenceId ?? ''),
        icon: typeof icon === 'string' && icon.trim() ? icon : null,
        colorToken: essenceColorToken(definition),
        need: requirement.need,
        delivered: requirement.delivered,
        owned: requirement.owned,
        satisfied: requirement.satisfied,
      };
    }),
    carriers: pool.carriers.map((carrier) => {
      const component = findMatchingComponent(carrier.item, components, systemId);
      return {
        itemKey: carrier.itemKey,
        componentId: component?.id ?? null,
        name: carrier.item?.name ?? '',
        img: materialImg(carrier.item?.img),
        ownedUnits: carrier.ownedUnits,
        allocatedUnits: carrier.allocatedUnits,
        perUnit: { ...carrier.perUnit },
      };
    }),
    allocation: { ...pool.allocation },
    totals: { ...pool.totals },
    suggested: { ...pool.suggested },
  };
}

/** The dedup key one ingredient state merges under. Kind-qualified, because a component's
 * `need` is a quantity and a currency option's is a price, and the merge keeps the higher. */
export function shoppingIngredientKey(state) {
  if (state.componentId) return `cid:${state.componentId}`;
  const label = state.description ?? state.name ?? '';
  if (state.isCurrency === true) return `currency:${label}`;
  if (state.isEssence === true) return `essence:${label}`;
  return `desc:${label}`;
}

/** The material requirement to craft a recipe once via any ingredient set, for the shopping list:
 * unlike a craftability evaluation it unions every set, taking the maximum `need`. Its `deps`
 * extends the display bag with the per-evaluation seams only this aggregation reads. */
export function buildShoppingRequirement(
  recipe,
  deps,
  componentSourceActors,
  { craftingActor = null } = {}
) {
  const sourceActors = Array.isArray(componentSourceActors)
    ? componentSourceActors
    : componentSourceActors
      ? [componentSourceActors]
      : [];

  const empty = { ingredientStates: [], essenceStates: [], toolStates: [] };
  if (sourceActors.length === 0 || !Array.isArray(recipe?.ingredientSets)) return empty;
  if (recipe.ingredientSets.length === 0) return empty;

  const availableItems = sourceActors.flatMap((actor) => [...actor.items]);
  const features = deps.features(recipe);
  const affordCurrency = deps.affordCurrency(recipe, craftingActor);
  // Once per evaluation, shared by every set below (issue 1493) — the reason is a
  // property of the world's currency configuration, not of a set or a group.
  const currencyIssue = deps.currencyIssue(recipe);
  const resolveItemEssences = deps.essenceOptionResolver(recipe);

  const ingredientByKey = new Map();
  const essenceByType = new Map();
  const toolByKey = new Map();

  for (const set of recipe.ingredientSets) {
    const selection =
      typeof set.resolveIngredientSelection === 'function'
        ? set.resolveIngredientSelection(
            availableItems,
            (ingredient, item) => deps.matchesItem(recipe, ingredient, item),
            { affordCurrency, resolveItemEssences }
          )
        : {
            success: true,
            missingGroups: [],
            selectedIngredients: [],
            plan: [],
            currencySpends: [],
          };

    // Keep the highest-need state per component (need = worst-case single set).
    for (const state of buildIngredientStates(
      recipe,
      deps,
      set,
      selection,
      availableItems,
      currencyIssue
    )) {
      const key = shoppingIngredientKey(state);
      const existing = ingredientByKey.get(key);
      if (!existing || (state.need ?? 0) > (existing.need ?? 0)) {
        ingredientByKey.set(key, { ...state });
      }
    }

    for (const essence of buildEssenceStates(recipe, deps, set, availableItems, features)) {
      const existing = essenceByType.get(essence.type);
      if (!existing || (essence.need ?? 0) > (existing.need ?? 0)) {
        essenceByType.set(essence.type, { ...essence });
      }
    }

    // A tool is needed if any set requires it; prefer an unavailable/repair reading.
    for (const tool of deps.toolStates(recipe, set, sourceActors, craftingActor, selection)) {
      const key = tool.componentId ?? tool.name;
      const existing = toolByKey.get(key);
      if (!existing || (existing.available === true && tool.available !== true)) {
        toolByKey.set(key, tool);
      }
    }
  }

  // Re-derive satisfaction against the merged max need, restating an essence requirement's
  // uncapped `owned`. Currency is exempt (issue 1493): its verdict is the resolver's.
  const ingredientStates = [...ingredientByKey.values()].map((state) => {
    if (state.isCurrency === true) return { ...state };
    const held = state.isEssence === true ? (state.owned ?? 0) : (state.have ?? 0);
    return { ...state, have: held, satisfied: held >= (state.need ?? 0) };
  });
  const essenceStates = [...essenceByType.values()].map((essence) => ({
    ...essence,
    satisfied: (essence.have ?? 0) >= (essence.need ?? 0),
  }));

  return { ingredientStates, essenceStates, toolStates: [...toolByKey.values()] };
}
