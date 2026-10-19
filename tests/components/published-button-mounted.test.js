/**
 * The published `Button` on Fabricate's real Svelte runtime (issue 2452), through a fresh seam
 * registered with the adapter's own table, under the Fabricate window root it needs: the one
 * native button it draws at each visual role, a press and its `onclick`, an update that keeps the
 * node and its focus, the native `disabled`, every refusal the entry adds, its required root, and a
 * button in a published `EmptyState`'s content slot; then its two `aria` keys, read off the button.
 * The `type` and the mark for keyboard focus are read here because the component writes both on a
 * `svelte:element`, where the static gates see the mark and not the type.
 * Limit: happy-dom moves no focus when a focused button is disabled and activates no button from
 * a key, so neither is asserted: the View Lab's buttons case holds the Space press, and no suite
 * holds the blur, which the spec states from a measurement in two browsers.
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
const LABEL = 'Clear filters';
const FAMILY = ['fabricate-button', 'fab-manager-button'];
/** Each published visual role and the one class it writes beside the family's two. */
const ROLES = Object.freeze([
  ['neutral', []],
  ['primary', ['is-primary']],
  ['ghost', ['is-ghost']],
  ['dashed', ['is-dashed']],
  ['danger', ['is-danger']],
  ['warning', ['is-warning-action']],
]);

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-button-',
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

/**
 * A button mounted with `props` over a label and a recording `onclick`, under a shell carrying
 * `under`: its target, its handle, the recorded calls, and `button()`, the element drawn now.
 */
function mountButton(props = {}, under = 'fabricate') {
  const press = recorder();
  const target = fabricateTarget(targets, under);
  const given = { children: LABEL, onclick: press.record, ...props };
  const handle = ui().mount('Button', { target, props: given });
  return { target, handle, calls: press.calls, button: () => target.querySelector('button') };
}

const authoredClasses = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

