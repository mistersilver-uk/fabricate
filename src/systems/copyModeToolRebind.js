/**
 * Copy mode's one Tool re-key (issue 2554): an incoming Tool whose source references intersect
 * exactly one destination world Tool under another id takes that id, injectively in incoming
 * order, and every in-payload reference follows it key-aware; its incoming roster record is
 * dropped. A match against several world Tools keeps the id and is reported. Contract:
 * `import-export/spec.md` § Copy-mode identifier rebinding.
 */
import { isPlainObject } from '../utils/scalars.js';
import { sourceReferenceKey } from '../utils/sourceReferenceUnion.js';

import {
  REFERENCE_KINDS,
  reportEntry,
  systemSlice,
  WORLD_SCOPE_SLICE_KEYS,
} from './importReferenceResolver.js';
import { sourceReferencesOf, toolSourceReferences } from './worldScopeEntityGrouping.js';
import {
  keyedRemapper,
  rewriteGatheringSliceReferences,
  rewriteRecipeReferences,
  rewriteSystemReferences,
} from './worldScopeReferenceRewrite.js';

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function keySet(references) {
  return new Set(references.map(sourceReferenceKey));
}

/** The destination world Tools, each with its source keys. */
function destinationTools(worldEntityIndex) {
  // ratchet-exempt(world-scope): not-a-system — the destination roster index
  return arrayOf(worldEntityIndex?.tools)
    .filter((entity) => isPlainObject(entity) && typeof entity.id === 'string' && entity.id.trim())
    .map((entity) => ({ id: entity.id.trim(), keys: keySet(sourceReferencesOf(entity)) }));
}

/** Old incoming Tool id -> destination id, reporting each multi-match. */
function toolIdMap(tools, components, roster, report) {
  const idMap = {};
  const incomingIds = new Set(tools.map((tool) => tool?.id));
  const claimed = new Set();
  for (const tool of tools) {
    if (!isPlainObject(tool) || !tool.id) continue;
    const keys = keySet(toolSourceReferences(tool, components));
    const matches = roster.filter((entity) => [...keys].some((key) => entity.keys.has(key)));
    if (matches.length > 1 && Array.isArray(report)) {
      const ids = matches.map((match) => match.id).join(', ');
      report.push(reportEntry(REFERENCE_KINDS.WORLD_ENTITY_COLLISION, 'tool', tool, ids));
    }
    if (matches.length !== 1) continue;
    const target = matches[0].id;
    if (target === tool.id || claimed.has(target) || incomingIds.has(target)) continue;
    claimed.add(target);
    idMap[tool.id] = target;
  }
  return idMap;
}

/** The `toolScope` slice: matched roster records dropped, `defaults`/`membership` ids remapped. */
function rewriteToolScopeSlice(prepared, idMap, remapTool) {
  // ratchet-exempt(world-scope): not-a-system — a slice key
  const slice = prepared[WORLD_SCOPE_SLICE_KEYS.tools];
  if (!isPlainObject(slice)) return;
  if (Array.isArray(slice.entities)) {
    slice.entities = slice.entities.filter((entity) => !Object.hasOwn(idMap, entity?.id));
  }
  for (const record of arrayOf(slice.defaults)) {
    if (isPlainObject(record)) record.id = remapTool(record.id);
  }
  for (const record of arrayOf(slice.membership)) {
    if (isPlainObject(record)) record.entityId = remapTool(record.entityId);
  }
}

/** Rebind in place; `worldEntityIndex` is the destination roster and `report` collects entries. */
export function rebindCopyToolIds(prepared, { worldEntityIndex = null, report = null } = {}) {
  if (!isPlainObject(prepared)) return prepared;
  const { system, recipes, gatheringConfig } = prepared;
  const tools = arrayOf(system?.tools); // ratchet-exempt(world-scope): import
  const components = arrayOf(system?.components); // ratchet-exempt(world-scope): import
  const idMap = toolIdMap(tools, components, destinationTools(worldEntityIndex), report);
  if (Object.keys(idMap).length === 0) return prepared;
  const remapTool = keyedRemapper(idMap);
  for (const tool of tools) {
    if (isPlainObject(tool)) tool.id = remapTool(tool.id);
  }
  const remappers = { remapComponent: (value) => value, remapTool };
  for (const recipe of arrayOf(recipes)) rewriteRecipeReferences(recipe, remappers);
  rewriteSystemReferences(system, remappers);
  rewriteGatheringSliceReferences(systemSlice(gatheringConfig), remappers);
  rewriteToolScopeSlice(prepared, idMap, remapTool);
  return prepared;
}
