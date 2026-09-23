/** `BulkDeleteCard` mounted, in isolation (issue 1132). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { ANNOUNCE_AFTER_FOCUS_MS } from '../../src/ui/svelte/util/announceAfterFocus.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const CARD_PATH = 'src/ui/svelte/apps/manager/BulkDeleteCard.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-bulk-delete-card-',
  // The card's ONE shared leaf (issue 1157).
  rawModules: ['src/ui/svelte/util/announceAfterFocus.js'],
  compiledModules: [
    'src/ui/svelte/components/ArmedDangerButton.svelte',
    // The shared card shell (issue 1427). The card's root element is an `<InspectorCard>`
    // now, so omitting it makes the harness's own closure validator throw in `before()`.
    'src/ui/svelte/components/InspectorCard.svelte',
    CARD_PATH,
  ],
  componentPath: CARD_PATH,
});

/** The Recipe Studio's shape — three rows, a standing hint and all three faces. */
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

/**
 * Wait past the delay the outcome sentence spends queued behind the focus utterance
 * (issue 1157), then flush the render that state write schedules.
 */
async function settleAnnouncement() {
  await new Promise((resolve) => setTimeout(resolve, ANNOUNCE_AFTER_FOCUS_MS + 40));
  flushSync();
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
    // The per-row hook is VALUED, not bare.
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
    // Proximity is not association. And the id cannot be a literal.
    const root = await harness.mount(props());
    const described = button(root).getAttribute('aria-describedby');

    assert.ok(described, 'the button names a description');
    assert.match(described, /^delete-recipes-/, 'stemmed from the arm token');
    const list = card(root).querySelector(`#${described}`);
    assert.ok(Boolean(list), 'which resolves to an element inside the card');
    assert.equal(list.getAttribute('data-recipe-bulk-impact'), '');

    // The derivation, proved by moving the token rather than by reading the source.
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

  // ESCAPE AND CLICK-AWAY BOTH DISARM WHILE THE BUTTON HOLDS FOCUS.
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
    // The trap in tracking "was armed": confirming takes the control armed → busy → idle.
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

  // CONFIRMING DISABLES THE CONTROL.
  it('announces the OUTCOME of a finished write and takes focus back', async () => {
    const root = await harness.mount(props({ armed: true }));
    button(root).focus();

    await harness.setProps(props({ armed: true, busy: true }));
    // The disable is what moves focus away in a real browser.
    document.body.focus();
    // ANTI-VACUITY, asserted before the claim it bounds.
    assert.notEqual(document.activeElement, button(root), 'the write really did drop focus');

    await harness.setProps(
      props({ armed: false, busy: false, outcomeAnnouncement: 'Failed to delete the selected recipes.' })
    );

    // ── AND IN THAT ORDER (issue 1157, review round) ────────────────────────────────
    // The focus move comes FIRST and the sentence is queued BEHIND it. A `polite` region is
    // queued speech and NVDA and JAWS both cancel queued speech on a focus change, so the
    // original order — write the sentence, then move focus — is an announcement the GM may
    // never hear. That is not observable here (no engine in this repo runs a screen reader),
    // but the ORDER is, and it is what the shared rule in `util/announceAfterFocus.js` fixes.
    await Promise.resolve();
    assert.equal(
      document.activeElement,
      button(root),
      'and the GM is put back on the control they were using, not left on <body>'
    );
    assert.equal(
      live(root).textContent.trim(),
      '',
      'the region is still EMPTY at the moment focus lands, so nothing is queued in front of the focus utterance'
    );

    await settleAnnouncement();
    assert.equal(live(root).textContent.trim(), 'Failed to delete the selected recipes.');
    harness.remount();
  });

  // ── …BUT ONLY FROM `<body>` (issue 1157) ─────────────────────────────────────────
  it('leaves focus alone when the GM moved it somewhere else during the write', async () => {
    const root = await harness.mount(props({ armed: true }));
    button(root).focus();

    await harness.setProps(props({ armed: true, busy: true }));
    // The GM tabs away mid-write. A REAL, connected node outside the card.
    const elsewhere = document.createElement('input');
    document.body.appendChild(elsewhere);
    elsewhere.focus();
    assert.ok(document.activeElement === elsewhere, 'pre-condition: the GM is in the field');

    await harness.setProps(
      props({ armed: false, busy: false, outcomeAnnouncement: 'Failed to delete the selected recipes.' })
    );
    assert.equal(
      live(root).textContent.trim(),
      'Failed to delete the selected recipes.',
      'the outcome is still announced — the guard is about focus, not about speech — and it is '
        + 'announced IMMEDIATELY, because a sentence with no focus utterance to queue behind has '
        + 'nothing to wait for'
    );

    await Promise.resolve();
    assert.ok(
      document.activeElement === elsewhere,
      'and the GM keeps the control they moved to, rather than being yanked back'
    );
    elsewhere.remove();
    harness.remount();
  });

  it('lets the next arm announce again after an outcome', async () => {
    const failed = props({ outcomeAnnouncement: 'Failed to delete the selected recipes.' });
    const root = await harness.mount(failed);
    // The outcome takes focus from `<body>` here too, so it is queued behind that hop.
    await settleAnnouncement();
    assert.equal(live(root).textContent.trim(), 'Failed to delete the selected recipes.');

    // The owner clears the outcome as it arms.
    await harness.setProps(props({ armed: true, outcomeAnnouncement: '' }));
    assert.match(live(root).textContent, /Activate again/);
    harness.remount();
  });

  // THE RACE THE DELAY OPENS, closed here rather than left to be discovered. The outcome is
  // spoken on a timer, so a GM who re-arms inside that window would otherwise hear the
  // refusal land on top of the arm — a stale sentence out-ranking the current state, which is
  // the same defect the `announcedOutcome` bookkeeping exists to prevent on the synchronous
  // paths.
  it('drops a queued outcome that a re-arm has already overtaken', async () => {
    const root = await harness.mount(props({ armed: true }));
    button(root).focus();
    await harness.setProps(props({ armed: true, busy: true }));
    document.body.focus();

    await harness.setProps(
      props({ armed: false, busy: false, outcomeAnnouncement: 'Failed to delete the selected recipes.' })
    );
    // Inside the delay, before the sentence has been written: the GM arms again.
    await harness.setProps(props({ armed: true, outcomeAnnouncement: '' }));
    assert.match(live(root).textContent, /Activate again/, 'the arm is announced');

    await settleAnnouncement();
    assert.match(
      live(root).textContent,
      /Activate again/,
      'and the overtaken outcome never lands on top of it'
    );
    harness.remount();
  });

  it('does not expose the accessible name as a hover tooltip', async () => {
    // The armed names the three studios pass carry the count-agreement-neutral "(s)" idiom,
    // which is defensible for an AT-only string and reads as an un-interpolated template —
    // "1 recipe(s)" — the moment it becomes visible text. Nothing is lost: every count in
    // those names is in the impact list this control is `aria-describedby`-associated with.
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
    // `is-busy` was the only occurrence of that name under `src/` or `styles/`.
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
    // The negative control for the guard above.
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
