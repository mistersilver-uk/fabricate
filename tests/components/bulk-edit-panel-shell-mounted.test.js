/**
 * The manager's ONE bulk edit panel chrome, and the three per-site parameters issue 1371 added
 * to it (gap-list rows 38, 39 and 47).
 *
 * `bulk-edit-dock-pinning.test.js` measures what this shell's dock DOES in a real browser — the
 * sticky construction, its three negative bleeds, and Apply staying inside the scrollport at
 * every scroll offset. What nothing pinned until now is what the shell EMITS, and that is the
 * half the three new parameters live in: each one either swaps a string the caller owns or adds
 * a child to a box the dock comment says must not be resized.
 *
 * EVERY ASSERTION IS WRITTEN IN BOTH DIRECTIONS, and that is the point of the file rather than
 * thoroughness for its own sake. The world Component catalogue is the only caller that opts in;
 * the Component, Recipe and Essence Studios pass none of the three and must render exactly what
 * they rendered before. A parameter that ignored its caller and one that quietly applied the
 * catalogue's face to everybody each satisfy one half of the pair and fail the other.
 *
 * `localize` is stubbed by the harness's Foundry shim and returns the key, so `text(key,
 * fallback)` resolves to the FALLBACK here. That is why the expected strings below are the
 * fallbacks written in the component rather than the values in `lang/en.json`; the two are the
 * same English, and `tests/ui-lang-keys-resolve.test.js` is what pins that they stay so.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, before, after, afterEach } from 'node:test';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const SHELL_PATH = 'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte';

const shell = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-bulk-edit-panel-shell-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: [SHELL_PATH, 'src/ui/svelte/components/ManagerButton.svelte'],
  componentPath: SHELL_PATH
});

before(async () => {
  await shell.setup();
});
after(() => {
  shell.teardown();
});
afterEach(() => {
  shell.remount();
});

/**
 * A stand-in destructive action for the dock's foot.
 *
 * `createRawSnippet` is imported by PATH and not from the bare `svelte` specifier: the harness
 * drives the compiled components with the client runtime at `node_modules/svelte/src/
 * index-client.js`, and a snippet built from a second copy of that runtime is a different type
 * the component refuses to render. `bulk-edit-dock-pinning.test.js` is the precedent.
 */
const dockFootSnippet = createRawSnippet(() => ({
  render: () => '<button type="button" data-danger="">Delete 3 components</button>'
}));

const BASE = Object.freeze({
  heading: '3 components selected',
  applyLabel: 'Apply to 3 components',
  canApply: true
});

describe('BulkEditPanelShell renders the shipped chrome when it is asked for nothing', () => {
  it('keeps the shipped Clear phrase, hero copy and single-child dock', async () => {
    const root = await shell.mount({ ...BASE });

    assert.equal(
      root.querySelector('[data-component-bulk-clear]').textContent.trim(),
      'Clear selection',
      'the shipped header action reads `Clear selection`, and three studios render it'
    );
    assert.equal(
      root.querySelector('.fab-bulk-edit-hero-hint').textContent.trim(),
      'Stage changes below, then apply to all at once.',
      'the shipped hero states the noun-free standing sentence'
    );

    const dock = root.querySelector('.fab-bulk-edit-dock');
    assert.ok(Boolean(dock), 'the dock still renders');
    assert.ok(
      !dock.classList.contains('has-foot'),
      'the dock claims a foot it has not been given, so it takes a column rhythm three studios never asked for'
    );
    assert.equal(
      dock.querySelectorAll('button, a').length,
      1,
      'the shipped dock holds Apply and nothing else'
    );
  });
});

