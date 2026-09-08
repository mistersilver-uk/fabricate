/**
 * `<Chip removable>` — the editable-set form of the app's one chip (issue 1515).
 *
 * `Chip` had a read-only form and nothing else: thirteen tones, three emphases, six densities and
 * an icon-only square, all of them faces of a badge you READ. Six manager surfaces nevertheless
 * render a membership token you can take back — the availability pill family — and every one of
 * them is hand-written markup with its own geometry, its own remove button and its own answer to
 * where focus goes afterwards. This suite covers the prop that lets those sites converge, and
 * every clause is a way for the CONTRACT to be wrong while the prop is declared:
 *
 *   - the remove control is a `<button>` OUTSIDE a form, which Foundry's `KeyboardManager#hasFocus`
 *     recognises only by its `form` — it literally returns `!!focused.form`. Without
 *     `data-keyboard-focus="true"` the window reads as unfocused while the control holds focus, so
 *     Space pauses the game and the arrows pan the canvas behind the open application. This is the
 *     same declaration issue 1508 put on `ModifierPillSelect`'s remove button for the same reason;
 *   - focus DIES with the removed button. Deleting the focused element drops focus to `<body>`,
 *     which is that same unfocused state plus a keyboard user stranded at the top of the document,
 *     so the destination is named and taken BEFORE the handler runs;
 *   - `removable` on `tag="button"` or `tag="a"` nests a button inside a control. The refusal is a
 *     THROW rather than a dropped prop, and so are the two adjacent ones — a control with no
 *     accessible name is announced as nothing at all, and a control with no handler is an
 *     affordance for an edit the screen cannot make;
 *   - `disabled` was a rest-spread attribute and is a declared prop now, because the control has to
 *     go inert WITH the chip. The clause below asserts BOTH halves, since making it a prop takes it
 *     out of the spread and a caller that only ever read the root would not notice;
 *   - `truncate` clips the LABEL. The chip is a flex row with `overflow: hidden` when truncated, so
 *     without a clipping box on the label and `flex: 0 0 auto` on the control the long label pushes
 *     the `x` out of the chip's visible box — an affordance that is still in the DOM, still
 *     focusable, and no longer on screen.
 *
 * ── WHY A COMPILED FIXTURE CALLER ─────────────────────────────────────────────────────────────
 * `tests/fixtures/chip/RemovableChipRow.svelte` is the call site, on the precedent
 * `tests/fixtures/searchable-popover/CapabilityHost.svelte` set. Three contracts here are about a
 * chip's relationship to the chips beside it and to markup the chip does not own — the sibling
 * chain, the caller's fallback trigger, and a label that arrives as a snippet — and a row of
 * hand-written look-alikes would let all three pass while the primitive emitted something else.
 *
 * ── WHY THE SOURCE-CONTRACT CLAUSES READ THE STYLE BLOCK ──────────────────────────────────────
 * happy-dom lays nothing out and computes no cascade, so the geometry this prop is about — a 20px
 * square hit box, a label that clips and a control that does not — has no DOM to be read back
 * from. Those clauses read the rules the way `chip-tone-matrix-characterization.test.js` reads the
 * density bands, and say what each rule is FOR rather than restating its declarations.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const CHIP_PATH = 'src/ui/svelte/components/Chip.svelte';
const ROW_PATH = 'tests/fixtures/chip/RemovableChipRow.svelte';

const chipSource = readFileSync(resolve(repoRoot, CHIP_PATH), 'utf8');
const librarySource = readFileSync(
  resolve(repoRoot, 'openspec/specs/design-system/library.html'),
  'utf8'
);

/** The real `<style>` block, sliced at the tag on its own line — see the characterization suite. */
const styleBlock = chipSource.slice(chipSource.search(/^<style>$/m));

/** @param {string} text @returns {string} the text with block and line comments removed */
function withoutComments(text) {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

/**
 * One rule's body, so an assertion reads the declarations that rule states and cannot be answered
 * by an identically-named declaration in the rule beside it.
 *
 * @param {string} selector the rule head, written exactly as the block writes it
 * @returns {string}
 */
function ruleFor(selector) {
  const open = styleBlock.indexOf(`${selector} {`);
  assert.notEqual(open, -1, `${selector} still has a rule of its own`);
  return styleBlock.slice(open, styleBlock.indexOf('}', open));
}

/** The row fixture, which renders real sibling chips and the two caller-owned obligations. */
const row = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-chip-removable-row-',
  compiledModules: [CHIP_PATH, ROW_PATH],
  componentPath: ROW_PATH,
});

