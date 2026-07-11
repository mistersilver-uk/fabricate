/**
 * Shared fixture for the issue 570 copy-import component-id regeneration tests.
 *
 * ONE hoisted export payload exercising EVERY D1 within-payload component-reference
 * site (Sonar new-code fixture-duplication mitigation). Every `*.test.js` for #570
 * imports this so the fixture cannot drift and the round-trip / residual-closure /
 * behaviour / no-dangle / key-aware-negative cases share a single source of truth.
 *
 * This file is a HELPER, never a `*.test.js`. It carries CANONICAL serialized shapes
 * (`ingredientGroups[].options[]` with `match`, the flat `ingredients`/`results`
 * aliases, `resultGroups`, catalysts, salvage, tools, essence, gathering drop rows)
 * so it round-trips faithfully through `prepareForImport(payload, 'copy')` and builds
 * a live `Recipe` model.
 */

/** The component ids authored in the raw fixture (pre-regeneration). */
export const OLD_COMPONENT_IDS = Object.freeze([
  'comp-ore',
  'comp-herb',
  'comp-alt',
  'comp-salvage-out',
  'comp-drop',
  'comp-catalyst',
  'comp-whetstone',
]);

/**
 * A `randomID()`-shaped value living at a NOT-remapped position that coincidentally
 * equals a (pre-regeneration) component id, used by the key-aware NEGATIVE case (f):
 * a `recipeItemDefinitions[].recipeIds[]` entry and a salvage-GROUP id both set to
 * this value MUST survive the copy transform byte-for-byte.
 */
export const COLLIDING_NON_COMPONENT_ID = 'comp-ore';

function ingredientOption(componentId, quantity, alternatives = []) {
  return {
    match: { type: 'component', componentId },
    componentId,
    systemItemId: componentId,
    quantity,
    itemUuid: null,
    tag: null,
    alternatives,
    extractEffects: false,
    effectFilter: null,
  };
}

function result(id, componentId, quantity = 1) {
  return {
    id,
    componentId,
    systemItemId: componentId,
    itemUuid: null,
    quantity,
    propertyMacroUuid: null,
  };
}

function catalyst(componentId) {
  return {
    match: { type: 'component', componentId },
    componentId,
    systemItemId: componentId,
    quantity: 1,
    itemUuid: null,
    tag: null,
    alternatives: [],
  };
}

/**
 * Build a fresh export payload each call (no shared mutable state between tests).
 *
 * @returns {object} An export envelope ready for `prepareForImport(payload, mode)`.
 */
