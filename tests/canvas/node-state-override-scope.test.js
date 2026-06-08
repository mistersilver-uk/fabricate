/**
 * Behavioral coverage for the session-scoped per-token node-state override
 * scoping predicate (`scopeNodeStateOverride`) — the decision behind
 * `SvelteFabricateApp.nodeStateOverrideFor` (attempt path) and the listing
 * service. The override must be returned ONLY for the scoped env+task and `null`
 * for any other env/task (the leak guard), and inert with no override.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { scopeNodeStateOverride } from '../../src/ui/nodeStateOverrideScope.js';

const override = { read: () => ({ current: 0 }) };
const scoped = { scopedEnvironmentId: 'env-1', scopedTaskId: 'task-1' };

test('returns the adapter for the scoped env+task', () => {
  assert.equal(
    scopeNodeStateOverride({ override, ...scoped, environmentId: 'env-1', taskId: 'task-1' }),
    override
  );
});

test('defaults to the scoped env+task when env/task are omitted (the tab\'s own session)', () => {
  assert.equal(scopeNodeStateOverride({ override, ...scoped }), override);
});

test('returns null for a DIFFERENT env (leak guard)', () => {
  assert.equal(
    scopeNodeStateOverride({ override, ...scoped, environmentId: 'env-2', taskId: 'task-1' }),
    null
  );
});

test('returns null for a DIFFERENT task (leak guard)', () => {
  assert.equal(
    scopeNodeStateOverride({ override, ...scoped, environmentId: 'env-1', taskId: 'task-2' }),
    null
  );
});

test('returns null when there is no override (inert, no token session)', () => {
  assert.equal(
    scopeNodeStateOverride({ override: null, ...scoped, environmentId: 'env-1', taskId: 'task-1' }),
    null
  );
});

test('returns null when the session has no scope (no scoped env/task)', () => {
  assert.equal(
    scopeNodeStateOverride({ override, scopedEnvironmentId: null, scopedTaskId: null, environmentId: 'env-1', taskId: 'task-1' }),
    null
  );
});