/** The primitive on its own, for the refusals, which are about props no call site should pass. */
const chip = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-chip-removable-',
  compiledModules: [CHIP_PATH],
  componentPath: CHIP_PATH,
});

const MEMBERS = [
  { id: 'perception', label: 'Perception' },
  { id: 'survival', label: 'Survival' },
  { id: 'athletics', label: 'Athletics' },
];

/** @param {HTMLElement} target @param {string} id */
const chipFor = (target, id) => target.querySelector(`[data-member="${id}"]`);

/** @param {HTMLElement} target @param {string} id */
const removeFor = (target, id) => chipFor(target, id).querySelector('[data-chip-remove]');

/**
 * Let the caller's state change reach the DOM.
 *
 * A synthetic `click()` runs the handler synchronously, so the FOCUS move is observable the
 * instant it returns — that half is the point of moving focus before emitting. The caller
 * re-rendering without the removed member is a Svelte update, which is not, and a suite that
 * asserted the member had gone without flushing would be asserting against the tree the click
 * started from.
 */
async function settle() {
  flushSync();
  await tick();
  flushSync();
}

/**
 * Assert which element holds focus, WITHOUT ever handing two DOM nodes to `assert.equal`.
 *
 * This is not a style preference. On failure `node:assert` serialises both values to build its
 * diff, and a mounted happy-dom element is a circular tree with its whole document behind it, so
 * the process walks it until the heap dies. The suite then reports no failure at all — it hangs,
 * and a killed run leaves `# cancelled`, which is indistinguishable from a missing harness
 * allowlist entry. Measured here: removing the focus move from the component turned all three
 * clauses below from a failure into a hang.
 *
 * So the identity check is a boolean, and the DIAGNOSTIC is the destination’s own accessible
 * name — which is what a reader needs anyway ("focus is on Remove Survival, expected Remove
 * Athletics" says more than two serialised nodes ever would).
 *
 * @param {Element|null} expected
 * @param {string} why
 */
function assertFocused(expected, why) {
  const active = document.activeElement;
  assert.ok(Boolean(expected), `the expected focus destination is not in the DOM: ${why}`);
  assert.equal(
    active?.getAttribute?.('aria-label') ?? active?.textContent ?? '<nothing>',
    expected.getAttribute('aria-label') ?? expected.textContent,
    why
  );
  assert.ok(active === expected, `the right kind of element holds focus, but not that one: ${why}`);
}

describe('1515 Chip — the removable membership token', () => {
  before(async () => {
    await row.setup();
  });

  after(() => row.teardown());

  it('renders a remove BUTTON that declares itself focused to Foundry', async () => {
    const target = await row.mount({ members: MEMBERS });
    const control = removeFor(target, 'survival');

    assert.ok(Boolean(control), 'a removable chip carries a remove control');
    assert.equal(control.tagName, 'BUTTON', 'the control is a real button, not a div wearing a role');
    assert.equal(control.getAttribute('type'), 'button', 'and never a submit button');
    assert.equal(
      control.getAttribute('data-keyboard-focus'),
      'true',
      'a button outside a form is unrecognised by `hasFocus`, so Space would pause the game and ' +
        'the arrows pan the canvas while this control holds focus'
    );
    assert.equal(
      control.getAttribute('aria-label'),
      'Remove Survival',
      'the control names the member it takes out; the chip cannot read a name out of a snippet'
    );
    assert.ok(
      control.querySelector('i[aria-hidden="true"]'),
      'its glyph is decorative, so the label is the whole accessible name'
    );
    row.remount();
  });

  it('puts the control LAST, after a label of its own, and keeps the chip hook', async () => {
    const target = await row.mount({ members: MEMBERS });
    const node = chipFor(target, 'perception');

    assert.ok(node.classList.contains('manager-chip'), 'the literal hook class is kept');
    assert.ok(node.classList.contains('is-removable'), 'the editable-set form declares itself');
    assert.ok(
      node.lastElementChild.classList.contains('manager-chip-remove'),
      'the control is the LAST thing in the chip, after the label'
    );
    const label = node.querySelector('.manager-chip-label');
    assert.ok(Boolean(label), 'the label takes a box of its own, which is what `truncate` clips');
    assert.equal(label.textContent, 'Perception', 'and it holds the caller snippet verbatim');
    assert.equal(
      node.textContent,
      'Perception',
      'no whitespace text node joins the label to the control: callers assert on exact textContent'
    );
    row.remount();
  });

  it('propagates `disabled` to the control AND to the chip itself', async () => {
    const target = await row.mount({ members: MEMBERS, disabled: true });
    const control = removeFor(target, 'survival');

    assert.equal(control.disabled, true, 'the control goes inert with the chip');
    assert.ok(
      chipFor(target, 'survival').hasAttribute('disabled'),
      '`disabled` is a declared prop now, so it must still reach the rendered element — a caller ' +
        'that passed it through the rest spread before would otherwise lose it silently'
    );
    row.remount();
  });
});

