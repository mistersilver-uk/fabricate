import test from 'node:test';
import assert from 'node:assert/strict';

import { createRouteChromeChannel } from '../src/ui/svelte/apps/manager/downtime/routeChromeChannel.js';

// A context stands in for the frozen object Core mints per mount. Its identity is the whole
// point — the channel keys liveness on it — so these are deliberately bare objects: nothing
// about the real context's FIELDS participates.
const contextFor = (tabId) => Object.freeze({ tabId });

function recordingChannel() {
  const published = [];
  const errors = [];
  const channel = createRouteChromeChannel({
    onChange: (chrome) => published.push(chrome),
    reportError: (...args) => errors.push(args),
  });
  return { channel, published, errors };
}

test('a live mount states its chrome, and unsetting it falls back to nothing of its own', () => {
  const { channel, published } = recordingChannel();
  const context = contextFor('ledger');

  channel.beginMount(context);
  assert.deepEqual(published, [], 'a mount that states no chrome publishes nothing at all');
  assert.equal(channel.chrome, null);

  assert.equal(channel.setChrome(context, { title: 'Crew', status: { label: 'Unsaved' } }), true);
  assert.equal(channel.chrome.title, 'Crew');
  assert.equal(channel.chrome.status.tone, 'warning');
  assert.equal(published.length, 1);

  // REPLACE, never merge: the second call states the whole chrome, so the status is gone
  // because it was omitted rather than because anything cleared it.
  channel.setChrome(context, { title: 'Crew' });
  assert.equal(channel.chrome.status, undefined, 'an omitted field is unset, not remembered');
  assert.equal(channel.chrome.title, 'Crew');

  channel.setChrome(context, null);
  assert.equal(channel.chrome, null, 'null restores the tab’s own registered chrome');
  assert.equal(published.at(-1), null);
});

test('chrome is scoped to one mount and never survives it', () => {
  const { channel } = recordingChannel();
  const ledger = contextFor('ledger');
  const crew = contextFor('crew');

  channel.beginMount(ledger);
  channel.setChrome(ledger, { title: 'Editing a crew member' });
  assert.equal(channel.chrome.title, 'Editing a crew member');

  // The mount ends — a tab switch, a route exit, a provider swap; the channel does not care
  // which. What must not happen is a GM arriving on the next screen still reading the editor's
  // title, because the state that title described was destroyed with the mount.
  channel.endMount(ledger);
  assert.equal(channel.chrome, null);

  channel.beginMount(crew);
  assert.equal(channel.chrome, null, 'a fresh mount starts from its tab’s registered chrome');
  assert.equal(
    channel.setChrome(ledger, { title: 'Back from the dead' }),
    false,
    'a retired context cannot repaint the screen the GM has moved on to'
  );
  assert.equal(channel.chrome, null);

  channel.setChrome(crew, { title: 'Crew' });
  channel.endMount(ledger);
  assert.equal(
    channel.chrome?.title,
    'Crew',
    'a retired context releasing again must not release the mount that replaced it'
  );
});

// The shipped host always ends a mount before it begins the next one, so `beginMount`'s own
// clear is defence in depth rather than the load-bearing path — which is exactly why it needs
// a test of its own. Without one, deleting it is invisible, and the day a caller reaches
// `beginMount` without a matching `endMount` (a fault path, a reordered effect) the new screen
// inherits the previous one's title, artwork and Save button.
test('a mount adopted without a release still starts from its tab’s registered chrome', () => {
  const { channel } = recordingChannel();
  const ledger = contextFor('ledger');
  const crew = contextFor('crew');

  channel.beginMount(ledger);
  channel.setChrome(ledger, { title: 'Editing a crew member' });
  const stale = [];
  channel.onReselect(ledger, () => stale.push('stale'));

  channel.beginMount(crew);
  assert.equal(channel.chrome, null, 'the previous mount’s chrome does not carry across');
  assert.equal(channel.reselect(), false, 'and neither does its re-activation handler');
  assert.deepEqual(stale, []);
});

test('a malformed update is refused at the boundary and changes nothing', () => {
  const { channel, published } = recordingChannel();
  const context = contextFor('ledger');
  channel.beginMount(context);
  channel.setChrome(context, { title: 'Crew', subtitle: 'Three projects' });
  const before = channel.chrome;

  assert.throws(
    () => channel.setChrome(context, { title: 'Crew', subtitel: 'Three projects' }),
    /does not accept "subtitel"/,
    'the TypeError travels back to the companion’s own call stack'
  );
  assert.equal(channel.chrome, before, 'and the header keeps showing what it showed already');
  assert.equal(published.length, 1, 'a refused update publishes nothing');

  // Validation happens BEFORE liveness, so the same mistake reports the same way whoever made
  // it — a companion debugging a typo is not also told its mount was stale.
  channel.endMount(context);
  assert.throws(() => channel.setChrome(context, { nope: 1 }), /does not accept "nope"/);
});

