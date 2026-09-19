/**
 * `interactableGrant` under a throwing `globalThis` trap: request routing, the active-GM re-check,
 * the grant payload, the local-open/emit split and denial routing, all through injected functions.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGrantPayload,
  denialMessage,
  openGrant,
  requestActivation,
  routeActivationDenied,
  validateAndGrant,
} from '../../src/canvas/interactableGrant.js';
import { underFoundryGlobalTrap } from '../helpers/foundryGlobalTrap.js';

function sealed(name, body) {
  test(name, () => underFoundryGlobalTrap('interactableGrant', body));
}

function behaviorSystem(overrides = {}) {
  return {
    interactableType: 'tool',
    sourceUuid: 'Fabricate.sysA.tool.tool-1',
    systemId: 'sysA',
    toolId: 'tool-1',
    taskId: null,
    environmentId: null,
    name: 'Forge Anvil',
    presentation: { promptText: null, hidden: false },
    linkedVisual: { uuid: null, documentName: null, mode: 'marker', missingPolicy: 'warn' },
    node: null,
    state: {
      enabled: true,
      consumed: false,
      locked: false,
      uses: { max: null, used: 0 },
      cooldown: { seconds: null, lastUsedWorldTime: null },
    },
    activation: { trigger: 'regionEnter', audience: 'players' },
    ...overrides,
  };
}

function placedBehavior(system) {
  const scene = { id: 'scene-1' };
  const region = { id: 'region-1', parent: scene };
  return { id: 'beh-1', type: 'fabricate.interactable', system, parent: region };
}

function activationRequest(overrides = {}) {
  return {
    action: 'interactableActivate',
    sceneId: 'scene-1',
    regionId: 'region-1',
    behaviorId: 'beh-1',
    interactableType: 'tool',
    actorId: 'a1',
    userId: 'u-1',
    ts: 7,
    ...overrides,
  };
}

/** Every collaborator is explicit; nothing here may fall back to a Foundry global. */
function collaborators(overrides = {}) {
  const calls = { emitted: [], warned: [], opened: [], granted: [], closed: [], shown: [] };
  const deps = {
    getAppClass: () => ({
      show: (tab, options) => {
        calls.shown.push({ tab, options });
        return Promise.resolve();
      },
    }),
    resolveBehavior: () => placedBehavior(behaviorSystem()),
    emit: (payload) => calls.emitted.push(payload),
    isActiveGM: () => false,
    hasActiveGM: () => true,
    currentUserId: () => 'gm-1',
    worldTime: () => 0,
    getUser: () => ({ id: 'u-1', isGM: false }),
    canControlActor: () => true,
    sourceExists: () => true,
    environmentExists: () => true,
    tokenInside: () => true,
    resolutionDeps: () => ({
      getTool: () => ({ id: 'tool-1', componentId: 'comp-axe', label: 'Forge Anvil' }),
    }),
    notifyWarn: (message) => calls.warned.push(message),
    localize: (key) => key,
    now: () => 1234,
    onGrantClose: (args) => calls.closed.push(args),
    validateAndGrant: (request) => calls.granted.push(request),
    openGrant: (payload) => calls.opened.push(payload),
    ...overrides,
  };
  return { deps, calls };
}

sealed('the active GM validates locally and never emits', () => {
  const { deps, calls } = collaborators({ isActiveGM: () => true });

  requestActivation(placedBehavior(behaviorSystem()), { actorId: 'a1', userId: 'gm-1' }, deps);

  assert.equal(calls.emitted.length, 0);
  assert.equal(calls.granted.length, 1, 'the injected thunk is used, so a patched method wins');
  assert.equal(calls.granted[0].action, 'interactableActivate');
  assert.equal(calls.granted[0].behaviorId, 'beh-1');
  assert.equal(calls.granted[0].sceneId, 'scene-1');
  assert.equal(calls.granted[0].userId, 'gm-1');
  assert.equal(calls.granted[0].activationSource, 'regionEnter');
  assert.equal(calls.granted[0].ts, 1234, 'the request stamp comes from the injected clock');
});

