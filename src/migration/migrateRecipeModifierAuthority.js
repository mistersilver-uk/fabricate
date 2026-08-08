/**
 * 1.20.0 — Retire the `byRecipe` modifier policy and stamp the new system-level
 * `craftingCheck.recipeModifierAuthority` (issue 1055; pure, clone-first, idempotent,
 * version-gated).
 *
 * WHY THIS EXISTS — read this before deleting it as redundant. Issue 1055 splits one
 * conflated setting into two orthogonal ones. `defaultModifierPolicy` used to answer both
 * "how are eligible modifiers combined?" and "may a recipe override the system?", because
 * its fourth value `byRecipe` meant "delegate to the recipe". Those are now separate
 * fields: the policy keeps only the three combination rules (`addAll` / `highest` /
 * `playerPicks`) and the new `recipeModifierAuthority` owns delegation.
 *
 * Two transforms, in this order:
 *
 *  1. **`byRecipe` → `addAll`**, at both levels — `craftingCheck.defaultModifierPolicy`
 *     and every recipe's `craftingModifier.policy`. `byRecipe` and `addAll` already
 *     reduce identically (both sum their eligible set — see the `resolveCraftingModifierScalar`
 *     reduction table in `craftingModifierResolver.js`), and the eligible-id resolution
 *     already prefers the recipe's own `modifierIds`, so the delegation `byRecipe` used to
 *     express is carried entirely by the authority stamp below.
 *
 *     THIS REWRITE IS DELIBERATELY NOT LOAD-BEARING FOR BEHAVIOUR. `normalizeModifierPolicy`
 *     carries a `LEGACY_POLICY_ALIASES` entry that translates a persisted `byRecipe` at
 *     resolution time whether or not this migration ever ran, so the two paths agree by
 *     construction and this transform is observationally inert at both levels. It exists to
 *     normalize STORED data — an upgraded world should not keep a token the authoring UI no
 *     longer offers and the validator no longer accepts. Do not reach for it to explain a
 *     change in a rolled formula; the alias already covers that.
 *  2. **Stamp `recipeModifierAuthority`**, but ONLY where it is absent or `null`, and only
 *     into a system that already carries a `craftingCheck` block (see the no-seed note on
 *     `applyRecipeModifierAuthority`). `setAndRule` (recipe may override both the set and
 *     the rule) when the system was delegating before this change — either its persisted
 *     policy was `byRecipe`, or any of its recipes carries a `craftingModifier` — otherwise
 *     `none`.
 *
 * THE STAMP IS CONDITIONAL ON PURPOSE — do not "simplify" it into an unconditional
 * recompute. An authored value always wins, for two reasons. It makes the migration
 * idempotent under re-run without relying on the version gate, and the View Lab depends on
 * it directly: `tests/view-lab/world/labWorld.js` boots the real runner over its fixtures
 * (`fabricate.initialize()`), the shim sets `game.user` to `game.users.activeGM` so the
 * primary-GM gate passes, and no lab fixture seeds `migrationVersion` — so `lastRunVersion`
 * is `'0.0.0'` and EVERY migration runs on EVERY lab build. An unconditional recompute
 * would overwrite an authored `none` fixture and corrupt the exact frame that case exists
 * to capture.
 *
 * The derivation reads the delegation signal BEFORE transform 1 erases `byRecipe`. Doing
 * these in the other order would collapse every delegating system to `none`.
 *
 * PURE AND CLONE-FIRST. The runner spread-merges a migration's return value
 * (`data = { ...data, ...result }`), so this returns `{ recipes, systems }` rather than
 * mutating the runner's payload. Clone-first is also what makes the no-throw guarantee
 * total: the runner restores its pre-migration checkpoint only on the FATAL branch — a
 * non-fatal throw is a bare `console.warn` and the pass continues to persist — so an
 * in-place migration that threw halfway would persist a half-applied world. Nothing here
 * throws (every level is guarded and a malformed system/recipe/check is skipped rather
 * than repaired — normalization is the normalizer's job), and because only the clone is
 * ever touched, even a hypothetical throw leaves the runner's payload untouched.
 *
 * Mutated setting keys: `craftingSystems` and `recipes`.
 *
 * Idempotent under re-run: transform 1 is a fixpoint (`addAll` is not `byRecipe`), and
 * transform 2 fires only on an unresolved (absent/`null`) authority, so a second pass
 * finds every authority already resolved and changes nothing.
 *
 * Downgrade target `1.19.0` is lossless. The pre-change build sums for `addAll` exactly as
 * it did for `byRecipe`, and `_normalizeCheckModifierConfig` is an allowlist literal that
 * never spreads its source, so it silently drops the unknown `recipeModifierAuthority` key
 * on read — a downgraded world lands on that release's own schema and behaviour.
 */

const LEGACY_POLICY = 'byRecipe';
const REPLACEMENT_POLICY = 'addAll';

const AUTHORITY_KEY = 'recipeModifierAuthority';
const AUTHORITY_DELEGATING = 'setAndRule';
const AUTHORITY_WITHHELD = 'none';

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return structuredClone(value);
}

