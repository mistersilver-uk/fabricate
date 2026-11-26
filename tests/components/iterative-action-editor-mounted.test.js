/**
 * The Crafting Action editor, mounted over the real route model and library section (issue 3009):
 * its five cards, staged edits and Save, the field marks against the readiness evaluation, Check,
 * Costs, Effects, categories, and the delete confirmation.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync, mount, tick, unmount } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { writable } from 'svelte/store';

import {
  evaluateIterativeReadiness,
  ITERATIVE_READINESS_CODES,
} from '../../src/systems/iterative/iterativeReadiness.js';
import { iterativeLibraryEntry } from '../../src/systems/normalize/iterativeLibrary.js';
import { createIterativeLibrarySection } from '../../src/ui/svelte/stores/adminIterativeLibrarySection.js';
import { chooseSelectOption } from '../helpers/select-control.js';

import { disposeManagerSuite, managerComponent, managerModule } from './manager-mounted-shared.js';

const VIEW = 'src/ui/svelte/apps/manager/iterative/ActionEditorView.svelte';
const MODEL = 'src/ui/svelte/apps/manager/iterative/iterativeRouteModel.svelte.js';

const counter = (id, label) => ({ id, label, limit: 'none' });
const effect = (id, extra = {}) => ({
  id,
  when: { combine: 'all' },
  target: { kind: 'counter', counterId: 'heat' },
  op: 'add',
  amount: '1',
  ...extra,
});
const action = (id, label, extra = {}) => ({
  id,
  label,
  categories: [],
  usesSession: true,
  availability: { combine: 'all', rules: [] },
  costs: [],
  check: 'none',
  effects: [],
  ...extra,
});
const LIBRARY = Object.freeze({
  version: 1,
  counters: [counter('heat', 'Heat'), counter('temper', 'Temper')],
  actions: [
    action('strike', 'Strike', {
      categories: ['Forging'],
      check: 'roll',
      costs: [{ id: 'spend', counterId: 'heat', amount: '1', needsEnough: true }],
      effects: [
        effect('shape', { name: 'Shape', target: { kind: 'counter', counterId: 'temper' } }),
      ],
    }),
    action('quench', 'Quench', { categories: ['Fire'], usesSession: false }),
    action('chain', 'Chain <i>x</i>', {
      availability: {
        combine: 'all',
        rules: [{ source: 'previousAction', actionIds: ['strike'] }],
      },
    }),
  ],
});
const HIT = {
  type: 'fixed',
  rollFormula: '1d20',
  fixedOutcomes: [{ id: 'hit', name: 'Hit', success: true, start: 10 }],
};
const RECIPES = [
  {
    id: 'r-blade',
    name: 'Blade',
    iterative: { counters: [{ counterId: 'heat', start: 0 }] },
    steps: [
      {
        name: 'Forge',
        iterative: {
          actions: { mode: 'only', actionIds: ['strike'] },
          success: [{ source: 'counter', counterId: 'heat', op: '>=', value: 3 }],
        },
      },
    ],
  },
];

let View;
let createRoute;
let mounted;
let target;
let ctx;

/** `runs` are the active runs the services report, watched as the mounted header watches them. */
function makeRoute({ library = LIBRARY, routed = HIT, answer = true, runs = null } = {}) {
  const calls = { updates: [], views: [], dialogs: [] };
  const live = new SvelteMap([
    [
      'system',
      {
        id: 'ironworks',
        name: 'Ironworks',
        resolutionMode: 'iterative',
        craftingCheck: { routed },
        iterative: structuredClone(library),
      },
    ],
  ]);
  const services = {
    notify: { error: () => {} },
    confirmDialog: async (config) => {
      calls.dialogs.push(config);
      return answer;
    },
    getRecipeManager: () => ({ getRecipes: () => RECIPES }),
    ...(runs && { getActiveIterativeRuns: () => runs }),
    getCraftingSystemManager: () => ({
      getSystem: () => live.get('system'),
      updateSystem: async (id, patch) => {
        calls.updates.push([id, structuredClone(patch)]);
        live.set('system', { ...live.get('system'), ...iterativeLibraryEntry(patch.iterative) });
      },
    }),
  };
  const section = createIterativeLibrarySection({
    services,
    selectedSystemId: writable('ironworks'),
    refresh: async () => {},
    confirmDiscardDirty: async () => 'discard',
  });
  if (runs) section.watchActiveRuns(true);
  const route = createRoute({
    store: () => ({ iterative: section }),
    selectedSystem: () => live.get('system'),
    currentView: () => 'iterative-action-edit',
    viewState: () => live.get('system'),
    setView: (view, onEnter) => {
      calls.views.push(view);
      onEnter?.();
    },
    services: () => services,
    text: (_key, fallback) => fallback,
  });
  return { route, calls, live };
}

