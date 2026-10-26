/**
 * The published `IconButton` on Fabricate's real Svelte runtime (issue 2601), through a fresh seam
 * registered with the adapter's own table, under a Fabricate window root and, in a companion's own
 * shell, the standalone style root (issue 2456): the one native button it draws at each role and
 * size, named by `ariaLabel` and holding its glyph alone,
 * a press and its `onclick`, an update that keeps the node and its focus, the native `disabled`,
 * every refusal the entry adds, its `aria-expanded` key, read off the button, and the tooltip:
 * its hover text, always written, and the focus tooltip the runtime's facade opens and closes.
 * Limit: happy-dom does not tell a keyboard focus from a pointer one, so each focus clause answers
 * `:focus-visible` on the button, and Foundry's hover listener is core's, so only the attribute it
 * reads is asserted.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { mount as svelteMount } from '../../node_modules/svelte/src/index-client.js';
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
  harnessLoaders,
  recordEscapes,
  settle,
  shippedSeam,
  standaloneRootIn,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { createLabTooltipManager } from '../view-lab/foundry/installFoundryShim.js';

const REFUSAL = 'Fabricate | published components: ';
const LABEL = 'Remove Iron ingot';
const GLYPH = 'fas fa-trash';
const FAMILY = ['fabricate-icon-button'];
/** Each published role and the classes it writes beside the family root. */
const ROLES = Object.freeze([
  ['neutral', []],
  ['primary', ['is-primary']],
  ['ghost', ['is-ghost']],
  ['danger', ['is-danger']],
  ['ghost-danger', ['is-ghost', 'is-danger']],
]);
/** Each published size and the class it writes beside the family root. */
const SIZES = Object.freeze([
  ['', []],
  ['24', ['is-size-24']],
  ['26', ['is-size-26']],
]);

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-icon-button-',
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

const ui = (runtime = seamParts.runtime) =>
  shippedSeam({
    ...seamParts,
    runtime,
    report: (...args) => {
      reports.push(args);
    },
  });

before(async () => {
  await harness.setup();
  const { publishedComponentRuntime: runtime, COMPONENTS: components } =
    await harness.loadRuneModule(PUBLISHED_ADAPTER);
  const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
  seamParts = { createPublishedComponents, runtime, components, loaders: harnessLoaders(harness) };
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
  delete globalThis.game.tooltip;
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
});

/**
 * An icon button mounted with `props` over a glyph, a name and a recording `onclick`, under a
 * shell carrying `under`: its target, its handle, the recorded calls, and `button()`.
 */
function mountIconButton(props = {}, { under = 'fabricate', seam = ui() } = {}) {
  const press = recorder();
  const target = fabricateTarget(targets, under);
  const given = { icon: GLYPH, ariaLabel: LABEL, onclick: press.record, ...props };
  const handle = seam.mount('IconButton', { target, props: given });
  return { target, handle, calls: press.calls, button: () => target.querySelector('button') };
}

const authoredClasses = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

