/**
 * Static Journal-only authoring corpus transcribed from the original standalone's
 * runs/history data (SHA-256 453d147b1d1d27652aee4ac69764d77aaddf66e53f7ae9272513e0a1fd3d954c).
 * No prototype file, decoded script or image is a runtime/CI dependency.
 * Names, stage/slot/award cardinality and stock are reference facts; core raster art
 * replaces the prototype's glyph art. These are authoring models, never UI projections.
 */
const fixed = (id, quantity = 1) => ({ id, quantity });
const choice = (...options) => ({ options });
const essence = (id, amount) => ({ essence: id, amount });
const stage = (name, hours, requirements, output = null) => ({ name, hours, requirements, output });
const ward = (id, name, reagent, quantity, output = 'warded_plate') => ({
  id,
  name,
  requirements: [fixed('shield_blank'), fixed('rune_chalk'), fixed(reagent, quantity)],
  output: [output, 1],
});
const wards = [
  ward('verdant', 'Verdant warding', 'bitterleaf', 1, 'verdant_boss'),
  ward('sunward', 'Sunward warding', 'emberdust', 2, 'sunward_boss'),
];

export const JOURNAL_PROTOTYPE_RECIPES = Object.freeze({
  rivets: {
    name: 'Forge Iron Rivets',
    mode: 'routedByCheck',
    dc: 10,
    mod: 2,
    current: 1,
    left: 3,
    steps: [
      stage(
        'Cut & heat the iron',
        0,
        [fixed('iron_billet', 2), fixed('charcoal', 3)],
        ['heated_billet', 2]
      ),
      stage(
        'Hammer the rivets',
        5,
        [fixed('charcoal'), choice('quench_oil', 'brine')],
        ['rough_rivets', 4]
      ),
      stage(
        'Quench & finish',
        3,
        [fixed('linseed_oil'), choice('beeswax', 'linseed_oil')],
        ['iron_rivets', 4]
      ),
    ],
  },
  tonic: {
    name: 'Distil Tonic of Clarity',
    mode: 'alchemy',
    dc: 13,
    mod: 3,
    current: 1,
    left: 5,
    steps: [
      stage('Macerate the reagents', 0, [fixed('springwater')], ['macerate', 1]),
      stage(
        'Draw off the spirit',
        8,
        [fixed('glass_vial'), essence('clarity', 5)],
        ['clarity_tonic', 2]
      ),
    ],
  },
  cord: {
    name: 'Wax a Hemp Cord',
    mode: 'simple',
    current: 0,
    left: 0,
    description: 'Draw a hemp cord through warm wax to weatherproof it.',
    steps: [
      stage(
        'Draw the cord through warm wax',
        1,
        [fixed('hemp_cord'), fixed('beeswax')],
        ['waxed_cord', 1]
      ),
    ],
  },
  boss: {
    name: 'Bind a Shield Boss',
    mode: 'routedByIngredients',
    dc: 11,
    mod: 2,
    current: 0,
    left: 0,
    description:
      'Chalk a ward onto a boss blank and set a reagent into it — the reagent decides which ward takes, and the work is checked.',
    steps: [{ ...stage('Chalk the ward and set the reagent', 4, []), routes: wards }],
  },
  edge: {
    name: 'Whet a Keen Edge',
    mode: 'routedByCheck',
    dc: 12,
    mod: 1,
    current: 0,
    left: 0,
    description: 'Work a blade edge to a wire on the stone, then hone it out.',
    steps: [
      stage(
        'Work the edge to a wire',
        2,
        [fixed('whetstone'), choice('linseed_oil', 'quench_oil')],
        ['keen_edge', 1]
      ),
    ],
  },
  sigil: {
    name: 'Inscribe a Prismatic Sigil',
    mode: 'alchemy',
    dc: 14,
    mod: 3,
    current: 1,
    left: 4,
    steps: [
      stage('Chalk the double ward', 0, [fixed('rune_chalk')]),
      stage(
        'Charge both poles',
        8,
        [choice('rune_stylus', 'rune_chalk'), essence('radiant', 4), essence('shadow', 3)],
        ['prismatic_sigil', 1]
      ),
    ],
  },
  poultice: {
    name: 'Steep a Bitter Poultice',
    mode: 'simple',
    current: 1,
    left: 1,
    steps: [
      stage('Bruise the bitterroot', 0, [fixed('bitterroot', 2)], ['bruised_root', 2]),
      stage(
        'Steep it down',
        6,
        [fixed('springwater'), essence('clarity', 2)],
        ['steeped_liquor', 1]
      ),
      stage('Press into a poultice', 2, [fixed('hemp_cord')], ['bitter_poultice', 1]),
    ],
  },
  buckler: {
    name: 'Assemble a Warded Buckler',
    mode: 'routedByIngredients',
    dc: 12,
    mod: 2,
    current: 2,
    left: 2,
    steps: [
      {
        ...stage('Ward the face plate', 0, []),
        routes: wards.map((entry) => ({ ...entry, output: ['warded_plate', 1] })),
      },
      stage('Wrap and set the grip', 2, [fixed('hemp_cord')], ['fitted_grip', 1]),
      stage(
        'Rivet plate to grip',
        4,
        [fixed('charcoal'), choice('quench_oil', 'brine')],
        ['riveted_buckler', 1]
      ),
      {
        ...stage('Seal the rim', 3, []),
        routes: [
          {
            id: 'wax',
            name: 'Wax seal',
            requirements: [fixed('beeswax')],
            output: ['warded_buckler', 1],
          },
          {
            id: 'oil',
            name: 'Oil seal',
            requirements: [fixed('linseed_oil'), fixed('whetstone')],
            output: ['warded_buckler', 1],
          },
        ],
      },
    ],
  },
  copper: {
    name: 'Smelt Copper Ingot',
    mode: 'routedByCheck',
    dc: 10,
    mod: 2,
    current: 0,
    left: 0,
    steps: [stage('Smelt the copper', 2, [], ['copper_ingot', 1])],
  },
  draught: {
    name: 'Brew a Steeping Draught',
    mode: 'alchemy',
    dc: 12,
    mod: 1,
    current: 0,
    left: 0,
    steps: [stage('Steep the draught', 6, [], ['iron_rivets', 1])],
  },
  breastplate: {
    name: 'Forge Breastplate',
    mode: 'routedByCheck',
    dc: 14,
    mod: 1,
    current: 0,
    left: 0,
    steps: [stage('Forge and quench the plate', 4, [], ['breastplate', 1])],
  },
});

