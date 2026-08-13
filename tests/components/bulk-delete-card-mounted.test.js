/**
 * `BulkDeleteCard` mounted, in isolation (issue 1132).
 *
 * The card was extracted because five behaviours had been implemented once, implemented twice
 * and were about to be implemented a third time — zero-row gating, the description
 * association, the live region, the label-in-name rule and the busy state. The studios' own
 * suites prove each studio still WIRES the card; this file is what proves the behaviours
 * themselves, once, so a fourth studio inherits them rather than re-deriving them.
 *
 * Two of them are cheap to get wrong in ways no studio suite would see:
 *
 *  - THE SUBJECT ROW IS EXEMPT FROM THE ZERO GATE. Gate all the rows and a fully stale
 *    selection renders a heading, no rows, and a disabled button with nothing on screen saying
 *    why — on either studio that carries no standing hint, which is both of the converted ones.
 *  - THE BUSY FACE IS NOT DERIVED FROM `armed`. Disabling a focused button fires blur in
 *    Chromium and Firefox, `ArmedDangerButton` disarms on blur, and happy-dom does not fire
 *    that blur at all. So the state a real browser produces mid-write — `busy` true and `armed`
 *    already false — is a state happy-dom will never reach on its own, and a suite that only
 *    clicked its way there would pass on an implementation that reads `Delete 3 recipes` for
 *    the whole write. It is therefore asserted DIRECTLY, as props, plus a blur dispatched by
 *    hand: between them they reproduce both halves of the browser behaviour the engine omits.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const CARD_PATH = 'src/ui/svelte/apps/manager/BulkDeleteCard.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-bulk-delete-card-',
  compiledModules: ['src/ui/svelte/apps/manager/ArmedDangerButton.svelte', CARD_PATH],
  componentPath: CARD_PATH,
});

/**
 * The Recipe Studio's shape — three rows, a standing hint and all three faces — because it is
 * the caller that exercises every prop. The two converted studios are narrower cases of it.
 */
function props(overrides = {}) {
  return {
    token: 'delete-recipes',
    heading: 'Delete selected recipes',
    rows: [
      { key: 'recipes', text: '3 recipes will be deleted.' },
      { key: 'items', text: '2 books & scrolls will lose them.', count: 2 },
      { key: 'learners', text: '4 characters will forget them.', count: 4 },
    ],
    standingHint: 'Deleting is permanent. A recipe you recreate is a new recipe.',
    idleLabel: 'Delete 3 recipes',
    armedLabel: 'Confirm delete',
    busyLabel: 'Deleting…',
    idleAriaLabel: 'Delete 3 recipes',
    armedAriaLabel: 'Confirm delete — 3 recipe(s) affected. This cannot be undone.',
    armedAnnouncement: 'Delete armed. Activate again to delete 3 recipe(s).',
    cardAttr: 'data-recipe-bulk-delete-card',
    impactAttr: 'data-recipe-bulk-impact',
    rowAttr: 'data-recipe-bulk-impact-row',
    announceAttr: 'data-recipe-bulk-delete-announce',
    ...overrides,
  };
}

const card = (root) => root.querySelector('[data-recipe-bulk-delete-card]');
const button = (root) => card(root).querySelector('.manager-button.is-danger');
const row = (root, key) => card(root).querySelector(`[data-recipe-bulk-impact-row="${key}"]`);
const live = (root) => card(root).querySelector('[data-recipe-bulk-delete-announce]');

before(async () => {
  await harness.setup();
});

after(() => harness.teardown());