/** The refusal `mount` throws for `props` over a glyph, a name and a callback, with nothing rendered. */
function assertRefused(props, tail) {
  const target = fabricateTarget(targets);
  const given = { icon: GLYPH, ariaLabel: LABEL, onclick() {}, ...props };
  assert.throws(() => ui().mount('IconButton', { target, props: given }), {
    name: 'TypeError',
    message: REFUSAL + tail,
  });
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

describe('the published IconButton', () => {
  for (const [role, classes] of ROLES) {
    it(`draws one native button at ${role}, typed, marked for keyboard focus, named by ariaLabel and holding its glyph`, async () => {
      const { target, handle, button } = mountIconButton({ role });
      await settle();
      assert.equal(target.children.length, 1, 'the only element drawn directly in target');
      const drawn = button();
      assert.ok(drawn === target.firstElementChild, 'and it is the button');
      assert.equal(drawn.localName, 'button');
      assert.equal(drawn.getAttribute('type'), 'button');
      assert.equal(drawn.getAttribute('data-keyboard-focus'), 'true');
      assert.equal(drawn.getAttribute('aria-label'), LABEL);
      assert.equal(drawn.disabled, false);
      assert.deepEqual(authoredClasses(drawn), [...FAMILY, ...classes]);
      assert.equal(drawn.children.length, 1, 'the glyph alone');
      const glyph = drawn.firstElementChild;
      assert.deepEqual([glyph.localName, glyph.className], ['i', GLYPH]);
      assert.equal(glyph.getAttribute('aria-hidden'), 'true');
      assert.equal(drawn.textContent, '', 'no text of its own');
      assert.equal(target.querySelectorAll('button, a, input, [tabindex]').length, 1);
      assert.ok(!drawn.hasAttribute('role'), 'the role is drawn, never an ARIA role');
      handle.destroy();
      assert.equal(target.childNodes.length, 0);
      assert.deepEqual(reports, []);
    });
  }

  for (const [size, classes] of SIZES) {
    it(`writes the ${size || 'default'} rung's class for size ${JSON.stringify(size)}`, async () => {
      const { handle, button } = mountIconButton({ size, role: 'ghost' });
      await settle();
      assert.deepEqual(authoredClasses(button()), [...FAMILY, ...classes, 'is-ghost']);
      handle.destroy();
    });
  }

  it('writes no class for a role or size outside its set, and replaces rather than merges', async () => {
    const unknown = mountIconButton({ role: 'accent', size: '30' });
    const sized = mountIconButton({ role: 'danger', size: '24' });
    await settle();
    assert.deepEqual(authoredClasses(unknown.button()), FAMILY);
    assert.equal(sized.handle.update({ icon: GLYPH, ariaLabel: LABEL, onclick() {} }), true);
    await settle();
    assert.deepEqual(authoredClasses(sized.button()), FAMILY, 'replace, not merge');
    unknown.handle.destroy();
    sized.handle.destroy();
  });

  it('draws a name of markup as text in its label and its hover text', async () => {
    const { target, handle, button } = mountIconButton({ ariaLabel: 'Rename <b>Iron</b>' });
    await settle();
    assert.equal(button().getAttribute('aria-label'), 'Rename <b>Iron</b>');
    assert.equal(button().getAttribute('data-tooltip-text'), 'Rename <b>Iron</b>');
    assert.ok(!target.querySelector('b'), 'never parsed as markup');
    handle.destroy();
  });

  it('mounts the docs section’s worked row control as written', async () => {
    const reagent = { id: 'iron-ingot', name: 'Iron ingot' };
    const press = recorder();
    const { handle, button } = mountIconButton({
      icon: 'fas fa-trash',
      ariaLabel: `Delete ${reagent.name}`,
      role: 'ghost-danger',
      size: '26',
      onclick: press.record,
      'data-acme-reagent': reagent.id,
    });
    await settle();
    assert.deepEqual(authoredClasses(button()), [...FAMILY, 'is-size-26', 'is-ghost', 'is-danger']);
    assert.equal(button().getAttribute('aria-label'), 'Delete Iron ingot');
    assert.equal(button().getAttribute('data-acme-reagent'), 'iron-ingot');
    button().click();
    assert.deepEqual(press.calls, [[]]);
    handle.destroy();
    assert.deepEqual(reports, []);
  });

  it('lands a rest data attribute on the button itself', async () => {
    const { handle, button } = mountIconButton({ 'data-acme-id': 'remove', 'data-acme-row': 3 });
    await settle();
    assert.equal(button().getAttribute('data-acme-id'), 'remove');
    assert.equal(button().getAttribute('data-acme-row'), '3');
    assert.equal(button().getAttribute('data-keyboard-focus'), 'true', 'its own mark stays');
    handle.destroy();
  });
});

describe('a press on the published IconButton', () => {
  it('calls onclick once, with no argument', async () => {
    const { handle, calls, button } = mountIconButton();
    await settle();
    button().click();
    assert.deepEqual(calls, [[]], 'once, inside the click, with an empty argument list');
    button().click();
    assert.equal(calls.length, 2, 'and again on the next press');
    handle.destroy();
    assert.deepEqual(reports, []);
  });

  it('keeps the same focused button across an update, and calls only the newest function', async () => {
    const { handle, calls, button } = mountIconButton();
    await settle();
    const node = button();
    node.focus();
    assert.ok(document.activeElement === node, 'the button takes focus');
    const next = recorder();
    const props = { icon: 'fas fa-xmark', ariaLabel: 'Remove Ember salt', onclick: next.record };
    assert.equal(handle.update(props), true);
    await settle();
    assert.ok(button() === node, 'the same button node');
    assert.equal(node.getAttribute('aria-label'), 'Remove Ember salt');
    assert.equal(node.firstElementChild.className, 'fas fa-xmark');
    assert.ok(document.activeElement === node, 'focus stays on it');
    node.click();
    assert.deepEqual([calls, next.calls], [[], [[]]], 'the earlier function is not called again');
    handle.destroy();
  });

  it('refuses an update that omits onclick (M9), and the earlier function still answers', async () => {
    const { handle, calls, button } = mountIconButton();
    await settle();
    assert.throws(() => handle.update({ icon: GLYPH, ariaLabel: 'Next' }), {
      name: 'TypeError',
      message: `${REFUSAL}IconButton requires a non-empty "onclick"`,
    });
    await settle();
    assert.equal(button().getAttribute('aria-label'), LABEL, 'the earlier props stay rendered');
    button().click();
    assert.deepEqual(calls, [[]]);
    handle.destroy();
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
      const { handle, button } = mountIconButton({ onclick });
      await settle();
      button().click();
      await settle();
      assert.deepEqual(reports, [[CALLBACK_REPORT, 'IconButton', 'onclick', failure]]);
      assert.equal(button().getAttribute('aria-label'), LABEL, 'the button is still drawn');
      assert.equal(handle.update({ icon: GLYPH, ariaLabel: LABEL, onclick() {} }), true);
      handle.destroy();
    });
  }
});