sealed('a player emits the request and defaults its userId and source', () => {
  const { deps, calls } = collaborators({ currentUserId: () => 'u-1' });

  requestActivation(placedBehavior(behaviorSystem()), { actorId: 'a1' }, deps);

  assert.equal(calls.emitted.length, 1);
  assert.equal(calls.emitted[0].userId, 'u-1');
  assert.equal(calls.emitted[0].actorId, 'a1');
  assert.equal(calls.emitted[0].activationSource, 'regionEnter');
  assert.equal(calls.emitted[0].sourceUuid, 'Fabricate.sysA.tool.tool-1');
});

sealed('with no active GM the request warns and is dropped', () => {
  const { deps, calls } = collaborators({ hasActiveGM: () => false });

  requestActivation(placedBehavior(behaviorSystem()), { actorId: 'a1' }, deps);

  assert.equal(calls.emitted.length, 0);
  assert.deepEqual(calls.warned, ['FABRICATE.Canvas.Interactable.NoActiveGM']);
});

sealed('an unlocalizable warning still says something', () => {
  const { deps, calls } = collaborators({ hasActiveGM: () => false, localize: () => undefined });

  requestActivation(placedBehavior(behaviorSystem()), {}, deps);

  assert.deepEqual(calls.warned, ['A GM must be online to gather here.']);
});

sealed('a behaviour that is not an interactable requests nothing', () => {
  const { deps, calls } = collaborators({ isActiveGM: () => true });

  requestActivation({ id: 'beh-1', type: 'other', system: behaviorSystem() }, {}, deps);
  requestActivation({ id: 'beh-1', type: 'fabricate.interactable', system: behaviorSystem() }, {}, deps);

  assert.equal(calls.granted.length, 0, 'no behaviour system and no ref both abort');
  assert.equal(calls.emitted.length, 0);
});

sealed('a validated request emits the whole grant payload to a remote requester', async () => {
  const { deps, calls } = collaborators();

  assert.equal(await validateAndGrant(activationRequest(), deps), true);

  assert.equal(calls.opened.length, 0);
  assert.deepEqual(calls.emitted, [
    {
      action: 'interactableActivationGranted',
      userId: 'u-1',
      behaviorId: 'beh-1',
      requestId: '7',
      grant: {
        tab: 'crafting',
        context: {
          activeCanvasTool: {
            componentId: 'comp-axe',
            systemId: 'sysA',
            toolId: 'tool-1',
            label: 'Forge Anvil',
          },
        },
        ref: { sceneId: 'scene-1', regionId: 'region-1', behaviorId: 'beh-1' },
        interactableType: 'tool',
        environmentId: null,
        taskId: null,
        actorId: 'a1',
      },
    },
  ]);
});

sealed('the requesting GM opens locally through the injected thunk', async () => {
  const { deps, calls } = collaborators({ currentUserId: () => 'u-1' });

  assert.equal(await validateAndGrant(activationRequest(), deps), true);

  assert.equal(calls.emitted.length, 0);
  assert.equal(calls.opened.length, 1);
  assert.equal(calls.opened[0].grant.interactableType, 'tool');
});

sealed('a malformed request and a vanished behaviour are both refused', async () => {
  const { deps, calls } = collaborators();
  assert.equal(await validateAndGrant(null, deps), false);
  assert.equal(await validateAndGrant('nope', deps), false);
  assert.equal(calls.emitted.length, 0);

  const vanished = collaborators({ resolveBehavior: () => null });
  assert.equal(await validateAndGrant(activationRequest(), vanished.deps), false);
  assert.deepEqual(vanished.calls.emitted, [
    { action: 'interactableActivationDenied', userId: 'u-1', reason: null },
  ]);
});

