/**
 * The published component seam (issue 2426), driven through its factory with a fake runtime: the
 * frozen descriptor, every fixed refusal, the `text` kind, replace-not-merge and atomic updates,
 * destroy, the claim on a target, `load`, the fault path with its `onFault` notice, and the
 * standalone style root's registration, description and element (issue 2456). Content
 * slots and the required root are `published-component-slots.test.js`'s, callbacks
 * `published-component-callbacks.test.js`'s, and the real Svelte runtime the mounted suites'.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PUBLISHED_COMPONENT_MANIFEST } from '../src/ui/publishedComponentManifest.js';
import { withoutMember } from '../src/ui/publishedComponentProps.js';
import { createPublishedComponents } from '../src/ui/publishedComponentSeam.js';

import {
  ALPHA,
  FAULT_REPORT,
  FakeTarget,
  HOST,
  PREFIX,
  TABLE,
  ZETA,
  ZETA_COMPONENT,
  deferredLoader,
  drained,
  exactly,
  fakeRuntime,
  RESERVED_REST_NAMES,
  refusal,
  seamWith,
  zetaProps,
} from './helpers/publishedComponentFakes.js';

describe('the published-components descriptor', () => {
  it('is frozen, with exactly its six members and schema version 1', () => {
    const { ui } = seamWith();
    assert.deepEqual(Object.keys(ui), [
      'schemaVersion',
      'components',
      'describe',
      'mount',
      'load',
      'mountMany',
    ]);
    assert.equal(ui.schemaVersion, 1);
    assert.ok(Object.isFrozen(ui));
  });

  it('lists the published names frozen and in table order, never sorted', () => {
    const { ui } = seamWith();
    assert.deepEqual(ui.components, ['Zeta', 'Alpha', 'Titled']);
    assert.ok(Object.isFrozen(ui.components));
  });

  it('describes an entry as a frozen version, its props by kind, rest, root and overlays, with nothing else', () => {
    const { ui } = seamWith();
    const described = ui.describe('Zeta');
    assert.deepEqual(Object.keys(described), ['version', 'props', 'rest', 'root', 'overlays']);
    assert.deepEqual(described, {
      version: 3,
      props: { label: { kind: 'data', required: true }, items: { kind: 'data', required: false } },
      rest: true,
      root: 'any',
      overlays: false,
    });
    assert.ok(Object.isFrozen(described));
    assert.ok(Object.isFrozen(described.props));
    for (const spec of Object.values(described.props)) assert.ok(Object.isFrozen(spec));
    assert.deepEqual(ui.describe('Alpha'), {
      version: 1,
      props: { value: { kind: 'data', required: false } },
      rest: false,
      root: 'any',
      overlays: false,
    });
    assert.deepEqual(ui.describe('Titled').props, {
      title: { kind: 'text', required: true },
      note: { kind: 'text', required: false },
      rank: { kind: 'data', required: false },
    });
  });

  it('answers null for a name that is not published, inherited names included', () => {
    const { ui } = seamWith();
    for (const name of ['Nope', 'toString', '__proto__', undefined]) {
      assert.equal(ui.describe(name), null, String(name));
    }
  });

  it('is bound onto an api as the same object on every bind, without the test-only count', () => {
    const { seam, ui } = seamWith();
    const api = {};
    assert.equal(seam.bindPublicApi(api), api);
    assert.equal(api.ui, ui);
    seam.bindPublicApi(api);
    assert.equal(api.ui, ui, 'a rebind publishes the same object');
    assert.equal('liveMountCount' in ui, false);
  });
});

describe('an entry drawn under the standalone style root', () => {
  const STANDALONE = Object.freeze({ ...ZETA, name: 'Standalone', standaloneRoot: true });
  const WIDENED = [
    'InspectorCard',
    'Button',
    'StatusToggle',
    'Stepper',
    'SearchField',
    'Select',
    'Field',
    'Well',
    'IconButton',
    'EditorTabs',
    'RadioCardGroup',
    'SegmentedControl',
    'Pagination',
    'IconPicker',
    'ActionMenu',
    'Modal',
    'ToggleCard',
  ];

  it('describes the entry without standaloneRoot, which only its group states', () => {
    const { ui } = seamWith({ table: [ZETA, STANDALONE] });
    assert.deepEqual(ui.describe('Standalone'), ui.describe('Zeta'));
  });

  it('describes each widened shipped entry at the any root, without standaloneRoot', () => {
    const { publicApi: ui } = createPublishedComponents({ isReady: () => true });
    const stated = PUBLISHED_COMPONENT_MANIFEST.filter((entry) => entry.standaloneRoot === true);
    assert.deepEqual(
      stated.map(({ name }) => name),
      WIDENED
    );
    for (const name of WIDENED) {
      assert.equal(ui.describe(name).root, 'any', name);
      assert.ok(!Object.hasOwn(ui.describe(name), 'standaloneRoot'), `${name} leaves it out`);
    }
  });

  for (const root of ['fabricate', 'manager']) {
    it(`refuses at registration standaloneRoot on the ${root} root, naming the entry`, () => {
      const table = [{ ...STANDALONE, root }];
      const seam = createPublishedComponents({ table, isReady: () => true });
      assert.throws(
        () => seam.register({ ...fakeRuntime().runtime, components: {} }),
        (error) => {
          assert.equal(error.constructor, Error);
          const tail = `Standalone states standaloneRoot on the root "${root}"`;
          assert.match(error.message, exactly(PREFIX + tail));
          return true;
        }
      );
    });
  }

  for (const value of [false, 'true', 1]) {
    it(`refuses at registration a standaloneRoot of ${JSON.stringify(value)}, naming the entry`, () => {
      const table = [{ ...STANDALONE, standaloneRoot: value }];
      const seam = createPublishedComponents({ table, isReady: () => true });
      assert.throws(
        () => seam.register({ ...fakeRuntime().runtime, components: {} }),
        (error) => {
          assert.equal(error.constructor, Error);
          const tail = `Standalone has an unknown standaloneRoot "${String(value)}"`;
          assert.match(error.message, exactly(PREFIX + tail));
          return true;
        }
      );
    });
  }

  it('writes one display: contents root in a bare target, draws in it, and removes it by reference', () => {
    const { ui, mounts } = seamWith({ table: [STANDALONE], hasAncestor: () => false });
    const target = new FakeTarget();
    const handle = ui.mount('Standalone', { target, props: zetaProps() });
    const [root] = target.childNodes;
    assert.equal(target.childNodes.length, 1, 'one element in the target');
    assert.equal(root.className, 'fabricate fabricate-standalone-root');
    assert.equal(root.style.display, 'contents');
    assert.equal(mounts[0].target, root, 'the host is drawn inside it');
    const elsewhere = new FakeTarget();
    elsewhere.append(root);
    handle.destroy();
    assert.equal(root.removals, 1, 'removed wherever it now is');
    assert.equal(elsewhere.childNodes.length, 0);
  });

  it('writes none under any .fabricate, which is the one question it asks', () => {
    const asked = [];
    const hasAncestor = (_target, selector) => {
      asked.push(selector);
      return true;
    };
    const { ui, mounts } = seamWith({ table: [STANDALONE], hasAncestor });
    const target = new FakeTarget();
    ui.mount('Standalone', { target, props: zetaProps() });
    assert.equal(mounts[0].target, target, 'the host is drawn in the target');
    assert.deepEqual(asked, ['.fabricate']);
  });
});

describe('mount refuses before it can draw', () => {
  it('M1: throws a plain Error until a runtime registers', () => {
    const seam = createPublishedComponents({ table: TABLE, isReady: () => true });
    assert.throws(
      () => seam.publicApi.mount('Zeta', { target: new FakeTarget(), props: zetaProps() }),
      (error) => {
        assert.equal(error.constructor, Error);
        assert.match(error.message, exactly(`${PREFIX}not registered`));
        return true;
      }
    );
    const { runtime } = fakeRuntime();
    seam.register({ ...runtime, components: { [ZETA.path]: ZETA_COMPONENT } });
    const handle = seam.publicApi.mount('Zeta', { target: new FakeTarget(), props: zetaProps() });
    assert.equal(handle.update(zetaProps()), true);
  });

  it('M2: throws before Fabricate is ready, reading the facade flag by default', () => {
    const { ui } = seamWith({ isReady: () => false });
    assert.throws(
      () => ui.mount('Zeta', { target: new FakeTarget() }),
      refusal('mount before ready')
    );
    const { runtime } = fakeRuntime();
    const seam = createPublishedComponents({ table: TABLE, ...runtime });
    const previous = globalThis.game;
    const setGame = (game) => Object.assign(globalThis, { game });
    try {
      setGame({ fabricate: { ready: false } });
      assert.throws(
        () => seam.publicApi.mount('Zeta', { target: new FakeTarget(), props: zetaProps() }),
        refusal('mount before ready')
      );
      globalThis.game.fabricate.ready = true;
      seam.publicApi.mount('Zeta', { target: new FakeTarget(), props: zetaProps() });
    } finally {
      setGame(previous);
    }
  });

  it('M3: refuses a name that is not published', () => {
    const { ui } = seamWith();
    for (const name of ['Nope', 'toString']) {
      assert.throws(
        () => ui.mount(name, { target: new FakeTarget() }),
        refusal(`"${name}" is not published`)
      );
    }
  });

  it('M4: refuses a target whose nodeType is not 1, and accepts any node of type 1', () => {
    const { ui } = seamWith();
    for (const target of [undefined, null, {}, { nodeType: 3 }, 'div']) {
      assert.throws(() => ui.mount('Zeta', { target }), refusal('target must be an element'));
    }
    assert.throws(() => ui.mount('Zeta'), refusal('target must be an element'));
    // Not an `Element`: a detached V14 window's element fails `instanceof` against this realm.
    const foreign = new FakeTarget();
    assert.equal(
      ui.mount('Zeta', { target: foreign, props: zetaProps() }).update(zetaProps()),
      true
    );
  });

  it('M4: asks the injected element check', () => {
    const allowed = new FakeTarget();
    const { runtime } = fakeRuntime();
    const seam = createPublishedComponents({
      table: TABLE,
      isReady: () => true,
      isElement: (target) => target === allowed,
      ...runtime,
    });
    assert.throws(
      () => seam.publicApi.mount('Zeta', { target: new FakeTarget(), props: zetaProps() }),
      refusal('target must be an element')
    );
    seam.publicApi.mount('Zeta', { target: allowed, props: zetaProps() });
  });

  it('M18: refuses an overlayHost that is no element or is one of another document, on an entry that opens no overlay', () => {
    const { ui, mounts } = seamWith();
    const target = new FakeTarget();
    const text = { nodeType: 3, ownerDocument: target.ownerDocument };
    for (const overlayHost of [null, 'body', {}, text, new FakeTarget()]) {
      assert.throws(
        () => ui.mount('Zeta', { target, props: zetaProps(), overlayHost }),
        refusal("overlayHost must be an element in the target's document")
      );
    }
    assert.equal(mounts.length, 0, 'nothing is rendered');
    assert.equal(ui.describe('Zeta').overlays, false);
    const own = new FakeTarget('section', target.ownerDocument);
    const handle = ui.mount('Zeta', { target, props: zetaProps(), overlayHost: own });
    assert.equal(
      handle.update(zetaProps()),
      true,
      'one of the same document, unconnected, is accepted'
    );
    handle.destroy();
    ui.mount('Zeta', { target, props: zetaProps(), overlayHost: undefined }).destroy();
  });

  it('M18: is checked directly after M16 and before M5 and M7', () => {
    const rooted = [{ ...ZETA, root: 'fabricate' }];
    const { ui } = seamWith({ table: rooted, hasAncestor: () => false });
    const overlayHost = new FakeTarget();
    assert.throws(
      () => ui.mount('Zeta', { target: new FakeTarget(), props: zetaProps(), overlayHost }),
      refusal('Zeta needs a Fabricate window ancestor')
    );
    const { ui: open } = seamWith();
    const target = new FakeTarget();
    open.mount('Zeta', { target, props: zetaProps() });
    const stray = refusal("overlayHost must be an element in the target's document");
    assert.throws(() => open.mount('Zeta', { target, props: zetaProps(), overlayHost }), stray);
    assert.throws(
      () => open.mount('Zeta', { target: new FakeTarget(), props: [], overlayHost }),
      stray
    );
  });

  it('M5: refuses a target holding a live mount and leaves that mount live', () => {
    const { ui, unmounts } = seamWith();
    const target = new FakeTarget();
    const first = ui.mount('Zeta', { target, props: zetaProps() });
    assert.throws(
      () => ui.mount('Zeta', { target, props: zetaProps() }),
      refusal('target already holds a published component')
    );
    assert.equal(unmounts.length, 0);
    assert.equal(first.update(zetaProps({ label: 'Still' })), true);
  });

  it('M6: refuses a target that is not empty', () => {
    const { ui, mounts } = seamWith();
    const target = new FakeTarget();
    target.childNodes.push({ role: 'companion text' });
    assert.throws(
      () => ui.mount('Zeta', { target, props: zetaProps() }),
      refusal('target must be empty')
    );
    assert.equal(mounts.length, 0);
  });

  it('M5 and M6 are judged before the props, and a stale claim is ended before a props refusal', () => {
    const { ui } = seamWith();
    const held = new FakeTarget();
    const live = ui.mount('Zeta', { target: held, props: zetaProps() });
    assert.throws(
      () => ui.mount('Zeta', { target: held, props: [] }),
      refusal('target already holds a published component')
    );
    assert.equal(live.update(zetaProps()), true, 'a refused mount leaves the live one');
    const full = new FakeTarget();
    full.childNodes.push({ role: 'companion text' });
    assert.throws(
      () => ui.mount('Zeta', { target: full, props: [] }),
      refusal('target must be empty')
    );
    const target = new FakeTarget();
    const stale = ui.mount('Zeta', { target, props: zetaProps() });
    target.replaceChildren();
    assert.throws(
      () => ui.mount('Zeta', { target, props: [] }),
      refusal('props must be a plain object')
    );
    assert.equal(stale.update(zetaProps()), false, 'the stale claim was ended first');
  });

  it('M7: refuses props that are not a plain object, and accepts a foreign-realm plain one', () => {
    const { ui, mounts } = seamWith();
    class Props {}
    for (const props of [null, [], 'x', 3, new Props(), new Map(), Object.create({})]) {
      assert.throws(
        () => ui.mount('Alpha', { target: new FakeTarget(), props }),
        refusal('props must be a plain object')
      );
    }
    assert.equal(mounts.length, 0);
    const foreignRealm = Object.create(Object.create(null));
    foreignRealm.value = 1;
    ui.mount('Alpha', { target: new FakeTarget(), props: foreignRealm });
    ui.mount('Alpha', { target: new FakeTarget(), props: Object.assign(Object.create(null), {}) });
    ui.mount('Alpha', { target: new FakeTarget() });
    assert.equal(mounts.length, 3);
  });

  it('M8: refuses a key the entry does not publish, and a data attribute when it has no rest', () => {
    const { ui } = seamWith();
    assert.throws(
      () => ui.mount('Alpha', { target: new FakeTarget(), props: { colour: 'red' } }),
      refusal('"colour" is not a prop of Alpha')
    );
    assert.throws(
      () => ui.mount('Alpha', { target: new FakeTarget(), props: { 'data-x': 'y' } }),
      refusal('"data-x" is not a prop of Alpha')
    );
  });

  it('M9: refuses a required prop that is absent or empty', () => {
    const { ui } = seamWith();
    for (const props of [{}, { label: '' }, { label: undefined }]) {
      assert.throws(
        () => ui.mount('Zeta', { target: new FakeTarget(), props }),
        refusal('Zeta requires a non-empty "label"')
      );
    }
  });

  it('M10: refuses a function at any depth, naming the top-level key that holds it', () => {
    const { ui } = seamWith();
    for (const [key, value] of [
      ['label', () => 'x'],
      ['items', [{ id: 'a', render() {} }]],
      ['data-x', () => 1],
    ]) {
      assert.throws(
        () => ui.mount('Zeta', { target: new FakeTarget(), props: zetaProps({ [key]: value }) }),
        refusal(`"${key}" must not hold a function`)
      );
    }
  });

  it('M11: refuses a value that is not a primitive, plain object or array', () => {
    const { ui } = seamWith();
    class Row {}
    for (const value of [new Date(), new Map(), new Row(), [new Set()], { nested: new Row() }]) {
      assert.throws(
        () => ui.mount('Zeta', { target: new FakeTarget(), props: zetaProps({ items: value }) }),
        refusal('"items" must be data')
      );
    }
  });

  it('M12: refuses a cycle, while a shared reference is plain data', () => {
    const { ui, mounts } = seamWith();
    const loop = { id: 'a' };
    loop.self = loop;
    const ring = [];
    ring.push([ring]);
    for (const items of [loop, ring, [{ child: loop }]]) {
      assert.throws(
        () => ui.mount('Zeta', { target: new FakeTarget(), props: zetaProps({ items }) }),
        refusal('"items" holds a cycle')
      );
    }
    const shared = { id: 'shared' };
    ui.mount('Zeta', { target: new FakeTarget(), props: zetaProps({ items: [shared, shared] }) });
    assert.equal(mounts.length, 1);
  });

  it('M13: refuses a rest key that is not a data attribute holding a scalar', () => {
    const { ui } = seamWith();
    for (const [key, value] of [
      ['aria-label', 'x'],
      ['data-Upper', 'x'],
      ['data-', 'x'],
      ['data-x', null],
      ['data-x', { a: 1 }],
      ['data-x', ['a']],
    ]) {
      assert.throws(
        () => ui.mount('Zeta', { target: new FakeTarget(), props: zetaProps({ [key]: value }) }),
        refusal(`"${key}" is not a data attribute`)
      );
    }
  });

  it('accepts data attributes on an entry with rest, and passes them through', () => {
    const { ui, mounts } = seamWith();
    const props = zetaProps({ 'data-rank': 2, 'data-open': true, 'data-tag-name': 'x' });
    ui.mount('Zeta', { target: new FakeTarget(), props });
    assert.deepEqual(mounts[0].props.initial, props);
  });
});

// A required label and a required callback, as a control-rooted entry publishes them.
const PRESS_SHAPE = Object.freeze({
  path: 'src/ui/svelte/components/Pressed.svelte',
  version: 1,
  props: {
    children: { kind: 'text', required: true },
    onclick: { kind: 'callback', required: true },
  },
  rest: true,
  root: 'any',
  component: Object.freeze({ role: 'Pressed' }),
});
// One entry whose rest lands on the control, and one whose rest lands on a root that is none.
const PRESSED = Object.freeze({ ...PRESS_SHAPE, name: 'Pressed', restOn: 'control' });
const ROOTED = Object.freeze({ ...PRESS_SHAPE, name: 'Rooted' });
// One whose control also carries Foundry's tooltip.
const TIPPED = Object.freeze({ ...PRESSED, name: 'Tipped', tooltip: true });

const UNRESERVED_NAMES = [
  'data-tooltips',
  'data-tooltipx',
  'data-actions',
  'data-cursors',
  'data-keyboard-focused',
  'data-validation-focus',
  'data-validation-focused-x',
  'data-essence-sort',
  'data-essence-sort-directions',
  'data-acme-id',
];

describe('a rest key on an entry whose rest lands on a control', () => {
  const pressedProps = (overrides = {}) => ({ children: 'Clear', onclick() {}, ...overrides });
  const pressed = () => seamWith({ table: [PRESSED, ROOTED] });
  const mountOf = (ui, name, props) => ui.mount(name, { target: new FakeTarget(), props });

  it('describes the entry without restOn, which only its group states', () => {
    const { ui } = pressed();
    assert.deepEqual(Object.keys(ui.describe('Pressed')), [
      'version',
      'props',
      'rest',
      'root',
      'overlays',
    ]);
    assert.deepEqual(ui.describe('Pressed'), { ...ui.describe('Rooted') });
  });

  for (const [key, value] of RESERVED_REST_NAMES) {
    it(`M13: refuses ${key} holding ${JSON.stringify(value)} as reserved, and accepts it where rest lands on no control`, () => {
      const { ui, mounts } = pressed();
      assert.throws(
        () => mountOf(ui, 'Pressed', pressedProps({ [key]: value })),
        refusal(`"${key}" is reserved on Pressed`)
      );
      assert.equal(mounts.length, 0);
      mountOf(ui, 'Rooted', pressedProps({ [key]: value }));
      assert.equal(mounts[0].props.initial[key], value, 'passed through, as before');
    });
  }

  it('M13: refuses data-locked where the control carries Foundry’s tooltip, and accepts it on any other control', () => {
    const { ui, mounts } = seamWith({ table: [PRESSED, TIPPED] });
    for (const value of ['', 'true', true]) {
      assert.throws(
        () => mountOf(ui, 'Tipped', pressedProps({ 'data-locked': value })),
        refusal('"data-locked" is reserved on Tipped')
      );
    }
    assert.equal(mounts.length, 0);
    mountOf(ui, 'Pressed', pressedProps({ 'data-locked': '' }));
    assert.equal(mounts[0].props.initial['data-locked'], '', 'passed through, as before');
    assert.ok(!Object.hasOwn(ui.describe('Tipped'), 'tooltip'), 'and describe leaves it out');
  });

  it('accepts a name that only starts like a reserved one, and passes it through', () => {
    const { ui, mounts } = pressed();
    const rest = Object.fromEntries(UNRESERVED_NAMES.map((key) => [key, 'x']));
    mountOf(ui, 'Pressed', pressedProps(rest));
    assert.deepEqual(
      UNRESERVED_NAMES.map((key) => mounts[0].props.initial[key]),
      UNRESERVED_NAMES.map(() => 'x')
    );
  });

  it('keeps the first tail for a key that is no data attribute, and for a reserved name that holds no scalar', () => {
    const { ui } = pressed();
    for (const [key, value] of [
      ['title', 'Why'],
      ['aria-label', 'Why'],
      ['data-action', undefined],
      ['data-action', null],
      ['data-action', {}],
    ]) {
      assert.throws(
        () => mountOf(ui, 'Pressed', pressedProps({ [key]: value })),
        refusal(`"${key}" is not a data attribute`),
        `${key}: ${JSON.stringify(value)}`
      );
    }
    assert.throws(
      () => mountOf(ui, 'Pressed', pressedProps({ 'data-action': () => {} })),
      refusal('"data-action" must not hold a function')
    );
  });

  it('refuses a reserved name on update atomically: the earlier props and the earlier callback stay', () => {
    const { ui, mounts } = pressed();
    const calls = [];
    const noting = (call) => () => {
      calls.push(call);
    };
    const handle = mountOf(ui, 'Pressed', pressedProps({ onclick: noting('first') }));
    const next = pressedProps({ children: 'Next', onclick: noting('next') });
    for (const [key, value] of RESERVED_REST_NAMES) {
      assert.throws(
        () => handle.update({ ...next, [key]: value }),
        refusal(`"${key}" is reserved on Pressed`)
      );
    }
    const [{ instance }] = mounts;
    assert.deepEqual(instance.updates, [], 'nothing was rendered');
    instance.callbacks.onclick.deliver([]);
    assert.deepEqual(calls, ['first'], 'the earlier function still answers');
    assert.equal(handle.update(next), true);
    instance.callbacks.onclick.deliver([]);
    assert.deepEqual(calls, ['first', 'next']);
  });

  it('a required callback key: absence and undefined are M9, any other value that is no function M17', () => {
    const { ui, mounts } = pressed();
    for (const props of [{ children: 'Clear' }, { children: 'Clear', onclick: undefined }]) {
      assert.throws(
        () => mountOf(ui, 'Pressed', props),
        refusal('Pressed requires a non-empty "onclick"')
      );
    }
    for (const onclick of ['', null, 'x']) {
      assert.throws(
        () => mountOf(ui, 'Pressed', { children: 'Clear', onclick }),
        refusal('"onclick" must be a function'),
        JSON.stringify(onclick)
      );
    }
    assert.equal(mounts.length, 0);
    const handle = mountOf(ui, 'Pressed', pressedProps());
    assert.throws(
      () => handle.update({ children: 'Clear' }),
      refusal('Pressed requires a non-empty "onclick"'),
      'an update that omits it'
    );
    assert.deepEqual(mounts[0].instance.updates, []);
  });

  it('refuses in the companion’s key order, a reserved name (M13) before a missing key (M9)', () => {
    const { ui } = pressed();
    const reserved = refusal('"data-action" is reserved on Pressed');
    const notAFunction = refusal('"onclick" must be a function');
    const action = { 'data-action': 'x' };
    assert.throws(() => mountOf(ui, 'Pressed', { children: 'Clear', ...action }), reserved);
    assert.throws(() => mountOf(ui, 'Pressed', action), reserved, 'before a missing children too');
    assert.throws(() => mountOf(ui, 'Pressed', { onclick: null, ...action }), notAFunction);
    assert.throws(() => mountOf(ui, 'Pressed', { ...action, onclick: null }), reserved);
  });
});

// An entry whose rest lands on a control, with one `aria` key beside its label and callback.
const EXPANDING = Object.freeze({
  ...PRESSED,
  name: 'Expanding',
  props: { ...PRESS_SHAPE.props, 'aria-expanded': { kind: 'aria' } },
});
const NO_SCALAR = '"aria-expanded" must be a string, number or boolean';

describe('an aria key', () => {
  const expandingProps = (overrides = {}) => ({ children: 'Details', onclick() {}, ...overrides });
  const expanding = () => seamWith({ table: [EXPANDING, ROOTED] });
  const mountOf = (ui, name, props) => ui.mount(name, { target: new FakeTarget(), props });
  const passed = (mounts) => mounts.map(({ props }) => props.initial['aria-expanded']);

  it('describes the key by its kind, never required, and leaves it out of the kinds the host draws', () => {
    const { ui, mounts } = expanding();
    assert.deepEqual(ui.describe('Expanding').props['aria-expanded'], {
      kind: 'aria',
      required: false,
    });
    mountOf(ui, 'Expanding', expandingProps({ 'aria-expanded': false }));
    assert.deepEqual(mounts[0].props.kinds, { children: 'text', onclick: 'callback' });
  });

  it('passes a string, a number or a boolean to the component as it was passed', () => {
    const { ui, mounts } = expanding();
    const values = [true, false, 'true', 'false', 0, 1, '', NaN];
    for (const value of values) {
      mountOf(ui, 'Expanding', expandingProps({ 'aria-expanded': value }));
    }
    assert.deepEqual(passed(mounts), values);
  });

  it('reads undefined and absence as no value', () => {
    const { ui, mounts } = expanding();
    mountOf(ui, 'Expanding', expandingProps({ 'aria-expanded': undefined }));
    mountOf(ui, 'Expanding', expandingProps());
    assert.deepEqual(passed(mounts), [undefined, undefined]);
  });

  it('M13: refuses a value that is no string, number or boolean, and M10: a function', () => {
    const { ui, mounts } = expanding();
    for (const value of [null, {}, [], Symbol('open'), 1n]) {
      assert.throws(
        () => mountOf(ui, 'Expanding', expandingProps({ 'aria-expanded': value })),
        refusal(NO_SCALAR),
        String(value)
      );
    }
    assert.throws(
      () => mountOf(ui, 'Expanding', expandingProps({ 'aria-expanded': () => true })),
      refusal('"aria-expanded" must not hold a function')
    );
    assert.equal(mounts.length, 0);
  });

  it('keeps the first tail for an aria-* name the entry does not publish, and for its own key on an entry that publishes none', () => {
    const { ui } = expanding();
    for (const key of [
      'aria-pressed',
      'aria-label',
      'aria-labelledby',
      'aria-hidden',
      'aria-controls',
      'aria-haspopup',
      'ARIA-EXPANDED',
    ]) {
      assert.throws(
        () => mountOf(ui, 'Expanding', expandingProps({ [key]: 'true' })),
        refusal(`"${key}" is not a data attribute`)
      );
    }
    assert.throws(
      () => mountOf(ui, 'Rooted', expandingProps({ 'aria-expanded': false })),
      refusal('"aria-expanded" is not a data attribute')
    );
  });

  it('refuses in key order: a bad value before a reserved name behind it, after one ahead of it, and before a missing key (M9)', () => {
    const { ui } = expanding();
    const bad = { 'aria-expanded': null };
    const reserved = { 'data-action': 'x' };
    assert.throws(
      () => mountOf(ui, 'Expanding', expandingProps({ ...bad, ...reserved })),
      refusal(NO_SCALAR)
    );
    assert.throws(
      () => mountOf(ui, 'Expanding', expandingProps({ ...reserved, ...bad })),
      refusal('"data-action" is reserved on Expanding')
    );
    assert.throws(() => mountOf(ui, 'Expanding', bad), refusal(NO_SCALAR), 'with no children');
  });

  it('refuses a bad value on update atomically, and passes none once an update omits the key', () => {
    const { ui, mounts } = expanding();
    const handle = mountOf(ui, 'Expanding', expandingProps({ 'aria-expanded': false }));
    assert.throws(
      () => handle.update(expandingProps({ 'aria-expanded': null })),
      refusal(NO_SCALAR)
    );
    assert.throws(
      () => handle.update(expandingProps({ 'aria-pressed': true })),
      refusal('"aria-pressed" is not a data attribute')
    );
    const [{ instance }] = mounts;
    assert.deepEqual(instance.updates, [], 'the earlier props stay rendered');
    assert.equal(handle.update(expandingProps({ 'aria-expanded': true })), true);
    assert.equal(handle.update(expandingProps()), true);
    assert.deepEqual(
      instance.updates.map((props) => [
        Object.hasOwn(props, 'aria-expanded'),
        props['aria-expanded'],
      ]),
      [
        [true, true],
        [false, undefined],
      ],
      'the value, then no key at all'
    );
  });
});

// A required title, then a guard and the two keys required while it is truthy, as `Notice` publishes them.
const DISMISSING = Object.freeze({
  name: 'Dismissing',
  path: 'src/ui/svelte/components/Dismissing.svelte',
  version: 1,
  props: {
    title: { kind: 'data', required: true },
    dismissable: { kind: 'data' },
    dismissLabel: { kind: 'data', requiredWhen: 'dismissable' },
    onDismiss: { kind: 'callback', requiredWhen: 'dismissable' },
  },
  rest: true,
  root: 'any',
  component: Object.freeze({ role: 'Dismissing' }),
});
const WHEN = (key) => `Dismissing requires a non-empty "${key}" when "dismissable" is truthy`;

describe('a requiredWhen key', () => {
  const dismissingProps = (overrides = {}) => ({
    title: 'Saved',
    dismissable: true,
    dismissLabel: 'Dismiss the saved notice',
    onDismiss() {},
    ...overrides,
  });
  const mountOf = (ui, props) => ui.mount('Dismissing', { target: new FakeTarget(), props });
  const without = (key, overrides = {}) => {
    const props = dismissingProps(overrides);
    delete props[key];
    return props;
  };

  it('M9: refuses the key absent, undefined or empty while its guard is truthy, naming the guard', () => {
    const { ui, mounts } = seamWith({ table: [DISMISSING] });
    for (const dismissable of [true, 1, 'yes', {}, []]) {
      for (const props of [
        without('dismissLabel', { dismissable }),
        dismissingProps({ dismissable, dismissLabel: undefined }),
        dismissingProps({ dismissable, dismissLabel: '' }),
      ]) {
        assert.throws(() => mountOf(ui, props), refusal(WHEN('dismissLabel')));
      }
      for (const props of [
        without('onDismiss', { dismissable }),
        dismissingProps({ dismissable, onDismiss: undefined }),
      ]) {
        assert.throws(() => mountOf(ui, props), refusal(WHEN('onDismiss')));
      }
    }
    assert.throws(
      () => mountOf(ui, dismissingProps({ onDismiss: '' })),
      refusal('"onDismiss" must be a function'),
      'an empty callback is M17, as on a required one'
    );
    assert.equal(mounts.length, 0);
  });

  it('admits both keys absent while the guard is falsy or absent', () => {
    const { ui, mounts } = seamWith({ table: [DISMISSING] });
    for (const dismissable of [false, 0, '', null, undefined]) {
      mountOf(ui, { title: 'Saved', dismissable });
    }
    mountOf(ui, { title: 'Saved' });
    assert.equal(mounts.length, 6);
  });

  it('refuses the first failing key in manifest order, whatever order the companion passes', () => {
    const { ui } = seamWith({ table: [DISMISSING] });
    assert.throws(
      () => mountOf(ui, { dismissable: true }),
      refusal('Dismissing requires a non-empty "title"')
    );
    assert.throws(
      () => mountOf(ui, { onDismiss() {}, dismissable: true, title: 'Saved' }),
      refusal(WHEN('dismissLabel'))
    );
    assert.throws(
      () => mountOf(ui, { dismissLabel: 'Dismiss', dismissable: true, title: 'Saved' }),
      refusal(WHEN('onDismiss'))
    );
  });

  it("names Notice's first failing requiredWhen key in manifest order when both fail together", () => {
    const shipped = PUBLISHED_COMPONENT_MANIFEST.find((entry) => entry.name === 'Notice');
    const notice = { ...shipped, component: Object.freeze({ role: 'Notice' }) };
    const guarded = Object.keys(notice.props).filter(
      (key) => notice.props[key].requiredWhen === 'dismissable'
    );
    assert.deepEqual(guarded, ['dismissLabel', 'onDismiss'], 'the label precedes the callback');
    const named = (entry, key) =>
      `${entry.name} requires a non-empty "${key}" when "dismissable" is truthy`;
    const failingBoth = [
      { title: 'Saved', dismissable: true },
      { onDismiss: undefined, title: 'Saved', dismissable: true },
      { onDismiss: undefined, dismissLabel: '', dismissable: true, title: 'Saved' },
    ];
    const { ui } = seamWith({ table: [notice] });
    for (const props of failingBoth) {
      assert.throws(
        () => ui.mount('Notice', { target: new FakeTarget(), props }),
        refusal(named(notice, guarded[0]))
      );
    }
    // The same keys listed the other way round name the callback, so the order is the manifest's
    // and not a pass over one kind before another.
    const { dismissLabel, onDismiss, ...rest } = notice.props;
    const reversed = { ...notice, props: { ...rest, onDismiss, dismissLabel } };
    const flipped = seamWith({ table: [reversed] }).ui;
    for (const props of failingBoth) {
      assert.throws(
        () => flipped.mount('Notice', { target: new FakeTarget(), props }),
        refusal(named(reversed, 'onDismiss'))
      );
    }
  });

  it('refuses an update atomically: the earlier props and the earlier callback stay', () => {
    const { ui, mounts } = seamWith({ table: [DISMISSING] });
    const calls = [];
    const noting = (call) => () => {
      calls.push(call);
    };
    const handle = mountOf(ui, dismissingProps({ onDismiss: noting('first') }));
    const next = { onDismiss: noting('next') };
    assert.throws(
      () => handle.update(without('dismissLabel', next)),
      refusal(WHEN('dismissLabel'))
    );
    assert.throws(() => handle.update(without('onDismiss')), refusal(WHEN('onDismiss')));
    const [{ instance }] = mounts;
    assert.deepEqual(instance.updates, [], 'nothing was rendered');
    instance.callbacks.onDismiss.deliver([]);
    assert.deepEqual(calls, ['first'], 'the earlier function still answers');
    assert.equal(
      handle.update({ title: 'Saved', dismissable: false }),
      true,
      'cleared, so neither'
    );
  });

  it('describes requiredWhen last, only on the keys that state it, and never as required', () => {
    const { ui } = seamWith({ table: [DISMISSING] });
    const { props } = ui.describe('Dismissing');
    assert.deepEqual(props.dismissLabel, {
      kind: 'data',
      required: false,
      requiredWhen: 'dismissable',
    });
    assert.deepEqual(Object.keys(props.onDismiss), ['kind', 'required', 'requiredWhen']);
    assert.equal(props.onDismiss.requiredWhen, 'dismissable');
    for (const key of ['title', 'dismissable']) {
      assert.deepEqual(Object.keys(props[key]), ['kind', 'required'], key);
    }
    assert.ok(Object.isFrozen(props.dismissLabel));
  });

  const guarded = (spec, extra = {}) => ({
    ...DISMISSING,
    props: { ...DISMISSING.props, ...extra, dismissLabel: spec },
  });
  for (const [claim, entry, other] of [
    ['a key the entry does not publish', guarded({ kind: 'data', requiredWhen: 'nope' }), 'nope'],
    ['an inherited name', guarded({ kind: 'data', requiredWhen: 'toString' }), 'toString'],
    ['itself', guarded({ kind: 'data', requiredWhen: 'dismissLabel' }), 'dismissLabel'],
    ['a value that is no string', guarded({ kind: 'data', requiredWhen: 1 }), '1'],
    ['a callback guard', guarded({ kind: 'data', requiredWhen: 'onDismiss' }), 'onDismiss'],
    [
      'a text guard',
      guarded({ kind: 'data', requiredWhen: 'note' }, { note: { kind: 'text' } }),
      'note',
    ],
    ['a required guard', guarded({ kind: 'data', requiredWhen: 'title' }), 'title'],
    [
      'a guard that is itself requiredWhen',
      guarded(
        { kind: 'data', requiredWhen: 'shown' },
        { shown: { kind: 'data', requiredWhen: 'dismissable' } }
      ),
      'shown',
    ],
    [
      'a key beside required',
      guarded({ kind: 'data', required: false, requiredWhen: 'dismissable' }),
      'dismissable',
    ],
    ['a slot key', guarded({ kind: 'slot', requiredWhen: 'dismissable' }), 'dismissable'],
    ['an aria key', guarded({ kind: 'aria', requiredWhen: 'dismissable' }), 'dismissable'],
  ]) {
    it(`refuses at registration a requiredWhen on ${claim}, naming the entry, key and guard`, () => {
      const seam = createPublishedComponents({ table: [entry], isReady: () => true });
      assert.throws(
        () => seam.register({ ...fakeRuntime().runtime, components: {} }),
        (error) => {
          assert.equal(error.constructor, Error);
          assert.match(
            error.message,
            exactly(`${PREFIX}Dismissing "dismissLabel" has an unknown requiredWhen "${other}"`)
          );
          return true;
        }
      );
    });
  }
});

describe('a live mount', () => {
  it('hands the runtime the host, the entry component and a copy of the props', () => {
    const { ui, mounts } = seamWith();
    const target = new FakeTarget();
    const props = zetaProps();
    const handle = ui.mount('Zeta', { target, props });
    const [{ host, props: hostProps }] = mounts;
    assert.equal(host, HOST);
    assert.equal(hostProps.component, ZETA_COMPONENT);
    assert.deepEqual(Object.keys(hostProps), [
      'component',
      'initial',
      'values',
      'onfault',
      'kinds',
      'slots',
      'callbacks',
      'flush',
    ]);
    assert.deepEqual(hostProps.values, {}, 'a data-only entry has no value key');
    assert.deepEqual(hostProps.kinds, {}, 'a data-only entry has no other kind');
    assert.ok(Object.isFrozen(hostProps.kinds));
    assert.deepEqual(hostProps.initial, props);
    assert.notEqual(hostProps.initial, props);
    assert.notEqual(hostProps.initial.items, props.items, 'copied at every depth');
    props.items[0].id = 'mutated';
    assert.equal(hostProps.initial.items[0].id, 'a', 'copied at call time');
    assert.deepEqual(Object.keys(handle), ['update', 'destroy', 'slot', 'value']);
    assert.ok(Object.isFrozen(handle));
  });

  it('replaces the props on update rather than merging them', () => {
    const { ui, mounts } = seamWith();
    const handle = ui.mount('Zeta', { target: new FakeTarget(), props: zetaProps() });
    assert.equal(handle.update({ label: 'Only' }), true);
    const [{ instance }] = mounts;
    assert.deepEqual(instance.updates, [{ label: 'Only' }]);
    assert.equal(Object.hasOwn(instance.updates[0], 'items'), false);
    assert.equal(mounts.length, 1, 'nothing remounts');
  });

  it('applies an update atomically: a refused one leaves the previous props rendered', () => {
    const { ui, mounts } = seamWith();
    const handle = ui.mount('Zeta', { target: new FakeTarget(), props: zetaProps() });
    const loop = {};
    loop.loop = loop;
    const refusals = [
      [null, 'props must be a plain object'],
      [zetaProps({ 'aria-x': 'y' }), '"aria-x" is not a data attribute'],
      [{ items: [] }, 'Zeta requires a non-empty "label"'],
      [zetaProps({ items: [() => 1] }), '"items" must not hold a function'],
      [zetaProps({ items: new Date() }), '"items" must be data'],
      [zetaProps({ items: loop }), '"items" holds a cycle'],
    ];
    for (const [props, tail] of refusals) {
      assert.throws(() => handle.update(props), refusal(tail));
    }
    const alpha = ui.mount('Alpha', { target: new FakeTarget(), props: { value: 1 } });
    assert.throws(() => alpha.update({ extra: 1 }), refusal('"extra" is not a prop of Alpha'));
    assert.deepEqual(mounts[0].instance.updates, []);
    assert.deepEqual(mounts[1].instance.updates, []);
    assert.equal(handle.update(zetaProps({ label: 'Next' })), true);
    assert.equal(mounts[0].instance.updates.length, 1);
  });

  it('destroys idempotently: one unmount, a released claim, and updates answering false', () => {
    const { seam, ui, unmounts } = seamWith();
    const target = new FakeTarget();
    const handle = ui.mount('Zeta', { target, props: zetaProps() });
    handle.destroy();
    handle.destroy();
    handle.destroy();
    assert.equal(unmounts.length, 1);
    assert.equal(handle.update(zetaProps()), false);
    assert.equal(handle.update(null), false, 'a dead handle answers false before validating');
    assert.equal(seam.liveMountCount(), 0);
    const again = ui.mount('Zeta', { target, props: zetaProps() });
    assert.equal(again.update(zetaProps()), true, 'the target can be mounted again');
  });

  it('releases the claim even when the runtime unmount throws, reporting that throw', () => {
    const error = new Error('teardown threw');
    const { ui, reports } = seamWith({ unmountError: error });
    const target = new FakeTarget();
    const handle = ui.mount('Zeta', { target, props: zetaProps() });
    handle.destroy();
    assert.deepEqual(reports, [[FAULT_REPORT, 'Zeta', error]]);
    assert.equal(handle.update(zetaProps()), false);
    assert.throws(
      () => ui.mount('Zeta', { target, props: zetaProps() }),
      refusal('target must be empty'),
      'the leftover root is content, not a held claim'
    );
  });

  it('supersedes a stale claim whose root has left the target, then checks emptiness', () => {
    const { ui, unmounts, mounts } = seamWith();
    const target = new FakeTarget();
    const stale = ui.mount('Zeta', { target, props: zetaProps() });
    target.childNodes.length = 0;
    const fresh = ui.mount('Zeta', { target, props: zetaProps() });
    assert.equal(unmounts.length, 1);
    assert.equal(unmounts[0], mounts[0].instance);
    assert.equal(stale.update(zetaProps()), false);
    assert.equal(fresh.update(zetaProps()), true);

    const replaced = new FakeTarget();
    const old = ui.mount('Zeta', { target: replaced, props: zetaProps() });
    replaced.childNodes[0] = { role: 'companion re-render' };
    assert.throws(
      () => ui.mount('Zeta', { target: replaced, props: zetaProps() }),
      refusal('target must be empty')
    );
    assert.equal(old.update(zetaProps()), false, 'the stale entry was destroyed first');
  });

  it('counts live mounts back to zero after mounts and destroys', () => {
    const { seam, ui } = seamWith();
    const handles = Array.from({ length: 5 }, () =>
      ui.mount('Zeta', { target: new FakeTarget(), props: zetaProps() })
    );
    assert.equal(seam.liveMountCount(), 5);
    for (const handle of handles) handle.destroy();
    assert.equal(seam.liveMountCount(), 0);
  });
});

describe('a text key', () => {
  const titled = (overrides = {}) => ({ title: 'Standing', ...overrides });

  it('hands the host the kinds that are not data, frozen, and each string as passed', () => {
    const { ui, mounts } = seamWith();
    const props = titled({ note: '<b>raw</b>', rank: 2 });
    ui.mount('Titled', { target: new FakeTarget(), props });
    const [{ props: hostProps }] = mounts;
    assert.deepEqual(hostProps.kinds, { title: 'text', note: 'text' });
    assert.ok(Object.isFrozen(hostProps.kinds));
    assert.deepEqual(hostProps.initial, props);
  });

  it('M14: refuses a value that is not a string', () => {
    const { ui, mounts } = seamWith();
    for (const value of [3, null, true, { text: 'x' }, ['x']]) {
      for (const key of ['title', 'note']) {
        assert.throws(
          () => ui.mount('Titled', { target: new FakeTarget(), props: titled({ [key]: value }) }),
          refusal(`"${key}" must be a string`)
        );
      }
    }
    assert.equal(mounts.length, 0);
  });

  it('M10: refuses a function, as on a data key', () => {
    const { ui } = seamWith();
    assert.throws(
      () => ui.mount('Titled', { target: new FakeTarget(), props: titled({ note: () => 'x' }) }),
      refusal('"note" must not hold a function')
    );
  });

  it('reads undefined as absent, so an optional key passes and a required one is M9', () => {
    const { ui, mounts } = seamWith();
    ui.mount('Titled', { target: new FakeTarget(), props: titled({ note: undefined }) });
    assert.equal(mounts[0].props.initial.note, undefined);
    ui.mount('Titled', { target: new FakeTarget(), props: titled({ note: '' }) });
    assert.equal(mounts[1].props.initial.note, '', "an optional '' is the host's to omit");
    for (const props of [{}, { title: undefined }, { title: '' }]) {
      assert.throws(
        () => ui.mount('Titled', { target: new FakeTarget(), props }),
        refusal('Titled requires a non-empty "title"')
      );
    }
  });

  it('applies an update atomically: a refused one leaves the previous props rendered', () => {
    const { ui, mounts } = seamWith();
    const handle = ui.mount('Titled', { target: new FakeTarget(), props: titled() });
    assert.throws(() => handle.update(titled({ note: 4 })), refusal('"note" must be a string'));
    assert.throws(() => handle.update({ title: 7 }), refusal('"title" must be a string'));
    assert.throws(
      () => handle.update({ note: 'x' }),
      refusal('Titled requires a non-empty "title"')
    );
    assert.deepEqual(mounts[0].instance.updates, []);
    assert.equal(handle.update(titled({ title: 'Next' })), true);
    assert.deepEqual(mounts[0].instance.updates, [{ title: 'Next' }]);
  });
});

describe('load', () => {
  it('resolves undefined for published names, before ready and before registration', async () => {
    const seam = createPublishedComponents({ table: TABLE, isReady: () => false });
    for (const names of [[], ['Zeta'], 'Zeta', ['Zeta', 'Titled']]) {
      let loading;
      assert.doesNotThrow(() => {
        loading = seam.publicApi.load(names);
      });
      assert.ok(loading instanceof Promise, 'a Promise');
      assert.equal(await loading, undefined);
    }
  });

  it('rejects with M3 for the first name that is not published, and throws nothing', async () => {
    const { ui } = seamWith();
    for (const [args, missing] of [
      [[['Zeta', 'Nope', 'Zip']], 'Nope'],
      [['toString'], 'toString'],
      [[], 'undefined'],
    ]) {
      let loading;
      assert.doesNotThrow(() => {
        loading = ui.load(...args);
      });
      await assert.rejects(loading, refusal(`"${missing}" is not published`));
    }
  });
});

// An entry stating `lazy: true` is bound to a loader and no component (issue 2455).
const LAZY_COMPONENT = Object.freeze({ role: 'Lazy' });
const LAZY = Object.freeze({
  name: 'Lazy',
  path: 'src/ui/svelte/components/Lazy.svelte',
  version: 1,
  props: { value: { kind: 'data' } },
  rest: false,
  root: 'any',
  lazy: true,
});
const CHUNK_FAILURE = 'Failed to fetch dynamically imported module: https://x/chunks/Lazy-ab12.js';

function lazySeam(loader, options = {}) {
  return seamWith({ table: [ZETA, LAZY], loaders: { [LAZY.path]: loader }, ...options });
}

describe('a lazy entry', () => {
  it('M19: refuses a mount until load has resolved for it, directly after M3, rendering nothing', async () => {
    const pending = deferredLoader();
    const { ui, mounts } = lazySeam(pending.load);
    const target = new FakeTarget();
    for (const options of [
      { target, props: { value: 1 } },
      { target: {}, props: { nope: 1 } },
    ]) {
      assert.throws(() => ui.mount('Lazy', options), refusal('"Lazy" is not loaded'));
    }
    const loading = ui.load(['Lazy']);
    assert.throws(() => ui.mount('Lazy', { target }), refusal('"Lazy" is not loaded'));
    assert.throws(() => ui.mount('Nope', { target }), refusal('"Nope" is not published'));
    assert.equal(target.childNodes.length, 0);
    assert.equal(mounts.length, 0);
    pending.resolve(LAZY_COMPONENT);
    assert.equal(await loading, undefined);
    ui.mount('Lazy', { target, props: { value: 1 } });
    assert.equal(mounts[0].props.component, LAZY_COMPONENT, 'the component its loader resolved');
    assert.equal(target.childNodes.length, 1);
  });

  it('M2: refuses an unloaded mount before ready as mount before ready, ahead of M19', () => {
    const { ui } = lazySeam(deferredLoader().load, { isReady: () => false });
    assert.throws(
      () => ui.mount('Lazy', { target: new FakeTarget() }),
      refusal('mount before ready')
    );
  });

  it('calls its loader once for concurrent and later loads', async () => {
    const pending = deferredLoader();
    const { ui } = lazySeam(pending.load);
    const loads = [ui.load(['Lazy']), ui.load(['Zeta', 'Lazy']), ui.load('Lazy')];
    pending.resolve(LAZY_COMPONENT);
    assert.deepEqual(await Promise.all(loads), [undefined, undefined, undefined]);
    assert.equal(pending.calls, 1, 'one call for three concurrent loads');
    await ui.load(['Lazy']);
    assert.equal(pending.calls, 1);
  });

  it('rejects with M3 for a name that is not published before any loader runs', async () => {
    const pending = deferredLoader();
    const { ui } = lazySeam(pending.load);
    await assert.rejects(ui.load(['Lazy', 'Nope']), refusal('"Nope" is not published'));
    assert.equal(pending.calls, 0);
  });

  it("rejects with the loader's error, keeps it and never calls the loader again, so M19 stays", async () => {
    const failure = new Error('offline');
    for (const loader of [
      () => Promise.reject(failure),
      () => {
        throw failure;
      },
    ]) {
      let calls = 0;
      const { ui } = lazySeam(() => {
        calls += 1;
        return loader();
      });
      let loading;
      assert.doesNotThrow(() => {
        loading = ui.load(['Lazy']);
      });
      await assert.rejects(loading, (error) => error === failure);
      await assert.rejects(ui.load(['Zeta', 'Lazy']), (error) => error === failure);
      assert.equal(calls, 1, 'a failed fetch is not retried');
      const target = new FakeTarget();
      assert.throws(() => ui.mount('Lazy', { target }), refusal('"Lazy" is not loaded'));
    }
  });

  it('hands a chunk-load failure to reportLoadFailure once, and no other failure', async () => {
    for (const [failure, expected] of [
      [new TypeError(CHUNK_FAILURE), 1],
      [new Error('Lazy.svelte threw while it evaluated'), 0],
    ]) {
      const reported = [];
      const { ui } = lazySeam(() => Promise.reject(failure), {
        reportLoadFailure: (error) => {
          reported.push(error);
        },
      });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await assert.rejects(ui.load(['Lazy']), (error) => error === failure);
      }
      assert.deepEqual(
        reported,
        Array.from({ length: expected }, () => failure)
      );
    }
  });

  it("rejects with the loader's error when reportLoadFailure throws", async () => {
    const failure = new TypeError(CHUNK_FAILURE);
    let reports = 0;
    const { ui } = lazySeam(() => Promise.reject(failure), {
      reportLoadFailure: () => {
        reports += 1;
        throw new Error('the notice failed');
      },
    });
    await assert.rejects(ui.load(['Lazy']), (error) => error === failure);
    await assert.rejects(ui.load(['Lazy']), (error) => error === failure);
    assert.equal(reports, 1);
  });

  it('rejects before registration as mount throws there, while an eager name resolves', async () => {
    const seam = createPublishedComponents({ table: [ZETA, LAZY], isReady: () => true });
    await assert.rejects(seam.publicApi.load(['Lazy']), (error) => {
      assert.equal(error.constructor, Error);
      assert.match(error.message, exactly(`${PREFIX}not registered`));
      return true;
    });
    assert.equal(await seam.publicApi.load(['Zeta']), undefined);
  });

  it('is described as an eager entry is, with no lazy member', () => {
    const { ui } = lazySeam(deferredLoader().load);
    assert.deepEqual(ui.describe('Lazy'), {
      version: 1,
      props: { value: { kind: 'data', required: false } },
      rest: false,
      root: 'any',
      overlays: false,
    });
  });
});

describe('a faulted mount', () => {
  it('reports once, unmounts once, releases the claim and goes inert', () => {
    const { seam, ui, mounts, unmounts, reports } = seamWith();
    const target = new FakeTarget();
    const handle = ui.mount('Zeta', { target, props: zetaProps() });
    const error = new Error('render blew up');
    mounts[0].props.onfault(error);
    mounts[0].props.onfault(new Error('a second fault'));
    assert.deepEqual(reports, [[FAULT_REPORT, 'Zeta', error]]);
    assert.equal(unmounts.length, 1);
    assert.equal(target.childNodes.length, 0);
    assert.equal(handle.update(zetaProps()), false);
    assert.equal(handle.update(zetaProps()), false);
    handle.destroy();
    assert.equal(unmounts.length, 1, 'destroy after a fault unmounts nothing more');
    assert.equal(seam.liveMountCount(), 0);
    assert.equal(ui.mount('Zeta', { target, props: zetaProps() }).update(zetaProps()), true);
  });

  it('defers the unmount to a microtask when the fault arrives inside the runtime call', async () => {
    const error = new Error('during mount');
    const { seam, ui, unmounts, reports, events } = seamWith({ faultDuringMount: error });
    const target = new FakeTarget();
    const onFault = () => {
      events.push('onFault');
    };
    const handle = ui.mount('Zeta', { target, props: zetaProps(), onFault });
    assert.deepEqual(reports, [[FAULT_REPORT, 'Zeta', error]]);
    assert.equal(handle.update(zetaProps()), false);
    assert.equal(seam.liveMountCount(), 0);
    assert.equal(unmounts.length, 0);
    await Promise.resolve();
    assert.equal(unmounts.length, 1);
    assert.equal(target.childNodes.length, 0);
    assert.deepEqual(events, ['unmount', 'onFault'], 'one callback unmounts, then notifies');
  });

  it('reports a synchronous runtime throw and answers an inert handle on an empty target', () => {
    const error = new Error('runtime refused');
    const { seam, ui, unmounts, reports } = seamWith({ mountError: error });
    const target = new FakeTarget();
    const handle = ui.mount('Zeta', { target, props: zetaProps() });
    assert.deepEqual(reports, [[FAULT_REPORT, 'Zeta', error]]);
    assert.deepEqual(Object.keys(handle), ['update', 'destroy', 'slot', 'value']);
    assert.ok(Object.isFrozen(handle));
    assert.equal(handle.update(zetaProps()), false);
    assert.equal(handle.value('label'), undefined, 'the inert handle reads no value');
    handle.destroy();
    assert.equal(unmounts.length, 0);
    assert.equal(target.childNodes.length, 0);
    assert.equal(seam.liveMountCount(), 0);
  });
});

describe('a mount made with onFault', () => {
  /** A seam, a target, and an `onFault` logging itself with what it saw of the target and handle. */
  function watched(runtimeOptions = {}) {
    const fake = seamWith(runtimeOptions);
    const target = new FakeTarget();
    const seen = [];
    const mounted = {};
    const onFault = (error) => {
      fake.events.push('onFault');
      seen.push({
        error,
        children: target.childNodes.length,
        update: mounted.handle?.update(zetaProps()),
      });
    };
    const mount = (name = 'Zeta', props = zetaProps()) => {
      mounted.handle = fake.ui.mount(name, { target, props, onFault });
      return mounted.handle;
    };
    return { ...fake, target, seen, mount };
  }

  it('is told with an empty target even when the runtime unmount throws', async () => {
    const teardown = new Error('teardown threw');
    const { mount, mounts, seen, reports, target } = watched({ unmountError: teardown });
    mount();
    mounts[0].props.onfault(new Error('render blew up'));
    await drained();
    assert.deepEqual(
      seen.map(({ children }) => children),
      [0]
    );
    assert.equal(reports.length, 2, 'the fault and the failed unmount are each reported once');
    assert.equal(target.childNodes.length, 0);
  });

  it('is told of a boundary fault once, in a microtask after the synchronous unmount', async () => {
    const { mount, mounts, events, seen } = watched();
    mount();
    const error = new Error('render blew up');
    mounts[0].props.onfault(error);
    events.push('returned');
    assert.deepEqual(events, ['unmount', 'returned'], 'never inside the fault delivery');
    await drained();
    assert.deepEqual(events, ['unmount', 'returned', 'onFault']);
    assert.deepEqual(seen, [{ error, children: 0, update: false }]);
    mounts[0].props.onfault(new Error('a second fault'));
    await drained();
    assert.equal(seen.length, 1, 'a second fault tells it nothing');
  });

  it('is told of a fault inside the runtime call after the deferred unmount', async () => {
    const error = new Error('during mount');
    const { mount, events, seen } = watched({ faultDuringMount: error });
    mount();
    events.push('returned');
    assert.deepEqual(events, ['returned'], 'never inside mount');
    await drained();
    assert.deepEqual(events, ['returned', 'unmount', 'onFault']);
    assert.deepEqual(seen, [{ error, children: 0, update: false }]);
  });

  it('is told of a synchronous runtime throw after mount returns, the target empty', async () => {
    const error = new Error('runtime refused');
    const { mount, events, seen, unmounts } = watched({ mountError: error });
    mount();
    events.push('returned');
    assert.deepEqual(events, ['returned']);
    await drained();
    assert.deepEqual(events, ['returned', 'onFault']);
    assert.deepEqual(seen, [{ error, children: 0, update: false }]);
    assert.equal(unmounts.length, 0, 'this path has no instance to unmount');
  });

  it('is told once, of the fault, when the runtime faults and then throws', async () => {
    const fault = new Error('during mount');
    const thrown = new Error('runtime refused');
    const { mount, events, seen, reports } = watched({
      faultDuringMount: fault,
      mountError: thrown,
    });
    mount();
    await drained();
    assert.deepEqual(events, ['onFault']);
    assert.deepEqual(seen, [{ error: fault, children: 0, update: false }]);
    assert.deepEqual(reports, [
      [FAULT_REPORT, 'Zeta', fault],
      [FAULT_REPORT, 'Zeta', thrown],
    ]);
  });

  it('is not told of a destroy, of a stale claim a new mount ended, or of a refusal', async () => {
    const { mount, ui, target, events, seen } = watched();
    mount().destroy();
    mount();
    target.childNodes.length = 0;
    ui.mount('Zeta', { target, props: zetaProps() }).destroy();
    assert.throws(() => mount('Zeta', {}), refusal('Zeta requires a non-empty "label"'));
    assert.throws(() => mount('Nope'), refusal('"Nope" is not published'));
    await drained();
    assert.deepEqual(events, ['unmount', 'unmount', 'unmount']);
    assert.deepEqual(seen, []);
  });

  it('lets the companion mount into the emptied target from inside it', async () => {
    const { ui, mounts } = seamWith();
    const target = new FakeTarget();
    let again;
    ui.mount('Zeta', {
      target,
      props: zetaProps(),
      onFault: () => {
        again = ui.mount('Zeta', { target, props: zetaProps({ label: 'Fallback' }) });
      },
    });
    mounts[0].props.onfault(new Error('render blew up'));
    await drained();
    assert.equal(again.update(zetaProps()), true, 'the claim was released before the notice');
    assert.equal(mounts.length, 2);
  });

  it('ignores an onFault that is not a function', async () => {
    for (const runtimeOptions of [{}, { mountError: new Error('runtime refused') }]) {
      const { ui, mounts, reports } = seamWith(runtimeOptions);
      ui.mount('Zeta', { target: new FakeTarget(), props: zetaProps(), onFault: 'x' });
      mounts[0]?.props.onfault(new Error('render blew up'));
      await drained();
      assert.equal(reports.length, 1, 'only the fault itself is reported');
    }
  });

  it('reports a throw from it as one more render failure under the entry name', async () => {
    const { ui, mounts, reports } = seamWith();
    const thrown = new Error('the companion handler threw');
    const throws = () => {
      throw thrown;
    };
    for (const onFault of [throws, () => Promise.resolve('ignored')]) {
      ui.mount('Zeta', { target: new FakeTarget(), props: zetaProps(), onFault });
    }
    const error = new Error('render blew up');
    for (const { props } of mounts) props.onfault(error);
    await drained();
    assert.deepEqual(reports, [
      [FAULT_REPORT, 'Zeta', error],
      [FAULT_REPORT, 'Zeta', error],
      [FAULT_REPORT, 'Zeta', thrown],
    ]);
  });
});

