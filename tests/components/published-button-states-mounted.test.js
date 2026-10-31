/**
 * The published `Button`'s `ariaLabel`, `tooltip`, `pressed` and `info` role (issue 2852) on
 * Fabricate's real Svelte runtime, through a fresh seam registered with the adapter's own table,
 * under a Fabricate window root: the name that replaces the label and the refusal of one that does
 * not hold it (M22), the hint written as Foundry's plain tooltip text and opened under keyboard
 * focus through the runtime's facade, the `aria-pressed` each value writes and the face `true`
 * draws, and the role's class.
 * Limit: happy-dom does not tell a keyboard focus from a pointer one, so each focus clause answers
 * `:focus-visible` on the button.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { APP_TOOLTIPS } from '../../src/ui/svelte/util/appLocalizer.js';
import { escapeKey, keyboardFocus, withTooltip } from '../helpers/keyboardTooltipProbe.js';
import { recorder } from '../helpers/publishedComponentFakes.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  fabricateTarget,
  recordEscapes,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const REFUSAL = 'Fabricate | published components: ';
const LABEL = '+7';
const NAME = 'Credit +7 days to Mira';
const HINT = 'Rewinds the clock by one day';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-button-states-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let seamParts;
let escaped;
let targets;
let stopRecording;

const ui = () => shippedSeam({ ...seamParts, report() {} });

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
  escaped = [];
  targets = [];
});

afterEach(() => {
  for (const shell of targets) shell.remove();
  delete globalThis.game.tooltip;
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
});

/** A button mounted with `props` over the label and a recording `onclick`. */
function mountButton(props = {}) {
  const press = recorder();
  const target = fabricateTarget(targets);
  const given = { children: LABEL, onclick: press.record, ...props };
  const handle = ui().mount('Button', { target, props: given });
  const button = () => target.querySelector('button');
  const update = (next) => handle.update({ children: LABEL, onclick() {}, ...next });
  return { target, handle, update, calls: press.calls, button };
}

const authoredClasses = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

/** The recorded verbs, each element named by whether it is `node`, never a node to serialise. */
const verbsOn = (tooltip, node) =>
  tooltip.calls.map(([verb, element]) => `${verb} ${element === node ? 'button' : 'another'}`);

describe('the published Button, ariaLabel', () => {
  it('replaces the label as the name, the label still drawn, and an update renames it in place', async () => {
    const { handle, update, button } = mountButton({ ariaLabel: NAME });
    await settle();
    const node = button();
    assert.deepEqual([node.getAttribute('aria-label'), node.textContent], [NAME, LABEL]);
    assert.equal(update({ ariaLabel: 'Credit +7 days to Ash' }), true);
    await settle();
    assert.ok(button() === node, 'the same button');
    assert.equal(node.getAttribute('aria-label'), 'Credit +7 days to Ash');
    assert.equal(update({}), true);
    await settle();
    assert.ok(!node.hasAttribute('aria-label'), 'omitted, the label is the name again');
    handle.destroy();
  });

  for (const value of ['', ' '.repeat(3), 7, true]) {
    it(`writes no name for ${JSON.stringify(value)}, so the label stays the name`, async () => {
      const { handle, button } = mountButton({ ariaLabel: value });
      await settle();
      assert.ok(!button().hasAttribute('aria-label'));
      handle.destroy();
    });
  }

  it('takes a name holding the label in another case or spacing', async () => {
    const { handle, button } = mountButton({
      children: 'Roll  Wits',
      ariaLabel: 'roll wits for Mira',
    });
    await settle();
    assert.equal(button().getAttribute('aria-label'), 'roll wits for Mira');
    handle.destroy();
  });

  it('refuses a mount whose name does not hold the label (M22), drawing nothing', () => {
    const target = fabricateTarget(targets);
    const props = { children: LABEL, ariaLabel: 'Credit seven days to Mira', onclick() {} };
    assert.throws(() => ui().mount('Button', { target, props }), {
      name: 'TypeError',
      message: `${REFUSAL}"ariaLabel" must contain the text of "children" ("+7" is not in "Credit seven days to Mira")`,
    });
    assert.equal(target.childNodes.length, 0);
  });

  it('refuses an update that changes the label away from the name (M22), keeping the earlier props', async () => {
    const { handle, update, button } = mountButton({ ariaLabel: NAME });
    await settle();
    assert.throws(() => update({ children: '+8', ariaLabel: NAME }), {
      name: 'TypeError',
      message: `${REFUSAL}"ariaLabel" must contain the text of "children" ("+8" is not in "${NAME}")`,
    });
    await settle();
    assert.deepEqual([button().getAttribute('aria-label'), button().textContent], [NAME, LABEL]);
    handle.destroy();
  });
});

