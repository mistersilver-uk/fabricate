/**
 * THE SHARED COMPONENT-, TOOL- AND ESSENCE-REFERENCE WALK (issue 1363, epic 1357, PR 3;
 * essences added at issue 1654).
 *
 * ONE enumeration of every position in the persisted corpus that names a component id, a
 * tool id or an essence id, used by BOTH the `1.30.0` world-scope migration and copy-mode import
 * (`rebindCopyComponentIds`). It is EXTRACTED rather than re-derived so the two callers cannot
 * drift: the shipped copy-mode walk had accumulated THREE real gaps by the time this was
 * written, and every one of them would have shipped a dangling reference in a migrated world.
 *
 * THE REWRITE IS KEY-AWARE. It rewrites a value only when it sits at one of the enumerated
 * reference positions AND the supplied remapper recognises it. A value at a non-reference
 * position — a `recipeIds[]` entry, an outcome or salvage-group id, a scene or macro UUID — is
 * never touched even if it coincidentally equals a component id. Recipe ids, outcome ids and
 * salvage-group ids are NEVER rewritten.
 *
 * IT IS IDEMPOTENT BY CONSTRUCTION, given a map whose image is disjoint from its key set: every
 * site performs ONE simultaneous lookup, so an already-rewritten value is not a key and is left
 * verbatim. That disjointness is enforced by `worldScopeEntityGrouping.js`, which REFUSES a
 * `(system, entityType)` pair it cannot hold it for.
 *
 * ## The three gaps this closes, all found by re-verification of the shipped copy walk
 *
 * - `tool.onBreak.replacementTarget.componentId`, which `Tool` treats as canonical, was not
 *   rewritten — only the legacy flat `replacementComponentId` was.
 * - Essence `sourceItemUuid`, which `## EssenceDefinition` requirement 3 permits to hold a
 *   legacy component id, was not rewritten.
 * - `tool.repairRequirements` appeared NOWHERE in the shipped walk, while `Tool.toJSON`
 *   persists it and `_normalizeTool` emits it on every load.
 *
 * ## The ESSENCE leg, and why it arrived late (issue 1654)
 *
 * `1.30.0` shipped with no essence leg because it never RE-KEYED an essence: it grouped world
 * essences by trimmed `id` and lifted one per system, on the assumption that a GM-authored
 * essence id is a stable semantic slug shared across systems. It is not — it is per-system
 * minted (a `crypto.randomUUID()` from the in-system store, a name slug from the world
 * catalogue) — so `1.30.0` lifted a DUPLICATE world essence per system instead of one shared
 * essence. `1.34.0` merges the semantically equivalent survivors, which re-keys an essence id
 * for the first time, and every position that names one has to move with it.
 *
 * THE ESSENCE LEG GOES HERE AND NOT IN A NEW MODULE, for the reason this module exists at all:
 * a second traversal written by hand is a MIRROR of this enumeration, and mirrors rot. It is
 * threaded as a THIRD remapper, `remapEssence`, defaulting to `identity` exactly as
 * `remapComponent` and `remapTool` do — so `rebindCopyComponentIds` and the `1.30.0` pass, which
 * pass two remappers and no third, behave identically to before.
 *
 * ## KEY-POSITION rewriting, the one thing this walk had never done
 *
 * Every site above holds its id as a leaf VALUE. An essence id is also spelled as an OBJECT KEY,
 * in the `Record<essenceId, number>` quantity maps a component and a (legacy) ingredient set
 * carry, and {@link rewriteEssenceQuantityMap} is the only part of the walk that rewrites one.
 * Two consequences follow that a value rewrite never has:
 *
 * - **A COLLISION SUMS.** Two keys can map onto one surviving id, and after a merge that
 *   survivor is the single carrier of both contributions, so `{a: 2, b: 3} -> {merged: 5}`.
 *   Last-writer-wins would silently delete a quantity a GM authored.
 * - **The map is REBUILT, not mutated key by key**, so key ORDER follows the original, with a
 *   merged key sitting where its FIRST contributor sat.
 *
 * `components[].essences` is the sharpest of the key-position sites and is not optional:
 * `CraftingSystemManager#_normalizeEssenceQuantities` PRUNES a key outside the Valid Id Basis
 * (`if (validIds && !validIds.has(key)) continue;`), so a merged-away essence id left standing in
 * a component's map is SILENTLY DELETED on the next save. That is data loss, not untidiness.
 *
 * ## Site D is DEAD CODE for every normalized tool, and is RETAINED anyway
 *
 * `_normalizeTool` returns `model.toJSON()`, and `Tool.toJSON` emits `onBreak` as
 * `{ mode, replacementTarget? }` and NEVER `replacementComponentId`. So the legacy branch is
 * not a gap beside a working rewrite — it is the only tool-replacement rewrite the shipped walk
 * had, and it never fires on production data. It is RETAINED because `normalizeOnBreak` still
 * reads the legacy key from an IMPORTED or HAND-EDITED payload, and it is marked here so no
 * later reader mistakes it for a live production site.
 */

