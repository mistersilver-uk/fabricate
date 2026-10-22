/**
 * `mountMany(name, items)` on the published component seam (issue 2455), driven through its
 * factory with the fake runtime: M1, M2, M3 and M19 for the name, then M21, then every refusal
 * `mount` makes for each item, all judged before anything is claimed or rendered; the frozen array
 * of handles in item order, and a render fault that stays with its own item.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';

import { createPublishedComponents } from '../src/ui/publishedComponentSeam.js';

import {
  FAULT_REPORT,
  FakeTarget,
  PREFIX,
  ZETA,
  deferredLoader,
  drained,
  fakeRuntime,
  refusal,
  seamWith,
  zetaProps,
} from './helpers/publishedComponentFakes.js';

// One key of every shipped kind; `STRICT` takes no rest, which M8 needs. The table of invalid items
// below is held to cover every item refusal the spec rows state.
const KINDS = Object.freeze({
  name: 'Kinds',
  path: 'src/ui/svelte/components/Kinds.svelte',
  version: 1,
  props: {
    label: { kind: 'data', required: true },
    title: { kind: 'text' },
    body: { kind: 'slot' },
    onPing: { kind: 'callback' },
    'aria-expanded': { kind: 'aria' },
    query: { kind: 'value', initial: '' },
  },
  rest: true,
  root: 'any',
  component: Object.freeze({ role: 'Kinds' }),
});
// An entry that needs a Fabricate window ancestor, judged by an injected `hasAncestor`.
const ROOTED = Object.freeze({ ...KINDS, name: 'Rooted', root: 'fabricate' });
const STRICT = Object.freeze({ ...KINDS, name: 'Strict', rest: false });
const LAZY = Object.freeze({ ...KINDS, name: 'Lazy', path: 'src/Lazy.svelte', lazy: true });
const TABLE = Object.freeze([KINDS, ROOTED, STRICT, LAZY, ZETA]);
const SPECIFIED = readFileSync(
  resolve(import.meta.dirname, '../openspec/specs/ui-extension-points/spec.md'),
  'utf8'
);

const UNDER_ROOT = 'under-root';
const hasAncestor = (target) => target.marks === UNDER_ROOT;
const rootedTarget = () => Object.assign(new FakeTarget(), { marks: UNDER_ROOT });

function batchSeam(options = {}) {
  const lazy = deferredLoader();
  const fake = seamWith({
    table: TABLE,
    hasAncestor,
    loaders: { [LAZY.path]: lazy.load },
    ...options,
  });
  return { ...fake, lazy };
}

const valid = (overrides = {}) => ({
  target: new FakeTarget(),
  props: { label: 'Rank' },
  ...overrides,
});
const isEmpty = (target) => target.childNodes.length === 0;

/** What `ui.mount` throws for `options`, or `null` when it mounts. */
function mountRefusal(ui, name, options) {
  try {
    ui.mount(name, options)?.destroy();
    return null;
  } catch (error) {
    return error;
  }
}

describe('the mountMany member', () => {
  it('is the last member of the frozen descriptor, which keeps schema version 1', () => {
    const { ui } = batchSeam();
    assert.equal(Object.keys(ui).at(-1), 'mountMany');
    assert.equal(typeof ui.mountMany, 'function', 'what a companion detects it by');
    assert.equal(ui.schemaVersion, 1);
  });
});

