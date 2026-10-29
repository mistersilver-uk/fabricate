/**
 * A gathering run's resolve control follows the Tool readiness its execute command enforces
 * (issue 2745): held copy, the viewer's station, or neither.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { gatheringRunToolsMissing } from '../../src/bootstrap/journalGatheringTools.js';
import { GatheringEngine } from '../../src/systems/GatheringEngine.js';
import { RunJournalBuilder } from '../../src/ui/presenters/RunJournalBuilder.js';
import { runAttentionPresentation } from '../../src/ui/svelte/apps/journal/journalRunStatus.js';

const SYSTEM_ID = 'sys-1';
const TOOL = { id: 'tool-1', componentId: 'comp-1' };
const TASK = { id: 'task-1', name: 'Forage', resolutionMode: 'straight', toolIds: [] };
const OWNER = { id: 'actor-1', uuid: 'Actor.actor-1', name: 'Akra', isOwner: true };
const PLAYER = { id: 'user-1', isGM: false };
const STATION = { systemId: SYSTEM_ID, componentIds: ['comp-1'], toolIds: [] };
const heldCopy = { id: 'item-1', getFlag: () => undefined, componentId: 'comp-1' };

const craftingSystemManager = {
  toolMatchesItem: (_recipe, tool, item) => item.componentId === tool.componentId,
  toolMatchesItemByIdentity: () => false,
};

function makeEngine({
  tools = [TOOL],
  missingToolIds = [],
  disabledToolIds = [],
  missingReference = null,
} = {}) {
  return {
    _hasBlockedToolReferences: GatheringEngine.prototype._hasBlockedToolReferences,
    _resolveWaitingRunContext: () =>
      missingReference
        ? { missingReference }
        : { system: { id: SYSTEM_ID }, environment: { id: 'env-1' }, task: TASK },
    _resolveTaskTools: () => ({ tools, missingToolIds, disabledToolIds }),
  };
}

const missing = ({ items = [], presentTools = null, engine = makeEngine() } = {}) =>
  gatheringRunToolsMissing({
    engine,
    craftingSystemManager,
    actor: { items },
    run: { id: 'run-1' },
    presentTools,
  });

test('a run needing a Tool is blocked with no copy and no station, and ready with either', () => {
  assert.equal(missing(), true, 'neither a copy nor a station');
  assert.equal(missing({ items: [heldCopy] }), false, 'a held copy');
  assert.equal(missing({ presentTools: STATION }), false, "the viewer's station");
  assert.equal(missing({ presentTools: null }), true, 'the station cleared');
  assert.equal(
    missing({ presentTools: { ...STATION, systemId: 'other-system' } }),
    true,
    "another system's station never supplies this run's Tool"
  );
});

test('a run needing no Tool, with a stale Tool reference, or that no longer resolves, is never blocked here', () => {
  assert.equal(missing({ engine: makeEngine({ tools: [] }) }), false);
  assert.equal(missing({ engine: makeEngine({ missingReference: 'task' }) }), false);
  const stale = { tools: [TOOL] };
  assert.equal(
    missing({ engine: makeEngine({ ...stale, missingToolIds: ['gone'] }) }),
    false,
    'a deleted reference'
  );
  assert.equal(
    missing({ engine: makeEngine({ ...stale, disabledToolIds: ['off'] }) }),
    false,
    'a disabled one'
  );
  const throwing = {
    _resolveWaitingRunContext: () => {
      throw new Error('unresolvable');
    },
  };
  assert.equal(missing({ engine: throwing }), false);
});

const RUN = {
  id: 'run-1',
  craftingSystemId: SYSTEM_ID,
  environmentId: 'env-1',
  taskId: 'task-1',
  status: 'waitingTime',
  lifecycleVersion: 1,
  runRevision: 0,
  timeGate: { requiredSeconds: 600, availableAt: 100 },
};

function project({ toolsMissing, run = RUN, history = false }) {
  return new RunJournalBuilder({
    gatheringRunSource: {
      getActiveRuns: () => (history ? [] : [run]),
      getRunHistory: () => (history ? [run] : []),
    },
    getGatheringTask: () => TASK,
    gatheringToolsMissing: () => toolsMissing,
    localize: (key) => key,
    nowWorldTime: () => 200,
  }).buildListing({ actor: OWNER, viewer: PLAYER })[history ? 'history' : 'activeRuns'][0];
}

test('the ready action is unavailable and names the Tool while the run lacks one', () => {
  const blocked = project({ toolsMissing: true });
  assert.equal(blocked.actions.execute, false);
  assert.equal(blocked.actions.disabledReason, 'toolRequired');
  assert.equal(runAttentionPresentation(blocked)?.kind, 'tools', 'the row shows Needs tools');
  assert.equal(blocked.actions.cancel, true, 'the run can still be cancelled');

  const ready = project({ toolsMissing: false });
  assert.equal(ready.actions.execute, true);
  assert.equal(ready.actions.disabledReason, null);
  assert.equal(runAttentionPresentation(ready), null);
});

test('a finished or blind gathering row never discloses Tool needs', () => {
  assert.equal(project({ toolsMissing: true, history: true }).actions.disabledReason, null);
  const blind = project({ toolsMissing: true, run: { ...RUN, taskId: 'blind' } });
  assert.notEqual(blind.actions.disabledReason, 'toolRequired');
  assert.equal(runAttentionPresentation(blind), null);
});