/**
 * Every leaf position the walk rewrites, as a normalized path with array indices collapsed to
 * `[]`, rooted at the three persisted payloads plus the world scope payloads.
 *
 * A HAND-MAINTAINED MIRROR, and it is guarded mechanically rather than trusted:
 * `tests/world-scope-reference-walk.test.js` derives the ACTUALLY-touched set from a
 * maximally-populated corpus built by the REAL producers and asserts set-equality in both
 * directions, plus a key-name closure over every leaf key the producers emit. A site added to
 * the walk and not listed here fails that test, and so does the reverse.
 *
 * SITES THE PRODUCERS NEVER EMIT ARE DELIBERATELY ABSENT and are enumerated separately in
 * {@link WORLD_SCOPE_DEFENSIVE_SITES}, with the reason each is unproducible. The walk still
 * covers every one of them, because an imported or hand-edited payload can carry them.
 *
 * IT IS THE COMPONENT-AND-TOOL LIST ONLY. The essence leg (issue 1654) is enumerated in
 * {@link WORLD_SCOPE_ESSENCE_REFERENCE_SITES} and {@link WORLD_SCOPE_ESSENCE_DEFENSIVE_SITES}
 * rather than folded in here, because each list is derived by running the walk with ONE leg's
 * remapper live and the others at `identity`: a single merged list would make each derivation a
 * subset comparison instead of the set-equality in both directions that catches a rotted mirror.
 *
 * @type {readonly string[]}
 */
export const WORLD_SCOPE_REFERENCE_SITES = Object.freeze([
  // --- systems[] ---
  'systems[].components[].salvage.resultGroups[].results[].componentId',
  'systems[].components[].salvage.resultGroups[].results[].systemItemId',
  'systems[].components[].salvage.toolIds[]',
  'systems[].essenceDefinitions[].sourceComponentId',
  'systems[].essenceDefinitions[].associatedSystemItemId',
  'systems[].essenceDefinitions[].sourceItemUuid',
  'systems[].tools[].componentId',
  'systems[].tools[].onBreak.replacementTarget.componentId',
  'systems[].tools[].repairRequirements[].options[].componentId',
  'systems[].tools[].repairRequirements[].options[].match.componentId',
  'systems[].tools[].repairRequirements[].options[].alternatives[].componentId',
  'systems[].tools[].repairRequirements[].options[].alternatives[].match.componentId',
  // --- recipes[] ---
  'recipes[].toolIds[]',
  'recipes[].ingredientSets[].toolIds[]',
  'recipes[].ingredientSets[].ingredientGroups[].options[].componentId',
  'recipes[].ingredientSets[].ingredientGroups[].options[].match.componentId',
  'recipes[].ingredientSets[].ingredientGroups[].options[].alternatives[].componentId',
  'recipes[].ingredientSets[].ingredientGroups[].options[].alternatives[].match.componentId',
  'recipes[].resultGroups[].results[].componentId',
  'recipes[].resultGroups[].results[].systemItemId',
  'recipes[].steps[].toolIds[]',
  'recipes[].steps[].ingredientSets[].toolIds[]',
  'recipes[].steps[].ingredientSets[].ingredientGroups[].options[].componentId',
  'recipes[].steps[].ingredientSets[].ingredientGroups[].options[].match.componentId',
  'recipes[].steps[].ingredientSets[].ingredientGroups[].options[].alternatives[].componentId',
  'recipes[].steps[].ingredientSets[].ingredientGroups[].options[].alternatives[].match.componentId',
  'recipes[].steps[].resultGroups[].results[].componentId',
  'recipes[].steps[].resultGroups[].results[].systemItemId',
  // --- gatheringConfig ---
  'gatheringConfig.systems.*.tasks[].toolIds[]',
  'gatheringConfig.systems.*.tasks[].dropRows[].componentId',
  'gatheringConfig.systems.*.tools[].componentId',
  'gatheringConfig.systems.*.tools[].onBreak.replacementTarget.componentId',
  'gatheringConfig.systems.*.tools[].repairRequirements[].options[].componentId',
  'gatheringConfig.systems.*.tools[].repairRequirements[].options[].match.componentId',
  'gatheringConfig.systems.*.tools[].repairRequirements[].options[].alternatives[].componentId',
  'gatheringConfig.systems.*.tools[].repairRequirements[].options[].alternatives[].match.componentId',
]);

/**
 * The reference positions the walk ALSO covers and NO SHIPPED PRODUCER EMITS.
 *
 * They are listed separately rather than folded into the list above because the completeness
 * guard is DERIVED from real producer output: a site production never produces cannot appear in
 * the derived corpus, so including it there would make the set-equality permanently false and the
 * only way to restore it would be to hand-author the shape — which is precisely what `#### D9`'s
 * dead-site finding forbids.
 *
 * IT IS A LEAF-PATH LIST, exactly as {@link WORLD_SCOPE_REFERENCE_SITES} is, and it is complete
 * rather than indicative: an earlier form listed `catalysts[]` as a bare array path and omitted
 * every `systemItemId` alias the walk does rewrite, which made the stated invariant false.
 * `tests/world-scope-reference-walk.test.js` now pins it in both directions - every entry must be
 * one the producers do NOT emit, and every unproducible leaf the walk touches must be here.
 *
 * FIVE FAMILIES, each unproducible for a stated reason, and each retained because an IMPORTED or
 * HAND-EDITED payload can still carry it:
 *
 * - `onBreak.replacementComponentId` — `Tool.toJSON` emits `onBreak` as `{mode, replacementTarget?}`
 *   and never this key; `normalizeOnBreak` still reads it as construction input.
 * - the flat `ingredientSets[].ingredients[]` alias — `IngredientSet.toJSON` stopped emitting it
 *   at issue 1135, but it is the ONLY ingredient data an older export carries.
 * - the flat `recipes[].results[]` alias — omitted when it holds the value the constructor
 *   rebuilds from absence.
 * - every `catalysts[]` array — the `1.7.0` migration deletes them everywhere it can reach.
 * - gathering drop-row `systemItemId` — the drop-row normalizer folds it into `componentId`.
 * - **gathering EVENT `dropRows` and `toolIds`** — the shipped event normalizers
 *   (`adminStore._normalizeGatheringEvent` and `GatheringRichStateService`'s mirror) are
 *   whitelist rebuilds that emit NEITHER key, so an event carries no component or tool reference
 *   at all. The walk covers them anyway, because both are legitimate keys on an imported payload
 *   and because an event acquiring drop rows later must not silently become a missed site.
 *
 * @type {readonly string[]}
 */
