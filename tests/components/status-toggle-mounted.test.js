/**
 * THE SWITCH, MOUNTED — the root-emission proof on the rendered DOM, per host (issue 1508).
 *
 * ── WHY A MOUNTED SUITE ───────────────────────────────────────────────────────────────────
 * Every other reader of `fabricate-toggle` is SOURCE TEXT.
 * `tests/components/searchable-popover-area-scope.test.js` reads this component's
 * `const classes = $derived([…])` array and its `HOST_CLASSES` map;
 * `tests/components/re-rooted-controls-host-independence.test.js` writes the class string into its
 * own fixture as a literal and measures the sheet against it. Both would go on passing on a tree
 * where the component declared the array and stopped rendering `class={classes}` — and on that
 * tree all seventeen re-rooted rules in `styles/fabricate.css` match nothing, in both
 * applications, which is the whole of what issue 1508 set out to prevent.
 *
 * ── AND WHY IT IS PER HOST, WHICH IS THIS PRIMITIVE'S OWN REASON ──────────────────────────
 * `StatusToggle` renders THREE different elements — a `<button>`, a `<span role="img">` and a
 * `<label>` wrapping an `<input type="checkbox">` — and the class each host adds beside the family
 * class comes out of a frozen map in `<script>` rather than out of the class array. So "the root
 * is emitted" is three claims, not one, and the checkbox host's is the one with a rule of its own
 * behind it: `.fabricate-toggle.manager-tool-setting-toggle` is the 34px box its absolutely
 * positioned input is measured against, and it is invisible to the composed-array reader by
 * construction — the array truncates at `HOST_CLASSES[host]`'s own `]`.
 *
 * ── AND THE ATTRIBUTE, WHICH IS A BEHAVIOUR RATHER THAN A CLASS ───────────────────────────
 * `data-keyboard-focus="true"` is emitted on the BUTTON host only, and its placement relative to
 * the rest spread is prescribed: a spread that landed later would win, so a caller's `data-*` bag
 * could unset it. Both halves are asserted here, because the ledger that pins the emission
 * (`design-system-known-debt.js`'s formless-button table) counts SOURCE elements and cannot see
 * which host rendered.
 *
 * The component is an import-free LEAF — props only, no bridge, no util imports — so the harness
 * compiles exactly one module. `compiledModules` names the path as a LITERAL rather than through a
 * binding, because `mounted-harness-primitive-allowlist.test.js` reads that list by matching
 * path-shaped quoted strings and a bare identifier there would make this suite read as compiling
 * nothing at all.
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
 * The same reader `re-rooted-controls-host-independence.test.js` and
 * `toolbar-and-card-mounted.test.js` use, and for its reason: a probe built from a restated string
 * keeps measuring the old control after the component stops emitting it, and reports green while
 * doing so. It stops at the array's first `]`, which in this component is `HOST_CLASSES[host]`'s
 * own — so it returns exactly the two tokens every host writes first, which is what the clauses
 * below compare against.
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
 * Read rather than restated for the array's reason, and read from the MAP rather than from the
 * markup because that is where these two strings live — the same region
 * `searchable-popover-area-scope.test.js`'s `classMapRegion` had to be added for.
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

/**
 * The three hosts, the element each renders, and the class it adds beside the family class.
 *
 * `hostClass` is resolved lazily inside each clause rather than captured here, so the read is part
 * of the assertion rather than of the table.
 */
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
    // THE SOURCE HALF, asserted here rather than left to the area-scope gate, because this file's
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
    // THE CLASS THE COMPOSED READER CANNOT SEE, proved on the DOM. Two shipped rules are rooted at
    // this pair — the 34px box and the `:has()` focus ring — and neither the markup region nor the
    // composed array holds the string, which is why the area-scope gate had to grow a third
    // reader for it. If this host ever stopped emitting it, both rules would match nothing and no
    // source-text gate in this repository would notice.
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
    // Twelve of the family's seventeen selectors are DESCENDANT chains under the root, so the root
    // alone is not the whole contract: a tree that stopped rendering the knob would leave its
    // rules matching nothing with the root still correctly emitted — and a track with no knob is a
    // switch that cannot show its own state.
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
      // The indicator is a `<span role="img">` and takes no focus at all; the checkbox host
      // renders a native `<input type="checkbox">`, which Foundry's `KeyboardManager#hasFocus`
      // already treats as focused on its own. Stated as an absence so a later sweep that
      // "completes" the attribute across all three hosts has to reopen this reading.
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