describe('registration', () => {
  for (const kind of ['snippet', 'bindable']) {
    it(`refuses a manifest entry whose prop kind is ${kind}, naming the entry, key and kind`, () => {
      const unknown = { ...ALPHA, props: { body: { kind } } };
      const seam = createPublishedComponents({ table: [unknown], isReady: () => true });
      assert.throws(
        () => seam.register({ ...fakeRuntime().runtime, components: {} }),
        (error) => {
          assert.equal(error.constructor, Error);
          assert.match(
            error.message,
            exactly(`${PREFIX}Alpha "body" has an unknown kind "${kind}"`)
          );
          return true;
        }
      );
      assert.throws(
        () => seam.publicApi.mount('Alpha', { target: new FakeTarget() }),
        (error) => exactly(`${PREFIX}not registered`).test(error.message)
      );
    });
  }

  for (const [root, written] of [
    ['window', 'window'],
    [undefined, 'undefined'],
    ['Any', 'Any'],
    ['toString', 'toString'],
  ]) {
    it(`refuses a manifest entry whose root is ${written}, naming the entry and the root`, () => {
      const unknown = { ...ALPHA, root };
      const seam = createPublishedComponents({ table: [unknown], isReady: () => true });
      assert.throws(
        () => seam.register({ ...fakeRuntime().runtime, components: {} }),
        (error) => {
          assert.equal(error.constructor, Error);
          assert.match(error.message, exactly(`${PREFIX}Alpha has an unknown root "${written}"`));
          return true;
        }
      );
    });
  }

  it('registers each shipped root, and describes it', () => {
    for (const root of ['any', 'fabricate', 'manager']) {
      const { ui } = seamWith({ table: [{ ...ALPHA, root }] });
      assert.equal(ui.describe('Alpha').root, root);
    }
  });

  it('refuses a second registration, keeping the first runtime', () => {
    const { seam, ui, mounts } = seamWith();
    const second = fakeRuntime();
    assert.throws(
      () => seam.register({ ...second.runtime, components: {} }),
      (error) => {
        assert.equal(error.constructor, Error);
        assert.match(error.message, exactly(`${PREFIX}already registered`));
        return true;
      }
    );
    ui.mount('Alpha', { target: new FakeTarget(), props: { value: 1 } });
    assert.equal(mounts.length, 1, 'the first runtime still mounts');
    assert.equal(second.mounts.length, 0);
  });

  for (const lazy of ['true', 1, null]) {
    it(`refuses a manifest entry whose lazy is ${String(lazy)}, naming the entry and the value`, () => {
      const seam = createPublishedComponents({ table: [{ ...ALPHA, lazy }], isReady: () => true });
      assert.throws(
        () => seam.register({ ...fakeRuntime().runtime, components: {}, loaders: {} }),
        (error) => {
          assert.equal(error.constructor, Error);
          assert.match(error.message, exactly(`${PREFIX}Alpha has an unknown lazy "${lazy}"`));
          return true;
        }
      );
    });
  }

  const LAZY_BINDING = `${PREFIX}Lazy is lazy, so its runtime binds a loader and no component`;
  const EAGER_BINDING = `${PREFIX}Alpha is not lazy, so its runtime binds no loader`;
  for (const [claim, table, components, loaders, message] of [
    ['a lazy entry bound to no loader', [LAZY], {}, {}, LAZY_BINDING],
    [
      'a lazy entry bound to a loader that is no function',
      [LAZY],
      {},
      { [LAZY.path]: 'x' },
      LAZY_BINDING,
    ],
    [
      'a lazy entry bound to a component beside its loader',
      [LAZY],
      { [LAZY.path]: LAZY_COMPONENT },
      { [LAZY.path]: () => LAZY_COMPONENT },
      LAZY_BINDING,
    ],
    ['an eager entry bound to a loader', [ALPHA], {}, { [ALPHA.path]: () => {} }, EAGER_BINDING],
    [
      'an eager entry stating lazy: false bound to a loader',
      [{ ...ALPHA, lazy: false }],
      {},
      { [ALPHA.path]: () => {} },
      EAGER_BINDING,
    ],
  ]) {
    it(`refuses ${claim}, and stays unregistered`, () => {
      const seam = createPublishedComponents({ table, isReady: () => true });
      assert.throws(
        () => seam.register({ ...fakeRuntime().runtime, components, loaders }),
        (error) => error.constructor === Error && exactly(message).test(error.message)
      );
      assert.throws(
        () => seam.publicApi.mount(table[0].name, { target: new FakeTarget() }),
        (error) => exactly(`${PREFIX}not registered`).test(error.message)
      );
    });
  }

  it('treats only a boolean true as required', () => {
    const loose = { ...ALPHA, props: { value: { kind: 'data', required: 'yes' } } };
    const { ui } = seamWith({ table: [loose] });
    assert.deepEqual(ui.describe('Alpha').props.value, { kind: 'data', required: false });
    ui.mount('Alpha', { target: new FakeTarget(), props: {} });
  });
});