export const WORLD_SCOPE_DEFENSIVE_SITES = Object.freeze([
  'gatheringConfig.systems.*.events[].dropRows[].componentId',
  'gatheringConfig.systems.*.events[].dropRows[].systemItemId',
  'gatheringConfig.systems.*.events[].toolIds[]',
  'gatheringConfig.systems.*.tasks[].dropRows[].systemItemId',
  'gatheringConfig.systems.*.tools[].onBreak.replacementComponentId',
  'gatheringConfig.systems.*.tools[].repairRequirements[].options[].alternatives[].match.systemItemId',
  'gatheringConfig.systems.*.tools[].repairRequirements[].options[].alternatives[].systemItemId',
  'gatheringConfig.systems.*.tools[].repairRequirements[].options[].match.systemItemId',
  'gatheringConfig.systems.*.tools[].repairRequirements[].options[].systemItemId',
  'recipes[].catalysts[].alternatives[].componentId',
  'recipes[].catalysts[].alternatives[].match.componentId',
  'recipes[].catalysts[].alternatives[].match.systemItemId',
  'recipes[].catalysts[].alternatives[].systemItemId',
  'recipes[].catalysts[].componentId',
  'recipes[].catalysts[].match.componentId',
  'recipes[].catalysts[].match.systemItemId',
  'recipes[].catalysts[].systemItemId',
  'recipes[].ingredientSets[].catalysts[].alternatives[].componentId',
  'recipes[].ingredientSets[].catalysts[].alternatives[].match.componentId',
  'recipes[].ingredientSets[].catalysts[].alternatives[].match.systemItemId',
  'recipes[].ingredientSets[].catalysts[].alternatives[].systemItemId',
  'recipes[].ingredientSets[].catalysts[].componentId',
  'recipes[].ingredientSets[].catalysts[].match.componentId',
  'recipes[].ingredientSets[].catalysts[].match.systemItemId',
  'recipes[].ingredientSets[].catalysts[].systemItemId',
  'recipes[].ingredientSets[].ingredientGroups[].options[].alternatives[].match.systemItemId',
  'recipes[].ingredientSets[].ingredientGroups[].options[].alternatives[].systemItemId',
  'recipes[].ingredientSets[].ingredientGroups[].options[].match.systemItemId',
  'recipes[].ingredientSets[].ingredientGroups[].options[].systemItemId',
  'recipes[].ingredientSets[].ingredients[].alternatives[].componentId',
  'recipes[].ingredientSets[].ingredients[].alternatives[].match.componentId',
  'recipes[].ingredientSets[].ingredients[].alternatives[].match.systemItemId',
  'recipes[].ingredientSets[].ingredients[].alternatives[].systemItemId',
  'recipes[].ingredientSets[].ingredients[].componentId',
  'recipes[].ingredientSets[].ingredients[].match.componentId',
  'recipes[].ingredientSets[].ingredients[].match.systemItemId',
  'recipes[].ingredientSets[].ingredients[].systemItemId',
  'recipes[].results[].componentId',
  'recipes[].results[].systemItemId',
  'recipes[].steps[].catalysts[].alternatives[].componentId',
  'recipes[].steps[].catalysts[].alternatives[].match.componentId',
  'recipes[].steps[].catalysts[].alternatives[].match.systemItemId',
  'recipes[].steps[].catalysts[].alternatives[].systemItemId',
  'recipes[].steps[].catalysts[].componentId',
  'recipes[].steps[].catalysts[].match.componentId',
  'recipes[].steps[].catalysts[].match.systemItemId',
  'recipes[].steps[].catalysts[].systemItemId',
  'recipes[].steps[].ingredientSets[].catalysts[].alternatives[].componentId',
  'recipes[].steps[].ingredientSets[].catalysts[].alternatives[].match.componentId',
  'recipes[].steps[].ingredientSets[].catalysts[].alternatives[].match.systemItemId',
  'recipes[].steps[].ingredientSets[].catalysts[].alternatives[].systemItemId',
  'recipes[].steps[].ingredientSets[].catalysts[].componentId',
  'recipes[].steps[].ingredientSets[].catalysts[].match.componentId',
  'recipes[].steps[].ingredientSets[].catalysts[].match.systemItemId',
  'recipes[].steps[].ingredientSets[].catalysts[].systemItemId',
  'recipes[].steps[].ingredientSets[].ingredientGroups[].options[].alternatives[].match.systemItemId',
  'recipes[].steps[].ingredientSets[].ingredientGroups[].options[].alternatives[].systemItemId',
  'recipes[].steps[].ingredientSets[].ingredientGroups[].options[].match.systemItemId',
  'recipes[].steps[].ingredientSets[].ingredientGroups[].options[].systemItemId',
  'recipes[].steps[].ingredientSets[].ingredients[].alternatives[].componentId',
  'recipes[].steps[].ingredientSets[].ingredients[].alternatives[].match.componentId',
  'recipes[].steps[].ingredientSets[].ingredients[].alternatives[].match.systemItemId',
  'recipes[].steps[].ingredientSets[].ingredients[].alternatives[].systemItemId',
  'recipes[].steps[].ingredientSets[].ingredients[].componentId',
  'recipes[].steps[].ingredientSets[].ingredients[].match.componentId',
  'recipes[].steps[].ingredientSets[].ingredients[].match.systemItemId',
  'recipes[].steps[].ingredientSets[].ingredients[].systemItemId',
  'systems[].components[].salvage.catalysts[].alternatives[].componentId',
  'systems[].components[].salvage.catalysts[].alternatives[].match.componentId',
  'systems[].components[].salvage.catalysts[].alternatives[].match.systemItemId',
  'systems[].components[].salvage.catalysts[].alternatives[].systemItemId',
  'systems[].components[].salvage.catalysts[].componentId',
  'systems[].components[].salvage.catalysts[].match.componentId',
  'systems[].components[].salvage.catalysts[].match.systemItemId',
  'systems[].components[].salvage.catalysts[].systemItemId',
  'systems[].tools[].onBreak.replacementComponentId',
  'systems[].tools[].repairRequirements[].options[].alternatives[].match.systemItemId',
  'systems[].tools[].repairRequirements[].options[].alternatives[].systemItemId',
  'systems[].tools[].repairRequirements[].options[].match.systemItemId',
  'systems[].tools[].repairRequirements[].options[].systemItemId',
]);

