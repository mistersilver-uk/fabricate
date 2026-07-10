/**
 * Shared fixtures for the durable per-system component-identity resolver
 * (`resolveComponentForItem`) and its callers. Centralised so the repeated
 * component-object literal `{ id, sourceUuid, sourceItemUuid, fallbackItemIds }`
 * and the two-system set exist in exactly ONE place (SonarCloud counts `tests/**`
 * duplication like `src/`, and its Automatic Analysis ignores cpd.exclusions).
 */

/**
 * Build a component-like object. `refs` supplies any of `sourceUuid`,
 * `sourceItemUuid`, `fallbackItemIds`, `essences`, `name` — all optional, so a
 * fixture can DECOUPLE a component's raw source refs from an item's identity to
 * force the identity tier (or the raw-ref fall-through) under test.
 *
 * @param {string} id
 * @param {{sourceUuid?:string, sourceItemUuid?:string, fallbackItemIds?:string[], essences?:object, name?:string}} [refs]
 * @returns {object}
 */
export function component(id, refs = {}) {
  const {
    sourceUuid = null,
    sourceItemUuid = null,
    fallbackItemIds = [],
    essences,
    name,
  } = refs;
  const built = { id, sourceUuid, sourceItemUuid, fallbackItemIds };
  if (essences !== undefined) built.essences = essences;
  if (name !== undefined) built.name = name;
  return built;
}

/**
 * A crafting-system-like candidate set: `{ id, components }`. Two of these compose
 * the two-system scenarios (id-collision, cross-system self-recognition).
 *
 * @param {string} id
 * @param {object[]} components
 * @returns {{id:string, components:object[]}}
 */
export function componentSet(id, components) {
  return { id, components };
}

/**
 * A `document.getFlag`-compatible reader over an explicit value bag, matching how
 * `getFabricateFlag(item, key)` calls `getFlag('fabricate', 'fabricate.<key>')`.
 * A value of `undefined` means "flag absent".
 *
 * @param {{roles?:object, componentId?:string, recipeItemDefinitionId?:string, essences?:object}} values
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
 * Build an owned-item-like object carrying any mix of durable identity and raw
 * source references. Every field is optional so a fixture can present ONLY a
 * `roles` map (decoupled refs), ONLY a legacy scalar, or neither.
 *
 * @param {object} [spec]
 * @param {string} [spec.uuid]
 * @param {string} [spec.compendiumSource]
 * @param {string} [spec.duplicateSource]
 * @param {object} [spec.roles] - `flags.fabricate.roles` map.
 * @param {string} [spec.componentId] - legacy scalar `flags.fabricate.componentId`.
 * @param {object} [spec.essences] - `flags.fabricate.essences`.
 * @param {number} [spec.quantity] - `system.quantity`.
 * @param {string} [spec.name]
 * @returns {object}
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
