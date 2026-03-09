---
layout: default
title: SignatureValidator
parent: API Reference
nav_order: 7
---

# SignatureValidator

Validates that the ingredient signatures of all recipes in a crafting system are unambiguous.

A **signature** is the set of components that can satisfy a given ingredient set. If two ingredient sets — whether from different recipes or from alternate sets within the same recipe — share at least one component that could satisfy both, the runtime cannot determine which recipe a player intends to craft. `SignatureValidator` detects these conflicts before a recipe is saved, preventing ambiguous crafting situations.

**Access:** `game.fabricate.api.SignatureValidator` (constructor)

The validator is not a singleton service. You instantiate it with a crafting system manager:

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

For `component`-type ingredients the result is a single-element set containing the ingredient's `componentId`. For `tags`-type ingredients the result is the set of all managed component IDs whose tags satisfy the ingredient's tag match rule.

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

An ingredient group is satisfied when one of its options is satisfied. This method returns the full set of components that could satisfy the group through any option.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `group` | `object` | An ingredient group with an `options` array |
| `systemComponents` | `object[]` | All managed components in the crafting system |

**Returns:** `Set<string>`

---

### computeSignature(ingredientSet, systemComponents)

Computes the signature for an ingredient set.

The signature is an array of sets — one per ingredient group. Each set contains the component IDs that could satisfy that group. The array represents all required groups (AND semantics across groups).

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `ingredientSet` | `object` | An ingredient set with an `ingredientGroups` array |
| `systemComponents` | `object[]` | All managed components in the crafting system |

**Returns:** `Set<string>[]`

---

### signaturesOverlap(sigA, sigB)

Returns `true` if two signatures share at least one component ID across all their groups.

This is a conservative check: if any component appears in both signatures (regardless of which group it belongs to), the signatures are considered overlapping. This avoids false negatives at the cost of occasional false positives for complex multi-group recipes whose groups are disjoint in practice.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `sigA` | `Set<string>[]` | Signature from `computeSignature` |
| `sigB` | `Set<string>[]` | Signature from `computeSignature` |

**Returns:** `boolean`

---

### validateSystem(systemId)

Validates all recipes in a crafting system for ingredient signature conflicts.

Computes the signature for every ingredient set in every recipe, then performs pairwise overlap detection. An ingredient set is never compared with itself (same recipe ID and same set ID), but alternate ingredient sets within the same recipe are compared against each other and against sets from other recipes.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `systemId` | `string` | The crafting system ID to validate |

**Returns:** `{ valid: boolean, conflicts: object[] }`

Each conflict object has:

| Field | Type | Description |
|:------|:-----|:------------|
| `recipeA` | `{ id, name }` | First recipe in the conflict pair |
| `ingredientSetA` | `string` | Ingredient set ID from recipe A |
| `recipeB` | `{ id, name }` | Second recipe in the conflict pair |
| `ingredientSetB` | `string` | Ingredient set ID from recipe B |
| `message` | `string` | Human-readable description of the conflict |

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

Runs a full `validateSystem` call and filters the conflicts list to only those involving the given recipe. Use this in the recipe editor before saving to catch conflicts introduced by a new or updated recipe.

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

The recipe editor calls `validateRecipe` automatically when you save a recipe and blocks the save when any conflicts are found. The validation banner in the editor identifies which other recipe's ingredient set overlaps with yours so you can resolve the ambiguity.

Common causes of signature conflicts:

- Two recipes that both accept any herb (tag match `any` on `"herb"`) will conflict when the system has overlapping herbs.
- A recipe using a specific component (e.g. Iron Ingot) and a recipe using a tag that includes Iron Ingot will conflict.
- Alternate ingredient sets within the same recipe should use disjoint components if you do not want the engine to arbitrarily select between them.

## See Also

- [ResolutionModeService]({% link api/resolution-service.md %}) -- recipe structure validation (mode rules, cardinality)
- [RecipeManager]({% link api/recipe-manager.md %}) -- recipe CRUD and craftability checks
