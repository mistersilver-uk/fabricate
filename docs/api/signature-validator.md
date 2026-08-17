---
layout: default
title: SignatureValidator
parent: API Reference
nav_order: 7
---

# SignatureValidator

Validates that the ingredient signatures of all recipes in a crafting system are unambiguous.

A **signature** is the set of components that can satisfy a given ingredient set.
Two ingredient sets (whether from different recipes or alternate sets within the same recipe) conflict only when they are INSEPARABLE: a plausible submission of EACH one would also satisfy the OTHER, so no submission could ever let the runtime tell them apart.
Merely sharing a component is not enough on its own (see `signaturesOverlap` below): the runtime disambiguates a strict subset/superset pair automatically, and only a genuinely symmetric overlap blocks enabling the affected recipes, or a crafting-system edit that would introduce one.

**Access:** `game.fabricate.api.SignatureValidator` (constructor)

The validator is not a singleton service.
You instantiate it with a crafting system manager:

```javascript
Hooks.once('fabricate.ready', () => {
  const { SignatureValidator } = game.fabricate.api;
  const csm = game.fabricate.getCraftingSystemManager();
  const validator = new SignatureValidator(csm);
});
```

---

## Methods

### expandIngredientToComponentIds(ingredient, systemComponents)

Expands a single ingredient to the set of component IDs that can satisfy it.

For `component`-type ingredients the result is a single-element set containing the ingredient's `componentId`.
For `tags`-type ingredients the result is the set of all managed component IDs whose tags satisfy the ingredient's tag match rule.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `ingredient` | `object` | An ingredient-like object with a `match` property |
| `systemComponents` | `object[]` | All managed components in the crafting system |

**Returns:** `Set<string>`

Tag match semantics:

| `match.tagMatch` | Behaviour |
|:-----------------|:----------|
| `"all"` | Component must carry every tag listed in `match.tags` |
| `"any"` (default) | Component must carry at least one tag listed in `match.tags` |

**Example:**

```javascript
Hooks.once('fabricate.ready', () => {
  const { SignatureValidator } = game.fabricate.api;
  const csm = game.fabricate.getCraftingSystemManager();
  const validator = new SignatureValidator(csm);

  const components = csm.getComponentsForSystem('alchemy-system');
  const ingredient = {
    match: { type: 'tags', tags: ['herb'], tagMatch: 'any' }
  };

  const ids = validator.expandIngredientToComponentIds(ingredient, components);
  console.log([...ids]); // e.g. ['lavender-id', 'sage-id', 'mint-id']
});
```

---

### expandGroupToComponentIds(group, systemComponents)

Expands an ingredient group to the union of component IDs that can satisfy any of its options.

An ingredient group is satisfied when one of its options is satisfied.
This method returns the full set of components that could satisfy the group through any option.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `group` | `object` | An ingredient group with an `options` array |
| `systemComponents` | `object[]` | All managed components in the crafting system |

**Returns:** `Set<string>`

---

### computeSignature(ingredientSet, systemComponents)

Computes the signature for an ingredient set.

The signature is an array of sets, one per ingredient group.
Each set contains the component IDs that could satisfy that group.
The array represents all required groups (AND semantics across groups).

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `ingredientSet` | `object` | An ingredient set with an `ingredientGroups` array |
| `systemComponents` | `object[]` | All managed components in the crafting system |

**Returns:** `Set<string>[]`

---

### signaturesOverlap(entryA, entryB)

Returns `true` only when two ingredient sets are INSEPARABLE, meaning no possible pair of submissions could ever let the runtime tell them apart (issue 774).
This is a symmetric transversal check, not a simple shared-component test.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

A plausible submission of `entryA` (a **transversal**: one satisfying option chosen per required group, supplied at its required quantity) must also fully satisfy every group of `entryB`, AND a plausible submission of `entryB` must also fully satisfy `entryA`, before the pair is reported as overlapping.
A strict subset/superset pair (for example, an ingredient set needing `{Water}` and another needing `{Water}` plus `{Herb}`) is no longer reported as a conflict, because the runtime's most-specific-match rule always resolves it by brewing the superset recipe when the extra ingredient is present.
Two incomparable sets that merely share one satisfying component are not reported either, because a submission that would satisfy both safely fizzles at runtime instead of crafting the wrong recipe.
A set with no groups, or a group no component can satisfy, is inert and never overlaps with anything.

<!-- markdownlint-enable markdownlint-sentences-per-line -->

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `entryA` | `{ signature: Set<string>[], groupOptions }` | A compiled entry, not a bare `computeSignature` result. `groupOptions` (from `computeGroupOptions`) preserves the quantity each option requires, which `signature` alone discards. |
| `entryB` | `{ signature: Set<string>[], groupOptions }` | Same shape as `entryA` |

**Returns:** `boolean`

---

### validateSystem(systemId)

Validates every ENABLED recipe in a crafting system for ingredient signature conflicts.
A disabled recipe is not scanned and cannot appear in the result, on either side of a conflict.

Computes the signature for every ingredient set in every enabled recipe, then performs pairwise overlap detection.
An ingredient set is never compared with itself (same recipe ID and same set ID), but alternate ingredient sets within the same recipe are compared against each other and against sets from other enabled recipes.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `systemId` | `string` | The crafting system ID to validate |

**Returns:** `{ valid: boolean, conflicts: object[] }`

<!-- markdownlint-disable markdownlint-sentences-per-line -->

Each conflict object has:

| Field | Type | Description |
|:------|:-----|:------------|
| `recipeA` | `{ id, name }` | First recipe in the conflict pair |
| `ingredientSetA` | `string` | Ingredient set ID from recipe A |
| `recipeB` | `{ id, name }` | Second recipe in the conflict pair |
| `ingredientSetB` | `string` | Ingredient set ID from recipe B |
| `code` | `string` | Stable issue code, currently always `signatureCollision`, for localizing the conflict |
| `params` | `object` | `{ recipeA, recipeB, setA, setB, components }`. Recipe names, author-given set names (or 1-based positions when unnamed), and the shared managed-component names. |
| `message` | `string` | Default-English description of the conflict, built from `params` |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**Example:**

```javascript
Hooks.once('fabricate.ready', () => {
  const { SignatureValidator } = game.fabricate.api;
  const csm = game.fabricate.getCraftingSystemManager();
  const validator = new SignatureValidator(csm);

  const result = validator.validateSystem('alchemy-system');
  if (!result.valid) {
    result.conflicts.forEach(c => {
      console.warn(c.message);
      // e.g. 'Overlapping signatures between "Healing Potion" (set Default)
      //       and "Mending Salve" (set Default)'
    });
  }
});
```

---

### validateRecipe(recipe, systemId)

Validates a single recipe against all others in its system.

Runs a full `validateSystem` call and filters the conflicts list to only those involving the given recipe.
Because `validateSystem` only scans enabled recipes, a disabled `recipe` (or one that is not yet in the system's recipe list at all) is never scanned and trivially returns `valid: true`, which is not evidence that it is free of conflicts.
Fabricate's own recipe editor does not call this method: it previews the same collision question through [RecipeManager#getSignatureConflicts]({% link api/recipe-manager.md %}), which answers from a retained per-system report instead of running a fresh audit on every call, and which evaluates an unsaved or disabled candidate as though it had already been saved and enabled.
Call `validateRecipe` directly, as in the example below, when you want a one-shot full-audit answer for a single already-enabled recipe, for example from a macro or a companion module.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `recipe` | `object` | Recipe object with `id`, `craftingSystemId`, and `ingredientSets` |
| `systemId` | `string` | The crafting system ID to validate against |

**Returns:** `{ valid: boolean, conflicts: object[] }`

**Example:**

```javascript
Hooks.once('fabricate.ready', () => {
  const { SignatureValidator } = game.fabricate.api;
  const csm = game.fabricate.getCraftingSystemManager();
  const validator = new SignatureValidator(csm);

  const rm = game.fabricate.getRecipeManager();
  const recipe = rm.getRecipe('healing-potion-recipe-id');

  const result = validator.validateRecipe(recipe, 'alchemy-system');
  if (!result.valid) {
    result.conflicts.forEach(c => ui.notifications.warn(c.message));
  }
});
```

---

## When Conflicts Are Reported

Neither `validateRecipe` nor `validateSystem` is what the recipe editor calls when you save a recipe.
The editor's save path runs through [RecipeManager]({% link api/recipe-manager.md %}), whose `createRecipe` and `updateRecipe` methods enforce signature uniqueness only on an ENABLE transition: creating a recipe already marked enabled, or updating a disabled recipe to enabled.
That check is blocked when the ingredient signature collides with an already-enabled recipe.
Editing an already-enabled recipe's ingredient sets, or saving a recipe that stays disabled, is not re-checked for signature conflicts at save time.
The recipe editor's Validation tab surfaces any conflict as a check row naming the other recipe and ingredient set involved.

`validateSystem` does have real callers of its own, just not the recipe editor's save path.
[CraftingSystemManager]({% link api/system-manager.md %})'s `updateSystem` blocks a crafting-system edit (for example, to its essences or components) that would introduce a collision among its recipes, and the Manager's System Overview validation report also runs `validateSystem` to list any existing collision as a blocking issue.
Both of those calls, like `validateRecipe` and `validateSystem` themselves, only ever find a conflict in an alchemy-mode system.
`validateRecipe` has no internal caller in Fabricate today.
Call it directly when you need a one-shot answer for a single recipe outside those paths.

Common causes of signature conflicts:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

- Two recipes with an IDENTICAL ingredient set (for example, both requiring any one component tagged `herb`, and nothing else) always conflict: no submission can ever distinguish them.
- Two ingredient sets that are not identical can still conflict when the same item can satisfy both, so that EACH set's own natural submission also happens to satisfy the other.
  For example, a component tagged both `rare` and `metal` satisfies a set requiring `rare` and a set requiring `metal` equally, so submitting it to satisfy either set's own requirement also satisfies the other's.
- A strict subset/superset pair does NOT conflict.
  A recipe requiring a specific component (e.g. Iron Ingot) and a recipe requiring a tag that includes Iron Ingot among others are disambiguated automatically: the engine always picks the more specific (subset) recipe when its exact requirement is met, and falls back to the broader one otherwise.
- Alternate ingredient sets within the same recipe follow the same rule as sets from different recipes.
  The engine never picks between them arbitrarily: it fails safely (matches nothing) when two sets are an incomparable tie, and always prefers the uniquely more specific set when one applies.

<!-- markdownlint-enable markdownlint-sentences-per-line -->

## See Also

- [ResolutionModeService]({% link api/resolution-service.md %}).
  Recipe structure validation (mode rules, cardinality).
- [RecipeManager]({% link api/recipe-manager.md %}).
  Recipe CRUD and craftability checks.