// `InfoStrip` spreads each fact's `props` as attributes, so the seam drops that member; `Meter`'s
// `segments` and `Ticker`'s `facts` are not stripped, so an item there keeps every member it was given.
const STRIP_TABLE = Object.freeze([
  {
    name: 'InfoStrip',
    path: 'src/ui/svelte/components/InfoStrip.svelte',
    version: 1,
    props: { label: { kind: 'data' }, facts: { kind: 'data' } },
    rest: false,
    root: 'any',
    component: Object.freeze({ role: 'InfoStrip' }),
  },
  {
    name: 'Meter',
    path: 'src/ui/svelte/components/Meter.svelte',
    version: 1,
    props: { segments: { kind: 'data' } },
    rest: false,
    root: 'any',
    component: Object.freeze({ role: 'Meter' }),
  },
  {
    name: 'Ticker',
    path: 'src/ui/svelte/components/Ticker.svelte',
    version: 1,
    props: { facts: { kind: 'data' } },
    rest: false,
    root: 'any',
    component: Object.freeze({ role: 'Ticker' }),
  },
]);
const ATTRIBUTES = Object.freeze({ 'data-action': 'close', class: 'x', 'aria-label': 'Hidden' });
const fact = (value) => ({ icon: 'fas fa-sun', value, props: { ...ATTRIBUTES } });

