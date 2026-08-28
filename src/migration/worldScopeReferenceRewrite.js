/**
 * THE SHARED COMPONENT- AND TOOL-REFERENCE WALK (issue 1363, epic 1357, PR 3).
 *
 * ONE enumeration of every position in the persisted corpus that names a component id or a
 * tool id, used by BOTH the `1.30.0` world-scope migration and copy-mode import
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
 * Each entry names WHY it is unproducible, and each is retained because an IMPORTED or
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
  'systems[].tools[].onBreak.replacementComponentId',
  'systems[].components[].salvage.catalysts[]',
  'recipes[].results[].componentId',
  'recipes[].results[].systemItemId',
  'recipes[].catalysts[]',
  'recipes[].steps[].catalysts[]',
  'recipes[].ingredientSets[].ingredients[]',
  'recipes[].ingredientSets[].catalysts[]',
  'gatheringConfig.systems.*.tasks[].dropRows[].systemItemId',
  'gatheringConfig.systems.*.events[].dropRows[].componentId',
  'gatheringConfig.systems.*.events[].dropRows[].systemItemId',
  'gatheringConfig.systems.*.events[].toolIds[]',
  'gatheringConfig.systems.*.tools[].onBreak.replacementComponentId',
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
 * @param {unknown} ref
 * @param {(value: unknown) => unknown} remapComponent
 */