/** The refusal `mount` throws for `props` over a label and a callback, with nothing rendered. */
function assertRefused(props, tail) {
  const target = fabricateTarget(targets);
  const given = { children: LABEL, onclick() {}, ...props };
  assert.throws(() => ui().mount('Button', { target, props: given }), {
    name: 'TypeError',
    message: REFUSAL + tail,
  });
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

describe('the published Button', () => {
  for (const [role, classes] of ROLES) {
    it(`draws one native button at ${role}, typed, marked for keyboard focus and named by its label`, async () => {
      const { target, handle, button } = mountButton({ role });
      await settle();
      assert.equal(target.children.length, 1, 'the only element drawn directly in target');
      const drawn = button();
      assert.ok(drawn === target.firstElementChild, 'and it is the button');
      assert.equal(drawn.localName, 'button');
      assert.equal(drawn.getAttribute('type'), 'button');
      assert.equal(drawn.getAttribute('data-keyboard-focus'), 'true');
      assert.equal(drawn.disabled, false);
      assert.deepEqual(authoredClasses(drawn), [...FAMILY, ...classes]);
      assert.equal(drawn.textContent, LABEL);
      assert.equal(drawn.children.length, 1, 'one element holds the label');
      assert.equal(drawn.children[0].localName, 'span');
      assert.equal(target.querySelectorAll('button, a, input, [tabindex]').length, 1);
      assert.ok(!drawn.hasAttribute('role') && !drawn.hasAttribute('aria-label'), 'no ARIA');
      handle.destroy();
      assert.equal(target.childNodes.length, 0);
      assert.deepEqual(reports, []);
    });
  }

  it('writes no role class for a role outside its set, and is-full-width for fullWidth alone', async () => {
    const unknown = mountButton({ role: 'accent' });
    const wide = mountButton({ role: 'primary', fullWidth: true });
    await settle();
    assert.deepEqual(authoredClasses(unknown.button()), FAMILY);
    assert.deepEqual(authoredClasses(wide.button()), [...FAMILY, 'is-primary', 'is-full-width']);
    assert.equal(wide.handle.update({ children: LABEL, onclick() {} }), true);
    await settle();
    assert.deepEqual(authoredClasses(wide.button()), FAMILY, 'replace, not merge');
    unknown.handle.destroy();
    wide.handle.destroy();
  });

  it('draws a label of markup as text, and a label of white space as a button with no name', async () => {
    const marked = mountButton({ children: '<b>x</b>' });
    const blank = mountButton({ children: ' ' });
    await settle();
    assert.equal(marked.button().textContent, '<b>x</b>');
    assert.ok(!marked.target.querySelector('b'), 'never parsed as markup');
    assert.equal(blank.button().textContent, ' ', 'accepted, and drawn as passed');
    marked.handle.destroy();
    blank.handle.destroy();
  });

  it('lands a rest data attribute on the button itself', async () => {
    const { handle, button } = mountButton({ 'data-acme-id': 'clear', 'data-acme-open': true });
    await settle();
    assert.equal(button().getAttribute('data-acme-id'), 'clear');
    assert.ok(button().hasAttribute('data-acme-open'));
    assert.equal(button().getAttribute('data-keyboard-focus'), 'true', 'its own mark stays');
    handle.destroy();
  });
});

describe('a press on the published Button', () => {
  it('calls onclick once, with no argument', async () => {
    const { handle, calls, button } = mountButton();
    await settle();
    button().click();
    assert.deepEqual(calls, [[]], 'once, inside the click, with an empty argument list');
    button().click();
    assert.equal(calls.length, 2, 'and again on the next press');
    handle.destroy();
    assert.deepEqual(reports, []);
  });

  it('keeps the same focused button across an update, and calls only the newest function', async () => {
    const { handle, calls, button } = mountButton();
    await settle();
    const node = button();
    node.focus();
    assert.ok(document.activeElement === node, 'the button takes focus');
    const next = recorder();
    assert.equal(handle.update({ children: 'Filters cleared', onclick: next.record }), true);
    await settle();
    assert.ok(button() === node, 'the same button node');
    assert.equal(node.textContent, 'Filters cleared');
    assert.ok(document.activeElement === node, 'focus stays on it');
    node.click();
    assert.deepEqual([calls, next.calls], [[], [[]]], 'the earlier function is not called again');
    handle.destroy();
  });

  it('refuses an update that omits onclick (M9), and the earlier function still answers', async () => {
    const { handle, calls, button } = mountButton();
    await settle();
    assert.throws(() => handle.update({ children: 'Next' }), {
      name: 'TypeError',
      message: `${REFUSAL}Button requires a non-empty "onclick"`,
    });
    await settle();
    assert.equal(button().textContent, LABEL, 'the earlier props stay rendered');
    button().click();
    assert.deepEqual(calls, [[]]);
    handle.destroy();
  });

  it('keeps the same button when onclick updates its own label', async () => {
    const held = mountButton({
      onclick: () => held.handle.update({ children: 'Projects: 1', onclick() {} }),
    });
    await settle();
    const node = held.button();
    node.click();
    await settle();
    assert.ok(held.button() === node, 'the same node');
    assert.equal(node.textContent, 'Projects: 1');
    held.handle.destroy();
    assert.deepEqual(reports, []);
  });

  it('is gone when a press whose onclick destroys it returns', async () => {
    const held = mountButton({ onclick: () => held.handle.destroy() });
    await settle();
    held.button().click();
    assert.equal(held.target.childNodes.length, 0, 'the target is empty');
    assert.equal(held.handle.update({ children: LABEL, onclick() {} }), false);
    await settle();
    assert.deepEqual(reports, []);
  });

  const failure = new Error('the companion write failed');
  for (const [what, onclick] of [
    [
      'throws',
      () => {
        throw failure;
      },
    ],
    ['rejects', () => Promise.reject(failure)],
  ]) {
    it(`reports an onclick that ${what} once, and stays drawn and live`, async () => {
      const { handle, button } = mountButton({ onclick });
      await settle();
      button().click();
      await settle();
      assert.deepEqual(reports, [[CALLBACK_REPORT, 'Button', 'onclick', failure]]);
      assert.equal(button().textContent, LABEL, 'the button is still drawn');
      assert.equal(handle.update({ children: LABEL, onclick() {} }), true);
      handle.destroy();
    });
  }
});

describe('the published Button, disabled', () => {
  for (const [role, classes] of ROLES) {
    it(`writes the native attribute at ${role}, beside the same classes`, async () => {
      const { handle, button } = mountButton({ role, disabled: true });
      await settle();
      assert.equal(button().disabled, true);
      assert.deepEqual(authoredClasses(button()), [...FAMILY, ...classes]);
      assert.ok(button().hasAttribute('disabled'), 'the native attribute');
      assert.ok(!button().hasAttribute('aria-disabled'), 'and no ARIA form of it');
      handle.destroy();
    });
  }

  it('calls nothing for a press, and enables again on an update', async () => {
    const { handle, calls, button } = mountButton({ disabled: true });
    await settle();
    // happy-dom's own suppression: it dispatches no click from a disabled button.
    button().click();
    assert.deepEqual(calls, [], 'a press on the disabled button');
    // Svelte's guard, not a user path: Foundry makes a button's children pointer-transparent.
    const { MouseEvent } = button().ownerDocument.defaultView;
    button().firstElementChild.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert.deepEqual(calls, [], 'a click that bubbles from the label');
    const next = recorder();
    assert.equal(handle.update({ children: LABEL, onclick: next.record }), true);
    await settle();
    assert.equal(button().disabled, false);
    button().firstElementChild.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert.deepEqual(next.calls, [[]], 'the same click reaches an enabled button');
    handle.destroy();
  });

  it('stops the press of a button an update disabled', async () => {
    const { handle, calls, button } = mountButton();
    await settle();
    const node = button();
    const { MouseEvent } = node.ownerDocument.defaultView;
    const clickLabel = () =>
      node.firstElementChild.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    clickLabel();
    assert.deepEqual(calls, [[]], 'a click that bubbles from the label reaches the enabled button');
    const next = recorder();
    assert.equal(handle.update({ children: LABEL, onclick: next.record, disabled: true }), true);
    await settle();
    assert.ok(button() === node, 'the same button node');
    assert.equal(node.disabled, true);
    // happy-dom's own suppression, then Svelte's guard for the click that bubbles from the label.
    node.click();
    clickLabel();
    assert.deepEqual([calls, next.calls], [[[]], []]);
    handle.destroy();
  });
});

describe('what the published Button refuses', () => {
  for (const key of [
    'tag',
    'href',
    'target',
    'rel',
    'type',
    'size',
    'icon',
    'busy',
    'class',
    'element',
    'title',
    'aria-label',
  ]) {
    it(`refuses ${key}, which it does not publish (M13)`, () => {
      assertRefused({ [key]: 'x' }, `"${key}" is not a data attribute`);
    });
  }

  for (const [key, value] of RESERVED_REST_NAMES) {
    it(`refuses ${key} holding ${JSON.stringify(value)} as reserved (M13), on mount and on update`, async () => {
      assertRefused({ [key]: value }, `"${key}" is reserved on Button`);
      const { handle, calls, button } = mountButton();
      await settle();
      assert.throws(() => handle.update({ children: 'Next', onclick() {}, [key]: value }), {
        name: 'TypeError',
        message: `${REFUSAL}"${key}" is reserved on Button`,
      });
      await settle();
      assert.equal(button().textContent, LABEL, 'the earlier props stay rendered');
      assert.equal(button().getAttribute('data-keyboard-focus'), 'true');
      button().click();
      assert.deepEqual(calls, [[]], 'and the earlier function still answers');
      handle.destroy();
    });
  }

  for (const [name, props] of [
    ['Rail', { label: 'Standing' }],
    ['Notice', { title: 'Over the limit' }],
  ]) {
    it(`leaves ${name}, whose rest lands on a root that is no control, accepting every name Button reserves`, async () => {
      const target = companionTarget(targets);
      // One value per name, the last the list gives it, which is a string for each.
      const rest = Object.fromEntries(RESERVED_REST_NAMES);
      const handle = ui().mount(name, { target, props: { ...props, ...rest } });
      await settle();
      const root = target.firstElementChild;
      assert.deepEqual(
        Object.keys(rest).map((key) => [key, root.getAttribute(key)]),
        Object.entries(rest),
        'each is written on the root'
      );
      handle.destroy();
    });
  }

  for (const [claim, props, tail] of [
    [
      'a function as its label (M10)',
      { children: () => 'x' },
      '"children" must not hold a function',
    ],
    ['a number as its label (M14)', { children: 7 }, '"children" must be a string'],
    ['an empty label (M9)', { children: '' }, 'Button requires a non-empty "children"'],
    ['a string for onclick (M17)', { onclick: 'press' }, '"onclick" must be a function'],
    ['an empty string for onclick (M17)', { onclick: '' }, '"onclick" must be a function'],
    ['an absent onclick (M9)', { onclick: undefined }, 'Button requires a non-empty "onclick"'],
  ]) {
    it(`refuses ${claim}, and renders nothing`, () => {
      assertRefused(props, tail);
    });
  }
});

const HINT_ID = 'acme-clear-hint';
const NO_SCALAR = '"aria-expanded" must be a string, number or boolean';

describe('an aria key on the published Button', () => {
  const base = (overrides = {}) => ({ children: LABEL, onclick() {}, ...overrides });

  for (const [claim, value, written] of [
    ['false', false, 'false'],
    ['true', true, 'true'],
    ["the string 'true'", 'true', 'true'],
    ['0', 0, '0'],
    ['an empty string', '', ''],
    ['NaN, which Fabricate does not check', NaN, 'NaN'],
  ]) {
    it(`writes aria-expanded on the button as passed, for ${claim}`, async () => {
      const { handle, button } = mountButton({ 'aria-expanded': value });
      await settle();
      assert.ok(button().hasAttribute('aria-expanded'), 'the attribute is on the button');
      assert.equal(button().getAttribute('aria-expanded'), written);
      handle.destroy();
      assert.deepEqual(reports, []);
    });
  }

  it('draws neither attribute for a mount that omits its key, or passes undefined', async () => {
    const omitted = mountButton();
    const absent = mountButton({ 'aria-expanded': undefined, 'aria-describedby': undefined });
    await settle();
    for (const { handle, button } of [omitted, absent]) {
      assert.ok(!button().hasAttribute('aria-expanded'), 'no aria-expanded');
      assert.ok(!button().hasAttribute('aria-describedby'), 'no aria-describedby');
      handle.destroy();
    }
  });

  it('rewrites aria-expanded on the same focused button, and removes it when an update omits the key', async () => {
    const { handle, button } = mountButton({ 'aria-expanded': false });
    await settle();
    const node = button();
    node.focus();
    assert.equal(handle.update(base({ 'aria-expanded': true })), true);
    await settle();
    assert.ok(button() === node, 'the same button node');
    assert.ok(document.activeElement === node, 'focus stays on it');
    assert.equal(node.getAttribute('aria-expanded'), 'true');
    assert.equal(handle.update(base()), true);
    await settle();
    assert.ok(button() === node && !node.hasAttribute('aria-expanded'), 'removed, on that node');
    assert.equal(handle.update(base({ 'aria-expanded': false })), true);
    await settle();
    assert.equal(node.getAttribute('aria-expanded'), 'false');
    assert.equal(handle.update(base({ 'aria-expanded': undefined })), true);
    await settle();
    assert.ok(!node.hasAttribute('aria-expanded'), 'undefined removes it too');
    handle.destroy();
  });

  it('draws an update made inside onclick on the next flush, on the same button', async () => {
    let open = false;
    const props = () => ({
      'aria-expanded': open,
      onclick: () => {
        open = !open;
        held.handle.update({ children: LABEL, ...props() });
      },
    });
    const held = mountButton(props());
    await settle();
    const node = held.button();
    assert.equal(node.getAttribute('aria-expanded'), 'false');
    node.click();
    await settle();
    assert.ok(held.button() === node, 'the same node');
    assert.equal(node.getAttribute('aria-expanded'), 'true');
    held.handle.destroy();
    assert.deepEqual(reports, []);
  });

  it('lands aria-describedby on the button, where it names a companion element beside target', async () => {
    const { target, handle, button } = mountButton({ 'aria-describedby': HINT_ID });
    const hint = target.ownerDocument.createElement('p');
    hint.id = HINT_ID;
    target.after(hint);
    await settle();
    assert.equal(button().getAttribute('aria-describedby'), HINT_ID);
    const named = target.ownerDocument.querySelector(
      `#${button().getAttribute('aria-describedby')}`
    );
    assert.ok(named === hint, 'the id resolves across the mount');
    assert.ok(button().getRootNode() === target.getRootNode(), 'one root node holds both');
    handle.destroy();
  });

  it('lands both aria keys beside a rest data attribute, and keeps the button’s own mark and type', async () => {
    const described = `${HINT_ID} acme-other-hint`;
    const { handle, button } = mountButton({
      'aria-expanded': true,
      'aria-describedby': described,
      'data-acme-id': 'notes',
    });
    await settle();
    const names = [
      'aria-expanded',
      'aria-describedby',
      'data-acme-id',
      'data-keyboard-focus',
      'type',
    ];
    assert.deepEqual(
      names.map((name) => button().getAttribute(name)),
      ['true', described, 'notes', 'true', 'button']
    );
    handle.destroy();
  });

  it('puts back nothing other code replaced or removed, until an update omits the key, is flushed, and another passes it', async () => {
    const props = base({ 'aria-describedby': HINT_ID });
    const { handle, button } = mountButton(props);
    await settle();
    const node = button();
    node.setAttribute('aria-describedby', 'tooltip');
    assert.equal(handle.update({ ...props }), true);
    await settle();
    assert.equal(node.getAttribute('aria-describedby'), 'tooltip', 'the value did not change');
    node.removeAttribute('aria-describedby');
    assert.equal(handle.update({ ...props }), true);
    await settle();
    assert.ok(!node.hasAttribute('aria-describedby'), 'nor is a removed one put back');
    assert.equal(handle.update(base()), true);
    assert.equal(handle.update({ ...props }), true);
    await settle();
    assert.ok(
      !node.hasAttribute('aria-describedby'),
      'two updates in one run draw the second alone'
    );
    assert.equal(handle.update(base()), true);
    await Promise.resolve();
    assert.equal(handle.update({ ...props }), true);
    await settle();
    assert.equal(node.getAttribute('aria-describedby'), HINT_ID, 'omitted, flushed, passed again');
    handle.destroy();
  });

  it('restores a removed aria-describedby on the same focused button when a timeout separates the update that omits it from the one that passes it', async () => {
    const props = base({ 'aria-describedby': HINT_ID });
    const { handle, button } = mountButton(props);
    await settle();
    const node = button();
    node.focus();
    node.removeAttribute('aria-describedby');
    assert.equal(handle.update(base()), true);
    await new Promise((done) => setTimeout(done, 0));
    assert.ok(!node.hasAttribute('aria-describedby'), 'still absent before the second update');
    assert.equal(handle.update({ ...props }), true);
    await settle();
    assert.equal(node.getAttribute('aria-describedby'), HINT_ID);
    assert.ok(button() === node && document.activeElement === node, 'that node, still focused');
    handle.destroy();
    assert.deepEqual(reports, []);
  });

  it('restores it when onclick omits the key and passes it again after an awaited promise', async () => {
    const described = { 'aria-describedby': HINT_ID };
    const props = (aria = {}) => ({
      children: LABEL,
      ...aria,
      onclick: async () => {
        held.handle.update(props());
        await Promise.resolve();
        held.handle.update(props(described));
      },
    });
    const held = mountButton(props(described));
    await settle();
    const node = held.button();
    node.removeAttribute('aria-describedby');
    node.click();
    await settle();
    assert.ok(held.button() === node, 'the same node');
    assert.equal(node.getAttribute('aria-describedby'), HINT_ID);
    held.handle.destroy();
    assert.deepEqual(reports, []);
  });

  for (const key of [
    'aria-label',
    'aria-labelledby',
    'aria-pressed',
    'aria-checked',
    'aria-disabled',
    'aria-hidden',
    'aria-controls',
    'aria-haspopup',
    'aria-busy',
    'ARIA-EXPANDED',
  ]) {
    it(`refuses ${key}, which is no aria key of the button (M13), on mount and on update`, async () => {
      const tail = `"${key}" is not a data attribute`;
      assertRefused({ [key]: 'true' }, tail);
      const { handle, button } = mountButton({ 'aria-expanded': false });
      await settle();
      assert.throws(() => handle.update(base({ children: 'Next', [key]: 'true' })), {
        name: 'TypeError',
        message: REFUSAL + tail,
      });
      await settle();
      assert.equal(button().textContent, LABEL, 'the earlier props stay rendered');
      assert.equal(button().getAttribute('aria-expanded'), 'false');
      handle.destroy();
    });
  }

  for (const [claim, value, tail] of [
    ['null (M13)', null, NO_SCALAR],
    ['an object (M13)', {}, NO_SCALAR],
    ['a function (M10)', () => true, '"aria-expanded" must not hold a function'],
  ]) {
    it(`refuses ${claim} for aria-expanded, on mount and on update`, async () => {
      assertRefused({ 'aria-expanded': value }, tail);
      const { handle, button } = mountButton({ 'aria-expanded': false });
      await settle();
      assert.throws(() => handle.update(base({ 'aria-expanded': value })), {
        name: 'TypeError',
        message: REFUSAL + tail,
      });
      await settle();
      assert.equal(button().getAttribute('aria-expanded'), 'false', 'the earlier value stays');
      handle.destroy();
    });
  }

  for (const [name, props, tail] of [
    ['Notice', { title: 'Over the limit' }, '"aria-expanded" is not a data attribute'],
    ['Rail', { label: 'Standing' }, '"aria-expanded" is not a data attribute'],
    ['Avatar', { name: 'Ada' }, '"aria-expanded" is not a prop of Avatar'],
  ]) {
    it(`leaves ${name} refusing aria-expanded as it did`, () => {
      const target = companionTarget(targets);
      assert.throws(
        () => ui().mount(name, { target, props: { ...props, 'aria-expanded': false } }),
        { name: 'TypeError', message: REFUSAL + tail }
      );
      assert.equal(target.childNodes.length, 0, 'nothing is rendered');
    });
  }
});

describe('the published Button and its required root', () => {
  it('refuses a companion’s own shell (M16), and renders nothing', () => {
    const target = companionTarget(targets);
    assert.throws(
      () => ui().mount('Button', { target, props: { children: LABEL, onclick() {} } }),
      {
        name: 'TypeError',
        message: `${REFUSAL}Button needs a Fabricate window ancestor`,
      }
    );
    assert.equal(target.childNodes.length, 0);
  });

  for (const under of ['fabricate fabricate-app', 'fabricate fabricate-manager']) {
    it(`draws the same button under a frame classed ${under}`, async () => {
      const { handle, calls, button } = mountButton({ role: 'primary' }, under);
      await settle();
      assert.deepEqual(authoredClasses(button()), [...FAMILY, 'is-primary']);
      button().click();
      assert.deepEqual(calls, [[]]);
      handle.destroy();
    });
  }

  /** An `EmptyState` mounted with its content slot in `panelTarget`, and a target of the companion's inside that slot. */
  function panelWithSlot(seam, panelTarget) {
    const panel = seam.mount('EmptyState', {
      target: panelTarget,
      props: { title: 'No projects yet', children: true },
    });
    const inner = panelTarget.ownerDocument.createElement('div');
    panel.slot('children').append(inner);
    return { panel, inner };
  }

  it('draws in the content slot of a published EmptyState inside a Fabricate window, and the outer destroy ends it', async () => {
    const seam = ui();
    const target = fabricateTarget(targets);
    const { panel, inner } = panelWithSlot(seam, target);
    const press = recorder();
    const props = { role: 'primary', children: 'New project', onclick: press.record };
    const button = seam.mount('Button', { target: inner, props });
    await settle();
    const drawn = inner.querySelector('button');
    assert.ok(target.querySelector('.manager-empty').contains(drawn), 'inside the panel');
    assert.equal(drawn.textContent, 'New project');
    drawn.click();
    assert.deepEqual(press.calls, [[]]);
    panel.destroy();
    assert.equal(button.update(props), false, 'the nested button ended with the panel');
    assert.equal(target.childNodes.length, 0);
    await settle();
    assert.deepEqual(reports, []);
  });

  it('is refused in the content slot of an EmptyState that sits in no Fabricate window (M16)', async () => {
    const seam = ui();
    const { panel, inner } = panelWithSlot(seam, companionTarget(targets));
    await settle();
    assert.throws(
      () => seam.mount('Button', { target: inner, props: { children: LABEL, onclick() {} } }),
      { name: 'TypeError', message: `${REFUSAL}Button needs a Fabricate window ancestor` }
    );
    assert.equal(inner.childNodes.length, 0);
    panel.destroy();
  });
});
