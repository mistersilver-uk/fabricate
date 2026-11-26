/**
 * The Journal's projection of an iterative run (issue 3011, D-1): the focus step, its counters,
 * cards, routes, sessions and verdicts over the `workpiece` lab runs, with D18's hidden counters
 * dropped for a viewer who is not a GM.
 */
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';

import {
  listText,
  ruleText,
  thresholdText,
} from '../../src/ui/presenters/iterative/iterativeRuleText.js';
import { iterativeRunFields } from '../../src/ui/presenters/iterative/iterativeRunPresentation.js';
import {
  iterativeStepEndVerdict,
  iterativeVerdict,
} from '../../src/ui/presenters/iterative/iterativeVerdict.js';
import {
  WORKPIECE_ACTOR,
  WORKPIECE_GM,
  installWorkpieceEnv,
  workpieceListing,
  workpieceLocalize as localize,
  workpieceModel,
  workpieceRuns,
} from '../helpers/iterativeJournalListing.js';
import { ITERATIVE_SCENARIOS } from '../view-lab/world/labIterativeRuns.js';

before(installWorkpieceEnv);

const SENTINELS = /Qzx-Hidden-Fit|qzxHidden|7731/;
const IDENTITY = /Qzx-Secret-Recipe|Qzx-Secret-Step/;
const model = (state, options = {}) =>
  workpieceModel(
    state,
    state === 'iterative-redacted' ? { hidden: ['iw-r-veiled'], ...options } : options
  );
const editAction = (run, actionId, edit) => {
  edit(run.termsSnapshot.iterative.actions.find((entry) => entry.id === actionId));
};
const card = (entry, actionId) => entry.iterative.cards.find((item) => item.actionId === actionId);

describe('the focus step, the boundary and the derived status, state by state', () => {
  // [state, focusStepIndex, boundary, derivedStatus, stepLabel, reachedId, card notes]
  const TABLE = [
    [
      'list',
      0,
      false,
      'ready',
      'Step 1 of 2 · 3 sessions completed',
      'iterative-next-step',
      'rolls,cost,hazard,needs,setup',
    ],
    [
      'fresh',
      0,
      false,
      'ready',
      'Step 1 of 2 · 0 sessions completed',
      'iterative-next-step',
      'rolls,rolls,hazard,needs,setup',
    ],
    [
      'cards',
      0,
      false,
      'ready',
      'Step 1 of 2 · 1 session completed',
      'iterative-next-step',
      'rolls,cost,hazard,needs,setup',
    ],
    [
      'no-action',
      0,
      false,
      'inProgress',
      'Step 1 of 2 · 3 sessions completed',
      'iterative-next-step',
      'needs,setup',
    ],
    [
      'starting',
      0,
      true,
      'inProgress',
      'Step 1 of 2 · 1 session completed',
      null,
      'ended,ended,ended,ended,ended',
    ],
    [
      'routes',
      1,
      false,
      'ready',
      'Step 2 of 2 · 1 session completed',
      'iw-edge-fine',
      'rolls,cost,hazard,none,setup',
    ],
    [
      'failed',
      1,
      false,
      'ready',
      'Step 2 of 2 · 1 session completed',
      'iw-edge-plain',
      'rolls,cost,hazard,none,setup',
    ],
    [
      'single',
      0,
      false,
      'ready',
      '1 session completed',
      'iw-spear-fine',
      'rolls,rolls,hazard,needs,none',
    ],
    [
      'waiting',
      0,
      false,
      'inProgress',
      'Step 1 of 2 · 3 sessions completed',
      'iterative-next-step',
      'waiting,waiting,waiting,waiting,waiting',
    ],
    [
      'unsupported',
      0,
      false,
      'inProgress',
      'Step 1 of 2 · 3 sessions completed',
      'iterative-next-step',
      'rolls,cost,hazard,needs,setup',
    ],
    ['redacted', 0, false, 'ready', '1 session completed', null, 'rolls,rolls,hazard,needs,setup'],
    [
      'sessions',
      0,
      false,
      'ready',
      'Step 1 of 2 · 10 sessions completed',
      'iterative-next-step',
      'rolls,cost,hazard,needs,setup',
    ],
    ['history', 0, false, 'failed', '2 sessions', null, ''],
    ['record', 0, false, 'succeeded', '1 session', null, ''],
  ];
  for (const [suffix, focus, boundary, derivedStatus, stepLabel, reachedId, notes] of TABLE) {
    test(suffix, () => {
      const entry = model(`iterative-${suffix}`);
      assert.equal(entry.iterative.focusStepIndex, focus);
      assert.equal(entry.iterative.boundary !== null, boundary);
      assert.equal(entry.derivedStatus, derivedStatus);
      assert.equal(entry.stepLabel, stepLabel);
      assert.equal(entry.iterative.routes?.reachedId ?? null, reachedId);
      assert.equal(entry.iterative.cards.map((item) => item.note).join(','), notes);
      const reached = entry.iterative.routes?.tiers.filter((tier) => tier.id === reachedId) ?? [];
      assert.equal(reached.length, reachedId === null ? 0 : 1, 'one reached tier while worked');
    });
  }

  test('a run that is not iterative projects nothing of its own', () => {
    assert.deepEqual(iterativeRunFields({ run: { id: 'plain', steps: [{}] }, model: {} }), {});
  });

  test('every lab state projects the mode label "Iterative"', () => {
    for (const state of Object.keys(ITERATIVE_SCENARIOS)) {
      const entry = model(state);
      if (entry.status === 'inProgress' || entry.status === 'waitingTime') {
        assert.equal(entry.resolutionModeLabel, 'Iterative', state);
      }
    }
  });
});