test('re-activation reaches the live mount and keeps reaching it', () => {
  const { channel } = recordingChannel();
  const context = contextFor('ledger');

  assert.equal(channel.reselect(), false, 'with no companion listening, Core does nothing');

  channel.beginMount(context);
  const reselects = [];
  const stop = channel.onReselect(context, () => reselects.push('pop'));

  assert.equal(channel.reselect(), true);
  assert.deepEqual(reselects, ['pop'], 'the rail click reaches the mount that asked for it');
  assert.equal(channel.reselect(), true);
  assert.equal(reselects.length, 2, 'and keeps reaching it — this is not a one-shot');

  stop();
  stop();
  assert.equal(channel.reselect(), false, 'unsubscribing is idempotent and really stops it');
});

test('a re-activation handler cannot take the rail click down with it', () => {
  const { channel, errors } = recordingChannel();
  const context = contextFor('ledger');
  channel.beginMount(context);
  channel.onReselect(context, () => {
    throw new Error('companion exploded');
  });

  assert.doesNotThrow(() => channel.reselect());
  assert.equal(channel.reselect(), false, 'a throwing handler reports as "nothing handled it"');
  assert.equal(errors.length, 2);
  assert.match(errors[0][0], /Downtime route re-activation handler failed/);
});

test('a re-activation handler dies with its mount and cannot be registered from a dead one', () => {
  const { channel } = recordingChannel();
  const ledger = contextFor('ledger');
  const crew = contextFor('crew');
  const seen = [];

  channel.beginMount(ledger);
  channel.onReselect(ledger, () => seen.push('ledger'));
  channel.beginMount(crew);
  assert.equal(
    channel.reselect(),
    false,
    'the previous mount’s handler is gone — a new mount inherits no listeners'
  );

  const stop = channel.onReselect(ledger, () => seen.push('stale'));
  assert.equal(typeof stop, 'function', 'a refused registration still returns an unsubscribe');
  assert.equal(channel.reselect(), false);
  assert.deepEqual(seen, [], 'a retired context registers nothing');

  channel.onReselect(crew, () => seen.push('crew'));
  channel.reselect();
  assert.deepEqual(seen, ['crew']);

  // A later registration replaces the earlier one, and an unsubscribe held over that
  // replacement must not evict the newer handler.
  const stopFirst = channel.onReselect(crew, () => seen.push('first'));
  channel.onReselect(crew, () => seen.push('second'));
  stopFirst();
  channel.reselect();
  assert.deepEqual(seen, ['crew', 'second']);
});

test('the channel refuses a non-function handler and is itself frozen', () => {
  const { channel } = recordingChannel();
  const context = contextFor('ledger');
  channel.beginMount(context);
  assert.throws(() => channel.onReselect(context, 'pop'), /requires a function/);
  assert.ok(Object.isFrozen(channel));
});

/**
 * THE COMPATIBILITY GUARANTEE, and the reason it is asserted against `undefined` rather than
 * against a boolean.
 *
 * Every caller of `confirmNavigation` reads `undefined` as "there is nothing to ask" and takes
 * the branch it took before this seam existed: no prompt, no `await`, no extra microtask, and
 * no wrapping of the route-guard promise identity `confirmRouteExit` preserves on purpose. A
 * channel that answered `true` here would be behaviourally identical AND would cost the
 * Manager an await on every close and a composed promise on every route exit, for a question
 * no companion asked. So `undefined` is the contract, not an implementation detail.
 */
test('a mount that registers no guard is asked nothing at all', () => {
  const { channel, errors } = recordingChannel();
  const context = contextFor('ledger');

  assert.equal(channel.confirmNavigation('route'), undefined, 'with no mount, nothing to ask');
  channel.beginMount(context);
  for (const reason of ['tab', 'route', 'close']) {
    assert.equal(
      channel.confirmNavigation(reason),
      undefined,
      `a mounted companion that never registered a guard is not consulted on ${reason} either`
    );
  }
  assert.deepEqual(errors, []);
});

test('an explicit false vetoes and anything else allows', () => {
  const { channel } = recordingChannel();
  const context = contextFor('ledger');
  channel.beginMount(context);
  const seen = [];

  let answer = false;
  channel.onBeforeNavigate(context, (event) => {
    seen.push(event);
    return answer;
  });

  assert.equal(channel.confirmNavigation('tab'), false, 'false is the veto');
  assert.deepEqual(seen.at(-1), { reason: 'tab' }, 'the guard is told why its mount is ending');
  assert.ok(Object.isFrozen(seen.at(-1)), 'and cannot write back through the event');

  // Everything else allows. An OMITTED return is the case that matters: a handler written to
  // observe a navigation must not be able to trap the GM by forgetting to return a value.
  for (answer of [undefined, true, null, 0, '', 'no']) {
    assert.equal(
      channel.confirmNavigation('route'),
      true,
      `only an explicit false vetoes — ${String(answer)} allows`
    );
  }
  assert.equal(seen.length, 7);
  assert.deepEqual(seen.at(-1), { reason: 'route' });
});

