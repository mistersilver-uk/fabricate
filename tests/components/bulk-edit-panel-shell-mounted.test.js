/** The manager's ONE bulk edit panel chrome. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, before, after, afterEach } from 'node:test';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { FOUNDRY_BRIDGE_RAW_MODULES, LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const SHELL_PATH = 'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte';

const shell = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-bulk-edit-panel-shell-',
  rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
  compiledModules: [
    SHELL_PATH,
    'src/ui/svelte/components/Button.svelte',
    'src/ui/svelte/components/Notice.svelte',
  ],
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

/** A stand-in destructive action for the dock's foot. */
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
    assert.ok(
      !root.querySelector('[data-bulk-blocked], [data-bulk-report], .fab-notice'),
      'a panel given no blocked rows and no report drew a notice, so every bulk screen moved'
    );
    assert.equal(
      root.querySelector('[data-component-bulk-apply]').textContent.trim(),
      BASE.applyLabel,
      'the caller’s Apply label lost to a derived one'
    );
  });
});

/** Two rows Apply will skip, each with its already-localized reason. */
const BLOCKED = Object.freeze([
  { id: 'moonsilver', reason: 'Moonsilver is referenced by a locked compendium.' },
  { id: 'starmetal', reason: 'Starmetal is in use by a running craft.' },
]);

describe('BulkEditPanelShell lists blocked rows and reports the write (issue 1782)', () => {
  it('lists every blocked row with its reason BEFORE Apply', async () => {
    const root = await shell.mount({ ...BASE, subjectCount: 4, blocked: BLOCKED });

    const region = root.querySelector('[data-bulk-blocked]');
    assert.ok(Boolean(region), 'the blocked rows rendered nothing');
    assert.equal(
      region.querySelector('.fab-notice-title')?.textContent.trim(),
      '2 of 4 cannot be changed',
      'the notice does not state how many of the subject are skipped'
    );
    const rows = [...region.querySelectorAll('[data-bulk-blocked-row]')];
    assert.deepEqual(
      rows.map((row) => [row.getAttribute('data-bulk-blocked-row'), row.textContent.trim()]),
      BLOCKED.map(({ id, reason }) => [id, reason]),
      'each blocked row is listed once, in order, with its own reason'
    );
    const apply = root.querySelector('[data-component-bulk-apply]');
    assert.ok(
      Boolean(region.compareDocumentPosition(apply) & Node.DOCUMENT_POSITION_FOLLOWING),
      'the blocked rows render after Apply, so the GM reads them only once the write is done'
    );
  });

  it('names Apply by the records it writes to when the caller passes no label', async () => {
    const root = await shell.mount({
      ...BASE,
      applyLabel: '',
      subjectCount: 4,
      blocked: BLOCKED.slice(0, 1),
    });
    const apply = root.querySelector('[data-component-bulk-apply]');
    assert.equal(apply.textContent.trim(), 'Apply to 3', 'Apply counts the blocked row it skips');
    assert.ok(!apply.disabled, 'Apply is inert while three records still take the write');
  });

  it('keeps Apply inert when every record in the subject is blocked', async () => {
    const root = await shell.mount({ ...BASE, subjectCount: 2, blocked: BLOCKED });
    assert.ok(
      root.querySelector('[data-component-bulk-apply]').disabled,
      'Apply is live over a selection it cannot write to, so a no-op reads as success'
    );
  });

  it('reports what the write changed in place of the forecast', async () => {
    const report = { changed: 3, skipped: BLOCKED.slice(1) };
    const root = await shell.mount({ ...BASE, subjectCount: 4, blocked: BLOCKED, report });

    const region = root.querySelector('[data-bulk-report]');
    assert.ok(Boolean(region), 'the report rendered nothing');
    assert.ok(!root.querySelector('[data-bulk-blocked]'), 'the stale forecast outlived the write');
    assert.equal(region.querySelector('.fab-notice-title')?.textContent.trim(), 'Changed 3 of 4');
    assert.equal(
      region.querySelector('.fab-notice').getAttribute('data-notice-tone'),
      'warning',
      'a write that skipped a record reads as a clean success'
    );
    assert.deepEqual(
      [...region.querySelectorAll('[data-bulk-blocked-row]')].map((row) => row.textContent.trim()),
      [BLOCKED[1].reason],
      'the report lists the record the write skipped, with its reason'
    );
  });

  it('reports a clean write in the success tone', async () => {
    const root = await shell.mount({ ...BASE, subjectCount: 3, report: { changed: 3 } });
    const region = root.querySelector('[data-bulk-report]');
    assert.equal(region.querySelector('.fab-notice').getAttribute('data-notice-tone'), 'success');
    assert.ok(!region.querySelector('[data-bulk-blocked-row]'), 'a clean write listed a skip');
  });
});

