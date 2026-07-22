/*
 * Per-worktree-stable Foundry container identity (issue #827 Phase 2) — PURE coverage.
 *
 * This test imports ONLY the playwright-free `foundryRunIdentity.js` module — never a
 * `scripts/foundry-test*.mjs` harness script (those top-level-import playwright and/or
 * autorun `main()`, so importing one launches Chromium then `process.exit()`s, killing
 * the whole `node --test` run as `# cancelled`). No docker, no network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveRunIdentity,
  isLegalDockerName,
  isLegalHostname,
  reconcileFoundryEndpoint,
} from '../scripts/lib/foundryRunIdentity.js';

const ROOT_A = 'C:/Users/dev/WebstormProjects/fabricate/.worktrees/827/implement-r1';
const ROOT_B = 'C:/Users/dev/WebstormProjects/fabricate/.worktrees/827/implement-r2';
const ROOT_C = '/home/dev/fabricate/.worktrees/900/review-r1';

test('distinct roots derive distinct, charset-legal container names and hostnames', () => {
  const a = deriveRunIdentity(ROOT_A);
  const b = deriveRunIdentity(ROOT_B);

  assert.notEqual(a.containerName, b.containerName);
  assert.notEqual(a.hostname, b.hostname);

  for (const id of [a, b]) {
    assert.ok(isLegalDockerName(id.containerName), `illegal docker name: ${id.containerName}`);
    assert.ok(isLegalDockerName(id.project), `illegal project name: ${id.project}`);
    assert.ok(isLegalHostname(id.hostname), `illegal hostname: ${id.hostname}`);
    assert.match(id.containerName, /^fabricate-foundry-[0-9a-f]{12}$/);
    assert.match(id.hostname, /^fabricate-[0-9a-f]{12}$/);
  }
});

test('the same root derives an identical identity (idempotent)', () => {
  const first = deriveRunIdentity(ROOT_A);
  const second = deriveRunIdentity(ROOT_A);
  assert.deepEqual(first, second);
});

test('project name equals the container name and is constant for a given root', () => {
  const id = deriveRunIdentity(ROOT_C);
  assert.equal(id.project, id.containerName);
  assert.equal(deriveRunIdentity(ROOT_C).project, id.project);
});

test('a hostile worktree root (slashes, spaces, uppercase) still yields legal ids', () => {
  const hostile = 'C:/Users/Dev With Spaces/FABRICATE/.worktrees/#827/Implement R1!';
  const id = deriveRunIdentity(hostile);

  assert.ok(isLegalDockerName(id.containerName), `illegal docker name: ${id.containerName}`);
  assert.ok(isLegalDockerName(id.project), `illegal project name: ${id.project}`);
  assert.ok(isLegalHostname(id.hostname), `illegal hostname: ${id.hostname}`);
  // None of the hostile characters survive into the derived identity.
  assert.doesNotMatch(id.containerName, /[^a-zA-Z0-9_.-]/);
  assert.doesNotMatch(id.hostname, /[^a-zA-Z0-9-]/);
});

test('the derived port is deterministic and within the bounded range', () => {
  const id = deriveRunIdentity(ROOT_A);
  assert.equal(typeof id.port, 'number');
  assert.ok(Number.isInteger(id.port));
  assert.ok(id.port >= 30100 && id.port < 30500, `port out of range: ${id.port}`);
  // Same root → same port.
  assert.equal(deriveRunIdentity(ROOT_A).port, id.port);
});

test('a normalized win32/posix spelling of the same path hashes identically', () => {
  const win = 'C:\\Users\\dev\\fabricate\\.worktrees\\827\\implement-r1';
  const posix = 'C:/Users/dev/fabricate/.worktrees/827/implement-r1';
  assert.deepEqual(deriveRunIdentity(win), deriveRunIdentity(posix));
});

test('deriveRunIdentity rejects an empty or non-string root', () => {
  assert.throws(() => deriveRunIdentity(''), TypeError);
  assert.throws(() => deriveRunIdentity(undefined), TypeError);
  assert.throws(() => deriveRunIdentity(42), TypeError);
});

// ── reconcileFoundryEndpoint: URL and host port can never diverge (the CI regression) ──

test('a pinned URL alone drives the host port from its port (the CI :30100 case)', () => {
  // The exact CI shape: FOUNDRY_URL pinned to :30100, FOUNDRY_HOST_PORT unset, a
  // DIFFERENT derived fallback. The container must bind the URL's port, not the fallback.
  const { hostPort, url } = reconcileFoundryEndpoint({
    url: 'http://localhost:30100',
    hostPort: undefined,
    fallbackPort: 30283,
  });
  assert.equal(hostPort, '30100');
  assert.equal(url, 'http://localhost:30100');
});

test('a pinned URL with a non-default port propagates that port to the host port', () => {
  const { hostPort, url } = reconcileFoundryEndpoint({
    url: 'http://localhost:30247/',
    hostPort: undefined,
    fallbackPort: 30283,
  });
  assert.equal(hostPort, '30247');
  assert.equal(url, 'http://localhost:30247/');
});

test('a pinned host port alone derives a matching URL', () => {
  const { hostPort, url } = reconcileFoundryEndpoint({
    url: undefined,
    hostPort: '30311',
    fallbackPort: 30283,
  });
  assert.equal(hostPort, '30311');
  assert.equal(url, 'http://localhost:30311');
});

test('with neither pinned, both come from the fallback port', () => {
  const { hostPort, url } = reconcileFoundryEndpoint({
    url: undefined,
    hostPort: undefined,
    fallbackPort: 30283,
  });
  assert.equal(hostPort, '30283');
  assert.equal(url, 'http://localhost:30283');
});
