/**
 * Unit tests for system-owned library Tool normalization in CraftingSystemManager.
 *
 * Tools are now the single canonical source on the crafting system:
 * `_normalizeSystem` populates `system.tools` (mirroring `components`) so every
 * consumer that reads `getSystem(id).tools` — the recipe tool gate, salvage, the
 * canvas interactable browser, item-drop resolution, and gathering composition —
 * sees the same normalized library. These tests cover `_normalizeTool` shape +
 * field coercion and the `_normalizeSystem` tools seam.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveToolBreakageAuthority } from '../src/systems/toolBreakageAuthority.js';

// Minimal stubs so the module can load without a Foundry runtime.
let idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `random-${++idCounter}`,
    getProperty: () => undefined
  }
};
// `updateSystem` calls `_assertGM`, so the stub user must be a GM (issue 1374): the clear
// round trip below drives the REAL `updateSystem`, not a normalizer call.
globalThis.game = { user: { isGM: true } };

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

function makeManager() {
  return new CraftingSystemManager({ getRecipes: () => [] });
}

// ---------------------------------------------------------------------------
// _normalizeTool — shape + field coercion
// ---------------------------------------------------------------------------

test('_normalizeTool produces the canonical Tool shape with defaults for a sparse tool', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({ id: 't1' });
  assert.deepEqual(tool, {
    id: 't1',
    label: '',
    enabled: true,
    componentId: null,
    name: null,
    img: null,
    description: '',
    registeredItemUuid: null,
    originItemUuid: null,
    aliasItemUuids: [],
    requirement: null,
    prerequisites: { enabled: false, ids: [], gateMode: 'usability' },
    bonus: { enabled: false, expression: '' },
    breakage: { mode: 'limitedUses', maxUses: null },
    checkBreakable: true,
    onBreak: { mode: 'destroy' },
    repairRequirements: []
  });
});

test('_normalizeTool generates an id when absent', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({});
  assert.ok(typeof tool.id === 'string' && tool.id.length > 0);
});

test('_normalizeTool trims the label and componentId, coercing blanks to null', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({ id: 't1', label: '  Iron Pickaxe  ', componentId: '  comp-pick  ' });
  assert.equal(tool.label, 'Iron Pickaxe');
  assert.equal(tool.componentId, 'comp-pick');

  const blank = manager._normalizeTool({ id: 't2', componentId: '   ' });
  assert.equal(blank.componentId, null);
});

test('_normalizeTool defaults enabled to true and honors an explicit false', () => {
  const manager = makeManager();
  assert.equal(manager._normalizeTool({ id: 't1' }).enabled, true);
  assert.equal(manager._normalizeTool({ id: 't1', enabled: false }).enabled, false);
  assert.equal(manager._normalizeTool({ id: 't1', enabled: 'whatever' }).enabled, true);
});

test('_normalizeTool coerces unknown breakage / on-break modes to defaults but keeps maxUses', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({
    id: 't1',
    breakage: { mode: 'frobnicate', maxUses: 7 },
    onBreak: { mode: 'banana' }
  });
  assert.equal(tool.breakage.mode, 'limitedUses');
  assert.equal(tool.breakage.maxUses, 7);
  assert.equal(tool.onBreak.mode, 'destroy');
});

test('_normalizeTool normalizes breakageChance breakage', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({ id: 't1', breakage: { mode: 'breakageChance', breakageChance: 25 } });
  assert.deepEqual(tool.breakage, { mode: 'breakageChance', breakageChance: 25 });

  const nonNumeric = manager._normalizeTool({ id: 't2', breakage: { mode: 'breakageChance', breakageChance: 'x' } });
  assert.equal(nonNumeric.breakage.breakageChance, 0);
});

test('_normalizeTool normalizes diceExpression breakage', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({ id: 't1', breakage: { mode: 'diceExpression', formula: '1d20', threshold: 10 } });
  assert.deepEqual(tool.breakage, { mode: 'diceExpression', formula: '1d20', threshold: 10 });

  const sparse = manager._normalizeTool({ id: 't2', breakage: { mode: 'diceExpression' } });
  assert.deepEqual(sparse.breakage, { mode: 'diceExpression', formula: '', threshold: 0 });
});

test('_normalizeTool reads legacy replacementComponentId into a discriminated target', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({ id: 't1', onBreak: { mode: 'replaceWith', replacementComponentId: 'comp-broken' } });
  assert.deepEqual(tool.onBreak, {
    mode: 'replaceWith',
    replacementTarget: { type: 'component', componentId: 'comp-broken' },
  });

  const missing = manager._normalizeTool({ id: 't2', onBreak: { mode: 'replaceWith' } });
  assert.equal(missing.onBreak.replacementTarget, null);
});

test('_normalizeTool keeps flagBroken onBreak without extra fields', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({ id: 't1', onBreak: { mode: 'flagBroken' } });
  assert.deepEqual(tool.onBreak, { mode: 'flagBroken' });
});

test('_normalizeTool normalizes a requirement gate to a formula-only shape', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({ id: 't1', requirement: { formula: '@abilities.str.mod' } });
  assert.deepEqual(tool.requirement, { formula: '@abilities.str.mod' });

  // Legacy provider/macroUuid fields are dropped on normalization.
  const legacy = manager._normalizeTool({ id: 't2', requirement: { provider: 'bogus', formula: '@x', macroUuid: 'Macro.x' } });
  assert.deepEqual(legacy.requirement, { formula: '@x' });

  const nullReq = manager._normalizeTool({ id: 't3', requirement: null });
  assert.equal(nullReq.requirement, null);
});

// ---------------------------------------------------------------------------
// _normalizeSystem tools seam
// ---------------------------------------------------------------------------

test('_normalizeSystem populates a normalized tools array', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys1',
    name: 'Wildcraft',
    tools: [
      { id: 'tool-axe', label: 'Axe', componentId: 'comp-axe', breakage: { mode: 'limitedUses', maxUses: 5 } },
      { id: 'tool-saw', componentId: 'comp-saw', breakage: { mode: 'breakageChance', breakageChance: 10 }, onBreak: { mode: 'flagBroken' } }
    ]
  });
  assert.equal(system.tools.length, 2);
  assert.deepEqual(system.tools[0], {
    id: 'tool-axe',
    label: 'Axe',
    enabled: true,
    componentId: 'comp-axe',
    name: null,
    img: null,
    description: '',
    registeredItemUuid: null,
    originItemUuid: null,
    aliasItemUuids: [],
    requirement: null,
    prerequisites: { enabled: false, ids: [], gateMode: 'usability' },
    bonus: { enabled: false, expression: '' },
    breakage: { mode: 'limitedUses', maxUses: 5 },
    checkBreakable: true,
    onBreak: { mode: 'destroy' },
    repairRequirements: []
  });
  assert.equal(system.tools[1].breakage.mode, 'breakageChance');
  assert.equal(system.tools[1].onBreak.mode, 'flagBroken');
});

test('_normalizeSystem returns [] for an absent or non-array tools field', () => {
  const manager = makeManager();
  assert.deepEqual(manager._normalizeSystem({ id: 'sys1' }).tools, []);
  assert.deepEqual(manager._normalizeSystem({ id: 'sys1', tools: null }).tools, []);
  assert.deepEqual(manager._normalizeSystem({ id: 'sys1', tools: 'nope' }).tools, []);
});

test('_normalizeSystem round-trips tools through normalization (re-normalize is stable)', () => {
  const manager = makeManager();
  const once = manager._normalizeSystem({ id: 'sys1', tools: [{ id: 't1', label: ' Pick ', componentId: ' c1 ' }] });
  const twice = manager._normalizeSystem(once);
  assert.deepEqual(twice.tools, once.tools);
});

// ---------------------------------------------------------------------------
// issue 561: first-class tool source refs + name/img snapshot preservation
// ---------------------------------------------------------------------------

test('_normalizeTool preserves source refs + name/img snapshot and never clobbers label (C3)', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({
    id: 't1',
    label: 'GM Custom Label',
    componentId: null,
    name: 'Iron Pickaxe',
    img: 'icons/tools/pick.webp',
    registeredItemUuid: 'Item.live',
    originItemUuid: 'Compendium.pack.canonical',
    aliasItemUuids: ['Item.old', 'Item.old', '  ', 'Item.live'],
  });
  // Source + snapshot fields survive the unknown-field strip.
  assert.equal(tool.name, 'Iron Pickaxe');
  assert.equal(tool.img, 'icons/tools/pick.webp');
  assert.equal(tool.registeredItemUuid, 'Item.live');
  assert.equal(tool.originItemUuid, 'Compendium.pack.canonical');
  // aliasItemUuids de-dupes, trims, and drops the primary-ref overlap ('Item.live').
  assert.deepEqual(tool.aliasItemUuids, ['Item.old']);
  // The user-authored label is preserved verbatim — never overwritten by the snapshot.
  assert.equal(tool.label, 'GM Custom Label');
  // A first-class item-sourced tool has componentId: null.
  assert.equal(tool.componentId, null);

  // Round-trip is stable (re-normalizing the output yields the same shape).
  const twice = manager._normalizeTool(tool);
  assert.deepEqual(twice, tool);
});

// ---------------------------------------------------------------------------
// issue 419: immune breakage mode, toolBreakage.authority, checkBreakage
// ---------------------------------------------------------------------------

test('_normalizeToolBreakage reads legacy immune forward exactly like the Tool model', () => {
  const manager = makeManager();
  const breakage = manager._normalizeToolBreakage({ mode: 'immune', maxUses: 5, breakageChance: 9 });
  assert.deepEqual(breakage, { mode: 'limitedUses', maxUses: null });
});

test('_normalizeSystem normalizes prerequisites before Tools and prevents stale ids from failing open', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 's',
    characterPrerequisites: [
      { id: 'strong', name: 'Strong', path: 'abilities.str', op: 'gte', value: 2 },
      { id: 'trained', name: 'Trained', path: 'skills.craft', op: 'gte', value: 1 },
    ],
    tools: [
      {
        id: 'active',
        prerequisites: {
          enabled: true,
          ids: ['strong', 'missing'],
          gateMode: 'usability',
        },
      },
      {
        id: 'emptied',
        prerequisites: { enabled: true, ids: ['missing'], gateMode: 'bonus' },
      },
      {
        id: 'disabled',
        prerequisites: {
          enabled: false,
          ids: ['trained', 'missing'],
          gateMode: 'bonus',
        },
      },
    ],
  });

  assert.deepEqual(system.tools[0].prerequisites, {
    enabled: true,
    ids: ['strong'],
    gateMode: 'usability',
  });
  assert.deepEqual(system.tools[1].prerequisites, {
    enabled: false,
    ids: [],
    gateMode: 'bonus',
  });
  assert.deepEqual(system.tools[2].prerequisites, {
    enabled: false,
    ids: ['trained'],
    gateMode: 'bonus',
  });
});

test('_normalizeSystem preserves the complete canonical Tool shape and strips Kind', () => {
  const manager = makeManager();
  const [tool] = manager._normalizeSystem({
    id: 's',
    characterPrerequisites: [
      { id: 'strong', name: 'Strong', path: 'abilities.str', op: 'gte', value: 2 },
    ],
    tools: [
      {
        id: 'hammer',
        kind: 'handheld',
        description: 'A source snapshot',
        checkBreakable: false,
        prerequisites: { enabled: false, ids: ['strong'], gateMode: 'bonus' },
        bonus: { enabled: false, expression: '@prof' },
        breakage: { mode: 'diceExpression', formula: '1d20', threshold: 4 },
        onBreak: {
          mode: 'replaceWith',
          replacementTarget: { type: 'item', itemUuid: 'Item.broken-hammer' },
        },
        repairRequirements: [
          {
            id: 'repair',
            options: [{ match: { type: 'component', componentId: 'binding' }, quantity: 1 }],
          },
        ],
      },
    ],
  }).tools;

  assert.equal(tool.description, 'A source snapshot');
  assert.equal(tool.checkBreakable, false);
  assert.deepEqual(tool.prerequisites.ids, ['strong']);
  assert.deepEqual(tool.bonus, { enabled: false, expression: '@prof' });
  assert.deepEqual(tool.onBreak.replacementTarget, {
    type: 'item',
    itemUuid: 'Item.broken-hammer',
  });
  assert.equal(tool.repairRequirements.length, 1);
  assert.equal('kind' in tool, false);
});

// THE FLIP (issue 1363, epic 1357, PR 3). This normalizer used to MINT `toolSpecific` for an
// absent or unrecognised authority on every normalize, which meant every persisted system carried
// a concrete value and the WORLD half of `resolveToolBreakageAuthority` was provably unreachable.
// It is ABSENCE-PRESERVING now: no key at all. The shipped read-shape guarantee that a system with
// no persisted `toolBreakage` READS AS `toolSpecific` is preserved — but by the RESOLVER, which is
// where the world value can be consulted, rather than by minting a value the corpus cannot tell
// apart from a GM's deliberate choice.
test('_normalizeSystem emits NO toolBreakage key at all when none was authored', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 's', name: 'S' });
  assert.equal('toolBreakage' in system, false, 'an unauthored authority must not be minted');
});

test('_normalizeSystem drops an unknown toolBreakage.authority rather than coercing it', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 's', name: 'S', toolBreakage: { authority: 'bogus' } });
  assert.equal('toolBreakage' in system, false);
});

test('the shipped read shape survives the flip: no authored authority still RESOLVES as toolSpecific', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 's', name: 'S' });
  // `## CraftingSystem` requirement 21's guarantee, now answered where the world half can be
  // consulted. With no world value authored the answer is bit-identical to the pre-flip mint.
  assert.equal(effectiveToolBreakageAuthority(system, null), 'toolSpecific');
  assert.equal(effectiveToolBreakageAuthority(system, {}), 'toolSpecific');
  // …and the world half is REACHABLE for the first time, which is the whole point of the flip.
  assert.equal(
    effectiveToolBreakageAuthority(system, { authority: 'checkDriven' }),
    'checkDriven',
    'a system that authored nothing inherits the world authority'
  );
});

test('_normalizeSystem preserves a checkDriven toolBreakage.authority', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 's', name: 'S', toolBreakage: { authority: 'checkDriven' } });
  assert.deepEqual(system.toolBreakage, { authority: 'checkDriven' });
});

// ── THE ABSENCE ROUND TRIP (issue 1374, epic 1357) ──────────────────────────────────────────
//
// The world-scope write path now treats any argument that is neither authority token as a
// CLEAR of the per-system override, and writes `{ toolBreakage: {} }`. That only clears
// anything because NOTHING ON THE PATH MERGES: `updateSystem` builds `{...current, ...updates}`,
// a SHALLOW merge, so the empty block REPLACES the stored one; and the normalizer above is
// absence-preserving, so it emits no key for an unrecognized block. Break either half and the
// key survives — holding the ORIGINAL token after a deep merge, and a SUBSTITUTED `toolSpecific`
// after a re-minting normalizer.
//
// IT NEEDS THE REAL MANAGER, which is why it is here rather than beside the store action that
// performs the write. The admin-store suite's system-manager double ends its `updateSystem` in
// `Object.assign`, which cannot delete a key, so a correct clear leaves the key present there
// and this property is not expressible against it. That suite asserts the FORWARDED PATCH; this
// one asserts what the patch does.
//
// THE PRE-STATE ASSERTION IS NOT CEREMONY. Every other fixture in this file authors no
// `toolBreakage` at all, so the post-state would hold trivially with no clear having happened.

// A manager holding real, normalized systems with `save()` stubbed — the house pattern, so the
// REAL `updateSystem` runs rather than a hand-rebuilt imitation of it.
function makeLoadedManager(systems = []) {
  const manager = makeManager();
  for (const system of systems) {
    manager.systems.set(system.id, manager._normalizeSystem(system));
  }
  manager.initialized = true;
  manager.save = async () => {};
  return manager;
}

test('updateSystem CLEARS an authored toolBreakage.authority with an empty block', async () => {
  const manager = makeLoadedManager([
    { id: 'sys1', name: 'System One', toolBreakage: { authority: 'checkDriven' } },
  ]);

  const before = manager.getSystem('sys1');
  assert.equal(
    'toolBreakage' in before,
    true,
    'pre-state: this system HAS authored an override, so the clear below has something to clear'
  );
  assert.equal(before.toolBreakage.authority, 'checkDriven');

  await manager.updateSystem('sys1', { toolBreakage: {} });

  const after = manager.getSystem('sys1');
  assert.equal(
    'toolBreakage' in after,
    false,
    'the override is GONE, not re-minted as toolSpecific: absence is what the resolver reads ' +
      'the world value for'
  );
  // …and the world half is reachable again for this system, which is the point of clearing.
  assert.equal(effectiveToolBreakageAuthority(after, { authority: 'checkDriven' }), 'checkDriven');
  assert.equal(effectiveToolBreakageAuthority(after, null), 'toolSpecific');
});

test('_normalizeCheckBreakage defaults to an empty trigger list (no enabled flag)', () => {
  const manager = makeManager();
  assert.deepEqual(manager._normalizeCheckBreakage(undefined), { triggers: [] });
  assert.deepEqual(manager._normalizeCheckBreakage({}), { triggers: [] });
});

test('_normalizeCheckBreakage normalizes unified triggers and drops malformed ones', () => {
  const manager = makeManager();
  const block = manager._normalizeCheckBreakage({
    triggers: [
      // Unified trigger carrying an explicit outcome/breakTools; the label is dropped.
      { id: 't1', label: 'Roll low', outcome: 'failure', breakTools: true, condition: { type: 'rollTotal', operator: '<=', value: '5' } },
      // Legacy break-only trigger (no outcome/breakTools) → breakTools true, outcome none.
      { id: 't2', condition: { type: 'progressiveValue', operator: '>=', value: 10 } },
      // outcomeTier cannot force an outcome → outcome coerced to none.
      { id: 't3', outcome: 'success', condition: { type: 'outcomeTier', tierIds: ['x'], outcomeKeys: ['Pass'] } },
      {
        id: 't4',
        outcome: 'none',
        breakTools: false,
        condition: { type: 'diceGroup', groupId: 0, aggregate: 'anyDie', operator: '==', value: 1 },
      },
      // malformed → dropped:
      { id: 'bad-op', condition: { type: 'rollTotal', operator: '!=', value: 1 } },
      { id: 'bad-type', condition: { type: 'unknown' } },
      { id: 'bad-agg', condition: { type: 'diceGroup', groupId: 0, aggregate: 'sum', operator: '==', value: 1 } },
      { id: 'bad-tier', condition: { type: 'outcomeTier' } },
      'not-an-object',
    ],
  });
  assert.equal(block.triggers.length, 4);
  assert.equal(block.triggers[0].label, undefined, 'the free-text label is dropped');
  assert.deepEqual(block.triggers[0].condition, { type: 'rollTotal', operator: '<=', value: 5 });
  assert.equal(block.triggers[0].outcome, 'failure');
  assert.equal(block.triggers[0].breakTools, true);
  // Legacy break-only trigger migrates to breakTools:true / outcome:none.
  assert.equal(block.triggers[1].outcome, 'none');
  assert.equal(block.triggers[1].breakTools, true);
  // outcomeTier coerces outcome to none (it can never force one).
  assert.equal(block.triggers[2].outcome, 'none');
  assert.deepEqual(block.triggers[2].condition, {
    type: 'outcomeTier',
    tierIds: ['x'],
    outcomeKeys: ['pass'],
  });
  assert.deepEqual(block.triggers[3].condition, {
    type: 'diceGroup',
    groupId: 0,
    aggregate: 'anyDie',
    operator: '==',
    value: 1,
  });
  assert.equal(block.triggers[3].outcome, 'none');
  assert.equal(block.triggers[3].breakTools, false);
});

test('_normalizeUnifiedTriggers converts legacy diceCrits ahead of the checkBreakage triggers', () => {
  const manager = makeManager();
  const block = manager._normalizeUnifiedTriggers(
    '1d20',
    [{ id: 'crit', die: '1d20', raw: 1, success: false, breakTools: true }],
    { triggers: [{ id: 'r', outcome: 'success', breakTools: false, condition: { type: 'rollTotal', operator: '>=', value: 18 } }] }
  );
  assert.equal(block.triggers.length, 2);
  // The converted crit comes first as a diceGroup/total/== trigger.
  assert.deepEqual(block.triggers[0].condition, {
    type: 'diceGroup',
    groupId: 0,
    aggregate: 'total',
    operator: '==',
    value: 1,
  });
  assert.equal(block.triggers[0].outcome, 'failure', 'success:false maps to force-failure');
  assert.equal(block.triggers[0].breakTools, true);
  assert.equal(block.triggers[1].outcome, 'success', 'the existing trigger is preserved');
});

test('_normalizeUnifiedTriggers drops a crit keyed to a modified pool, and is idempotent', () => {
  const manager = makeManager();
  // A crit on the modified pool 2d20kh1 is crit-ineligible → dropped.
  const dropped = manager._normalizeUnifiedTriggers(
    '2d20kh1',
    [{ id: 'crit', die: '2d20', raw: 20, success: true }],
    undefined
  );
  assert.deepEqual(dropped, { triggers: [] });

  // Re-normalizing the converted output (no diceCrits, triggers carry outcome/breakTools)
  // produces the same list — the migration does not double-convert.
  const once = manager._normalizeUnifiedTriggers(
    '1d20',
    [{ id: 'crit', die: '1d20', raw: 1, success: false, breakTools: false }],
    undefined
  );
  const twice = manager._normalizeUnifiedTriggers('1d20', undefined, once);
  assert.deepEqual(twice, once, 'normalization is idempotent');
});

// ---------------------------------------------------------------------------
// issue 975: `tierStep`, the third trigger effect alongside outcome + breakTools
// ---------------------------------------------------------------------------

const INERT_TIER_STEP = Object.freeze({ mode: 'none', steps: 1, tierId: null });

test('_normalizeTierStep defaults an absent or malformed record to the inert step', () => {
  const manager = makeManager();
  assert.deepEqual(manager._normalizeTierStep(), INERT_TIER_STEP);
  assert.deepEqual(manager._normalizeTierStep(null), INERT_TIER_STEP);
  assert.deepEqual(manager._normalizeTierStep('up'), INERT_TIER_STEP);
  assert.deepEqual(manager._normalizeTierStep(7), INERT_TIER_STEP);
  assert.deepEqual(manager._normalizeTierStep({}), INERT_TIER_STEP);
});

test('_normalizeTierStep keeps the four valid modes and collapses anything else to none', () => {
  const manager = makeManager();
  for (const mode of ['none', 'target', 'up', 'down']) {
    assert.equal(manager._normalizeTierStep({ mode }).mode, mode);
  }
  for (const mode of ['set', 'UP', '', 0, null, undefined, { mode: 'up' }]) {
    assert.equal(manager._normalizeTierStep({ mode }).mode, 'none', `${String(mode)} is not a mode`);
  }
});

test('_normalizeTierStep clamps steps to an integer of at least one', () => {
  const manager = makeManager();
  const steps = (value) => manager._normalizeTierStep({ mode: 'up', steps: value }).steps;
  assert.equal(steps(undefined), 1, 'absent defaults to one step');
  assert.equal(steps('nope'), 1, 'a non-numeric value defaults to one step');
  assert.equal(steps(Number.NaN), 1);
  assert.equal(steps(Number.POSITIVE_INFINITY), 1, 'a non-finite value defaults to one step');
  assert.equal(steps(0), 1, 'zero steps would be an inert step, so it clamps up');
  assert.equal(steps(-3), 1, 'a negative magnitude clamps up rather than reversing direction');
  assert.equal(steps(2.7), 2, 'a fractional magnitude truncates');
  assert.equal(steps(0.5), 1, 'a fraction truncating to zero still clamps up');
  assert.equal(steps('4'), 4, 'a numeric string coerces');
  assert.equal(steps(3), 3, 'a valid magnitude is untouched');
});

test('_normalizeTierStep trims tierId and coerces anything non-string to null', () => {
  const manager = makeManager();
  const tierId = (value) => manager._normalizeTierStep({ mode: 'target', tierId: value }).tierId;
  assert.equal(tierId('  tier-a  '), 'tier-a', 'a tier id is trimmed');
  assert.equal(tierId('   '), null, 'a blank id is null');
  assert.equal(tierId(''), null);
  assert.equal(tierId(undefined), null);
  assert.equal(tierId(null), null);
  assert.equal(tierId(42), null, 'a non-string id is not coerced to its string form');
  assert.equal(tierId(true), null);
  assert.equal(tierId({ id: 'x' }), null);
});

test('_normalizeTierStep preserves a dangling tierId verbatim', () => {
  const manager = makeManager();
  // This normalizer cannot see the outcome lists — a simple or progressive check has
  // none at all — so a target naming no tier is kept for the editor to display and
  // the runtime to no-op on, rather than being silently discarded here.
  assert.equal(manager._normalizeTierStep({ mode: 'target', tierId: 'no-such-tier' }).tierId, 'no-such-tier');
});

test('_normalizeTierStep retains the other mode operands across a mode switch', () => {
  const manager = makeManager();
  // Flat rather than a discriminated union: switching mode in the editor must never
  // destroy the operand the other mode was using.
  assert.deepEqual(manager._normalizeTierStep({ mode: 'up', steps: 3, tierId: 'tier-a' }), {
    mode: 'up',
    steps: 3,
    tierId: 'tier-a',
  });
  assert.deepEqual(manager._normalizeTierStep({ mode: 'target', steps: 3, tierId: 'tier-a' }), {
    mode: 'target',
    steps: 3,
    tierId: 'tier-a',
  });
});

test('_normalizeTierStep is a fixpoint', () => {
  const manager = makeManager();
  const once = manager._normalizeTierStep({ mode: 'down', steps: '2.9', tierId: ' t ' });
  assert.deepEqual(manager._normalizeTierStep(once), once);
});

test('every normalized trigger carries a tierStep, defaulting to the inert step', () => {
  const manager = makeManager();
  const block = manager._normalizeCheckBreakage({
    triggers: [
      { id: 'plain', outcome: 'failure', breakTools: false, condition: { type: 'rollTotal', operator: '<=', value: 5 } },
      {
        id: 'stepping',
        outcome: 'none',
        breakTools: false,
        tierStep: { mode: 'up', steps: '2', tierId: '  ' },
        condition: { type: 'rollTotal', operator: '>=', value: 18 },
      },
    ],
  });
  assert.deepEqual(block.triggers[0].tierStep, INERT_TIER_STEP);
  assert.deepEqual(block.triggers[1].tierStep, { mode: 'up', steps: 2, tierId: null });
});

test('tierStep is NOT pinned to none for an outcomeTier condition, unlike outcome', () => {
  const manager = makeManager();
  const [trigger] = manager._normalizeCheckBreakage({
    triggers: [
      {
        id: 'tier-driven-step',
        outcome: 'success',
        tierStep: { mode: 'up', steps: 1 },
        condition: { type: 'outcomeTier', tierIds: ['ruined'] },
      },
    ],
  }).triggers;
  // The `outcome` pin is the circularity fix for FORCING an outcome; a step reads
  // the rolled tier and produces the final one, so stepping stays available here.
  assert.equal(trigger.outcome, 'none', 'an outcomeTier condition can never force an outcome');
  assert.deepEqual(trigger.tierStep, { mode: 'up', steps: 1, tierId: null });
});

test('a tierStep alone does not stop a legacy break-only trigger migrating to breakTools true', () => {
  const manager = makeManager();
  // `isLegacyBreakOnly` keys on `outcome === undefined && breakTools === undefined`.
  // Adding tierStep to that test would silently flip every pre-recombine break-only
  // trigger into a NON-breaking one.
  const [legacy] = manager._normalizeCheckBreakage({
    triggers: [{ id: 'legacy', condition: { type: 'rollTotal', operator: '<=', value: 3 } }],
  }).triggers;
  assert.equal(legacy.breakTools, true, 'a pre-recombine break-only trigger still breaks tools');
  assert.deepEqual(legacy.tierStep, INERT_TIER_STEP);

  const [withStep] = manager._normalizeCheckBreakage({
    triggers: [
      {
        id: 'legacy-with-step',
        tierStep: { mode: 'down', steps: 1 },
        condition: { type: 'rollTotal', operator: '<=', value: 3 },
      },
    ],
  }).triggers;
  assert.equal(withStep.breakTools, true, 'a tierStep is not an outcome or a breakTools prop');
});

test('_convertNatSteppingToTriggers synthesises the stable-id stepping pair', () => {
  const manager = makeManager();
  const pair = manager._convertNatSteppingToTriggers(true, '1d20+4', 'relative');
  assert.deepEqual(pair, [
    {
      id: 'natstep-up',
      condition: { type: 'diceGroup', groupId: 0, aggregate: 'allDice', operator: '==', value: 20 },
      outcome: 'none',
      breakTools: false,
      tierStep: { mode: 'up', steps: 1, tierId: null },
    },
    {
      id: 'natstep-down',
      condition: { type: 'diceGroup', groupId: 0, aggregate: 'allDice', operator: '==', value: 1 },
      outcome: 'none',
      breakTools: false,
      tierStep: { mode: 'down', steps: 1, tierId: null },
    },
  ]);
  // Stable literals, not randomID(): the ids reach chat and captured result data, so
  // re-minting them on every read until a save drops `natStepping` is not acceptable.
  const again = manager._convertNatSteppingToTriggers(true, '1d20+4', 'relative');
  assert.deepEqual(again.map((trigger) => trigger.id), ['natstep-up', 'natstep-down']);
});

test('_convertNatSteppingToTriggers synthesises nothing for an inert flag', () => {
  const manager = makeManager();
  assert.deepEqual(manager._convertNatSteppingToTriggers(false, '1d20', 'relative'), []);
  assert.deepEqual(manager._convertNatSteppingToTriggers(undefined, '1d20', 'relative'), []);
  assert.deepEqual(manager._convertNatSteppingToTriggers('true', '1d20', 'relative'), []);
  assert.deepEqual(manager._convertNatSteppingToTriggers(true, '1d20', 'fixed'), []);
  assert.deepEqual(manager._convertNatSteppingToTriggers(true, '', 'relative'), []);
  assert.deepEqual(manager._convertNatSteppingToTriggers(true, '3d6+2', 'relative'), []);
});

test('_normalizeUnifiedTriggers orders converted crits, converted nat-stepping, then authored', () => {
  const manager = makeManager();
  const block = manager._normalizeUnifiedTriggers(
    '1d20',
    [{ id: 'crit', die: '1d20', raw: 20, success: true }],
    { triggers: [{ id: 'authored', outcome: 'none', breakTools: false, condition: { type: 'rollTotal', operator: '>=', value: 18 } }] },
    { natStepping: true, type: 'relative' }
  );
  assert.deepEqual(block.triggers.map((trigger) => trigger.id), [
    'crit',
    'natstep-up',
    'natstep-down',
    'authored',
  ]);
  assert.deepEqual(block.triggers[0].tierStep, INERT_TIER_STEP, 'a converted crit steps nothing');
});

test('_normalizeUnifiedTriggers defaults the legacy-routed argument so simple/progressive are unchanged', () => {
  const manager = makeManager();
  // The simple and progressive normalizers pass three arguments; a routed-only
  // legacy field must not leak into them.
  assert.deepEqual(manager._normalizeUnifiedTriggers('1d20', undefined, undefined), { triggers: [] });
  assert.deepEqual(manager._normalizeUnifiedTriggers('1d20', undefined, undefined, {}), { triggers: [] });
});

test('_normalizeSimpleCraftingCheck carries a unified checkBreakage block and drops diceCrits', () => {
  const manager = makeManager();
  const simple = manager._normalizeSimpleCraftingCheck({
    rollFormula: '1d20',
    diceCrits: [{ id: 'crit', die: '1d20', raw: 1, success: false, breakTools: true }],
    checkBreakage: { triggers: [] },
  });
  assert.equal(simple.diceCrits, undefined, 'the legacy diceCrits field is dropped');
  assert.equal(simple.checkBreakage.triggers.length, 1, 'the legacy crit is migrated into a trigger');
  assert.equal(simple.checkBreakage.triggers[0].outcome, 'failure');
  assert.equal(simple.checkBreakage.triggers[0].breakTools, true);
});

// ---------------------------------------------------------------------------
// Issue 560 — normalizers accept BOTH the legacy source-uuid field names and the
// renamed names, emitting the new names (no silent drop of the renamed fields).
// ---------------------------------------------------------------------------

test('_normalizeTool preserves the renamed source fields from a NEW-named input', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({
    id: 't1',
    registeredItemUuid: 'Item.new-live',
    originItemUuid: 'Compendium.new-origin',
    aliasItemUuids: ['Item.new-alias'],
  });
  assert.equal(tool.registeredItemUuid, 'Item.new-live');
  assert.equal(tool.originItemUuid, 'Compendium.new-origin');
  assert.deepEqual(tool.aliasItemUuids, ['Item.new-alias']);
});

test('_normalizeTool accepts LEGACY source fields and emits the new names', () => {
  const manager = makeManager();
  const tool = manager._normalizeTool({
    id: 't1',
    sourceUuid: 'Item.old-live',
    sourceItemUuid: 'Compendium.old-origin',
    fallbackItemIds: ['Item.old-alias'],
  });
  assert.equal(tool.registeredItemUuid, 'Item.old-live');
  assert.equal(tool.originItemUuid, 'Compendium.old-origin');
  assert.deepEqual(tool.aliasItemUuids, ['Item.old-alias']);
  assert.ok(!('sourceUuid' in tool));
  assert.ok(!('sourceItemUuid' in tool));
  assert.ok(!('fallbackItemIds' in tool));
});

test('_normalizeComponent preserves renamed source fields from NEW-named and LEGACY input', () => {
  const manager = makeManager();
  const fromNew = manager._normalizeComponent({
    id: 'c1',
    registeredItemUuid: 'Item.new-live',
    originItemUuid: 'Compendium.new-origin',
    aliasItemUuids: ['Item.new-alias'],
  });
  assert.equal(fromNew.registeredItemUuid, 'Item.new-live');
  assert.equal(fromNew.originItemUuid, 'Compendium.new-origin');
  assert.deepEqual(fromNew.aliasItemUuids, ['Item.new-alias']);

  const fromLegacy = manager._normalizeComponent({
    id: 'c1',
    sourceUuid: 'Item.old-live',
    sourceItemUuid: 'Compendium.old-origin',
    fallbackItemIds: ['Item.old-alias'],
  });
  assert.equal(fromLegacy.registeredItemUuid, 'Item.old-live');
  assert.equal(fromLegacy.originItemUuid, 'Compendium.old-origin');
  assert.deepEqual(fromLegacy.aliasItemUuids, ['Item.old-alias']);
  assert.ok(!('sourceUuid' in fromLegacy));
  assert.ok(!('sourceItemUuid' in fromLegacy));
  assert.ok(!('fallbackItemIds' in fromLegacy));
});

test('_normalizeRecipeItemDefinition preserves renamed source fields from NEW-named and LEGACY input', () => {
  const manager = makeManager();
  const fromNew = manager._normalizeRecipeItemDefinition({
    id: 'book',
    registeredItemUuid: 'Item.new-live',
    originItemUuid: 'Compendium.new-origin',
    aliasItemUuids: ['Item.new-alias'],
  });
  assert.equal(fromNew.registeredItemUuid, 'Item.new-live');
  assert.equal(fromNew.originItemUuid, 'Compendium.new-origin');
  assert.deepEqual(fromNew.aliasItemUuids, ['Item.new-alias']);

  const fromLegacy = manager._normalizeRecipeItemDefinition({
    id: 'book',
    sourceUuid: 'Item.old-live',
    sourceItemUuid: 'Compendium.old-origin',
    fallbackItemIds: ['Item.old-alias'],
  });
  assert.equal(fromLegacy.registeredItemUuid, 'Item.old-live');
  assert.equal(fromLegacy.originItemUuid, 'Compendium.old-origin');
  assert.deepEqual(fromLegacy.aliasItemUuids, ['Item.old-alias']);
  assert.ok(!('sourceUuid' in fromLegacy));
  assert.ok(!('sourceItemUuid' in fromLegacy));
  assert.ok(!('fallbackItemIds' in fromLegacy));
});