/**
 * True when a recipe carries a per-recipe crafting-modifier override of any kind. This is
 * the structural "was this system delegating?" signal, deliberately keyed on the presence
 * of the block rather than on its contents: an override naming only `modifierIds` is just
 * as much a delegation as one naming a policy.
 * @param {unknown} recipe
 * @returns {boolean}
 */
function _carriesCraftingModifier(recipe) {
  return _isPlainObject(recipe) && _isPlainObject(recipe.craftingModifier);
}

/**
 * Map one recipe's retired `byRecipe` policy to `addAll`. A recipe with no override, or
 * with any other policy, is left exactly as it is.
 * @param {unknown} recipe
 */
function _demoteRecipePolicy(recipe) {
  if (!_carriesCraftingModifier(recipe)) return;
  const modifier = recipe.craftingModifier;
  if (modifier.policy === LEGACY_POLICY) modifier.policy = REPLACEMENT_POLICY;
}

/**
 * Apply the whole 1.20.0 transform to ONE system and the recipes belonging to it.
 *
 * Both arguments are mutated in place, so callers must hand over structures they already
 * own (a clone). Splitting the per-system transform out this way is what lets the
 * world-setting migration below and the export-payload upcast in `migrateExportPayload.js`
 * share one derivation instead of maintaining two copies of it: an export bundle is
 * exactly this shape already — one system plus its recipes — with no grouping to do.
 *
 * @param {unknown} system - one raw crafting system
 * @param {unknown} recipes - the raw recipes belonging to that system
 */
export function applyRecipeModifierAuthority(system, recipes) {
  if (!_isPlainObject(system)) return;
  const systemRecipes = Array.isArray(recipes) ? recipes : [];

  // The recipe-level mapping is owed to every recipe, whether or not its system carries a
  // check block, so it runs before the early return below.
  for (const recipe of systemRecipes) _demoteRecipePolicy(recipe);

  const check = _isPlainObject(system.craftingCheck) ? system.craftingCheck : null;

  // IT DELIBERATELY DOES NOT SEED A MISSING CHECK BLOCK — this omission is a decision, not
  // an oversight (the same call `migrateRetireProgressiveAllowPlayerReorder` makes, for the
  // same reason: no storage churn for zero observable change). The modifier catalogue
  // `checkModifiers` lives INSIDE `craftingCheck`, so a system with no check block has no
  // catalogue, hence no modifiers to combine and no authority to observe. It is also not a
  // behaviour gap: for such a system the derivation can only differ from the absent-default
  // `setAndRule` when NO recipe carries a `craftingModifier` — precisely the case where the
  // value is inert either way. The first save through the manager writes a real check block,
  // and the authoring UI shows the GM the authority control at that point.
  if (!check) return;

  // Read the delegation signal BEFORE the mapping below erases `byRecipe`.
  const delegatedByPolicy = check.defaultModifierPolicy === LEGACY_POLICY;
  const delegatedByRecipe = systemRecipes.some(_carriesCraftingModifier);

  if (delegatedByPolicy) check.defaultModifierPolicy = REPLACEMENT_POLICY;

  const authored = check[AUTHORITY_KEY];
  if (authored === undefined || authored === null) {
    check[AUTHORITY_KEY] =
      delegatedByPolicy || delegatedByRecipe ? AUTHORITY_DELEGATING : AUTHORITY_WITHHELD;
  }
}

/**
 * Runner entry point. Reads and returns both `recipes` and `systems`, because the
 * authority derivation for a system depends on its recipes.
 *
 * @param {object} data Runner payload.
 * @param {Array<object>} [data.systems] Raw craftingSystems setting.
 * @param {Array<object>} [data.recipes] Raw recipes setting.
 * @returns {{ systems: Array<object>, recipes: Array<object> }}
 */
export function migrateRecipeModifierAuthority(data = {}) {
  const systems = _clone(data.systems);
  const recipes = _clone(data.recipes);

  if (!Array.isArray(systems)) {
    return { systems: data.systems, recipes: data.recipes };
  }

  const recipeList = Array.isArray(recipes) ? recipes : [];

  // Demote the whole recipe list up front so a recipe orphaned from its system is
  // normalized too. `applyRecipeModifierAuthority` repeats this for the recipes it is
  // handed; the mapping is a fixpoint, so the repeat costs nothing and changes nothing.
  for (const recipe of recipeList) _demoteRecipePolicy(recipe);

  const recipesBySystemId = new Map();
  for (const recipe of recipeList) {
    if (!_isPlainObject(recipe)) continue;
    const key = String(recipe.craftingSystemId);
    const bucket = recipesBySystemId.get(key);
    if (bucket) bucket.push(recipe);
    else recipesBySystemId.set(key, [recipe]);
  }

  for (const system of systems) {
    if (!_isPlainObject(system)) continue;
    applyRecipeModifierAuthority(system, recipesBySystemId.get(String(system.id)) ?? []);
  }

  return { systems, recipes: Array.isArray(recipes) ? recipes : data.recipes };
}