describe('card notes, in order, for each rule source', () => {
  const NOTES = [
    ['rolls', 'hammer', 'Rolls the crafting check', 'muted'],
    ['cost', 'planish', 'Needs 50 Heat; the piece has 40', 'danger'],
    ['hazard', 'stoke', 'Heat 40 is at or above 30: also Integrity −1', 'danger'],
    ['needs', 'normalise', 'Needs Shape ≥ 40', 'muted'],
    ['setup', 'fitHilt', 'Ask your GM to review this action', 'muted'],
  ];
  for (const [note, actionId, text, tone] of NOTES) {
    test(`${note}: ${text}`, () => {
      const read = card(model('iterative-cards'), actionId);
      assert.deepEqual([read.note, read.noteText, read.noteTone], [note, text, tone]);
      assert.equal(read.enabled, note === 'rolls' || note === 'hazard');
    });
  }

  test('the step has ended at a boundary, and every card waits on an unmatured step', () => {
    assert.equal(card(model('iterative-starting'), 'hammer').noteText, 'The step has ended');
    const waiting = card(model('iterative-waiting'), 'hammer');
    assert.deepEqual(
      [waiting.note, waiting.noteText, waiting.availableAt],
      ['waiting', null, 1_209_600 + 3 * 3600]
    );
  });

  test('"No check" names an action that rolls nothing', () => {
    const read = card(model('iterative-routes'), 'normalise');
    assert.deepEqual([read.note, read.noteText], ['none', 'No check']);
  });

  test('a busy card reads the session it saves, and a free action reads none', () => {
    const entry = model('iterative-cards');
    assert.equal(card(entry, 'hammer').busyNote, 'Working session 2… waiting for the save');
    assert.equal(card(entry, 'fitHilt').busyNote, 'Working… waiting for the save');
  });

  const RULES = [
    { source: 'counter', counterId: 'integrity', op: '>=', value: 20 },
    { source: 'sessionCount', op: '>=', value: 5 },
    { source: 'previousAction', actionIds: ['planish', 'normalise'] },
  ];
  for (const [combine, text] of [
    ['all', 'Needs Integrity ≥ 20, 5 or more sessions and right after Planish or Normalise'],
    ['any', 'Needs Integrity ≥ 20, 5 or more sessions or right after Planish or Normalise'],
  ]) {
    test(`unmet requirements under ${combine} name each unmet rule source`, () => {
      const entry = model('iterative-cards', {
        mutate: (run) =>
          editAction(run, 'hammer', (action) => {
            action.availability = { combine, rules: structuredClone(RULES) };
          }),
      });
      assert.deepEqual(
        [card(entry, 'hammer').note, card(entry, 'hammer').noteText],
        ['needs', text]
      );
    });
  }

  test('under all, only the requirements still unmet are named', () => {
    const rules = [...RULES, { source: 'counter', counterId: 'heat', op: '>=', value: 1 }];
    const entry = model('iterative-cards', {
      mutate: (run) =>
        editAction(run, 'hammer', (action) => {
          action.availability = { combine: 'all', rules: [rules[0], rules[3]] };
        }),
    });
    assert.equal(card(entry, 'hammer').noteText, 'Needs Integrity ≥ 20');
  });

  for (const [reason, edit] of [
    ['invalid-entry', (action) => Object.assign(action, { check: 'sometimes' })],
    ['expression-invalid', (action) => (action.costs[0].amount = '-5')],
    ['unknown-counter', (action) => (action.costs[0].counterId = 'finish')],
  ]) {
    test(`a preflight ${reason} asks the GM to review the action`, () => {
      const entry = model('iterative-cards', { mutate: (run) => editAction(run, 'hammer', edit) });
      const read = card(entry, 'hammer');
      assert.deepEqual([read.reason, read.note, read.enabled], [reason, 'setup', false]);
      assert.deepEqual(read.costs, []);
    });
  }

  test('a library newer than this release asks the GM to review every card', () => {
    const entry = model('iterative-cards', {
      mutate: (run) => (run.termsSnapshot.iterative.version = 2),
    });
    assert.equal(entry.iterative.supported, false);
    assert.equal(entry.actions.takeAction, false);
    assert.equal(entry.actions.disabledReason, 'version-unsupported');
    assert.ok(entry.iterative.cards.every((item) => item.reason === 'version-unsupported'));
    assert.ok(entry.iterative.cards.every((item) => item.note === 'setup'));
  });
});

