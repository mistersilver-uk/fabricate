/**
 * `regionEnterPrompt` under a throwing `globalThis` trap: the enter and exit seams, the control and
 * keybinding re-triggers, and the post-close re-prompt, all through injected functions.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  interactHere,
  onRegionEnter,
  onRegionExit,
  promptForTokenInsideRegion,
  repromptAfterClose,
} from '../../src/canvas/regionEnterPrompt.js';
import { underFoundryGlobalTrap } from '../helpers/foundryGlobalTrap.js';

const PLAYER = Object.freeze({ id: 'u-1', isGM: false });
const GM = Object.freeze({ id: 'gm-1', isGM: true });

function sealed(name, body) {
  test(name, () => underFoundryGlobalTrap('regionEnterPrompt', body));
}

function interactableSystem(overrides = {}) {
  return {
    interactableType: 'tool',
    sourceUuid: 'Fabricate.sysA.tool.tool-1',
    systemId: 'sysA',
    toolId: 'tool-1',
    taskId: null,
    environmentId: null,
    name: 'Forge Anvil',
    presentation: { promptText: 'Use the forge', hidden: false },
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

function placedBehavior(system = interactableSystem()) {
  const scene = { id: 'scene-1' };
  const region = { id: 'region-1', parent: scene };
  return { id: 'beh-1', type: 'fabricate.interactable', system, parent: region };
}

function collaborators(overrides = {}) {
  const calls = { shown: [], dismissed: [], requested: [], reprompted: [] };
  const deps = {
    getPromptAppClass: () => ({
      show: (args) => calls.shown.push(args),
      dismiss: (ref) => calls.dismissed.push(ref),
    }),
    currentUser: () => ({ ...PLAYER }),
    currentUserId: () => 'u-1',
    viewedScene: () => ({ id: 'scene-1' }),
    getScene: () => null,
    controlledTokens: () => [],
    requestActivation: (behavior, ctx) => calls.requested.push({ behavior, ctx }),
    behaviorsContainingToken: () => [],
    promptForTokenInsideRegion: (token) => calls.reprompted.push(token),
    ...overrides,
  };
  return { deps, calls };
}

const OWNED_TOKEN = Object.freeze({
  isOwner: true,
  actor: { id: 'actor-1' },
  actorId: 'actor-1',
  document: { isOwner: true, actor: { id: 'actor-1' }, actorId: 'actor-1' },
});

sealed('an entering owner is prompted with exactly the four prompt fields', () => {
  const { deps, calls } = collaborators();
  const behavior = placedBehavior();

  onRegionEnter({ user: { ...PLAYER }, data: { token: OWNED_TOKEN } }, behavior, deps);

  assert.equal(calls.shown.length, 1);
  assert.deepEqual([...Object.keys(calls.shown[0])].sort(), [
    'behaviorRef',
    'name',
    'onInteract',
    'promptText',
  ]);
  assert.equal(calls.shown[0].behaviorRef, 'scene-1.region-1.beh-1');
  assert.equal(calls.shown[0].name, 'Forge Anvil');
  assert.equal(calls.shown[0].promptText, 'Use the forge');

  calls.shown[0].onInteract();
  assert.equal(calls.requested.length, 1);
  assert.equal(calls.requested[0].behavior, behavior);
  assert.deepEqual(calls.requested[0].ctx, {
    actorId: 'actor-1',
    userId: 'u-1',
    activationSource: 'regionEnter',
  });
});

sealed('the enter seam suppresses a foreign behaviour, a non-owner and a concealed interactable', () => {
  const { deps, calls } = collaborators();
  const event = { user: { id: 'u-2', isGM: false }, data: { token: OWNED_TOKEN } };

  onRegionEnter(event, { id: 'beh-1', type: 'other', system: interactableSystem() }, deps);
  onRegionEnter(event, placedBehavior(), deps);
  assert.equal(calls.shown.length, 1, 'a non-GM owner is prompted however the token moved');

  const gmDeps = collaborators({ currentUser: () => ({ ...GM }) });
  onRegionEnter(event, placedBehavior(), gmDeps.deps);
  assert.equal(gmDeps.calls.shown.length, 0, 'the GM is not spammed by an autonomous player move');

  const disabled = interactableSystem();
  disabled.state.enabled = false;
  onRegionEnter(event, placedBehavior(disabled), deps);
  const hidden = interactableSystem();
  hidden.presentation.hidden = true;
  onRegionEnter(event, placedBehavior(hidden), deps);
  onRegionEnter(event, placedBehavior(interactableSystem({ sourceUuid: '' })), deps);
  assert.equal(calls.shown.length, 1, 'disabled, hidden and unconfigured all suppress');

  const locked = interactableSystem();
  locked.state.locked = true;
  onRegionEnter(event, placedBehavior(locked), deps);
  assert.equal(calls.shown.length, 2, 'a LOCKED interactable still prompts');

  onRegionEnter(event, { id: 'beh-1', type: 'fabricate.interactable', system: interactableSystem() }, deps);
  assert.equal(calls.shown.length, 2, 'an unidentifiable behaviour raises nothing');
});

sealed('the exit seam dismisses by ref, and only for an identifiable behaviour', () => {
  const { deps, calls } = collaborators();

  onRegionExit({}, placedBehavior(), deps);
  onRegionExit({}, { id: 'beh-1', type: 'fabricate.interactable' }, deps);

  assert.deepEqual(calls.dismissed, ['scene-1.region-1.beh-1']);
});

sealed('a missing prompt app makes both seams inert', () => {
  const { deps } = collaborators({ getPromptAppClass: () => null });
  assert.doesNotThrow(() =>
    onRegionEnter({ user: { ...PLAYER }, data: { token: OWNED_TOKEN } }, placedBehavior(), deps)
  );
  assert.doesNotThrow(() => onRegionExit({}, placedBehavior(), deps));
});

sealed('the keybinding re-trigger takes the first controlled token, or nothing', () => {
  const first = { id: 'token-1' };
  const { deps, calls } = collaborators({ controlledTokens: () => [first, { id: 'token-2' }] });
  interactHere(deps);
  assert.deepEqual(calls.reprompted, [first]);

  const empty = collaborators({ controlledTokens: () => [] });
  interactHere(empty.deps);
  const malformed = collaborators({ controlledTokens: () => null });
  interactHere(malformed.deps);
  assert.equal(empty.calls.reprompted.length + malformed.calls.reprompted.length, 0);
});

sealed('the in-region re-prompt raises one prompt for the first eligible behaviour', () => {
  const concealed = interactableSystem();
  concealed.presentation.hidden = true;
  const eligible = placedBehavior();
  const { deps, calls } = collaborators({
    behaviorsContainingToken: () => [
      { behavior: { id: 'beh-0', type: 'other', system: interactableSystem() } },
      { behavior: placedBehavior(concealed) },
      { behavior: { id: 'beh-x', type: 'fabricate.interactable', system: interactableSystem() } },
      { behavior: eligible },
      { behavior: placedBehavior() },
    ],
  });

  promptForTokenInsideRegion(OWNED_TOKEN, deps);

  assert.equal(calls.shown.length, 1, 'one prompt at a time');
  calls.shown[0].onInteract();
  assert.equal(calls.requested[0].behavior, eligible);
  assert.deepEqual(calls.requested[0].ctx, {
    actorId: 'actor-1',
    userId: 'u-1',
    activationSource: 'regionEnter',
  });
});

sealed('the in-region re-prompt refuses an absent or unowned token', () => {
  const asked = [];
  const { deps, calls } = collaborators({
    behaviorsContainingToken: (token) => {
      asked.push(token);
      return [{ behavior: placedBehavior() }];
    },
  });

  promptForTokenInsideRegion(null, deps);
  promptForTokenInsideRegion({ document: { isOwner: false } }, deps);
  assert.equal(calls.shown.length, 0);
  assert.deepEqual(asked, [], 'the hit-test is not even run for a token this client cannot control');

  const gmDeps = collaborators({
    currentUser: () => ({ ...GM }),
    behaviorsContainingToken: () => [{ behavior: placedBehavior() }],
  });
  promptForTokenInsideRegion({ document: { isOwner: false } }, gmDeps.deps);
  assert.equal(gmDeps.calls.shown.length, 1, 'a GM owns every token');
});

sealed('the close re-prompt resolves the scene, then delegates to the shared prompt path', () => {
  const placeable = { id: 'placeable-1' };
  const tokenDoc = { actorId: 'actor-1', actor: { id: 'actor-1' }, object: placeable };
  const scene = { id: 'scene-1', tokens: { contents: [tokenDoc] } };
  const { deps, calls } = collaborators({
    getScene: (sceneId) => (sceneId === 'scene-1' ? scene : null),
    viewedScene: () => scene,
  });

  repromptAfterClose({ ref: { sceneId: 'scene-1' }, actorId: 'actor-1' }, deps);
  assert.deepEqual(calls.reprompted, [placeable]);

  const viewedOnly = collaborators({ getScene: () => null, viewedScene: () => scene });
  repromptAfterClose({ ref: { sceneId: 'scene-1' }, actorId: 'actor-1' }, viewedOnly.deps);
  assert.deepEqual(viewedOnly.calls.reprompted, [placeable], 'the viewed scene resolves it too');

  const documentOnly = collaborators({
    getScene: () => ({ id: 'scene-1', tokens: [{ actorId: 'actor-1' }] }),
    viewedScene: () => scene,
  });
  repromptAfterClose({ ref: { sceneId: 'scene-1' }, actorId: 'actor-1' }, documentOnly.deps);
  assert.deepEqual(documentOnly.calls.reprompted, [{ actorId: 'actor-1' }]);
});

sealed('the close re-prompt is a no-op off the viewed scene, and never throws', () => {
  const scene = { id: 'scene-1', tokens: { contents: [{ actorId: 'actor-1' }] } };
  const elsewhere = collaborators({
    getScene: () => scene,
    viewedScene: () => ({ id: 'scene-OTHER' }),
  });
  repromptAfterClose({ ref: { sceneId: 'scene-1' }, actorId: 'actor-1' }, elsewhere.deps);
  assert.equal(elsewhere.calls.reprompted.length, 0);

  const gone = collaborators({ getScene: () => scene, viewedScene: () => scene });
  repromptAfterClose({ ref: { sceneId: 'scene-1' }, actorId: 'actor-9' }, gone.deps);
  assert.equal(gone.calls.reprompted.length, 0, 'a vanished activating token is not re-prompted');

  const noisy = collaborators({
    getScene: () => {
      throw new Error('scene lookup exploded');
    },
  });
  assert.doesNotThrow(() =>
    repromptAfterClose({ ref: { sceneId: 'scene-1' }, actorId: 'actor-1' }, noisy.deps)
  );

  const { deps, calls } = collaborators();
  assert.doesNotThrow(() => repromptAfterClose(undefined, deps));
  assert.doesNotThrow(() => repromptAfterClose({}, deps));
  assert.doesNotThrow(() => repromptAfterClose({ ref: null, actorId: 'actor-1' }, deps));
  assert.doesNotThrow(() => repromptAfterClose({ ref: { sceneId: 'scene-1' } }, deps));
  assert.doesNotThrow(() => repromptAfterClose({ ref: { sceneId: null }, actorId: 'a' }, deps));
  assert.equal(calls.reprompted.length, 0);
});
