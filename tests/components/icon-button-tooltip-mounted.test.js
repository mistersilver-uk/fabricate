/**
 * Issue 2541 — `IconButton`'s name tooltip, role set, rungs and glyph. Foundry's `TooltipManager`
 * shows `data-tooltip-text` on pointer hover by itself; keyboard focus is the component's job, so
 * these tests stub `game.tooltip` with the lab's call-recording manager and `:focus-visible`.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  createLabTooltipManager,
  installFoundryShim,
} from '../view-lab/foundry/installFoundryShim.js';
import { createMinimalLabWorld } from '../view-lab/foundry/minimalLabWorld.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const ICON_BUTTON = 'src/ui/svelte/components/IconButton.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-icon-button-tooltip-',
  compiledModules: [ICON_BUTTON],
  componentPath: ICON_BUTTON,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => {
  harness.remount();
  delete globalThis.game.tooltip;
});

/** Mount one icon button and hand back its `<button>`, `:focus-visible` answered by `keyboard`. */
async function mountButton(props = {}, { keyboard = true } = {}) {
  const root = await harness.mount({
    ariaLabel: 'Remove Iron ingot',
    icon: 'fas fa-xmark',
    ...props,
  });
  const button = root.querySelector('button');
  assert.ok(Boolean(button), 'the icon button rendered no <button>');
  const matches = button.matches.bind(button);
  button.matches = (selector) => (selector === ':focus-visible' ? keyboard : matches(selector));
  return button;
}

function withTooltip() {
  const tooltip = createLabTooltipManager();
  globalThis.game.tooltip = tooltip;
  return tooltip;
}

const focus = (button) => button.dispatchEvent(new globalThis.FocusEvent('focus'));
const blur = (button) => button.dispatchEvent(new globalThis.FocusEvent('blur'));
const press = (button, key) =>
  button.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key, bubbles: true }));
const activations = (tooltip) => tooltip.calls.filter(([verb]) => verb === 'activate');

/** The recorded calls with each element named by `button`, never a DOM node to serialise. */
const transcript = (tooltip, button) =>
  tooltip.calls.map(([verb, element, options]) =>
    [verb, element === button ? 'button' : 'another', options].filter(Boolean)
  );

describe('IconButton writes its name as plain tooltip text', () => {
  it('writes the accessible name as `data-tooltip-text` and no `title`', async () => {
    const button = await mountButton();
    assert.equal(button.getAttribute('data-tooltip-text'), 'Remove Iron ingot');
    assert.ok(!button.hasAttribute('title'), 'an icon button must not carry a native title');
    assert.ok(!button.hasAttribute('data-tooltip'), 'the localized, HTML-cleaned path is unused');
  });

  it('writes `tooltip` in place of the name, and `tooltip=""` suppresses it', async () => {
    const hinted = await mountButton({ tooltip: 'Locked by the recipe' });
    assert.equal(hinted.getAttribute('data-tooltip-text'), 'Locked by the recipe');
    assert.equal(hinted.getAttribute('aria-label'), 'Remove Iron ingot');
    harness.remount();
    const silent = await mountButton({ tooltip: '' });
    assert.ok(!silent.hasAttribute('data-tooltip-text'), '`tooltip=""` must write no tooltip');
  });

  it('yields to a caller-written tooltip rather than stacking a second one', async () => {
    for (const override of ['title', 'data-tooltip', 'data-tooltip-html']) {
      const tooltip = withTooltip();
      const button = await mountButton({ [override]: 'Caller hint' });
      assert.ok(!button.hasAttribute('data-tooltip-text'), `${override} must suppress the name`);
      focus(button);
      assert.equal(activations(tooltip).length, 0, `${override} must suppress the focus tooltip`);
      harness.remount();
    }
  });
});