describe('the published Button, tooltip', () => {
  it('reads the facade by the registry key the roots hand their trees', () => {
    assert.equal(APP_TOOLTIPS, Symbol.for('fabricate.appTooltips'));
  });

  it('writes the hint as Foundry’s plain tooltip text beside the name, and drops it on update', async () => {
    const { handle, update, button } = mountButton({ tooltip: HINT });
    await settle();
    const node = button();
    assert.equal(node.getAttribute('data-tooltip-text'), HINT);
    assert.ok(!node.hasAttribute('title') && !node.hasAttribute('data-tooltip'), 'no other path');
    assert.equal(node.textContent, LABEL, 'the label stays the name');
    assert.equal(update({ tooltip: '  ' }), true);
    await settle();
    assert.ok(!node.hasAttribute('data-tooltip-text'), 'white space alone writes none');
    handle.destroy();
  });

  it('opens the hint under keyboard focus through the runtime’s facade, and closes it on blur', async () => {
    const tooltip = withTooltip();
    const { handle, button } = mountButton({ tooltip: HINT });
    await settle();
    const node = button();
    keyboardFocus(node);
    assert.deepEqual(tooltip.calls.at(-1)?.[2], { text: HINT });
    assert.equal(node.getAttribute('aria-describedby'), 'tooltip', 'Foundry describes the button');
    node.blur();
    assert.ok(!tooltip.element, 'its own tooltip closes');
    assert.deepEqual(verbsOn(tooltip, node), ['activate button', 'deactivate button']);
    handle.destroy();
  });

  for (const [what, act, closes] of [
    ['a press', ({ button }) => button().click(), true],
    ['Escape', ({ button }) => button().dispatchEvent(escapeKey(button())), true],
    ['an update that changes it', ({ update }) => update({ tooltip: 'Another hint' }), true],
    [
      'an update that disables the button',
      ({ update }) => update({ tooltip: HINT, disabled: true }),
      true,
    ],
    ['an update that keeps it', ({ update }) => update({ tooltip: HINT, pressed: true }), false],
    ['destroy', ({ handle }) => handle.destroy(), true],
  ]) {
    it(`${closes ? 'closes' : 'keeps'} its open tooltip on ${what}`, async () => {
      const tooltip = withTooltip();
      const mounted = mountButton({ tooltip: HINT });
      await settle();
      keyboardFocus(mounted.button());
      assert.ok(tooltip.element === mounted.button(), 'the keyboard focus opened it');
      act(mounted);
      await settle();
      assert.equal(!tooltip.element, closes);
      mounted.handle.destroy();
    });
  }

  it('opens nothing on keyboard focus and calls no tooltip on a press without a hint', async () => {
    const tooltip = withTooltip();
    const { handle, button } = mountButton();
    await settle();
    keyboardFocus(button());
    button().click();
    button().blur();
    assert.deepEqual(tooltip.calls, []);
    assert.ok(!button().hasAttribute('data-tooltip-text'));
    handle.destroy();
  });

  it('draws no hint on a button carrying data-locked, where Foundry would pin a copy of it', async () => {
    const tooltip = withTooltip();
    const { handle, button } = mountButton({ tooltip: HINT, 'data-locked': '' });
    await settle();
    keyboardFocus(button());
    assert.ok(!button().hasAttribute('data-tooltip-text'));
    assert.deepEqual(tooltip.calls, []);
    handle.destroy();
  });
});

describe('the published Button, pressed and info', () => {
  for (const [pressed, attribute, classes] of [
    [true, 'true', ['is-pressed']],
    [false, 'false', []],
    [undefined, null, []],
    ['true', null, []],
    [1, null, []],
  ]) {
    it(`writes aria-pressed ${JSON.stringify(attribute)} and ${classes.join('') || 'no face'} for ${JSON.stringify(pressed)}`, async () => {
      const { handle, button } = mountButton({ pressed });
      await settle();
      assert.equal(button().getAttribute('aria-pressed'), attribute);
      assert.deepEqual(authoredClasses(button()), ['fabricate-button', ...classes]);
      handle.destroy();
    });
  }

  it('reports a press with no argument and shows the new state only when the update passes it', async () => {
    const { handle, update, calls, button } = mountButton({ pressed: false });
    await settle();
    button().click();
    assert.deepEqual(calls, [[]]);
    assert.equal(
      button().getAttribute('aria-pressed'),
      'false',
      'the button changes nothing itself'
    );
    assert.equal(update({ pressed: true }), true);
    await settle();
    assert.equal(button().getAttribute('aria-pressed'), 'true');
    handle.destroy();
  });

  it('writes the info role’s class, and an update replaces it', async () => {
    const { handle, update, button } = mountButton({ role: 'info' });
    await settle();
    assert.deepEqual(authoredClasses(button()), ['fabricate-button', 'is-info-action']);
    assert.equal(update({ role: 'accent' }), true);
    await settle();
    assert.deepEqual(authoredClasses(button()), ['fabricate-button'], 'a role outside the set');
    handle.destroy();
  });

  it('describes the three keys as optional data', () => {
    const { props } = ui().describe('Button');
    for (const key of ['ariaLabel', 'tooltip', 'pressed']) {
      assert.deepEqual(props[key], { kind: 'data', required: false }, key);
    }
  });

  for (const key of ['aria-pressed', 'aria-label', 'data-tooltip-text']) {
    it(`still refuses ${key}, which the button writes itself (M13)`, () => {
      const target = fabricateTarget(targets);
      const props = { children: LABEL, onclick() {}, [key]: 'true' };
      assert.throws(() => ui().mount('Button', { target, props }), { name: 'TypeError' });
      assert.equal(target.childNodes.length, 0);
    });
  }
});