/**
 * Every position the walk rewrites when it is given an ESSENCE remapper (issue 1654), in the
 * same hand-maintained, mechanically-guarded style as {@link WORLD_SCOPE_REFERENCE_SITES}.
 *
 * TWO SPELLINGS, because an essence id is the first id class this walk rewrites in KEY position
 * and a leaf-path string cannot say so:
 *
 * - `…match.essenceId` — a LEAF PATH, read exactly as the two lists above are read: array
 *   indices collapsed to `[]`, map keys collapsed to `*`, the final segment the leaf key that
 *   holds the id.
 * - `…essences{}` — a KEY-POSITION path. The trailing `{}` mirrors `[]`, and means "every own
 *   KEY of the object at this path is an essence id" — so the path names the CONTAINER and never
 *   the key, which is the point: `systems[].components[].essences.fire` would pin one world's
 *   authored id into the repo's drift detector, and the next world spells it something else.
 *   `tests/world-scope-reference-walk.test.js` derives these by diffing the KEY SETS of every
 *   object in the corpus rather than its leaf values, which is why they need their own spelling
 *   rather than an entry the leaf-path closures would try and fail to match.
 *
 * @type {readonly string[]}
 */
export const WORLD_SCOPE_ESSENCE_REFERENCE_SITES = Object.freeze([
  // --- leaf-value sites: `{ quantity, match: { type: 'essence', essenceId, amount } }` ---
  'gatheringConfig.systems.*.tools[].repairRequirements[].options[].alternatives[].match.essenceId',
  'gatheringConfig.systems.*.tools[].repairRequirements[].options[].match.essenceId',
  'recipes[].ingredientSets[].ingredientGroups[].options[].alternatives[].match.essenceId',
  'recipes[].ingredientSets[].ingredientGroups[].options[].match.essenceId',
  'recipes[].steps[].ingredientSets[].ingredientGroups[].options[].alternatives[].match.essenceId',
  'recipes[].steps[].ingredientSets[].ingredientGroups[].options[].match.essenceId',
  'systems[].tools[].repairRequirements[].options[].alternatives[].match.essenceId',
  'systems[].tools[].repairRequirements[].options[].match.essenceId',
  // --- key-position sites: `Record<essenceId, number>` quantity maps ---
  'recipes[].ingredientSets[].essences{}',
  'recipes[].steps[].ingredientSets[].essences{}',
  'systems[].components[].essences{}',
]);