export function buildCopyImportComponentFixture() {
  const system = {
    id: 'sys-copy-import',
    name: 'Copy Import System',
    description: 'Exercises every D1 component-reference site.',
    enabled: true,
    resolutionMode: 'simple',
    features: { essences: true, itemTags: false, gathering: true, salvage: true },
    essenceDefinitions: [
      {
        id: 'earth',
        name: 'Earth',
        description: '',
        icon: 'fas fa-mountain',
        // Site E: canonical + legacy alias on the SAME def.
        sourceComponentId: 'comp-ore',
        associatedSystemItemId: 'comp-ore',
      },
    ],
    categories: [],
    itemTags: [],
    components: [
      {
        id: 'comp-ore',
        name: 'Iron Ore',
        originItemUuid: 'Compendium.world.items.Item.iron-ore',
        essences: { earth: 1 },
        aliasItemUuids: [],
        // Site F: salvage result refs to another component. The group id is a
        // key-aware NEGATIVE probe: a salvage-GROUP id set to a value that equals a
        // (pre-regeneration) component id, which MUST NOT be rewritten (case f).
        salvage: {
          enabled: true,
          ingredientQuantity: 1,
          dcOverride: null,
          toolIds: [],
          resultGroups: [
            {
              id: COLLIDING_NON_COMPONENT_ID,
              name: 'Salvage Yield',
              results: [result('salv-res-1', 'comp-salvage-out', 2)],
            },
          ],
          // Site H (defensive): legacy salvage catalysts.
          catalysts: [catalyst('comp-catalyst')],
        },
      },
      {
        id: 'comp-herb',
        name: 'Moonleaf',
        originItemUuid: 'Compendium.world.items.Item.moonleaf',
        essences: {},
        aliasItemUuids: [],
      },
      {
        id: 'comp-alt',
        name: 'Copper Ore',
        originItemUuid: 'Compendium.world.items.Item.copper-ore',
        essences: {},
        aliasItemUuids: [],
      },
      {
        id: 'comp-salvage-out',
        name: 'Iron Filings',
        originItemUuid: 'Compendium.world.items.Item.iron-filings',
        essences: {},
        aliasItemUuids: [],
      },
      {
        id: 'comp-drop',
        name: 'Wild Root',
        originItemUuid: 'Compendium.world.items.Item.wild-root',
        essences: {},
        aliasItemUuids: [],
      },
      {
        id: 'comp-catalyst',
        name: 'Flux',
        originItemUuid: 'Compendium.world.items.Item.flux',
        essences: {},
        aliasItemUuids: [],
      },
      {
        id: 'comp-whetstone',
        name: 'Whetstone',
        originItemUuid: 'Compendium.world.items.Item.whetstone',
        essences: {},
        aliasItemUuids: [],
      },
    ],
    // Site (f) key-aware NEGATIVE: a recipeIds[] entry equal to a (pre-regeneration)
    // component id, which MUST survive the copy transform byte-for-byte.
    recipeItemDefinitions: [
      { id: 'recipe-def-1', name: 'Recipe Sheet', recipeIds: [COLLIDING_NON_COMPONENT_ID] },
    ],
    // Site C + D: a whetstone that is both a component AND a tool.
    tools: [
      {
        id: 'sys-tool-whet',
        label: '',
        enabled: true,
        componentId: 'comp-whetstone',
        name: 'Whetstone',
        img: null,
        registeredItemUuid: 'Compendium.world.items.Item.whetstone',
        originItemUuid: 'Compendium.world.items.Item.whetstone',
        aliasItemUuids: [],
        requirement: null,
        breakage: { mode: 'breakageChance', breakageChance: 10 },
        onBreak: { mode: 'replaceWith', replacementComponentId: 'comp-ore' },
      },
    ],
  };

  const recipes = [
    {
      id: 'recipe-elixir',
      name: 'Elixir of Vigor',
      craftingSystemId: '__SYSTEM_ID__',
      recipeItemId: 'recipe-def-1',
      ingredientSets: [
        {
          id: 'set-1',
          name: 'Primary',
          ingredientGroups: [
            {
              id: 'grp-1',
              name: 'Group 1',
              // Site A: a DUAL-PATH option (structural componentId + systemItemId alias
              // + match on ONE option) with a nested alternatives[] component ref.
              options: [ingredientOption('comp-ore', 2, [ingredientOption('comp-alt', 1)])],
            },
          ],
          // Site A: the flat ingredients[] alias (mirrors options[0]).
          ingredients: [ingredientOption('comp-ore', 2, [ingredientOption('comp-alt', 1)])],
        },
      ],
      resultGroups: [
        {
          id: 'rg-1',
          name: 'Result Group 1',
          checkOutcomeIds: [],
          results: [result('res-1', 'comp-herb', 1)],
        },
      ],
      // Site B: the flat results[] alias.
      results: [result('res-1', 'comp-herb', 1)],
      // Site H (defensive): legacy top-level catalysts.
      catalysts: [catalyst('comp-catalyst')],
      steps: [
        {
          id: 'step-1',
          name: 'Step 1',
          description: '',
          ingredientSets: [
            {
              id: 'sset-1',
              name: 'Step Set',
              ingredientGroups: [
                { id: 'sgrp-1', name: 'Step Group', options: [ingredientOption('comp-herb', 1)] },
              ],
              ingredients: [ingredientOption('comp-herb', 1)],
              catalysts: [catalyst('comp-catalyst')],
            },
          ],
          resultGroups: [
            {
              id: 'srg-1',
              name: 'Step Result Group',
              checkOutcomeIds: [],
              results: [result('sres-1', 'comp-salvage-out', 1)],
            },
          ],
          catalysts: [catalyst('comp-catalyst')],
          toolIds: [],
        },
      ],
      enabled: true,
    },
  ];

  const gatheringConfig = {
    system: {
      rules: {},
      tasks: [
        {
          id: 'task-forage',
          name: 'Forage',
          enabled: true,
          dropRows: [
            // Site G: componentId only.
            {
              id: 'row-1',
              name: '',
              componentId: 'comp-drop',
              itemUuid: '',
              quantity: 1,
              dropRate: 50,
              enabled: true,
            },
            // Site G: componentId AND itemUuid (must still remap the componentId).
            {
              id: 'row-2',
              name: '',
              componentId: 'comp-drop',
              itemUuid: 'Compendium.world.items.Item.rare-root',
              quantity: 1,
              dropRate: 10,
              enabled: true,
            },
          ],
        },
      ],
      events: [
        {
          id: 'event-wolf',
          name: 'Wolf Pack',
          enabled: true,
          dropRows: [
            {
              id: 'erow-1',
              name: '',
              componentId: 'comp-drop',
              itemUuid: '',
              quantity: 1,
              dropRate: 20,
              enabled: true,
            },
          ],
        },
      ],
      // Site C + D: gathering-library tool linked to a component with a replaceWith onBreak.
      tools: [
        {
          id: 'gth-tool-whet',
          label: 'Whetstone',
          enabled: true,
          componentId: 'comp-whetstone',
          name: 'Whetstone',
          img: null,
          registeredItemUuid: 'Compendium.world.items.Item.whetstone',
          originItemUuid: 'Compendium.world.items.Item.whetstone',
          aliasItemUuids: [],
          requirement: null,
          breakage: { mode: 'breakageChance', breakageChance: 5 },
          onBreak: { mode: 'replaceWith', replacementComponentId: 'comp-herb' },
        },
      ],
    },
    shared: {},
  };

  return {
    schemaVersion: 2,
    fabricateVersion: '1.16.0',
    exportedAt: '2026-07-10T00:00:00.000Z',
    runtimeStateIncluded: false,
    system,
    recipes,
    gatheringEnvironments: [],
    gatheringConfig,
  };
}