const STOCK = Object.freeze({
  iron_billet: 2,
  charcoal: 4,
  quench_oil: 1,
  brine: 3,
  beeswax: 2,
  linseed_oil: 1,
  glass_vial: 2,
  springwater: 3,
  moonpetal: 2,
  dewglass: 1,
  hemp_cord: 2,
  shield_blank: 1,
  rune_chalk: 2,
  bitterleaf: 1,
  emberdust: 1,
  whetstone: 1,
  sunmote: 2,
  duskglass: 2,
  shadeink: 1,
  bitterroot: 2,
  rune_stylus: 1,
});
const CONTRIBUTIONS = Object.freeze({
  springwater: { clarity: 1 },
  moonpetal: { clarity: 2 },
  dewglass: { clarity: 3 },
  bitterroot: { clarity: 1 },
  sunmote: { radiant: 2 },
  duskglass: { radiant: 1, shadow: 2 },
  shadeink: { shadow: 3 },
});
const NAMES = {
  iron_billet: 'Iron Billet',
  brine: 'Salt Brine',
  quench_oil: 'Quenching Oil',
  clarity_tonic: 'Tonic of Clarity',
  prismatic_sigil: 'Prismatic Sigil',
  meadow_herb: 'Meadow Herbs',
};
const title = (id) =>
  NAMES[id] ??
  id
    .split('_')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
const componentId = (id) => `jp-${id}`;
const systemId = (id) => `jp-system-${id}`;
export const journalPrototypeRecipeId = (id) => `jp-recipe-${id}`;
const raster = 'commodities/metal/ingot-worn-iron.webp';
const WORKSHOPS = {
  cord: 'Homespun',
  boss: 'Runesmith’s Forge',
  buckler: 'Runesmith’s Forge',
  tonic: 'Philosopher’s Crucible',
  poultice: 'Philosopher’s Crucible',
  sigil: 'Hedge Witchery',
  draught: 'Philosopher’s Crucible',
};

