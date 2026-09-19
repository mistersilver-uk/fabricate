/** Whether a concrete owned item satisfies a recipe ingredient or a library tool.
 * Every matcher takes the recipe first and reads its system through `deps`, never a manager. */

import { getFabricateFlag } from '../config/flags.js';
import { getIngredientComponentId, getMatchHandler } from '../models/match/matchTypes.js';
import { matchComponentByName } from '../utils/componentNameMatch.js';
import { findMatchingComponent } from '../utils/essenceResolver.js';
import {
  itemIsToolByDurableIdentity,
  itemResolvesToComponent,
  itemResolvesToTool,
} from '../utils/sourceUuid.js';

/** Check whether a concrete item satisfies a recipe ingredient. `resolveComponent` is the
 * alchemy-path resolver (issue 578), defaulting to {@link findMatchingComponent}. */
export function ingredientMatchesItem(recipe, deps, ingredient, item, resolveComponent) {
  const features = deps.features(recipe);
  // A component (or legacy systemItem) match resolves its id via the handler; tags/currency/no
  // match return null and fall to the bare-field fallback, then to `ingredientMatchesItemByFields`.
  const componentId = getIngredientComponentId(ingredient);

  if (componentId) {
    const managedItem = deps.component(recipe, componentId);
    if (!managedItem) return false;

    if (
      itemResolvesToComponent(
        item,
        managedItem,
        deps.systemComponents(recipe),
        recipe?.craftingSystemId,
        resolveComponent
      )
    )
      return true;

    // Source-UUID matching failed — fall back to an exact case-insensitive name match, because
    // `_stats.duplicateSource` points at the original template, so a template copy has no ref
    // back (issue 540).
    const byName = matchComponentByName(item, managedItem, {
      caseSensitive: false,
      systemId: recipe?.craftingSystemId,
    });
    if (!byName) return false;
  } else if (getMatchHandler(ingredient?.match).type === 'tags') {
    // A by-tag ingredient's authored tags live on the managed component definition rather than
    // the item's flags, so the item's component is resolved here (issue 857).
    if (!tagIngredientMatchesItem(recipe, deps, ingredient, item, features, resolveComponent)) {
      return false;
    }
  } else if (!ingredientMatchesItemByFields(ingredient, item, features)) {
    return false;
  }

  return true;
}

/** Whether an owned item satisfies a by-tag ingredient. Fabricate never stamps
 * `flags.fabricate.tags` onto items (issue 857), so the rule is evaluated against the union of
 * the resolved component's tags and any item-level flag. */
export function tagIngredientMatchesItem(
  recipe,
  deps,
  ingredient,
  item,
  features,
  resolveComponent
) {
  if (!features.enableTags) return false;
  const handler = getMatchHandler(ingredient?.match);
  const resolve = typeof resolveComponent === 'function' ? resolveComponent : findMatchingComponent;
  const component = resolve(item, deps.systemComponents(recipe), recipe?.craftingSystemId);
  const componentTags = Array.isArray(component?.tags) ? component.tags : [];
  const flagTags = getFabricateFlag(item, 'tags', []);
  const itemTags = [...new Set([...(Array.isArray(flagTags) ? flagTags : []), ...componentTags])];
  return handler.matchesItem(ingredient.match, item, { features, itemTags });
}

/** Check whether a concrete item satisfies a Tool's presence requirement — the wide,
 * non-destructive gate (issue 561), resolved against the Tools library directly. */
export function toolMatchesItem(recipe, deps, tool, item) {
  if (!tool) return false;
  const tools = deps.systemTools(recipe);
  if (itemResolvesToTool(item, tool, tools, recipe?.craftingSystemId)) return true;
  // Snapshot-name fallback (presence only, never destructive): the item-sourced tool's own
  // snapshot name, or the linked component's name for a migrated componentId-tool (issue 540).
  const fallbackName = tool.name || deps.component(recipe, tool.componentId)?.name || '';
  if (!fallbackName) return false;
  return matchComponentByName(
    item,
    { name: fallbackName, id: tool.id },
    { caseSensitive: false, systemId: recipe?.craftingSystemId }
  );
}

/** Whether an owned item may be selected for a Tool's usage or breakage — the narrow
 * durable-identity gate (issue 561), the destructive counterpart to {@link toolMatchesItem}. */
export function toolMatchesItemByIdentity(recipe, deps, tool, item) {
  if (!tool || tool.id == null) return false;
  return itemIsToolByDurableIdentity(
    item,
    tool,
    deps.systemTools(recipe),
    recipe?.craftingSystemId
  );
}

/** The legacy bare-field path: an exact item uuid, a terminal match handler, the flat
 * `ingredient.tag`, then the `alternatives` fall-through. */
export function ingredientMatchesItemByFields(ingredient, item, features) {
  if (ingredient.itemUuid && item.uuid === ingredient.itemUuid) return true;

  // Dispatch only for terminal match types. A `component`/null/unknown match falls through to
  // the legacy bare-field `ingredient.tag` block and the `alternatives` recursion below.
  const handler = getMatchHandler(ingredient.match);
  if (handler.isTerminalInventoryMatch) {
    return handler.matchesItem(ingredient.match, item, { features });
  }

  if (ingredient.tag) {
    if (!features.enableTags) return false;
    const itemTags = getFabricateFlag(item, 'tags', []);
    if (!itemTags.includes(ingredient.tag)) return false;
    return true;
  }

  if (Array.isArray(ingredient.alternatives) && ingredient.alternatives.length > 0) {
    return ingredient.alternatives.some((alt) =>
      ingredientMatchesItemByFields(alt, item, features)
    );
  }

  return false;
}