describe('BulkEditPanelShell takes its per-site parameters (issue 1371)', () => {
  it('bleeds the dock to a --fab-space-4 container only when asked (dockBleed, M24)', async () => {
    // The dock's three negative bleeds are written as the SAME token as the container's padding
    // so the two cannot drift — and that token is `--fab-space-3`, the shared `.manager-inspector`
    // rail's. `EntityListInspectorFrame`'s inspector column pads `--fab-space-4`, so inside it the
    // dock stopped 4px short of each edge and its bottom (issue 1371 r16-cat, maintainer ruling
    // M24: "a padding/whitespace around the bulk edit panel that prevents the button panel from
    // being full-width"). `dockBleed="space-4"` restates all five declarations at that token.
    const plain = await shell.mount({ ...BASE });
    assert.ok(
      !plain.querySelector('.fab-bulk-edit-dock').classList.contains('is-bleed-space-4'),
      'unset, the dock is the shipped one — the three studios in the shared rail do not move'
    );
    shell.remount();
    const wide = await shell.mount({ ...BASE, dockBleed: 'space-4' });
    assert.ok(
      wide.querySelector('.fab-bulk-edit-dock').classList.contains('is-bleed-space-4'),
      'asked for, the dock wears the class its wider bleed is painted from'
    );
    // AND THE CLASS HAS A RULE BEHIND IT.
    const source = readFileSync(resolve(repoRoot, SHELL_PATH), 'utf8');
    const rule = /\.fab-bulk-edit-dock\.is-bleed-space-4\s*\{([^}]*)\}/.exec(source);
    assert.ok(rule, 'nothing paints the class the dock emits for the wider bleed');
    for (const declaration of [
      /bottom:\s*calc\(-1 \* var\(--fab-space-4\)\)/,
      /margin-inline:\s*calc\(-1 \* var\(--fab-space-4\)\)/,
      /margin-bottom:\s*calc\(-1 \* var\(--fab-space-4\)\)/,
      /padding-inline:\s*var\(--fab-space-4\)/,
      /padding-bottom:\s*var\(--fab-space-4\)/,
    ]) {
      assert.match(rule[1], declaration, 'all five of the dock`s container-bound declarations move together');
    }
  });

  it('renders the caller Clear label over the shipped phrase', async () => {
    // `proto:626` reads `Clear` where this panel reads `Clear selection`.
    const root = await shell.mount({ ...BASE, clearLabel: 'Clear' });
    const clear = root.querySelector('[data-component-bulk-clear]');
    assert.equal(clear.textContent.trim(), 'Clear', 'the caller label was ignored');
    // THE GLYPH SURVIVES THE SWAP. Replacing a label and deleting the `<i>` beside it look alike
    // in a diff, and `proto:626` draws the xmark.
    assert.ok(Boolean(clear.querySelector('i.fa-xmark')), 'Clear lost its leading glyph');
  });

  it('renders the caller hero sentence over the shipped one', async () => {
    // `proto:628` names the staging that panel actually offers.
    const copy = 'Pick the systems to add them to, stage a category or tags, then commit below.';
    const root = await shell.mount({ ...BASE, hint: copy });
    assert.equal(root.querySelector('.fab-bulk-edit-hero-hint').textContent.trim(), copy);
    // AND THE HEADING IS UNTOUCHED BY IT: the hero's two lines are different facts.
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

    // SIBLING, AND AFTER — both halves.
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

    // AND THE BASE DOCK RULE DOES NOT STATE IT.
    const base = /\.fab-bulk-edit-dock\s*\{([^}]*)\}/.exec(source);
    assert.ok(base, 'the dock still declares its own rule');
    assert.ok(
      !/display:\s*flex/.test(base[1]),
      'the unconditional dock rule took the column rhythm, so every shipped panel changed layout mode'
    );
  });
});