/**
 * The essence positions the walk ALSO covers and the derived marker fixture cannot produce.
 *
 * Same escape-hatch rule as {@link WORLD_SCOPE_DEFENSIVE_SITES}, and guarded the same way in both
 * directions, so an entry here that the producers DO emit fails the suite rather than hiding a
 * real missed site. THREE families, each unproducible for a stated reason:
 *
 * - every `catalysts[]` essence match — the `1.7.0` migration deletes `catalysts` everywhere it
 *   can reach, so no shipped producer emits the array at all. The walk reaches these because an
 *   essence match is folded into the SHARED `rewriteIngredientRef`, which is also what a catalyst
 *   entry is walked with; that sharing is the whole reason the leg cannot drift from the
 *   component leg, and it costs these entries.
 * - the flat `ingredientSets[].ingredients[]` alias — `IngredientSet.toJSON` stopped emitting it
 *   at issue 1135, but it is the ONLY ingredient data an older export carries.
 * - the `componentScope` key maps — the fixture is derived from the THREE producers of
 *   `craftingSystems`, `recipes` and `gatheringConfig`, and the scope payload is a FOURTH setting
 *   written by `scopedDefinitionStore` and by the `1.30.0` / `1.32.0` passes. They are therefore
 *   covered by direct tests over {@link rewriteEssenceQuantityMap} and
 *   {@link rewriteMembershipReferences} instead of by the derived-corpus closures, and they are
 *   listed here so the enumeration stays complete.
 *
 * THE TWO `componentScope` ENTRIES ARE A DELIBERATE EXCEPTION to the scoping the other three
 * lists keep. Those lists are rooted at the three persisted payloads and name no scope-payload
 * position at all — a tool membership record's `onBreak` and `repairRequirements` are walked by
 * the same {@link rewriteToolReferences} as `systems[].tools[]` and are not restated, and the
 * essence sites inside them are not restated either. The component `essences` map is listed
 * because it has no such reading: it is the site `_normalizeEssenceQuantities` SILENTLY PRUNES on
 * the next save, and leaving the scope-payload halves of it unenumerated is how a reader
 * concludes the in-system map was the whole job.
 *
 * @type {readonly string[]}
 */
export const WORLD_SCOPE_ESSENCE_DEFENSIVE_SITES = Object.freeze([
  'componentScope.defaults.*.essences{}',
  'componentScope.membership.*.essences{}',
  'recipes[].catalysts[].alternatives[].match.essenceId',
  'recipes[].catalysts[].match.essenceId',
  'recipes[].ingredientSets[].catalysts[].alternatives[].match.essenceId',
  'recipes[].ingredientSets[].catalysts[].match.essenceId',
  'recipes[].ingredientSets[].ingredients[].alternatives[].match.essenceId',
  'recipes[].ingredientSets[].ingredients[].match.essenceId',
  'recipes[].steps[].catalysts[].alternatives[].match.essenceId',
  'recipes[].steps[].catalysts[].match.essenceId',
  'recipes[].steps[].ingredientSets[].catalysts[].alternatives[].match.essenceId',
  'recipes[].steps[].ingredientSets[].catalysts[].match.essenceId',
  'recipes[].steps[].ingredientSets[].ingredients[].alternatives[].match.essenceId',
  'recipes[].steps[].ingredientSets[].ingredients[].match.essenceId',
  'systems[].components[].salvage.catalysts[].alternatives[].match.essenceId',
  'systems[].components[].salvage.catalysts[].match.essenceId',
]);

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

const identity = (value) => value;

/**
 * Rewrite a `toolIds[]` array in place.
 *
 * @param {object} container
 * @param {(value: unknown) => unknown} remapTool
 */
function rewriteToolIds(container, remapTool) {
  if (!isPlainObject(container) || !Array.isArray(container.toolIds)) return;
  container.toolIds = container.toolIds.map((id) => remapTool(id));
}

/**
 * Rewrite one ingredient / catalyst / repair option reference in place, recursing through
 * `alternatives`.
 *
 * THE ESSENCE MATCH IS FOLDED IN HERE rather than given its own traversal, which is what buys the
 * essence leg the `alternatives[]` recursion, the catalyst and flat-`ingredients[]` coverage and
 * the repair-requirement coverage for free — and what stops the two legs from drifting.
 * `matchTypes.js`'s `essenceHandler` normalizes the match to
 * `{ type: 'essence', essenceId, amount }`, so `essenceId` is the only id-bearing key here and
 * `amount` is a quantity the rewrite must never touch.
 *
 * @param {unknown} ref
 * @param {{remapComponent: Function, remapEssence: Function}} remappers
 */
function rewriteIngredientRef(ref, { remapComponent = identity, remapEssence = identity } = {}) {
  if (!isPlainObject(ref)) return;
  if (isPlainObject(ref.match)) {
    if ('componentId' in ref.match) ref.match.componentId = remapComponent(ref.match.componentId);
    if ('systemItemId' in ref.match) {
      ref.match.systemItemId = remapComponent(ref.match.systemItemId);
    }
    if ('essenceId' in ref.match) ref.match.essenceId = remapEssence(ref.match.essenceId);
  }
  if ('componentId' in ref) ref.componentId = remapComponent(ref.componentId);
  if ('systemItemId' in ref) ref.systemItemId = remapComponent(ref.systemItemId);
  for (const alternative of arrayOf(ref.alternatives)) {
    rewriteIngredientRef(alternative, { remapComponent, remapEssence });
  }
}

/**
 * The quantity a MERGED essence key carries: the SUM of the contributions that landed on it.
 *
 * Summing is the semantic, not an arithmetic convenience. After `1.34.0` merges two
 * semantically equivalent world essences, the survivor is the ONE carrier of what both of them
 * contributed, so `{fire: 2, flame: 3}` under `flame -> fire` is `{fire: 5}`; last-writer-wins
 * would silently delete a quantity a GM authored.
 *
 * NOT-A-NUMBER on either side is answered, never thrown and never propagated as `NaN`: the walk
 * RE-KEYS, it does not invent quantities, so a numeric side always wins and two non-numeric sides
 * resolve to the later contribution. `_normalizeEssenceQuantities` drops a non-finite quantity on
 * the next load either way; what matters here is that a malformed map cannot abort the pass.
 *
 * @param {unknown} kept The quantity already accumulated on the surviving key.
 * @param {unknown} added The quantity arriving from a key that merged into it.
 * @returns {unknown}
 */
