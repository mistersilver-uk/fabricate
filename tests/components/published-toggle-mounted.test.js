/**
 * The published `StatusToggle` on Fabricate's real Svelte runtime (issue 2452), through a fresh
 * seam registered with the adapter's own table, under the Fabricate window root it needs: the one
 * native button its default host draws, its state, a press and its `onclick`, an update that keeps
 * the node and its focus, its two `aria` keys read off the button, every refusal the entry adds, and
 * its required root. The default host is held here because the static gates pin it to the default
 * of the unpublished `as`.
 * Limit: happy-dom activates no button from a key, so the View Lab's toggles case holds the Space
 * press, and no accessible name is computed here: that case's Playwright clause reads it.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { RESERVED_REST_NAMES, recorder } from '../helpers/publishedComponentFakes.js';
import {
  CALLBACK_REPORT,
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  companionTarget,
  fabricateTarget,
  recordEscapes,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const REFUSAL = 'Fabricate | published components: ';
const NAME = 'Group by category';
const LABEL_ID = 'acme-group-label';
const HINT_ID = 'acme-group-hint';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-toggle-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let seamParts;
let reports;
let escaped;
let targets;
let stopRecording;

const ui = () =>
  shippedSeam({
    ...seamParts,
    report: (...args) => {
      reports.push(args);
    },
  });

before(async () => {
  await harness.setup();
  const { publishedComponentRuntime: runtime, COMPONENTS: components } =
    await harness.loadRuneModule(PUBLISHED_ADAPTER);
  const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
  seamParts = { createPublishedComponents, runtime, components };
  stopRecording = recordEscapes((error) => {
    escaped.push(error);
  });
});

after(() => {
  stopRecording();
  return harness.teardown();
});

beforeEach(() => {
  reports = [];
  escaped = [];
  targets = [];
});

afterEach(() => {
  for (const shell of targets) shell.remove();
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
});

/** The props of a switch that is off, named, and pressed into `onclick`, with `overrides` over them. */
const base = (overrides = {}) => ({ on: false, ariaLabel: NAME, onclick() {}, ...overrides });

/**
 * A switch mounted with `props` over an off state, a name and a recording `onclick`, under a shell
 * carrying `under`: its target, its handle, the recorded calls, and `button()`, the element drawn now.
 */
function mountToggle(props = {}, under = 'fabricate') {
  const press = recorder();
  const target = fabricateTarget(targets, under);
  const handle = ui().mount('StatusToggle', {
    target,
    props: base({ onclick: press.record, ...props }),
  });
  return { target, handle, calls: press.calls, button: () => target.querySelector('button') };
}

const authoredClasses = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