describe('1515 Chip — focus survives the removal', () => {
  before(async () => {
    await row.setup();
  });

  after(() => row.teardown());

  it('hands focus to the NEXT chip’s remove control', async () => {
    const target = await row.mount({ members: MEMBERS });
    removeFor(target, 'survival').click();
    await settle();

    assert.ok(!chipFor(target, 'survival'), 'the member really left the set');
    assertFocused(
      removeFor(target, 'athletics'),
      'focus goes forward, so a keyboard user keeps deleting down the row'
    );
    row.remount();
  });

  it('falls back to the PREVIOUS chip’s remove control at the end of the row', async () => {
    const target = await row.mount({ members: MEMBERS });
    removeFor(target, 'athletics').click();

    assertFocused(
      removeFor(target, 'survival'),
      'removing the LAST member has no "next"; jumping to the trigger while members remain reads ' +
        'as being thrown out of the row'
    );
    row.remount();
  });

  it('falls back to the caller’s trigger when the set empties', async () => {
    const target = await row.mount({ members: [MEMBERS[0]] });
    removeFor(target, 'perception').click();

    assertFocused(
      target.querySelector('[data-chip-remove-fallback]'),
      'the last member has no neighbour, so the third rung is the hook the caller puts on its own ' +
        'add trigger — the chip cannot put a tabindex on markup it does not own'
    );
    row.remount();
  });

  it('moves focus BEFORE the handler runs, which is why the destination still exists', async () => {
    let focusedWhenHandled = null;
    const target = await row.mount({
      members: MEMBERS,
      onRemoved: (id, active) => {
        focusedWhenHandled = active;
      },
    });
    const destination = removeFor(target, 'athletics');
    removeFor(target, 'survival').click();

    assert.equal(
      focusedWhenHandled?.getAttribute?.('aria-label') ?? '<nothing>',
      'Remove Athletics',
      'the handler is what deletes the chip, so a destination chosen afterwards is chosen from a ' +
        'DOM the deletion has already changed'
    );
    assert.ok(
      focusedWhenHandled === destination,
      'and it is the surviving neighbour itself, not another control wearing its label'
    );
    row.remount();
  });

  it('still removes the member when the caller supplies no fallback', async () => {
    const target = await row.mount({ members: [MEMBERS[0]], withFallback: false });
    removeFor(target, 'perception').click();
    await settle();

    assert.ok(!chipFor(target, 'perception'), 'the removal is not conditional on the fallback');
    row.remount();
  });
});

