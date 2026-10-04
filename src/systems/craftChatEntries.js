/** The plain chat rows the crafting and salvage result cards are built from (issue 1773 extract). */
import {
  TOOL_IMAGE_SENTINEL,
  resolveToolDisplayImage,
  resolveToolDisplayName,
} from '../models/toolDisplay.js';
import { publicComplications } from '../utils/complicationPlan.js';
import { findById, getDefinitionIndex } from '../utils/definitionIndex.js';

import { rewardChatParts } from './resultKindAward.js';
import { resolvedComponentsFor, resolvedToolsFor } from './scopedEntityReads.js';

const componentsById = (system) =>
  new Map(resolvedComponentsFor(system).map((component) => [component?.id, component]));

/**
 * What a card states about an awarded array beyond its Item receipts: the live rolls the message
 * rides on (rolled amounts, then rolled credits), and the rows that are not Items — an empty award
 * (issue 1645), then each currency credit and knowledge grant (issue 1773).
 */
export function rolledAwardChatParts(awarded) {
  const awards = awarded?.rolledAwards ?? [];
  const rewards = rewardChatParts(awarded);
  return {
    rolls: [...awards.map((award) => award.roll).filter(Boolean), ...rewards.rolls],
    emptyAwards: [...awards.filter((award) => award.quantity === 0), ...rewards.rows],
  };
}

/**
 * The player-safe chat rows for fired complications (issue 1286). `publicComplications`
 * filters on the way in, so a `gmOnly` complication has no row on any client, a GM's included.
 * One row per firing, never collapsed, told apart by `position`.
 */
export function complicationChatEntries(fired, system) {
  const componentIndex = getDefinitionIndex(resolvedComponentsFor(system));
  return publicComplications(fired).map((entry) => ({
    name: entry.name,
    description: entry.description,
    severity: entry.severity,
    componentName: findById(componentIndex, entry.componentId)?.name || '',
    position: entry.position,
  }));
}

/** The requirement-13 image for a chat chip, with the generic item-bag sentinel mapped back to
 * empty so the caller's own last-resort fallback still applies. */
function toolChatImage(tool, component) {
  const img = resolveToolDisplayImage(tool, component);
  return img === TOOL_IMAGE_SENTINEL ? '' : img;
}

/** `[{ tool, item }]` matches as `{ name, img }` chat entries by the tool's authored name, since
 * one item can fill several slots; de-duped by component id, shared by crafting and salvage. */
export function toolChatEntries(tools, system) {
  const componentById = componentsById(system);
  const entries = [];
  const seen = new Set();
  for (const pair of tools || []) {
    // Skip virtual-present canvas tools (no owned item) — no chip to render.
    if (!pair?.item) continue;
    const componentId = pair.tool?.componentId || null;
    const component = componentId ? componentById.get(componentId) : null;
    const key = componentId || pair.item?.uuid || pair.item?.name || null;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    // `data-models` requirement 13: the authored label and the registration snapshot both
    // outrank the linked component, and the matched item is the last resort (issue 1119).
    entries.push({
      name: resolveToolDisplayName(pair.tool, component, '') || pair.item?.name || '',
      img: toolChatImage(pair.tool, component) || pair.item?.img || '',
    });
  }
  return entries;
}

/** Chat entries for the tools that broke in this salvage, de-duped by `componentId`. */
export function brokenToolChatEntries(usedTools, system) {
  const componentById = componentsById(system);
  // The evidence carries `toolId` (issue 1119) so an item-sourced Tool, with no component,
  // still resolves.
  const toolById = new Map(resolvedToolsFor(system).map((tool) => [tool?.id, tool]));
  const entries = [];
  const seen = new Set();
  for (const record of usedTools || []) {
    if (record?.broken !== true) continue;
    const componentId = record.componentId || null;
    const component = componentId ? componentById.get(componentId) : null;
    const tool = record.toolId ? (toolById.get(record.toolId) ?? null) : null;
    const key = record.toolId || componentId || record.itemUuid || null;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    entries.push({
      name: resolveToolDisplayName(tool, component, ''),
      img: toolChatImage(tool, component),
    });
  }
  return entries;
}
