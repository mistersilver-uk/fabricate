/**
 * THE READER LEDGER, AS A FAIL-CLOSED GATE (issue 1370, epic 1357, PR 8a, criterion 11). 1. **An
 * UNLEDGERED SITE REDS.** Revert one repoint and the scan finds a site the ledger does not name.
 */

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { collectSources, repoRoot, stripComments } from './helpers/sourceScan.js';

/**
 * The matcher: a DOT access, or a BRACKET access with a string literal. The bracket form is the one
 * place a receiver IS required, and only to tell `system['components']` from an ARRAY LITERAL.
 */
const MATCHER =
  /(?:\.|[\w$)\]]\[\s*['"])(?:components|essenceDefinitions|tools)\b/g;

/** The directories the sweep did not enter, and the file whose bare string constants are JSON paths. */
const EXCLUDED_PREFIXES = Object.freeze(['src/ui/', 'src/migration/']);
const PATH_CONSTANT_FILES = Object.freeze(new Set(['src/systems/worldScopeReferenceRewrite.js']));
const STRING_CONSTANT_LINE = /^\s*'[^']*',?\s*$/;

/** Every reason a raw read may still be here, each drawn from the delta's `#### D5`. */
const REASONS = Object.freeze({
  writer:
    "the manager's own authoring and writer surface: a reader repoint would make the manager " +
    'write to a merged read row instead of the persisted record',
  'authoring-accessor':
    '`getItems` is the authoring and browse accessor the world catalogue routes take over',
  basis:
    'the Valid Id BASIS, which is deliberately NOT membership-filtered and must never be narrowed',
  restamp: 'the durable-identity restamp, whose subject is the persisted record',
  'pre-persist':
    'the pre-persist alchemy injector, which validates a not-yet-saved system against itself',
  'destructive-basis':
    'a destructive prune basis: widening or narrowing it deletes real data, so it reads the ' +
    'persisted record',
  import: 'the import path builds the system from the in-system arrays for every field',
  'rewrite-walk':
    'the shared reference walk rewrites the raw payload in place, so it reads the in-system ' +
    'arrays that payload carries',
  export: 'the export path writes the in-system arrays at schema 6',
  guard:
    'an `Array.isArray` GUARD whose consequent IS repointed; the guard asks what the record ' +
    'carries, which is a different question from what the reader reads',
  parameter: 'this module takes the candidate set as a PARAMETER and needs no change',
  'not-a-system':
    'the receiver is not a crafting system — a validation result, a chat view-model, a task, a ' +
    'memo guard tuple or a paged browser model',
});

/** The delta's measurement of `origin/main` at `7304be93`, before this PR's first edit. */
const BASE_SCAN = Object.freeze({
  matches: 282,
  lines: 228,
  files: 32,
  pairs: 190,
  collisionGroups: 26,
  collisionSites: 64,
});

/**
 * The live tree's measurement, asserted as an EXACT EQUALITY rather than as a floor (issue 1371).
 */
const SCAN_TOTALS = Object.freeze({
  // #1648: eight unique tool/receipt reads in two engines; #1666 and #1665 relocated ten files.
  // #1701 moved nine of `CraftingEngine.js`'s validated-tool reads into `craftPipeline.js`, and
  // #1714 moved five more into `salvagePipeline.js`, so only the per-file keying moved: no read
  // was added or removed, which is why `matches` and `lines` hold. #1699 moved four reads into
  // the new `SourceIdentityService.js` (`files` 20 -> 21) and retired two auto-stamp loop headers
  // for two per-arm selectors (`pairs` 127 -> 128, and the component-loop collision group 5 -> 4,
  // so `collisionSites` 43 -> 42); `matches` and `lines` are conserved, because nothing was added.
  // #1923 moved five normalizer reads into `normalize/system.js` (`files` 21 -> 22); the rest hold.
  // It then moved eight item-source lines into `manager/itemSources.js` (+1 file);
  // pairs/collisions re-derived. Ten tool-source lines moved to `manager/toolSources.js` (+1 file).
  // Five bulk-edit lines moved to `manager/bulkEdits.js` (+1 file).
  // Eight delete-cascade lines moved to `manager/deleteCascades.js` (+1 file), then nine
  // essence-delete lines followed them there.
  matches: 169,
  lines: 154,
  files: 26,
  pairs: 137,
  collisionGroups: 14,
  collisionSites: 31,
});

/**
 * Every surviving raw read, keyed `(file, anchor, expected occurrence count)` with the reason it is
 * still here.
 */
const LEDGER = Object.freeze([
  // #1648: validated tool pairs and durable effect receipts, never system libraries.
  ['src/systems/CraftingEngine.js', "const tools = toolValidation.tools;", 1, 'not-a-system'],
  ['src/systems/CraftingEngine.js', "toolPairs: [...prepared.toolValidation.tools],", 1, 'not-a-system'],
  ['src/systems/CraftingEngine.js', "if (shouldUseTools && prepared.toolValidation.tools.length > 0) {", 1, 'not-a-system'],
  ['src/systems/CraftingEngine.js', "prepared.toolValidation.tools,", 1, 'not-a-system'],
  ['src/systems/CraftingEngine.js', "prepared.toolValidation?.tools ?? prepared.toolItems", 1, 'not-a-system'],
  ['src/systems/CraftingEngine.js', "state.usedTools = cloneJsonValue(toolReceipt.tools) ?? [];", 1, 'not-a-system'],
  ['src/systems/GatheringEngine.js', "if (resolvedTools.tools.length > 0) {", 1, 'not-a-system'],
  ['src/systems/GatheringEngine.js', "tools: resolvedTools.tools,", 1, 'not-a-system'],
  ['src/systems/AlchemySignatureReport.js', "this.components = components;", 1, 'parameter'],
  ['src/systems/AlchemySignatureReport.js', "this.components,", 1, 'parameter'],
  ['src/systems/AlchemySignatureReport.js', "this._validator.describeConflict(first, second, this.components)", 1, 'parameter'],
  ['src/systems/BulkSalvageService.js', "item.tools = brokenToolEntries(salvageRun, entry.system);", 1, 'not-a-system'],
  ['src/systems/BulkSalvageService.js', "tools: dedupeTools(subjects.flatMap((item) => item.tools)),", 1, 'not-a-system'],
  ['src/systems/CompendiumImporter.js', "const components = Array.isArray(systemData.components) ? systemData.components : [];", 1, 'import'],
  ['src/systems/CompendiumImporter.js', "summary.components.total = components.length;", 1, 'import'],
  ['src/systems/CompendiumImporter.js', "const componentLeg = legs.components;", 1, 'import'],
  ['src/systems/CompendiumImporter.js', "for (const entry of summary.components.remapped) {", 1, 'import'],
  ['src/systems/CompendiumImporter.js', "for (const entry of summary.components.unresolved) {", 1, 'import'],
  ['src/systems/CompendiumImporter.js', "system: { components: systemInput.components || [] },", 1, 'import'],
  ['src/systems/CompendiumImporter.js', "const items = existingSystem.items || existingSystem.components || [];", 1, 'import'],
  ['src/systems/CompendiumImporter.js', "summary.components.remapped.push({", 2, 'import'],
  ['src/systems/CompendiumImporter.js', "summary.components.unresolved.push({", 1, 'import'],
  ['src/systems/CompendiumImporter.js', "summary.components.retained.push({", 1, 'import'],
  ['src/systems/CraftingEngine.js', "toolItems: toolValidation.tools,", 1, 'not-a-system'],
  ['src/systems/craftPipeline.js', "toolItems: toolValidation.tools,", 2, 'not-a-system'],
  ['src/systems/craftPipeline.js', "usedToolPairs = toolValidation.tools;", 1, 'not-a-system'],
  ['src/systems/craftPipeline.js', "usedToolsOnFail = await engine._applyToolBreakage(executionRecipe, toolValidation.tools, {", 1, 'not-a-system'],
  ['src/systems/craftPipeline.js', "usedToolPairsOnValidationFail = toolValidation.tools;", 1, 'not-a-system'],
  ['src/systems/craftPipeline.js', "toolValidation.tools,", 2, 'not-a-system'],
  ['src/systems/craftPipeline.js', "const usedTools = await engine._applyToolBreakage(executionRecipe, toolValidation.tools, {", 1, 'not-a-system'],
  ['src/systems/craftPipeline.js', "tools: toolValidation.tools,", 1, 'not-a-system'],
  ['src/systems/CraftingEngine.js', "const toolItems = toolValidation.valid ? toolValidation.tools || [] : [];", 1, 'not-a-system'],
  ['src/systems/CraftingEngine.js', "usedTools = await this._applyToolBreakage(executionRecipe, toolValidation.tools, {", 1, 'not-a-system'],
  ['src/systems/CraftingEngine.js', "const components = Array.isArray(system?.components)", 1, 'guard'],
  ['src/systems/CraftingEngine.js', "for (const tool of missing.tools || []) {", 1, 'not-a-system'],
  ['src/systems/salvagePipeline.js', "toolItems: toolValidation.tools,", 1, 'not-a-system'],
  ['src/systems/salvagePipeline.js', "tools: toolValidation.tools,", 2, 'not-a-system'],
  [
    'src/systems/salvagePipeline.js',
    "usedTools = await engine._applyToolBreakage(syntheticRecipe, toolValidation.tools, {",
    1,
    'not-a-system',
  ],
  [
    'src/systems/salvagePipeline.js',
    "const usedTools = await engine._applyToolBreakage(syntheticRecipe, toolValidation.tools, {",
    1,
    'not-a-system',
  ],
  ['src/systems/CraftingSystemExporter.js', "if (Array.isArray(system.essenceDefinitions)) {", 1, 'export'],
  ['src/systems/CraftingSystemExporter.js', "for (const def of system.essenceDefinitions) {", 1, 'export'],
  ['src/systems/CraftingSystemManager.js', "system?.components ?? system?.managedItems ?? system?.items", 1, 'basis'],
  ['src/systems/CraftingSystemManager.js', "system?.essenceDefinitions ?? system?.essences", 1, 'basis'],
  ['src/systems/CraftingSystemManager.js', "toolIds: _scopeEntityBasis(_resolveStoreSeam(this._toolScopeStore), system?.tools),", 1, 'basis'],
  // #1923: the system normalizer moved to `normalize/system.js`; the tools line collapsed to one.
  ['src/systems/normalize/system.js', "system.essenceDefinitions ?? system.essences", 1, 'writer'],
  ['src/systems/normalize/system.js', "const rawManagedItems = Array.isArray(system.components)", 1, 'writer'],
  ['src/systems/normalize/system.js', "? system.components", 1, 'writer'],
  ['src/systems/normalize/system.js', "const normalizedTools = Array.isArray(system.tools)", 1, 'writer'],
  ['src/systems/normalize/system.js', "? system.tools.map((t) => normalizeTool(t, { validPrerequisiteIds: validToolPrerequisiteIds }))", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "const managedItems = system.components || [];", 1, 'authoring-accessor'],
  // #1923: the tool-source transaction's writer reads, moved to `manager/toolSources.js`.
  ['src/systems/manager/toolSources.js', "system.tools = previousTools;", 3, 'writer'],
  ['src/systems/manager/toolSources.js', "const tools = Array.isArray(system.tools) ? system.tools : [];", 2, 'writer'],
  ['src/systems/manager/toolSources.js', ": [...tools, staged];", 1, 'writer'],
  ['src/systems/manager/toolSources.js', "const previousTools = system.tools;", 2, 'writer'],
  ['src/systems/manager/toolSources.js', "system.tools = nextTools;", 1, 'writer'],
  ['src/systems/manager/toolSources.js', "system.tools = tools.filter((entry) => String(entry?.id) !== String(toolId));", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "? updates.essenceDefinitions", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', ": current.essenceDefinitions,", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "const components = Array.isArray(system.components) ? system.components : [];", 1, 'pre-persist'],
  // #1923: the system delete's writer reads, moved to `manager/deleteCascades.js`.
  ['src/systems/manager/deleteCascades.js', "const componentCount = Array.isArray(system.components)", 1, 'writer'],
  ['src/systems/manager/deleteCascades.js', "? system.components.length", 1, 'writer'],
  ['src/systems/manager/deleteCascades.js', "const essenceCount = Array.isArray(system.essenceDefinitions)", 1, 'writer'],
  ['src/systems/manager/deleteCascades.js', "? system.essenceDefinitions.length", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "system.components.push(item);", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "advanceDefinitionRevision(system.components);", 2, 'writer'],
  ['src/systems/CraftingSystemManager.js', "(system.components || []).find((item) => {", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "for (const component of system.components || []) {", 1, 'writer'],
  // #1923: the essence deletes' component loops, moved to `manager/deleteCascades.js`.
  ['src/systems/manager/deleteCascades.js', "for (const component of system.components || []) {", 3, 'writer'],
  // #1699: the stamping and repair clusters moved to `SourceIdentityService.js`, and the three
  // auto-stamps collapsed onto one parameterised body whose per-arm `entriesOf` selectors replace
  // the two retired loop headers.
  ['src/systems/SourceIdentityService.js', "entriesOf: (system) => system.components || [],", 1, 'restamp'],
  ['src/systems/SourceIdentityService.js', "entriesOf: (system) => system.tools || [],", 1, 'restamp'],
  ['src/systems/SourceIdentityService.js', "definitions: system.components || [],", 1, 'restamp'],
  ['src/systems/SourceIdentityService.js', "definitions: (system.tools || []).filter(", 1, 'restamp'],
  ['src/systems/CraftingSystemManager.js', "const idx = system.components.findIndex((i) => i.id === itemId);", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "system.components[idx] = updatedItem;", 1, 'writer'],
  // #1923: the item-source cluster's writer reads, moved to `manager/itemSources.js`.
  ['src/systems/manager/itemSources.js', "advanceDefinitionRevision(system.components);", 3, 'writer'],
  ['src/systems/manager/itemSources.js', "system.components.push(item);", 1, 'writer'],
  ['src/systems/manager/itemSources.js', "const idx = system.components.findIndex((i) => i.id === itemId);", 1, 'writer'],
  ['src/systems/manager/itemSources.js', "const existing = system.components[idx];", 1, 'writer'],
  ['src/systems/manager/itemSources.js', "system.components[idx] = updatedItem;", 1, 'writer'],
  ['src/systems/manager/itemSources.js', "const components = Array.isArray(system.components) ? system.components : [];", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "{ ...system.components[idx], ...updates, id: itemId },", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "if (!this._sameSourceReferenceSet(system.components[idx], updatedItem)) {", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "return system.components[idx];", 1, 'writer'],
  // #1923: the component bulk edit's writer reads, moved to `manager/bulkEdits.js`.
  ['src/systems/manager/bulkEdits.js', "for (let idx = 0; idx < system.components.length; idx += 1) {", 1, 'writer'],
  ['src/systems/manager/bulkEdits.js', "const component = system.components[idx];", 1, 'writer'],
  ['src/systems/manager/bulkEdits.js', "system.components[idx] = io.normalizeComponent(", 1, 'writer'],
  ['src/systems/manager/bulkEdits.js', "if (changedIds.length > 0) advanceDefinitionRevision(system.components);", 1, 'writer'],
  // #1923: the component-set delete's writer reads, moved to `manager/deleteCascades.js`.
  ['src/systems/manager/deleteCascades.js', "const components = Array.isArray(system.components) ? system.components : [];", 1, 'writer'],
  ['src/systems/manager/deleteCascades.js', "system.components = components.filter(", 1, 'writer'],
  ['src/systems/manager/deleteCascades.js', "const essenceDefinitions = (system.essenceDefinitions || []).map((def) => ({", 1, 'writer'],
  ['src/systems/manager/deleteCascades.js', "system.essenceDefinitions = essenceDefinitions;", 1, 'writer'],
  // #1923: the essence deletes' writer reads, moved to `manager/deleteCascades.js`; the last
  // collapsed onto one line at the module's shallower indent.
  ['src/systems/manager/deleteCascades.js', "const definitions = Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];", 2, 'writer'],
  // #1923: the essence bulk edit's third copy of the line above, moved to `manager/bulkEdits.js`.
  ['src/systems/manager/bulkEdits.js', "const definitions = Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];", 1, 'writer'],
  ['src/systems/manager/deleteCascades.js', "system.essenceDefinitions = definitions.filter((def) => def.id !== essenceId);", 1, 'writer'],
  ['src/systems/manager/deleteCascades.js', "system.essences = system.essenceDefinitions.map((def) => def.id);", 2, 'writer'],
  ['src/systems/manager/deleteCascades.js', "system.essenceDefinitions = definitions.filter((def) => !removedIdSet.has(String(def?.id ?? '')));", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "const items = Array.isArray(system.components) ? system.components : [];", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "const rawItems = Array.isArray(inputSystem?.components)", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "? inputSystem.components", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "(Array.isArray(normalizedSystem?.components) ? normalizedSystem.components : []).map(", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "systems.flatMap((system) => (system.components || []).map((component) => component.id))", 1, 'destructive-basis'],
  ['src/systems/GatheringDropReferenceValidator.js', "if (Array.isArray(systemOrComponents?.components)) {", 1, 'guard'],
  ['src/systems/GatheringEngine.js', "if (taskTools.tools.length > 0) {", 1, 'not-a-system'],
  ['src/systems/GatheringEngine.js', "tools: taskTools.tools,", 2, 'not-a-system'],
  ['src/systems/GatheringEngine.js', "} else if (taskTools.tools.length > 0) {", 1, 'not-a-system'],
  ['src/systems/GatheringEngine.js', "tools.push(...normalizeList(task?.tools));", 1, 'not-a-system'],
  ['src/systems/GatheringEngine.js', "const tools = resolvedTools.tools;", 2, 'not-a-system'],
  ['src/systems/GatheringRichStateService.js', "const toolSource = Array.isArray(system?.tools)", 1, 'guard'],
  ['src/systems/GatheringRichStateService.js', "tools: normalizeList(config?.tools).map(normalizeLibraryTool).filter(Boolean),", 1, 'not-a-system'],
  ['src/systems/RecipeManager.js', "previous.components === next.components &&", 1, 'not-a-system'],
  ['src/systems/SignatureValidator.js', "const conflicts = this._auditEntries(compiled.entries, compiled.components);", 1, 'parameter'],
  ['src/systems/SignatureValidator.js', "components: compiled.components,", 1, 'parameter'],
  ['src/systems/SignatureValidator.js', "conflicts: this._auditEntries(compiled.entries, compiled.components),", 1, 'parameter'],
  ['src/systems/importReferenceResolver.js', "const components = arrayOf(prepared.system?.components);", 1, 'import'],
  ['src/systems/importReferenceResolver.js', "const components = Array.isArray(system?.components) ? system.components : [];", 1, 'import'],
  ['src/systems/importReferenceResolver.js', "const slice = prepared[WORLD_SCOPE_SLICE_KEYS.components];", 1, 'import'],
  ['src/systems/importReferenceResolver.js', "collectMacroDescriptors(system.essenceDefinitions, 'essence', descriptors, 'propertyMacroUuid');", 1, 'import'],
  ['src/systems/importReferenceResolver.js', "collectComplicationMacroDescriptors(system.components, descriptors);", 1, 'import'],
  ['src/systems/importReferenceResolver.js', "const componentIds = idSet(system.components);", 1, 'import'],
  ['src/systems/importReferenceResolver.js', "for (const tool of arrayOf(system.tools)) reportToolComponentRefs(tool);", 1, 'import'],
  ['src/systems/importReferenceResolver.js', "for (const tool of arrayOf(slice.tools)) reportToolComponentRefs(tool);", 1, 'import'],
  ['src/systems/importReferenceResolver.js', "for (const component of arrayOf(system.components)) {", 1, 'import'],
  ['src/systems/importReferenceResolver.js', "for (const def of arrayOf(system.essenceDefinitions)) {", 1, 'import'],
  ['src/systems/worldScopeReferenceRewrite.js', "for (const component of arrayOf(system.components)) {", 1, 'rewrite-walk'],
  ['src/systems/worldScopeReferenceRewrite.js', "for (const definition of arrayOf(system.essenceDefinitions)) {", 1, 'rewrite-walk'],
  ['src/systems/worldScopeReferenceRewrite.js', "for (const tool of arrayOf(system.tools)) {", 1, 'rewrite-walk'],
  ['src/systems/worldScopeReferenceRewrite.js', "for (const tool of arrayOf(slice.tools)) {", 1, 'rewrite-walk'],
  ['src/systems/remapWorldScopeIdentityFlags.js', "for (const [oldId, newId] of Object.entries(perSystem?.components ?? {})) {", 1, 'not-a-system'],
  ['src/systems/remapWorldScopeIdentityFlags.js', "const remapComponent = legLookup(perSystem.components);", 1, 'not-a-system'],
  ['src/systems/remapWorldScopeIdentityFlags.js', "const remapTool = legLookup(perSystem.tools);", 1, 'not-a-system'],
  ['src/systems/remapWorldScopeIdentityFlags.js', "const remapComponent = legLookup(rekeyMap[systemId]?.components);", 1, 'not-a-system'],
  ['src/systems/restampOwnedItemComponentIdentity.js', "const components = Array.isArray(system?.components) ? system.components : [];", 1, 'restamp'],
  ['src/systems/startupPassComposition.js', "new Set((system.components || []).map((component) => component.id)),", 1, 'destructive-basis'],
  ['src/systems/worldScopeEntityGrouping.js', "componentsBySystem.set(trimmedString(system.id), arrayOf(system.components));", 1, 'basis'],
  ['src/systems/worldScopeEntityNotice.js', "components: Number(created.components) || 0,", 1, 'not-a-system'],
  ['src/systems/worldScopeEntityNotice.js', "tools: Number(created.tools) || 0,", 1, 'not-a-system'],
  ['src/systems/worldScopeEntityNotice.js', "const createdTotal = counts.components + counts.essences + counts.tools;", 1, 'not-a-system'],
]);

/** NAMED LIVE ANCHORS in four distinct files, the other half of the positive control. */
const POSITIVE_ANCHORS = Object.freeze([
  [
    'src/systems/CraftingSystemManager.js',
    'const components = Array.isArray(system.components) ? system.components : [];',
  ],
  ['src/systems/CraftingEngine.js', 'toolItems: toolValidation.tools,'],
  [
    'src/systems/worldScopeEntityGrouping.js',
    'componentsBySystem.set(trimmedString(system.id), arrayOf(system.components));',
  ],
  [
    'src/systems/CompendiumImporter.js',
    'const components = Array.isArray(systemData.components) ? systemData.components : [];',
  ],
]);

/** Every matched line under `src/`, keyed `(file, anchor)` and counted. */
function scan() {
  const sources = collectSources(resolve(repoRoot, 'src'), { extensions: ['.js'] });
  const rows = new Map();
  const totals = { matches: 0, lines: 0, files: 0, pairs: 0, collisionGroups: 0, collisionSites: 0 };
  const files = new Set();
  for (const [file, text] of Object.entries(sources)) {
    if (EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix))) continue;
    const skipConstants = PATH_CONSTANT_FILES.has(file);
    for (const line of stripComments(text).split('\n')) {
      if (skipConstants && STRING_CONSTANT_LINE.test(line)) continue;
      const found = line.match(MATCHER);
      if (!found) continue;
      totals.matches += found.length;
      totals.lines += 1;
      files.add(file);
      const key = `${file}\u0000${line.trim()}`;
      rows.set(key, (rows.get(key) ?? 0) + 1);
    }
  }
  totals.files = files.size;
  totals.pairs = rows.size;
  for (const count of rows.values()) {
    if (count > 1) {
      totals.collisionGroups += 1;
      totals.collisionSites += count;
    }
  }
  return { rows, totals };
}