describe('a run-level cause disables every card whatever preflight says', () => {
  const CAUSES = {
    'not owner': { actor: { ...WORKPIECE_ACTOR, isOwner: false } },
    authority: { authority: { available: false, reason: 'authorityUnavailable' } },
    recovery: {
      mutate: (run) => (run.executionJournal = { status: 'recoveryRequired', effects: [] }),
    },
    unsupported: { state: 'iterative-unsupported' },
    gate: { state: 'iterative-waiting' },
    boundary: { state: 'iterative-starting' },
    paused: { mutate: (run) => (run.pauseState = { pausedAt: 1, remainingSeconds: 60 }) },
  };
  for (const [cause, { state = 'iterative-list', ...options }] of Object.entries(CAUSES)) {
    test(cause, () => {
      const { iterative, actions, derivedStatus } = model(state, options);
      assert.equal(actions.takeAction, false);
      assert.ok(iterative.cards.length > 0);
      assert.ok(iterative.cards.every((item) => !item.enabled));
      assert.equal(derivedStatus, 'inProgress');
    });
  }

  test('without a cause, a card preflight passes is enabled', () => {
    const { iterative } = model('iterative-list');
    assert.ok(iterative.cards.some((item) => item.reason === null && item.enabled));
  });
});

describe('cost and hazard chips', () => {
  test('costs are priced by preflight, the short one marked, the drainable one never short', () => {
    const entry = model('iterative-cards');
    assert.deepEqual(
      card(entry, 'hammer').costs.map(({ label, short }) => [label, short]),
      [
        ['Integrity −2', false],
        ['Heat −10', false],
      ]
    );
    assert.deepEqual(
      card(entry, 'planish').costs.map(({ label, short }) => [label, short]),
      [['Heat −50', true]]
    );
    assert.equal(card(entry, 'fitHilt').note, 'setup');
    assert.equal(card(entry, 'fitHilt').noCost, false, 'a setup fault prices nothing');
    assert.equal(card(model('iterative-single'), 'fitHilt').noCost, true);
  });

  test('an unconditional effect is never a hazard, and a held Counter Rule is', () => {
    const stoke = card(model('iterative-cards'), 'stoke');
    assert.deepEqual(
      stoke.hazards.map((chip) => [chip.effectId, chip.label]),
      [['scorch', 'Integrity −1']]
    );
  });

  test('an effect under a failing `any` is no hazard, and nor is one on a locked target', () => {
    const failing = model('iterative-cards', {
      mutate: (run) =>
        editAction(run, 'stoke', (action) => {
          action.effects[1].when = {
            combine: 'any',
            rules: [
              { source: 'counter', counterId: 'heat', op: '>=', value: 90 },
              { source: 'sessionCount', op: '>=', value: 9 },
            ],
          };
        }),
    });
    assert.deepEqual(card(failing, 'stoke').hazards, []);
    assert.equal(card(failing, 'stoke').note, 'none');
    const locked = model('iterative-cards', {
      mutate: (run) =>
        (run.termsSnapshot.recipe.steps[0].iterative.lockedCounterIds = ['integrity']),
    });
    assert.deepEqual(card(locked, 'stoke').hazards, []);
  });

  test('an effect with no target is no hazard, even on a card preflight never reads', () => {
    const entry = model('iterative-starting', {
      mutate: (run) =>
        editAction(run, 'stoke', (action) => {
          delete action.effects[1].target;
        }),
    });
    assert.deepEqual([card(entry, 'stoke').note, card(entry, 'stoke').hazards], ['ended', []]);
  });

  test('a check fact makes an effect no hazard, because the check decides it', () => {
    const entry = model('iterative-cards', {
      mutate: (run) =>
        editAction(run, 'stoke', (action) => {
          action.effects[1].when.success = true;
        }),
    });
    assert.deepEqual(card(entry, 'stoke').hazards, []);
  });
});

