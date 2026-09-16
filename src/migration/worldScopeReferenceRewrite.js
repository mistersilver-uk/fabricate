/**
 * The shared component-, tool- and essence-reference walk (issues 1363, 1654): ONE enumeration of
 * every position in the persisted corpus naming such an id, shared by the `1.30.0` migration and
 * copy-mode import. KEY-AWARE and IDEMPOTENT given the disjoint-image map
 * `worldScopeEntityGrouping.js` enforces; KEY-POSITION rewriting is for an essence id alone.
 */

import { isPlainObject } from '../utils/scalars.js';

/**
 * Every leaf position the walk rewrites, with array indices collapsed to `[]`. A HAND-MAINTAINED
 * MIRROR, guarded both ways by `tests/world-scope-reference-walk.test.js` against a corpus built by
 * the REAL producers. Component-and-tool only; the essence leg keeps its own two lists, because a
 * merged one would weaken every derivation to a subset comparison.
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
  'gatheringConfig.systems.*.tasks[].resultGroups[].results[].componentId',
  'gatheringConfig.systems.*.tasks[].resultGroups[].results[].systemItemId',
  'gatheringConfig.systems.*.tools[].componentId',
  'gatheringConfig.systems.*.tools[].onBreak.replacementTarget.componentId',
  'gatheringConfig.systems.*.tools[].repairRequirements[].options[].componentId',
  'gatheringConfig.systems.*.tools[].repairRequirements[].options[].match.componentId',
  'gatheringConfig.systems.*.tools[].repairRequirements[].options[].alternatives[].componentId',
  'gatheringConfig.systems.*.tools[].repairRequirements[].options[].alternatives[].match.componentId',
]);

/**
 * The positions the walk covers that NO SHIPPED PRODUCER EMITS, listed separately because the
 * completeness guard is DERIVED from real producer output. Complete rather than indicative and
 * pinned both ways; each family is retained because an IMPORTED or HAND-EDITED payload can carry it.
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
 * Every position the walk rewrites given an essence remapper (issue 1654), in the same
 * mechanically-guarded style. Two spellings, because an essence id is the one class rewritten in KEY
 * position: `…essences{}` names the CONTAINER, since naming a key would pin one world's authored id.
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
 * The essence positions the derived fixture cannot produce, on the same escape-hatch rule. The two
 * `componentScope` key maps are a deliberate scoping exception, tested directly instead.
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

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

const identity = (value) => value;

/** Rewrite a `toolIds[]` array in place. */
function rewriteToolIds(container, remapTool) {
  if (!isPlainObject(container) || !Array.isArray(container.toolIds)) return;
  container.toolIds = container.toolIds.map((id) => remapTool(id));
}

/**
 * Rewrite one ingredient, catalyst or repair-option reference in place, recursing through
 * `alternatives`. The essence match folds in here so the two legs cannot drift; `amount` is a
 * quantity the rewrite must never touch.
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
 * The quantity a merged essence key carries: the SUM, last-writer-wins deleting an authored
 * quantity. A non-numeric side is answered rather than thrown.
 */
function mergedEssenceQuantity(kept, added) {
  const keptNumber = Number(kept);
  const addedNumber = Number(added);
  if (Number.isFinite(keptNumber) && Number.isFinite(addedNumber)) return keptNumber + addedNumber;
  if (Number.isFinite(keptNumber)) return kept;
  return added;
}

/**
 * Rewrite one `Record<essenceId, number>` map — the walk's only key-position rewrite. It takes the
 * CONTAINER, hard-codes `essences`, sums colliding keys, and accumulates through a `Map` so
 * `__proto__` lands as an own property. `inherit.essences` is a section-name switch, not this.
 */
export function rewriteEssenceQuantityMap(container, { remapEssence = identity } = {}) {
  if (!isPlainObject(container) || !isPlainObject(container.essences)) return;
  const merged = new Map();
  for (const [essenceId, quantity] of Object.entries(container.essences)) {
    const mapped = remapEssence(essenceId);
    // A remapper answering a non-string or empty string has not named a surviving essence, so the
    // key stays as authored rather than collapsing several ids onto `''`.
    const key = typeof mapped === 'string' && mapped.trim() ? mapped : essenceId;
    merged.set(key, merged.has(key) ? mergedEssenceQuantity(merged.get(key), quantity) : quantity);
  }
  container.essences = Object.fromEntries(merged);
}