describe('the published IconButton, disabled', () => {
  it('writes the native attribute beside the same classes, calls nothing, and enables on an update', async () => {
    const { handle, calls, button } = mountIconButton({ role: 'danger', disabled: true });
    await settle();
    assert.equal(button().disabled, true);
    assert.deepEqual(authoredClasses(button()), [...FAMILY, 'is-danger']);
    assert.ok(!button().hasAttribute('aria-disabled'), 'no ARIA form of it');
    button().click();
    const { MouseEvent } = button().ownerDocument.defaultView;
    button().firstElementChild.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert.deepEqual(calls, [], 'neither the button nor a click from its glyph presses it');
    const next = recorder();
    assert.equal(handle.update({ icon: GLYPH, ariaLabel: LABEL, onclick: next.record }), true);
    await settle();
    assert.equal(button().disabled, false);
    button().click();
    assert.deepEqual(next.calls, [[]]);
    handle.destroy();
  });
});

describe('what the published IconButton refuses', () => {
  for (const key of [
    'tooltip',
    'children',
    'class',
    'element',
    'onfocus',
    'onblur',
    'onkeydown',
    'title',
    'aria-label',
  ]) {
    it(`refuses ${key}, which it does not publish (M13)`, () => {
      assertRefused({ [key]: 'x' }, `"${key}" is not a data attribute`);
    });
  }

  for (const [key, value] of RESERVED_REST_NAMES) {
    it(`refuses ${key} holding ${JSON.stringify(value)} as reserved (M13), on mount and on update`, async () => {
      assertRefused({ [key]: value }, `"${key}" is reserved on IconButton`);
      const { handle, calls, button } = mountIconButton();
      await settle();
      assert.throws(
        () => handle.update({ icon: GLYPH, ariaLabel: 'Next', onclick() {}, [key]: value }),
        { name: 'TypeError', message: `${REFUSAL}"${key}" is reserved on IconButton` }
      );
      await settle();
      assert.equal(button().getAttribute('aria-label'), LABEL, 'the earlier props stay rendered');
      assert.equal(button().getAttribute('data-tooltip-text'), LABEL, 'and its own hover text');
      button().click();
      assert.deepEqual(calls, [[]], 'and the earlier function still answers');
      handle.destroy();
    });
  }

  for (const value of ['', 'true', true]) {
    it(`refuses data-locked holding ${JSON.stringify(value)} as reserved (M13), on mount and on update`, async () => {
      assertRefused({ 'data-locked': value }, '"data-locked" is reserved on IconButton');
      const { handle, button } = mountIconButton();
      await settle();
      assert.throws(
        () => handle.update({ icon: GLYPH, ariaLabel: LABEL, onclick() {}, 'data-locked': value }),
        { name: 'TypeError', message: `${REFUSAL}"data-locked" is reserved on IconButton` }
      );
      await settle();
      assert.ok(!button().hasAttribute('data-locked'), 'so no tooltip it carries is pinned');
      handle.destroy();
    });
  }

  for (const [claim, props, tail] of [
    ['an absent icon (M9)', { icon: undefined }, 'IconButton requires a non-empty "icon"'],
    ['an empty icon (M9)', { icon: '' }, 'IconButton requires a non-empty "icon"'],
    [
      'an absent ariaLabel (M9)',
      { ariaLabel: undefined },
      'IconButton requires a non-empty "ariaLabel"',
    ],
    ['an empty ariaLabel (M9)', { ariaLabel: '' }, 'IconButton requires a non-empty "ariaLabel"'],
    [
      'a function as its name (M10)',
      { ariaLabel: () => 'x' },
      '"ariaLabel" must not hold a function',
    ],
    ['a string for onclick (M17)', { onclick: 'press' }, '"onclick" must be a function'],
    ['an absent onclick (M9)', { onclick: undefined }, 'IconButton requires a non-empty "onclick"'],
  ]) {
    it(`refuses ${claim}, and renders nothing`, () => {
      assertRefused(props, tail);
    });
  }
});