describe('counters, captions and route marks', () => {
  test('the routes state reads each caption, tone and reached mark', () => {
    const { counters } = model('iterative-routes').iterative;
    assert.deepEqual(
      counters.map(({ counterId, value, scale, tone, caption }) => [
        counterId,
        value,
        scale,
        tone,
        caption,
      ]),
      [
        ['shape', 80, 100, 'accent', 'Done at 100'],
        ['integrity', 9, 12, 'info', 'Breaks at 0'],
        ['heat', 35, 100, 'info', 'Max 100'],
      ]
    );
    const integrity = counters.find((entry) => entry.counterId === 'integrity');
    assert.deepEqual(integrity.marks, [
      { value: 8, label: 'Fine edge — Integrity ≥ 8, reached', reached: true },
    ]);
    assert.equal(integrity.valueText, '9 of 12, Breaks at 0, Fine edge — Integrity ≥ 8, reached');
  });

  test('a failing counter turns danger at a quarter of its max, then reads broken', () => {
    const low = model('iterative-failed').iterative.counters.find(
      (entry) => entry.counterId === 'integrity'
    );
    assert.deepEqual([low.tone, low.caption], ['danger', 'Low: breaks at 0']);
    const broken = model('iterative-failed', {
      mutate: (run) => {
        run.steps[1].iterative.counters.find((row) => row.counterId === 'integrity').value = 0;
      },
    }).iterative.counters.find((entry) => entry.counterId === 'integrity');
    assert.equal(broken.caption, 'Broken');
  });

  test('a met goal reads "Target reached", and a counter the next step routes on carries', () => {
    const boundary = model('iterative-starting').iterative.counters;
    assert.equal(boundary.find((entry) => entry.counterId === 'shape').caption, 'Target reached');
    const carried = model('iterative-cards', {
      mutate: (run) => {
        const step = run.termsSnapshot.recipe.steps[0].iterative;
        step.failure = [];
        step.success = [{ source: 'counter', counterId: 'shape', op: '>=', value: 60 }];
        run.termsSnapshot.iterative.counters.find((entry) => entry.id === 'integrity').limit =
          'none';
      },
    }).iterative.counters.find((entry) => entry.counterId === 'integrity');
    assert.equal(carried.caption, 'Carries into step 2, where it decides the result');
    assert.equal(carried.scale, null);
    assert.equal(carried.valueText, '12, Carries into step 2, where it decides the result');
  });

  test('with no max, the scale is 1.25 × the top route threshold', () => {
    const entry = model('iterative-routes', {
      mutate: (run) => {
        run.termsSnapshot.iterative.counters.find((item) => item.id === 'integrity').limit = 'none';
        run.termsSnapshot.recipe.steps[1].iterative.failure = [];
      },
    });
    const integrity = entry.iterative.counters.find((item) => item.counterId === 'integrity');
    assert.deepEqual(
      [integrity.scale, integrity.caption, integrity.tone],
      [10, 'Decides the result', null]
    );
  });
});