describe('1515 Chip — removable is REFUSED rather than dropped', () => {
  before(async () => {
    await chip.setup();
  });

  after(() => chip.teardown());

  const REMOVABLE = { removable: true, removeLabel: 'Remove Perception', onRemove: () => {} };

  for (const tag of ['button', 'a']) {
    it(`refuses tag="${tag}", because a control inside a control is invalid`, async () => {
      await assert.rejects(
        () => chip.mount({ ...REMOVABLE, tag }),
        /removable/u,
        'an operable host cannot carry a remove button; a DROPPED prop would render a chip that ' +
          'looks removable and is not'
      );
      chip.remount();
    });
  }

  it('refuses a control it cannot name, in every falsy spelling of "no name"', async () => {
    // `removeLabel` defaults to `undefined` rather than to `''` (issue 1515, after the
    // required-names gate), so BOTH spellings of an absent name reach this refusal and the
    // `aria-label={removeLabel || undefined}` guard is unreachable rather than a fallback.
    for (const removeLabel of ['', undefined, null]) {
      await assert.rejects(
        () => chip.mount({ ...REMOVABLE, removeLabel }),
        /removeLabel/u,
        `the glyph is aria-hidden, so a control named ${JSON.stringify(removeLabel)} is announced as nothing at all`
      );
      chip.remount();
    }
  });

  it('leaves NO reachable state in which the control renders an empty name', async () => {
    // The whole point of the refusal above, stated as the property it buys rather than as the
    // mechanism. An `aria-label=""` does not fall back to the element's content — it REPLACES
    // the name with nothing, so a rendered control carrying one is announced as an unnamed
    // button. The gate at `tests/design-system-required-names.test.js` polices the SPELLING
    // from the source; this polices the rendered result, which is the thing that matters and
    // the thing a future default — localized or not — would silently change.
    for (const removeLabel of ['', undefined, null]) {
      await assert.rejects(() => chip.mount({ ...REMOVABLE, removeLabel }));
      assert.ok(
        !document.querySelector('[data-chip-remove]'),
        `a chip with removeLabel ${JSON.stringify(removeLabel)} rendered a control anyway, which is the unnamed button this refusal exists to prevent`
      );
      chip.remount();
    }

    const target = await chip.mount(REMOVABLE);
    const name = target.querySelector('[data-chip-remove]').getAttribute('aria-label');
    assert.equal(name, 'Remove Perception', 'and a named control keeps the caller\u2019s name');
    assert.ok(name.length > 0, 'which is the property the source gate is a proxy for');
    chip.remount();
  });

  it('refuses a control that cannot act', async () => {
    await assert.rejects(
      () => chip.mount({ ...REMOVABLE, onRemove: null }),
      /onRemove/u,
      'a remove control with no handler is an affordance for an edit the screen cannot make'
    );
    chip.remount();
  });

  it('renders the same props on a `span` host without complaint', async () => {
    const target = await chip.mount(REMOVABLE);
    assert.ok(
      Boolean(target.querySelector('[data-chip-remove]')),
      'the refusals above are about the HOST, so the same props must be fine on the default one — ' +
        'otherwise every clause in this describe would pass on a prop that never worked'
    );
    chip.remount();
  });

  it('adds nothing at all to a chip that is not removable', async () => {
    const target = await chip.mount({});
    const node = target.querySelector('.manager-chip');

    assert.ok(!node.classList.contains('is-removable'), 'no state class');
    assert.ok(!node.querySelector('[data-chip-remove]'), 'no control');
    assert.ok(
      !node.querySelector('.manager-chip-label'),
      'and no wrapper around the snippet, so ninety-odd shipped call sites are byte-identical'
    );
    chip.remount();
  });
});

describe('1515 Chip — the geometry the specimen publishes', () => {
  it('states a 20px SQUARE hit box, at every density', () => {
    const rule = ruleFor('.manager-chip-remove');
    assert.match(rule, /width:\s*20px/u, 'the side the specimen publishes');
    assert.match(rule, /height:\s*20px/u);
    assert.match(
      rule,
      /min-height:\s*20px/u,
      'restated, because a column flex parent would otherwise collapse the square'
    );
    assert.match(rule, /padding:\s*0/u, 'equal insets, so the glyph sits centred in the square');
    assert.ok(
      styleBlock.search(/\.manager-chip-remove(?![\w-])/u) >
        styleBlock.search(/\.manager-chip\.is-list(?![\w-])/u),
      'written after every density rule, so the control keeps its side at all six: the density ' +
        'axis scales the badge you READ and never the control you PRESS'
    );
  });

  it('keeps the control out of the label’s clipping box', () => {
    assert.match(
      ruleFor('.manager-chip-remove'),
      /flex:\s*0 0 auto/u,
      'a truncating chip is a nowrap flex row with overflow hidden, so a control that could shrink ' +
        'would be pushed out of the visible box while staying in the DOM and in the tab order'
    );
    assert.match(
      ruleFor('.manager-chip.is-truncated .manager-chip-label'),
      /min-width:\s*0/u,
      'and the LABEL is what gives way: without this its automatic minimum size is its content ' +
        'width, so the label pushes rather than clips'
    );
  });

  it('insets the trailing edge through the spacing scale rather than a literal', () => {
    assert.match(
      ruleFor('.manager-chip.is-removable'),
      /padding-right:\s*var\(--fab-space-2xs\)/u,
      'the round control needs less trailing inset than a label does, and a raw pixel here would ' +
        'be a row on the spacing ratchet rather than a rung of the scale'
    );
  });

  it('paints hover and focus without stripping the focus ring', () => {
    const paint = styleBlock.search(/\.manager-chip-remove:hover(?![\w-])/u);
    assert.notEqual(paint, -1, 'the control states pointer and keyboard feedback of its own');
    const rule = styleBlock.slice(paint, styleBlock.indexOf('}', paint));
    assert.match(
      rule,
      /:focus-visible/u,
      'the keyboard half rides the same rule as the pointer half, so neither can be painted alone'
    );
    assert.match(rule, /var\(--fab-danger-text\)/u, 'the control says what it does before it does it');
    assert.ok(
      !/outline/u.test(rule),
      'the module focus pair is declared once at the module root; a primitive that stripped the ' +
        'ring here would take the keyboard affordance off the one control this prop adds'
    );
  });
});