/** Case-to-original-data binding; canonical extensions are explicitly labelled. */
export const JOURNAL_PROTOTYPE_BINDINGS = Object.freeze({
  'ready-single': 'cord',
  'waiting-auto-eligible': 'poultice',
  'waiting-open-choice': 'rivets',
  'current-choice-closed': 'rivets',
  'material-shortage': 'boss',
  'ingredient-route': 'boss',
  'check-route': 'edge',
  'essence-shared': 'sigil',
  'essence-overshoot': 'sigil',
  paused: 'rivets/pause',
  'cancel-confirmation': 'rivets',
  'past-stage': 'rivets',
  'future-stage': 'rivets',
  'past-routed-stage': 'buckler',
  'future-routed-stage': 'buckler',
  'gathering-straight': 'herbs',
  'gathering-d100': 'stone',
  'gathering-check': 'balehound',
  'finished-success': 'h1',
  'finished-failure': 'h3',
  'finished-cancelled': 'rivets/cancel-after-one',
  'history-checked-choice': 'h10',
  'history-resolution-ingredients': 'h4',
  'history-resolution-simple': 'h5',
  'history-checked-ingredients': 'boss/execute',
  'history-legacy-no-check-failure': 'h9',
  'history-multi-essence': 'h8',
  'history-multi-shared-essence': 'h7',
  'history-multi-success': 'rivets/execute-all',
  'history-multi-failure': 'h12',
  'history-cancelled-before': 'cord/cancel-before',
  'history-cancelled-multi': 'buckler/cancel-after-two',
  'history-d100-all-hit': 'stone/roll-all-hit',
  'history-d100-all-miss': 'stone/roll-all-miss',
  'history-gathering-check-failure': 'balehound/fail',
  'history-just-resolved': 'cord/execute',
  'history-redacted': 'canonical/disclosure',
  'history-missing-material': 'canonical/missing-evidence',
  'history-gm-deleted-recipe': 'canonical/deleted-recipe',
  'history-failure-awards': 'canonical/actual-failure-awards',
  'history-settling': 'canonical/settlement',
  'history-compact-grid': 'canonical/maintainer-four-column',
  'history-compact-tools': 'canonical/recorded-physical-tools',
  'active-page-two': 'runs/page-2',
  'finished-page-two': 'history/page-2',
  'filter-paused': 'tonic',
  'empty-search': 'rivets',
  dismissal: 'h1/dismiss',
  'kind-menu-open': 'runs/kind-menu',
  'automatic-completion': 'poultice/automatic',
  'automatic-blocker': 'canonical/automatic-no-spend',
  wide: 'rivets',
  narrow: 'rivets',
});

function requirements(id, entries) {
  return {
    id,
    ingredientGroups: entries.map((entry, index) => ({
      id: `${id}-g${index + 1}`,
      options: entry.essence
        ? [{ match: { type: 'essence', essenceId: entry.essence, amount: entry.amount } }]
        : (entry.options ?? [entry.id]).map((key) => ({
            match: { type: 'component', componentId: componentId(key) },
            quantity: entry.quantity ?? 1,
          })),
    })),
  };
}

function authoredStep(id, spec) {
  const routes = spec.routes ?? [
    { id: 'fixed', requirements: spec.requirements, output: spec.output },
  ];
  return {
    id,
    name: spec.name,
    description: '',
    toolIds: [],
    timeRequirement: { hours: spec.hours },
    ingredientSets: routes.map((route) => ({
      ...requirements(`${id}-${route.id}`, route.requirements),
      name: route.name ?? '',
      resultGroupId: `${id}-${route.id}-results`,
    })),
    resultGroups: routes.map((route) => ({
      id: `${id}-${route.id}-results`,
      name: route.name ?? 'Cleared',
      checkOutcomeIds: ['cleared'],
      results: route.output
        ? [
            {
              id: `${id}-${route.id}-award`,
              componentId: componentId(route.output[0]),
              quantity: route.output[1],
            },
          ]
        : [],
    })),
  };
}

function recipeComponents(key, components) {
  const claritySources = {
    tonic: ['jp-dewglass', 'jp-moonpetal', 'jp-springwater'],
    poultice: ['jp-springwater', 'jp-bitterroot'],
  }[key];
  return components.map((entry) => {
    const copy = structuredClone(entry);
    if (claritySources && !claritySources.includes(copy.id)) delete copy.essences.clarity;
    return copy;
  });
}