const ledgerByKey = new Map(
  LEDGER.map(([file, anchor, count, reason]) => [`${file}\u0000${anchor}`, { count, reason }])
);

describe('the world-scope reader ledger', () => {
  it('names a KNOWN reason for every entry', () => {
    const unknown = LEDGER.filter(([, , , reason]) =>
      reason.split('+').some((code) => !(code in REASONS))
    );
    assert.deepEqual(
      unknown.map(([file, anchor, , reason]) => `${file} :: ${anchor} :: ${reason}`),
      [],
      'every surviving raw read cites a reason drawn from the delta’s exclusion clauses'
    );
    assert.equal(ledgerByKey.size, LEDGER.length, 'and no two entries share a (file, anchor) key');
  });

  // THE POSITIVE CONTROL — measured, obligations 1 and 2 both stay GREEN against a matcher that
  // matches nothing, so neither of them can stand in for this.

  it('finds EXACTLY the committed totals, so a matcher that matched nothing reds here', () => {
    const { totals } = scan();
    assert.deepEqual(
      totals,
      SCAN_TOTALS,
      'The live scan no longer matches the committed totals. If you have LEGITIMATELY added or ' +
        'removed a raw read of a crafting system’s `components`, `essenceDefinitions` or `tools` ' +
        'anywhere under `src/` outside the excluded prefixes and files — including a chat ' +
        'view-model field or any other non-system receiver — then update the LEDGER entry and ' +
        'these six numbers together. If you have not, the MATCHER has changed and is now finding ' +
        'the wrong population.'
    );
  });

  it('finds the four NAMED live anchors, in four distinct files', () => {
    const { rows } = scan();
    for (const [file, anchor] of POSITIVE_ANCHORS) {
      assert.ok(
        rows.has(`${file}\u0000${anchor}`),
        `${file} no longer carries the named anchor \`${anchor}\` — either the scan is vacuous ` +
          'or this control needs a new anchor'
      );
    }
    assert.equal(new Set(POSITIVE_ANCHORS.map(([file]) => file)).size, 4);
  });

  // OBLIGATION 1 — an unledgered site reds

  it('leaves NO live raw read unledgered, and no ledgered read miscounted', () => {
    const { rows } = scan();
    const unledgered = [];
    for (const [key, count] of rows) {
      const entry = ledgerByKey.get(key);
      const [file, anchor] = key.split('\u0000');
      if (!entry) {
        unledgered.push(`${file} :: ${anchor} (x${count}) is not in the ledger`);
      } else if (entry.count !== count) {
        unledgered.push(`${file} :: ${anchor} occurs ${count} time(s), ledgered as ${entry.count}`);
      }
    }
    assert.deepEqual(
      unledgered,
      [],
      'a raw read of a crafting system’s entity arrays must either be repointed at the read ' +
        'union or ledgered here with the reason it is not'
    );
  });

  // OBLIGATION 2 — a stale anchor reds

  it('carries no STALE anchor: every ledgered line still exists in its file', () => {
    const { rows } = scan();
    const stale = LEDGER.filter(([file, anchor]) => !rows.has(`${file}\u0000${anchor}`)).map(
      ([file, anchor]) => `${file} :: ${anchor}`
    );
    assert.deepEqual(stale, [], 'a ledger entry whose line is gone is an excuse for nothing');
  });

  // The matcher itself, pinned — the meta-test the sibling gate added for the same reason

  it('matches a RAW read and stops matching a REPOINTED one', () => {
    const raw = 'const components = Array.isArray(system?.components) ? system.components : [];';
    const repointed = 'const components = resolvedComponentsFor(system);';
    assert.equal(raw.match(MATCHER)?.length, 2, 'the premise: a raw read really is matchable');
    assert.equal(repointed.match(MATCHER), null, 'and a repointed one is not');
    assert.equal('essences.componentsOf(x)'.match(MATCHER), null, '`\\b` bounds the match');
    assert.equal('a.essenceDefinitions'.match(MATCHER)?.length, 1);
  });

  it('strips comments before matching, so prose describing a retired read is not a site', () => {
    const commented = '// reads system.components directly\nconst x = 1;';
    assert.equal(stripComments(commented).match(MATCHER), null);
    assert.equal(commented.match(MATCHER)?.length, 1, 'the premise: the prose WOULD have matched');
  });
});
