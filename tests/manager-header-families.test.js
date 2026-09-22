/**
 * Which header-action branch every manager route selects, and which family owns it (issue 1720).
 *
 * `LADDER` is transcribed from the shell's own 26-branch chain as it stood before the extraction,
 * so it is an oracle rather than a re-reading of the source it checks. The observed answer is
 * evaluated out of the shipped markup, so moving a branch into another file, reordering one, or
 * changing a predicate is visible here even though the rendered DOM of any one route is not.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { parseModule } from './helpers/moduleAst.js';
import { createSvelteModuleCompiler } from './helpers/compile-svelte-module.js';
import {
  CHECKS_REDIRECT_VIEW,
  CHECKS_VIEWS,
  isChecksRoute,
} from '../src/ui/svelte/apps/manager/checks/checksNav.js';

const repoRoot = resolve(import.meta.dirname, '..');
const MANAGER = 'src/ui/svelte/apps/manager';
const ROOT = `${MANAGER}/CraftingSystemManagerRoot.svelte`;
const HEADER_MODEL = `${MANAGER}/headerModel.svelte.js`;

/** The file holding the ladder's first branch, and the chain each family arm dispatches into. */
const ACTIONS_FILE = ROOT;
const FAMILY_CHAINS = Object.freeze({});

/** The route lists the shell's own predicates are built from. */
const WORLD_SCOPED_VIEWS = [
  'world-components',
  'world-component-entry',
  'world-essences',
  'world-essence-entry',
  'world-tools',
  'world-tool-entry',
  'world-vocabulary',
];
const WORLD_RULES_VIEWS = ['world-currency', 'world-prerequisites', 'world-modifiers'];

/** The gate the action group renders behind at all; `none` is the family of everything it hides. */
const VISIBLE =
  "(currentView !== 'tools' && currentView !== 'tool-edit' && !isWorldRulesRoute && " +
  "!isWorldScopedRoute) || currentView === 'world-essences' || " +
  "currentView === 'world-essence-entry' || currentView === 'world-tool-entry' || " +
  "currentView === 'world-component-entry'";

/**
 * The shipped chain, in order, with the family that owns each branch. `default` is the trailing
 * `{:else}`, which every route the branches above miss falls into.
 */
const LADDER = Object.freeze(
  [
    ["currentView === 'world-essence-entry'", 'world'],
    ["currentView === 'world-tool-entry'", 'world'],
    ["currentView === 'world-component-entry'", 'world'],
    ["currentView === 'world-essences'", 'world'],
    ["currentView === 'world-downtime'", 'world'],
    ["currentView === 'recipes'", 'crafting'],
    ["currentView === 'recipe-edit'", 'crafting'],
    ["currentView === 'recipe-item-edit'", 'crafting'],
    ["currentView === 'components'", 'crafting'],
    ["currentView === 'knowledge'", 'crafting'],
    ["currentView === 'component-edit'", 'crafting'],
    ["currentView === 'tags'", 'crafting'],
    ['isChecksRoute', 'crafting'],
    ["currentView === 'essences'", 'crafting'],
    ["currentView === 'essence-edit'", 'crafting'],
    ["currentView === 'environments' && displayedGatheringTab === 'tasks'", 'gathering'],
    ["currentView === 'environments' && displayedGatheringTab === 'encounters'", 'gathering'],
    ["currentView === 'world'", 'world'],
    ["isWorldTravelRoute && worldTravelTab === 'realms'", 'world'],
    ['isWorldTravelRoute', 'world'],
    ["currentView === 'environments'", 'gathering'],
    ["currentView === 'environment-edit'", 'gathering'],
    ["currentView === 'gathering-task-edit'", 'gathering'],
    ["currentView === 'gathering-event-edit'", 'gathering'],
    ["currentView === 'system-edit'", 'world'],
    ['default', 'world'],
  ].map(([id, family]) => Object.freeze({ id, family }))
);

const FAMILIES = Object.freeze(['world', 'crafting', 'gathering', 'none']);

// ── Evaluating one predicate ───────────────────────────────────────────────────────────────────

