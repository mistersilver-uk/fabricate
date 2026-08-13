/**
 * The synthetic component library every scale profile resolves against (issue 1071).
 *
 * The library is the RIGHT-HAND factor of the two products the performance programme is
 * chasing — `items × components` for identity resolution and `CraftingEngine.findComponentItems`,
 * and `recipes × items` for `evaluateCraftability`'s per-call inventory re-flattening. Because
 * they are products, a library that is small measures nothing: an inventory axis run against
 * ten components would report a flat line and certify a defect as fixed.
 *
 * Components are built as duck-typed literals rather than through a model constructor. There
 * is no `Component` model class to hydrate — `CraftingSystemManager._normalizeSystem` is the
 * only thing that ever normalises one, and it is measured separately by its own profile — so a
 * literal here is both faster and closer to what the read paths actually receive out of the
 * `craftingSystems` world setting.
 *
 * The base `{ id, registeredItemUuid, originItemUuid, aliasItemUuids }` shape comes from the
 * existing `componentIdentityFixtures.component` helper rather than being restated. SonarCloud
 * counts `tests/**` duplication exactly like `src/`, and a second component-literal factory is
 * precisely the copy it flags.
 */
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

/**
 * The compendium-style source uuid a component is registered from. Shared by the library and
 * by the inventory generator, so an owned stack that IS a component and the component itself
 * agree on the reference without either restating the format.
 *
 * @param {string} systemId
 * @param {number} index
 * @returns {string}
 */
export function componentSourceUuid(systemId, index) {
  return `Compendium.fabricate-bench.components.Item.${systemId}-src-${index}`;
}

/**
 * Build a component library of exactly `count` components.
 *
 * Every component carries a registered source uuid, a display name, a category, tags, an
 * essence map and a salvage definition, because the read paths under measurement touch all
 * of them: the inventory listing reads essences and salvage, the browser models group by
 * category and filter by tag, and identity resolution reads the source refs.
 *
 * @param {object} options
 * @param {number} options.count
 * @param {() => number} options.random Seeded generator.
 * @param {string} options.systemId
 * @returns {object[]}
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
 * Tools are a separate candidate set with the same source-ref shape, and
 * `resolveToolStates` walks it per ingredient set — so a profile that claims to be
 * tool-heavy and ships an empty tool library measures nothing.
 *
 * @param {object} options
 * @param {number} options.count
 * @param {string} options.systemId
 * @param {object[]} options.components Tools are linked to a component source.
 * @returns {object[]}
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
