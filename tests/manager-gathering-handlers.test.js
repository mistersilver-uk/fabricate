/**
 * The gathering workspace's write side (issue 1721): the draft handlers and the modifier handlers,
 * driven over a real gathering route model. The view state and the selected system sit in a
 * `SvelteMap` behind their thunks, as the shell's `$derived` values do, so a change after
 * construction reaches every handler. Each reconciler is called by hand where the shell's
 * `$effect` would run it.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SvelteMap } from 'svelte/reactivity';

import { flushSync } from '../node_modules/svelte/src/index-client.js';
import { createSvelteModuleCompiler } from './helpers/compile-svelte-module.js';

const MODIFIERS_PATH = 'src/ui/svelte/apps/manager/gatheringModifierHandlers.svelte.js';
const DRAFTS_PATH = 'src/ui/svelte/apps/manager/gatheringDraftHandlers.svelte.js';
const ROUTE_MODEL_PATH = 'src/ui/svelte/apps/manager/gatheringRouteModel.svelte.js';
const SAVE_FAILED = 'Save failed. Try again.';

const TASKS = Object.freeze([
  {
    id: 't1',
    name: 'Moon herbs',
    toolIds: ['tool-sickle'],
    dropRows: [
      { id: 'd1', quantity: 2, conditionModifiers: { biome: [{ id: 'b1', conditionId: 'forest' }] } },
      { id: 'd2', quantity: 1 },
      { id: 'd3', quantity: 1 },
    ],
  },
  { id: 't2', name: 'Crystal veins', dropRows: [] },
]);
const EVENTS = Object.freeze([
  { id: 'v1', name: 'Wolves', dropRate: 20, characterModifiers: [{ id: 'r1', modifierId: 'm1' }] },
]);
const SYSTEM_CONFIG = Object.freeze({
  tasks: TASKS,
  events: EVENTS,
  economy: {},
  conditions: { weather: { values: [{ id: 'rain' }, { id: 'clear' }] }, timeOfDay: {} },
  vocabularies: { biomes: { values: [{ id: 'forest' }, { id: 'cavern' }] } },
});
const MODIFIER_LIBRARY = Object.freeze([
  { id: 'm1', label: 'Herbalism', expression: '@skills.nat.total' },
  { id: 'm2', label: 'Herb lore', expression: '@skills.med.total' },
]);

const isPromise = (value) => value && typeof value.then === 'function';
function afterTruthyResult(result, callback) {
  if (isPromise(result)) {
    return result.then((value) => {
      if (value !== false) callback();
      return value;
    });
  }
  if (result !== false) callback();
  return result;
}

/** A keydown the steppers can read and the test can inspect afterwards. */
function keydown(key, value) {
  const event = { key, currentTarget: { value }, stopped: false, prevented: false };
  event.stopPropagation = () => {
    event.stopped = true;
  };
  event.preventDefault = () => {
    event.prevented = true;
  };
  return event;
}