describe('1515 Chip — the specimen and the shipped props are one API', () => {
  /**
   * Every name `Chip.svelte` destructures out of `$props()`, minus the rest spread and `children`.
   *
   * DERIVED rather than restated, for the reason `declaredTones()` in the characterization suite
   * is: a hand-copied list of fourteen prop names is a mirror, and a mirror of the specimen's own
   * subject rots into agreeing with nothing. `children` is excluded because it is the default
   * SNIPPET rather than an API the specimen enumerates, and `...rest` because the specimen states
   * it as a sentence rather than as a name.
   *
   * @returns {string[]}
   */
  function declaredProps() {
    const code = withoutComments(chipSource);
    const start = code.indexOf('let {');
    assert.notEqual(start, -1, 'Chip.svelte still destructures its props');
    const end = code.indexOf('} = $props();', start);
    assert.ok(end > start, 'and the destructure is closed');
    return code
      .slice(start + 'let {'.length, end)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('...'))
      .map((line) => /^([A-Za-z_$][\w$]*)/u.exec(line)?.[1])
      .filter((name) => Boolean(name) && name !== 'children');
  }

  /** The `<Chip>` entry's markup, from its `div.spec` to the next one. */
  function chipEntry() {
    const start = librarySource.indexOf('<div class="spec" data-status="shipped" data-status-Chip=');
    assert.notEqual(start, -1, 'library.html still carries a `<Chip>` entry declaring a status');
    const next = librarySource.indexOf('<div class="spec"', start + 1);
    return librarySource.slice(start, next === -1 ? librarySource.length : next);
  }

  it('declares the entry SHIPPED, which is a claim about the props below', () => {
    assert.match(
      chipEntry(),
      /data-status-Chip="shipped"/u,
      'an entry whose specimen states no Svelte API cannot read `shipped`, so the status and the ' +
        'clause below are one assertion split in two'
    );
  });

  it('names every shipped prop in the specimen’s Svelte API section', () => {
    const props = declaredProps();
    assert.ok(
      props.length >= 15,
      `the scan read ${props.length} props off the destructure, so it is not reading it and every ` +
        'name below would be compared against nothing'
    );

    const entry = chipEntry();
    const apiStart = entry.indexOf('<h5>Svelte API</h5>');
    assert.notEqual(apiStart, -1, 'the entry still carries a Svelte API section');
    const api = entry.slice(apiStart, entry.indexOf('</ul>', apiStart));
    const named = new Set([...api.matchAll(/<b>([A-Za-z]+)<\/b>/gu)].map(([, name]) => name));

    assert.deepEqual(
      props.filter((name) => !named.has(name)),
      [],
      'a prop the shipped component takes and the specimen does not name is the fidelity gap ' +
        '`shipped` denies exists. `spec.md` puts an entry at `target` until its API is written, ' +
        'so a prop added without its bullet leaves the status claiming a match to a specimen that ' +
        'never mentions it.'
    );
  });
});