describe('1132 BulkDeleteCard — the impact statement', () => {
  it('renders every row it is given, with its key as the hook VALUE', async () => {
    // The per-row hook is VALUED, not bare, and four suites query it by key. A `rows: string[]`
    // prop could not have emitted it, which is why the shape is `{ key, text }`.
    const root = await harness.mount(props());

    assert.equal(row(root, 'recipes').textContent.trim(), '3 recipes will be deleted.');
    assert.equal(row(root, 'items').textContent.trim(), '2 books & scrolls will lose them.');
    assert.equal(row(root, 'learners').textContent.trim(), '4 characters will forget them.');
    harness.remount();
  });

  it('omits a consequence row whose count is zero', async () => {
    const root = await harness.mount(
      props({
        rows: [
          { key: 'recipes', text: '3 recipes will be deleted.' },
          { key: 'items', text: '0 books & scrolls will lose them.', count: 0 },
          { key: 'learners', text: '4 characters will forget them.', count: 4 },
        ],
      })
    );

    assert.ok(!row(root, 'items'), 'a nought is noise, and it buries the number that matters');
    assert.ok(Boolean(row(root, 'learners')), 'while a non-zero sibling is untouched');
    assert.ok(
      !card(root).textContent.includes('0 '),
      'and no stray zero survives anywhere in the card'
    );
    harness.remount();
  });

  it('ALWAYS renders the subject row, even at zero, and even with every consequence gated', async () => {
    // The exemption is the whole reason the gate lives here rather than in three callers. A
    // fully stale selection is reachable on both converted studios, neither of which carries a
    // standing hint, and without this the GM gets a heading, no rows and a dead button.
    const root = await harness.mount(
      props({
        standingHint: '',
        rows: [
          { key: 'recipes', text: '0 recipes will be deleted.', count: 0 },
          { key: 'items', text: '0 books & scrolls will lose them.', count: 0 },
          { key: 'learners', text: '0 characters will forget them.', count: 0 },
        ],
      })
    );

    assert.equal(
      row(root, 'recipes').textContent.trim(),
      '0 recipes will be deleted.',
      'the subject row states what the button does and is exempt from its own gate'
    );
    assert.ok(!row(root, 'items'), 'while the consequence rows are still gated away');
    assert.ok(!row(root, 'learners'));
    harness.remount();
  });

  it('renders a countless row unconditionally, so a caller that pre-filters needs no count', async () => {
    const root = await harness.mount(
      props({
        rows: [
          { key: 'recipes', text: '3 recipes will be deleted.' },
          { key: 'items', text: 'Some books & scrolls will lose them.' },
        ],
      })
    );
    assert.ok(Boolean(row(root, 'items')), 'no `count` means the caller has already decided');
    harness.remount();
  });

  it('renders the standing hint whenever it has one, and nothing when it does not', async () => {
    // A property, not a count: it is what keeps the card from degrading to a bare heading and
    // an arm when every consequence row is gated away.
    const withHint = await harness.mount(props());
    assert.match(card(withHint).textContent, /Deleting is permanent/);
    harness.remount();

    const withoutHint = await harness.mount(props({ standingHint: '' }));
    assert.ok(
      !/Deleting is permanent/.test(card(withoutHint).textContent),
      'the two converted studios pass no hint and must render no empty paragraph'
    );
    harness.remount();
  });
});

