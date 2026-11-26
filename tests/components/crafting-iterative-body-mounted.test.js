/** Issue 3011 (P7) — the iterative recipe's two faces on the player Crafting tab, mounted. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it, before, after, afterEach } from 'node:test';

import { craftability, recipe } from '../helpers/crafting-fixtures.js';
import { assertIdentityHeader, primaryButtons } from '../helpers/playerDetailHeaderAssertions.js';
import {
  createMountedComponentHarness,
  CRAFTING_APP_RAW_MODULES,
  CRAFTING_APP_COMPILED_MODULES,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-iterative-body-',
  rawModules: CRAFTING_APP_RAW_MODULES,
  compiledModules: CRAFTING_APP_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/crafting/RecipeDetail.svelte',
});

const GOAL = Object.freeze({
  succeeds: 'Shape ≥ 100',
  fails: 'Integrity ≤ 0',
  produces: 'Longsword, Blade blank',
});

const WORKPIECE = Object.freeze({
  runId: 'run-7',
  stepIndex: 1,
  stepName: 'Draw out the edge',
  stepCount: 2,
  counters: [
    { counterId: 'shape', label: 'Shape', value: 20 },
    { counterId: 'integrity', label: 'Integrity', value: 8 },
  ],
  nextSession: 4,
});

/** An iterative recipe model; a stale `missingMaterials` status proves the pane states none mid-work. */
const iterative = (workpiece = null, overrides = {}) =>
  recipe({
    id: 'iw-r-longsword',
    name: 'Forge a Longsword',
    modeToken: 'iterative',
    modeLabel: 'Iterative',
    iterative: { goal: GOAL, workpiece },
    ...overrides,
  });

const missing = { browseStatus: 'missingMaterials', blockingReasons: ['Missing materials'] };
const facts = (target) => [...target.querySelectorAll('.fabricate-info-strip-fact')];
const read = (node) => node.textContent.replaceAll(/\s+/gu, ' ').trim();

describe('IterativeRecipeBody — the Crafting tab faces (issue 3011)', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('before a workpiece states the requirements, the goal strip and one Start crafting primary', async () => {
    const started = [];
    const model = iterative();
    const target = await harness.mount({
      recipe: model,
      selectedSetId: model.defaultSetId,
      craftability: craftability(),
      onCraft: () => {
        started.push('start');
      },
    });

    assert.ok(target.querySelector('[data-recipe-detail-mode="iterative"]'));
    assert.ok(target.querySelector('[data-iterative-face="goal"]'));
    assert.ok(target.querySelector('[data-recipe-section="io"]'), 'the requirement table stays');
    const goal = [...target.querySelectorAll('[data-iterative-goal]')];
    assert.deepEqual(
      goal.map((fact) => fact.getAttribute('data-iterative-goal')),
      ['succeeds', 'fails', 'produces']
    );
    assert.match(read(goal[0]), /SucceedsWhen\s*Shape ≥ 100/u);
    assert.match(read(goal[1]), /FailsWhen\s*Integrity ≤ 0/u);
    assert.match(read(goal[2]), /Produces\s*Longsword, Blade blank/u);

    const row = assertIdentityHeader(target, { primaries: 1, name: 'Forge a Longsword' });
    const [primary] = primaryButtons(row);
    assert.ok(primary.hasAttribute('data-crafting-craft'));
    assert.equal(primary.textContent.trim(), 'FABRICATE.App.Crafting.Button.StartCrafting');
    assert.ok(!target.querySelector('[data-crafting-continue]'));
    primary.click();
    assert.deepEqual(started, ['start']);
  });

  it('names Start crafting even after an earlier roll, never Craft another', async () => {
    const target = await harness.mount({
      recipe: iterative(),
      craftability: craftability(),
      rollResult: { success: true, items: [] },
    });
    assert.equal(
      primaryButtons(target)[0].textContent.trim(),
      'FABRICATE.App.Crafting.Button.StartCrafting'
    );
  });

  it('draws only the goal facts the recipe states', async () => {
    const target = await harness.mount({
      recipe: iterative(null, { iterative: { goal: { ...GOAL, fails: '' }, workpiece: null } }),
      craftability: craftability(),
    });
    assert.deepEqual(
      [...target.querySelectorAll('[data-iterative-goal]')].map((fact) =>
        fact.getAttribute('data-iterative-goal')
      ),
      ['succeeds', 'produces']
    );
  });

  it('with a workpiece swaps the primary for Continue in Journal and the body for one strip', async () => {
    const started = [];
    const opened = [];
    const target = await harness.mount({
      recipe: iterative(WORKPIECE, missing),
      craftability: craftability({ canCraft: false }),
      onCraft: () => {
        started.push('start');
      },
      onContinue: (runId) => {
        opened.push(runId);
      },
      authorityRefusal: 'No GM is connected.',
    });

    const row = assertIdentityHeader(target, { primaries: 1 });
    const [primary] = primaryButtons(row);
    assert.ok(primary.hasAttribute('data-crafting-continue'));
    assert.ok(!primary.hasAttribute('data-crafting-craft'));
    assert.equal(primary.textContent.trim(), 'FABRICATE.App.Crafting.Button.ContinueInJournal');
    assert.ok(Boolean(primary.querySelector('i.fa-book-open')));
    assert.ok(!target.querySelector('[data-crafting-craft]'), 'never both labels');
    primary.click();
    assert.deepEqual(opened, ['run-7'], 'the press opens that run, and only that');
    assert.deepEqual(started, [], 'and starts nothing');

    const strip = target.querySelector('[data-iterative-workpiece="run-7"]');
    assert.ok(Boolean(strip));
    assert.match(read(strip), /Iterative\.InProgress/u);
    assert.deepEqual(
      facts(strip).map((fact) => read(fact)),
      ['Shape 20', 'Integrity 8', 'FABRICATE.App.Crafting.Iterative.NextSession 4']
    );
    assert.ok(!target.querySelector('[data-iterative-goal-strip]'), 'the goal is not repeated');
  });

  it('with a workpiece states no shortfall, status, scrim, blocker or roll result', async () => {
    const target = await harness.mount({
      recipe: iterative(WORKPIECE, missing),
      craftability: craftability({ canCraft: false }),
      authorityRefusal: 'No GM is connected.',
      rollResult: { success: true, items: [] },
    });
    for (const selector of [
      '.crafting-detail-thumb-scrim',
      '.crafting-detail-pip',
      '[data-crafting-status]',
      '[data-recipe-blocking]',
      '[data-recipe-section="io"]',
      '[data-recipe-section="roll-result"]',
    ]) {
      assert.ok(!target.querySelector(selector), `no ${selector}`);
    }
  });

  it('omits the next session once the step has ended', async () => {
    const boundary = { ...WORKPIECE, nextSession: null, counters: [WORKPIECE.counters[0]] };
    const target = await harness.mount({ recipe: iterative(boundary), craftability: null });
    assert.deepEqual(
      facts(target).map((fact) => read(fact)),
      ['Shape 20']
    );
  });

  it('keeps a redacted teaser to its header, with no face', async () => {
    const target = await harness.mount({
      recipe: iterative(WORKPIECE, { redaction: { redacted: true, hiddenFields: [] } }),
      craftability: null,
    });
    assert.ok(!target.querySelector('[data-iterative-face]'));
    assert.ok(!target.querySelector('[data-crafting-continue]'));
  });
});
