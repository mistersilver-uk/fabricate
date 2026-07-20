/**
 * CraftingEngine per-tool check-bonus integration:
 *   - _validateTools usability gating (gateMode 'usability' vs 'bonus');
 *   - the crafting check formula gains labeled per-tool bonus terms
 *     (simple + routed via _runCraftingCheck, honoring recipe.toolBonusModes);
 *   - the salvage check formula gains the same terms (all tools 'always');
 *   - routed natStepping threads from craftingCheck.routed.natStepping;
 *   - the nat-step chat annotation helper.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { Recipe } from '../src/models/Recipe.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path).split('.').reduce((value, key) => (value == null ? undefined : value[key]), object);
}
function setProperty(object, path, value) {
  const parts = String(path).split('.');
  const last = parts.pop();
  let t = object;
  for (const p of parts) {
    if (!t[p] || typeof t[p] !== 'object') t[p] = {};
    t = t[p];
  }
  t[last] = value;
}

globalThis.foundry = { utils: { getProperty, setProperty, deepClone: v => JSON.parse(JSON.stringify(v)) } };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

function installSystem(system) {
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: () => system }),
      getResolutionModeService: () => null
    },
    user: { id: 'user-1', isGM: true },
    time: { worldTime: 0 }
  };
  return system;
}

// Dice stub: captures every constructed formula; `1d20`-based check formulas
// resolve to `checkTotal` with a d20 group showing `face`; a bare bonus
// expression ("2", "3", …) resolves to its numeric value (no dice).
let capturedFormulas = [];
function stubRoll({ checkTotal = 15, face = 10 } = {}) {
  capturedFormulas = [];
  globalThis.Roll = class {
    constructor(formula) {
      this.formula = String(formula);
      capturedFormulas.push(this.formula);
    }
    async evaluate() {
      const numeric = Number(this.formula);
      if (Number.isFinite(numeric)) return { total: numeric, dice: [] };
      return {
        total: checkTotal,
        dice: [{ number: 1, faces: 20, total: face, results: [{ result: face }] }],
      };
    }
  };
}

const CRAFTER = { getRollData: () => ({ skills: { smi: { rank: 1 } } }) };

function smithTool(overrides = {}) {
  return {
    id: 'tool-smith',
    label: "Smith's Tools",
    componentId: 'comp-smith',
    bonusExpression: '2',
    prerequisites: [],
    gateMode: 'bonus',
    breakage: { mode: 'limitedUses', maxUses: null },
    onBreak: { mode: 'destroy' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// _validateTools usability gating
// ---------------------------------------------------------------------------

function toolMatcherManager() {
  return {
    toolMatchesItem: (_recipe, tool, item) => Boolean(tool?.componentId) && tool.componentId === item?.id
  };
}

const FAILING_PREREQ = [{ id: 'p1', path: 'skills.smi.rank', op: 'gte', value: 3 }];

test('_validateTools: usability gateMode with failing prereqs rejects despite a present item', async () => {
  installSystem({ id: 'sys-1', components: [], tools: [], features: {} });
  const engine = new CraftingEngine(toolMatcherManager());
  const item = { id: 'comp-smith', getFlag: () => undefined };
  const tool = smithTool({ gateMode: 'usability', prerequisites: FAILING_PREREQ });

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await engine._validateTools(
      [{ items: [item] }],
      { id: 'r1', craftingSystemId: 'sys-1' },
      [tool],
      null,
      { craftingActor: CRAFTER }
    );
    assert.equal(result.valid, false);
    assert.match(result.message, /Missing required tool/);
    assert.match(result.message, /prerequisites not met/);
  } finally {
    console.warn = originalWarn;
  }
});

test('_validateTools: usability gateMode with PASSING prereqs matches normally', async () => {
  installSystem({ id: 'sys-1', components: [], tools: [], features: {} });
  const engine = new CraftingEngine(toolMatcherManager());
  const item = { id: 'comp-smith', getFlag: () => undefined };
  const tool = smithTool({
    gateMode: 'usability',
    prerequisites: [{ id: 'p1', path: 'skills.smi.rank', op: 'gte', value: 1 }],
  });

  const result = await engine._validateTools(
    [{ items: [item] }],
    { id: 'r1', craftingSystemId: 'sys-1' },
    [tool],
    null,
    { craftingActor: CRAFTER }
  );
  assert.equal(result.valid, true);
  assert.equal(result.tools[0].item, item);
});

test('_validateTools: bonus gateMode never gates presence on failing prereqs', async () => {
  installSystem({ id: 'sys-1', components: [], tools: [], features: {} });
  const engine = new CraftingEngine(toolMatcherManager());
  const item = { id: 'comp-smith', getFlag: () => undefined };
  const tool = smithTool({ gateMode: 'bonus', prerequisites: FAILING_PREREQ });

  const result = await engine._validateTools(
    [{ items: [item] }],
    { id: 'r1', craftingSystemId: 'sys-1' },
    [tool],
    null,
    { craftingActor: CRAFTER }
  );
  assert.equal(result.valid, true);
});

test('_validateTools: no craftingActor skips the usability gate (legacy call shape)', async () => {
  installSystem({ id: 'sys-1', components: [], tools: [], features: {} });
  const engine = new CraftingEngine(toolMatcherManager());
  const item = { id: 'comp-smith', getFlag: () => undefined };
  const tool = smithTool({ gateMode: 'usability', prerequisites: FAILING_PREREQ });

  const result = await engine._validateTools(
    [{ items: [item] }],
    { id: 'r1', craftingSystemId: 'sys-1' },
    [tool]
  );
  assert.equal(result.valid, true);
});

// ---------------------------------------------------------------------------
// Crafting check bonus terms (simple + routed)
// ---------------------------------------------------------------------------

function simpleCheckSystem() {
  return installSystem({
    id: 'sys-1',
    resolutionMode: 'simple',
    features: { craftingChecks: true },
    components: [{ id: 'comp-smith', name: 'Smith Component' }],
    tools: [],
    craftingCheck: {
      simple: { rollFormula: '1d20', dc: 10, thresholdMode: 'meet', dcMode: 'static', tiers: [] },
    },
  });
}

test('crafting check: the simple formula gains labeled always + highestOnly terms (never ignored)', async () => {
  simpleCheckSystem();
  stubRoll({ checkTotal: 15 });
  const engine = new CraftingEngine(toolMatcherManager());
  const recipe = {
    id: 'r1',
    craftingSystemId: 'sys-1',
    toolBonusModes: { 'tool-never': 'never', 'tool-h1': 'highestOnly', 'tool-h2': 'highestOnly' },
  };
  const toolItems = [
    { tool: smithTool(), item: {} }, // always, +2
    { tool: smithTool({ id: 'tool-never', label: 'Ignored', bonusExpression: '9' }), item: {} },
    { tool: smithTool({ id: 'tool-h1', label: 'Anvil', bonusExpression: '1' }), item: {} },
    { tool: smithTool({ id: 'tool-h2', label: 'Forge', bonusExpression: '3' }), item: {} },
  ];

  const result = await engine._runCraftingCheck(recipe, CRAFTER, [], null, null, { toolItems });
  assert.equal(result.success, true);
  const checkFormula = capturedFormulas.find((formula) => formula.startsWith('1d20'));
  assert.equal(checkFormula, "1d20 + 2[Smith's Tools] + 3[Forge]");
});

test('crafting check: a failed-prereq bonus tool still crafts but contributes no term', async () => {
  simpleCheckSystem();
  stubRoll({ checkTotal: 15 });
  const engine = new CraftingEngine(toolMatcherManager());
  const toolItems = [{ tool: smithTool({ prerequisites: FAILING_PREREQ }), item: {} }];

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await engine._runCraftingCheck(
      { id: 'r1', craftingSystemId: 'sys-1' },
      CRAFTER,
      [],
      null,
      null,
      { toolItems }
    );
    assert.equal(result.success, true);
    assert.equal(capturedFormulas.find((formula) => formula.startsWith('1d20')), '1d20');
  } finally {
    console.warn = originalWarn;
  }
});

test('crafting check: a label falls back to the linked component name', async () => {
  simpleCheckSystem();
  stubRoll({ checkTotal: 15 });
  const engine = new CraftingEngine(toolMatcherManager());
  const toolItems = [{ tool: smithTool({ label: '', name: null }), item: {} }];

  await engine._runCraftingCheck({ id: 'r1', craftingSystemId: 'sys-1' }, CRAFTER, [], null, null, {
    toolItems,
  });
  assert.equal(
    capturedFormulas.find((formula) => formula.startsWith('1d20')),
    '1d20 + 2[Smith Component]'
  );
});

test('crafting check: no toolItems leaves the authored formula untouched', async () => {
  simpleCheckSystem();
  stubRoll({ checkTotal: 15 });
  const engine = new CraftingEngine(toolMatcherManager());
  await engine._runCraftingCheck({ id: 'r1', craftingSystemId: 'sys-1' }, CRAFTER, [], null, null, {});
  assert.equal(capturedFormulas.find((formula) => formula.startsWith('1d20')), '1d20');
});

test('routed crafting check: bonus terms append and natStepping threads from config', async () => {
  installSystem({
    id: 'sys-1',
    resolutionMode: 'routedByCheck',
    features: { craftingChecks: true },
    components: [],
    tools: [],
    craftingCheck: {
      routed: {
        rollFormula: '1d20',
        dc: 15,
        thresholdMode: 'meet',
        type: 'relative',
        natStepping: true,
        relativeOutcomes: [
          { id: 'ruined', name: 'Ruined', dc: -30, success: false, breakTools: false },
          { id: 'standard', name: 'Standard', dc: 0, success: true, breakTools: false },
          { id: 'fine', name: 'Fine', dc: 5, success: true, breakTools: false },
        ],
        fixedOutcomes: [],
      },
    },
  });
  // Check total 17 (matches Standard) rolled as a natural 20 → steps up to Fine.
  stubRoll({ checkTotal: 17, face: 20 });
  const engine = new CraftingEngine(toolMatcherManager());
  const toolItems = [{ tool: smithTool(), item: {} }];

  const result = await engine._runCraftingCheck(
    { id: 'r1', craftingSystemId: 'sys-1' },
    CRAFTER,
    [],
    null,
    null,
    { toolItems }
  );
  assert.equal(capturedFormulas.find((formula) => formula.startsWith('1d20')), "1d20 + 2[Smith's Tools]");
  assert.equal(result.outcome, 'Fine');
  assert.equal(result.data.natStep.direction, 'up');
});

// ---------------------------------------------------------------------------
// Salvage check bonus terms (all tools 'always')
// ---------------------------------------------------------------------------

test('salvage check: present tools contribute labeled terms to the salvage formula', async () => {
  const system = installSystem({
    id: 'sys-1',
    components: [],
    tools: [],
    salvageResolutionMode: 'simple',
    salvageCraftingCheck: {
      simple: { rollFormula: '1d20', dc: 12, thresholdMode: 'meet' },
    },
  });
  stubRoll({ checkTotal: 14 });
  const engine = new CraftingEngine(toolMatcherManager());
  const toolItems = [
    { tool: smithTool({ id: 'tool-a', label: 'Tongs', bonusExpression: '1' }), item: {} },
    { tool: smithTool({ id: 'tool-b', label: 'Saw', bonusExpression: '2' }), item: {} },
  ];

  const result = await engine._runSalvageCraftingCheck({ id: 'c1', name: 'Scrap' }, system, CRAFTER, {
    toolItems,
  });
  assert.equal(result.success, true);
  assert.equal(
    capturedFormulas.find((formula) => formula.startsWith('1d20')),
    '1d20 + 1[Tongs] + 2[Saw]'
  );
});

test('salvage routed check: natStepping threads from salvageCraftingCheck.routed', async () => {
  const system = installSystem({
    id: 'sys-1',
    components: [],
    tools: [],
    salvageResolutionMode: 'routed',
    salvageCraftingCheck: {
      routed: {
        rollFormula: '1d20',
        dc: 15,
        thresholdMode: 'meet',
        type: 'relative',
        natStepping: true,
        relativeOutcomes: [
          { id: 'poor', name: 'Poor', dc: -30, success: false, breakTools: false },
          { id: 'clean', name: 'Clean', dc: 0, success: true, breakTools: false },
          { id: 'pristine', name: 'Pristine', dc: 5, success: true, breakTools: false },
        ],
        fixedOutcomes: [],
      },
    },
  });
  stubRoll({ checkTotal: 17, face: 20 }); // Clean, stepped up to Pristine
  const engine = new CraftingEngine(toolMatcherManager());

  const result = await engine._runSalvageCraftingCheck({ id: 'c1', name: 'Scrap' }, system, CRAFTER, {});
  assert.equal(result.outcome, 'Pristine');
  assert.equal(result.data.natStep.natural, 20);
});

// ---------------------------------------------------------------------------
// Recipe.toolBonusModes model round-trip
// ---------------------------------------------------------------------------

test('Recipe: toolBonusModes normalizes (invalid entries dropped) and round-trips via toJSON', () => {
  globalThis.foundry.utils.randomID = () => 'rid-1';
  const recipe = new Recipe({
    id: 'r1',
    name: 'Longsword',
    toolIds: ['tool-smith'],
    toolBonusModes: { 'tool-smith': 'highestOnly', 'tool-bad': 'sometimes', '': 'always' },
  });
  assert.deepEqual(recipe.toolBonusModes, { 'tool-smith': 'highestOnly' });

  const round = Recipe.fromJSON(JSON.parse(JSON.stringify(recipe.toJSON())));
  assert.deepEqual(round.toolBonusModes, { 'tool-smith': 'highestOnly' });

  // Absent map → {} (every tool defaults to 'always' at check time).
  assert.deepEqual(new Recipe({ id: 'r2', name: 'Plain' }).toolBonusModes, {});
});

// ---------------------------------------------------------------------------
// Nat-step chat annotation
// ---------------------------------------------------------------------------

test('_natStepNote: localized fallback strings for up/down, null when no step', () => {
  installSystem({ id: 'sys-1', components: [], tools: [], features: {} });
  const engine = new CraftingEngine(toolMatcherManager());
  assert.equal(
    engine._natStepNote({ data: { natStep: { direction: 'up' } } }),
    'Natural 20 — quality stepped up'
  );
  assert.equal(
    engine._natStepNote({ data: { natStep: { direction: 'down' } } }),
    'Natural 1 — quality stepped down'
  );
  assert.equal(engine._natStepNote({ data: {} }), null);
  assert.equal(engine._natStepNote(null), null);
});
