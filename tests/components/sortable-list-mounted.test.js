/**
 * The ordered row, mounted (issue 1512).
 *
 * Five of this primitive's obligations are only observable from a rendered tree, and every one of
 * them is a rule the design-system capability states rather than a detail of this component:
 *
 *  - STATE IS KEYED BY RECORD ID. `expandedId` is bindable and the list reads `item.id` itself, so
 *    a caller round-tripping a REORDERED array of the same ids must leave the open row open — the
 *    thing a positional key silently gets wrong on every reorder.
 *  - THE COLLAPSED BODY IS RETAINED. The maintainer ruled KEEP on 2026-09-09: the body stays in
 *    the DOM, carries `hidden` and `inert`, holds what was typed into it, and its controls leave
 *    the tab order. `inert` is what the tab-order half is witnessed through, because happy-dom
 *    honours `inert` for `focus()` and does NOT apply a UA `[hidden]` rule; the `display: none`
 *    half is a SOURCE assertion over `styles/fabricate.css`, since this harness never loads it.
 *  - THE KEYBOARD MOVE READS THE NAME FIRST, MOVES FOCUS, THEN ANNOUNCES. All three are ordering
 *    facts about one interaction, and none of them is visible in a frame.
 *  - BOTH AFFORDANCES RENDER IN EVERY MODE, disabled at the ends rather than hidden.
 *  - THE DRAGGING ROW SAYS SO. The View Lab has no drag verb, so this is the only place the
 *    travelling state can be asserted at all.
 *
 * ── WHY THE SNIPPETS ARE BUILT WITH `createRawSnippet` ────────────────────────────────────
 * Three of this component's props are snippets, and a test cannot write Svelte template syntax.
 * `createRawSnippet` is imported BY PATH rather than from the bare `svelte` specifier, because the
 * harness drives the compiled component with the client runtime at
 * `node_modules/svelte/src/index-client.js` and a snippet built from a second copy of that runtime
 * is a different type the component refuses to render.
 */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createRawSnippet,
  flushSync,
} from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-sortable-list-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/RowDisclosure.svelte',
    'src/ui/svelte/components/SortableList.svelte',
  ],
  componentPath: 'src/ui/svelte/components/SortableList.svelte',
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const ITEMS = Object.freeze([
  Object.freeze({ id: 'a', name: 'Draw the billet' }),
  Object.freeze({ id: 'b', name: 'Fold and quench' }),
  Object.freeze({ id: 'c', name: 'Oil the blade' }),
]);

const itemLabel = (item) => item?.name ?? '';

/** A row body carrying one focusable control and one typeable field. */
const bodySnippet = createRawSnippet(() => ({
  render: () =>
    '<div><input data-body-field type="text" /><button type="button" data-body-action>Edit</button></div>',
}));

/** The row's own content, so the list is rendering something between badge and rocker. */
const rowSnippet = createRawSnippet(() => ({
  render: () => '<span data-row-copy>copy</span>',
}));

const footerSnippet = createRawSnippet(() => ({
  render: () => '<li data-list-footer><button type="button">Add one</button></li>',
}));

const rowsOf = (target) => [...target.querySelectorAll('.fabricate-sortable-list-row')];
const bodyOf = (row) => row.querySelector('.fabricate-sortable-list-body');
const gripOf = (row) => row.querySelector('[data-sortable-grip]');

/** A keydown as a real one arrives: bubbling, cancellable, and carrying the key. */
function press(element, key) {
  element.dispatchEvent(
    new globalThis.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  );
  flushSync();
}

