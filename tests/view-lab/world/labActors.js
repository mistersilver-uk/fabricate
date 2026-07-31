/**
 * Duck-typed actors, items, and the uuid document index.
 *
 * Fabricate's craftability evaluation is deliberately structural: `RecipeManager` iterates
 * `actor.items` and `Ingredient.matches(item)` compares `item.uuid` against the component's
 * `originItemUuid`. So an "actor" here needs an id, a name, an image, and an iterable `items`
 * collection — nothing resembling a real Foundry Actor document.
 *
 * The inventories are chosen, not random. Three outcomes have to be reachable on the Crafting tab
 * or the frame shows one state and implies the others do not exist:
 *   - fully satisfied (the recipe is craftable now),
 *   - partially satisfied (some ingredients held, some missing),
 *   - unsatisfiable (nothing held).
 */

const PORTRAIT_BASE = '/@foundry-chrome/icons';

/**
 * One owned item. `system.quantity` is where dnd5e keeps stack size, which is what Fabricate reads.
 *
 * @param {string} componentId Component this stack is an instance of.
 * @param {object} component The component definition, for name and image.
 * @param {number} quantity Stack size.
 * @param {number} index Disambiguator for the item id.
 * @returns {object} A duck-typed item.
 */
function ownedItem(componentId, component, quantity, index) {
  return {
    // The uuid is what `Ingredient.matches` compares against `originItemUuid`.
    uuid: `Item.${componentId}`,
    id: `item-${componentId}-${index}`,
    name: component?.name ?? componentId,
    img: component?.img ?? null,
    type: 'loot',
    system: { quantity, description: { value: '' } },
    flags: {},
    getFlag: () => null,
    isOwner: true,
  };
}

/**
 * Owned stacks per actor, keyed by component id.
 *
 * Read this as three inventories with intent:
 * - Brenna is the smith: she can complete the sword and shield lines, and is one silver ore short
 *   of refining silver, so a `missingMaterials` row is guaranteed on screen.
 * - Idrin is the herbalist: full potion line, plus the reagents the alchemy workbench needs.
 * - Vosk is the mule: bulk raw materials and nothing finished, which is what makes the
 *   multi-source component picker meaningful rather than decorative.
 */
const INVENTORIES = {
  'lab-actor-brenna': {
    'sm-iron-ore': 12,
    'sm-copper-ore': 6,
    'sm-iron-ingot': 5,
    'sm-steel-ingot': 4,
    'sm-coal': 9,
    'sm-leather': 3,
    'sm-oak-haft': 4,
    'sm-whetstone': 2,
    'sm-ruby': 1,
    'sm-longsword': 1,
    'sm-tool-hammer': 1,
    'sm-tool-anvil': 1,
    'sm-tool-tongs': 1,
    'hb-healing-potion': 2,
    // Routed stock, deliberately ASYMMETRIC. Brenna holds the silver billet but not the gold one,
    // so `jw-r-cast` renders with one route satisfied and one short — which is the whole point of
    // a routedByIngredients frame. The wire is one under the three a circlet needs, for the same
    // reason: a routed recipe where every route is green shows none of the routing.
    'jw-ingot-silver': 2,
    'jw-wire': 2,
    'rw-bar': 2,
    'rw-chalk': 4,
  },
  'lab-actor-idrin': {
    'hb-moonleaf': 8,
    'hb-sunroot': 5,
    'hb-bitterbark': 6,
    'hb-frostcap': 3,
    'hb-emberbloom': 2,
    'hb-spring-water': 7,
    'hb-empty-vial': 10,
    'hb-mortar-dust': 4,
    'hb-healing-potion': 3,
    'hb-salve': 2,
    'hb-tool-mortar': 1,
    'hb-tool-alembic': 1,
    'al-sulphur': 4,
    'al-saltpetre': 3,
    'al-quicksilver': 2,
    'al-flask': 5,
  },
  'lab-actor-vosk': {
    'sm-iron-ore': 20,
    'sm-coal': 15,
    'sm-oak-haft': 8,
    'sm-leather': 6,
    'hb-moonleaf': 4,
    'hb-spring-water': 5,
    'al-sulphur': 2,
    // The gold billet lives on the mule, not the crafter — so the routed recipe's second route is
    // reachable only through the multi-source picker.
    'jw-ingot-gold': 3,
    'rw-bar': 6,
  },
};