async function openEditor(id, options = {}) {
  ctx = makeRoute(options);
  if (id) ctx.route.openAction(id);
  else ctx.route.startNewAction();
  target = document.createElement('div');
  target.className = 'fabricate-manager';
  document.body.appendChild(target);
  mounted = mount(View, {
    target,
    props: { route: ctx.route, text: (_key, fallback) => fallback },
  });
  await settle();
  return ctx;
}

const settle = async () => {
  await tick();
  flushSync();
  await tick();
};
const $ = (selector) => target.querySelector(selector);
const $$ = (selector) => [...target.querySelectorAll(selector)];
async function type(selector, value) {
  const input = $(selector);
  assert.ok(Boolean(input), `${selector} is not on the page`);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
}
async function press(selector) {
  const control = $(selector);
  assert.ok(Boolean(control), `${selector} is not on the page`);
  control.click();
  await settle();
}
const marks = () => $$('[data-issue-code]').map((mark) => mark.dataset.issueCode);

/** The readiness the editor must agree with: the system with `route.actionDraft` standing for its action. */
function expectedIssues() {
  const { route, live } = ctx;
  const system = live.get('system');
  const draft = $state_snapshot(route.actionDraft);
  const actions = system.iterative.actions.map((held) => (held.id === draft.id ? draft : held));
  return evaluateIterativeReadiness(
    { ...system, iterative: { ...system.iterative, actions } },
    RECIPES
  ).filter((issue) => issue.entityKind === 'action' && issue.entityId === draft.id);
}
const $state_snapshot = (value) => JSON.parse(JSON.stringify(value));