test('an async guard is awaited, and its answer read the same way', async () => {
  const { channel } = recordingChannel();
  const context = contextFor('ledger');
  channel.beginMount(context);
  let answer = false;
  channel.onBeforeNavigate(context, async () => answer);

  const vetoed = channel.confirmNavigation('close');
  assert.ok(vetoed instanceof Promise, 'a companion may await its own dialog');
  assert.equal(await vetoed, false);

  answer = undefined;
  assert.equal(await channel.confirmNavigation('close'), true, 'and an omitted answer allows');
});

/**
 * A COMPANION DEFECT MUST NEVER TRAP THE GM.
 *
 * A throw is reported and the navigation proceeds. Reading it as a veto instead would leave a
 * GM in a Manager window they cannot close and a rail that does nothing, recoverable only by
 * reloading Foundry — and it would do so for exactly the module least able to notice. Allowing
 * degrades to the behaviour that shipped before this seam existed, where a screen exit neither
 * wrote nor discarded a companion's draft, so nothing is destroyed that was not already.
 */
test('a throwing guard is contained and allows the navigation', async () => {
  const { channel, errors } = recordingChannel();
  const context = contextFor('ledger');
  channel.beginMount(context);
  let mode = 'throw';
  channel.onBeforeNavigate(context, () => {
    if (mode === 'throw') throw new Error('companion exploded');
    return Promise.reject(new Error('companion exploded later'));
  });

  assert.equal(
    channel.confirmNavigation('close'),
    undefined,
    'a synchronous throw answers "nothing to ask", so the caller keeps its original path'
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0][0], /Downtime navigation guard failed/);

  mode = 'reject';
  assert.equal(await channel.confirmNavigation('close'), true, 'a rejection allows too');
  assert.equal(errors.length, 2, 'and is reported through the same sink');
});

/**
 * RE-ENTRANCY. A guard is expected to await a dialog, and a GM can click the rail and then the
 * window's close button before answering it. The pending answer is SHARED rather than re-asked
 * (which stacks a second dialog on the first) or refused (which hands the GM a dead click with
 * nothing to explain it) — the same de-duplication `confirmDiscardDirtyToolsDraft` applies to
 * Core's own concurrent prompt.
 */
test('a second navigation shares the pending answer instead of asking again', async () => {
  const { channel } = recordingChannel();
  const context = contextFor('ledger');
  channel.beginMount(context);
  let calls = 0;
  let release;
  channel.onBeforeNavigate(context, () => {
    calls += 1;
    return new Promise((resolve) => {
      release = resolve;
    });
  });

  const first = channel.confirmNavigation('tab');
  const second = channel.confirmNavigation('close');
  assert.equal(calls, 1, 'the companion is asked once, so it opens one dialog');
  assert.equal(second, first, 'and both navigations resolve from the GM’s one decision');

  release(false);
  assert.equal(await first, false);
  assert.equal(await second, false);

  // The de-duplication is for the CONCURRENT case only. Once the GM has answered, the next
  // navigation is a new question and must reach the companion again.
  const third = channel.confirmNavigation('route');
  assert.equal(calls, 2, 'a later navigation asks again rather than replaying a stale answer');
  release(true);
  assert.equal(await third, true);
});

test('a navigation guard dies with its mount, and unsubscribing is idempotent', () => {
  const { channel } = recordingChannel();
  const ledger = contextFor('ledger');
  const crew = contextFor('crew');
  const seen = [];

  channel.beginMount(ledger);
  const stop = channel.onBeforeNavigate(ledger, () => {
    seen.push('ledger');
    return false;
  });
  assert.equal(channel.confirmNavigation('tab'), false);

  stop();
  stop();
  assert.equal(channel.confirmNavigation('tab'), undefined, 'unsubscribing really stops it');
  assert.deepEqual(seen, ['ledger']);

  channel.onBeforeNavigate(ledger, () => false);
  channel.beginMount(crew);
  assert.equal(
    channel.confirmNavigation('route'),
    undefined,
    'a new mount inherits no guard from the one it replaced'
  );

  const staleStop = channel.onBeforeNavigate(ledger, () => false);
  assert.equal(typeof staleStop, 'function', 'a refused registration still returns an unsubscribe');
  assert.equal(
    channel.confirmNavigation('route'),
    undefined,
    'a retired context registers nothing'
  );

  // A later registration replaces the earlier one, and an unsubscribe held across that
  // replacement must not evict the newer guard.
  const stopFirst = channel.onBeforeNavigate(crew, () => false);
  channel.onBeforeNavigate(crew, () => {
    seen.push('second');
    return true;
  });
  stopFirst();
  assert.equal(channel.confirmNavigation('route'), true);
  assert.deepEqual(seen, ['ledger', 'second']);

  channel.endMount(crew);
  assert.equal(channel.confirmNavigation('close'), undefined, 'and it ends with its mount');
});

test('the channel refuses a non-function navigation guard', () => {
  const { channel } = recordingChannel();
  const context = contextFor('ledger');
  channel.beginMount(context);
  assert.throws(() => channel.onBeforeNavigate(context, 'nope'), /requires a function/);
});
