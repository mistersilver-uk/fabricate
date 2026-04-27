# Elegant Objects Notes

Source direction:

- `https://www.elegantobjects.org/`
- Yegor Bugayenko, `Seven Virtues of a Good Object`
- Yegor Bugayenko, `Printers Instead of Getters`

## Useful Principles For Fabricate

### Behavior Before Data Plumbing

- Prefer objects or modules that own behavior instead of exposing internal state for outside orchestration.
- Reach for representation-producing methods only when the representation is part of the boundary.
- Getter-heavy APIs are a smell when they turn a unit into a passive data bag.

Before:

```js
const recipe = manager.getRecipe(id);
const ingredients = recipe.getIngredients();
const result = resolver.resolve(actor, ingredients);
```

After:

```js
const result = recipeBook.resolveRecipeForActor(id, actor);
```

The better boundary owns the workflow. Callers ask for the behavior they need instead of pulling internal data across the seam.

### Small, Cohesive Units

- A good unit has one clear reason to change.
- If the best description of a file, class, or module uses "and", the design is probably overloaded.
- Split responsibilities before adding more conditionals or mode flags.

### Explicit Contracts And Composition

- Public behavior should have a clear contract.
- Prefer composing narrow collaborators over inheritance hierarchies or broad utility surfaces.
- In JavaScript, exported module APIs are the contract. Keep them small and intention-revealing.

## Boundary Shape Selection

Choose the simplest shape that makes ownership and dependencies explicit.

### ES Module API

Use exported functions when behavior is cohesive, mostly stateless, and dependency-free or receives explicit parameters.

```js
export function canCraft(recipe, inventory) {
  return recipe.requirements.every((requirement) => inventory.includes(requirement.itemId));
}
```

Avoid adding a class only to group stateless functions.

### Plain Object

Use a plain object for immutable values, configuration, or a narrow strategy object.
Assume `getSourceUuid` is imported from `src/utils/sourceUuid.js`.

```js
const sourceItemMatch = {
  matches(item, sourceItemUuid) {
    return item.uuid === sourceItemUuid || getSourceUuid(item) === sourceItemUuid;
  },
};
```

This is a narrow strategy object. It owns one rule and relies on the shared source-UUID resolver instead of duplicating Foundry source-field logic. Do not use a plain object as a mutable bag that outside code wires together through getters and setters.

### Closure Or Factory

Use a closure when a small, stable collaborator set should be captured without exposing internals.

```js
export function createCraftabilityEvaluator({ inventoryReader, requirementResolver }) {
  return {
    evaluate(actor, recipe) {
      const inventory = inventoryReader.itemsFor(actor);
      return requirementResolver.check(recipe.requirements, inventory);
    },
  };
}
```

If the closure grows several mutable fields or lifecycle methods, consider a class.

### Class

Use a class when identity, lifecycle, state transitions, or several collaborators are clearer with named behavior.

```js
export class CraftingSession {
  constructor({ recipe, actor, inventory }) {
    this.recipe = recipe;
    this.actor = actor;
    this.inventory = inventory;
  }

  canStart() {
    return this.inventory.hasAll(this.recipe.requiredItems());
  }
}
```

Keep construction boring. The constructor should not fetch the recipe, read Foundry globals, or assemble the inventory.

### Svelte Store

Use a Svelte store for UI state and derived view state. Do not make it own domain workflows just because UI components can import it.

Good store work:

- selected tab, filter text, expanded rows
- derived recipe rows for display
- async UI loading status

Move domain decisions such as visibility, craftability, and recipe mutation to domain modules that the store calls.

### Foundry Adapter Or Runtime Edge

Use a thin adapter when behavior depends on `game`, `ui`, `Hooks`, `CONFIG`, document classes, clocks, randomness, or third-party statics.

```js
export function createFoundryItemTypes({ game }) {
  return {
    all() {
      return Array.from(game.documentTypes.Item ?? []);
    },
  };
}
```

The adapter may touch Foundry. The domain object should receive `foundryItemTypes`, not `game`.

### Avoid Static And Global Utility Thinking

- The strict EO rule is "no static methods." The practical Fabricate translation is: do not hide behavior in global mutable helpers or generic utility buckets.
- Private pure helpers inside one module are fine.
- Shared exported helpers should exist only when they express a real abstraction with a stable contract.

Before:

```js
export function normalizeRecipe(data) {}
export function calculateCraftability(actor, recipe) {}
export function openRecipeSheet(recipe) {}
export function findSourceItem(recipe) {}
```

After:

```js
export function normalizeRecipe(data) {}

export class CraftabilityEvaluator {
  evaluate(actor, recipe) {}
}

export function createRecipeSheetLauncher({ ui }) {
  return { open(recipe) {} };
}
```

The split follows owned behavior: normalization, craftability, and UI launch are different reasons to change.

### Prefer Stable State

- Favor immutable inputs, final configuration, and narrow mutation zones.
- Mutation is less risky when it is local, explicit, and easy to observe in tests.
- Return new representations at boundaries when the caller does not need to observe identity.
- Mutate only where lifecycle or Foundry document semantics require identity.

Before:

```js
export function addRequirement(recipe, requirement) {
  recipe.requirements.push(requirement);
  return recipe;
}
```

After:

```js
export function withRequirement(recipe, requirement) {
  return {
    ...recipe,
    requirements: [...recipe.requirements, requirement],
  };
}
```

### Name Things By What They Are

- Avoid job-title names like `Reader`, `Parser`, `Manager`, or `Service` unless the domain genuinely calls for them.
- Favor names that reveal the owned concept or boundary, not vague operational intent.
- Prefer `RecipeBook`, `CraftingSession`, `IngredientRequirement`, or `ActorInventory` over `RecipeManager`, `CraftingService`, or `InventoryHelper` when those names better describe the concept.
- A name with "and" in its honest description usually points to a split.

## Adaptation Notes

- Fabricate uses ES modules, functions, Svelte stores, and Foundry globals at runtime edges. Do not force everything into classes.
- The point is explicit ownership, low surprise, and decomposable seams, not ideological purity.
- Leave a simple private pure helper alone when it supports one cohesive module and does not hide dependencies.
- Prefer a small exported function over an object when there is no identity, lifecycle, captured collaborator, or meaningful behavior cluster.