describe('SortableList — the row is the shape the specimen draws', () => {
  it('draws the grip, the ordinal badge, the leading disclosure and the trailing rocker', async () => {
    const target = await harness.mount({
      items: ITEMS,
      itemLabel,
      numbered: true,
      handles: true,
      removable: true,
      expandable: true,
      row: rowSnippet,
      body: bodySnippet,
      footer: footerSnippet,
    });

    const [first] = rowsOf(target);
    assert.equal(first.tagName, 'LI', 'the row is a list item, not a button');
    assert.ok(Boolean(gripOf(first)), 'it draws the drag grip');
    assert.equal(
      first.querySelector('.fabricate-sortable-list-ordinal').textContent.trim(),
      '1',
      'and the numbered badge, which is what makes order legible once the list scrolls'
    );

    // POSITION IS THE CONTRACT, not decoration: the disclosure sits LEADING and the rocker
    // TRAILING, so the two chevron pairs are never adjacent and cannot be mistaken for each other.
    const disclosure = first.querySelector('[data-sortable-disclosure]');
    const copy = first.querySelector('[data-row-copy]');
    const rocker = first.querySelector('.fabricate-sortable-list-rocker');
    assert.ok(
      disclosure.compareDocumentPosition(copy) & globalThis.Node.DOCUMENT_POSITION_FOLLOWING,
      'the disclosure precedes the row`s own copy'
    );
    assert.ok(
      copy.compareDocumentPosition(rocker) & globalThis.Node.DOCUMENT_POSITION_FOLLOWING,
      'and the rocker follows it'
    );

    assert.ok(Boolean(target.querySelector('[data-list-footer]')), 'the adder is the list`s footer');
  });

  it('renders both affordances in EVERY mode, disabled at the ends rather than hidden', async () => {
    for (const mode of [
      { label: 'plain', props: {} },
      { label: 'expandable', props: { expandable: true, body: bodySnippet } },
      { label: 'always-open', props: { alwaysOpen: true, body: bodySnippet } },
    ]) {
      const target = await harness.mount({
        items: ITEMS,
        itemLabel,
        numbered: true,
        handles: true,
        row: rowSnippet,
        ...mode.props,
      });
      const rows = rowsOf(target);
      const up = rows.map((row) => row.querySelector('[data-sortable-move="up"]'));
      const down = rows.map((row) => row.querySelector('[data-sortable-move="down"]'));

      assert.ok(rows.every((row) => Boolean(gripOf(row))), `${mode.label}: every row grips`);
      assert.ok(up.every(Boolean) && down.every(Boolean), `${mode.label}: every row rockers`);
      assert.ok(up[0].disabled, `${mode.label}: the first row cannot move up`);
      assert.ok(down[2].disabled, `${mode.label}: the last row cannot move down`);
      assert.ok(
        !up[2].disabled && !down[0].disabled,
        `${mode.label}: the chevron that CAN move is live, so the pair reads as a range`
      );
      harness.remount();
    }
  });

  it('draws NEITHER affordance when the list does not order', async () => {
    // A handle the surface does not honour is a promise it does not keep. Five of the six recipe
    // step callers and the composition list's unranked branch depend on this.
    const target = await harness.mount({
      items: ITEMS,
      itemLabel,
      numbered: true,
      handles: true,
      reorderable: false,
      row: rowSnippet,
    });
    const [first] = rowsOf(target);
    assert.ok(!gripOf(first), 'no grip');
    assert.ok(!first.querySelector('[data-sortable-move]'), 'and no rocker');
    assert.ok(!first.getAttribute('draggable'), 'and the row is not a drag source either');
    assert.ok(
      Boolean(first.querySelector('.fabricate-sortable-list-ordinal')),
      'the numbered badge stays, because the order is still the meaning even where it is fixed'
    );
  });

  it('declares every control it renders focused to Foundry', async () => {
    const target = await harness.mount({
      items: ITEMS,
      itemLabel,
      numbered: true,
      handles: true,
      removable: true,
      expandable: true,
      row: rowSnippet,
      body: bodySnippet,
    });
    const line = rowsOf(target)[0].querySelector('.fabricate-sortable-list-line');
    const controls = [...line.querySelectorAll('button')];
    assert.ok(controls.length >= 5, `expected the row's five controls, got ${controls.length}`);
    for (const control of controls) {
      assert.equal(
        control.getAttribute('data-keyboard-focus'),
        'true',
        `${control.getAttribute('aria-label')} must declare itself, or Foundry keeps its ` +
          'Space/arrow bindings live and the canvas pans behind the window'
      );
      assert.equal(control.getAttribute('type'), 'button', 'and must not submit an enclosing form');
    }
  });
});