function mergedEssenceQuantity(kept, added) {
  const keptNumber = Number(kept);
  const addedNumber = Number(added);
  if (Number.isFinite(keptNumber) && Number.isFinite(addedNumber)) return keptNumber + addedNumber;
  if (Number.isFinite(keptNumber)) return kept;
  return added;
}

/**
 * Rewrite ONE `Record<essenceId, number>` quantity map in place — the walk's ONLY KEY-POSITION
 * rewrite (issue 1654).
 *
 * It takes the CONTAINER rather than the map because re-keying rebuilds the map, so the carrier's
 * `essences` property has to be reassigned; and it hard-codes the `essences` key because all five
 * key-position sites spell it that way. ONE function covers all five — the in-system component
 * (`systems[].components[].essences`), the legacy per-set map on a recipe set and on a step's set,
 * and the world-scope `componentScope.defaults.*` and `componentScope.membership.*` rows — which
 * is the point: five hand-written re-key loops would be five mirrors of each other.
 *
 * IT REWRITES `essences` AND NOTHING NAMED LIKE IT. A membership record also carries
 * `inherit.essences`, a BOOLEAN section switch whose key is a section NAME and not an essence id;
 * it is a sibling of, never a member of, the map this touches.
 *
 * TOTAL AND NON-THROWING, like the rest of the walk: a missing, `null`, array-valued or otherwise
 * non-object `essences` is left exactly as it was found rather than coerced or dropped. A migration
 * that throws aborts the whole pass.
 *
 * IDEMPOTENT on a map whose image is disjoint from its key set, by the module's one rule: ONE
 * simultaneous lookup per key, never a chained one, so an already-rewritten key is not a key.
 *
 * The accumulator is a `Map` and the result comes back through `Object.fromEntries` so that a key
 * spelled `__proto__` lands as an OWN property instead of silently reassigning the prototype of
 * the rebuilt map. It also preserves order: a merged key sits where its FIRST contributor sat.
 *
 * @param {unknown} container The record carrying the map — a component, an ingredient set, a
 *   world-default row or a membership row.
 * @param {{remapEssence: Function}} [remappers]
 * @returns {void}
 */
export function rewriteEssenceQuantityMap(container, { remapEssence = identity } = {}) {
  if (!isPlainObject(container) || !isPlainObject(container.essences)) return;
  const merged = new Map();
  for (const [essenceId, quantity] of Object.entries(container.essences)) {
    const mapped = remapEssence(essenceId);
    // A remapper that answers a non-string or an empty string has not named a surviving essence,
    // so the key stays exactly as authored rather than collapsing several ids onto `''`.
    const key = typeof mapped === 'string' && mapped.trim() ? mapped : essenceId;
    merged.set(key, merged.has(key) ? mergedEssenceQuantity(merged.get(key), quantity) : quantity);
  }
  container.essences = Object.fromEntries(merged);
}

/**
 * Rewrite one result reference in place.
 *
 * @param {unknown} result
 * @param {(value: unknown) => unknown} remapComponent
 */
function rewriteResultRef(result, remapComponent) {
  if (!isPlainObject(result)) return;
  if ('componentId' in result) result.componentId = remapComponent(result.componentId);
  if ('systemItemId' in result) result.systemItemId = remapComponent(result.systemItemId);
}

function rewriteResultGroups(resultGroups, remapComponent) {
  for (const group of arrayOf(resultGroups)) {
    for (const result of arrayOf(group?.results)) rewriteResultRef(result, remapComponent);
  }
}

function rewriteIngredientSet(
  set,
  { remapComponent = identity, remapTool = identity, remapEssence = identity } = {}
) {
  if (!isPlainObject(set)) return;
  const refRemappers = { remapComponent, remapEssence };
  for (const group of arrayOf(set.ingredientGroups)) {
    for (const option of arrayOf(group?.options)) rewriteIngredientRef(option, refRemappers);
  }
  // Flat `ingredients[]` alias: `IngredientSet.toJSON` stopped emitting it at issue 1135, but
  // older exports and legacy flat-authored sets still carry it, and for those it is the set's
  // ONLY ingredient data.
  for (const ingredient of arrayOf(set.ingredients)) {
    rewriteIngredientRef(ingredient, refRemappers);
  }
  for (const catalyst of arrayOf(set.catalysts)) rewriteIngredientRef(catalyst, refRemappers);
  rewriteToolIds(set, remapTool);
  // The LEGACY per-set `essences` quantity map. `migrateEssencesToIngredientGroups` deletes it
  // once it has folded each positive entry into an essence option, and `IngredientSet.toJSON`
  // omits it when empty — but it is still LIVE-READ (`utils/recipeEssenceReferences.js`,
  // `RecipeManager`, `InventoryListingBuilder`), so a set that predates that migration still
  // states its whole essence requirement here and nowhere else.
  rewriteEssenceQuantityMap(set, { remapEssence });
}

