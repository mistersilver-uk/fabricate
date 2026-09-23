/**
 * THE SWITCH, MOUNTED — the root-emission proof on the rendered DOM, per host (issue 1508).
 * `tests/components/searchable-popover-area-scope.test.js` reads this component's
 * `const classes = $derived([…])` array and its `HOST_CLASSES` map;
 * `tests/components/re-rooted-controls-host-independence.test.js` writes the class string into its
 * own fixture as a literal and measures the sheet against it. Both would go on passing on a tree
 * where the component declared the array and stopped rendering `class={classes}` — and on that
 * tree all seventeen re-rooted rules in `styles/fabricate.css` match nothing, in both
 * applications, which is the whole of what issue 1508 set out to prevent.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, before, after, afterEach } from 'node:test';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const STATUS_TOGGLE = 'src/ui/svelte/components/StatusToggle.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-status-toggle-mounted-',
  compiledModules: ['src/ui/svelte/components/StatusToggle.svelte'],
  componentPath: 'src/ui/svelte/components/StatusToggle.svelte',
});

const source = () => readFileSync(resolve(repoRoot, STATUS_TOGGLE), 'utf8');

/**
 * The unconditional class literals of the component's `const classes = $derived([…])` array, READ
 * out of the component rather than restated here.
 *
 * @returns {string[]} Every unconditional string literal before that `]`, in order.
 */