describe('SortableList — disclosure state is keyed by record id', () => {
  it('keeps the OPEN row open across a reorder that changes every position', async () => {
    const target = await harness.mount({
      items: ITEMS,
      itemLabel,
      expandable: true,
      row: rowSnippet,
      body: bodySnippet,
    });

    target.querySelector('[data-sortable-disclosure="b"]').click();
    flushSync();
    assert.equal(
      target.querySelector('[data-sortable-disclosure="b"]').getAttribute('aria-expanded'),
      'true',
      'the row opens'
    );

    // TYPED INTO THE OPEN ROW'S RETAINED BODY, which is what makes the `{#each}` KEY load-bearing
    // here as well as the disclosure state. Keyed by index, Svelte reuses the DOM node that sits
    // at each POSITION, so an uncommitted edit follows the position rather than the record — and
    // the GM finds what they typed about `b` sitting in `c`'s body.
    const rowB = () =>
      [...target.querySelectorAll('.fabricate-sortable-list-row')].find((row) =>
        row.querySelector('[data-sortable-disclosure="b"]')
      );
    rowB().querySelector('[data-body-field]').value = 'belongs to b';

    // A REORDERED ARRAY OF THE SAME IDS, with different object identities — which is what a
    // caller that round-trips through its store hands back. Keyed by index, the open row would be
    // whichever record now sits where `b` used to.
    await harness.setProps({
      items: [
        { id: 'c', name: 'Oil the blade' },
        { id: 'a', name: 'Draw the billet' },
        { id: 'b', name: 'Fold and quench' },
      ],
    });
    flushSync();

    assert.equal(
      target.querySelector('[data-sortable-disclosure="b"]').getAttribute('aria-expanded'),
      'true',
      'and it is still open after the move, because the state followed its ID rather than its ' +
        'position'
    );
    assert.equal(
      target.querySelector('[data-sortable-disclosure="a"]').getAttribute('aria-expanded'),
      'false',
      'and no other row opened under it'
    );
    assert.equal(
      rowB().querySelector('[data-body-field]').value,
      'belongs to b',
      'and the uncommitted edit is still in the row it was typed into, because the rows are keyed ' +
        'by record id rather than by position'
    );
  });
});

describe('SortableList — a collapsed body is retained and inert (maintainer ruling)', () => {
  it('keeps the body in the DOM, hidden and inert, with its controls out of the tab order', async () => {
    const target = await harness.mount({
      items: ITEMS,
      itemLabel,
      expandable: true,
      row: rowSnippet,
      body: bodySnippet,
    });

    const [first] = rowsOf(target);
    const body = bodyOf(first);
    assert.ok(Boolean(body), 'the collapsed body EXISTS rather than being unmounted');
    assert.ok(body.hasAttribute('hidden'), 'and carries `hidden`');
    assert.ok(body.hasAttribute('inert'), 'and `inert`');

    // THE TAB-ORDER HALF, witnessed through `inert` and not through `hidden`: happy-dom honours
    // `inert` for `focus()` and applies no UA `[hidden]` rule, which is measured rather than
    // assumed. A computed-style assertion is impossible here for the same reason — this harness
    // never loads `styles/fabricate.css` — so the `display: none` half is the source read below.
    const outside = target.querySelector('[data-sortable-disclosure="a"]');
    outside.focus();
    const control = body.querySelector('[data-body-action]');
    control.focus();
    assert.ok(
      globalThis.document.activeElement === outside,
      'focus did not move into the collapsed body, so its controls have left the tab order'
    );
  });

  it('holds what was typed into it across a collapse and re-expand', async () => {
    // THE WHOLE REASON THE RULING WENT THIS WAY. Unmounting discards uncommitted field state;
    // retention holds it, and a GM who collapses a row mid-edit does not lose the edit.
    const target = await harness.mount({
      items: ITEMS,
      itemLabel,
      expandable: true,
      row: rowSnippet,
      body: bodySnippet,
    });

    target.querySelector('[data-sortable-disclosure="a"]').click();
    flushSync();
    const field = bodyOf(rowsOf(target)[0]).querySelector('[data-body-field]');
    field.value = 'half-written';

    target.querySelector('[data-sortable-disclosure="a"]').click();
    flushSync();
    assert.ok(bodyOf(rowsOf(target)[0]).hasAttribute('hidden'), 'the row collapses');

    target.querySelector('[data-sortable-disclosure="a"]').click();
    flushSync();
    assert.equal(
      bodyOf(rowsOf(target)[0]).querySelector('[data-body-field]').value,
      'half-written',
      'and what was typed is still there'
    );
  });

  it('declares `display: none` for the hidden body in the sheet, which the harness cannot load', () => {
    const sheet = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
    const start = sheet.indexOf('.fabricate-sortable-list-body[hidden] {');
    assert.notEqual(start, -1, 'the sheet no longer states what a hidden body draws');
    assert.match(
      sheet.slice(start, sheet.indexOf('}', start)),
      /display:\s*none/u,
      'a retained body is HIDDEN rather than merely unlabelled; Foundry`s own reset sets ' +
        '`display` on generic elements, so the UA `[hidden]` rule alone would lose to it'
    );
  });
});