/**
 * Rewrite every reference one RECIPE carries, in place.
 *
 * @param {unknown} recipe
 * @param {{remapComponent: Function, remapTool: Function, remapEssence: Function}} remappers
 */
export function rewriteRecipeReferences(
  recipe,
  { remapComponent = identity, remapTool = identity, remapEssence = identity } = {}
) {
  if (!isPlainObject(recipe)) return;
  const remappers = { remapComponent, remapTool, remapEssence };
  const refRemappers = { remapComponent, remapEssence };
  for (const set of arrayOf(recipe.ingredientSets)) {
    rewriteIngredientSet(set, remappers);
  }
  rewriteResultGroups(recipe.resultGroups, remapComponent);
  // Flat `results[]` alias. `Recipe.toJSON` OMITS it when it holds the value the constructor
  // rebuilds from absence, so it is unproducible in practice and sits on
  // `WORLD_SCOPE_DEFENSIVE_SITES`. The read stays permanently: an older export or a legacy
  // flat-authored recipe carries it, and for those it is the only result data there is.
  for (const result of arrayOf(recipe.results)) rewriteResultRef(result, remapComponent);
  for (const catalyst of arrayOf(recipe.catalysts)) rewriteIngredientRef(catalyst, refRemappers);
  rewriteToolIds(recipe, remapTool);
  for (const step of arrayOf(recipe.steps)) {
    if (!isPlainObject(step)) continue;
    for (const set of arrayOf(step.ingredientSets)) {
      rewriteIngredientSet(set, remappers);
    }
    rewriteResultGroups(step.resultGroups, remapComponent);
    for (const catalyst of arrayOf(step.catalysts)) rewriteIngredientRef(catalyst, refRemappers);
    rewriteToolIds(step, remapTool);
  }
}

/**
 * Rewrite every reference one in-system COMPONENT carries (its salvage block), in place.
 *
 * The component's OWN id is not touched here — re-keying the definition itself is the caller's
 * decision, and copy-mode and the migration make it differently. Its ESSENCE quantity map is a
 * different matter and IS rewritten: those keys name OTHER entities, exactly as a salvage result's
 * `componentId` does.
 *
 * THE ESSENCE MAP IS REWRITTEN BEFORE THE SALVAGE EARLY RETURN, because a component with no
 * salvage block is the common case and its essences still have to move (issue 1654).
 *
 * @param {unknown} component
 * @param {{remapComponent: Function, remapTool: Function, remapEssence: Function}} remappers
 */
export function rewriteComponentReferences(
  component,
  { remapComponent = identity, remapTool = identity, remapEssence = identity } = {}
) {
  rewriteEssenceQuantityMap(component, { remapEssence });
  const salvage = component?.salvage;
  if (!isPlainObject(salvage)) return;
  rewriteResultGroups(salvage.resultGroups, remapComponent);
  for (const catalyst of arrayOf(salvage.catalysts)) {
    rewriteIngredientRef(catalyst, { remapComponent, remapEssence });
  }
  rewriteToolIds(salvage, remapTool);
}

/**
 * Rewrite the component references one ESSENCE DEFINITION carries, in place.
 *
 * All THREE spellings, including the legacy `sourceItemUuid`, which `## EssenceDefinition`
 * requirement 3 permits to hold a legacy component id. The rewrite is a keyed lookup, so a
 * `sourceItemUuid` holding a real document UUID is not a key and is left verbatim.
 *
 * @param {unknown} definition
 * @param {{remapComponent: Function}} remappers
 */
export function rewriteEssenceReferences(definition, { remapComponent = identity } = {}) {
  if (!isPlainObject(definition)) return;
  if ('sourceComponentId' in definition) {
    definition.sourceComponentId = remapComponent(definition.sourceComponentId);
  }
  if ('associatedSystemItemId' in definition) {
    definition.associatedSystemItemId = remapComponent(definition.associatedSystemItemId);
  }
  if ('sourceItemUuid' in definition) {
    definition.sourceItemUuid = remapComponent(definition.sourceItemUuid);
  }
}

/**
 * Rewrite every reference one TOOL carries, in place.
 *
 * @param {unknown} tool
 * @param {{remapComponent: Function, remapEssence: Function}} remappers
 */
export function rewriteToolReferences(
  tool,
  { remapComponent = identity, remapEssence = identity } = {}
) {
  if (!isPlainObject(tool)) return;
  if ('componentId' in tool) tool.componentId = remapComponent(tool.componentId);
  if (isPlainObject(tool.onBreak)) {
    // IMPORT-ONLY. `Tool.toJSON` never emits this key, so it is unreachable for any
    // normalized tool; `normalizeOnBreak` still reads it from an imported or hand-edited
    // payload, which is the only reason it is retained.
    if ('replacementComponentId' in tool.onBreak) {
      tool.onBreak.replacementComponentId = remapComponent(tool.onBreak.replacementComponentId);
    }
    // THE CANONICAL SITE, absent from the shipped copy-mode walk entirely.
    if (
      isPlainObject(tool.onBreak.replacementTarget) &&
      'componentId' in tool.onBreak.replacementTarget
    ) {
      tool.onBreak.replacementTarget.componentId = remapComponent(
        tool.onBreak.replacementTarget.componentId
      );
    }
  }
  // `repairRequirements` is an `IngredientGroup[]` whose options name the OWNING SYSTEM's
  // components — or, for an essence-typed option, its essences. It appeared nowhere in the
  // shipped walk.
  for (const group of arrayOf(tool.repairRequirements)) {
    for (const option of arrayOf(group?.options)) {
      rewriteIngredientRef(option, { remapComponent, remapEssence });
    }
  }
}