sealed('each validation collaborator is consulted and routes its own denial reason', async () => {
  const cases = [
    [{ canControlActor: () => false }, 'CANNOT_CONTROL_ACTOR'],
    [{ tokenInside: () => false }, 'TOKEN_NOT_INSIDE'],
    [{ sourceExists: () => false }, 'SOURCE_MISSING'],
    [{ worldTime: () => 120, resolveBehavior: () => placedBehavior(cooling()) }, 'COOLDOWN'],
  ];
  for (const [overrides, reason] of cases) {
    const { deps, calls } = collaborators(overrides);
    assert.equal(await validateAndGrant(activationRequest(), deps), false);
    assert.deepEqual(calls.emitted, [
      { action: 'interactableActivationDenied', userId: 'u-1', reason },
    ]);
  }

  const elapsed = collaborators({
    worldTime: () => 200,
    resolveBehavior: () => placedBehavior(cooling()),
  });
  assert.equal(await validateAndGrant(activationRequest(), elapsed.deps), true);
});

function cooling() {
  return behaviorSystem({
    state: {
      ...behaviorSystem().state,
      cooldown: { seconds: 60, lastUsedWorldTime: 100 },
    },
  });
}

sealed('the environment check is asked only of a gathering task', async () => {
  const taskDeps = (environmentExists) =>
    collaborators({
      environmentExists,
      resolveBehavior: () =>
        placedBehavior(
          behaviorSystem({
            interactableType: 'gatheringTask',
            sourceUuid: 'Fabricate.sysA.gatheringTask.task-9',
            toolId: null,
            taskId: 'task-9',
            environmentId: 'env-forest',
          })
        ),
    });

  const asked = [];
  const missing = taskDeps((environmentId) => {
    asked.push(environmentId);
    return false;
  });
  assert.equal(
    await validateAndGrant(activationRequest({ interactableType: 'gatheringTask' }), missing.deps),
    false
  );
  assert.deepEqual(asked, ['env-forest']);
  assert.equal(missing.calls.emitted[0].reason, 'ENVIRONMENT_MISSING');

  const present = taskDeps(() => true);
  assert.equal(
    await validateAndGrant(activationRequest({ interactableType: 'gatheringTask' }), present.deps),
    true
  );
  assert.equal(present.calls.emitted[0].grant.tab, 'gathering');
  assert.equal(present.calls.emitted[0].grant.environmentId, 'env-forest');
  assert.equal(present.calls.emitted[0].grant.taskId, 'task-9');

  const toolAsked = [];
  const tool = collaborators({
    environmentExists: (environmentId) => {
      toolAsked.push(environmentId);
      return false;
    },
  });
  assert.equal(await validateAndGrant(activationRequest(), tool.deps), true);
  assert.deepEqual(toolAsked, [], 'a tool never consults the environment collaborator');
});

sealed('a tool station whose activeCanvasTool cannot be built is denied SOURCE_MISSING', () => {
  const { deps } = collaborators();
  const gone = () => ({ getTool: () => null });

  assert.deepEqual(
    buildGrantPayload({
      request: activationRequest(),
      system: behaviorSystem({ toolId: '', systemId: '' }),
      resolutionDeps: gone,
    }),
    { payload: null, reason: 'SOURCE_MISSING' }
  );
  assert.equal(
    buildGrantPayload({
      request: activationRequest(),
      system: behaviorSystem({ toolId: 'tool-1' }),
      resolutionDeps: gone,
    }).payload.grant.context.activeCanvasTool.toolId,
    'tool-1',
    'the library tool id alone still identifies the station (issue 1119)'
  );
  assert.deepEqual(
    buildGrantPayload({
      request: activationRequest(),
      system: behaviorSystem({ interactableType: 'mystery' }),
      resolutionDeps: deps.resolutionDeps,
    }),
    { payload: null, reason: null }
  );
});

