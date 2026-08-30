/**
 * THE READER LEDGER, AS A FAIL-CLOSED GATE (issue 1370, epic 1357, PR 8a, criterion 11).
 *
 * PR 8a repoints every non-UI reader of a crafting system's `components`, `essenceDefinitions` or
 * `tools` array at the world-scope read union. A no-drift differential cannot see a MISSING
 * repoint, and the sweep that produced the reader set was mechanical — so the set is closed HERE,
 * by naming every remaining raw read in the tree and refusing to accept a new one silently.
 *
 * ## THREE OBLIGATIONS, AND THE THIRD IS THE ONE THAT IS EASY TO OMIT
 *
 *  1. **An UNLEDGERED SITE REDS.** Revert one repoint and the scan finds a site the ledger does
 *     not name.
 *  2. **A STALE ANCHOR REDS.** Edit a ledger anchor and its file no longer contains it.
 *  3. **A POSITIVE CONTROL: the scan must PROVE it found things.** Measured, obligations 1 and 2
 *     BOTH stay green against a matcher that matches nothing — obligation 1 is the only one that
 *     exercises the scanner, and a vacuous scan finds no unledgered site, while obligation 2 reads
 *     each file directly and never touches the matcher at all. This gate is the SOLE discharge of
 *     the omitted-reader finding, so a vacuous matcher would silently reinstate it while every
 *     acceptance criterion stayed green.
 *
 * The precedent is the direct sibling: `tests/world-scope-no-shed-gate.test.js` records an earlier
 * form of that guarantee which "asserted a NAME IS NOT FOUND, so deleting the three methods kept
 * it green", and the fix there was the same one taken here — a POSITIVE EXISTENCE ANCHOR, plus a
 * meta-test pinning the matcher itself.
 *
 * ## THE MATCHER CARRIES NO RECEIVER PREDICATE, DELIBERATELY
 *
 * It is `/\.(?:components|essenceDefinitions|tools)\b/g` over `src/**\/*.js` less `src/ui/**` and
 * `src/migration/**`, comments stripped. A receiver heuristic is a thing that can be got WRONG,
 * and the whole purpose of the totals below is to detect a matcher that has been got wrong — so
 * removing the heuristic closes that class by construction rather than by threshold. False
 * positives (`toolValidation.tools`, `SALVAGE_CHAT_KEYS.tools`, `model.components`,
 * `item.tools`) and the seven files that are not readers at all are LEDGERED with a stated reason,
 * exactly as the manager's writer surface is. Narrowing the matcher to make them drop out is the
 * vacuity this control exists to catch.
 *
 * ## THE KEY IS `(file, anchor, count)`, NOT `(file, anchor)`
 *
 * Three byte-identical lines in `CraftingSystemManager.js` share one anchor while being alchemy
 * pre-validation, the `updateItem` metadata walk and `_deleteComponentSet` — three different
 * reasons under one entry. Without the count a NEW unrepointed reader spelled like an existing
 * ledgered anchor would be invisible, and an entry's stated reason would not describe every site
 * it covers. That entry carries a COMPOUND reason for exactly that reason.
 *
 * ## TWO BLIND SPOTS THE MATCHER CANNOT CLOSE, NAMED SO A CLEAN SCAN IS NOT MISTAKEN FOR AN
 * ## EXHAUSTIVE ONE
 *
 *  - **A COMPUTED KEY is unmatchable.** `src/systems/worldIdentityDrift.js` reads the entity
 *    arrays as `system[ENTITY_FIELDS[entityType]]`, so this scan sees nothing in that file. It is
 *    the one reader that MUST keep reading the raw setting, and it would neither red here as
 *    unledgered nor be pinned here. `tests/world-scope-consumer-sweep.test.js` pins it instead.
 *  - **DESTRUCTURING is unmatchable.** `const { components } = system` does not match.
 *
 * ## THE COMMITTED TOTALS, AND WHY THE DELTA'S BASE MEASUREMENT IS NOT THE LIVE FLOOR
 *
 * `BASE_SCAN` is the delta's own measurement of `origin/main` at `7304be93`, reproduced here
 * before the first edit of this PR. It CANNOT be a floor on the post-sweep tree, and the arithmetic
 * says why: the sweep's whole purpose is to remove raw reads, and it removed 82 of the 228 matched
 * lines. `SCAN_TOTALS` is therefore asserted as an EXACT EQUALITY against the live tree rather
 * than as a floor — which is strictly stronger, because a floor tolerates over-matching in one
 * direction and a matcher narrowed to a subset in the other, and an equality tolerates neither.
 * A vacuous matcher answers zero against a committed 146 and reds immediately.
 */

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { collectSources, repoRoot, stripComments } from './helpers/sourceScan.js';