/** Extend only a fresh Journal case's authoring world using the existing fixture factories. */
export function seedJournalPrototype(content, state, { component, recipe }) {
  if (!Object.hasOwn(JOURNAL_PROTOTYPE_BINDINGS, state)) return content;
  content = structuredClone(content);
  const keys = new Set([
    ...Object.keys(STOCK),
    'rough_stone',
    'meadow_herb',
    'balehound_hide',
    'balehound_fang',
    'acid_gland',
  ]);
  for (const spec of Object.values(JOURNAL_PROTOTYPE_RECIPES)) {
    for (const entry of spec.steps) {
      if (entry.output) keys.add(entry.output[0]);
      for (const route of entry.routes ?? []) keys.add(route.output[0]);
    }
  }
  const components = [...keys].map((key) =>
    component(componentId(key), title(key), raster, {
      essences: { ...CONTRIBUTIONS[key] },
    })
  );
  const definitions = ['clarity', 'radiant', 'shadow'].map((id) => ({
    id,
    name: title(id),
    enabled: true,
    icon: 'fas fa-atom',
    colorToken: 'aqua',
  }));
  const template = content.systems[0];
  for (const [key, spec] of Object.entries(JOURNAL_PROTOTYPE_RECIPES)) {
    const formula = spec.dc ? `1d20 + ${spec.mod}` : '';
    content.systems.push({
      ...structuredClone(template),
      id: systemId(key),
      name: WORKSHOPS[key] ?? 'Mythwright',
      resolutionMode: spec.mode,
      components: recipeComponents(key, components),
      tools: [],
      essenceDefinitions: definitions,
      visibilityMode: spec.mode === 'alchemy' ? 'restricted' : 'global',
      features: { ...template.features, multiStepRecipes: true },
      alchemy: { ...template.alchemy, enabled: true, checkMode: 'simple' },
      craftingCheck: {
        enabled: Boolean(formula),
        simple: { rollFormula: formula, dc: spec.dc ?? 0 },
        routed: {
          type: 'relative',
          rollFormula: formula,
          relativeOutcomes: [
            { id: 'cleared', name: 'Cleared', success: true, dc: 0 },
            { id: 'short', name: 'Short', success: false, dc: -20 },
          ],
        },
      },
    });
    const steps = spec.steps.map((entry, index) =>
      authoredStep(`${key}-stage-${index + 1}`, entry)
    );
    content.recipes.push(
      recipe(journalPrototypeRecipeId(key), spec.name, systemId(key), raster, {
        description: spec.description ?? '',
        access: { playerIds: ['user-lab-player'], characterIds: [] },
        steps: steps.length > 1 ? steps : [],
        ...(steps.length === 1 ? steps[0] : {}),
        id: journalPrototypeRecipeId(key),
        name: spec.name,
      })
    );
  }
  content.components.push(...components);
  seedGathering(content, components, template);
  return content;
}

