/**
 * The admin store's environment-draft behaviour corpus (issue 1708): the environment-store call log
 * with full arguments, the validation state in full including its monotonic attempt, the discard
 * guard's four call-ins, the composition projection, and the whole published object after each op.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertConvergent,
  assertStatePatch,
  createSectionHarness,
  makeCorpusSystem,
} from '../helpers/adminSectionCorpus.js';

function seamCalls(entries, seam) {
  return entries.filter((entry) => entry.seam === seam).map((entry) => entry.args);
}

const ENVIRONMENT_KEYS = [
  'selectedEnvironmentId',
  'environmentDraft',
  'environmentDraftDirty',
  'environmentDraftIsNew',
  'environmentSaving',
  'environmentSaveError',
  'environmentValidationState',
  'environmentComposition',
];

function environmentPatch(state) {
  return Object.fromEntries(ENVIRONMENT_KEYS.map((key) => [key, state[key]]));
}

function makeEnvironment(overrides = {}) {
  return {
    id: 'env1',
    craftingSystemId: 'sys1',
    name: 'Riverbank',
    description: '',
    enabled: false,
    selectionMode: 'targeted',
    dangerLevel: 'safe',
    sceneUuid: null,
    includedRealmIds: [],
    ...overrides,
  };
}

function world(overrides = {}) {
  return {
    systems: [
      makeCorpusSystem(),
      makeCorpusSystem({ id: 'sys2', name: 'System Two', features: { gathering: true } }),
    ],
    environments: [makeEnvironment(), makeEnvironment({ id: 'env2', name: 'Cavern' })],
    ...overrides,
  };
}

/** A structured store rejection, in the shape `_buildEnvironmentValidationState` reads. */
function validationError() {
  const error = new Error('invalid');
  error.errors = ['selectionMode requires a value'];
  return error;
}