describe('BulkEditPanelShell takes its three per-site parameters (issue 1371)', () => {
  it('renders the caller Clear label over the shipped phrase', async () => {
    // `proto:626` reads `Clear` where this panel reads `Clear selection` — the action sits under
    // a `BULK EDIT` eyebrow in a rail showing nothing but the selection, so `selection` is the
    // only thing it could be clearing.
    const root = await shell.mount({ ...BASE, clearLabel: 'Clear' });
    const clear = root.querySelector('[data-component-bulk-clear]');
    assert.equal(clear.textContent.trim(), 'Clear', 'the caller label was ignored');
    // THE GLYPH SURVIVES THE SWAP. Replacing a label and deleting the `<i>` beside it look alike
    // in a diff, and `proto:626` draws the xmark.
    assert.ok(Boolean(clear.querySelector('i.fa-xmark')), 'Clear lost its leading glyph');
  });

  it('renders the caller hero sentence over the shipped one', async () => {
    // `proto:628` names the staging that panel actually offers, where the shell's default is
    // deliberately noun-free because it is shared by four screens.
    const copy = 'Pick the systems to add them to, stage a category or tags, then commit below.';
    const root = await shell.mount({ ...BASE, hint: copy });
    assert.equal(root.querySelector('.fab-bulk-edit-hero-hint').textContent.trim(), copy);
    // AND THE HEADING IS UNTOUCHED BY IT: the hero's two lines are different facts, and a
    // parameter that overwrote both would silently delete the count from the rail.
    assert.equal(
      root.querySelector('[data-component-bulk-count]').textContent.trim(),
      BASE.heading,
      'the hero title is the caller’s count sentence and is not part of this parameter'
    );
  });

  it('renders a dockFoot snippet INSIDE the dock, under Apply', async () => {
    // `proto:791-796` puts the destructive action and its consequence note in the same bordered,
    // pinned foot as the primary action — not above it and not in the scrolling body. WHERE it
    // renders is the whole ruling, so position is asserted rather than mere presence.
    const root = await shell.mount({
      ...BASE,
      dockFoot: dockFootSnippet
    });

    const dock = root.querySelector('.fab-bulk-edit-dock');
    const danger = root.querySelector('[data-danger]');
    assert.ok(Boolean(danger), 'the dockFoot snippet rendered nothing at all');
    assert.ok(dock.contains(danger), 'the snippet rendered outside the dock it names');

    // SIBLING, AND AFTER — both halves, because `compareDocumentPosition` reports a node
    // rendered INSIDE Apply as following it too, and a snippet that landed in the button's
    // own children would satisfy an order-only assertion while drawing a button in a button.
    const apply = root.querySelector('[data-component-bulk-apply]');
    assert.ok(!apply.contains(danger), 'the snippet rendered INSIDE Apply rather than beside it');
    assert.ok(
      Boolean(apply.compareDocumentPosition(danger) & Node.DOCUMENT_POSITION_FOLLOWING),
      'the destructive action renders BEFORE Apply, where the reference puts it after'
    );
    assert.ok(dock.firstElementChild === apply, 'Apply is no longer the dock’s first control');
    assert.ok(dock.lastElementChild === danger, 'the foot is no longer the dock’s last child');
    assert.ok(
      dock.classList.contains('has-foot'),
      'the dock takes no column rhythm, so its two children have no gap between them'
    );
  });

  it('states the dock’s gated column rhythm as a real rule in its own scoped block', () => {
    // A `class:` directive with no selector behind it renders identically to one with a broken
    // selector, and this rule cannot be written anywhere else: `styles/fabricate.css` ships at
    // `layer(modules)` and this component's block is injected unlayered, so a rule there is
    // emitted, matches, and has its declarations silently discarded.
    const source = readFileSync(resolve(repoRoot, SHELL_PATH), 'utf8');
    const rule = /\.fab-bulk-edit-dock\.has-foot\s*\{([^}]*)\}/.exec(source);
    assert.ok(rule, 'nothing paints the class the dock emits when it is given a foot');
    assert.match(rule[1], /display:\s*flex/);
    assert.match(rule[1], /flex-direction:\s*column/);
    assert.match(
      rule[1],
      /gap:\s*var\(--fab-space-2\)/,
      '`proto:791` draws the foot on an 8px column rhythm, and --fab-space-2 IS 8px'
    );

    // AND THE BASE DOCK RULE DOES NOT STATE IT, which is what keeps the three shipped studios
    // out of this change: with one child the two display modes are not obviously identical,
    // because Apply carries a `margin-top` whose behaviour is a block-flow question in one mode
    // and not a question at all in the other.
    const base = /\.fab-bulk-edit-dock\s*\{([^}]*)\}/.exec(source);
    assert.ok(base, 'the dock still declares its own rule');
    assert.ok(
      !/display:\s*flex/.test(base[1]),
      'the unconditional dock rule took the column rhythm, so every shipped panel changed layout mode'
    );
  });
});
