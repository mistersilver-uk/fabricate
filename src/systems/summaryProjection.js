/**
 * @module summaryProjection
 *
 * The CANONICAL recipe and component summary projections — the one cheap row shape the
 * player crafting listing (#1075) and the GM manager browsers (#1081) both consume
 * (issue 1091, under the performance programme #1070).
 *
 * ## Why a shared contract needs an owner
 *
 * #1075 splits the player listing into summary and detail phases. #1081 splits the GM
 * browsers into cheap summary data, page rows and an inspector. #1076 built the indexes
 * both draw on and #1077 the snapshot and the cheap availability projection. Nothing
 * defined the summary itself, and a contract with no owner does not get written once — it
 * gets written twice, differently, with overlapping-but-unequal fields and two separately
 * evolving availability rules. Reconciling those later costs more than agreeing them now.
 *
 * ## The contract is "one derivation per shared field", not "one identical DTO"
 *
 * The two surfaces legitimately differ. A player summary is redacted and teaser-aware and
 * carries that viewer's favourite state; a GM summary is neither and carries authoring
 * state instead. So the contract cannot be a single DTO, and pretending otherwise would
 * force one surface to carry a field it must not have (a leak) or lose one it needs.
 *
 * What it CAN be, and is, is: **every field the two share is derived here, once**, and the
 * field-level differences are enumerated rather than discovered. {@link RECIPE_SUMMARY_FIELDS}
 * is that enumeration in executable form — `shared`, `gmOnly`, `playerOnly` — and the
 * projection emits exactly `shared ∪ <audience>`, no more and no less. A test asserts the
 * emitted key set against it, so a field added to one surface and not the manifest fails
 * rather than quietly forking the shape.
 *
 * The component summary has NO audience split, and that is a finding rather than an
 * omission: a component carries no teaser gate, no knowledge gate and no per-viewer
 * favourite, so there is nothing for the two surfaces to disagree about. Recording it as
 * one shape is what stops a later surface inventing an audience axis it does not need.
 *
 * ## What a summary MUST NOT contain
 *
 * - **No exact craftability.** No `evaluateCraftability()` result, no ingredient
 *   assignment, no per-set solve, no tool/currency/check resolution. Availability is the
 *   cheap indexed projection below and nothing else.
 * - **No redacted content.** A summary crossing to a player client carries no field a
 *   teaser's `hiddenFields` covers, and no signal DERIVED from one — see the redaction
 *   rule below, which is why `availability` is withheld rather than merely blanked.
 * - **No localized text.** Summaries carry tokens (`category`, `browseStatus`); the
 *   consuming surface localizes. A summary that localized would need a `localize` seam in
 *   every caller and would key a GM row's sort on the active language.
 * - **No Foundry documents.** Only ids, plain strings, numbers, booleans and arrays of
 *   those, so a summary is serializable and cheap to hold by the page.
 *
 * ## What it MUST NOT CALL to be built
 *
 * `evaluateCraftability()` and `resolveIngredientSelection()`, zero times, for any number
 * of summaries. That is stated as a counter-asserted invariant rather than a review-taste
 * guideline because it is the property both consuming issues actually depend on and the
 * one most likely to erode silently — a helpfully-named private method that "just resolves
 * the first set" reintroduces the whole cost while reading as a summary.
 *
 * It is also enforced STRUCTURALLY, which is the stronger half: these functions take
 * VALUES — a recipe, a system, a snapshot, an access result — and never a `RecipeManager`
 * or a listing builder. There is no collaborator here to call either function ON, so the
 * counter test pins a property the module has no way to violate by accident.
 *
 * ## The cheap-availability rule, defined once
 *
 * {@link projectSummaryAvailability} IS the rule. Both surfaces call it rather than
 * wiring snapshot → tallies → projection themselves, so neither can drift into a second
 * interpretation of "does this actor plausibly have the materials?".
 *
 * It carries forward #1077's documented OPTIMISM verbatim: the answer is an upper bound.
 * A `true` means "nothing rules this out" and must be presented as "looks makeable", never
 * as "you can make this"; a `false` is definitive. The `optimistic: true` key rides along
 * in the result so a consumer cannot read it as exact by accident. Exactness stays at
 * craft time, where it already is and must remain.
 */

import { resolveRecipeImage } from '../ui/svelte/util/craftingImageDefaults.js';
import { normalizeComponentCategory } from '../utils/componentCategories.js';
import { normalizeRecipeCategory } from '../utils/recipeCategories.js';

import { deriveBrowseStatus } from './craftingBrowseStatus.js';
import { projectRecipeAvailability } from './inventorySnapshot.js';