describe('mountMany refuses the name first', () => {
  it('M1: throws a plain Error before registration, ahead of M21', () => {
    const { publicApi } = createPublishedComponents({ table: TABLE, isReady: () => true });
    for (const items of [[valid()], 'not an array']) {
      assert.throws(
        () => publicApi.mountMany('Kinds', items),
        (error) => error.constructor === Error && error.message === `${PREFIX}not registered`
      );
    }
  });

  it('M2: refuses before Fabricate is ready, ahead of M3 and M21', () => {
    const { ui, mounts } = batchSeam({ isReady: () => false });
    assert.throws(() => ui.mountMany('Nope', 'not an array'), refusal('mount before ready'));
    assert.equal(mounts.length, 0);
  });

  it('M3: refuses a name that is not published, ahead of M21', () => {
    const { ui } = batchSeam();
    for (const name of ['Nope', 'toString', undefined]) {
      assert.throws(() => ui.mountMany(name, null), refusal(`"${String(name)}" is not published`));
    }
  });

  it('M19: refuses a lazy entry until load has resolved for it, ahead of M21, then mounts', async () => {
    const { ui, lazy, mounts } = batchSeam();
    const items = [valid(), valid()];
    assert.throws(() => ui.mountMany('Lazy', items), refusal('"Lazy" is not loaded'));
    assert.throws(() => ui.mountMany('Lazy', 'not an array'), refusal('"Lazy" is not loaded'));
    const loading = ui.load(['Lazy']);
    assert.throws(() => ui.mountMany('Lazy', items), refusal('"Lazy" is not loaded'));
    assert.equal(mounts.length, 0, 'nothing rendered');
    lazy.resolve(Object.freeze({ role: 'Lazy' }));
    await loading;
    const handles = ui.mountMany('Lazy', items);
    assert.equal(handles.length, 2);
    assert.ok(
      mounts.every(({ props }) => props.component.role === 'Lazy'),
      'its fetched code'
    );
  });
});

describe('M21: items must be an array', () => {
  it('refuses anything Array.isArray does not admit, a single item and an array-like included', () => {
    const { ui, mounts } = batchSeam();
    const target = new FakeTarget();
    const notArrays = [
      undefined,
      null,
      'items',
      3,
      { target, props: { label: 'Rank' } },
      { length: 1, 0: { target, props: { label: 'Rank' } } },
      new Set([{ target, props: { label: 'Rank' } }]),
    ];
    for (const items of notArrays) {
      assert.throws(() => ui.mountMany('Kinds', items), refusal('items must be an array'));
    }
    assert.equal(mounts.length, 0, 'nothing is coerced into a batch');
    assert.ok(isEmpty(target));
  });

  it('admits an array of another realm', () => {
    const { ui } = batchSeam();
    const items = runInNewContext('[]');
    items.push(valid());
    assert.equal(ui.mountMany('Kinds', items).length, 1);
  });
});

describe('a batch that validates', () => {
  it('answers a frozen empty array for no items, and renders nothing', () => {
    const { ui, mounts } = batchSeam();
    const handles = ui.mountMany('Kinds', []);
    assert.deepEqual(handles, []);
    assert.ok(Object.isFrozen(handles));
    assert.equal(mounts.length, 0);
  });

  it('answers a frozen array of handles in item order, each mounted with its own props', () => {
    const { ui, mounts, seam } = batchSeam();
    const items = ['A', 'B', 'C'].map((label) => valid({ props: { label } }));
    const handles = ui.mountMany('Kinds', items);
    assert.ok(Object.isFrozen(handles));
    assert.equal(handles.length, 3);
    assert.ok(
      mounts.every(({ target }, index) => target === items[index].target),
      'rendered in item order'
    );
    assert.deepEqual(
      mounts.map(({ props }) => props.initial.label),
      ['A', 'B', 'C']
    );
    for (const handle of handles) {
      assert.ok(Object.isFrozen(handle));
      assert.deepEqual(Object.keys(handle), ['update', 'destroy', 'slot', 'value']);
    }
    assert.equal(handles[0].update({ label: 'A2' }), true);
    assert.equal(mounts[0].instance.updates.at(-1).label, 'A2', "the first item's own mount");
    assert.equal(handles[1].update({ label: 'B2' }), true);
    assert.equal(mounts[1].instance.updates.at(-1).label, 'B2', "the second item's own mount");
    assert.equal(mounts[2].instance.updates.length, 0, 'the third is untouched');
    assert.equal(seam.liveMountCount(), 3);
  });

  it('reads the length once and follows no iterator, so an array’s own iterator draws every item', () => {
    const { ui, mounts } = batchSeam();
    const items = [valid(), valid()];
    items[Symbol.iterator] = function* oneOfTwo() {
      yield items[0];
    };
    assert.equal([...items].length, 1, 'the iterator alone would have drawn one');
    assert.equal(ui.mountMany('Kinds', items).length, 2);
    assert.equal(mounts.length, 2);
  });

  it('draws the items it was given when a getter pushes another during validation', () => {
    const { ui, mounts } = batchSeam();
    const items = [valid()];
    const pushed = valid();
    items.push({
      get target() {
        items.push(pushed);
        return new FakeTarget();
      },
      props: { label: 'Rank' },
    });
    const handles = ui.mountMany('Kinds', items);
    assert.equal(items.length, 3, 'the getter did push');
    assert.equal(handles.length, 2);
    assert.equal(mounts.length, 2);
    assert.ok(isEmpty(pushed.target), 'and the pushed item was not drawn');
  });

  it('leaves the rest live when one handle is destroyed', () => {
    const { ui, seam, unmounts } = batchSeam();
    const items = [valid(), valid(), valid()];
    const handles = ui.mountMany('Kinds', items);
    handles[1].destroy();
    assert.equal(unmounts.length, 1);
    assert.ok(isEmpty(items[1].target));
    assert.equal(handles[1].update({ label: 'x' }), false);
    assert.equal(handles[0].update({ label: 'x' }), true);
    assert.equal(handles[2].update({ label: 'x' }), true);
    assert.equal(seam.liveMountCount(), 2);
  });

  it('accepts an item’s overlayHost and a non-function onFault, and defaults its props', () => {
    const { ui, mounts } = batchSeam({ table: [ZETA] });
    const document = new FakeTarget().ownerDocument;
    const target = new FakeTarget('div', document);
    const overlayHost = new FakeTarget('div', document);
    const [handle] = ui.mountMany('Zeta', [
      { target, props: zetaProps(), overlayHost, onFault: 3 },
    ]);
    assert.equal(handle.update(zetaProps()), true);
    assert.equal(mounts[0].props.initial.label, 'Rank');
    assert.throws(
      () => ui.mountMany('Zeta', [{ target: new FakeTarget() }]),
      refusal('Zeta requires a non-empty "label"')
    );
  });
});

