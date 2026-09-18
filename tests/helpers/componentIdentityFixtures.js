/**
 * Shared fixtures for the durable per-system component-identity resolver
 * (`resolveComponentForItem`) and its callers.
 */

/** Build a component-like object. */
export function component(id, refs = {}) {
  const {
    registeredItemUuid = null,
    originItemUuid = null,
    aliasItemUuids = [],
    essences,
    name,
  } = refs;
  const built = { id, registeredItemUuid, originItemUuid, aliasItemUuids };
  if (essences !== undefined) built.essences = essences;
  if (name !== undefined) built.name = name;
  return built;
}

/**
 * A crafting-system-like candidate set: `{ id, components }`. Two of these compose the two-system
 * scenarios (id-collision, cross-system self-recognition).
 */
export function componentSet(id, components) {
  return { id, components };
}

/** Build a first-class-Tool-like object (issue 561). */
export function tool(id, refs = {}) {
  const { registeredItemUuid = null, originItemUuid = null, aliasItemUuids = [], componentId, name } = refs;
  const built = { id, registeredItemUuid, originItemUuid, aliasItemUuids };
  if (componentId !== undefined) built.componentId = componentId;
  if (name !== undefined) built.name = name;
  return built;
}

/**
 * A crafting-system-like Tools candidate set: `{ id, tools }`. The Tool-kind analogue of {@link
 * componentSet}.
 */
export function toolSet(id, tools) {
  return { id, tools };
}

/**
 * A `document.getFlag`-compatible reader over an explicit value bag, matching how
 * `getFabricateFlag(item, key)` calls `getFlag('fabricate', 'fabricate.<key>')`.
 */
function makeGetFlag(values) {
  return (scope, key) => {
    if (scope !== 'fabricate') return undefined;
    switch (key) {
      case 'fabricate.roles':
        return values.roles;
      case 'fabricate.componentId':
        return values.componentId;
      case 'fabricate.recipeItemDefinitionId':
        return values.recipeItemDefinitionId;
      case 'fabricate.essences':
        return values.essences;
      default:
        return undefined;
    }
  };
}

/**
 * Build an owned-item-like object carrying any mix of durable identity and raw source references.
 *
 * @param {object} [spec.roles] - `flags.fabricate.roles` map.
 * @param {string} [spec.componentId] - legacy scalar `flags.fabricate.componentId`.
 * @param {object} [spec.essences] - `flags.fabricate.essences`.
 * @param {number} [spec.quantity] - `system.quantity`.
 */
export function roleItem({
  uuid,
  compendiumSource,
  duplicateSource,
  roles,
  componentId,
  essences,
  quantity,
  name,
} = {}) {
  const stats = {};
  if (compendiumSource !== undefined) stats.compendiumSource = compendiumSource;
  if (duplicateSource !== undefined) stats.duplicateSource = duplicateSource;
  const item = {
    uuid,
    _stats: stats,
    flags: { fabricate: { roles, componentId, essences } },
    getFlag: makeGetFlag({ roles, componentId, essences }),
  };
  if (quantity !== undefined) item.system = { quantity };
  if (name !== undefined) item.name = name;
  return item;
}