describe('routes, sessions, progress and the header', () => {
  test('routes run in authored order: banded, empty-rules, then failure', () => {
    const { tiers } = model('iterative-routes').iterative.routes;
    assert.deepEqual(
      tiers.map(({ id, name, band, fail, title }) => [id, name, band, fail, title]),
      [
        [
          'iw-edge-fine',
          'Fine edge',
          'Integrity ≥ 8',
          false,
          'On success, when Integrity ≥ 8. This is what it would give if the step ended this way now.',
        ],
        ['iw-edge-plain', 'Plain edge', '', false, 'On success.'],
        ['iw-edge-slag', 'Slag', '', true, 'On failure.'],
      ]
    );
    assert.deepEqual(
      tiers[0].yields.map(({ name, quantity }) => [name, quantity]),
      [['Longsword', 1]]
    );
  });

  test('a step with no groups routes to the next step, then to nothing', () => {
    const { tiers } = model('iterative-cards').iterative.routes;
    assert.deepEqual(
      tiers.map(({ id, name }) => [id, name]),
      [
        ['iterative-next-step', 'Step 2 starts'],
        ['iterative-nothing', 'Nothing'],
      ]
    );
  });

  test('sessions run newest first, each worded check, paid and changed', () => {
    const { sessions, compactedCount } = model('iterative-list').iterative;
    assert.deepEqual(
      sessions.map((row) => [
        row.sessionNumber,
        row.action,
        row.check.text,
        row.check.tone,
        row.paidText,
        row.changedText,
      ]),
      [
        [3, 'Hammer', 'Failure · 7', 'warning', 'Integrity −2, Heat −10', 'Nothing'],
        [2, 'Stoke the forge', 'No check', null, '—', 'Heat +25, Integrity −1'],
        [1, 'Hammer', 'Success · 14', 'positive', 'Integrity −2, Heat −10', 'Shape +10'],
      ]
    );
    assert.equal(compactedCount, 0);
    assert.equal(model('iterative-sessions').iterative.compactedCount, 2);
  });

  test('progress reads the goal of the focus step, and its note drops once the step ends', () => {
    const working = model('iterative-routes').iterative;
    assert.deepEqual(
      [working.progress.current, working.progress.percent, working.progress.note],
      [1, 80, 'Step 2: Shape 80 of 100']
    );
    assert.deepEqual(
      working.progress.stages.map((stage) => [stage.name, stage.status]),
      [
        ['Rough out the blade', 'succeeded'],
        ['Draw out the edge', 'inProgress'],
      ]
    );
    assert.equal(model('iterative-single').iterative.progress.note, 'Finish 0 of 100');
    assert.equal(model('iterative-starting').iterative.progress.note, '');
  });

  test('the header and caption read the step, the next session and what the step began with', () => {
    assert.deepEqual(model('iterative-cards').iterative.meta, {
      step: 'Step 1 of 2',
      session: 'Session 2 next',
      startedWith: 'Started with Shape 0, Integrity 12 and Heat 60.',
      hidden: '1 counter is hidden by the GM.',
    });
    assert.equal(model('iterative-starting').iterative.meta.session, '1 session');
    assert.equal(model('iterative-single').iterative.meta.step, '');
  });

  test('a start formula and a held start are stated beside the value', () => {
    const entry = model('iterative-cards', {
      mutate: (run) => {
        const [shape, integrity] = run.steps[0].iterative.startedWith;
        Object.assign(shape, { formulaValue: 3 });
        Object.assign(integrity, { formulaValue: 14, clamped: true });
      },
    });
    assert.equal(
      entry.iterative.meta.startedWith,
      'Started with Shape 0 (formula 3), Integrity 12 (formula 14, held at 12) and Heat 60.'
    );
  });
});