/**
 * Who a summary is being built for. The value rides on the summary itself so a consumer
 * holding a page of rows can assert which contract it holds without inferring it from
 * which optional fields happen to be present.
 */
export const SUMMARY_AUDIENCE = Object.freeze({
  GM: 'gm',
  PLAYER: 'player',
});

/**
 * The teaser fields a redacted player summary is defined against, matching
 * `CraftingListingBuilder`'s default for a recipe whose teaser config names none. Held
 * here as well so the summary's redaction decision does not depend on the builder.
 */
const DEFAULT_TEASER_HIDDEN_FIELDS = Object.freeze(['ingredients', 'results', 'description']);

/**
 * The recipe summary's field manifest — the executable form of "one documented shape per
 * entity, with an explicit field-level difference list".
 *
 * `shared` fields are derived identically for both audiences; that is the invariant this
 * module exists to hold. The two difference lists are short on purpose: every entry is a
 * field one surface genuinely cannot carry, not merely one the other happens not to use.
 *
 * - `favourite` is `playerOnly` because it is a per-VIEWER preference read from that
 *   player's own stored favourites. The GM manager has no viewer to read it for, and a
 *   `false` there would assert something untrue rather than something absent.
 * - `locked` is `gmOnly` because it is authoring state — whether the GM has pinned the
 *   recipe against edits. It says nothing a player can act on, and shipping authoring
 *   state to a player client is the habit this contract exists to prevent.
 */
export const RECIPE_SUMMARY_FIELDS = Object.freeze({
  shared: Object.freeze([
    'audience',
    'availability',
    'browseStatus',
    'category',
    'enabled',
    'id',
    'img',
    'name',
    'redaction',
    'systemId',
    'systemName',
    'tags',
  ]),
  gmOnly: Object.freeze(['locked']),
  playerOnly: Object.freeze(['favourite']),
});

/**
 * The component summary's field manifest. There is deliberately no audience split — see
 * the module header.
 */
export const COMPONENT_SUMMARY_FIELDS = Object.freeze({
  shared: Object.freeze([
    'category',
    'essences',
    'held',
    'id',
    'img',
    'name',
    'salvageEnabled',
    'systemId',
    'tags',
  ]),
  gmOnly: Object.freeze([]),
  playerOnly: Object.freeze([]),
});

/**
 * The key set a summary of this audience must carry, exactly.
 *
 * @param {{shared: readonly string[], gmOnly: readonly string[], playerOnly: readonly string[]}} manifest
 * @param {string} audience
 * @returns {string[]} sorted, so a caller comparing key sets gets a stable diff.
 */
export function summaryFieldsFor(manifest, audience) {
  const extra = audience === SUMMARY_AUDIENCE.GM ? manifest.gmOnly : manifest.playerOnly;
  return [...manifest.shared, ...extra].sort((left, right) => left.localeCompare(right));
}

/** A trimmed string, or `''`. */
function text(value) {
  if (typeof value === 'string') return value;
  return value == null ? '' : String(value);
}

/** A trimmed non-empty string, or `null`. */
function idOrNull(value) {
  const out = text(value).trim();
  return out.length > 0 ? out : null;
}