function rewriteIngredientRef(ref, remapComponent) {
  if (!isPlainObject(ref)) return;
  if (isPlainObject(ref.match)) {
    if ('componentId' in ref.match) ref.match.componentId = remapComponent(ref.match.componentId);
    if ('systemItemId' in ref.match) {
      ref.match.systemItemId = remapComponent(ref.match.systemItemId);
    }
  }
  if ('componentId' in ref) ref.componentId = remapComponent(ref.componentId);
  if ('systemItemId' in ref) ref.systemItemId = remapComponent(ref.systemItemId);
  for (const alternative of arrayOf(ref.alternatives)) {
    rewriteIngredientRef(alternative, remapComponent);
  }
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

function rewriteIngredientSet(set, remapComponent, remapTool) {
  if (!isPlainObject(set)) return;
  for (const group of arrayOf(set.ingredientGroups)) {
    for (const option of arrayOf(group?.options)) rewriteIngredientRef(option, remapComponent);
  }
  // Flat `ingredients[]` alias: `IngredientSet.toJSON` stopped emitting it at issue 1135, but
  // older exports and legacy flat-authored sets still carry it, and for those it is the set's
  // ONLY ingredient data.
  for (const ingredient of arrayOf(set.ingredients)) {
    rewriteIngredientRef(ingredient, remapComponent);
  }
  for (const catalyst of arrayOf(set.catalysts)) rewriteIngredientRef(catalyst, remapComponent);
  rewriteToolIds(set, remapTool);
}

/**
 * Rewrite every reference one RECIPE carries, in place.
 *
 * @param {unknown} recipe
 * @param {{remapComponent: Function, remapTool: Function}} remappers
 */
export function rewriteRecipeReferences(
  recipe,
  { remapComponent = identity, remapTool = identity } = {}
) {
  if (!isPlainObject(recipe)) return;
  for (const set of arrayOf(recipe.ingredientSets)) {
    rewriteIngredientSet(set, remapComponent, remapTool);
  }
  rewriteResultGroups(recipe.resultGroups, remapComponent);
  // Flat `results[]` alias — `Recipe.toJSON` re-emits it.
  for (const result of arrayOf(recipe.results)) rewriteResultRef(result, remapComponent);
  for (const catalyst of arrayOf(recipe.catalysts)) rewriteIngredientRef(catalyst, remapComponent);
  rewriteToolIds(recipe, remapTool);
  for (const step of arrayOf(recipe.steps)) {
    if (!isPlainObject(step)) continue;
    for (const set of arrayOf(step.ingredientSets)) {
      rewriteIngredientSet(set, remapComponent, remapTool);
    }
    rewriteResultGroups(step.resultGroups, remapComponent);
    for (const catalyst of arrayOf(step.catalysts)) rewriteIngredientRef(catalyst, remapComponent);
    rewriteToolIds(step, remapTool);
  }
}

/**
 * Rewrite every reference one in-system COMPONENT carries (its salvage block), in place.
 *
 * The component's OWN id is not touched here — re-keying the definition itself is the caller's
 * decision, and copy-mode and the migration make it differently.
 *
 * @param {unknown} component
 * @param {{remapComponent: Function, remapTool: Function}} remappers
 */
export function rewriteComponentReferences(
  component,
  { remapComponent = identity, remapTool = identity } = {}
) {
  const salvage = component?.salvage;
  if (!isPlainObject(salvage)) return;
  rewriteResultGroups(salvage.resultGroups, remapComponent);
  for (const catalyst of arrayOf(salvage.catalysts)) {
    rewriteIngredientRef(catalyst, remapComponent);
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
 * @param {{remapComponent: Function}} remappers
 */
export function rewriteToolReferences(tool, { remapComponent = identity } = {}) {
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
  // components. It appeared nowhere in the shipped walk.
  for (const group of arrayOf(tool.repairRequirements)) {
    for (const option of arrayOf(group?.options)) rewriteIngredientRef(option, remapComponent);
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
 * @param {{remapComponent: Function, remapTool: Function}} remappers
 */
export function rewriteSystemReferences(
  system,
  { remapComponent = identity, remapTool = identity } = {}
) {
  if (!isPlainObject(system)) return;
  for (const component of arrayOf(system.components)) {
    rewriteComponentReferences(component, { remapComponent, remapTool });
  }
  for (const definition of arrayOf(system.essenceDefinitions)) {
    rewriteEssenceReferences(definition, { remapComponent });
  }
  for (const tool of arrayOf(system.tools)) rewriteToolReferences(tool, { remapComponent });
}

/**
 * Rewrite every reference ONE system's `gatheringConfig.systems[systemId]` block carries, in
 * place — including the LEGACY tools copy the `0.7.0` migration consumes.
 *
 * @param {unknown} slice
 * @param {{remapComponent: Function, remapTool: Function}} remappers
 */
export function rewriteGatheringSliceReferences(
  slice,
  { remapComponent = identity, remapTool = identity } = {}
) {
  if (!isPlainObject(slice)) return;
  for (const record of [...arrayOf(slice.tasks), ...arrayOf(slice.events)]) {
    rewriteGatheringRecordReferences(record, { remapComponent, remapTool });
  }
  for (const tool of arrayOf(slice.tools)) rewriteToolReferences(tool, { remapComponent });
}

/**
 * Rewrite every reference one WORLD SCOPE MEMBERSHIP record carries, in place.
 *
 * The essence membership's `effectSource` section carries the three shipped source spellings,
 * and the tool membership's `onBreak` section and seeded `repairRequirements` carry component
 * ids exactly as the in-system tool does. On a correctly ordered pass this finds NOTHING to
 * change, because the payloads are built from already-rewritten records — it is the
 * belt-and-braces arm `#### D6` requires, and a test asserts it changes nothing.
 *
 * @param {unknown} record
 * @param {string} entityType `'components' | 'essences' | 'tools'`
 * @param {{remapComponent: Function}} remappers
 */
export function rewriteMembershipReferences(
  record,
  entityType,
  { remapComponent = identity } = {}
) {
  if (!isPlainObject(record)) return;
  if (entityType === 'essences') {
    rewriteEssenceReferences(record.effectSource, { remapComponent });
    return;
  }
  if (entityType === 'tools') {
    rewriteToolReferences(
      { onBreak: record.onBreak, repairRequirements: record.repairRequirements },
      { remapComponent }
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