/** Rewrite one result reference in place. */
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
  // Flat `ingredients[]` alias: dropped by `IngredientSet.toJSON` at issue 1135, but for an older
  // export or a legacy flat-authored set it is the set's ONLY ingredient data.
  for (const ingredient of arrayOf(set.ingredients)) {
    rewriteIngredientRef(ingredient, refRemappers);
  }
  for (const catalyst of arrayOf(set.catalysts)) rewriteIngredientRef(catalyst, refRemappers);
  rewriteToolIds(set, remapTool);
  // The legacy per-set `essences` quantity map, still live-read, so a set predating
  // `migrateEssencesToIngredientGroups` states its whole essence requirement here and nowhere else.
  rewriteEssenceQuantityMap(set, { remapEssence });
}

/** Rewrite every reference one RECIPE carries, in place. */
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
  // Flat `results[]` alias, omitted by `Recipe.toJSON` when it holds the rebuilt value, so it sits
  // on `WORLD_SCOPE_DEFENSIVE_SITES`. The read stays permanently: for an older export or a legacy
  // flat-authored recipe it is the only result data there is.
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
 * Rewrite every reference one in-system COMPONENT carries; its OWN id is the caller's decision. The
 * essence map is rewritten BEFORE the salvage early return, the no-salvage case being the common one.
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
 * Rewrite an ESSENCE DEFINITION's component references — all THREE spellings, the legacy
 * `sourceItemUuid` included (requirement 3); a keyed lookup leaves a real UUID verbatim.
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
 * Rewrite every reference one TOOL carries — both id families, `repairRequirements` options being
 * essence-typed, through {@link rewriteIngredientRef}. Both halves of the tool scope reach here.
 */
export function rewriteToolReferences(
  tool,
  { remapComponent = identity, remapEssence = identity } = {}
) {
  if (!isPlainObject(tool)) return;
  if ('componentId' in tool) tool.componentId = remapComponent(tool.componentId);
  if (isPlainObject(tool.onBreak)) {
    // IMPORT-ONLY: `Tool.toJSON` never emits this key, so it is unreachable for a normalized tool.
    // `normalizeOnBreak` still reads it from an imported or hand-edited payload.
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
  // `repairRequirements` is an `IngredientGroup[]` naming the OWNING SYSTEM's components, or its
  // essences for an essence-typed option. It appeared nowhere in the shipped walk.
  for (const group of arrayOf(tool.repairRequirements)) {
    for (const option of arrayOf(group?.options)) {
      rewriteIngredientRef(option, { remapComponent, remapEssence });
    }
  }
}

/** Rewrite every reference one gathering TASK or EVENT carries, in place. */
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
  rewriteResultGroups(record.resultGroups, remapComponent);
  rewriteToolIds(record, remapTool);
}

/** Rewrite every reference one CRAFTING SYSTEM record carries, in place. */
export function rewriteSystemReferences(
  system,
  { remapComponent = identity, remapTool = identity, remapEssence = identity } = {}
) {
  if (!isPlainObject(system)) return;
  for (const component of arrayOf(system.components)) {
    rewriteComponentReferences(component, { remapComponent, remapTool, remapEssence });
  }
  // The essence definition's own id is not touched, for the reason the component's is not: re-keying
  // a definition is the caller's decision.
  for (const definition of arrayOf(system.essenceDefinitions)) {
    rewriteEssenceReferences(definition, { remapComponent });
  }
  for (const tool of arrayOf(system.tools)) {
    rewriteToolReferences(tool, { remapComponent, remapEssence });
  }
}

/**
 * Rewrite every reference one system's `gatheringConfig.systems[systemId]` block carries, in place
 * — including the LEGACY tools copy the `0.7.0` migration consumes.
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
 * Rewrite every reference one WORLD SCOPE MEMBERSHIP record carries. On a correctly ordered pass
 * this finds NOTHING: it is the belt-and-braces arm, and the migration COUNTS what it repairs with
 * an acceptance test pinning that at ZERO, or it would hide the regression it backs up. The
 * component arm rewrites `essences` alone; `inherit.essences` is a section-name switch.
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
 * A keyed remapper over a plain `{ [oldId]: newId }` map. ONE SIMULTANEOUS LOOKUP, never a
 * fixed-point iteration, which is what makes the rewrite idempotent on a disjoint-image map.
 */
export function keyedRemapper(map) {
  const source = isPlainObject(map) ? map : {};
  return (value) =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(source, value)
      ? source[value]
      : value;
}