describe('adminStore environment draft section corpus', () => {
  it('selecting an environment publishes only the environment keys', async () => {
    const harness = await createSectionHarness(world());
    try {
      const before = harness.state();
      assert.equal(before.selectedEnvironmentId, 'env1', 'the first environment is selected');
      assert.equal(before.environmentDraft.name, 'Riverbank');
      assert.equal(before.canShowEnvironmentsTab, true);

      harness.drain();
      assert.equal(await harness.store.selectEnvironment('env2'), true);
      const after = harness.state();
      assertStatePatch(before, after, environmentPatch(after));
      assert.equal(after.selectedEnvironmentId, 'env2');
      assert.equal(after.environmentDraft.name, 'Cavern');
      assert.equal(
        await harness.store.selectEnvironment('env2'),
        true,
        'reselecting the same id is a no-op'
      );
    } finally {
      harness.dispose();
    }
  });

  it('updateEnvironmentDraft normalizes by field and patches out of band', async () => {
    const harness = await createSectionHarness(world());
    try {
      harness.resetPublishes();
      assert.equal(
        harness.store.updateEnvironmentDraft({
          name: 'Riverbank North',
          enabled: 'yes',
          compositionMode: 'nonsense',
          sceneUuid: '   ',
          biomes: ['Forest', ' forest ', ''],
          enabledTaskIds: ['t1', 't1', ' t2 '],
          eventDropRateAdjustments: { e1: 5, e2: 0, e3: 500 },
          notAField: 'ignored',
        }),
        true
      );
      assert.equal(harness.publishes(), 1, 'a draft update is one out-of-band publish');
      const draft = harness.state().environmentDraft;
      assert.equal(draft.name, 'Riverbank North');
      assert.equal(draft.enabled, false, 'only a strict true enables');
      assert.equal(draft.compositionMode, 'automatic');
      assert.equal(draft.sceneUuid, null);
      assert.deepStrictEqual(draft.biomes, ['forest']);
      assert.deepStrictEqual(draft.enabledTaskIds, ['t1', 't2']);
      assert.deepStrictEqual(draft.eventDropRateAdjustments, { e1: 5 });
      assert.equal('notAField' in draft, false);
      assert.equal(harness.state().environmentDraftDirty, true);
      assert.deepStrictEqual(seamCalls(harness.drain(), 'environments.update'), []);
    } finally {
      harness.dispose();
    }
  });

  it('a rejected save publishes the full validation state and its attempt increments', async () => {
    const harness = await createSectionHarness(
      world({ failures: { 'environments.update': [validationError(), validationError()] } })
    );
    try {
      harness.store.updateEnvironmentDraft({ name: 'Riverbank North' });
      harness.drain();

      const first = await harness.store.saveEnvironmentDraft();
      assert.equal(first.ok, false);
      assert.deepStrictEqual(harness.state().environmentValidationState, {
        summary: 'FABRICATE.Admin.Environments.ValidationSummaryOne',
        errors: [
          {
            message: 'selectionMode requires a value',
            path: 'environment.selectionMode',
            taskId: null,
            fieldSelector: '[data-environment-field="environment.selectionMode"]',
            id: 'environment-validation-environment-selectionMode-0',
          },
        ],
        firstInvalidField: {
          message: 'selectionMode requires a value',
          path: 'environment.selectionMode',
          taskId: null,
          fieldSelector: '[data-environment-field="environment.selectionMode"]',
          id: 'environment-validation-environment-selectionMode-0',
        },
        attempt: 1,
      });

      const second = await harness.store.saveEnvironmentDraft();
      assert.equal(second.ok, false);
      assert.equal(
        harness.state().environmentValidationState.attempt,
        2,
        'the attempt counter increments across saves rather than resetting'
      );
      assert.equal(harness.state().environmentSaving, false);
    } finally {
      harness.dispose();
    }
  });

  it('a save writes the whole payload and clears the draft state', async () => {
    const harness = await createSectionHarness(world());
    try {
      harness.store.updateEnvironmentDraft({ name: 'Riverbank North', dangerLevel: 'unsafe' });
      // Captured BEFORE the save: afterwards the draft is re-seeded from what the store answered,
      // so comparing against it would be circular and a corrupted payload would pass.
      const draftBefore = harness.state().environmentDraft;
      harness.drain();
      const result = await harness.store.saveEnvironmentDraft();
      const entries = harness.drain();
      assert.equal(result.ok, true);
      const [[id, payload]] = seamCalls(entries, 'environments.update');
      assert.equal(id, 'env1');
      assert.deepStrictEqual(payload, draftBefore, 'the payload is the draft the GM saw, field for field');
      assert.equal(harness.state().environmentDraftDirty, false);
      assert.equal(harness.state().environmentSaveError, null);

      result.environment.name = 'mutated';
      assert.equal(
        harness.state().environmentDraft.name,
        'Riverbank North',
        'the returned environment is a clone, so mutating it cannot reach the draft'
      );
    } finally {
      harness.dispose();
    }
  });

  it('an in-flight save publishes the saving flag and clears it', async () => {
    const harness = await createSectionHarness(world());
    try {
      harness.store.updateEnvironmentDraft({ name: 'Riverbank North' });
      const seen = [];
      const unsubscribe = harness.store.viewState.subscribe((state) =>
        seen.push(state.environmentSaving)
      );
      seen.length = 0;
      await harness.store.saveEnvironmentDraft();
      unsubscribe();
      // `buildState` always republishes `environmentSaving: false`, so only the in-flight `true`
      // depends on the out-of-band patch — and it is what disables Save against a double submit.
      assert.deepStrictEqual(
        [...new Set(seen)],
        [true, false],
        'the save publishes in-flight, then settles'
      );
    } finally {
      harness.dispose();
    }
  });

  it('createEnvironmentDraft opens an unpersisted draft and cancel falls back to the list', async () => {
    const harness = await createSectionHarness(world());
    try {
      const created = await harness.store.createEnvironmentDraft();
      assert.equal(created.craftingSystemId, 'sys1');
      assert.equal(harness.state().environmentDraftIsNew, true);
      assert.equal(harness.state().selectedEnvironmentId, '');
      created.name = 'mutated';
      assert.notEqual(harness.state().environmentDraft.name, 'mutated');
      harness.drain();

      await harness.store.saveEnvironmentDraft();
      const [[payload]] = seamCalls(harness.drain(), 'environments.create');
      assert.equal('id' in payload, false, 'a new draft is created without an id');
      assert.equal(harness.state().environmentDraftIsNew, false);

      await harness.store.createEnvironmentDraft();
      await harness.store.cancelEnvironmentDraft();
      assert.equal(harness.state().environmentDraftIsNew, false);
      assert.equal(harness.state().environmentDraftDirty, false);
    } finally {
      harness.dispose();
    }
  });

  it('a dirty draft gates selectSystem, createSystem, setTab and the gathering toggle', async () => {
    const harness = await createSectionHarness(
      world({ answers: { choiceDialog: ['cancel', 'cancel', 'cancel', 'cancel'] } })
    );
    try {
      harness.store.updateEnvironmentDraft({ name: 'Riverbank North' });
      harness.drain();

      assert.equal(await harness.store.selectSystem('sys2'), false);
      assert.equal(await harness.store.createSystem(), false);
      assert.equal(await harness.store.toggleFeature('gathering', false), false);
      await harness.store.setTab('environments');
      assert.equal(await harness.store.setTab('recipes'), false);
      const entries = harness.drain();
      assert.equal(
        seamCalls(entries, 'choiceDialog').length,
        4,
        'each of the four call-ins raises the prompt'
      );
      assert.deepStrictEqual(seamCalls(entries, 'systemManager.createSystem'), []);
      assert.equal(harness.state().environmentDraftDirty, true, 'a cancel keeps the draft');
    } finally {
      harness.dispose();
    }
  });

  it('a discarded dirty draft resets for the newly selected system', async () => {
    const harness = await createSectionHarness(world());
    try {
      harness.store.updateEnvironmentDraft({ name: 'Riverbank North' });
      harness.drain();
      assert.equal(await harness.store.selectSystem('sys2'), true);
      const state = harness.state();
      assert.equal(state.selectedEnvironmentId, '', 'the second system has no environments');
      assert.equal(state.environmentDraft, null);
      assert.equal(state.environmentDraftDirty, false);
      assert.deepStrictEqual(
        seamCalls(harness.drain(), 'environments.update'),
        [],
        'a discard writes nothing'
      );
    } finally {
      harness.dispose();
    }
  });

  it('a saved dirty draft is persisted before the navigation proceeds', async () => {
    const harness = await createSectionHarness(world({ answers: { choiceDialog: ['save'] } }));
    try {
      harness.store.updateEnvironmentDraft({ name: 'Riverbank North' });
      harness.drain();
      assert.equal(await harness.store.selectSystem('sys2'), true);
      const [[id, payload]] = seamCalls(harness.drain(), 'environments.update');
      assert.equal(id, 'env1');
      assert.equal(payload.name, 'Riverbank North');
    } finally {
      harness.dispose();
    }
  });

  it('duplicate, delete and reorder each name their own arguments', async () => {
    const harness = await createSectionHarness(world());
    try {
      harness.drain();
      const duplicate = await harness.store.duplicateEnvironmentDraft();
      assert.deepStrictEqual(seamCalls(harness.drain(), 'environments.duplicate'), [['env1']]);
      assert.equal(harness.state().selectedEnvironmentId, 'env1-copy');
      duplicate.name = 'mutated';
      assert.notEqual(harness.state().environmentDraft.name, 'mutated');

      const reordered = await harness.store.reorderEnvironments(['env2', 'env1', 'env1-copy']);
      assert.deepStrictEqual(seamCalls(harness.drain(), 'environments.reorder'), [
        ['sys1', ['env2', 'env1', 'env1-copy']],
      ]);
      assert.deepStrictEqual(
        reordered.map((environment) => environment.id),
        ['env2', 'env1', 'env1-copy']
      );

      await harness.store.moveEnvironmentDraft('env1', 'up');
      assert.deepStrictEqual(seamCalls(harness.drain(), 'environments.reorder'), [
        ['sys1', ['env1', 'env2', 'env1-copy']],
      ]);

      assert.equal(await harness.store.deleteEnvironmentDraft('env1-copy'), true);
      const deleteEntries = harness.drain();
      assert.equal(seamCalls(deleteEntries, 'confirmDialog').length, 1);
      assert.deepStrictEqual(seamCalls(deleteEntries, 'environments.delete'), [['env1-copy']]);
      assert.equal(
        harness.state().selectedEnvironmentId,
        'env2',
        'deleting the selected row falls to the one that took its index'
      );
    } finally {
      harness.dispose();
    }
  });

  it('a refused delete confirm leaves the environment in place', async () => {
    const harness = await createSectionHarness(world({ answers: { confirmDialog: [false] } }));
    try {
      harness.drain();
      assert.equal(await harness.store.deleteEnvironmentDraft('env2'), false);
      assert.deepStrictEqual(seamCalls(harness.drain(), 'environments.delete'), []);
    } finally {
      harness.dispose();
    }
  });

  it('realm membership and the enabled toggle rewrite the open draft in place', async () => {
    const harness = await createSectionHarness(world());
    try {
      harness.drain();
      assert.equal(await harness.store.setEnvironmentRealmMembership('env1', 'realm1', true), true);
      const [[, payload]] = seamCalls(harness.drain(), 'environments.update');
      assert.deepStrictEqual(payload.includedRealmIds, ['realm1']);
      assert.deepStrictEqual(harness.state().environmentDraft.includedRealmIds, ['realm1']);
      assert.equal(
        await harness.store.setEnvironmentRealmMembership('env1', 'realm1', true),
        true,
        'an already-satisfied membership is a reported no-op'
      );
      assert.deepStrictEqual(seamCalls(harness.drain(), 'environments.update'), []);

      assert.equal(await harness.store.toggleEnvironmentEnabled('env1', true), true);
      assert.equal(harness.state().environmentDraft.enabled, true);
      assert.equal(await harness.store.toggleEnvironmentEnabled('ghost', true), false);
    } finally {
      harness.dispose();
    }
  });

  it('a repeated realm-membership write converges on one persisted environment', async () => {
    const harness = await createSectionHarness(world());
    try {
      await assertConvergent(
        harness,
        () => harness.store.setEnvironmentRealmMembership('env1', 'realm1', true),
        ['environments.update'],
        { repeat: 'silent' }
      );
    } finally {
      harness.dispose();
    }
  });

  it('the composition projection classifies and counts the gathering library', async () => {
    const harness = await createSectionHarness(
      world({
        settings: {
          lastManagedCraftingSystem: 'sys1',
          gatheringConfig: {
            systems: {
              sys1: {
                tasks: [
                  { id: 'task-a', name: 'Fish', enabled: true, toolIds: ['rod', ' rod '] },
                  { id: 'task-b', name: 'Dig', enabled: false },
                ],
                events: [{ id: 'event-a', name: 'Storm', enabled: true }],
              },
            },
          },
        },
      })
    );
    try {
      harness.store.updateEnvironmentDraft({
        compositionMode: 'manual',
        enabledTaskIds: ['task-a'],
      });
      const composition = harness.state().environmentComposition;
      assert.equal(composition.compositionMode, 'manual');
      assert.deepStrictEqual(
        composition.tasks.map((row) => [row.id, row.compositionState, row.runtimeState]),
        [
          ['task-a', 'explicitlyIncluded', 'available'],
          ['task-b', 'libraryDisabled', 'unavailable'],
        ]
      );
      assert.deepStrictEqual(
        composition.events.map((row) => [row.id, row.compositionState]),
        [['event-a', 'candidate']]
      );
      assert.equal(composition.counts.availableTasks, 1);
      assert.equal(composition.counts.diagnosticTasks, 1);
      assert.equal(composition.counts.requiredTools, 1, 'tool ids are trimmed before counting');

      assert.equal(harness.store.reorderEnvironmentRecord('task', 0, 0), false);
      assert.equal(harness.store.excludeEnvironmentRecord('task', 'task-a'), true);
      assert.deepStrictEqual(harness.state().environmentDraft.enabledTaskIds, []);
      assert.equal(harness.store.includeEnvironmentRecord('task', 'task-a'), true);
      assert.deepStrictEqual(harness.state().environmentDraft.taskOrder, ['task-a']);
      assert.equal(harness.store.forceIncludeEnvironmentRecord('event', 'event-a'), true);
      assert.deepStrictEqual(harness.state().environmentDraft.forcedEventIds, ['event-a']);
      assert.equal(harness.store.restoreEnvironmentRecord('task', 'task-b'), true);
      assert.equal(harness.store.setEnvironmentCompositionMode('automatic'), true);
      assert.equal(harness.state().environmentDraft.compositionMode, 'automatic');
    } finally {
      harness.dispose();
    }
  });

  it('an unreadable environment store clears the draft and publishes the error', async () => {
    const harness = await createSectionHarness(world());
    try {
      harness.services.getGatheringEnvironmentStore = () => null;
      await harness.store.refresh();
      const state = harness.state();
      assert.equal(state.canShowEnvironmentsTab, true);
      assert.equal(state.environmentsError, 'FABRICATE.Admin.Environments.StoreUnavailable');
      assert.deepStrictEqual(state.environments, []);
      assert.equal(state.environmentDraft, null);
    } finally {
      harness.dispose();
    }
  });

  it('a system without gathering hides the tab and drops the draft entirely', async () => {
    const harness = await createSectionHarness(
      world({
        systems: [
          makeCorpusSystem(),
          makeCorpusSystem({ id: 'sys2', name: 'System Two', features: { gathering: false } }),
        ],
      })
    );
    try {
      assert.equal(await harness.store.selectSystem('sys2'), true);
      const state = harness.state();
      assert.equal(state.canShowEnvironmentsTab, false);
      assert.equal(state.environmentDraft, null);
      assert.equal(state.selectedEnvironmentId, '');
      assert.equal(await harness.store.createEnvironmentDraft(), null);
    } finally {
      harness.dispose();
    }
  });
});