describe('gathering draft and modifier handlers', () => {
  let compiler;
  let createGatheringModifierHandlers;
  let createGatheringDraftHandlers;
  let createGatheringRouteModel;
  const originalConfirm = globalThis.confirm;

  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-gathering-handlers-');
    ({ createGatheringModifierHandlers } = await compiler.loadWithClosure(MODIFIERS_PATH));
    ({ createGatheringDraftHandlers } = await compiler.load(DRAFTS_PATH));
    ({ createGatheringRouteModel } = await compiler.load(ROUTE_MODEL_PATH));
  });

  after(() => {
    compiler.cleanup();
  });

  afterEach(() => {
    globalThis.confirm = originalConfirm;
  });

  /** The three units over one live view state, with every store call, rail write and route logged. */
  function openHandlers({ store: overrides = {}, exit = true } = {}) {
    const live = new SvelteMap([
      ['viewState', { environments: [], gatheringConfig: { systems: { alchemy: SYSTEM_CONFIG } } }],
      ['system', { id: 'alchemy', features: { gathering: true } }],
    ]);
    const calls = [];
    const views = [];
    const log =
      (name, answer) =>
      (...args) => {
        calls.push([name, ...args]);
        return typeof answer === 'function' ? answer(...args) : answer;
      };
    const store = {
      validateGatheringLibraryTask: () => ({ valid: true, errors: [] }),
      addGatheringLibraryTask: log('addGatheringLibraryTask', { id: 't-new' }),
      duplicateGatheringLibraryTask: log('duplicateGatheringLibraryTask', { id: 't-copy' }),
      deleteGatheringLibraryTask: log('deleteGatheringLibraryTask', true),
      updateGatheringLibraryTask: log('updateGatheringLibraryTask', true),
      updateGatheringLibraryEvent: log('updateGatheringLibraryEvent', true),
      deleteGatheringLibraryEvent: log('deleteGatheringLibraryEvent', true),
      confirmGatheringLibraryTaskCompositionLoss: log('confirmTaskLoss', true),
      createEnvironmentDraft: log('createEnvironmentDraft', { id: 'env-new' }),
      ...overrides,
    };
    const navRail = { expandGroup: log('expandGroup'), setGroupExpanded: () => {} };
    const gathering = createGatheringRouteModel({
      store: () => store,
      viewState: () => live.get('viewState'),
      view: () => 'environments',
      selectedSystem: () => live.get('system'),
      selectedSystemId: () => live.get('system')?.id || '',
      canShowEnvironments: () => true,
      isGatheringRoute: () => true,
      navRail: () => navRail,
      text: (_key, fallback) => fallback,
    });
    const drafts = createGatheringDraftHandlers({
      store: () => store,
      services: () => ({ importSingleManagedItemFromDrop: log('import', { id: 'c9' }) }),
      gathering,
      navRail: () => navRail,
      selectedSystemId: () => live.get('system')?.id || '',
      canShowEnvironments: () => true,
      isPromise,
      afterTruthyResult,
      confirmRouteExit: log('confirmRouteExit', () => exit),
      setActiveView: (view) => views.push(view),
      text: (_key, fallback) => fallback,
    });
    const modifiers = createGatheringModifierHandlers({
      gathering,
      drafts,
      selectedSystemModifiers: () => MODIFIER_LIBRARY,
      text: (_key, fallback) => fallback,
    });
    return { gathering, drafts, modifiers, calls, views, live };
  }

  const dropIds = (gathering) => gathering.gatheringTaskDraft.dropRows.map((row) => row.id);

  it('opens each editor on its own route and stages a detached draft', () => {
    const { gathering, drafts, views, calls } = openHandlers();
    drafts.editGatheringTask('t1');

    assert.deepEqual(views, ['gathering-task-edit']);
    assert.equal(gathering.activeGatheringTab, 'tasks');
    assert.ok(calls.some((call) => call[0] === 'expandGroup' && call[1] === 'gathering'));
    assert.deepEqual(gathering.gatheringTaskDraft, TASKS[0]);
    assert.notStrictEqual(gathering.gatheringTaskDraft, TASKS[0], 'the draft is a copy');
    assert.equal(gathering.gatheringTaskDraftDirty, false, 'and starts clean against its baseline');

    drafts.editGatheringEvent('v1');
    assert.deepEqual(views, ['gathering-task-edit', 'gathering-event-edit']);
    assert.equal(gathering.activeGatheringTab, 'encounters');
  });

  it('returns to the library only when the route exit allows it', () => {
    const allowed = openHandlers();
    allowed.drafts.backToGatheringEventLibrary();
    assert.deepEqual(allowed.views, ['environments']);
    assert.equal(allowed.gathering.activeGatheringTab, 'encounters');

    const refused = openHandlers({ exit: false });
    refused.drafts.backToGatheringTaskLibrary();
    assert.deepEqual(refused.views, [], 'a refused exit commits no route');
  });

  it('creates an environment editor only for a created draft', async () => {
    const created = openHandlers();
    created.drafts.createEnvironment();
    assert.deepEqual(created.views, ['environment-edit']);

    const refused = openHandlers({
      store: { createEnvironmentDraft: () => Promise.resolve(null) },
    });
    refused.drafts.createEnvironment();
    await Promise.resolve();
    assert.deepEqual(refused.views, []);
  });

  it('selects a created task under the system selected when it is called', async () => {
    const { gathering, drafts, calls, live } = openHandlers({
      store: {
        addGatheringLibraryTask: (systemId) => {
          calls.push(['addGatheringLibraryTask', systemId]);
          return Promise.resolve({ id: 't-new' });
        },
      },
    });
    live.set('system', { id: 'smithing', features: { gathering: true } });
    flushSync();
    drafts.createGatheringTask();
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(calls.at(-1), ['addGatheringLibraryTask', 'smithing']);
    assert.equal(gathering.selectedGatheringTaskId, 't-new');
  });

  it('fails a task save the store answers with nothing, and keeps the baseline', async () => {
    const { gathering, drafts } = openHandlers({
      store: { updateGatheringLibraryTask: async () => undefined },
    });
    drafts.editGatheringTask('t1');
    drafts.updateSelectedGatheringTask({ name: 'Sun herbs' });

    assert.equal(await drafts.saveGatheringTaskDraft(), false);
    assert.equal(gathering.gatheringTaskSaveError, SAVE_FAILED);
    assert.equal(gathering.gatheringTaskDraftDirty, true);
    assert.equal(gathering.gatheringTaskSaving, false);
  });

  it('lands an event save the store answers with nothing, and rebaselines', async () => {
    const { gathering, drafts } = openHandlers({
      store: { updateGatheringLibraryEvent: async () => undefined },
    });
    drafts.editGatheringEvent('v1');
    drafts.updateSelectedGatheringEvent({ name: 'Wargs' });

    assert.equal(await drafts.saveGatheringEventDraft(), true);
    assert.equal(gathering.gatheringEventSaveError, '');
    assert.equal(gathering.gatheringEventDraftDirty, false);
  });

  it('fails an event save the store refuses or rejects', async () => {
    for (const answer of [async () => false, async () => Promise.reject(new Error('boom'))]) {
      const { gathering, drafts } = openHandlers({ store: { updateGatheringLibraryEvent: answer } });
      drafts.editGatheringEvent('v1');
      drafts.updateSelectedGatheringEvent({ name: 'Wargs' });
      const original = console.error;
      console.error = () => {};
      try {
        assert.equal(await drafts.saveGatheringEventDraft(), false);
      } finally {
        console.error = original;
      }
      assert.equal(gathering.gatheringEventSaveError, SAVE_FAILED);
      assert.equal(gathering.gatheringEventDraftDirty, true);
    }
  });

  it('keeps the draft and adds no error when the composition-loss warning is cancelled', async () => {
    const { gathering, drafts, calls } = openHandlers({
      store: { confirmGatheringLibraryTaskCompositionLoss: async () => false },
    });
    drafts.editGatheringTask('t1');
    drafts.updateSelectedGatheringTask({ name: 'Sun herbs' });

    assert.equal(await drafts.saveGatheringTaskDraft(), false);
    assert.equal(gathering.gatheringTaskDraft.name, 'Sun herbs');
    assert.equal(gathering.gatheringTaskSaveError, '');
    assert.ok(!calls.some((call) => call[0] === 'updateGatheringLibraryTask'), 'nothing saved');
  });

  it('keeps the task editor open when the store refuses a delete', async () => {
    const { gathering, drafts, views } = openHandlers({
      store: { deleteGatheringLibraryTask: async () => false },
    });
    drafts.editGatheringTask('t1');
    await drafts.deleteGatheringTaskDraft();

    assert.deepEqual(views, ['gathering-task-edit']);
    assert.ok(gathering.gatheringTaskDraft, 'the draft survives the refusal');
  });

  it('asks before deleting an event, and leaves the editor once it is gone', async () => {
    const { gathering, drafts, views, calls } = openHandlers();
    drafts.editGatheringEvent('v1');
    globalThis.confirm = () => false;
    await drafts.deleteGatheringEventDraft();
    assert.ok(!calls.some((call) => call[0] === 'deleteGatheringLibraryEvent'), 'a no deletes nothing');

    globalThis.confirm = () => true;
    await drafts.deleteGatheringEventDraft();
    assert.deepEqual(calls.at(-2), ['deleteGatheringLibraryEvent', 'alchemy', 'v1']);
    assert.equal(gathering.gatheringEventDraft, null);
    assert.deepEqual(views.at(-1), 'environments');
  });

  it('keeps the drop selection on a real row through add, duplicate, move and delete', () => {
    const { gathering, drafts } = openHandlers();
    drafts.editGatheringTask('t1');

    drafts.addGatheringTaskDrop();
    const added = gathering.selectedGatheringDropId;
    assert.match(added, /^drop-[a-z0-9]+-[a-z0-9]{5}$/);
    assert.deepEqual(dropIds(gathering), ['d1', 'd2', 'd3', added]);

    drafts.duplicateGatheringTaskDrop('d1');
    const copy = gathering.selectedGatheringDropId;
    assert.deepEqual(dropIds(gathering), ['d1', copy, 'd2', 'd3', added]);
    assert.deepEqual(gathering.gatheringTaskDraft.dropRows[1].conditionModifiers, TASKS[0].dropRows[0].conditionModifiers);

    drafts.moveGatheringTaskDrop('d2', 'up');
    assert.deepEqual(dropIds(gathering), ['d1', 'd2', copy, 'd3', added]);
    drafts.moveGatheringTaskDrop('d1', 'up');
    assert.deepEqual(dropIds(gathering), ['d1', 'd2', copy, 'd3', added], 'the first row stays first');

    drafts.deleteGatheringTaskDrop(copy);
    assert.equal(gathering.selectedGatheringDropId, 'd3', 'the row that took its place');
    drafts.deleteGatheringTaskDrop(added);
    assert.equal(gathering.selectedGatheringDropId, 'd3', 'the last row falls back to the new last');
  });

  it('imports a dropped component into its row with the raw drop data', async () => {
    const { gathering, drafts, calls } = openHandlers();
    drafts.editGatheringTask('t1');
    const data = { type: 'Item', uuid: 'Item.x' };

    assert.equal(await drafts.importGatheringTaskDrop('d2', data), true);
    assert.strictEqual(calls.find((call) => call[0] === 'import')[1], data);
    assert.equal(gathering.gatheringTaskDraft.dropRows[1].componentId, 'c9');
    assert.equal(gathering.selectedGatheringDropId, 'd2');
  });

  it('steps a drop count with the arrow keys and stops every keydown propagating', () => {
    const { gathering, drafts } = openHandlers();
    drafts.editGatheringTask('t1');
    const row = gathering.gatheringTaskDraft.dropRows[0];

    const up = keydown('ArrowUp', '2');
    drafts.onGatheringDropCountKeydown(row, up);
    assert.deepEqual([up.stopped, up.prevented, up.currentTarget.value], [true, true, '3']);
    assert.equal(gathering.gatheringTaskDraft.dropRows[0].quantity, 3);

    const letter = keydown('a', '3');
    drafts.onGatheringDropCountKeydown(row, letter);
    assert.deepEqual([letter.stopped, letter.prevented], [true, false]);
    assert.equal(gathering.gatheringTaskDraft.dropRows[0].quantity, 3, 'no write');
  });

  it('adds and removes a Required Tools reference once', () => {
    const { gathering, drafts } = openHandlers();
    drafts.editGatheringTask('t1');
    drafts.addToolReferenceToSelectedTask('tool-sickle');
    drafts.addToolReferenceToSelectedTask('tool-lantern');
    assert.deepEqual(gathering.gatheringTaskDraft.toolIds, ['tool-sickle', 'tool-lantern']);
    drafts.removeToolReferenceFromSelectedTask('tool-sickle');
    assert.deepEqual(gathering.gatheringTaskDraft.toolIds, ['tool-lantern']);
  });

  it('reconciles each picker to an option its subject can still attach', () => {
    const { gathering, drafts, modifiers } = openHandlers();
    drafts.editGatheringTask('t1');
    gathering.selectedGatheringDropId = 'd1';
    modifiers.reconcileDropPickers();

    assert.equal(modifiers.gatheringDropModifierPickerSelection('biome'), 'cavern', 'forest is attached');
    assert.equal(modifiers.gatheringDropModifierPickerSelection('weather'), 'rain');
    assert.equal(modifiers.gatheringDropModifierPickerSelection('timeOfDay'), '');

    modifiers.setGatheringDropModifierPickerSelection('weather', 'clear');
    modifiers.reconcileDropPickers();
    assert.equal(modifiers.gatheringDropModifierPickerSelection('weather'), 'clear', 'a live pick stays');
    assert.equal(modifiers.gatheringEventModifierPickerSelection('weather'), '', 'the event keeps its own');

    modifiers.addGatheringDropModifier('d1', 'weather', 'clear');
    modifiers.reconcileDropPickers();
    assert.equal(modifiers.gatheringDropModifierPickerSelection('weather'), 'rain', 'an attached pick moves on');
  });

  it('adds, steps and deletes a condition modifier on the drop it names', () => {
    const { gathering, drafts, modifiers } = openHandlers();
    drafts.editGatheringTask('t1');
    modifiers.addGatheringDropModifier('d2', 'weather', 'rain');
    modifiers.addGatheringDropModifier('d2', 'weather', 'rain');
    const [added] = gathering.gatheringTaskDraft.dropRows[1].conditionModifiers.weather;
    assert.equal(gathering.gatheringTaskDraft.dropRows[1].conditionModifiers.weather.length, 1);
    assert.match(added.id, /^weather-drop-/);

    const down = keydown('ArrowDown', '');
    modifiers.onGatheringDropModifierKeydown('d2', 'weather', added, down);
    assert.equal(down.stopped, true);
    assert.deepEqual(
      gathering.gatheringTaskDraft.dropRows[1].conditionModifiers.weather.map((m) => [m.operator, m.value]),
      [['-', 1]]
    );

    modifiers.deleteGatheringDropModifier('d2', 'weather', added.id);
    assert.deepEqual(gathering.gatheringTaskDraft.dropRows[1].conditionModifiers.weather, []);
  });

  it('picks a library modifier for an event once, clearing the search', () => {
    const { gathering, drafts, modifiers } = openHandlers();
    drafts.editGatheringEvent('v1');
    modifiers.characterModifierSearchTerm = 'herb';
    assert.deepEqual(
      modifiers.eventCharacterModifierSearchSuggestions.map((entry) => entry.id),
      ['m2'],
      'the attached entry is not suggested'
    );

    modifiers.pickCharacterModifierForEvent('m1');
    assert.equal(modifiers.characterModifierSearchTerm, 'herb', 'an attached pick changes nothing');
    modifiers.pickCharacterModifierForEvent('m2');
    assert.equal(modifiers.characterModifierSearchTerm, '');
    const refs = gathering.gatheringEventDraft.characterModifiers;
    assert.deepEqual(refs.map((ref) => ref.modifierId), ['m1', 'm2']);
    assert.match(refs[1].id, /^char-mod-m2-2-[a-z0-9]{4}$/);

    modifiers.setEventCharacterModifierOverrideEnabled(refs[1], true, MODIFIER_LIBRARY[1]);
    assert.equal(gathering.gatheringEventDraft.characterModifiers[1].expressionOverride, '@skills.med.total');
    modifiers.onDeleteEventCharacterModifier('r1');
    assert.deepEqual(gathering.gatheringEventDraft.characterModifiers.map((ref) => ref.id), [refs[1].id]);
  });

  it('adds a drop reference to the library default and deletes only a real one', async () => {
    const { gathering, drafts, modifiers } = openHandlers();
    drafts.editGatheringTask('t1');
    await modifiers.onAddDropCharacterModifier('d2');
    const [ref] = gathering.gatheringTaskDraft.dropRows[1].characterModifiers;
    assert.equal(ref.modifierId, 'm1', 'no pick falls back to the first library entry');

    const before = gathering.gatheringTaskDraft;
    await modifiers.onDeleteDropCharacterModifier('d2', 'missing');
    assert.strictEqual(gathering.gatheringTaskDraft, before, 'an unknown ref writes nothing');
    await modifiers.onDeleteDropCharacterModifier('d2', ref.id);
    assert.deepEqual(gathering.gatheringTaskDraft.dropRows[1].characterModifiers, []);
  });
});
