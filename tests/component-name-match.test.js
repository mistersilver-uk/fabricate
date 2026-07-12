import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// The recipe-caller test drives the REAL `RecipeManager.toolMatchesItem` over an
// installed crafting system, which reads `game.fabricate.getCraftingSystemManager()`.
// Set the globals BEFORE importing the manager/engine classes (matching the proven
// first-class-tools harness ordering), so import-time module evaluation sees them.
globalThis.foundry = {
  utils: { randomID: () => `id-${Math.random().toString(36).slice(2)}` },
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.game = { user: { isGM: true, id: 'gm-user' }, fabricate: {} };

import {
  findComponentByName,
  matchComponentByName,
  resetNameOnlyMatchTelemetry,
} from '../src/utils/componentNameMatch.js';
import { findMatchingComponent } from '../src/utils/essenceResolver.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingSystemManager } from '../src/systems/CraftingSystemManager.js';
import { RecipeManager } from '../src/systems/RecipeManager.js';
import { roleItem, tool } from './helpers/componentIdentityFixtures.js';

// Phase 1 of issue 540: the four name-fallback matching sites are unified behind the
// shared `componentNameMatch` helper, PRESERVING each site's exact case-sensitivity, and
// every name-only match emits warn-once telemetry. These tests pin (a) the per-site
// case-sensitivity contract and (b) the telemetry guard.

// Silence + capture console.warn so the warn-once assertions are deterministic and no
// telemetry state bleeds between tests.
let warnCalls;
let originalWarn;

beforeEach(() => {
  resetNameOnlyMatchTelemetry();
  warnCalls = [];
  originalWarn = console.warn;
  console.warn = (...args) => {
    warnCalls.push(args.join(' '));
  };
});

afterEach(() => {
  console.warn = originalWarn;
  resetNameOnlyMatchTelemetry();
});

describe('matchComponentByName — per-site case-sensitivity (issue 540)', () => {
  it('case-INSENSITIVE (default): a case-mismatched name matches', () => {
    const item = { name: 'iron ingot' };
    const component = { id: 'c1', name: 'Iron Ingot' };
    assert.equal(matchComponentByName(item, component, { caseSensitive: false }), true);
  });

  it('case-SENSITIVE (salvage): a case-mismatched name does NOT match', () => {
    const item = { name: 'iron ingot' };
    const component = { id: 'c1', name: 'Iron Ingot' };
    assert.equal(matchComponentByName(item, component, { caseSensitive: true }), false);
  });

  it('case-SENSITIVE: an exact-case name DOES match', () => {
    const item = { name: 'Iron Ingot' };
    const component = { id: 'c1', name: 'Iron Ingot' };
    assert.equal(matchComponentByName(item, component, { caseSensitive: true }), true);
  });

  it('both names must be truthy — an empty/absent item name never matches', () => {
    const component = { id: 'c1', name: 'Iron Ingot' };
    assert.equal(matchComponentByName({ name: '' }, component, { caseSensitive: false }), false);
    assert.equal(matchComponentByName({}, component, { caseSensitive: false }), false);
    assert.equal(
      matchComponentByName({ name: 'Iron Ingot' }, { id: 'c1', name: '' }, { caseSensitive: false }),
      false
    );
  });
});

describe('findComponentByName — list form preserves case-sensitivity (issue 540)', () => {
  const components = [
    { id: 'c1', name: 'Charcoal' },
    { id: 'c2', name: 'Iron Ingot' },
  ];

  it('case-INSENSITIVE: returns the first name-matching component regardless of case', () => {
    const matched = findComponentByName({ name: 'IRON INGOT' }, components, {
      caseSensitive: false,
    });
    assert.equal(matched?.id, 'c2');
  });

  it('case-SENSITIVE: a case-mismatched name resolves to nothing', () => {
    const matched = findComponentByName({ name: 'iron ingot' }, components, {
      caseSensitive: true,
    });
    assert.equal(matched, null);
  });

  it('returns null when nothing matches, and never warns', () => {
    const matched = findComponentByName({ name: 'Mithril' }, components, { caseSensitive: false });
    assert.equal(matched, null);
    assert.equal(warnCalls.length, 0, 'no name-only match ⇒ no telemetry');
  });
});

describe('name-only telemetry — warn-once + fires only on a name match (issue 540)', () => {
  it('warns exactly once for a repeated name-only match (dedup guard)', () => {
    const item = { name: 'Iron Ingot' };
    const component = { id: 'c1', name: 'Iron Ingot' };

    matchComponentByName(item, component, { caseSensitive: false, systemId: 'sys-a' });
    matchComponentByName(item, component, { caseSensitive: false, systemId: 'sys-a' });
    matchComponentByName(item, component, { caseSensitive: false, systemId: 'sys-a' });

    assert.equal(warnCalls.length, 1, 'the warn-once guard collapses repeats to one line');
    assert.match(warnCalls[0], /name-only match/);
    assert.match(warnCalls[0], /Iron Ingot/);
    assert.match(warnCalls[0], /sys-a/);
    assert.match(warnCalls[0], /issue 540/);
  });

  it('does NOT warn when the name does not match', () => {
    matchComponentByName({ name: 'Iron Ingot' }, { id: 'c1', name: 'Charcoal' });
    assert.equal(warnCalls.length, 0);
  });

  it('warns again after the telemetry state is reset (resettable seam)', () => {
    const item = { name: 'Iron Ingot' };
    const component = { id: 'c1', name: 'Iron Ingot' };

    matchComponentByName(item, component);
    assert.equal(warnCalls.length, 1);

    resetNameOnlyMatchTelemetry();
    matchComponentByName(item, component);
    assert.equal(warnCalls.length, 2, 'reset clears the dedup set so the next match warns again');
  });

  it('warns separately for distinct (system, component, item) matches', () => {
    matchComponentByName({ name: 'Iron Ingot' }, { id: 'c1', name: 'Iron Ingot' }, {
      systemId: 'sys-a',
    });
    matchComponentByName({ name: 'Iron Ingot' }, { id: 'c1', name: 'Iron Ingot' }, {
      systemId: 'sys-b',
    });
    assert.equal(warnCalls.length, 2, 'a different system id is a distinct name-only match');
  });
});

describe('findMatchingComponent — name fallback still fires (behaviour-preserving, issue 540)', () => {
  it('name-matches an UNFLAGGED item and emits one telemetry line', () => {
    const components = [{ id: 'c2', name: 'Iron Ingot', essences: {} }];
    const item = { name: 'Iron Ingot' }; // no identity flag, no source refs
    const matched = findMatchingComponent(item, components, 'sys-a');
    assert.equal(matched?.id, 'c2');
    assert.equal(warnCalls.length, 1, 'a name-only inventory match is surfaced once');
  });

  it('does NOT reach name matching (or telemetry) when a durable flag resolves', () => {
    const components = [{ id: 'c2', name: 'Iron Ingot', essences: {} }];
    // A legacy `flags.fabricate.componentId` scalar naming c2 resolves durably.
    const item = roleItem({ name: 'Iron Ingot', componentId: 'c2' });
    const matched = findMatchingComponent(item, components, 'sys-a');
    assert.equal(matched?.id, 'c2', 'the durable componentId flag resolves it');
    assert.equal(warnCalls.length, 0, 'durable resolution ⇒ no name-only telemetry');
  });
});

// ---------------------------------------------------------------------------
// Caller-level arg-wiring guards (issue 540 review). The helper-level tests above
// prove the primitive respects `caseSensitive`; these prove each CALL SITE passes the
// RIGHT value. They are constructed to FAIL if a future edit flipped the argument:
// the salvage caller to case-insensitive, or a recipe caller to case-sensitive.
// ---------------------------------------------------------------------------

describe('CraftingEngine._findComponentItems — salvage stays CASE-SENSITIVE end-to-end (issue 540)', () => {
  // A component with NO source refs so `_findComponentItems` skips the byUuid tier and
  // reaches the name fallback (the only path exercising the caseSensitive argument).
  const component = { id: 'comp-iron', name: 'Iron Ingot' };
  const system = { id: 'sys-a', components: [component] };
  const engine = new CraftingEngine(null);

  it('does NOT select a name that differs only by CASE (would match if flipped to insensitive)', () => {
    const actor = {
      items: [
        { name: 'iron ingot', uuid: 'Item.lower' },
        { name: 'IRON INGOT', uuid: 'Item.upper' },
      ],
    };
    const matched = engine._findComponentItems(actor, component, system);
    assert.deepEqual(
      matched,
      [],
      'case-sensitive salvage must reject case-mismatched names — flipping to caseSensitive:false would return both items'
    );
  });

  it('selects only the EXACT-case item when both exact and mismatched are present', () => {
    const exact = { name: 'Iron Ingot', uuid: 'Item.exact' };
    const actor = { items: [{ name: 'iron ingot', uuid: 'Item.lower' }, exact] };
    const matched = engine._findComponentItems(actor, component, system);
    assert.equal(matched.length, 1, 'only the exact-case item matches');
    assert.equal(matched[0].uuid, 'Item.exact');
  });
});

describe('RecipeManager.toolMatchesItem — recipe presence stays CASE-INSENSITIVE end-to-end (issue 540)', () => {
  function installSystem(systemId, tools) {
    const mgr = new CraftingSystemManager({
      getRecipes: () => [],
      deleteRecipe: async () => {},
      updateRecipe: async () => {},
    });
    mgr.initialized = true;
    mgr.save = async () => {};
    mgr.systems = new Map([[systemId, { id: systemId, tools }]]);
    globalThis.game.fabricate = { getCraftingSystemManager: () => mgr };
    return mgr;
  }

  it('name-matches a tool whose name differs only by CASE (would fail if flipped to sensitive)', () => {
    const systemId = 'sysA';
    // Tool carries a source ref the owned item does NOT share, so resolution falls to the
    // snapshot-name fallback — the only path exercising the caseSensitive argument.
    installSystem(systemId, [tool('tool-axe', { originItemUuid: 'Item.axe-src', name: 'Axe' })]);
    const rm = new RecipeManager();
    const recipe = { id: 'r1', craftingSystemId: systemId };
    const t = rm._getSystemTools(recipe)[0];
    const lowerCaseItem = roleItem({ uuid: 'Item.unrelated', name: 'axe' });

    assert.equal(
      rm.toolMatchesItem(recipe, t, lowerCaseItem),
      true,
      'case-insensitive presence must accept "axe" vs "Axe" — flipping to caseSensitive:true would return false'
    );
  });
});