/** The matcher, with NO receiver predicate. See the module note. */
const MATCHER = /\.(?:components|essenceDefinitions|tools)\b/g;

/** The two directories the sweep deliberately did not enter. */
const EXCLUDED_PREFIXES = Object.freeze(['src/ui/', 'src/migration/']);

/**
 * Every reason a raw read may still be here, each drawn from the delta's `#### D5`.
 *
 * A reason not in this map fails the first test below, so a new entry cannot be waved through
 * with a freehand excuse.
 */
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
  export: 'the export path writes the in-system arrays at schema 6',
  guard:
    'an `Array.isArray` GUARD whose consequent IS repointed; the guard asks what the record ' +
    'carries, which is a different question from what the reader reads',
  parameter: 'this module takes the candidate set as a PARAMETER and needs no change',
  'not-a-system':
    'the receiver is not a crafting system — a validation result, a chat view-model, a task, a ' +
    'memo guard tuple or a paged browser model',
});

/**
 * The delta's measurement of `origin/main` at `7304be93`, before this PR's first edit.
 *
 * Kept because it is what makes the live totals below legible: the sweep removed 82 of these 228
 * matched lines and 120 of the 282 matches, and 13 of the 32 files lost every site they had.
 */
const BASE_SCAN = Object.freeze({
  matches: 282,
  lines: 228,
  files: 32,
  pairs: 190,
  collisionGroups: 26,
  collisionSites: 64,
});

/** The live tree's measurement, asserted as an EXACT EQUALITY rather than as a floor. */
const SCAN_TOTALS = Object.freeze({
  matches: 162,
  lines: 146,
  files: 19,
  pairs: 118,
  collisionGroups: 17,
  collisionSites: 45,
});

/**
 * Every surviving raw read, keyed `(file, anchor, expected occurrence count)` with the reason it
 * is still here. A COMPOUND reason means one anchor covers sites with different reasons — the
 * exact case the count exists to make visible.
 */
