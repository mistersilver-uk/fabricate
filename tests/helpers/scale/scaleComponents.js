/** The synthetic component library every scale profile resolves against (issue 1071). */
import { component } from '../componentIdentityFixtures.js';

import { intBetween, pickDistinct } from './scaleRandom.js';

/** A small, fixed essence vocabulary. Fixed rather than generated so profiles stay comparable. */
export const SCALE_ESSENCES = Object.freeze([
  'fire',
  'water',
  'earth',
  'air',
  'radiant',
  'shadow',
]);

/** A small, fixed tag vocabulary for the tag-heavy profile. */
export const SCALE_TAGS = Object.freeze(['metal', 'herb', 'gem', 'bone', 'cloth', 'reagent']);

/** Fixed category names, so the browser-model grouping benchmarks have real buckets. */
export const SCALE_CATEGORIES = Object.freeze(['ore', 'flora', 'fauna', 'arcana', 'salvage']);

/** The compendium-style source uuid a component is registered from. */
export function componentSourceUuid(systemId, index) {
  return `Compendium.fabricate-bench.components.Item.${systemId}-src-${index}`;
}

/**
 * Build a component library of exactly `count` components.
 *
 * @param {() => number} options.random Seeded generator.
 */
export function buildComponentLibrary({ count, random, systemId }) {
  const components = [];
  for (let index = 0; index < count; index++) {
    const essenceCount = intBetween(random, 0, 2);
    const essences = {};
    for (const type of pickDistinct(random, SCALE_ESSENCES, essenceCount)) {
      essences[type] = intBetween(random, 1, 3);
    }
    const base = component(`${systemId}-c-${index}`, {
      registeredItemUuid: componentSourceUuid(systemId, index),
      name: `Bench Component ${index}`,
      essences,
    });
    components.push({
      ...base,
      img: 'icons/commodities/metal/ingot-stack-steel.webp',
      category: SCALE_CATEGORIES[index % SCALE_CATEGORIES.length],
      tags: pickDistinct(random, SCALE_TAGS, intBetween(random, 0, 2)),
      salvage: {
        enabled: index % 4 === 0,
        ingredientQuantity: 1,
        resultGroups:
          index % 4 === 0
            ? [
                {
                  id: `${systemId}-c-${index}-sg`,
                  name: 'Salvage',
                  checkOutcomeIds: [],
                  results: [
                    {
                      componentId: `${systemId}-c-${(index + 1) % count}`,
                      quantity: 1,
                    },
                  ],
                },
              ]
            : [],
      },
    });
  }
  return components;
}

/**
 * Build the first-class Tool library the tool-heavy profile needs.
 *
 * @param {object[]} options.components Tools are linked to a component source.
 */
export function buildToolLibrary({ count, systemId, components }) {
  const tools = [];
  for (let index = 0; index < count; index++) {
    const linked = components[index % components.length];
    tools.push({
      id: `${systemId}-t-${index}`,
      name: `Bench Tool ${index}`,
      img: 'icons/tools/smithing/hammer-sledge-steel-grey.webp',
      componentId: linked.id,
      registeredItemUuid: linked.registeredItemUuid,
      originItemUuid: null,
      aliasItemUuids: [],
    });
  }
  return tools;
}