/**
 * Each item refusal `mount` makes, as `[what, item, tail, { entry = 'Kinds', ahead }]`: an item that
 * meets it, the tail it throws, the entry it is judged under and the item ahead of it in its batch.
 */
function invalidItems() {
  const held = batchSeam();
  const heldTarget = new FakeTarget();
  held.ui.mount('Kinds', { target: heldTarget, props: { label: 'Held' } });
  const full = new FakeTarget();
  full.childNodes.push({ role: 'companion' });
  const fullWithBadProps = new FakeTarget();
  fullWithBadProps.childNodes.push({ role: 'companion' });
  const shared = new FakeTarget();
  const cycle = { label: 'Rank' };
  cycle.self = cycle;
  const props = (extra) => ({ target: new FakeTarget(), props: { label: 'Rank', ...extra } });
  return {
    held,
    items: [
      ['a number', 5, 'target must be an element'],
      ['null', null, 'target must be an element'],
      ['a string', 'item', 'target must be an element'],
      ['undefined', undefined, 'target must be an element'],
      ['no target', { props: { label: 'Rank' } }, 'target must be an element'],
      ['a node that is no element', { target: { nodeType: 3 } }, 'target must be an element'],
      [
        'an overlayHost of another document',
        valid({ overlayHost: new FakeTarget() }),
        "overlayHost must be an element in the target's document",
      ],
      [
        'a target holding a live mount',
        valid({ target: heldTarget }),
        'target already holds a published component',
      ],
      ['a target that is not empty', valid({ target: full }), 'target must be empty'],
      [
        'a held target with a key it does not publish',
        { target: heldTarget, props: { label: 'Rank', nope: 1 } },
        'target already holds a published component',
      ],
      [
        'a target that is not empty with a key it does not publish',
        { target: fullWithBadProps, props: { label: 'Rank', nope: 1 } },
        'target must be empty',
      ],
      [
        'a target an earlier item names, with an overlayHost of another document',
        valid({ target: shared, overlayHost: new FakeTarget() }),
        "overlayHost must be an element in the target's document",
        { ahead: () => valid({ target: shared }) },
      ],
      [
        'props that are not plain',
        { target: new FakeTarget(), props: new Map() },
        'props must be a plain object',
      ],
      ['a key it does not publish', props({ nope: 1 }), '"nope" is not a data attribute'],
      [
        'a key an entry without rest does not publish',
        props({ nope: 1 }),
        '"nope" is not a prop of Strict',
        { entry: 'Strict' },
      ],
      ['an entry whose code is not loaded', valid(), '"Lazy" is not loaded', { entry: 'Lazy' }],
      [
        'a required key absent',
        { target: new FakeTarget(), props: {} },
        'Kinds requires a non-empty "label"',
      ],
      ['a function in data', props({ label: [() => 1] }), '"label" must not hold a function'],
      ['data that is not data', props({ label: new Date(0) }), '"label" must be data'],
      ['a cycle', { target: new FakeTarget(), props: cycle }, '"self" holds a cycle'],
      [
        'a rest key that is no data attribute',
        props({ 'data-x': {} }),
        '"data-x" is not a data attribute',
      ],
      [
        'an aria key that is no scalar',
        props({ 'aria-expanded': {} }),
        '"aria-expanded" must be a string, number or boolean',
      ],
      ['a text key that is no string', props({ title: 3 }), '"title" must be a string'],
      [
        'a slot key that is no boolean',
        props({ body: 'yes' }),
        '"body" is a slot and takes true or false',
      ],
      [
        'a callback key that is no function',
        props({ onPing: 'ping' }),
        '"onPing" must be a function',
      ],
      [
        'a value key that is no scalar',
        props({ query: {} }),
        '"query" must be a string, number, boolean or null',
      ],
    ],
  };
}