describe('a per-item member the seam strips', () => {
  const stripping = () => seamWith({ table: STRIP_TABLE });
  const target = () => new FakeTarget();

  it('is dropped from every fact on mount, and nothing else is', () => {
    const { ui, mounts } = stripping();
    ui.mount('InfoStrip', { target: target(), props: { facts: [fact('Clear'), fact('Storm')] } });
    assert.deepEqual(mounts[0].props.initial.facts, [
      { icon: 'fas fa-sun', value: 'Clear' },
      { icon: 'fas fa-sun', value: 'Storm' },
    ]);
  });

  it('is dropped on update too', () => {
    const { ui, mounts } = stripping();
    const handle = ui.mount('InfoStrip', { target: target(), props: { facts: [fact('Clear')] } });
    assert.equal(handle.update({ facts: [fact('Storm')] }), true);
    assert.deepEqual(mounts[0].instance.updates[0].facts, [{ icon: 'fas fa-sun', value: 'Storm' }]);
  });

  it('is dropped from a copy, and never from the caller’s object', () => {
    const { ui, mounts } = stripping();
    const facts = [fact('Clear')];
    ui.mount('InfoStrip', { target: target(), props: { facts } });
    assert.deepEqual(facts, [fact('Clear')], 'the caller keeps its props member');
    assert.notEqual(mounts[0].props.initial.facts, facts);
    assert.notEqual(mounts[0].props.initial.facts[0], facts[0]);
  });

  it('tolerates a facts value that is not an array, and an item that is null or a primitive', () => {
    const { ui, mounts } = stripping();
    for (const facts of ['Clear', 7, null, true, {}]) {
      ui.mount('InfoStrip', { target: target(), props: { facts } });
    }
    assert.deepEqual(
      mounts.map((mount) => mount.props.initial.facts),
      ['Clear', 7, null, true, {}]
    );
    ui.mount('InfoStrip', { target: target(), props: { facts: [null, 'x', 3, fact('Clear')] } });
    assert.deepEqual(mounts[5].props.initial.facts, [
      null,
      'x',
      3,
      { icon: 'fas fa-sun', value: 'Clear' },
    ]);
  });

  it('is judged first: a function in the member is still M10, and a non-data item is M11', () => {
    const { ui } = stripping();
    const mount = (facts) => () => ui.mount('InfoStrip', { target: target(), props: { facts } });
    assert.throws(
      mount([{ value: 'x', props: { onclick: () => {} } }]),
      refusal('"facts" must not hold a function')
    );
    assert.throws(mount([new Date()]), refusal('"facts" must be data'));
  });

  it('is private to its own key: a member of another entry passes through', () => {
    const { ui, mounts } = stripping();
    const segments = [{ tone: 'danger', props: { 'data-x': 1 } }];
    ui.mount('Meter', { target: target(), props: { segments } });
    assert.deepEqual(mounts[0].props.initial.segments, segments);
  });

  it('is private to its own entry: another entry’s key of the same name passes through', () => {
    const { ui, mounts } = stripping();
    const facts = [fact('Clear')];
    ui.mount('Ticker', { target: target(), props: { facts } });
    assert.deepEqual(mounts[0].props.initial.facts, facts);
  });

  it('drops a member at a nested path from the items below it', () => {
    const tiers = [{ yields: [{ props: { a: 1 }, name: 'x' }, { name: 'y' }], props: { b: 2 } }];
    assert.deepEqual(withoutMember(tiers, ['yields', 'props']), [
      { yields: [{ name: 'x' }, { name: 'y' }], props: { b: 2 } },
    ]);
    assert.deepEqual(tiers[0].yields[0].props, { a: 1 }, 'the value it was given is unchanged');
  });
});