sealed('openGrant opens crafting, then gathering, and refuses every incomplete grant', () => {
  const { deps, calls } = collaborators();
  const activeCanvasTool = { componentId: 'comp-axe', systemId: 'sysA', toolId: 'tool-1', label: '' };

  openGrant({ grant: { interactableType: 'tool', actorId: 'a7', context: { activeCanvasTool } } }, deps);
  assert.deepEqual(calls.shown[0], {
    tab: 'crafting',
    options: { activeCanvasTool, actorId: 'a7' },
  });

  openGrant(
    {
      grant: {
        interactableType: 'gatheringTask',
        environmentId: 'env-1',
        taskId: 'task-9',
        actorId: 'a7',
        ref: { sceneId: 'scene-1', regionId: 'region-1', behaviorId: 'beh-1' },
      },
    },
    deps
  );
  assert.equal(calls.shown[1].tab, 'gathering');
  assert.deepEqual(calls.shown[1].options.interactableRef, {
    sceneId: 'scene-1',
    regionId: 'region-1',
    behaviorId: 'beh-1',
  });
  calls.shown[1].options.onClose();
  assert.deepEqual(calls.closed, [
    { ref: { sceneId: 'scene-1', regionId: 'region-1', behaviorId: 'beh-1' }, actorId: 'a7' },
  ]);

  openGrant(null, deps);
  openGrant({ grant: 'nope' }, deps);
  openGrant({ grant: { interactableType: 'tool', context: {} } }, deps);
  openGrant({ grant: { interactableType: 'gatheringTask', taskId: 'task-9' } }, deps);
  openGrant({ grant: { interactableType: 'mystery' } }, deps);
  openGrant({ grant: { interactableType: 'tool' } }, { ...deps, getAppClass: () => null });
  assert.equal(calls.shown.length, 2);
});

sealed('a gathering grant falls back to its context scope and tolerates a rejected show', () => {
  const rejected = [];
  const { deps, calls } = collaborators({
    getAppClass: () => ({
      show: (tab, options) => {
        calls.shown.push({ tab, options });
        rejected.push(tab);
        return Promise.reject(new Error('show exploded'));
      },
    }),
  });

  assert.doesNotThrow(() =>
    openGrant(
      {
        grant: {
          interactableType: 'gatheringTask',
          context: { environmentId: 'env-2', taskId: 'task-2' },
        },
      },
      deps
    )
  );
  assert.equal(calls.shown[0].options.environmentId, 'env-2');
  assert.equal(calls.shown[0].options.taskId, 'task-2');
  assert.equal(calls.shown[0].options.interactableRef, null);
  assert.deepEqual(rejected, ['gathering']);
});

sealed('a denial notifies the requesting client and emits to every other', () => {
  const local = collaborators({ currentUserId: () => 'u-1' });
  routeActivationDenied('u-1', 'LOCKED', local.deps);
  assert.equal(local.calls.emitted.length, 0);
  assert.deepEqual(local.calls.warned, ['FABRICATE.Canvas.Interactable.Denied.Locked']);

  const remote = collaborators({ currentUserId: () => 'gm-1' });
  routeActivationDenied('u-1', 'LOCKED', remote.deps);
  assert.equal(remote.calls.warned.length, 0);
  assert.deepEqual(remote.calls.emitted, [
    { action: 'interactableActivationDenied', userId: 'u-1', reason: 'LOCKED' },
  ]);

  const anonymous = collaborators({ currentUserId: () => null });
  routeActivationDenied(undefined, null, anonymous.deps);
  assert.deepEqual(anonymous.calls.warned, ['FABRICATE.Canvas.Interactable.Denied.Generic']);
});

sealed('a denial message maps its reason, and falls back to the key without a localizer', () => {
  assert.equal(
    denialMessage('SOURCE_MISSING', { localize: (key) => `[${key}]` }),
    '[FABRICATE.Canvas.Interactable.Denied.SourceMissing]'
  );
  assert.equal(denialMessage('nonsense', {}), 'FABRICATE.Canvas.Interactable.Denied.Generic');
  assert.equal(denialMessage(null), 'FABRICATE.Canvas.Interactable.Denied.Generic');
  assert.equal(
    denialMessage('LOCKED', { localize: () => undefined }),
    'FABRICATE.Canvas.Interactable.Denied.Locked'
  );
});