/** The refusal `mount` throws for `props` over a named, pressable switch, with nothing rendered. */
function assertRefused(props, tail) {
  const target = fabricateTarget(targets);
  assert.throws(() => ui().mount('StatusToggle', { target, props: base(props) }), {
    name: 'TypeError',
    message: REFUSAL + tail,
  });
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

/** The refusal an update with `props` throws on a mounted switch, which keeps its earlier props. */
async function assertUpdateRefused(props, tail) {
  const { handle, calls, button } = mountToggle({ 'aria-describedby': HINT_ID });
  await settle();
  assert.throws(() => handle.update(props), { name: 'TypeError', message: REFUSAL + tail });
  await settle();
  assert.equal(button().getAttribute('aria-pressed'), 'false', 'the earlier state stays drawn');
  assert.equal(button().getAttribute('aria-label'), NAME, 'and its name');
  assert.equal(button().getAttribute('aria-describedby'), HINT_ID, 'and its aria key');
  button().click();
  assert.deepEqual(calls, [[]], 'and the earlier function still answers');
  handle.destroy();
}

describe('the default draws the button host alone', () => {
  for (const under of ['fabricate', 'fabricate fabricate-app', 'fabricate fabricate-manager']) {
    it(`draws one native button under a frame classed ${under}, typed, marked, pressed off and named`, async () => {
      const { target, handle, button } = mountToggle({}, under);
      await settle();
      assert.equal(target.children.length, 1, 'the only element drawn directly in target');
      const drawn = button();
      assert.ok(drawn === target.firstElementChild, 'and it is the button');
      assert.equal(drawn.getAttribute('type'), 'button');
      assert.deepEqual(authoredClasses(drawn), ['fabricate-toggle', 'is-off']);
      assert.equal(drawn.getAttribute('data-keyboard-focus'), 'true');
      assert.equal(drawn.getAttribute('aria-pressed'), 'false');
      assert.equal(drawn.getAttribute('aria-label'), NAME);
      assert.ok(!drawn.hasAttribute('role') && !drawn.disabled, 'no role, and enabled');
      assert.ok(
        Boolean(
          drawn.querySelector(':scope > .manager-status-toggle-track > .manager-status-toggle-knob')
        ),
        'a track holding a knob'
      );
      assert.equal(drawn.textContent.trim(), '', 'no text of its own');
      for (const undrawn of ['.manager-status-toggle-label', 'input', 'label', '[role="img"]']) {
        assert.ok(!target.querySelector(undrawn), `no ${undrawn}`);
      }
      assert.equal(target.querySelectorAll('button, a, input, [tabindex]').length, 1);
      handle.destroy();
      assert.equal(target.childNodes.length, 0);
      assert.deepEqual(reports, []);
    });
  }

  it('draws is-on and aria-pressed="true" for on: true', async () => {
    const { handle, button } = mountToggle({ on: true });
    await settle();
    assert.deepEqual(authoredClasses(button()), ['fabricate-toggle', 'is-on']);
    assert.equal(button().getAttribute('aria-pressed'), 'true');
    assert.equal(button().getAttribute('aria-label'), NAME, 'named while on');
    handle.destroy();
  });

  it('renames the same focused button when an update changes only ariaLabel', async () => {
    const { handle, button } = mountToggle();
    await settle();
    const node = button();
    node.focus();
    assert.equal(handle.update(base({ ariaLabel: 'Hidden tasks' })), true);
    await settle();
    assert.ok(button() === node, 'the same node');
    assert.ok(document.activeElement === node, 'focus stays on it');
    assert.equal(node.getAttribute('aria-label'), 'Hidden tasks');
    handle.destroy();
  });

  it('lands a rest data attribute on the button itself, data-locked among them, beside its own mark', async () => {
    const rest = { 'data-acme-id': 'group', 'data-acme-open': true, 'data-locked': '' };
    const { handle, button } = mountToggle(rest);
    await settle();
    assert.equal(button().getAttribute('data-acme-id'), 'group');
    assert.ok(button().hasAttribute('data-acme-open'));
    assert.equal(button().getAttribute('data-locked'), '', 'the button carries no tooltip to pin');
    assert.equal(button().getAttribute('data-keyboard-focus'), 'true', 'its own mark stays');
    handle.destroy();
  });
});

describe('a press on the published StatusToggle', () => {
  it('calls onclick once, with no argument, and changes no state itself', async () => {
    const { handle, calls, button } = mountToggle();
    await settle();
    button().click();
    await settle();
    assert.deepEqual(calls, [[]], 'once, with an empty argument list');
    assert.equal(button().getAttribute('aria-pressed'), 'false', 'until an update passes on');
    assert.deepEqual(authoredClasses(button()), ['fabricate-toggle', 'is-off']);
    handle.destroy();
    assert.deepEqual(reports, []);
  });

  it('draws the new state on the same focused button when onclick updates it', async () => {
    let on = false;
    const props = () =>
      base({
        on,
        onclick: () => {
          on = !on;
          held.handle.update(props());
        },
      });
    const held = mountToggle(props());
    await settle();
    const node = held.button();
    node.focus();
    node.click();
    await settle();
    assert.ok(held.button() === node, 'the same node');
    assert.ok(document.activeElement === node, 'focus stays on it');
    assert.equal(node.getAttribute('aria-pressed'), 'true');
    assert.deepEqual(authoredClasses(node), ['fabricate-toggle', 'is-on']);
    node.click();
    await settle();
    assert.equal(node.getAttribute('aria-pressed'), 'false', 'and back');
    held.handle.destroy();
    assert.deepEqual(reports, []);
  });

  it('reports an onclick that throws, and stays drawn and live', async () => {
    const failure = new Error('the companion write failed');
    const { handle, button } = mountToggle({
      onclick: () => {
        throw failure;
      },
    });
    await settle();
    button().click();
    await settle();
    assert.deepEqual(reports, [[CALLBACK_REPORT, 'StatusToggle', 'onclick', failure]]);
    assert.equal(handle.update(base({ on: true })), true);
    await settle();
    assert.equal(button().getAttribute('aria-pressed'), 'true');
    handle.destroy();
  });
});

describe('an aria key on the published StatusToggle', () => {
  it('lands aria-labelledby on the button, where it names a companion element beside target', async () => {
    const { target, handle, button } = mountToggle({ 'aria-labelledby': LABEL_ID });
    const label = target.ownerDocument.createElement('span');
    label.id = LABEL_ID;
    label.textContent = NAME;
    target.before(label);
    await settle();
    assert.equal(button().getAttribute('aria-labelledby'), LABEL_ID);
    assert.equal(button().getAttribute('aria-label'), NAME, 'beside the required name');
    const named = target.ownerDocument.querySelector(
      `#${button().getAttribute('aria-labelledby')}`
    );
    assert.ok(named === label, 'the id resolves across the mount');
    assert.ok(button().getRootNode() === target.getRootNode(), 'one root node holds both');
    label.remove();
    handle.destroy();
  });

  it('removes aria-labelledby from the same button when an update omits it', async () => {
    const { handle, button } = mountToggle({ 'aria-labelledby': LABEL_ID });
    await settle();
    const node = button();
    assert.equal(handle.update(base()), true);
    await settle();
    assert.ok(button() === node && !node.hasAttribute('aria-labelledby'), 'removed, on that node');
    assert.equal(node.getAttribute('aria-label'), NAME, 'the required name stays');
    handle.destroy();
  });

  it('lands aria-describedby on the button beside aria-labelledby and a rest data attribute', async () => {
    const { handle, button } = mountToggle({
      'aria-labelledby': LABEL_ID,
      'aria-describedby': `${HINT_ID} acme-other-hint`,
      'data-acme-id': 'group',
    });
    await settle();
    assert.equal(button().getAttribute('aria-describedby'), `${HINT_ID} acme-other-hint`);
    const names = [
      'aria-labelledby',
      'aria-pressed',
      'data-acme-id',
      'data-keyboard-focus',
      'type',
    ];
    assert.deepEqual(
      names.map((name) => button().getAttribute(name)),
      [LABEL_ID, 'false', 'group', 'true', 'button']
    );
    handle.destroy();
  });

  it('draws neither attribute for a mount that omits its key, or passes undefined', async () => {
    const omitted = mountToggle();
    const absent = mountToggle({ 'aria-labelledby': undefined, 'aria-describedby': undefined });
    await settle();
    for (const { handle, button } of [omitted, absent]) {
      assert.ok(!button().hasAttribute('aria-labelledby'), 'no aria-labelledby');
      assert.ok(!button().hasAttribute('aria-describedby'), 'no aria-describedby');
      handle.destroy();
    }
  });
});

describe('what the published StatusToggle refuses', () => {
  for (const [claim, props, tail] of [
    [
      'an absent ariaLabel (M9)',
      { ariaLabel: undefined },
      'StatusToggle requires a non-empty "ariaLabel"',
    ],
    ['an empty ariaLabel (M9)', { ariaLabel: '' }, 'StatusToggle requires a non-empty "ariaLabel"'],
    ['an absent on (M9)', { on: undefined }, 'StatusToggle requires a non-empty "on"'],
    [
      'an absent onclick (M9)',
      { onclick: undefined },
      'StatusToggle requires a non-empty "onclick"',
    ],
    [
      'a function as its name (M10)',
      { ariaLabel: () => NAME },
      '"ariaLabel" must not hold a function',
    ],
    ['a string for onclick (M17)', { onclick: 'press' }, '"onclick" must be a function'],
    [
      'null for aria-labelledby (M13)',
      { 'aria-labelledby': null },
      '"aria-labelledby" must be a string, number or boolean',
    ],
  ]) {
    it(`refuses ${claim} on mount and on update`, async () => {
      assertRefused(props, tail);
      await assertUpdateRefused(base(props), tail);
    });
  }

  for (const key of [
    'as',
    'label',
    'disabled',
    'trailing',
    'onChange',
    'class',
    'aria-pressed',
    'aria-label',
    'aria-checked',
    'role',
  ]) {
    it(`refuses ${key}, which it does not publish (M13), on mount and on update`, async () => {
      const tail = `"${key}" is not a data attribute`;
      assertRefused({ [key]: 'x' }, tail);
      await assertUpdateRefused(base({ [key]: 'x' }), tail);
    });
  }

  for (const [key, value] of RESERVED_REST_NAMES) {
    it(`refuses ${key} holding ${JSON.stringify(value)} as reserved (M13), on mount and on update`, async () => {
      const tail = `"${key}" is reserved on StatusToggle`;
      assertRefused({ [key]: value }, tail);
      await assertUpdateRefused(base({ [key]: value }), tail);
    });
  }

  it('refuses a companion’s own shell (M16), and renders nothing', () => {
    const target = companionTarget(targets);
    assert.throws(() => ui().mount('StatusToggle', { target, props: base() }), {
      name: 'TypeError',
      message: `${REFUSAL}StatusToggle needs a Fabricate window ancestor`,
    });
    assert.equal(target.childNodes.length, 0);
  });
});