describe('verdicts', () => {
  test('a boundary states the step that succeeded and what carries into the next', () => {
    assert.deepEqual(model('iterative-starting').iterative.boundary, {
      stepIndex: 0,
      nextStepIndex: 1,
      verdict: {
        end: 'success',
        tone: 'success',
        icon: 'fas fa-flag-checkered',
        title: 'Rough out the blade succeeded',
        detail:
          'Step 2, Draw out the edge, is next. Starting it takes its own inputs. Every counter carries on, including Shape 60, Integrity 9 and Heat 35.',
        yields: [],
      },
    });
  });

  test('a final step’s success names the counter rule that chose its set', () => {
    const iterative = model('iterative-routes').iterative;
    const counters = [
      { counterId: 'shape', label: 'Shape', value: 100 },
      { counterId: 'integrity', label: 'Integrity', value: 9 },
    ];
    const verdict = iterativeStepEndVerdict(
      iterative,
      { stepEnd: { kind: 'success', resultGroupId: 'iw-edge-fine' }, counters },
      localize
    );
    assert.equal(verdict.title, 'Draw out the edge succeeded: Fine edge');
    assert.equal(
      verdict.detail,
      'Integrity finished at 9, which reaches Fine edge (8 or more). The workpiece is finished.'
    );
    assert.deepEqual(
      verdict.yields.map((item) => item.name),
      ['Longsword']
    );
  });

  test('a failure names the broken counter before the goal, and what it leaves', () => {
    const iterative = model('iterative-failed').iterative;
    const counters = [
      { counterId: 'shape', label: 'Shape', value: 40 },
      { counterId: 'integrity', label: 'Integrity', value: 0 },
    ];
    const slag = iterativeStepEndVerdict(
      iterative,
      { stepEnd: { kind: 'failure', resultGroupId: 'iw-edge-slag' }, counters },
      localize
    );
    assert.deepEqual(
      [slag.title, slag.tone, slag.icon],
      ['Draw out the edge failed: Slag', 'danger', 'fas fa-heart-crack']
    );
    assert.equal(
      slag.detail,
      'Integrity reached 0 before Shape reached 100. The step has failed and leaves Slag.'
    );
    const nothing = iterativeStepEndVerdict(
      model('iterative-failed-nothing').iterative,
      { stepEnd: { kind: 'failure', resultGroupId: null }, counters },
      localize
    );
    assert.equal(nothing.title, 'Rough out the blade failed');
    assert.equal(
      nothing.detail,
      'Integrity reached 0 before Shape reached 60. The step has failed and nothing is produced.'
    );
  });

  test('a redacted verdict names only "Step N"', () => {
    const base = {
      step: 'Step 1',
      redacted: true,
      set: { name: 'Qzx-Set', yields: [{ name: 'Qzx' }] },
      localize,
    };
    const success = iterativeVerdict({
      ...base,
      end: 'success',
      next: { index: 1, name: 'Qzx-Secret-Step' },
    });
    assert.deepEqual(
      [success.title, success.detail, success.yields],
      ['Step 1 succeeded', 'The next step is next.', []]
    );
    assert.equal(
      iterativeVerdict({ ...base, end: 'success' }).detail,
      'The workpiece is finished.'
    );
    const failure = iterativeVerdict({ ...base, end: 'failure' });
    assert.deepEqual([failure.title, failure.detail], ['Step 1 failed', '']);
  });
});