function seedGathering(content, components, template) {
  const tiers = [
    ['barren', 'Barren', -10, false, []],
    ['meagre', 'Meagre', -5, true, [['balehound_hide', 1]]],
    [
      'steady',
      'Steady',
      0,
      true,
      [
        ['balehound_hide', 1],
        ['balehound_fang', 2],
      ],
    ],
    [
      'rich',
      'Rich',
      5,
      true,
      [
        ['balehound_hide', 1],
        ['balehound_fang', 2],
        ['acid_gland', 1],
      ],
    ],
    [
      'bountiful',
      'Bountiful',
      10,
      true,
      [
        ['balehound_hide', 2],
        ['balehound_fang', 3],
        ['acid_gland', 2],
      ],
    ],
  ];
  const tasks = [
    {
      id: 'jp-herbs',
      name: 'Gather Meadow Herbs',
      resolutionMode: 'straight',
      durationSeconds: 4 * 3600,
      description: 'Cut and bundle whatever is in season along the meadow edge.',
      resultGroups: [
        {
          id: 'herbs-results',
          name: 'Collected',
          results: [
            ['meadow_herb', 2],
            ['springwater', 1],
          ].map(([id, quantity]) => ({
            id: `jp-${id}-drop`,
            componentId: componentId(id),
            quantity,
          })),
        },
      ],
    },
    {
      id: 'jp-stone',
      name: 'Quarry Rough Stone',
      resolutionMode: 'd100',
      durationSeconds: 6 * 3600,
      description: 'Break and haul rough stone from an open face.',
      dropRows: [
        ['rough_stone', 6, 90],
        ['whetstone', 1, 35],
        ['dewglass', 1, 10],
      ].map(([id, quantity, dropRate]) => ({
        id: `jp-${id}-drop`,
        componentId: componentId(id),
        quantity,
        dropRate,
        enabled: true,
      })),
    },
    {
      id: 'jp-balehound',
      name: 'Track a Balehound',
      resolutionMode: 'routed',
      durationSeconds: 6 * 3600,
      description: 'Track and take a balehound for its hide, teeth and acid glands.',
      dc: 10,
      resultGroups: tiers.map(([id, name, _dc, _success, awards]) => ({
        id,
        name,
        results: awards.map(([key, quantity]) => ({
          id: `jp-${key}-drop`,
          componentId: componentId(key),
          quantity,
        })),
      })),
    },
  ].map((task) => ({
    ...task,
    craftingSystemId: systemId('gathering'),
    img: components[0].img,
    enabled: true,
    toolIds: [],
  }));
  content.systems.push({
    ...structuredClone(template),
    id: systemId('gathering'),
    name: 'Fieldwork',
    components,
    gatheringCraftingCheck: {
      routed: {
        type: 'relative',
        rollFormula: '1d20 + 2',
        relativeOutcomes: tiers.map(([id, name, dc, success]) => ({ id, name, dc, success })),
      },
    },
  });
  content.gatheringConfig.tasks.push(...tasks);
  content.gatheringConfig.systems[systemId('gathering')] = { tasks, events: [], rules: {} };
  content.environments = [
    ...content.environments,
    {
      id: 'jp-environment',
      name: 'The expedition',
      craftingSystemId: systemId('gathering'),
      enabled: true,
      selectionMode: 'targeted',
      compositionMode: 'manual',
      enabledTaskIds: tasks.map((task) => task.id),
    },
  ];
}

/** Seed through the existing actor's embedded-document seam before Journal readers cache it. */
export async function stockJournalPrototype(actor, content, state = null) {
  const stock = content.recipes.some((entry) => entry.id === journalPrototypeRecipeId('cord'))
    ? Object.entries(STOCK).map(([id, quantity]) => [componentId(id), quantity])
    : [];
  if (state === 'alchemy') {
    // This retained-mode case opens on the Journal actor, not the stocked herbalist.
    // Supply its fixed authored reagents before the availability snapshot is built.
    const recipe = content.recipes.find((entry) => entry.id === 'al-r-fire');
    stock.push(
      ...recipe.ingredientSets[0].ingredientGroups.map(({ options: [option] }) => [
        option.componentId,
        option.quantity,
      ])
    );
  }
  if (!stock.length) return;
  const byId = new Map(content.components.map((entry) => [entry.id, entry]));
  await actor.createEmbeddedDocuments(
    'Item',
    stock.map(([id, quantity]) => {
      const entry = byId.get(id);
      return {
        name: entry.name,
        img: entry.img,
        type: 'loot',
        system: { quantity },
        flags: { core: { sourceId: entry.originItemUuid } },
      };
    })
  );
}

/** Actual receipt identity and essence contributions; quantities are never projected into storage. */
export function journalPrototypeMaterial(actorUuid, id, quantity) {
  return {
    actorUuid,
    itemUuid: `Item.${componentId(id)}`,
    componentId: componentId(id),
    name: title(id),
    img: `/@foundry-chrome/icons/${raster}`,
    quantity,
  };
}

export function journalPrototypeEssenceSpend(actorUuid, allocations) {
  return {
    labels: { clarity: 'Clarity', radiant: 'Radiant', shadow: 'Shadow' },
    carriers: Object.entries(allocations).map(([id, quantity]) => ({
      ...journalPrototypeMaterial(actorUuid, id, quantity),
      contributions: Object.entries(CONTRIBUTIONS[id] ?? {}).map(([essenceId, amount]) => ({
        essenceId,
        amount: amount * quantity,
      })),
    })),
  };
}