describe('the published IconButton in a companion’s own shell', () => {
  it('draws its button inside one standalone style root, and destroy leaves the shell empty', async () => {
    const target = companionTarget(targets);
    const press = recorder();
    const props = { icon: GLYPH, ariaLabel: LABEL, onclick: press.record };
    const handle = ui().mount('IconButton', { target, props });
    await settle();
    const button = standaloneRootIn(target).firstElementChild;
    assert.equal(button.localName, 'button');
    assert.equal(button.getAttribute('type'), 'button');
    assert.equal(button.getAttribute('aria-label'), LABEL);
    button.click();
    assert.deepEqual(press.calls, [[]]);
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
  });
});

describe('the aria key on the published IconButton', () => {
  const base = (overrides = {}) => ({ icon: GLYPH, ariaLabel: LABEL, onclick() {}, ...overrides });

  it('writes aria-expanded on the same focused button, its glyph swapped in the same update, and removes it when an update omits the key', async () => {
    const { handle, button } = mountIconButton({ 'aria-expanded': false });
    await settle();
    const node = button();
    assert.equal(node.getAttribute('aria-expanded'), 'false');
    node.focus();
    const shown = base({ 'aria-expanded': true, icon: 'fas fa-chevron-up' });
    assert.equal(handle.update(shown), true);
    await settle();
    assert.ok(button() === node && document.activeElement === node, 'that node, still focused');
    assert.equal(node.getAttribute('aria-expanded'), 'true');
    assert.equal(node.firstElementChild.className, 'fas fa-chevron-up', 'the other glyph');
    assert.equal(handle.update(base()), true);
    await settle();
    assert.ok(!node.hasAttribute('aria-expanded'), 'removed, on that node');
    handle.destroy();
  });

  for (const key of ['aria-describedby', 'aria-labelledby', 'aria-pressed', 'aria-haspopup']) {
    it(`refuses ${key}, which is no aria key of the icon button (M13)`, () => {
      assertRefused({ [key]: 'true' }, `"${key}" is not a data attribute`);
    });
  }
});

/** Focuses `node`, answering `:focus-visible` as a keyboard (`true`) or a pointer focus would. */
function focusBy(node, keyboard) {
  const matches = node.matches.bind(node);
  node.matches = (selector) => (selector === ':focus-visible' ? keyboard : matches(selector));
  node.focus();
}
const keyboardFocus = (node) => focusBy(node, true);

/** The lab's call-recording stand-in for Foundry's `TooltipManager`, as `game.tooltip`. */
function withTooltip() {
  const tooltip = createLabTooltipManager();
  globalThis.game.tooltip = tooltip;
  return tooltip;
}