describe('SortableList — reorder answers both inputs', () => {
  it('moves a row from the grip, follows it with focus, and announces AFTER the focus lands', async () => {
    const moves = [];
    let items = [...ITEMS];
    const target = await harness.mount({
      items,
      itemLabel,
      numbered: true,
      handles: true,
      row: rowSnippet,
      onReorder: (from, to) => {
        moves.push([from, to]);
        const next = [...items];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        items = next;
      },
    });

    const region = target.querySelector('[data-sortable-list-status]');
    assert.ok(Boolean(region), 'the list renders its own polite live region');
    assert.equal(region.getAttribute('aria-live'), 'polite');
    assert.equal(region.textContent.trim(), '', 'which says nothing before a move');

    press(gripOf(rowsOf(target)[2]), 'ArrowUp');
    await harness.setProps({ items });
    flushSync();

    assert.deepEqual(moves, [[2, 1]], 'ArrowUp moves the row one position');
    assert.deepEqual(
      rowsOf(target).map((row) => row.querySelector('[data-sortable-grip]').getAttribute('data-sortable-grip')),
      ['a', 'c', 'b'],
      'and the caller`s round-tripped array is what the list renders'
    );

    // FOCUS FOLLOWS THE ROW, keyed by record id rather than by index: after the move, index 1 is
    // a different record and focus left where it was would be on the row that swapped in.
    assert.equal(
      globalThis.document.activeElement.getAttribute('data-sortable-grip'),
      'c',
      'focus followed the row that moved'
    );
    assert.match(
      region.textContent,
      /Oil the blade/u,
      'and the announcement names the row, read BEFORE the caller round-tripped the array'
    );
    assert.match(region.textContent, /(position 2 of 3|"position":"2")/u, 'with its new position');
  });

  it('emits nothing at the ends rather than a no-op reorder', async () => {
    const moves = [];
    const target = await harness.mount({
      items: ITEMS,
      itemLabel,
      handles: true,
      row: rowSnippet,
      onReorder: (from, to) => moves.push([from, to]),
    });
    press(gripOf(rowsOf(target)[0]), 'ArrowUp');
    press(gripOf(rowsOf(target)[2]), 'ArrowDown');
    press(gripOf(rowsOf(target)[1]), 'Enter');
    assert.deepEqual(moves, [], 'a move that changes nothing, and a key that is not a move, write nothing');
  });

  it('writes the travelling state on the row being dragged', async () => {
    // THE ONE STATE NO FRAME CAN REACH: the View Lab has no drag verb, so this assertion is the
    // whole evidence that a GM can see which row is in the air.
    const moves = [];
    const target = await harness.mount({
      items: ITEMS,
      itemLabel,
      handles: true,
      row: rowSnippet,
      onReorder: (from, to) => moves.push([from, to]),
    });

    const rows = rowsOf(target);
    rows[2].dispatchEvent(new globalThis.Event('dragstart', { bubbles: true }));
    flushSync();
    assert.ok(
      rowsOf(target)[2].classList.contains('is-dragging'),
      'the row being dragged paints itself as travelling'
    );
    assert.ok(
      !rowsOf(target)[0].classList.contains('is-dragging'),
      'and no other row does'
    );

    rows[0].dispatchEvent(new globalThis.Event('drop', { bubbles: true, cancelable: true }));
    flushSync();
    assert.deepEqual(moves, [[2, 0]], 'the row lands where it was dropped');
    assert.ok(
      !rowsOf(target)[0].classList.contains('is-dragging'),
      'and the travelling state is cleared'
    );
  });
});

describe('SortableList — the caller keeps its own state and hooks on the row', () => {
  it('writes the caller`s per-record classes and data attributes onto the row element', async () => {
    // The row element is the PRIMITIVE'S, so without these a converted caller cannot show which
    // record is selected, and every per-record hook its mounted drivers address a row by would
    // have nowhere to live.
    const target = await harness.mount({
      items: ITEMS,
      itemLabel,
      row: rowSnippet,
      rowClass: (item) => (item.id === 'b' ? 'is-selected is-diagnostic' : ''),
      rowData: (item) => ({ 'data-record-id': item.id, 'data-runtime-state': 'available' }),
    });

    const rows = rowsOf(target);
    assert.ok(rows[1].classList.contains('is-selected'), 'the caller`s state class rides the row');
    assert.ok(rows[1].classList.contains('is-diagnostic'), 'and so does a second one');
    assert.ok(!rows[0].classList.contains('is-selected'), 'per RECORD, not per list');
    assert.equal(rows[0].getAttribute('data-record-id'), 'a', 'and its data hooks with it');
    assert.equal(rows[0].getAttribute('data-runtime-state'), 'available');
    assert.ok(
      rows[0].classList.contains('fabricate-sortable-list-row'),
      'without displacing the primitive`s own root class'
    );
  });
});