const ACTOR_DEFINITIONS = [
  {
    id: 'lab-actor-brenna',
    name: 'Brenna Karrunsdottir',
    img: `${PORTRAIT_BASE}/skills/trades/smithing-anvil-silver-red.webp`,
  },
  {
    id: 'lab-actor-idrin',
    name: 'Idrin Ashfall',
    img: `${PORTRAIT_BASE}/tools/laboratory/alembic-glass-ball-blue.webp`,
  },
  {
    id: 'lab-actor-vosk',
    name: 'Vosk',
    img: `${PORTRAIT_BASE}/commodities/leather/fur-brown-gold.webp`,
  },
];

/**
 * Build the lab's actors with their inventories.
 *
 * @param {object} content Output of `buildLabContent()`.
 * @returns {object[]} Duck-typed actors.
 */
export function buildLabActors(content) {
  const componentsById = new Map(content.components.map((component) => [component.id, component]));
  for (const tool of content.tools) componentsById.set(tool.id, tool);

  return ACTOR_DEFINITIONS.map((definition) => {
    const stacks = INVENTORIES[definition.id] ?? {};
    const items = Object.entries(stacks).map(([componentId, quantity], index) =>
      ownedItem(componentId, componentsById.get(componentId), quantity, index)
    );
    return {
      ...definition,
      uuid: `Actor.${definition.id}`,
      type: 'character',
      // Iterated with `[...actor.items]` throughout the engine, so a plain array is enough.
      items,
      system: {
        currency: { gp: 45, sp: 12, cp: 30 },
        abilities: { int: { mod: 3 }, str: { mod: 2 } },
      },
      flags: {},
      getFlag: () => null,
      setFlag: () => Promise.resolve(),
      isOwner: true,
      testUserPermission: () => true,
      /**
       * The smoke's seed stocks the crafter through this, so an actor has to accept embedded items
       * or every inventory-dependent frame renders empty. Items arrive as plain specs carrying
       * `flags.core.sourceId`, which is how Fabricate matches an owned stack to a managed component.
       */
      async createEmbeddedDocuments(type, specs = []) {
        if (type !== 'Item') return [];
        const created = specs.map((spec, offset) => ({
          uuid: spec.flags?.core?.sourceId ?? `Item.${definition.id}-${items.length + offset}`,
          id: `item-${definition.id}-${items.length + offset}`,
          name: spec.name,
          img: spec.img ?? null,
          type: spec.type ?? 'loot',
          system: { quantity: 1, description: { value: '' }, ...(spec.system ?? {}) },
          flags: spec.flags ?? {},
          getFlag(scope, key) {
            return this.flags?.[scope]?.[key] ?? null;
          },
          async setFlag(scope, key, value) {
            this.flags[scope] = { ...(this.flags[scope] ?? {}), [key]: value };
            return this;
          },
          isOwner: true,
        }));
        items.push(...created);
        return created;
      },
      async deleteEmbeddedDocuments(type, ids = []) {
        if (type !== 'Item') return [];
        const removed = items.filter((item) => ids.includes(item.id));
        for (const item of removed) items.splice(items.indexOf(item), 1);
        return removed;
      },
    };
  });
}

/**
 * Build the `fromUuid` index.
 *
 * This is not optional decoration. Roughly nine render paths resolve names and images through
 * `fromUuid`/`fromUuidSync` — environment scene links, recipe-item books, tool sources, the manager's
 * source-item panels. Without an index those surfaces render as unresolved, which is precisely the
 * "looks broken" failure a screenshot must not have.
 *
 * @param {object} content Output of `buildLabContent()`.
 * @param {object[]} actors Output of {@link buildLabActors}.
 * @returns {Map<string, object>} Documents keyed by uuid.
 */
export function buildDocumentIndex(content, actors) {
  const documents = new Map();

  for (const component of [...content.components, ...content.tools]) {
    const uuid = component.originItemUuid ?? `Item.${component.id}`;
    documents.set(uuid, {
      uuid,
      id: component.id,
      name: component.name,
      img: component.img ?? null,
      type: 'loot',
      system: { quantity: 1, description: { value: component.description ?? '' } },
      flags: {},
      getFlag: () => null,
    });
  }

  for (const actor of actors) documents.set(actor.uuid, actor);

  documents.set('Scene.lab-map', {
    uuid: 'Scene.lab-map',
    id: 'lab-scene',
    name: 'The Verdant Reach',
    img: `${PORTRAIT_BASE}/environment/wilderness/tree-spruce-green.webp`,
  });
  documents.set('Scene.lab-map.Region.grove', {
    uuid: 'Scene.lab-map.Region.grove',
    id: 'grove',
    name: 'Sunlit Grove',
  });

  return documents;
}