/** Deduped, order-preserving string tags. */
function tagList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const tags = [];
  for (const raw of value) {
    const tag = text(raw).trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

/**
 * The single cheap-availability rule, for one recipe against one snapshot.
 *
 * This is the ONLY sanctioned way for a summary to answer "does this actor plausibly have
 * the materials?". It resolves the snapshot's per-system tallies — memoised there, so
 * asking for N recipes of one system walks the inventory once, not N times — and hands
 * them to #1077's projection.
 *
 * ## The answer is an UPPER BOUND, and consumers must say so
 *
 * `available: true` means nothing in the tallies rules the recipe out; contended sets that
 * draw on the same held stacks are counted for both, so exact evaluation may still refuse.
 * `available: false` is definitive — a requirement the totals cannot cover cannot be
 * covered by any assignment of them either. `optimistic` is always `true` and is part of
 * the returned shape so this cannot be read as exact by accident.
 *
 * Tools, checks, knowledge and currency are not consulted, which is what keeps the result
 * an upper bound: each of those can only ever make a recipe LESS craftable.
 *
 * @param {object} input
 * @param {object|null} input.snapshot An `buildInventorySnapshot()` result, or `null` when
 *   the surface has no actor in view (the GM browser projects definitions, not one
 *   actor's view of them).
 * @param {object|null} input.system The owning crafting system, for the per-system tallies.
 * @param {object|null} input.recipe
 * @returns {{available: boolean, optimistic: true, missingEssenceIds: string[],
 *   unsatisfiedGroupCount: number}|null} `null` when no snapshot was supplied — which is
 *   "not asked", NOT "unavailable". {@link deriveBrowseStatus} reads the distinction.
 */
export function projectSummaryAvailability({ snapshot = null, system = null, recipe = null } = {}) {
  if (!snapshot || typeof snapshot.componentTallies !== 'function' || !recipe) return null;
  return projectRecipeAvailability(snapshot.componentTallies(system), recipe);
}

/**
 * Whether this projection is a redacted one, and which fields the teaser hides.
 *
 * Deliberately the SAME test `CraftingListingBuilder` applies (`!isGM && reason ===
 * 'teaser'`), because the summary and the detail model must agree about whether a recipe
 * is undiscovered — a row that is a teaser in the list and not in the inspector, or the
 * reverse, is a leak either way round.
 */
function redactionOf(audience, access) {
  const redacted = audience !== SUMMARY_AUDIENCE.GM && text(access?.reason) === 'teaser';
  if (!redacted) return { redacted: false, hiddenFields: [] };
  const authored = access?.teaserState?.hiddenFields;
  return {
    redacted: true,
    hiddenFields: Array.isArray(authored) ? [...authored] : [...DEFAULT_TEASER_HIDDEN_FIELDS],
  };
}

/**
 * Project ONE recipe into its canonical summary.
 *
 * ## Redaction: availability is WITHHELD, not blanked
 *
 * When the summary is redacted, availability is not computed at all — the snapshot is
 * never consulted for that recipe. Blanking a computed value would be equivalent for this
 * shape today and wrong the first time a consumer added a "why not?" field beside it, so
 * the guard is placed where the derivation happens rather than where it is written out.
 *
 * The leak this closes is not obvious from the field list, which is why it is written
 * down: availability is derived from the recipe's INGREDIENTS, and `ingredients` is one of
 * the three fields a teaser hides by default. A summary that answered "you have the
 * materials for this" for an undiscovered recipe would leak the shape of a requirement the
 * player is not meant to see yet — one probe per inventory change, over a whole corpus.
 *
 * `name`, `img`, `category` and `tags` are NOT redacted, matching the shipped listing
 * model: a teaser is shown to the player deliberately, so its identity and its grouping
 * metadata are the part they are meant to see. `CraftingListingBuilder` records the same
 * decision for `category` in as many words.
 *
 * @param {object} input
 * @param {object} input.recipe The authored recipe. Source of `id`, `name`, `img`,
 *   `category`, `tags`, `enabled`, `locked` and `systemId`.
 * @param {object|null} [input.system] The owning crafting system, resolved through
 *   #1076's per-system read (source of `systemName`), and the tallies key for availability.
 * @param {string} [input.audience] A {@link SUMMARY_AUDIENCE} value; defaults to `player`,
 *   the redacting one, so an omitted audience fails safe rather than open.
 * @param {object|null} [input.access] The visibility service's access result for this
 *   (recipe, viewer) — source of `browseStatus`'s reason and of the teaser redaction.
 * @param {object|null} [input.snapshot] An inventory snapshot (#1077), or `null`.
 * @param {boolean} [input.exhausted] Whether every owned copy of the recipe's book has
 *   reached its cap, as already established by the knowledge access evaluation. NOT
 *   recomputed here — recipe-visibility/spec.md forbids a second candidate collection.
 * @param {boolean} [input.favourite] Whether this viewer has favourited the recipe, from
 *   the player's stored favourites. Ignored for the GM audience.
 * @returns {object} A summary carrying exactly {@link summaryFieldsFor}'s keys.
 */
export function projectRecipeSummary({
  recipe,
  system = null,
  audience = SUMMARY_AUDIENCE.PLAYER,
  access = null,
  snapshot = null,
  exhausted = false,
  favourite = false,
} = {}) {
  const isGM = audience === SUMMARY_AUDIENCE.GM;
  const redaction = redactionOf(audience, access);

  const availability = redaction.redacted
    ? null
    : projectSummaryAvailability({ snapshot, system, recipe });

  const summary = {
    audience: isGM ? SUMMARY_AUDIENCE.GM : SUMMARY_AUDIENCE.PLAYER,
    availability,
    browseStatus: deriveBrowseStatus({
      reason: text(access?.reason),
      // `null` rather than `false` when nothing was asked, so a surface holding no
      // snapshot does not paint every row `missingMaterials`.
      materialsAvailable: availability === null ? null : availability.available,
      exhausted: exhausted === true,
    }),
    category: normalizeRecipeCategory(recipe?.category),
    // `!== false`, matching the GM browser's own filter and `Recipe`'s default-true
    // constructor: absent means enabled, and a summary that read absent as OFF would hide
    // every hand-authored recipe from the `on` filter.
    enabled: recipe?.enabled !== false,
    id: idOrNull(recipe?.id),
    // The recipe's OWN image, through the shared resolver that treats Foundry's generic
    // item-bag as the "no image" sentinel. Never the containing book's artwork: book
    // membership is many-to-many, so "the containing book" names definition order rather
    // than anything the GM authored (issue 887).
    img: idOrNull(resolveRecipeImage(recipe ?? {})),
    name: text(recipe?.name),
    redaction,
    systemId: idOrNull(recipe?.craftingSystemId),
    systemName: text(system?.name),
    tags: tagList(recipe?.tags),
  };

  if (isGM) summary.locked = recipe?.locked === true;
  else summary.favourite = favourite === true;

  return summary;
}

/**
 * A component's essence requirements as an ordered, serializable list.
 *
 * `Component.essences` is canonically a `{ essenceId: number }` MAP, but the GM browser's
 * projected rows carry an ARRAY of `{ id, name }` and filter on the name. Both surfaces
 * therefore need both facets, and deriving them in two places is exactly the divergence
 * this module exists to prevent — so the list is built here, from the canonical map, with
 * the display name resolved through the system's essence-definition index (#1076).
 *
 * Sorted by id so two summaries of the same component compare equal regardless of key
 * insertion order, which matters for any consumer memoising on a summary.
 *
 * @param {object|null} component
 * @param {Map<string, object>|null} essenceDefinitionsById
 * @returns {Array<{id: string, quantity: number, name: string}>}
 */
function essenceList(component, essenceDefinitionsById) {
  const essences = component?.essences;
  if (!essences || typeof essences !== 'object') return [];
  const entries = [];
  for (const [essenceId, raw] of Object.entries(essences)) {
    const quantity = Number(raw) || 0;
    if (quantity <= 0) continue;
    const id = String(essenceId);
    const definition = essenceDefinitionsById?.get?.(id) ?? null;
    entries.push({ id, quantity, name: text(definition?.name) || id });
  }
  // An EXPLICIT comparator: a bare `sort()` is lexicographic-by-string and is a
  // SonarCloud finding in its own right (`unicorn/require-array-sort-compare`).
  entries.sort((left, right) => left.id.localeCompare(right.id));
  return entries;
}

/**
 * What the actor set holds of this component, from the SAME snapshot tallies the recipe
 * availability rule reads.
 *
 * This is the component-side counterpart of that rule and it obeys the same boundary: it
 * is a lookup into a tally resolved once per system per snapshot, never a per-component
 * walk of the inventory. `null` means "not asked" — a GM browser projecting definitions
 * has no actor in view — and is deliberately distinct from a held quantity of zero.
 */
function heldOf(component, tallies) {
  if (!tallies) return null;
  const key = String(component?.id ?? '');
  return {
    quantity: tallies.quantityByComponentId?.get?.(key) ?? 0,
    stacks: tallies.stacksByComponentId?.get?.(key) ?? 0,
  };
}

/**
 * Project ONE component into its canonical summary.
 *
 * There is no audience parameter and no redaction: a component carries no teaser gate, no
 * knowledge gate and no per-viewer state, so the GM and player surfaces have nothing to
 * disagree about. If a later surface needs a component field one audience must not see,
 * that is a change to this contract — add it to {@link COMPONENT_SUMMARY_FIELDS} with the
 * audience split it needs — and not a reason to fork the shape.
 *
 * @param {object} input
 * @param {object} input.component The authored component. Source of `id`, `name`, `img`,
 *   `category`, `tags`, `essences` and `salvageEnabled`.
 * @param {string|null} [input.systemId] The owning crafting system's id. Passed rather
 *   than read off the component, which does not carry one: component ids are unique only
 *   WITHIN a system, so a summary that could not name its system would be ambiguous the
 *   moment two systems were browsed together.
 * @param {Map<string, object>|null} [input.essenceDefinitionsById] #1076's per-system
 *   essence-definition index, for essence display names.
 * @param {object|null} [input.tallies] A snapshot's `componentTallies(system)` (#1077), or
 *   `null` when the surface has no actor in view.
 * @returns {object} A summary carrying exactly {@link COMPONENT_SUMMARY_FIELDS.shared}.
 */
export function projectComponentSummary({
  component,
  systemId = null,
  essenceDefinitionsById = null,
  tallies = null,
} = {}) {
  return {
    category: normalizeComponentCategory(component?.category),
    essences: essenceList(component, essenceDefinitionsById),
    held: heldOf(component, tallies),
    id: idOrNull(component?.id),
    img: idOrNull(component?.img),
    name: text(component?.name),
    salvageEnabled: component?.salvage?.enabled === true,
    systemId: idOrNull(systemId),
    tags: tagList(component?.tags),
  };
}
