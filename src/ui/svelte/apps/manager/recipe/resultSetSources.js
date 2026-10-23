/**
 * A routed result set's source rows, read off `buildRoutingModel`'s result: the chips its card
 * names and the candidates its Assign panel offers. Words are the caller's; nothing here localizes.
 */

const asArray = (value) => (Array.isArray(value) ? value : []);

/**
 * The group at `index`'s chips: its effective sources from `model.inbound`, then under `check` each
 * tier it lists that does not reach it, named from `tierNames` (a Map of id to name) or `null`.
 */
export function inboundChips({ model, index, group, provider, tierNames = new Map() }) {
  const effective = asArray(model?.inbound?.[index]).map((source) => ({
    id: source.id,
    name: source.name,
    how: source.how,
    explicit: source.how === 'explicit',
    nonRouting: false,
  }));
  if (provider !== 'check') return effective;
  const reaching = new Set(effective.map((chip) => chip.id));
  const stale = [...new Set(asArray(group?.checkOutcomeIds))].filter((id) => !reaching.has(id));
  return [
    ...effective,
    ...stale.map((id) => ({
      id,
      name: tierNames.get(id) ?? null,
      how: null,
      explicit: false,
      nonRouting: true,
    })),
  ];
}

/**
 * Every source with an id, and `routedTo`: `groupName(group, i)` of its first effective target
 * other than `index`, or `null` when it reaches nothing else.
 */
export function assignCandidates({ model, index, groups, groupName }) {
  return asArray(model?.sources)
    .filter((source) => source.id)
    .map((source) => {
      const elsewhere = source.targets.find((target) => target !== index);
      return {
        id: source.id,
        name: source.name,
        routedTo: elsewhere === undefined ? null : groupName(asArray(groups)[elsewhere], elsewhere),
      };
    });
}
