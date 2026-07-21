/**
 * Shared fixtures for the one-card-per-unified-physical-stack collapse (issue 766).
 * Centralised so the multi-system crafting-system definitions, the roles-flagged
 * physical documents, and the projected multi-system card row exist in exactly ONE
 * place — SonarCloud counts `tests/**` duplication like `src/`, and its Automatic
 * Analysis ignores `sonar.cpd.exclusions`, so copy-pasted fixture setup fails the gate.
 */

import { roleItem } from './componentIdentityFixtures.js';

export const SYS_A = 'system-a';
export const SYS_B = 'system-b';

/**
 * A salvage-enabled component definition (simple mode, one success group yielding
 * itself) for the collapse fixtures.
 *
 * @param {string} id
 * @param {string} name
 * @param {object} [overrides]
 * @returns {object}
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
 * A crafting-system definition with the salvage feature on and simple (no-formula)
 * resolution, holding the given components.
 *
 * @param {string} id
 * @param {object[]} components
 * @param {object} [overrides]
 * @returns {object}
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
 * One physical owned document flagged into components across up to two systems via the
 * durable `roles` map. Passing only `componentA` yields a single-system document.
 *
 * @param {object} spec
 * @param {string} spec.uuid
 * @param {number} spec.quantity
 * @param {string} spec.componentA - System A component id.
 * @param {string} [spec.componentB] - System B component id (omit for single-system).
 * @param {string} [spec.name]
 * @returns {object}
 */
export function rolesDocument({ uuid, quantity, componentA, componentB, name }) {
  const roles = { [SYS_A]: { componentId: componentA } };
  if (componentB !== undefined) roles[SYS_B] = { componentId: componentB };
  return roleItem({ uuid, quantity, name, roles });
}

/**
 * A projected multi-system inventory card row (as `InventoryListingBuilder` emits) for
 * the store/view suites, which construct rows directly rather than through the builder.
 * Two participations (System A / System B) over one physical stack of `total`, each
 * salvageable and scoped to its own `targetActorId`.
 *
 * @param {object} [opts]
 * @param {number} [opts.total]
 * @param {string} [opts.actorId]
 * @returns {object}
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