const LEDGER = Object.freeze([
  ['src/systems/AlchemySignatureReport.js', "this.components = components;", 1, 'parameter'],
  ['src/systems/AlchemySignatureReport.js', "this.components,", 1, 'parameter'],
  ['src/systems/AlchemySignatureReport.js', "this._validator.describeConflict(first, second, this.components)", 1, 'parameter'],
  ['src/systems/BulkSalvageChatCard.js', "heading: loc(SALVAGE_CHAT_KEYS.tools),", 1, 'not-a-system'],
  ['src/systems/BulkSalvageChatCard.js', "entries: model.tools,", 1, 'not-a-system'],
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
  ['src/systems/CraftingChatCard.js', "renderSection({ heading: loc(keys.tools), entries: model.tools, modifier: 'tools' }),", 1, 'not-a-system'],
  ['src/systems/CraftingChatCard.js', "const forfeited = [...(model.consumed || []), ...(model.tools || [])];", 1, 'not-a-system'],
  ['src/systems/CraftingChatCard.js', "tools: model.tools,", 1, 'not-a-system'],
  ['src/systems/CraftingEngine.js', "toolItems: toolValidation.tools,", 4, 'not-a-system'],
  ['src/systems/CraftingEngine.js', "usedToolPairs = toolValidation.tools;", 1, 'not-a-system'],
  ['src/systems/CraftingEngine.js', "usedToolsOnFail = await this._applyToolBreakage(executionRecipe, toolValidation.tools, {", 1, 'not-a-system'],
  ['src/systems/CraftingEngine.js', "usedToolPairsOnValidationFail = toolValidation.tools;", 1, 'not-a-system'],
  ['src/systems/CraftingEngine.js', "toolValidation.tools,", 2, 'not-a-system'],
  ['src/systems/CraftingEngine.js', "const usedTools = await this._applyToolBreakage(executionRecipe, toolValidation.tools, {", 1, 'not-a-system'],
  ['src/systems/CraftingEngine.js', "tools: toolValidation.tools,", 3, 'not-a-system'],
  ['src/systems/CraftingEngine.js', "const toolItems = toolValidation.valid ? toolValidation.tools || [] : [];", 1, 'not-a-system'],
  ['src/systems/CraftingEngine.js', "usedTools = await this._applyToolBreakage(executionRecipe, toolValidation.tools, {", 1, 'not-a-system'],
  ['src/systems/CraftingEngine.js', "const components = Array.isArray(system?.components)", 1, 'guard'],
  ['src/systems/CraftingEngine.js', "for (const tool of missing.tools || []) {", 1, 'not-a-system'],
  ['src/systems/CraftingEngine.js', "usedTools = await this._applyToolBreakage(syntheticRecipe, toolValidation.tools, {", 1, 'not-a-system'],
  ['src/systems/CraftingEngine.js', "const usedTools = await this._applyToolBreakage(syntheticRecipe, toolValidation.tools, {", 1, 'not-a-system'],
  ['src/systems/CraftingSystemExporter.js', "if (Array.isArray(system.essenceDefinitions)) {", 1, 'export'],
  ['src/systems/CraftingSystemExporter.js', "for (const def of system.essenceDefinitions) {", 1, 'export'],
  ['src/systems/CraftingSystemManager.js', "system?.components ?? system?.managedItems ?? system?.items", 1, 'basis'],
  ['src/systems/CraftingSystemManager.js', "system?.essenceDefinitions ?? system?.essences", 1, 'basis'],
  ['src/systems/CraftingSystemManager.js', "toolIds: _scopeEntityBasis(_resolveStoreSeam(this._toolScopeStore), system?.tools),", 1, 'basis'],
  ['src/systems/CraftingSystemManager.js', "system.essenceDefinitions ?? system.essences", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "const rawManagedItems = Array.isArray(system.components)", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "? system.components", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "const normalizedTools = Array.isArray(system.tools)", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "? system.tools.map((t) =>", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "const managedItems = system.components || [];", 1, 'authoring-accessor'],
  ['src/systems/CraftingSystemManager.js', "system.tools = previousTools;", 3, 'writer'],
  ['src/systems/CraftingSystemManager.js', "const tools = Array.isArray(system.tools) ? system.tools : [];", 2, 'writer'],
  ['src/systems/CraftingSystemManager.js', ": [...tools, staged];", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "const previousTools = system.tools;", 2, 'writer'],
  ['src/systems/CraftingSystemManager.js', "system.tools = nextTools;", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "system.tools = tools.filter((entry) => String(entry?.id) !== String(toolId));", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "? updates.essenceDefinitions", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', ": current.essenceDefinitions,", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "const components = Array.isArray(system.components) ? system.components : [];", 3, 'pre-persist+writer'],
  ['src/systems/CraftingSystemManager.js', "const componentCount = Array.isArray(system.components)", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "? system.components.length", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "const essenceCount = Array.isArray(system.essenceDefinitions)", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "? system.essenceDefinitions.length", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "system.components.push(item);", 2, 'writer'],
  ['src/systems/CraftingSystemManager.js', "advanceDefinitionRevision(system.components);", 5, 'writer'],
  ['src/systems/CraftingSystemManager.js', "(system.components || []).find((item) => {", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "for (const component of system.components || []) {", 4, 'writer'],
  ['src/systems/CraftingSystemManager.js', "for (const tool of system.tools || []) {", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "definitions: system.components || [],", 1, 'restamp'],
  ['src/systems/CraftingSystemManager.js', "definitions: (system.tools || []).filter(", 1, 'restamp'],
  ['src/systems/CraftingSystemManager.js', "const idx = system.components.findIndex((i) => i.id === itemId);", 2, 'writer'],
  ['src/systems/CraftingSystemManager.js', "const existing = system.components[idx];", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "system.components[idx] = updatedItem;", 2, 'writer'],
  ['src/systems/CraftingSystemManager.js', "{ ...system.components[idx], ...updates, id: itemId },", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "if (!this._sameSourceReferenceSet(system.components[idx], updatedItem)) {", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "return system.components[idx];", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "for (let idx = 0; idx < system.components.length; idx += 1) {", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "const component = system.components[idx];", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "system.components[idx] = this._normalizeComponent(", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "if (changedIds.length > 0) advanceDefinitionRevision(system.components);", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "system.components = components.filter(", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "const essenceDefinitions = (system.essenceDefinitions || []).map((def) => ({", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "system.essenceDefinitions = essenceDefinitions;", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "const definitions = Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];", 3, 'writer'],
  ['src/systems/CraftingSystemManager.js', "system.essenceDefinitions = definitions.filter((def) => def.id !== essenceId);", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "system.essences = system.essenceDefinitions.map((def) => def.id);", 2, 'writer'],
  ['src/systems/CraftingSystemManager.js', "system.essenceDefinitions = definitions.filter(", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "const items = Array.isArray(system.components) ? system.components : [];", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "const rawItems = Array.isArray(inputSystem?.components)", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "? inputSystem.components", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "(Array.isArray(normalizedSystem?.components) ? normalizedSystem.components : []).map(", 1, 'writer'],
  ['src/systems/CraftingSystemManager.js', "systems.flatMap((system) => (system.components || []).map((component) => component.id))", 1, 'destructive-basis'],
  ['src/systems/GatheringChatCard.js', "succeeded && (!Array.isArray(model.components) || model.components.length === 0);", 1, 'not-a-system'],
  ['src/systems/GatheringChatCard.js', "? renderEmptyResults(loc(CHAT_KEYS.components), loc(CHAT_KEYS.nothing))", 1, 'not-a-system'],
  ['src/systems/GatheringChatCard.js', "heading: loc(CHAT_KEYS.components),", 1, 'not-a-system'],
  ['src/systems/GatheringChatCard.js', "entries: model.components,", 1, 'not-a-system'],
  ['src/systems/GatheringDropReferenceValidator.js', "if (Array.isArray(systemOrComponents?.components)) {", 1, 'guard'],
  ['src/systems/GatheringEngine.js', "if (taskTools.tools.length > 0) {", 1, 'not-a-system'],
  ['src/systems/GatheringEngine.js', "tools: taskTools.tools,", 2, 'not-a-system'],
  ['src/systems/GatheringEngine.js', "} else if (taskTools.tools.length > 0) {", 1, 'not-a-system'],
  ['src/systems/GatheringEngine.js', "tools.push(...normalizeList(task?.tools));", 1, 'not-a-system'],
  ['src/systems/GatheringEngine.js', "const tools = resolvedTools.tools;", 2, 'not-a-system'],
  ['src/systems/GatheringRichStateService.js', "const toolSource = Array.isArray(system?.tools)", 1, 'guard'],
  ['src/systems/GatheringRichStateService.js', "tools: normalizeList(config?.tools).map(normalizeLibraryTool).filter(Boolean),", 1, 'not-a-system'],
  ['src/systems/InventoryListingBuilder.js', "toolLookup.tools.length === 0", 1, 'not-a-system'],
  ['src/systems/InventoryListingBuilder.js', "for (const inlineTool of Array.isArray(task?.tools) ? task.tools : []) {", 1, 'not-a-system'],
  ['src/systems/RecipeManager.js', "previous.components === next.components &&", 1, 'not-a-system'],
  ['src/systems/SalvageChatCard.js', "tools: model.tools,", 1, 'not-a-system'],
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
  ['src/systems/startupPassComposition.js', "new Set((system.components || []).map((component) => component.id)),", 1, 'destructive-basis'],
  ['src/utils/componentBrowserModel.js', "? groupComponentsByCategory(paged.components, categoryTotals)", 1, 'not-a-system'],
  ['src/utils/componentBrowserModel.js', "page: paged.components,", 1, 'not-a-system'],
]);

/**
 * NAMED LIVE ANCHORS in four distinct files, the other half of the positive control.
 *
 * The delta named `src/main.js` and `src/canvas/InteractableManager.js` among its four, measured
 * against the PRE-sweep tree; both lost every site they had to this PR's own repoint, so they
 * cannot anchor a control on the tree that ships. `CraftingSystemManager.js` and
 * `CompendiumImporter.js` take their places, and the four still span four distinct classes of
 * surviving read: a writer surface, a false-positive receiver, an `Array.isArray` guard and the
 * import path.
 */
const POSITIVE_ANCHORS = Object.freeze([
  [
    'src/systems/CraftingSystemManager.js',
    'const components = Array.isArray(system.components) ? system.components : [];',
  ],
  ['src/systems/CraftingEngine.js', 'const components = Array.isArray(system?.components)'],
  ['src/systems/InventoryListingBuilder.js', 'toolLookup.tools.length === 0'],
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
    for (const line of stripComments(text).split('\n')) {
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

  // -----------------------------------------------------------------------------------------
  // THE POSITIVE CONTROL — measured, obligations 1 and 2 both stay GREEN against a matcher that
  // matches nothing, so neither of them can stand in for this.
  // -----------------------------------------------------------------------------------------

  it('finds EXACTLY the committed totals, so a matcher that matched nothing reds here', () => {
    const { totals } = scan();
    assert.deepEqual(totals, SCAN_TOTALS);
    assert.ok(
      BASE_SCAN.lines > SCAN_TOTALS.lines,
      'and the sweep really did remove raw reads: the pre-sweep tree carried more matched lines'
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

  // -----------------------------------------------------------------------------------------
  // OBLIGATION 1 — an unledgered site reds
  // -----------------------------------------------------------------------------------------

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

  // -----------------------------------------------------------------------------------------
  // OBLIGATION 2 — a stale anchor reds
  // -----------------------------------------------------------------------------------------

  it('carries no STALE anchor: every ledgered line still exists in its file', () => {
    const { rows } = scan();
    const stale = LEDGER.filter(([file, anchor]) => !rows.has(`${file}\u0000${anchor}`)).map(
      ([file, anchor]) => `${file} :: ${anchor}`
    );
    assert.deepEqual(stale, [], 'a ledger entry whose line is gone is an excuse for nothing');
  });

  // -----------------------------------------------------------------------------------------
  // The matcher itself, pinned — the meta-test the sibling gate added for the same reason
  // -----------------------------------------------------------------------------------------

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