/**
 * Independent, LITERAL-path sweep of every D1 component-reference site (issue 570 D2).
 *
 * This is deliberately NOT shared with the production transform's site list: a shared
 * constant would blind both the transform and this oracle to the same omission and
 * reopen the trap. It is the load-bearing completeness check for every site the
 * `collectBrokenInternalReferences` collector does not (yet) cover — in particular the
 * flat `ingredients[]` alias, which has NO independent behavioural backstop
 * (IngredientSet re-derives it on normalize).
 *
 * @param {object} prepared - a `prepareForImport(...)` result
 * @returns {Array<{ path: string, value: string }>} every present, non-empty ref value
 */
export function collectComponentRefSites(prepared) {
  const sites = [];
  const emit = (path, value) => {
    if (typeof value === 'string' && value !== '') sites.push({ path, value });
  };

  const entriesOf = (value) => (Array.isArray(value) ? value.entries() : [].entries());

  // An ingredient/catalyst ref: match object + bare fields, recursing alternatives.
  const sweepIngredientRef = (ref, path) => {
    if (!ref || typeof ref !== 'object') return;
    if (ref.match && typeof ref.match === 'object') {
      emit(`${path}.match.componentId`, ref.match.componentId);
      emit(`${path}.match.systemItemId`, ref.match.systemItemId);
    }
    emit(`${path}.componentId`, ref.componentId);
    emit(`${path}.systemItemId`, ref.systemItemId);
    for (const [i, alt] of entriesOf(ref.alternatives)) {
      sweepIngredientRef(alt, `${path}.alternatives[${i}]`);
    }
  };
  const sweepResult = (res, path) => {
    if (!res || typeof res !== 'object') return;
    emit(`${path}.componentId`, res.componentId);
    emit(`${path}.systemItemId`, res.systemItemId);
  };
  const sweepResultGroups = (groups, path) => {
    for (const [g, group] of entriesOf(groups)) {
      for (const [r, res] of entriesOf(group?.results)) {
        sweepResult(res, `${path}[${g}].results[${r}]`);
      }
    }
  };
  const sweepIngredientSet = (set, path) => {
    if (!set || typeof set !== 'object') return;
    for (const [g, group] of entriesOf(set.ingredientGroups)) {
      for (const [o, opt] of entriesOf(group?.options)) {
        sweepIngredientRef(opt, `${path}.ingredientGroups[${g}].options[${o}]`);
      }
    }
    for (const [i, ing] of entriesOf(set.ingredients)) {
      sweepIngredientRef(ing, `${path}.ingredients[${i}]`);
    }
    for (const [c, cat] of entriesOf(set.catalysts)) {
      sweepIngredientRef(cat, `${path}.catalysts[${c}]`);
    }
  };
  const sweepTool = (tool, path) => {
    if (!tool || typeof tool !== 'object') return;
    emit(`${path}.componentId`, tool.componentId);
    if (tool.onBreak && typeof tool.onBreak === 'object') {
      emit(`${path}.onBreak.replacementComponentId`, tool.onBreak.replacementComponentId);
    }
  };

  const system = prepared.system || {};

  // Essence source component.
  for (const [i, def] of entriesOf(system.essenceDefinitions)) {
    emit(`system.essenceDefinitions[${i}].sourceComponentId`, def?.sourceComponentId);
    emit(`system.essenceDefinitions[${i}].associatedSystemItemId`, def?.associatedSystemItemId);
  }

  // System tools.
  for (const [i, tool] of entriesOf(system.tools)) {
    sweepTool(tool, `system.tools[${i}]`);
  }

  // Component salvage result refs + salvage catalysts.
  for (const [i, comp] of entriesOf(system.components)) {
    const salvage = comp?.salvage;
    if (salvage && typeof salvage === 'object') {
      sweepResultGroups(salvage.resultGroups, `system.components[${i}].salvage.resultGroups`);
      for (const [c, cat] of entriesOf(salvage.catalysts)) {
        sweepIngredientRef(cat, `system.components[${i}].salvage.catalysts[${c}]`);
      }
    }
  }

  // Recipes: top-level + steps.
  for (const [i, recipe] of entriesOf(prepared.recipes)) {
    for (const [s, set] of entriesOf(recipe.ingredientSets)) {
      sweepIngredientSet(set, `recipes[${i}].ingredientSets[${s}]`);
    }
    sweepResultGroups(recipe.resultGroups, `recipes[${i}].resultGroups`);
    for (const [r, res] of entriesOf(recipe.results)) {
      sweepResult(res, `recipes[${i}].results[${r}]`);
    }
    for (const [c, cat] of entriesOf(recipe.catalysts)) {
      sweepIngredientRef(cat, `recipes[${i}].catalysts[${c}]`);
    }
    for (const [st, step] of entriesOf(recipe.steps)) {
      for (const [s, set] of entriesOf(step.ingredientSets)) {
        sweepIngredientSet(set, `recipes[${i}].steps[${st}].ingredientSets[${s}]`);
      }
      sweepResultGroups(step.resultGroups, `recipes[${i}].steps[${st}].resultGroups`);
      for (const [c, cat] of entriesOf(step.catalysts)) {
        sweepIngredientRef(cat, `recipes[${i}].steps[${st}].catalysts[${c}]`);
      }
    }
  }

  // Gathering slice: tools + task/event drop rows.
  const slice =
    prepared.gatheringConfig && typeof prepared.gatheringConfig.system === 'object'
      ? prepared.gatheringConfig.system
      : {};
  for (const [i, tool] of entriesOf(slice.tools)) {
    sweepTool(tool, `gatheringConfig.system.tools[${i}]`);
  }
  const sweepDropRows = (records, kind) => {
    for (const [r, record] of entriesOf(records)) {
      for (const [d, row] of entriesOf(record?.dropRows)) {
        emit(`gatheringConfig.system.${kind}[${r}].dropRows[${d}].componentId`, row?.componentId);
        emit(`gatheringConfig.system.${kind}[${r}].dropRows[${d}].systemItemId`, row?.systemItemId);
      }
    }
  };
  sweepDropRows(slice.tasks, 'tasks');
  sweepDropRows(slice.events, 'events');

  return sites;
}