function composedClasses() {
  const literal = source().match(/const classes = \$derived\(\s*\[([\s\S]*?)\]/);
  assert.ok(literal, 'StatusToggle must declare its emitted classes as one array literal');
  const tokens = [...literal[1].matchAll(/'([a-z][\w-]*)'/g)].map(([, token]) => token);
  assert.ok(tokens.length > 0, "StatusToggle's class array holds no unconditional literal");
  return tokens;
}

/**
 * The class the component chooses for a host, READ out of its frozen `HOST_CLASSES` map.
 *
 * @param {string} host The host name.
 * @returns {string} The class, or the empty string when that host adds none.
 */
function hostClass(host) {
  const map = source().match(/const HOST_CLASSES = Object\.freeze\(\{([\s\S]*?)\}\)/);
  assert.ok(map, 'StatusToggle must declare its per-host classes as one frozen map');
  const entry = map[1].match(new RegExp(String.raw`\b${host}:\s*'([\w-]+)'`));
  return entry ? entry[1] : '';
}

/**
 * The rendered class attribute of a mounted host, with any Svelte scoping token removed.
 *
 * @param {Element} node The mounted host element.
 * @returns {string} The class attribute.
 */
function emittedClasses(node) {
  const value = node.getAttribute('class');
  assert.ok(
    typeof value === 'string',
    'the switch rendered its host element with NO `class` attribute at all, so it has stopped ' +
      'emitting `class={classes}`. Every re-rooted rule in `styles/fabricate.css` now matches ' +
      'nothing, in both applications, while the class ARRAY it still declares reads correctly to ' +
      'every source-text gate in this repository.'
  );
  return value.replace(/ ?svelte-[a-z0-9]+/g, '');
}

/** The three hosts, the element each renders, and the class it adds beside the family class. */
const HOSTS = Object.freeze([
  Object.freeze({ as: 'button', tag: 'BUTTON', selector: 'button' }),
  Object.freeze({ as: 'indicator', tag: 'SPAN', selector: 'span[role="img"]' }),
  Object.freeze({ as: 'checkbox', tag: 'LABEL', selector: 'label' }),
]);

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('the switch emits its family root on the rendered element, in every host', () => {
  it('declares fabricate-toggle as the FIRST literal of its class array', () => {
    // THE SOURCE HALF, asserted here rather than left to the area-scope gate.
    // own equalities are only meaningful while the read and the literal agree. The position is a
    // CONSTRAINT: that gate reads the composed region up to the first `]`, and in this component
    // that `]` belongs to `HOST_CLASSES[host]` — so a root moved below it is reported as unemitted
    // while every re-rooted rule in the sheet keeps matching.
    assert.deepEqual(
      composedClasses(),
      ['fabricate-toggle', 'manager-status-toggle'],
      'the switch emits its family root and its hook class, in that order, before the expression ' +
        'the composed-class reader truncates at'
    );
  });

  for (const host of HOSTS) {
    it(`the ${host.as} host renders a <${host.tag.toLowerCase()}> carrying the root first`, async () => {
      const target = await harness.mount({ as: host.as, on: true, ariaLabel: 'Enabled' });
      const node = target.querySelector(host.selector);
      assert.ok(Boolean(node), `the ${host.as} host renders a <${host.tag.toLowerCase()}>`);
      assert.equal(node.tagName, host.tag);

      // THE WHOLE ATTRIBUTE, by equality. `classList.contains(root)` cannot see a root that
      // arrived second, and the position is what the area-scope gate depends on.
      const expected = ['fabricate-toggle', 'manager-status-toggle', hostClass(host.as), 'is-on']
        .filter(Boolean)
        .join(' ');
      assert.equal(emittedClasses(node), expected);
    });
  }

  it("the checkbox host's own class comes from the map, not from the array or the markup", async () => {
    // THE CLASS THE COMPOSED READER CANNOT SEE.
    assert.equal(hostClass('checkbox'), 'manager-tool-setting-toggle');
    const target = await harness.mount({ as: 'checkbox', on: false, ariaLabel: 'Inherit' });
    const label = target.querySelector('label');
    assert.equal(
      emittedClasses(label),
      'fabricate-toggle manager-status-toggle manager-tool-setting-toggle is-off'
    );
    const input = label.querySelector('input[type="checkbox"]');
    assert.ok(Boolean(input), 'the checkbox host renders the input the label is measured against');
    assert.equal(input.getAttribute('class'), 'manager-tool-setting-toggle-input');
  });

  it("APPENDS the caller's class behind its own, never in front of it", async () => {
    const target = await harness.mount({
      as: 'button',
      on: true,
      class: 'manager-environment-override-toggle',
    });
    assert.equal(
      emittedClasses(target.querySelector('button')),
      'fabricate-toggle manager-status-toggle manager-environment-override-toggle is-on'
    );
  });

  it('renders the track and knob every descendant rule is a chain beneath', async () => {
    // Twelve of the family's seventeen selectors are DESCENDANT chains under the root.
    const target = await harness.mount({ as: 'button', on: true, label: 'On' });
    for (const selector of [
      '.fabricate-toggle .manager-status-toggle-track',
      '.fabricate-toggle .manager-status-toggle-track .manager-status-toggle-knob',
      '.fabricate-toggle .manager-status-toggle-label',
    ]) {
      assert.ok(
        Boolean(target.querySelector(selector)),
        `the rendered tree must match \`${selector}\`, which is a shipped rule of this family`
      );
    }
  });
});

describe('the switch declares itself focused to Foundry, on the host that needs it', () => {
  it('emits data-keyboard-focus="true" on the button host', async () => {
    const target = await harness.mount({ as: 'button', on: true, ariaLabel: 'Enabled' });
    assert.equal(
      target.querySelector('button').getAttribute('data-keyboard-focus'),
      'true',
      'a `<button>` outside a `<form>` that does not declare itself leaves Foundry`s Space, ' +
        'arrow and Tab bindings firing while it holds focus'
    );
  });

  for (const host of ['indicator', 'checkbox']) {
    it(`does not emit it on the ${host} host, which needs none`, async () => {
      // The indicator is a `<span role="img">` and takes no focus at all.
      const target = await harness.mount({ as: host, on: true, ariaLabel: 'Locked' });
      const nodes = [...target.querySelectorAll('[data-keyboard-focus]')];
      assert.deepEqual(
        nodes.map((node) => node.tagName),
        [],
        `the ${host} host must declare no keyboard-focus marker`
      );
    });
  }

  it('lets a caller override the marker through the rest spread, which lands later', async () => {
    // THE PLACEMENT, ASSERTED RATHER THAN DOCUMENTED. The attribute is written on the same side of
    // `{...rest}` as `class={classes}` — before it — so a spread wins, which is what makes a
    // deliberate opt-out possible at a call site. Written after the spread this would be
    // impossible, and a caller's own `data-*` bag could unset it by accident with nothing saying so.
    const target = await harness.mount({
      as: 'button',
      on: true,
      'data-keyboard-focus': 'false',
    });
    assert.equal(target.querySelector('button').getAttribute('data-keyboard-focus'), 'false');
  });
});
