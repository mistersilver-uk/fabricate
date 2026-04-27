# Testable Code Notes

Source direction:

- `https://github.com/mhevery/guide-to-testable-code`

Use these as smell detectors for code that is hard to change or test.

## Constructor Does Real Work

Warning signs:

- object creation performs I/O, branching setup, service lookup, or heavy graph construction
- constructors or init methods contain control flow beyond cheap validation and assignment
- field initializers or static setup perform hidden work

Preferred move:

- Keep constructors and factories boring.
- Move expensive or environment-dependent work to the composition edge or an explicit method.

Before:

```js
class RecipeBrowser {
  constructor(actorId) {
    this.actor = game.actors.get(actorId);
    this.recipes = RecipeManager.forSystem(game.system.id).getAvailable(this.actor);
  }
}
```

After:

```js
class RecipeBrowser {
  constructor({ actor, recipeCatalog }) {
    this.actor = actor;
    this.recipeCatalog = recipeCatalog;
  }

  availableRecipes() {
    return this.recipeCatalog.availableFor(this.actor);
  }
}
```

The composition edge may use `game`. The object receives the collaborators it needs.

## Digging Into Collaborators

Warning signs:

- a dependency is passed in only so the code can fetch something else from it
- call chains walk an object graph through multiple dots
- parameters are named `context`, `environment`, `container`, `manager`, or similar grab bags

Preferred move:

- Inject the specific collaborator you actually need.
- Ask for the dependency directly instead of reaching through another object to find it.

Before:

```js
export function learnRecipe(context, actor, recipeId) {
  const recipe = context.systems.getActive().recipes.find(recipeId);
  return context.services.visibility().learnRecipe({ actor, recipe });
}
```

After:

```js
export function learnRecipe({ recipeCatalog, recipeLearning }, actor, recipeId) {
  const recipe = recipeCatalog.find(recipeId);
  return recipeLearning.add(actor, recipe);
}
```

The function names its true dependencies instead of depending on a container shape.

## Brittle Global State And Singletons

Warning signs:

- hidden mutable module state
- singleton access, registries, or service locators
- static initialization that changes behavior for the whole process
- tests that depend on execution order or explicit global reset

Preferred move:

- Make dependencies explicit.
- Wrap unavoidable third-party statics or globals in thin adapters that tests can replace.

Before:

```js
export function itemTypes() {
  return game.documentTypes.Item.map((type) => type.toLowerCase());
}
```

After:

```js
export function createFoundryItemTypes({ game }) {
  return {
    all() {
      return Array.from(game.documentTypes.Item ?? []).map((type) => type.toLowerCase());
    },
  };
}
```

Foundry access is still real, but it is localized and replaceable in tests.

## Class Or Module Does Too Much

Warning signs:

- the best description contains "and"
- fields are only used by some methods
- unrelated responsibilities share one stateful unit
- collaborators are dumb because one class coordinates everything

Preferred move:

- Split by responsibility.
- Extract the smallest concept that lets each unit own one reason to change.
- In legacy code, sprout a new unit around the new behavior instead of enlarging the god object.

Before:

```js
class CraftingStoreController {
  loadRecipes() {}
  evaluateCraftability() {}
  persistKnownRecipe() {}
  sortVisibleRows() {}
}
```

After:

```js
class CraftabilityEvaluator {
  evaluate(actor, recipe) {}
}

class LearnedRecipeRegistry {
  add(actor, recipe) {}
}

function visibleRecipeRows({ recipes, craftability }) {}
```

The store or controller coordinates UI state. Domain decisions move to separately testable seams.

## Testing Implications

- Good seams let tests verify behavior without mocks returning mocks.
- You should rarely need to mock getters or setters.
- If the setup for one test is surprisingly hard, the production boundary is probably wrong.
- A test that resets multiple globals is a signal to localize runtime access.
- A test that mocks a context object returning another mock should inject the final collaborator instead.
- A test that asserts private fields or intermediate calls is often compensating for a missing public behavior.

## Review Prompts

Use these prompts when test pain suggests a structural problem:

- What behavior should the test observe without reaching inside the unit?
- Which dependency is the unit actually asking for after it digs through a context object?
- Can construction be replaced with plain object setup plus one explicit method call?
- Can the Foundry runtime dependency move to one adapter or composition call site?
- Is the Svelte store testing domain logic that belongs in a module under `src/models/`, `src/systems/`, or `src/utils/`?