describe('IconButton shows its name under keyboard focus', () => {
  it('Tab activates the tooltip exactly once, with the name as plain text', async () => {
    const tooltip = withTooltip();
    const button = await mountButton({ ariaLabel: 'Rename <b>Iron</b>' });
    focus(button);
    assert.deepEqual(transcript(tooltip, button), [
      ['activate', 'button', { text: 'Rename <b>Iron</b>' }],
    ]);
    assert.equal(button.getAttribute('data-tooltip-text'), 'Rename <b>Iron</b>');
    assert.ok(!button.querySelector('b'), 'the name must stay text, never markup');
  });

  it('a pointer focus and click open no tooltip of their own', async () => {
    const tooltip = withTooltip();
    const button = await mountButton({}, { keyboard: false });
    focus(button);
    button.click();
    assert.equal(activations(tooltip).length, 0);
  });

  it('click, blur and Escape each close its own tooltip', async () => {
    for (const close of [(b) => b.click(), blur, (b) => press(b, 'Escape')]) {
      const tooltip = withTooltip();
      const button = await mountButton();
      focus(button);
      close(button);
      assert.ok(!tooltip.element, 'its own tooltip must close');
      assert.ok(!button.hasAttribute('aria-describedby'), 'Foundry drops the description');
      harness.remount();
    }
  });

  it('blur and Escape leave another element’s tooltip open', async () => {
    const tooltip = withTooltip();
    const button = await mountButton();
    const other = document.createElement('span');
    document.body.append(other);
    tooltip.activate(other, { text: 'Another hint' });
    blur(button);
    press(button, 'Escape');
    button.click();
    assert.ok(tooltip.element === other, 'only the button’s own tooltip may be dismissed');
    other.remove();
  });

  it('composes with a caller’s own focus, blur and keydown handlers', async () => {
    withTooltip();
    const heard = [];
    const hear = (what) => {
      heard.push(what);
    };
    const button = await mountButton({
      onfocus: () => hear('focus'),
      onblur: () => hear('blur'),
      onkeydown: (event) => hear(`key ${event.key}`),
    });
    focus(button);
    press(button, 'Escape');
    blur(button);
    assert.deepEqual(heard, ['focus', 'key Escape', 'blur']);
  });

  it('does nothing outside Foundry, where there is no tooltip manager', async () => {
    const button = await mountButton();
    focus(button);
    press(button, 'Escape');
    blur(button);
    button.click();
  });
});

describe('IconButton maps its closed role set and rungs to the classes the sheet paints', () => {
  const classesOf = async (props) => [...(await mountButton(props)).classList];

  it('`neutral` adds nothing, and no role reaches the `<button>` as ARIA', async () => {
    const neutral = await mountButton({ role: 'neutral' });
    assert.deepEqual([...neutral.classList], ['fabricate-icon-button']);
    assert.ok(!neutral.hasAttribute('role'), 'the verb role is not an ARIA role');
  });

  it('maps each role, `ghost-danger` to both classes, and an unknown value to none', async () => {
    const expected = {
      primary: ['is-primary'],
      ghost: ['is-ghost'],
      danger: ['is-danger'],
      'ghost-danger': ['is-ghost', 'is-danger'],
      menuitem: [],
    };
    for (const [role, classes] of Object.entries(expected)) {
      assert.deepEqual(await classesOf({ role }), ['fabricate-icon-button', ...classes], role);
      harness.remount();
    }
  });

  it('orders the root, the rung, the role, then the caller’s extra class', async () => {
    assert.deepEqual(await classesOf({ size: '24', role: 'ghost', class: 'is-locked' }), [
      'fabricate-icon-button',
      'is-size-24',
      'is-ghost',
      'is-locked',
    ]);
    harness.remount();
    assert.deepEqual(await classesOf({ size: '26' }), ['fabricate-icon-button', 'is-size-26']);
    harness.remount();
    assert.deepEqual(await classesOf({ size: '30' }), ['fabricate-icon-button']);
  });

  it('draws `icon` as a hidden glyph', async () => {
    const glyph = (await mountButton({ icon: 'fas fa-link' })).querySelector('i');
    assert.equal(glyph?.className, 'fas fa-link');
    assert.equal(glyph?.getAttribute('aria-hidden'), 'true');
  });
});

describe('the View Lab shim records the tooltip a keyboard focus opens', () => {
  it('Tab to an icon button records one activation on the shim’s `game.tooltip`', async () => {
    const shim = installFoundryShim(createMinimalLabWorld({ i18n: globalThis.game.i18n }));
    try {
      const button = await mountButton({ ariaLabel: 'Link a world item' });
      focus(button);
      blur(button);
      assert.deepEqual(transcript(globalThis.game.tooltip, button), [
        ['activate', 'button', { text: 'Link a world item' }],
        ['deactivate', 'button'],
      ]);
    } finally {
      harness.remount();
      shim.restore();
    }
  });
});
