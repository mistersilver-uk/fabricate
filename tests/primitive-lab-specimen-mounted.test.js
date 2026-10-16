/**
 * `standUpSpecimen`, mounted (issue 2339): the one step a specimen iframe takes to stand its row up.
 * A fixture's `act` runs in a granted turn under a time limit, and the specimen fails, naming the
 * fixture, when the act throws or hangs, when `reached` denies its state, or when nothing rendered.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createMountedComponentHarness } from './helpers/svelte-component-harness.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAB = 'tests/view-lab/primitives';
const SYNTHETIC = 'tests/fixtures/primitive-lab';
const STAND_UP = `${LAB}/standUpSpecimen.js`;

const harness = createMountedComponentHarness({
  repoRoot: REPO_ROOT,
  tmpPrefix: 'fabricate-primitive-lab-specimen-',
  rawModules: [`${LAB}/specimenSnippets.js`],
  // Compiled as a module so its `./LiveSpecimen.svelte` import resolves to the compiled sibling.
  runeModules: [STAND_UP],
  compiledModules: [
    `${LAB}/LiveSpecimen.svelte`,
    `${SYNTHETIC}/Probe.svelte`,
    `${SYNTHETIC}/PassThrough.svelte`,
    `${SYNTHETIC}/RendersNothing.svelte`,
  ],
  componentPath: `${LAB}/LiveSpecimen.svelte`,
});

let standUpSpecimen;
let Probe;
let PassThrough;
let RendersNothing;

before(async () => {
  await harness.setup();
  ({ standUpSpecimen } = await harness.loadRuneModule(STAND_UP));
  const load = async (name) =>
    (await harness.loadRuneModule(`${SYNTHETIC}/${name}.svelte`)).default;
  [Probe, PassThrough, RendersNothing] = await Promise.all(
    ['Probe', 'PassThrough', 'RendersNothing'].map(load)
  );
});

after(() => harness.teardown());

const ROW = Object.freeze({
  path: 'src/Probe.svelte',
  fixture: 'Synthetic',
  props: { label: 'Iron' },
  data: { typed: 'smith' },
});

/** A fresh specimen root, as `buildSpecimenFrame` hands `standUpSpecimen` one. */
function specimenRoot() {
  const root = document.createElement('div');
  root.className = 'fabricate-manager';
  document.body.append(root);
  return root;
}

/** Stand a synthetic row up through `PassThrough`, with `act` and `reached` as given. */
function standUp(fixture, options = {}) {
  const root = specimenRoot();
  const done = standUpSpecimen({
    target: root,
    row: ROW,
    component: Probe,
    fixture: { default: PassThrough, ...fixture },
    ...options,
  });
  return { root, done };
}

const stamped = (root) => root.dataset.acted === 'yes';

test('a plain row and a fixture row both stand the component up with the row’s props', async () => {
  const plain = specimenRoot();
  await standUpSpecimen({
    target: plain,
    row: { path: ROW.path, props: ROW.props },
    component: Probe,
  });
  assert.equal(plain.querySelector(':scope > .pl-specimen > .pl-probe')?.textContent, 'Iron');

  const { root, done } = standUp({});
  await done;
  assert.equal(root.querySelector(':scope > .pl-specimen > .pl-probe')?.textContent, 'Iron');
});

test('the act runs on the specimen root with the row’s data, and its stamp stands', async () => {
  const seen = [];
  const { root, done } = standUp({
    act: (target, data) => {
      seen.push(data.typed, target.querySelector('.pl-probe')?.textContent);
      target.dataset.acted = 'yes';
    },
    reached: stamped,
  });
  await done;
  assert.ok(stamped(root), 'the act never ran, so no state an act reaches would stand');
  assert.deepEqual(seen, ['smith', 'Iron'], 'the act runs after mount, handed the row’s data');
});

test('an act that throws rejects, naming the fixture', async () => {
  const { done } = standUp({
    act: () => {
      throw new Error('boom');
    },
    reached: () => true,
  });
  await assert.rejects(done, /fixture Synthetic: its act threw: boom/);
});

test('an act that hangs rejects within the limit, naming the fixture', async () => {
  const started = Date.now();
  const { done } = standUp(
    { act: () => new Promise(() => {}), reached: () => true },
    { actLimitMs: 50 }
  );
  await assert.rejects(done, /fixture Synthetic: its act did not settle within 50ms/);
  assert.ok(Date.now() - started < 2000, 'the limit, not the test runner, ended the act');
});

test('an act whose `reached` denies its state rejects, naming the fixture', async () => {
  const { done } = standUp({ act: () => {}, reached: () => false });
  await assert.rejects(done, /fixture Synthetic: its act ran and `reached` does not hold/);
});

test('a fixture that renders nothing into the specimen rejects, naming the fixture', async () => {
  const root = specimenRoot();
  const done = standUpSpecimen({
    target: root,
    row: ROW,
    component: Probe,
    fixture: { default: RendersNothing, act: () => {}, reached: () => true },
  });
  await assert.rejects(done, /fixture Synthetic: it rendered nothing into the specimen/);
});

test('an act with no `reached` is refused before anything mounts', async () => {
  const { root, done } = standUp({ act: () => {} });
  await assert.rejects(done, /fixture Synthetic: it exports `act` and no `reached`/);
  assert.ok(
    !root.querySelector('.pl-specimen'),
    'nothing mounts for a fixture that cannot be checked'
  );
});

test('the act waits for its turn and ends it, whether it settles or throws', async () => {
  const events = [];
  const requestActTurn = async () => {
    events.push('granted');
    return () => {
      events.push('released');
    };
  };
  const act = () => {
    events.push('act');
  };
  await standUp({ act, reached: () => true }, { requestActTurn }).done;
  assert.deepEqual(events, ['granted', 'act', 'released']);

  events.length = 0;
  const failing = standUp(
    {
      act: () => {
        events.push('act');
        throw new Error('boom');
      },
      reached: () => true,
    },
    { requestActTurn }
  );
  await assert.rejects(failing.done);
  assert.deepEqual(events, ['granted', 'act', 'released'], 'a failed act still ends its turn');
});