/**
 * Rewrite every reference one gathering TASK or EVENT carries, in place.
 *
 * @param {unknown} record
 * @param {{remapComponent: Function, remapTool: Function}} remappers
 */
export function rewriteGatheringRecordReferences(
  record,
  { remapComponent = identity, remapTool = identity } = {}
) {
  if (!isPlainObject(record)) return;
  for (const row of arrayOf(record.dropRows)) {
    if (!isPlainObject(row)) continue;
    if ('componentId' in row) row.componentId = remapComponent(row.componentId);
    if ('systemItemId' in row) row.systemItemId = remapComponent(row.systemItemId);
  }
  rewriteToolIds(record, remapTool);
}

/**
 * Rewrite every reference one CRAFTING SYSTEM record carries, in place.
 *
 * @param {unknown} system
 * @param {{remapComponent: Function, remapTool: Function, remapEssence: Function}} remappers
 */
export function rewriteSystemReferences(
  system,
  { remapComponent = identity, remapTool = identity, remapEssence = identity } = {}
) {
  if (!isPlainObject(system)) return;
  for (const component of arrayOf(system.components)) {
    rewriteComponentReferences(component, { remapComponent, remapTool, remapEssence });
  }
  // The essence DEFINITION's own id is not touched here, for the same reason the component's is
  // not: re-keying a definition is the caller's decision. Only the COMPONENT references it
  // carries are rewritten.
  for (const definition of arrayOf(system.essenceDefinitions)) {
    rewriteEssenceReferences(definition, { remapComponent });
  }
  for (const tool of arrayOf(system.tools)) {
    rewriteToolReferences(tool, { remapComponent, remapEssence });
  }
}

/**
 * Rewrite every reference ONE system's `gatheringConfig.systems[systemId]` block carries, in
 * place — including the LEGACY tools copy the `0.7.0` migration consumes.
 *
 * @param {unknown} slice
 * @param {{remapComponent: Function, remapTool: Function, remapEssence: Function}} remappers
 */
export function rewriteGatheringSliceReferences(
  slice,
  { remapComponent = identity, remapTool = identity, remapEssence = identity } = {}
) {
  if (!isPlainObject(slice)) return;
  for (const record of [...arrayOf(slice.tasks), ...arrayOf(slice.events)]) {
    rewriteGatheringRecordReferences(record, { remapComponent, remapTool });
  }
  for (const tool of arrayOf(slice.tools)) {
    rewriteToolReferences(tool, { remapComponent, remapEssence });
  }
}

/**
 * Rewrite every reference one WORLD SCOPE MEMBERSHIP record carries, in place.
 *
 * The essence membership's `effectSource` section carries the three shipped source spellings,
 * and the tool membership's `onBreak` section and seeded `repairRequirements` carry component
 * ids exactly as the in-system tool does. On a correctly ordered pass this finds NOTHING to
 * change, because the payloads are built from already-rewritten records — it is the
 * belt-and-braces arm `#### D6` requires. The migration COUNTS what this repairs and reports it
 * as `payloadRewriteRepairs`, and an acceptance test pins that count at ZERO — because an
 * unconditional repair arm would otherwise silently fix, and therefore hide, the very
 * payload-before-rewrite ordering regression it exists to back up.
 *
 * The COMPONENT arm was empty until issue 1654, because a component membership record carried no
 * reference to anything — its `category` and `essences` sections are its own. `essences` stopped
 * being "its own" the moment an essence id became re-keyable: the record's `essences` section is
 * spelled over `Component.essences` and so is a `Record<essenceId, number>` naming world essences.
 * Its sibling `inherit.essences` is a section-name switch, not an id, and is left alone.
 *
 * @param {unknown} record
 * @param {string} entityType `'components' | 'essences' | 'tools'`
 * @param {{remapComponent: Function, remapEssence: Function}} remappers
 */
export function rewriteMembershipReferences(
  record,
  entityType,
  { remapComponent = identity, remapEssence = identity } = {}
) {
  if (!isPlainObject(record)) return;
  if (entityType === 'components') {
    rewriteEssenceQuantityMap(record, { remapEssence });
    return;
  }
  if (entityType === 'essences') {
    rewriteEssenceReferences(record.effectSource, { remapComponent });
    return;
  }
  if (entityType === 'tools') {
    rewriteToolReferences(
      { onBreak: record.onBreak, repairRequirements: record.repairRequirements },
      { remapComponent, remapEssence }
    );
  }
}

/**
 * A keyed remapper over a plain `{ [oldId]: newId }` map.
 *
 * ONE SIMULTANEOUS LOOKUP, never a fixed-point iteration, which is what makes the rewrite
 * idempotent on a map whose image is disjoint from its keys.
 *
 * @param {object|null|undefined} map
 * @returns {(value: unknown) => unknown}
 */
export function keyedRemapper(map) {
  const source = isPlainObject(map) ? map : {};
  return (value) =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(source, value)
      ? source[value]
      : value;
}