describe('rule text', () => {
  const labels = {
    counter: (id) => ({ heat: 'Heat' })[id] ?? null,
    action: (id) => ({ stoke: 'Stoke' })[id] ?? null,
  };
  test('each source and threshold reads in words', () => {
    assert.equal(
      ruleText({ source: 'counter', counterId: 'heat', op: '<', value: 4 }, labels, localize),
      'Heat < 4'
    );
    assert.equal(
      ruleText({ source: 'sessionCount', op: '=', value: 3 }, labels, localize),
      'exactly 3 sessions'
    );
    assert.equal(
      ruleText({ source: 'previousAction', actionIds: ['stoke'] }, labels, localize),
      'right after Stoke'
    );
    assert.equal(
      ruleText({ source: 'counter', counterId: 'gone', op: '<', value: 4 }, labels, localize),
      null
    );
    assert.deepEqual(
      ['>=', '<=', '>', '<', '='].map((op) => thresholdText(op, 2, localize)),
      ['2 or more', '2 or less', 'more than 2', 'less than 2', 'exactly 2']
    );
    assert.equal(listText(['a', 'b', 'c'], 'any', localize), 'a, b or c');
  });
});

describe('hidden counters (D18) and redaction', () => {
  for (const state of Object.keys(ITERATIVE_SCENARIOS)) {
    test(`${state}: neither an owner nor an observer who is not a GM reads a hidden counter`, () => {
      for (const actor of [WORKPIECE_ACTOR, { ...WORKPIECE_ACTOR, isOwner: false }]) {
        const entry = model(state, { actor });
        assert.doesNotMatch(JSON.stringify(entry), SENTINELS);
        if (state === 'iterative-redacted') assert.doesNotMatch(JSON.stringify(entry), IDENTITY);
      }
    });
  }

  test('a GM reads every counter, the hidden one marked, and no hidden count', () => {
    const entry = model('iterative-gm', { viewer: WORKPIECE_GM });
    assert.match(JSON.stringify(entry), SENTINELS);
    assert.equal(entry.iterative.hiddenCount, 0);
    assert.equal(entry.iterative.viewer, 'gm');
    const hidden = entry.iterative.counters.find((item) => item.counterId === 'qzxHidden');
    assert.equal(hidden.hidden, true);
    assert.equal(model('iterative-gm').iterative.hiddenCount, 1);
  });

  test('a requirement or a short cost on a hidden counter is worded without it', () => {
    const entry = model('iterative-cards', {
      mutate: (run) => {
        editAction(run, 'normalise', (action) => {
          action.availability.rules = [
            { source: 'counter', counterId: 'qzxHidden', op: '>=', value: 9000 },
          ];
        });
        editAction(run, 'planish', (action) => (action.costs[0].counterId = 'qzxHidden'));
        editAction(run, 'planish', (action) => (action.costs[0].amount = '9000'));
      },
    });
    assert.equal(card(entry, 'normalise').noteText, 'Its requirements aren’t met yet');
    const planish = card(entry, 'planish');
    assert.deepEqual(
      [planish.noteText, planish.costs, planish.noCost],
      ['The workpiece can’t cover this yet', [], false]
    );
    assert.doesNotMatch(JSON.stringify(entry), SENTINELS);
  });

  test('a hazard on a visible counter whose rule reads a hidden one is no hazard for a player', () => {
    const hiddenRule = (run) =>
      editAction(run, 'stoke', (action) => {
        action.effects[1].when.rules = [
          { source: 'counter', counterId: 'qzxHidden', op: '>=', value: 1 },
        ];
      });
    const player = card(model('iterative-cards', { mutate: hiddenRule }), 'stoke');
    assert.deepEqual(player.hazards, []);
    assert.notEqual(player.note, 'hazard');
    assert.doesNotMatch(JSON.stringify(player), SENTINELS);
    const gm = card(
      model('iterative-cards', { mutate: hiddenRule, viewer: WORKPIECE_GM }),
      'stoke'
    );
    assert.equal(gm.note, 'hazard');
    assert.match(gm.noteText, /Qzx-Hidden-Fit 7731/);
  });

  test('a logged delta on a hidden counter is left out of the sessions', () => {
    const entry = model('iterative-list', {
      mutate: (run) => {
        const [first] = run.steps[0].iterative.log;
        first.changed.push({ counterId: 'qzxHidden', delta: 7731 });
        first.paid.push({ counterId: 'qzxHidden', delta: -7731 });
      },
    });
    const oldest = entry.iterative.sessions.at(-1);
    assert.deepEqual(
      [oldest.paidText, oldest.changedText],
      ['Integrity −2, Heat −10', 'Shape +10']
    );
    assert.doesNotMatch(JSON.stringify(entry), SENTINELS);
  });

  test('a step’s own hidden ids drop a counter from that step alone', () => {
    const entry = model('iterative-routes', {
      mutate: (run) => (run.termsSnapshot.recipe.steps[1].iterative.hiddenCounterIds = ['heat']),
    });
    assert.deepEqual(
      entry.iterative.counters.map((item) => item.counterId),
      ['shape', 'integrity']
    );
    assert.equal(entry.iterative.hiddenCount, 2);
    assert.match(entry.iterative.progress.stages[0].endedWith, /Heat 35/);
    assert.doesNotMatch(entry.iterative.progress.stages[1].startsWith, /Heat/);
  });

  test('a future step’s carried counters and the boundary verdict drop that step’s hidden ids', () => {
    const hideHeat = (run) =>
      (run.termsSnapshot.recipe.steps[1].iterative.hiddenCounterIds = ['heat']);
    const ahead = model('iterative-cards').iterative.progress.stages[1];
    assert.equal(ahead.carriedWith, 'Shape 0, Integrity 12 and Heat 40');
    const hidden = model('iterative-cards', { mutate: hideHeat }).iterative;
    assert.equal(hidden.progress.stages[1].carriedWith, 'Shape 0 and Integrity 12');
    assert.deepEqual(hidden.progress.stages[1].carriedIds, ['shape', 'integrity']);
    assert.equal(hidden.progress.stages[0].carriedWith, '');
    const boundary = model('iterative-starting', { mutate: hideHeat }).iterative;
    assert.match(boundary.boundary.verdict.detail, /including Shape 60 and Integrity 9\.$/);
    const counters = [
      { counterId: 'shape', label: 'Shape', value: 70 },
      { counterId: 'heat', label: 'Heat', value: 20 },
    ];
    const pressed = { ...hidden, boundary: null };
    const ended = { kind: 'success', resultGroupId: null };
    const verdict = iterativeStepEndVerdict(pressed, { stepEnd: ended, counters }, localize);
    assert.match(verdict.detail, /including Shape 70\.$/);
  });

  test('a redacted run keeps its cards, counters and sessions but no routes, goal or names', () => {
    const { iterative } = model('iterative-redacted');
    assert.equal(iterative.redacted, true);
    assert.equal(iterative.routes, null);
    assert.equal(iterative.goal, null);
    assert.deepEqual(
      iterative.progress.stages.map((stage) => stage.name),
      ['Step 1']
    );
    assert.deepEqual(
      [iterative.progress.note, Math.round(iterative.progress.percent)],
      ['Shape 10 of 60', 17],
      'the progress keeps the goal’s counter and threshold, which the counter card already shows'
    );
    assert.ok(iterative.cards.length > 0 && iterative.counters.length > 0);
    assert.equal(iterative.sessions[0].check.text, 'Rolled privately by the GM');
  });

  test('a closed record takes its hidden counters from the live recipe, and none when it is gone', () => {
    const { active, history } = workpieceRuns('iterative-history');
    const read = (options) =>
      workpieceListing({ active: Object.values(active), history, ...options }).history.find(
        (entry) => entry.id === 'iw-run-failed'
      ).iterative;
    assert.deepEqual(
      read({}).counters.map((item) => item.counterId),
      ['shape', 'integrity', 'heat']
    );
    assert.equal(read({ viewer: WORKPIECE_GM }).counters.length, 4);
    const orphaned = read({ missing: ['iw-r-longsword'] });
    assert.deepEqual([orphaned.counters, orphaned.hiddenCount], [[], 0]);
    assert.equal(read({ missing: ['iw-r-longsword'], viewer: WORKPIECE_GM }).counters.length, 4);
  });
});
