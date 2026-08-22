/**
 * ONE identity table for "is this owned item a Tool, and which Tool is it", shared by
 * every surface that answers that question (issue 1119).
 *
 * The sibling of `toolDisplayPrecedenceCases.js`, which pins the DISPLAY half
 * (`data-models` requirement 13). This file pins the IDENTITY half (requirement 12), and
 * the two are genuinely different questions — issue 976 fixed display across three
 * surfaces while the identity miss survived untouched in a fourth.
 *
 * Since issue 561 a Tool registered from an Item uuid carries `componentId: null` and
 * holds its identity in its own source references plus the durable
 * `flags.fabricate.roles[systemId].toolId`. `CraftingSystemManager.upsertTool` force-nulls
 * `componentId` for any item source and the Tool Studio offers no other authoring path,
 * so an item-sourced Tool is the ONLY shape a GM can author today. Any surface that
 * resolves a tool through its linked component therefore sees nothing at all.
 *
 * The canonical world below is deliberately shaped so no case passes by accident:
 *
 *   - `PICK`      item-sourced (componentId null), matched by durable `roles[sys].toolId`
 *   - `AXE`       item-sourced, matched by RAW SOURCE REF only (never stamped)
 *   - `WHETSTONE` a component AND a tool — the one document that must never double-count
 *   - `IRON`      a plain component that is NOT a tool — the negative control, so a
 *                 surface that simply returns everything cannot pass
 */

import { roleItem, tool, toolSet } from './componentIdentityFixtures.js';

export const SYSTEM_ID = 'sys-forge';

const PICK_UUID = 'Item.pick-source';
const AXE_UUID = 'Item.axe-source';
const WHETSTONE_UUID = 'Item.whetstone-source';
const IRON_UUID = 'Item.iron-source';

/** The system's managed components. `WHETSTONE` is deliberately BOTH. */
export const COMPONENTS = Object.freeze([
  Object.freeze({
    id: 'cmp-whetstone',
    name: 'Whetstone',
    img: 'icons/tools/whetstone.webp',
    registeredItemUuid: WHETSTONE_UUID,
    originItemUuid: WHETSTONE_UUID,
    aliasItemUuids: [],
    essences: {},
  }),
  Object.freeze({
    id: 'cmp-iron',
    name: 'Iron Ingot',
    img: 'icons/metal/iron.webp',
    registeredItemUuid: IRON_UUID,
    originItemUuid: IRON_UUID,
    aliasItemUuids: [],
    essences: {},
  }),
]);

/** The system's first-class Tools library. */
export const TOOLS = Object.freeze([
  Object.freeze({
    ...tool('tool-pick', { registeredItemUuid: PICK_UUID, originItemUuid: PICK_UUID }),
    componentId: null,
    name: "Miner's Pick",
    img: 'icons/tools/pick.webp',
  }),
  Object.freeze({
    ...tool('tool-axe', { registeredItemUuid: AXE_UUID, originItemUuid: AXE_UUID }),
    componentId: null,
    name: "Woodcutter's Axe",
    img: 'icons/tools/axe.webp',
  }),
  Object.freeze({
    ...tool('tool-whetstone', {
      registeredItemUuid: WHETSTONE_UUID,
      originItemUuid: WHETSTONE_UUID,
      componentId: 'cmp-whetstone',
    }),
    name: 'Whetstone',
    img: 'icons/tools/whetstone.webp',
  }),
]);

/** The Tools candidate set in the shape `resolveToolForItem` expects. */
export const TOOL_SET = toolSet(SYSTEM_ID, [...TOOLS]);

/**
 * The owned documents. Each states exactly ONE identity route so a surface that supports
 * only some of them fails on the specific case it drops rather than on all of them.
 */
export const OWNED = Object.freeze({
  // Durable tier: the stamped roles map, with NO raw ref back to the tool.
  pick: roleItem({
    uuid: 'Item.owned-pick',
    name: "Miner's Pick",
    roles: { [SYSTEM_ID]: { toolId: 'tool-pick' } },
  }),
  // Raw-ref tier: never stamped, recognised only by its own compendium source.
  axe: roleItem({
    uuid: 'Item.owned-axe',
    name: "Woodcutter's Axe",
    compendiumSource: AXE_UUID,
  }),
  // Both roles in ONE roles object — the whetstone coexistence guarantee (issue 561).
  whetstone: roleItem({
    uuid: 'Item.owned-whetstone',
    name: 'Whetstone',
    roles: { [SYSTEM_ID]: { componentId: 'cmp-whetstone', toolId: 'tool-whetstone' } },
  }),
  // The negative control: a real component, and NOT a tool by any route.
  iron: roleItem({
    uuid: 'Item.owned-iron',
    name: 'Iron Ingot',
    roles: { [SYSTEM_ID]: { componentId: 'cmp-iron' } },
  }),
});

/**
 * @typedef {object} ToolSurfaceCase
 * @property {string} id
 * @property {string} summary
 * @property {object} item          the owned document
 * @property {string|null} toolId   the library Tool it must resolve to, or null
 */

/** @type {ReadonlyArray<ToolSurfaceCase>} */
export const TOOL_SURFACE_CASES = Object.freeze([
  Object.freeze({
    id: 'durable-item-sourced',
    summary:
      'the issue-1119 defect: an item-sourced Tool carries componentId null, so a ' +
      'component-only surface resolves NOTHING for a fully-identified owned tool',
    item: OWNED.pick,
    toolId: 'tool-pick',
  }),
  Object.freeze({
    id: 'raw-ref-item-sourced',
    summary:
      'an un-stamped item-sourced Tool still resolves by its own source references, so a ' +
      'surface that supports only the durable tier fails here',
    item: OWNED.axe,
    toolId: 'tool-axe',
  }),
  Object.freeze({
    id: 'whetstone-is-both',
    summary:
      'a document that is BOTH a managed component and a registered Tool resolves to the ' +
      'tool without ceasing to be the component — it must never be counted twice',
    item: OWNED.whetstone,
    toolId: 'tool-whetstone',
  }),
  Object.freeze({
    id: 'component-is-not-a-tool',
    summary:
      'the negative control: a plain component resolves to NO tool, so a surface that ' +
      'returns everything it owns cannot pass this table vacuously',
    item: OWNED.iron,
    toolId: null,
  }),
]);

/** Every tool id the table expects to be recognised, in table order. */
export const EXPECTED_TOOL_IDS = Object.freeze(
  TOOL_SURFACE_CASES.map((entry) => entry.toolId).filter(Boolean)
);

/**
 * A crafting-system record shaped the way the runtime managers read it.
 * @param {object} [overrides]
 */
export function surfaceSystem(overrides = {}) {
  return {
    id: SYSTEM_ID,
    name: 'Forge',
    enableEssences: false,
    essenceDefinitions: [],
    components: [...COMPONENTS],
    managedItems: [...COMPONENTS],
    tools: [...TOOLS],
    ...overrides,
  };
}

/** An actor-like source holding every owned document in the table. */
export function surfaceActor(id = 'a1', name = 'Akra') {
  return {
    id,
    uuid: `Actor.${id}`,
    name,
    img: `icons/${id}.webp`,
    items: [OWNED.pick, OWNED.axe, OWNED.whetstone, OWNED.iron],
  };
}