describe('the Crafting Action editor (issue 3009)', () => {
  before(async () => {
    View = await managerComponent(VIEW);
    ({ createIterativeRouteModel: createRoute } = await managerModule(MODEL));
  });

  afterEach(async () => {
    if (mounted) unmount(mounted);
    mounted = null;
    target?.remove();
    target = null;
    await new Promise((resolve) => setImmediate(resolve));
  });

  after(disposeManagerSuite);

  it('draws the five cards in the prototype order with the action as saved', async () => {
    await openEditor('strike');
    assert.deepEqual(
      $$('[data-iterative-section]').map((card) => card.dataset.iterativeSection),
      ['identity', 'taken', 'costs', 'check', 'effects']
    );
    assert.equal($('[data-iterative-action-label]').value, 'Strike');
    assert.equal($('[data-iterative-uses-session]').getAttribute('aria-pressed'), 'true');
    assert.equal($$('[data-iterative-cost]').length, 1);
    assert.equal($('[data-iterative-effect="shape"] [data-iterative-effect-name]').value, 'Shape');
    assert.ok(!$('[data-iterative-blocking-notice]'), 'a ready action draws no alert');
    assert.ok(!$('[data-iterative-unsupported-notice]'));
  });

  it('edits a staged copy: nothing is written until Save, and Save writes the normalized action', async () => {
    const { route, calls } = await openEditor('strike');
    await type('[data-iterative-action-label]', ' Strike hard ');
    await type('[data-iterative-action-description]', 'Hit it.');
    assert.equal(route.isActionDirty, true);
    assert.equal(calls.updates.length, 0, 'editing writes nothing');
    assert.equal(await route.saveAction(), true);
    assert.equal(calls.updates.length, 1);
    const saved = calls.updates[0][1].iterative.actions.find((held) => held.id === 'strike');
    assert.equal(saved.label, 'Strike hard');
    assert.equal(saved.description, 'Hit it.');
    assert.equal(route.isActionDirty, false);
  });

  it('drops an emptied description and keeps the key set the normalizer writes', async () => {
    const { route } = await openEditor('strike');
    await type('[data-iterative-action-description]', 'Hit it.');
    await type('[data-iterative-action-description]', ' '.repeat(3));
    assert.ok(!('description' in route.actionDraft));
    assert.equal(route.isActionDirty, false, 'an emptied optional key matches the baseline');
  });

  // One draft per action-scoped readiness code, each edited through the editor's own seam.
  const CODES = {
    iterativeUnknownCounter: (d) => {
      d.costs[0].counterId = 'ore';
    },
    iterativeInvalidExpression: (d) => {
      d.costs[0].amount = '2 +';
    },
    iterativeExplodeUnbounded: (d) => {
      d.effects[0].amount = '1d6x>=1';
    },
    iterativeInvalidRule: (d) => {
      d.availability.rules = [{ source: 'counter' }];
    },
    iterativeUnknownAction: (d) => {
      d.availability.rules = [{ source: 'previousAction', actionIds: ['ghost'] }];
    },
    iterativeInvalidEntry: (d) => {
      d.costs[0].id = 'Bad id';
    },
    iterativeUnknownCheckOutcome: (d) => {
      d.effects[0].when = { combine: 'all', checkOutcomeIds: ['ghost'] };
    },
    iterativeCheckFactWithoutCheck: (d) => {
      d.check = 'none';
      d.effects[0].when = { combine: 'all', success: true };
    },
  };

  for (const [code, change] of Object.entries(CODES)) {
    it(`agrees with the readiness evaluation on ${code}`, async () => {
      const { route, calls } = await openEditor('strike');
      route.editAction(change);
      await settle();
      const expected = expectedIssues();
      assert.deepEqual(
        expected.map((issue) => issue.code),
        [code],
        'the draft raises exactly the code under test'
      );
      const blocking = expected.filter((issue) => issue.severity === 'critical');
      assert.equal(route.actionHeading.issueCount, blocking.length, 'the pill counts the critical');
      const notice = $('[data-iterative-blocking-notice]');
      if (blocking.length === 0) assert.ok(!notice, 'a warning draws no blocking Notice');
      else assert.equal(notice.dataset.issueCount, String(blocking.length));
      assert.deepEqual([...new Set(marks())], [code], 'every mark carries the one code');
      const warning = expected[0].severity === 'warning';
      assert.equal($(`[data-issue-code="${code}"]`).classList.contains('is-warning'), warning);
      assert.equal(calls.updates.length, 0, 'editing without saving writes nothing');
    });
  }

  it('covers every action-scoped readiness code, so a new one fails here', () => {
    const recipeOrSystem = [
      'iterativeNoCounters',
      'iterativeNoSuccessRule',
      'iterativeInvalidNumber',
      'iterativeBoundsInverted',
      'iterativeStartOutOfBounds',
      'iterativeNoAllowedActions',
      'iterativeCheckUnavailable',
      'iterativeMultiStepOff',
      'iterativeSuccessLineOnFailureGroup',
      'iterativeFinalStepProducesNothing',
      'iterativeVersionUnsupported',
      'iterativeExpressionBoundUnset',
    ];
    assert.deepEqual(
      new Set([...Object.keys(CODES), ...recipeOrSystem]),
      new Set(ITERATIVE_READINESS_CODES)
    );
  });

  it('reads Ready, with no blocking Notice, for a no-check action whose effect reads the check', async () => {
    const library = structuredClone(LIBRARY);
    library.actions[1].effects = [effect('glow', { amount: '@check.value' })];
    const { route } = await openEditor('quench', { library });
    assert.equal(route.actionHeading.issueCount, 0, 'Ready');
    assert.ok(!$('[data-iterative-blocking-notice]'));
    await press('[data-iterative-effect="glow"] [data-sortable-disclosure]');
    const mark = $(
      '[data-iterative-effect="glow"] [data-issue-code="iterativeCheckFactWithoutCheck"]'
    );
    assert.ok(mark.classList.contains('is-warning'), 'the mark is a warning');
  });

  it('counts an issue once however many fields carry its mark, so the pill is not the mark count', async () => {
    const { route } = await openEditor('strike');
    route.editAction((d) => {
      d.costs[0].counterId = 'ore';
      d.effects[0].target.counterId = 'ore';
    });
    await settle();
    assert.equal(route.actionHeading.issueCount, 1);
    assert.equal(marks().filter((code) => code === 'iterativeUnknownCounter').length, 2);
  });

  it('still saves an action with blocking issues', async () => {
    const { route, calls } = await openEditor('strike');
    route.editAction((d) => {
      d.costs[0].counterId = 'ore';
    });
    await settle();
    assert.equal(await route.saveAction(), true);
    assert.equal(calls.updates.length, 1);
    assert.equal(calls.updates[0][1].iterative.actions[0].costs[0].counterId, 'ore');
    assert.equal(
      route.actionHeading.issueCount,
      evaluateIterativeReadiness(ctx.live.get('system'), RECIPES).filter(
        (issue) => issue.entityKind === 'action' && issue.entityId === 'strike'
      ).length,
      'after Save the pill equals what Validation reports'
    );
  });

  it('reads the reason a malformed amount fails for, and offers the roots the field admits as tokens', async () => {
    await openEditor('strike');
    await type('[data-iterative-amount="cost"]', '1d6');
    const mark = $('[data-iterative-cost] [data-issue-code="iterativeInvalidExpression"]');
    assert.ok(mark.textContent.includes('Dice cannot be rolled in this field'));
    assert.ok(
      !$('[data-iterative-cost]').textContent.includes('Resolves each attempt'),
      'an amount that does not parse draws no reading'
    );
    const tokens = $$(
      '[data-iterative-cost] .fab-expr-token, [data-iterative-cost] [role="group"] button'
    ).map((token) => token.textContent.trim());
    assert.deepEqual(tokens, ['@sessionCount', '@counter.heat', '@counter.temper']);
    assert.ok(
      !tokens.includes('@check.value'),
      '@check.value is offered to an effect, never to a cost'
    );
  });

  it('adds a cost under a minted id, toggles Needs enough and removes it', async () => {
    const { route } = await openEditor('quench');
    await press('[data-iterative-add-cost]');
    assert.deepEqual(
      route.actionDraft.costs.map((cost) => cost.id),
      ['cost']
    );
    await press('[data-iterative-add-cost]');
    assert.equal(route.actionDraft.costs[1].id, 'cost2');
    assert.ok(
      document.activeElement === $('[data-iterative-cost="cost2"] [data-iterative-amount="cost"]'),
      'adding focuses the new amount'
    );
    await press('[data-iterative-cost="cost"] [data-iterative-cost-needs-enough]');
    assert.equal(route.actionDraft.costs[0].needsEnough, false);
    chooseSelectOption(
      target,
      '[data-iterative-cost="cost2"] [data-iterative-cost-counter]',
      'temper'
    );
    await settle();
    assert.equal(route.actionDraft.costs[1].counterId, 'temper');
    assert.equal(
      $('[data-iterative-cost-remove="cost2"]').getAttribute('aria-label'),
      'Remove Temper cost',
      'each remove names its counter'
    );
    await press('[data-iterative-cost-remove="cost"]');
    assert.deepEqual(
      route.actionDraft.costs.map((cost) => cost.id),
      ['cost2']
    );
    assert.ok(
      document.activeElement === $('[data-iterative-add-cost]'),
      'removing hands focus to the adder'
    );
  });

  it('names each switch in full and ties the session note to its toggle', async () => {
    await openEditor('strike');
    const session = $('[data-iterative-uses-session]');
    assert.ok(session.classList.contains('has-name'), 'a snippet name is drawn uncapped');
    assert.ok(!session.hasAttribute('aria-label'), 'its text names it');
    assert.equal(session.textContent.trim(), 'Uses a session');
    const note = $('[data-iterative-session-note]');
    assert.equal(session.getAttribute('aria-describedby'), note.id);
    assert.ok(note.id.length > 0);
    const needs = $('[data-iterative-cost-needs-enough]');
    assert.ok(needs.classList.contains('has-name'));
    assert.equal(needs.textContent.trim(), 'Needs enough');
  });

  it('describes a marked control by its mark, and names an effect by its place', async () => {
    const { route } = await openEditor('strike');
    route.editAction((d) => {
      d.costs[0].counterId = 'ore';
      d.effects[0].target.counterId = 'ore';
      d.availability.rules = [{ source: 'counter', counterId: 'ore', op: '>=', value: 1 }];
    });
    await settle();
    const describedMark = (selector) => {
      const id = $(selector).getAttribute('aria-describedby') ?? '';
      return target.querySelector(`[id="${id.split(' ', 1)[0]}"]`)?.dataset.issueCode;
    };
    assert.equal(
      describedMark('[data-iterative-cost] [data-iterative-cost-counter]'),
      'iterativeUnknownCounter'
    );
    assert.equal(
      describedMark('[data-iterative-availability] [data-counter-rule-source]'),
      'iterativeUnknownCounter'
    );
    await press('[data-iterative-effect="shape"] [data-sortable-disclosure]');
    const effectCounter = $('[data-iterative-effect="shape"] [data-iterative-effect-counter]');
    assert.equal(effectCounter.getAttribute('aria-invalid'), 'true');
    assert.equal(
      describedMark('[data-iterative-effect="shape"] [data-iterative-effect-counter]'),
      'iterativeUnknownCounter'
    );
    assert.equal(
      $('[data-iterative-effect-name="shape"]').getAttribute('aria-label'),
      'Effect 1 name'
    );
  });

  it('removes an availability rule and hands focus to the adder, naming each remove by its source', async () => {
    await openEditor('strike');
    await press('[data-iterative-availability] [data-rule-row-preset="rule"]');
    const remove = $(
      '[data-iterative-availability] [data-counter-rule="0"] [data-rule-row-remove]'
    );
    assert.equal(remove.getAttribute('aria-label'), 'Remove Heat rule');
    await press('[data-iterative-availability] [data-counter-rule="0"] [data-rule-row-remove]');
    assert.ok(
      document.activeElement ===
        $('[data-iterative-availability] [data-counter-rules-add] [data-rule-row-preset]'),
      'focus lands on the adder'
    );
  });

  it('takes the action as a free action through a pressed toggle that says so', async () => {
    const { route } = await openEditor('strike');
    await press('[data-iterative-uses-session]');
    assert.equal(route.actionDraft.usesSession, false);
    assert.equal($('[data-iterative-uses-session]').getAttribute('aria-pressed'), 'false');
    assert.equal(
      $('[data-iterative-session-note]').textContent.trim(),
      'Free action: nothing counts down.'
    );
  });

  it('edits availability through counter rules and shows All/Any once two rules exist', async () => {
    const { route } = await openEditor('strike');
    assert.ok(!$('[data-iterative-availability] [data-counter-rules-combine]'));
    await press('[data-iterative-availability] [data-rule-row-preset="rule"]');
    await press('[data-iterative-availability] [data-rule-row-preset="rule"]');
    assert.deepEqual(
      route.actionDraft.availability.rules.map((rule) => [rule.source, rule.counterId, rule.op]),
      [
        ['counter', 'heat', '>='],
        ['counter', 'heat', '>='],
      ]
    );
    const any = $('[data-iterative-availability] [data-counter-rules-combine="any"]');
    assert.ok(Boolean(any), 'two rules offer the combine control');
    any.click();
    await settle();
    assert.equal(route.actionDraft.availability.combine, 'any');
    chooseSelectOption(
      target,
      '[data-iterative-availability] [data-counter-rule="1"] [data-counter-rule-source]',
      'sessionCount'
    );
    await settle();
    assert.deepEqual(route.actionDraft.availability.rules[1], {
      source: 'sessionCount',
      op: '>=',
      value: 0,
    });
    await press('[data-iterative-availability] [data-counter-rule="0"] [data-rule-row-remove]');
    assert.equal(route.actionDraft.availability.rules.length, 1);
  });

  it('shows the routed check read-only with its facts, and Open Checks goes to Checks', async () => {
    const { calls } = await openEditor('strike');
    const facts = $('[data-iterative-check-facts]');
    assert.equal(facts.dataset.iterativeCheckProduct, 'sum');
    assert.equal(facts.dataset.iterativeCheckDirection, 'over');
    assert.equal(
      facts.querySelector('[data-iterative-check-fact="formula"]').textContent.includes('1d20'),
      true
    );
    assert.equal(
      facts.querySelector('[data-iterative-check-fact="outcomes"]').textContent.includes('1'),
      true
    );
    await press('[data-iterative-open-checks]');
    assert.deepEqual(calls.views, ['iterative-action-edit', 'checks']);
  });

  it('reads a count check that wins under its target', async () => {
    await openEditor('strike', {
      routed: {
        ...HIT,
        rollFormula: '4d10',
        evaluation: {
          product: 'count',
          direction: 'under',
          pool: { die: 10, base: '4', threshold: '3', required: 1 },
        },
      },
    });
    const facts = $('[data-iterative-check-facts]');
    assert.equal(facts.dataset.iterativeCheckProduct, 'count');
    assert.equal(facts.dataset.iterativeCheckDirection, 'under');
  });

  it('warns, with the same way to Checks, when the routed check has no usable roll', async () => {
    const { calls } = await openEditor('strike', { routed: { ...HIT, rollFormula: '' } });
    assert.ok(!$('[data-iterative-check-facts]'), 'the facts give way to the warning');
    assert.ok(!$('[data-iterative-check-note]'), 'the note gives way too');
    assert.equal(
      $$('[data-iterative-open-checks], [data-notice-action]').length,
      1,
      'one Open Checks'
    );
    const warning = $('[data-iterative-check-missing]');
    assert.equal(warning.dataset.noticeTone, 'warning');
    assert.ok(warning.textContent.includes('Ironworks has no crafting check set up'));
    warning.querySelector('[data-notice-action]').click();
    await settle();
    assert.equal(calls.views.at(-1), 'checks');
  });

  it('hides tier, success and compare under No check and keeps the workpiece rules', async () => {
    await openEditor('strike');
    await press('[data-iterative-effect="shape"] [data-sortable-disclosure]');
    assert.ok(
      Boolean($('[data-iterative-effect-tier="hit"]')),
      'a rolling action offers its tiers'
    );
    await press('[data-iterative-check-option="none"]');
    assert.ok(!$('[data-iterative-effect-tier="hit"]'));
    assert.ok(!$('[data-iterative-effect-success]'));
    assert.ok(!$('[data-iterative-effect-compare-add]'));
    assert.ok(Boolean($('[data-iterative-effect-rules]')), 'workpiece rules stay');
    assert.ok(Boolean($('[data-iterative-no-check]')));
  });

  it('clears the check conditions when the action switches to No check, and Discard restores them', async () => {
    const library = structuredClone(LIBRARY);
    library.actions[0].effects[0].when = {
      combine: 'all',
      checkOutcomeIds: ['hit'],
      success: true,
      value: { op: '>=', value: 4 },
      rules: [{ source: 'sessionCount', op: '>=', value: 1 }],
    };
    const { route, calls } = await openEditor('strike', { library });
    await press('[data-iterative-check-option="none"]');
    assert.deepEqual(route.actionDraft.effects[0].when, {
      combine: 'all',
      rules: [{ source: 'sessionCount', op: '>=', value: 1 }],
    });
    assert.ok(!$('[data-issue-code="iterativeCheckFactWithoutCheck"]'), 'nothing hidden is left');
    assert.ok($('[data-iterative-effect="shape"]').textContent.includes('when 1 condition holds'));
    assert.equal(calls.updates.length, 0, 'the switch is staged');
    assert.equal(await route.exitGuard.finish('discard'), true);
    route.openAction('strike');
    await settle();
    assert.equal(route.actionDraft.effects[0].when.success, true, 'Discard restores them');
  });

  it('summarises an imported No check effect that still reads the check by its conditions', async () => {
    const library = structuredClone(LIBRARY);
    library.actions[1].effects = [effect('glow', { when: { combine: 'all', success: true } })];
    await openEditor('quench', { library });
    const row = $('[data-iterative-effect="glow"]');
    assert.ok(row.textContent.includes('when 1 condition holds'), 'never "every session"');
    assert.ok(row.querySelector('[data-issue-code="iterativeCheckFactWithoutCheck"].is-warning'));
  });

  it('applies tiers, success and a value compare, and follows All or Any with its sentence', async () => {
    const { route } = await openEditor('strike');
    await press('[data-iterative-effect="shape"] [data-sortable-disclosure]');
    assert.ok($('[data-iterative-effect-footnote]').textContent.includes('All of these must hold'));
    assert.ok(
      Boolean(
        $('[data-iterative-effect-footnote]').compareDocumentPosition(
          $('[data-iterative-effect-rules]')
        ) & Node.DOCUMENT_POSITION_FOLLOWING
      ),
      'the footnote sits above the workpiece rules'
    );
    $('[data-iterative-effect-tier="hit"]').click();
    await settle();
    assert.deepEqual(route.actionDraft.effects[0].when.checkOutcomeIds, ['hit']);
    await press('[data-iterative-effect="shape"] [data-iterative-effect-success="no"]');
    assert.equal(route.actionDraft.effects[0].when.success, false);
    await press('[data-iterative-effect-compare-add]');
    assert.deepEqual(route.actionDraft.effects[0].when.value, { op: '>=', value: 0 });
    await press('[data-iterative-effect-combine="any"]');
    assert.equal(route.actionDraft.effects[0].when.combine, 'any');
    assert.ok(
      $('[data-iterative-effect-footnote]').textContent.includes('Any one of these may hold')
    );
    await press('[data-iterative-effect-compare-clear]');
    await press('[data-iterative-effect-success="any"]');
    $('[data-iterative-effect-tier="hit"]').click();
    await settle();
    assert.deepEqual(
      route.actionDraft.effects[0].when,
      { combine: 'any' },
      'emptied keys are dropped'
    );
  });

  it('edits the effect line and its workpiece rules', async () => {
    const { route } = await openEditor('strike');
    await press('[data-iterative-effect="shape"] [data-sortable-disclosure]');
    await press('[data-iterative-effect-op="set"]');
    assert.equal(route.actionDraft.effects[0].op, 'set');
    chooseSelectOption(
      target,
      '[data-iterative-effect="shape"] [data-iterative-effect-counter]',
      'heat'
    );
    await settle();
    assert.equal(route.actionDraft.effects[0].target.counterId, 'heat');
    await type(
      '[data-iterative-effect="shape"] [data-iterative-amount="effect"]',
      '@counter.heat + 1'
    );
    assert.equal(route.actionDraft.effects[0].amount, '@counter.heat + 1');
    await press('[data-iterative-effect-rules] [data-rule-row-preset="rule"]');
    assert.equal(route.actionDraft.effects[0].when.rules.length, 1);
    assert.ok(
      !$('[data-iterative-effect-rules] [data-counter-rules-combine]'),
      'the effect owns the combine'
    );
  });

  it('adds, reorders and removes effects, minting ids and handing focus to the adder', async () => {
    const { route } = await openEditor('strike');
    await press('[data-iterative-add-effect]');
    await press('[data-iterative-add-effect]');
    assert.deepEqual(
      route.actionDraft.effects.map((held) => held.id),
      ['shape', 'effect', 'effect2']
    );
    assert.equal(
      $('[data-iterative-effect="effect2"] .fabricate-sortable-list-body').hidden,
      false,
      'the new effect opens'
    );
    await press('[data-iterative-effect="effect"] [data-sortable-move="up"]');
    assert.deepEqual(
      route.actionDraft.effects.map((held) => held.id),
      ['effect', 'shape', 'effect2']
    );
    await press('[data-iterative-effect-remove="shape"]');
    assert.deepEqual(
      route.actionDraft.effects.map((held) => held.id),
      ['effect', 'effect2']
    );
    assert.ok(
      document.activeElement === $('[data-iterative-add-effect]'),
      'removing hands focus to the adder'
    );
  });

  it('says there are no effects, and offers to add one', async () => {
    await openEditor('quench');
    assert.ok($('[data-iterative-effects-empty]').textContent.includes('only spends its costs'));
    assert.ok(Boolean($('[data-iterative-add-effect]')));
  });

  it('names a collapsed effect with a fault under its row, and each mark once', async () => {
    const { route } = await openEditor('strike');
    route.editAction((d) => {
      d.effects[0].target.counterId = 'ore';
    });
    await settle();
    const row = $('[data-iterative-effect="shape"]');
    assert.equal(row.querySelectorAll('[data-issue-code="iterativeUnknownCounter"]').length, 1);
    await press('[data-iterative-effect="shape"] [data-sortable-disclosure]');
    assert.equal(
      row.querySelectorAll('[data-issue-code="iterativeUnknownCounter"]').length,
      1,
      'opening moves the mark into the body'
    );
  });

  it('creates a category, joins it to the draft and blocks an exact repeat', async () => {
    const { route } = await openEditor('strike');
    await type('#iterative-action-new-category', 'forging');
    assert.ok(
      $('.manager-vocabulary-hint.is-danger').textContent.includes('Forging already exists')
    );
    assert.equal($('[data-vocabulary-add]').disabled, true);
    await type('#iterative-action-new-category', 'Forgin');
    assert.ok(
      $('.manager-vocabulary-hint.is-warning').textContent.includes('Did you mean Forging?')
    );
    await type('#iterative-action-new-category', 'Tempering');
    $('[data-vocabulary-add]').click();
    await settle();
    assert.deepEqual(route.actionDraft.categories, ['Forging', 'Tempering']);
    await type('#iterative-action-new-category', 'tempering');
    assert.equal(
      $('[data-vocabulary-add]').disabled,
      true,
      'the created category is now a candidate'
    );
  });

  it('opens the icon picker and writes the chosen glyph', async () => {
    const { route } = await openEditor('strike');
    await press('[data-iterative-action-icon] .essence-icon-picker-trigger');
    const option = document.querySelector('.essence-icon-picker-option');
    assert.ok(Boolean(option), 'the picker opens its list');
    option.click();
    await settle();
    assert.ok(
      typeof route.actionDraft.icon === 'string' && route.actionDraft.icon.startsWith('fa')
    );
  });

  it('confirms a delete by listing the steps and rules that name the action, escaped', async () => {
    const { route, calls } = await openEditor('strike');
    assert.equal(await route.deleteAction(), true);
    const [dialog] = calls.dialogs;
    assert.equal(dialog.title, 'Delete Strike?');
    assert.ok(dialog.content.includes('data-iterative-delete-uses="action"'));
    assert.ok(dialog.content.includes('<li>Blade › Forge</li>'));
    assert.ok(
      dialog.content.includes('<li>Chain &lt;i&gt;x&lt;/i&gt; · rule</li>'),
      'a previous-action rule is listed, escaped'
    );
    assert.ok(dialog.content.includes('Workpieces in progress aren’t affected.'));
    assert.deepEqual([dialog.yes.label, dialog.no.label], ['Delete action', 'Cancel']);
    assert.deepEqual(
      calls.updates.at(-1)[1].iterative.actions.map((held) => held.id),
      ['quench', 'chain']
    );
    assert.equal(route.hasEditableAction, false, 'a deleted action leaves the editor');
  });

  it('confirms an unused delete with no list, and keeps the action when the GM cancels', async () => {
    const { route, calls } = await openEditor('quench', { answer: false });
    assert.equal(await route.deleteAction(), false);
    assert.ok(!calls.dialogs[0].content.includes('<ul'));
    assert.equal(calls.updates.length, 0);
  });

  it('does not duplicate a dirty draft, and duplicates a clean one under a new id', async () => {
    const { route } = await openEditor('strike');
    await type('[data-iterative-action-label]', 'Strike twice');
    assert.equal(await route.duplicateAction(), false);
    await route.saveAction();
    assert.equal(await route.duplicateAction(), true);
    assert.ok(
      ctx.live.get('system').iterative.actions.some((held) => held.id === 'strikeTwiceCopy')
    );
  });

  it('opens no editor for an action id the library does not hold', () => {
    const { route, calls } = makeRoute();
    route.openAction('ghost');
    assert.deepEqual(calls.views, [], 'no route is entered');
    assert.equal(route.actionDraft, null);
  });

  it('mints an id from the label when a new draft is first saved', async () => {
    const { route, calls } = await openEditor(null);
    assert.equal(route.isNewAction, true);
    await type('[data-iterative-action-label]', 'Draw out');
    assert.equal(await route.saveAction(), true);
    assert.equal(calls.updates[0][1].iterative.actions.at(-1).id, 'drawOut');
    assert.equal(route.isNewAction, false);
  });

  it('is read-only, drawing only its Notice, when the library is newer than this build', async () => {
    const { calls } = await openEditor(null, { library: { ...LIBRARY, version: 2 } });
    assert.ok(Boolean($('[data-iterative-unsupported-notice]')));
    assert.equal($$('[data-iterative-section]').length, 0);
    assert.equal(calls.updates.length, 0);
  });

  describe('the in-progress note (issue 3010)', () => {
    const run = (actionIds, craftingSystemId = 'ironworks') => ({
      recipeId: 'r-blade',
      craftingSystemId,
      actionIds,
    });
    const note = () => $('[data-iterative-in-progress]');

    it('heads the editor with the workpieces that can use the action, singular for one', async () => {
      await openEditor('strike', {
        runs: [
          run(['strike']),
          run(['strike', 'quench']),
          run(['quench']),
          run(['strike'], 'other'),
        ],
      });
      assert.ok(note() === $('[data-iterative-editor]').firstElementChild, 'the first child');
      assert.equal(note().dataset.iterativeInProgress, '2');
      assert.equal(
        note().textContent.trim(),
        '2 workpieces in progress can use Strike. They keep the version of this action they started with; your changes apply to workpieces started after you save.'
      );
      unmount(mounted);
      mounted = null;
      target.remove();

      await openEditor('quench', { runs: [run(['quench'])] });
      assert.match(note().textContent, /^\s*1 workpiece in progress can use Quench\. It keeps/);
    });

    it('is absent at zero, and on a new draft', async () => {
      await openEditor('chain', { runs: [run(['strike'])] });
      assert.ok(!note(), 'no run can use Chain');
      unmount(mounted);
      mounted = null;
      target.remove();

      // A run naming the new draft's empty id, so only the new-draft rule keeps the note away.
      await openEditor(null, { runs: [run([''])] });
      assert.equal(ctx.route.actionDraft.id, '');
      assert.ok(!note(), 'a new draft has no workpieces');
    });
  });

  describe('CounterRuleList, as recipe authoring will mount it (issue 3009)', () => {
    let List;
    let host;
    let listMounted;

    const RULES = [
      { source: 'counter', counterId: 'heat', op: '>=', value: 1 },
      { source: 'sessionCount', op: '<', value: 4 },
    ];

    before(async () => {
      List = await managerComponent('src/ui/svelte/apps/manager/iterative/CounterRuleList.svelte');
    });

    afterEach(() => {
      if (listMounted) unmount(listMounted);
      listMounted = null;
      host?.remove();
    });

    function mountList(props) {
      host = document.createElement('div');
      host.className = 'fabricate-manager';
      document.body.appendChild(host);
      listMounted = mount(List, {
        target: host,
        props: {
          rules: RULES,
          counterSources: [{ id: 'heat', label: 'Heat' }],
          text: (_key, fallback) => fallback,
          ...props,
        },
      });
      flushSync();
      return host;
    }
    const joiners = () =>
      [...host.querySelectorAll('[data-counter-rules-joiner]')].map((word) =>
        word.textContent.trim()
      );
    const adder = () => host.querySelector('[data-rule-row-preset="rule"]').textContent.trim();

    it('draws every rule title as a connective', () => {
      mountList({});
      const titles = [...host.querySelectorAll('[data-counter-rule] [data-rule-row-title]')];
      assert.equal(titles.length, RULES.length);
      assert.ok(titles.every((title) => title.classList.contains('is-connective')));
    });

    it('draws a joiner word before every rule after the first when its caller owns the combine', () => {
      mountList({ combineControl: false, joiner: 'and' });
      assert.deepEqual(joiners(), ['and']);
      unmount(listMounted);
      host.remove();
      mountList({ combineControl: false, joiner: 'or' });
      assert.deepEqual(joiners(), ['or']);
    });

    it('draws no joiner by default, and none beside its own combine control', () => {
      mountList({ combineControl: false });
      assert.deepEqual(joiners(), []);
      unmount(listMounted);
      host.remove();
      mountList({ joiner: 'and' });
      assert.deepEqual(joiners(), [], 'the All/Any control already says how they combine');
      assert.ok(Boolean(host.querySelector('[data-counter-rules-combine]')));
    });

    it('relabels the adder, and keeps "Rule" by default', () => {
      mountList({ adderLabel: 'Condition' });
      assert.equal(adder(), 'Condition');
      unmount(listMounted);
      host.remove();
      mountList({});
      assert.equal(adder(), 'Rule');
    });

    it('keeps a rule on a counter it no longer tracks, worded for the step, with its remove control', () => {
      mountList({ counterSources: [{ id: 'temper', label: 'Temper' }], sourceScope: 'step' });
      assert.equal(host.querySelectorAll('[data-counter-rule]').length, 2, 'no rule is dropped');
      const line = host.querySelector('[data-issue-code="iterativeUnknownCounter"]');
      assert.equal(line.textContent.trim(), "heat isn't tracked in this step.");
      assert.ok(
        Boolean(host.querySelector(':scope [data-counter-rule="0"] [data-rule-row-remove]'))
      );
      assert.ok(
        host
          .querySelector(':scope [data-counter-rule="0"] [data-counter-rule-source]')
          .textContent.includes('heat'),
        'the stored id is drawn as the source'
      );
    });

    it('writes a rule that is not an object back as it was when another rule is edited', () => {
      const changes = [];
      mountList({
        rules: ['junk', RULES[1]],
        onChange: (next) => {
          changes.push(next);
        },
      });
      chooseSelectOption(host, '[data-counter-rule="1"] [data-counter-rule-op]', '>=');
      flushSync();
      assert.equal(changes.length, 1);
      assert.equal(changes[0].rules[0], 'junk', 'the authored rule is untouched');
      assert.equal(changes[0].rules[1].op, '>=');
    });

    it('takes its counters from its caller, so a narrowed list marks a counter it no longer offers', () => {
      mountList({ counterSources: [{ id: 'temper', label: 'Temper' }] });
      assert.ok(host.querySelector('[data-issue-code="iterativeUnknownCounter"]'));
    });
  });
});