describe('a batch with an invalid item', () => {
  it("throws mount's own refusal for that item unchanged, and renders and claims nothing", () => {
    const { held, items } = invalidItems();
    for (const [what, item, tail, { entry = 'Kinds', ahead = valid } = {}] of items) {
      const mountsBefore = held.mounts.length;
      const before = ahead();
      const after = valid();
      const expected = mountRefusal(held.ui, entry, item);
      assert.ok(expected, `mount refuses ${what}`);
      assert.throws(
        () => held.ui.mountMany(entry, [before, item, after]),
        (error) => {
          refusal(tail)(error);
          assert.equal(error.constructor, expected.constructor, what);
          assert.equal(error.message, expected.message, `${what}: as mount throws it`);
          return true;
        },
        what
      );
      assert.equal(held.mounts.length, mountsBefore, `${what}: nothing rendered`);
      assert.ok(isEmpty(before.target) && isEmpty(after.target), `${what}: every target empty`);
      assert.equal(held.seam.liveMountCount(), 1, `${what}: only the held mount is live`);
      for (const handle of held.ui.mountMany('Kinds', [before, after])) handle.destroy();
    }
  });

  it('covers every item refusal the spec rows state, but M16, which has its own test', () => {
    const rowTails = (id) => {
      const rows = SPECIFIED.split('\n').filter((line) => line.startsWith(`| ${id} |`));
      assert.equal(rows.length, 1, `one ${id} row`);
      const cell = rows[0].replace(/ \|$/u, '').split(' | ').at(-1);
      return [...cell.matchAll(/`([^`]+)`/gu)].map(([, tail]) => tail);
    };
    // A placeholder such as `<key>` stands for any text.
    const matcher = (tail) =>
      new RegExp(
        `^${tail
          .split(/<[^>]+>/u)
          .map((part) => part.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`))
          .join('.+')}$`,
        'u'
      );
    const thrown = invalidItems().items.map((row) => row[2]);
    const rows = Array.from({ length: 17 }, (_, index) => `M${index + 4}`).filter(
      (id) => id !== 'M16'
    );
    assert.equal(rows.length, 16, 'M4 to M20, but M16');
    const covers = (id) =>
      rowTails(id).some((tail) => thrown.some((got) => matcher(tail).test(got)));
    const uncovered = rows.filter((id) => covers(id) === false);
    assert.deepEqual(uncovered, [], 'each row has an item the table throws its tail for');
  });

  it('M16: refuses a target outside the root, and M18 is judged after it', () => {
    const { ui, mounts } = batchSeam();
    const outside = valid({ overlayHost: 'not an element' });
    assert.throws(
      () => ui.mountMany('Rooted', [valid({ target: rootedTarget() }), outside]),
      refusal('Rooted needs a Fabricate window ancestor')
    );
    assert.throws(
      () => ui.mountMany('Rooted', [valid({ target: rootedTarget(), overlayHost: 'x' })]),
      refusal("overlayHost must be an element in the target's document")
    );
    assert.equal(mounts.length, 0);
  });

  it('reads a hole in the items as an item with no target', () => {
    const { ui, mounts } = batchSeam();
    const items = [valid(), valid()];
    items.splice(1, 0, undefined);
    delete items[1];
    assert.ok(!Object.hasOwn(items, 1), 'a hole, not an undefined item');
    assert.throws(() => ui.mountMany('Kinds', items), refusal('target must be an element'));
    assert.equal(mounts.length, 0);
  });

  it('throws the first refusal in item order, judging each item whole before the next', () => {
    const { ui } = batchSeam();
    const items = [valid(), valid({ props: {} }), { target: 5 }];
    assert.throws(
      () => ui.mountMany('Kinds', items),
      refusal('Kinds requires a non-empty "label"')
    );
  });

  it('M5: refuses a target that two items name, and renders neither', () => {
    const { ui, mounts } = batchSeam();
    const target = new FakeTarget();
    const items = [valid({ target }), valid(), valid({ target })];
    assert.throws(
      () => ui.mountMany('Kinds', items),
      refusal('target already holds a published component')
    );
    assert.equal(mounts.length, 0);
    assert.ok(isEmpty(target));
  });

  it('leaves a stale claim un-ended, and the next valid batch ends it before rendering', () => {
    const { ui, unmounts, seam } = batchSeam();
    const target = new FakeTarget();
    const stale = ui.mount('Kinds', { target, props: { label: 'Old' } });
    target.replaceChildren();
    assert.throws(
      () => ui.mountMany('Kinds', [valid({ target }), { target: 5 }]),
      refusal('target must be an element')
    );
    assert.equal(unmounts.length, 0, 'the validation pass ends no claim');
    assert.equal(stale.update({ label: 'Still' }), true);
    const [fresh] = ui.mountMany('Kinds', [valid({ target })]);
    assert.equal(stale.update({ label: 'Gone' }), false, 'the render pass ended it');
    assert.equal(unmounts.length, 1);
    assert.equal(fresh.update({ label: 'New' }), true);
    assert.equal(seam.liveMountCount(), 1);
  });

  it('cannot place a target in another item’s slot before that item renders, so a later call does', () => {
    const { ui } = batchSeam();
    const outer = rootedTarget();
    const inner = new FakeTarget();
    assert.throws(
      () =>
        ui.mountMany('Rooted', [
          valid({ target: outer, props: { label: 'A', body: true } }),
          valid({ target: inner }),
        ]),
      refusal('Rooted needs a Fabricate window ancestor')
    );
    const [card] = ui.mountMany('Rooted', [
      valid({ target: outer, props: { label: 'A', body: true } }),
    ]);
    card.slot('body').append(inner);
    const [nested] = ui.mountMany('Rooted', [valid({ target: inner })]);
    assert.equal(nested.update({ label: 'B' }), true);
  });
});

describe('a render fault in a batch', () => {
  it('stays with its own item: an inert handle, its own onFault once, the rest live', async () => {
    const fake = fakeRuntime();
    const failure = new Error('boom');
    const failing = new FakeTarget();
    const mount = (host, options) => {
      if (options.target === failing) {
        options.target.childNodes.push({ role: 'partial' });
        throw failure;
      }
      return fake.runtime.mount(host, options);
    };
    const reports = [];
    const { publicApi: ui, liveMountCount } = createPublishedComponents({
      table: [KINDS],
      isReady: () => true,
      ...fake.runtime,
      mount,
      report: (...args) => {
        reports.push(args);
      },
    });
    const told = [[], [], []];
    const items = [valid(), valid({ target: failing }), valid()].map((item, index) => ({
      ...item,
      onFault: (error) => {
        told[index].push(error);
      },
    }));
    const handles = ui.mountMany('Kinds', items);
    assert.equal(handles.length, 3);
    assert.equal(handles[1].update({ label: 'x' }), false, 'inert');
    assert.equal(handles[1].slot('body'), null);
    assert.ok(isEmpty(failing), 'its target is emptied');
    assert.equal(handles[0].update({ label: 'x' }), true);
    assert.equal(handles[2].update({ label: 'x' }), true);
    assert.equal(liveMountCount(), 2);
    assert.deepEqual(reports, [[FAULT_REPORT, 'Kinds', failure]]);
    assert.deepEqual(told, [[], [], []], 'never inside mountMany');
    await drained();
    assert.deepEqual(told, [[], [failure], []], "only that item's onFault, once");
    assert.equal(handles[0].update({ label: 'y' }), true, 'its notice ends no other mount');
    assert.equal(liveMountCount(), 2);
  });
});