/** The shipped predicates use these five node types and nothing else; anything more is a change. */
function evaluateNode(node, scope) {
  if (node.type === 'Literal') return node.value;
  if (node.type === 'Identifier') {
    assert.ok(Object.hasOwn(scope, node.name), `the ladder reads ${node.name}, which is unmodelled`);
    return scope[node.name];
  }
  if (node.type === 'MemberExpression' && !node.computed) {
    return evaluateNode(node.object, scope)?.[node.property.name];
  }
  if (node.type === 'UnaryExpression' && node.operator === '!') {
    return !evaluateNode(node.argument, scope);
  }
  if (node.type === 'LogicalExpression') {
    const left = evaluateNode(node.left, scope);
    if (node.operator === '&&') return left ? evaluateNode(node.right, scope) : left;
    return left ? left : evaluateNode(node.right, scope);
  }
  if (node.type === 'BinaryExpression') {
    const left = evaluateNode(node.left, scope);
    const right = evaluateNode(node.right, scope);
    if (node.operator === '===') return left === right;
    if (node.operator === '!==') return left !== right;
  }
  throw new Error(`the ladder now uses ${node.type} ${node.operator ?? ''}, which is not modelled`);
}

function evaluate(expression, scope) {
  const { ast } = parseModule(`(${expression});`);
  return evaluateNode(ast.body[0].expression, scope);
}

// ── Reading the chain out of the shipped markup ────────────────────────────────────────────────

const BLOCK_SOURCE = String.raw`\{#(if|each|key|await|snippet)\b|\{\/(if|each|key|await|snippet)\}|\{:else\s+if\b|\{:else\}`;

/** The index of the `}` closing the block tag that opens at `start`. */
function closingBrace(source, start) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error('a block tag never closes');
}

/**
 * Every `{#if}` chain in one component, as its ordered branch expressions with `default` for the
 * trailing `{:else}`. The scan is over block tags rather than lines, so re-indentation, wrapping
 * and the anchor comments a split chain adds are all invisible to it.
 */
function chainsOf(source) {
  const block = new RegExp(BLOCK_SOURCE, 'g');
  const stack = [];
  const chains = [];
  for (let hit = block.exec(source); hit; hit = block.exec(source)) {
    const [token, opened, closed] = hit;
    if (closed) {
      const frame = stack.pop();
      if (frame?.tag === 'if') chains.push(Object.freeze(frame.branches));
      continue;
    }
    if (token === '{:else}') {
      stack.at(-1)?.branches.push('default');
      continue;
    }
    const close = closingBrace(source, hit.index);
    const expression = source.slice(hit.index + token.length, close).trim();
    if (opened) stack.push({ tag: opened, branches: [expression] });
    else stack.at(-1)?.branches.push(expression);
    block.lastIndex = close + 1;
  }
  return chains;
}

const sourceOf = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

/** The one chain in `path` whose first branch is `anchor`. */
function chainStarting(path, anchor) {
  const found = chainsOf(sourceOf(path)).filter((branches) => branches[0] === anchor);
  assert.equal(found.length, 1, `${path} holds ${found.length} chains starting \`${anchor}\``);
  return found[0];
}

const FAMILY_ARM = /^header\.actionsFamily === '(\w+)'$/;

/** The branch the shipped markup selects, following a family arm into the file that owns it. */
function selectedBranch(scope) {
  if (!evaluate(VISIBLE, scope)) return 'none';
  let branches = chainStarting(ACTIONS_FILE, LADDER[0].id);
  for (let hop = 0; hop < 2; hop += 1) {
    const chosen = branches.find((branch) => branch === 'default' || evaluate(branch, scope));
    assert.ok(chosen, 'the action chain selected nothing, so it has no trailing else');
    const arm = FAMILY_ARM.exec(chosen);
    if (!arm) return chosen;
    const target = FAMILY_CHAINS[arm[1]];
    assert.ok(target, `the chain dispatches to the ${arm[1]} family, which names no chain`);
    branches = chainStarting(target.file, target.anchor);
  }
  throw new Error('the family arms nest more than once');
}

// ── The routes and the flags a route does not determine ────────────────────────────────────────

/** Every route token the shell branches on, plus the Checks views its own predicate answers for. */
function routeTokens() {
  const files = [ROOT, ACTIONS_FILE, ...Object.values(FAMILY_CHAINS).map((chain) => chain.file)];
  const views = new Set([CHECKS_REDIRECT_VIEW, ...CHECKS_VIEWS]);
  for (const file of new Set(files)) {
    for (const [, view] of sourceOf(file).matchAll(/currentView === '([a-z-]+)'/g)) views.add(view);
  }
  return [...views].sort();
}

/** The three flags the ladder reads that `currentView` does not determine. */
const TAB_CASES = Object.freeze([
  Object.freeze({ worldTravelTab: 'realms', displayedGatheringTab: 'tasks' }),
  Object.freeze({ worldTravelTab: 'realms', displayedGatheringTab: 'encounters' }),
  Object.freeze({ worldTravelTab: 'map', displayedGatheringTab: 'environments' }),
]);

