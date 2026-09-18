/** Shared fixtures for the one-card-per-unified-physical-stack collapse (issue 766). */

import { roleItem } from './componentIdentityFixtures.js';

export const SYS_A = 'system-a';
export const SYS_B = 'system-b';

/**
 * A salvage-enabled component definition (simple mode, one success group yielding itself) for the
 * collapse fixtures.
 */
export function salvageComponent(id, name, overrides = {}) {
  return {
    id,
    name,
    img: `icons/${id}.webp`,
    tags: [],
    essences: {},
    salvage: {
      enabled: true,
      resultGroups: [
        { id: `${id}-g`, role: 'success', results: [{ id: `${id}-r`, componentId: id, quantity: 1 }] },
      ],
    },
    ...overrides,
  };
}

/**
 * A crafting-system definition with the salvage feature on and simple (no-formula) resolution,
 * holding the given components.
 */
export function salvageSystem(id, components, overrides = {}) {
  return {
    id,
    name: id,
    enableEssences: false,
    features: { salvage: true },
    salvageResolutionMode: 'simple',
    salvageCraftingCheck: { simple: { rollFormula: '' } },
    components,
    tools: [],
    ...overrides,
  };
}

/**
 * One physical owned document flagged into components across up to two systems via the durable
 * `roles` map. Passing only `componentA` yields a single-system document.
 *
 * @param {string} spec.componentA - System A component id.
 * @param {string} [spec.componentB] - System B component id (omit for single-system).
 */
export function rolesDocument({ uuid, quantity, componentA, componentB, name }) {
  const roles = { [SYS_A]: { componentId: componentA } };
  if (componentB !== undefined) roles[SYS_B] = { componentId: componentB };
  return roleItem({ uuid, quantity, name, roles });
}

/**
 * A projected multi-system inventory card row (as `InventoryListingBuilder` emits) for the
 * store/view suites, which construct rows directly rather than through the builder.
 */
export function multiSystemCardRow({ total = 2, actorId = 'a1' } = {}) {
  const participation = (systemId, componentId, name, essence, ownedQuantity) => ({
    systemId,
    systemName: systemId,
    componentId,
    name,
    img: `icons/${componentId}.webp`,
    description: `${name} description`,
    tags: [],
    tier: null,
    isTool: false,
    salvage: {
      enabled: true,
      mode: 'simple',
      checkUsable: false,
      misconfigured: false,
      results: [],
      toolStates: [],
      toolsAvailable: true,
      targetActorId: actorId,
    },
    ownedQuantity,
    essences: [essence],
    usedBy: [],
    requiredFor: [],
    producedBy: [],
  });
  // Each participation carries a DIFFERENT essence so scoping the detail to one is
  // observable; the card's own essence list is the deduped UNION for the card pips.
  const fire = { id: 'fire', name: 'Fire', icon: 'fas fa-fire', quantity: 1 };
  const water = { id: 'water', name: 'Water', icon: 'fas fa-droplet', quantity: 1 };
  const systemA = participation(SYS_A, 'cA', 'Air Shard', fire, total);
  const systemB = participation(SYS_B, 'cB', 'Crystallized Air', water, total);
  return {
    key: `${SYS_A}:cA`,
    componentId: 'cA',
    systemId: SYS_A,
    systemName: SYS_A,
    name: 'Air Shard',
    img: 'icons/cA.webp',
    icon: null,
    description: 'Air Shard description',
    tags: [],
    tier: null,
    isEssenceSource: false,
    isTool: false,
    broken: false,
    salvage: systemA.salvage,
    totalQuantity: total,
    sources: [{ actorId, actorName: 'Akra', actorImg: null, quantity: total }],
    essences: [fire, water],
    usedBy: [],
    requiredFor: [],
    producedBy: [],
    contributors: [],
    systems: [systemA, systemB],
  };
}

/**
 * A projected multi-system card whose two participations SHARE one component id (`shared`) across
 * two systems — the pre-existing latent order-key collision the collapse surfaces (component ids
 * are not globally unique).
 */
export function multiSystemProgressiveCardRow({ actorId = 'a1' } = {}) {
  const stages = () => [
    { id: 's1', componentId: 'r1', name: 'Shard', difficulty: 5, threshold: 5 },
    { id: 's2', componentId: 'r2', name: 'Slag', difficulty: 3, threshold: 8 },
  ];
  const participation = (systemId) => ({
    systemId,
    systemName: systemId,
    componentId: 'shared',
    name: 'Collision Stone',
    img: 'icons/shared.webp',
    description: `${systemId} view`,
    tags: [],
    tier: null,
    isTool: false,
    salvage: {
      enabled: true,
      mode: 'progressive',
      checkUsable: true,
      misconfigured: false,
      allowPlayerResultReorder: true,
      awardMode: 'equal',
      results: [],
      routedOutcomes: [],
      stages: stages(),
      toolStates: [],
      toolsAvailable: true,
      targetActorId: actorId,
    },
    ownedQuantity: 1,
    essences: [],
    usedBy: [],
    requiredFor: [],
    producedBy: [],
  });
  const systemA = participation(SYS_A);
  const systemB = participation(SYS_B);
  return {
    key: `${SYS_A}:shared`,
    componentId: 'shared',
    systemId: SYS_A,
    systemName: SYS_A,
    name: 'Collision Stone',
    img: 'icons/shared.webp',
    icon: null,
    description: `${SYS_A} view`,
    tags: [],
    tier: null,
    isEssenceSource: false,
    isTool: false,
    broken: false,
    salvage: systemA.salvage,
    totalQuantity: 1,
    sources: [{ actorId, actorName: 'Akra', actorImg: null, quantity: 1 }],
    essences: [],
    usedBy: [],
    requiredFor: [],
    producedBy: [],
    contributors: [],
    systems: [systemA, systemB],
  };
}