/** The recorded calls with each element named by `node`, never a DOM node to serialise. */
const transcript = (tooltip, node) =>
  tooltip.calls.map(([verb, element, options]) =>
    [verb, element === node ? 'button' : 'another', options].filter(Boolean)
  );

describe('the tooltip of the published IconButton', () => {
  it('writes its name as the hover text core shows, with or without a tooltip manager', async () => {
    const { handle, button } = mountIconButton();
    await settle();
    assert.equal(button().getAttribute('data-tooltip-text'), LABEL);
    assert.ok(!button().hasAttribute('data-tooltip'), 'not the localized, HTML path');
    assert.ok(!button().hasAttribute('title'), 'and no native title');
    handle.destroy();
  });

  it('opens its name under keyboard focus through the runtime’s facade, and closes it on blur', async () => {
    const tooltip = withTooltip();
    const { handle, button } = mountIconButton();
    await settle();
    const node = button();
    keyboardFocus(node);
    assert.deepEqual(transcript(tooltip, node), [['activate', 'button', { text: LABEL }]]);
    assert.equal(node.getAttribute('aria-describedby'), 'tooltip', 'Foundry describes the button');
    node.blur();
    assert.ok(!tooltip.element, 'its own tooltip closes');
    assert.ok(!node.hasAttribute('aria-describedby'), 'and the description goes with it');
    handle.destroy();
  });

  it('leaves another element’s open tooltip open when it blurs or takes Escape', async () => {
    const tooltip = withTooltip();
    const { target, handle, button } = mountIconButton();
    await settle();
    const node = button();
    keyboardFocus(node);
    const other = target.ownerDocument.createElement('span');
    target.after(other);
    tooltip.activate(other, { text: 'Another hint' });
    const { KeyboardEvent } = node.ownerDocument.defaultView;
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    node.blur();
    assert.ok(tooltip.element === other, 'the other tooltip stays open');
    assert.deepEqual(transcript(tooltip, node), [
      ['activate', 'button', { text: LABEL }],
      ['deactivate', 'button'],
      ['activate', 'another', { text: 'Another hint' }],
    ]);
    other.remove();
    handle.destroy();
  });

  it('opens nothing under a pointer focus', async () => {
    const tooltip = withTooltip();
    const { handle, button } = mountIconButton();
    await settle();
    focusBy(button(), false);
    assert.deepEqual(transcript(tooltip, button()), []);
    handle.destroy();
  });

  it('closes its own open tooltip on destroy', async () => {
    const tooltip = withTooltip();
    const { target, handle, button } = mountIconButton();
    await settle();
    const node = button();
    keyboardFocus(node);
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
    assert.deepEqual(transcript(tooltip, node), [
      ['activate', 'button', { text: LABEL }],
      ['deactivate', 'button'],
    ]);
  });

  it('closes its own open tooltip on an update that renames or disables it, and not on one that changes neither', async () => {
    for (const [change, closes] of [
      [{ ariaLabel: 'Remove Ember salt' }, true],
      [{ disabled: true }, true],
      [{ 'aria-expanded': true }, false],
    ]) {
      const tooltip = withTooltip();
      const { handle, button } = mountIconButton();
      await settle();
      keyboardFocus(button());
      assert.equal(handle.update({ icon: GLYPH, ariaLabel: LABEL, onclick() {}, ...change }), true);
      await settle();
      const [key] = Object.keys(change);
      assert.equal(!tooltip.element, closes, `${key}: ${closes ? 'closes' : 'stays open'}`);
      handle.destroy();
    }
  });

  it('opens nothing under keyboard focus in a tree mounted with no facade, and writes its hover text', async () => {
    const tooltip = withTooltip();
    // A runtime that hands its trees no context, as any tree outside a Fabricate root is mounted.
    const bare = { ...seamParts.runtime, mount: (host, options) => svelteMount(host, options) };
    const { handle, button } = mountIconButton({}, { seam: ui(bare) });
    await settle();
    keyboardFocus(button());
    button().blur();
    assert.deepEqual(transcript(tooltip, button()), [], 'no call reached game.tooltip');
    assert.equal(button().getAttribute('data-tooltip-text'), LABEL);
    handle.destroy();
  });
});