function scopeFor(currentView, tabs, actionsFamily) {
  return {
    currentView,
    displayedGatheringTab: tabs.displayedGatheringTab,
    worldTravelTab: tabs.worldTravelTab,
    isChecksRoute: isChecksRoute(currentView),
    isWorldRulesRoute: WORLD_RULES_VIEWS.includes(currentView),
    isWorldScopedRoute: WORLD_SCOPED_VIEWS.includes(currentView),
    isWorldTravelRoute: currentView === 'world-travel',
    header: { actionsFamily },
  };
}

/** The oracle: the first branch of the pre-extraction chain whose predicate holds. */
function oracleBranch(scope) {
  if (!evaluate(VISIBLE, scope)) return 'none';
  const row = LADDER.find((entry) => entry.id === 'default' || evaluate(entry.id, scope));
  return row.id;
}

const familyOf = (branch) => LADDER.find((entry) => entry.id === branch)?.family ?? 'none';

describe('the manager page header routes every view to one action family', () => {
  let compiler;
  let createHeaderModel;

  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-header-families-');
    ({ createHeaderModel } = await compiler.loadWithClosure(HEADER_MODEL));
  });

  after(() => {
    compiler.cleanup();
  });

  /** The shipped `actionsFamily`, read off the model the shell builds rather than restated here. */
  function modelFamily(currentView) {
    return createHeaderModel({
      route: {
        currentView: () => currentView,
        isChecksRoute: () => isChecksRoute(currentView),
        isWorldRulesRoute: () => WORLD_RULES_VIEWS.includes(currentView),
        isWorldScopedRoute: () => WORLD_SCOPED_VIEWS.includes(currentView),
      },
      state: {},
    }).actionsFamily;
  }

  it('NON-VACUITY: the oracle, the route set and the shipped chain are all real', () => {
    assert.equal(LADDER.length, 26, 'the pre-extraction chain is 26 branches');
    assert.ok(routeTokens().length >= 30, `the scan found only ${routeTokens().length} routes`);
    assert.ok(
      chainStarting(ACTIONS_FILE, LADDER[0].id).length >= 10,
      'the shipped action chain parsed too few branches to be the ladder'
    );
  });

  it('answers exactly one of the four families for every route', () => {
    for (const currentView of routeTokens()) {
      const family = modelFamily(currentView);
      assert.ok(FAMILIES.includes(family), `${currentView} answers ${family}, which is no family`);
    }
  });

  it('selects the same branch the pre-extraction chain did, on every route and tab', () => {
    const mismatches = [];
    for (const currentView of routeTokens()) {
      for (const tabs of TAB_CASES) {
        const expected = oracleBranch(scopeFor(currentView, tabs, modelFamily(currentView)));
        const observed = selectedBranch(scopeFor(currentView, tabs, modelFamily(currentView)));
        if (observed !== expected) {
          mismatches.push(`${currentView} (${tabs.worldTravelTab}/${tabs.displayedGatheringTab})`);
        }
      }
    }
    assert.deepEqual(mismatches, [], 'these routes no longer reach the branch they shipped with');
  });

  it('hands each route to the family that owns the branch the chain selects', () => {
    const wrong = [];
    for (const currentView of routeTokens()) {
      for (const tabs of TAB_CASES) {
        const family = modelFamily(currentView);
        const owner = familyOf(oracleBranch(scopeFor(currentView, tabs, family)));
        if (owner !== family) wrong.push(`${currentView}: ${family} owns none of its branch`);
      }
    }
    assert.deepEqual(wrong, [], 'a route dispatched to a family that holds no branch for it');
  });

  it('draws no action group at all on the routes the gate hides', () => {
    const hidden = routeTokens().filter(
      (currentView) => !evaluate(VISIBLE, scopeFor(currentView, TAB_CASES[0], 'none'))
    );
    assert.deepEqual(
      hidden,
      [
        'tool-edit',
        'tools',
        'world-components',
        'world-currency',
        'world-modifiers',
        'world-prerequisites',
        'world-tools',
        'world-vocabulary',
      ],
      'the Tool Studio, the three World Rules tabs and the four unre-admitted scoped routes'
    );
    for (const currentView of hidden) {
      assert.equal(modelFamily(currentView), 'none', `${currentView} still claims a family`);
    }
  });
});
