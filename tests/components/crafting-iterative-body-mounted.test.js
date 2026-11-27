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
  // The player window hosts the Crafting tab, so a roll's origin resolves to it.
  rootClass: 'fabricate-app',
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
/** The workpiece strip's kicker, its nested `key:{json}` stub output unescaped. */
const kickerOf = (target) =>
  read(
    target.querySelector('[data-iterative-workpiece]').querySelector('.fabricate-info-strip-head')
  ).replaceAll('\\', '');
const SESSION_NEXT = 'FABRICATE.App.Journal.Iterative.Meta.SessionNext';

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
      ['Shape 20', 'Integrity 8', `${SESSION_NEXT}:{"session":4}`]
    );
    const session = strip.querySelector('[data-iterative-next-session]');
    assert.ok(!session.querySelector('i'), 'the session fact carries no glyph');
    assert.ok(!session.querySelector('.fabricate-info-strip-label'), 'and no label');
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

  it('names the step by number and name on a multi-step recipe, else by its name alone', async () => {
    const cases = [
      [{}, (text) => /StepNamed.*"index":2,"name":"Draw out the edge"/u.test(text)],
      [
        { stepCount: 1 },
        (text) => text.includes('"step":"Draw out the edge"') && !text.includes('StepNamed'),
      ],
      [{ stepName: '' }, (text) => /InProgress:.*StepNumbered.*"index":2/u.test(text)],
      [
        { stepName: '', stepCount: 1 },
        (text) => text === 'FABRICATE.App.Crafting.Iterative.InProgressBare',
      ],
    ];
    for (const [overrides, expected] of cases) {
      const target = await harness.mount({
        recipe: iterative({ ...WORKPIECE, ...overrides }),
        craftability: null,
      });
      assert.ok(expected(kickerOf(target)), `${JSON.stringify(overrides)}: ${kickerOf(target)}`);
      harness.remount();
    }
  });

  it('draws the goal face with no goal strip when the recipe states no goal', async () => {
    const target = await harness.mount({
      recipe: iterative(null, {
        iterative: { goal: { succeeds: '', fails: '', produces: '' }, workpiece: null },
      }),
      craftability: craftability(),
    });
    assert.ok(target.querySelector('[data-iterative-face="goal"]'));
    assert.ok(!target.querySelector('[data-iterative-goal-strip]'));
  });

  it('draws each visible counter on the workpiece face', async () => {
    const target = await harness.mount({ recipe: iterative(WORKPIECE), craftability: null });
    assert.ok(target.querySelector('[data-iterative-face="workpiece"]'));
    assert.equal(read(target.querySelector('[data-iterative-counter="shape"]')), 'Shape 20');
  });

  it('reads the live craftability before a workpiece, and draws no roll result', async () => {
    const target = await harness.mount({
      recipe: iterative(),
      craftability: craftability({
        canCraft: false,
        ingredientStates: [
          {
            componentId: 'c-qzx',
            name: 'Qzx Bar',
            img: '',
            description: '2x Qzx Bar',
            need: 2,
            have: 0,
            satisfied: false,
          },
        ],
      }),
      rollResult: { success: true, items: [] },
    });
    assert.match(read(target.querySelector('[data-recipe-section="io"]')), /Qzx Bar/u);
    assert.ok(
      !target.querySelector('[data-recipe-section="roll-result"]'),
      'the outcome is the Journal’s'
    );
  });

  it('keeps Continue idle while a craft is in flight', async () => {
    const target = await harness.mount({
      recipe: iterative(WORKPIECE),
      craftability: null,
      busy: true,
    });
    const [primary] = primaryButtons(target);
    assert.ok(primary.hasAttribute('data-crafting-continue'));
    assert.ok(!primary.hasAttribute('aria-busy'));
    assert.ok(!primary.querySelector('i.fa-spinner'));
    assert.match(primary.textContent, /ContinueInJournal/u);
  });

  it('opens the Journal with no roll origin, where Start crafting takes the window', async () => {
    const { activeRollPromptOrigin } = await harness.loadRawModule(
      'src/ui/svelte/util/rollPromptOrigin.js'
    );
    const seen = [];
    let target = await harness.mount({
      recipe: iterative(WORKPIECE),
      craftability: null,
      onContinue: () => {
        seen.push(['continue', activeRollPromptOrigin()]);
      },
    });
    primaryButtons(target)[0].click();
    harness.remount();
    target = await harness.mount({
      recipe: iterative(),
      craftability: craftability(),
      onCraft: () => {
        seen.push(['start', activeRollPromptOrigin()]);
      },
    });
    primaryButtons(target)[0].click();
    assert.equal(seen.length, 2);
    assert.deepEqual(seen[0], ['continue', null]);
    assert.equal(seen[1][0], 'start');
    assert.ok(seen[1][1] === target, 'a start rolls from the window it was pressed in');
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