describe('1132 BulkDeleteCard — the accessibility wiring', () => {
  it('associates the impact list with the control, by an id DERIVED from the token', async () => {
    // Proximity is not association. And the id cannot be a literal: one component now renders
    // in three panels, and a manager view can hold more than one card at a time, so two cards
    // with a hardcoded id would have the second's button describing the first's list.
    const root = await harness.mount(props());
    const described = button(root).getAttribute('aria-describedby');

    assert.ok(described, 'the button names a description');
    assert.match(described, /^delete-recipes-/, 'stemmed from the arm token');
    const list = card(root).querySelector(`#${described}`);
    assert.ok(Boolean(list), 'which resolves to an element inside the card');
    assert.equal(list.getAttribute('data-recipe-bulk-impact'), '');

    // The derivation, proved by moving the token rather than by reading the source: a hardcoded
    // id would be unchanged here, and two such cards would collide in one document.
    await harness.setProps(props({ token: 'delete-components' }));
    const moved = button(root).getAttribute('aria-describedby');
    assert.notEqual(moved, described, 'a second card under a different token gets a different id');
    assert.match(moved, /^delete-components-/);
    harness.remount();
  });

  it('renders the live region empty on mount, outside the control', async () => {
    // Both halves are load-bearing: a region inserted into the DOM together with its text is
    // not announced by most screen readers, and a region inside a control whose own accessible
    // name is changing is unreliable.
    const root = await harness.mount(props());
    const region = live(root);

    assert.ok(Boolean(region), 'the armed state has a live region');
    assert.equal(region.getAttribute('aria-live'), 'polite');
    assert.equal(region.textContent.trim(), '', 'which says nothing while the control is idle');
    assert.ok(!button(root).contains(region), 'and it sits outside the button, not within it');
    harness.remount();
  });

  it('announces the consequence when armed, and falls silent on disarm', async () => {
    const root = await harness.mount(props());
    await harness.setProps(props({ armed: true }));
    assert.match(live(root).textContent, /Activate again to delete 3 recipe\(s\)/);

    await harness.setProps(props({ armed: false }));
    assert.equal(
      live(root).textContent.trim(),
      '',
      'a caller that supplies no disarm sentence keeps the old silence, so the two converted studios are unchanged unless they opt in'
    );
    harness.remount();
  });

  // ESCAPE AND CLICK-AWAY BOTH DISARM WHILE THE BUTTON HOLDS FOCUS, changing its accessible
  // name under it — which is the exact condition this region exists for. Emptying a region
  // announces nothing, so the one gesture that CANCELS a destructive action was the only one
  // that said nothing at all (issue 1132, review round).
  it('announces the CANCELLATION on disarm when the caller supplies the sentence', async () => {
    const cancelled = props({ disarmedAnnouncement: 'Delete cancelled. Nothing was deleted.' });
    const root = await harness.mount(cancelled);

    assert.equal(live(root).textContent.trim(), '', 'and says nothing on mount, never armed');

    await harness.setProps({ ...cancelled, armed: true });
    assert.match(live(root).textContent, /Activate again/);

    await harness.setProps({ ...cancelled, armed: false });
    assert.equal(live(root).textContent.trim(), 'Delete cancelled. Nothing was deleted.');

    await harness.setProps({ ...cancelled, armed: true });
    assert.match(live(root).textContent, /Activate again/, 'and a RE-arm still announces');
    harness.remount();
  });

  it('does NOT read a confirmed delete as a cancellation', async () => {
    // The trap in tracking "was armed": confirming takes the control armed → busy → idle, so
    // a naive trailing-idle rule announces "Delete cancelled." over a delete that happened.
    const cancelled = props({ disarmedAnnouncement: 'Delete cancelled. Nothing was deleted.' });
    const root = await harness.mount({ ...cancelled, armed: true });
    assert.match(live(root).textContent, /Activate again/);

    await harness.setProps({ ...cancelled, armed: true, busy: true });
    assert.equal(live(root).textContent.trim(), '', 'the region is emptied while the write runs');

    await harness.setProps({ ...cancelled, armed: false, busy: false });
    assert.equal(
      live(root).textContent.trim(),
      '',
      'and the write finishing is not a cancellation'
    );
    harness.remount();
  });

  // CONFIRMING DISABLES THE CONTROL, WHICH MOVES FOCUS TO `document.body`. Re-enabling it
  // does not bring focus back, so on a refused or no-op delete the GM's keyboard is nowhere
  // and the region — emptied while busy — has said nothing about the outcome. The Foundry
  // error toast is not a live region this module controls.
  it('announces the OUTCOME of a finished write and takes focus back', async () => {
    const root = await harness.mount(props({ armed: true }));
    button(root).focus();

    await harness.setProps(props({ armed: true, busy: true }));
    // The disable is what moves focus away in a real browser; happy-dom does not fire that
    // blur, so the post-write state is entered deliberately here, exactly as the busy-face
    // suite below does. `bulk-delete-busy-focus.test.js` is where the browser fact itself is
    // measured.
    document.body.focus();
    // ANTI-VACUITY, asserted before the claim it bounds: if focus were still on the control
    // here, "focus came back" would pass on a card that did nothing at all.
    assert.notEqual(document.activeElement, button(root), 'the write really did drop focus');

    await harness.setProps(
      props({ armed: false, busy: false, outcomeAnnouncement: 'Failed to delete the selected recipes.' })
    );
    assert.equal(live(root).textContent.trim(), 'Failed to delete the selected recipes.');

    // Deferred a microtask past the flush, because the control is re-enabled in the same one
    // and `focus()` on a still-disabled button does nothing.
    await Promise.resolve();
    assert.equal(
      document.activeElement,
      button(root),
      'and the GM is put back on the control they were using, not left on <body>'
    );
    harness.remount();
  });

  it('lets the next arm announce again after an outcome', async () => {
    const failed = props({ outcomeAnnouncement: 'Failed to delete the selected recipes.' });
    const root = await harness.mount(failed);
    assert.equal(live(root).textContent.trim(), 'Failed to delete the selected recipes.');

    // The owner clears the outcome as it arms, which is what stops a stale sentence
    // out-ranking the armed one.
    await harness.setProps(props({ armed: true, outcomeAnnouncement: '' }));
    assert.match(live(root).textContent, /Activate again/);
    harness.remount();
  });

  it('does not expose the accessible name as a hover tooltip', async () => {
    // The armed names the three studios pass carry the count-agreement-neutral "(s)" idiom,
    // which is defensible for an AT-only string and reads as an un-interpolated template —
    // "1 recipe(s)" — the moment it becomes visible text. Nothing is lost: every count in
    // those names is in the impact list this control is `aria-describedby`-associated with.
    // The ROW call sites of `ArmedDangerButton` keep their tooltip, where the accessible name
    // is the only place a sighted user reads which document a two-word "Delete" reaches.
    const root = await harness.mount(props({ armed: true }));
    assert.equal(button(root).getAttribute('title'), null);
    assert.match(
      button(root).getAttribute('aria-label'),
      /Confirm delete/,
      'while the accessible name is untouched'
    );
    harness.remount();
  });

  it('carries no state class the stylesheet does not define', async () => {
    // `is-busy` was the only occurrence of that name under `src/` or `styles/`: a class
    // implying a treatment that does not exist. `data-busy` is the hook.
    const root = await harness.mount(props({ busy: true }));
    assert.equal(button(root).classList.contains('is-busy'), false);
    assert.equal(button(root).getAttribute('data-busy'), 'true');
    harness.remount();
  });
});

describe('1132 BulkDeleteCard — the two-step arm', () => {
  it('takes TWO clicks, and the first writes nothing', async () => {
    const armed = [];
    const confirmed = [];
    const root = await harness.mount(
      props({ onArm: (token) => armed.push(token), onConfirm: (token) => confirmed.push(token) })
    );

    button(root).click();
    flushSync();
    assert.deepEqual(armed, ['delete-recipes'], 'the first click ARMS');
    assert.deepEqual(confirmed, [], 'and writes nothing — this is the whole point of the pattern');

    await harness.setProps(
      props({ armed: true, onConfirm: (token) => confirmed.push(token) })
    );
    button(root).click();
    flushSync();
    assert.deepEqual(confirmed, ['delete-recipes'], 'the second click executes');
    harness.remount();
  });

  it('is inert, and stays a real button, when the caller disables it', async () => {
    const armed = [];
    const root = await harness.mount(props({ disabled: true, onArm: (token) => armed.push(token) }));

    assert.equal(button(root).tagName, 'BUTTON');
    assert.equal(button(root).getAttribute('type'), 'button', 'and never submits a host form');
    assert.equal(button(root).disabled, true);
    button(root).click();
    flushSync();
    assert.deepEqual(armed, [], 'a disabled arm writes nothing');
    harness.remount();
  });
});

describe('1132 BulkDeleteCard — the busy face', () => {
  it('shows the in-progress label, disabled, while the caller is writing', async () => {
    const root = await harness.mount(props({ armed: true, busy: true }));

    assert.equal(button(root).querySelector('span').textContent.trim(), 'Deleting…');
    assert.equal(button(root).disabled, true);
    assert.equal(button(root).getAttribute('aria-busy'), 'true');
    assert.equal(
      button(root).getAttribute('aria-label'),
      'Deleting…',
      'and its accessible name is its visible label, so label-in-name holds without a fourth string'
    );
    assert.equal(
      live(root).textContent.trim(),
      '',
      'while the armed announcement is cleared — "activate again" stops being true once the write starts'
    );
    harness.remount();
  });

  it('SURVIVES the disarm a real browser fires when the control is disabled', async () => {
    // THE TRAP. Chromium and Firefox fire `blur` on a focused button the moment it is disabled,
    // and `ArmedDangerButton` disarms on blur — so a browser reaches `busy: true, armed: false`
    // within a frame of the write starting. happy-dom fires no such blur, so this state has to
    // be entered deliberately or the assertion below would never be reached at all.
    //
    // A busy face read off `armed` would render "Delete 3 recipes" here: the idle label, on a
    // disabled button, for the whole duration of a destructive write.
    const root = await harness.mount(props({ armed: false, busy: true }));

    assert.equal(
      button(root).querySelector('span').textContent.trim(),
      'Deleting…',
      'the busy face is the caller\'s own flag, so a disarm underneath it changes nothing'
    );
    assert.equal(button(root).getAttribute('data-armed'), 'false', 'and it really is disarmed');
    assert.equal(button(root).getAttribute('data-busy'), 'true');
    harness.remount();
  });

  it('ignores a blur while busy, so an in-flight write cannot clear the owner\'s arm token', async () => {
    // The other half of the same race, driven by the event happy-dom will not raise on its own.
    // Without the guard the owner's `deleteArmed` is cleared by the write it is running, and a
    // failed delete then returns to an idle card with no memory of what the GM confirmed.
    const disarmed = [];
    const root = await harness.mount(
      props({ armed: true, busy: true, onDisarm: (token) => disarmed.push(token) })
    );

    button(root).dispatchEvent(new window.FocusEvent('blur'));
    flushSync();
    assert.deepEqual(disarmed, [], 'a blur raised by the disable is not a GM leaving the control');
    harness.remount();
  });

  it('still disarms on blur when it is NOT busy', async () => {
    // The negative control for the guard above: gating blur unconditionally would break the
    // shipped "click away to disarm" behaviour every call site of `ArmedDangerButton` relies on.
    const disarmed = [];
    const root = await harness.mount(
      props({ armed: true, busy: false, onDisarm: (token) => disarmed.push(token) })
    );

    button(root).dispatchEvent(new window.FocusEvent('blur'));
    flushSync();
    assert.deepEqual(disarmed, ['delete-recipes'], 'leaving an armed control still disarms it');
    harness.remount();
  });
});
