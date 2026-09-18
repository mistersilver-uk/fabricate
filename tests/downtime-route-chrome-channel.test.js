import test from 'node:test';
import assert from 'node:assert/strict';

import { createRouteChromeChannel } from '../src/ui/svelte/apps/manager/downtime/routeChromeChannel.js';

// A context stands in for the frozen object Core mints per mount.
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

  // The mount ends — a tab switch, a route exit, a provider swap; the channel does not care which.
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

// The shipped host always ends a mount before it begins the next one, so `beginMount`'s own clear
// is defence in depth rather than the load-bearing path — which is exactly why it needs a test of
// its own.
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

/** A COMPANION DEFECT MUST NEVER TRAP THE GM. */
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
 * window's close button before answering it.
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

/** WHAT THIS CHANNEL OWNS OF `navigateToTab`, and what it deliberately does not (issue 1332). */
function navigatingChannel(answer = true) {
  const asked = [];
  const channel = createRouteChromeChannel({
    onNavigate: (tabId) => {
      asked.push(tabId);
      return answer;
    },
  });
  return { channel, asked };
}

test('a live mount reaches the host, and a retired one is refused without reaching it', () => {
  const { channel, asked } = navigatingChannel();
  const ledger = contextFor('ledger');
  const crew = contextFor('crew');

  assert.equal(channel.navigate(ledger, 'crew'), false, 'with no mount at all, nobody moves');
  assert.deepEqual(asked, [], 'and the host is never asked to move them');

  channel.beginMount(ledger);
  assert.equal(channel.navigate(ledger, 'crew'), true);
  assert.deepEqual(asked, ['crew'], 'the destination arrives at the host verbatim');

  // The mount that asked has been replaced by the one it navigated to.
  channel.beginMount(crew);
  assert.equal(channel.navigate(ledger, 'ledger'), false, 'a retired context moves nobody');
  assert.deepEqual(asked, ['crew'], 'and is refused BEFORE the host could act on it');

  channel.endMount(crew);
  assert.equal(channel.navigate(crew, 'ledger'), false, 'and the member dies with its mount');
  assert.deepEqual(asked, ['crew']);
});

test('the host’s answer is passed back unchanged, including a pending one', async () => {
  // The host answers a companion's veto asynchronously, because the veto may be a dialog.
  let settle;
  const pending = new Promise((resolve) => {
    settle = resolve;
  });
  const { channel } = navigatingChannel(pending);
  const ledger = contextFor('ledger');
  channel.beginMount(ledger);

  const answer = channel.navigate(ledger, 'crew');
  assert.equal(answer, pending, 'the host’s own promise, not a wrapper around it');
  settle(false);
  assert.equal(await answer, false);

  const refusing = createRouteChromeChannel({ onNavigate: () => false });
  refusing.beginMount(ledger);
  assert.equal(refusing.navigate(ledger, 'crew'), false, 'a veto is reported as a veto');
});

test('a malformed tab id throws whoever sent it, and moves nobody', () => {
  const { channel, asked } = navigatingChannel();
  const ledger = contextFor('ledger');
  const retired = contextFor('gone');
  channel.beginMount(ledger);

  for (const malformed of [undefined, null, '', '   ', 42, { id: 'crew' }, ['crew']]) {
    assert.throws(
      () => channel.navigate(ledger, malformed),
      /navigateToTab requires a non-empty tab id/,
      `expected ${String(malformed)} to be refused`
    );
    // VALIDATED BEFORE LIVENESS, which is the half a `TypeError`-shaped assertion alone would
    // miss: a companion whose mount has quietly ended must still be told its ARGUMENT is wrong,
    // rather than reading a silent `false` and hunting a lifecycle bug it does not have.
    assert.throws(
      () => channel.navigate(retired, malformed),
      /navigateToTab requires a non-empty tab id/,
      `expected ${String(malformed)} to be refused from a dead mount too`
    );
  }
  assert.deepEqual(asked, [], 'and no malformed request ever reached the host');
});

test('a channel created without a host refuses to navigate rather than pretending to', () => {
  // Every unit of the three older members constructs a channel with no `onNavigate`.
  const { channel } = recordingChannel();
  const ledger = contextFor('ledger');
  channel.beginMount(ledger);
  assert.equal(channel.navigate(ledger, 'crew'), false);
});

/** RE-ENTRANCY FROM INSIDE THE GUARD'S OWN BODY (issue 1332 review). */
test('a navigation asked for from inside the guard’s own body is refused, never nested', () => {
  const reached = [];
  const channel = createRouteChromeChannel({
    onNavigate: (tabId) => {
      reached.push(tabId);
      return true;
    },
  });
  const ledger = contextFor('ledger');
  channel.beginMount(ledger);

  const asked = [];
  const redirects = [];
  channel.onBeforeNavigate(ledger, (event) => {
    asked.push(event.reason);
    redirects.push(channel.navigate(ledger, 'writs'));
    return false;
  });

  assert.equal(channel.confirmNavigation('tab'), false);
  assert.deepEqual(asked, ['tab'], 'the handler is asked ONCE — the recursion is what this fixes');
  assert.deepEqual(redirects, [false], 'and its own request is answered, not queued or shared');
  assert.deepEqual(reached, [], 'nothing reached the host, so no route could commit ahead of it');

  // AND THE REFUSAL IS SCOPED TO THAT WINDOW, which is the half a `false` alone would not
  // prove: a member that simply stopped working after the first guard call would pass above.
  assert.equal(channel.navigate(ledger, 'writs'), true);
  assert.deepEqual(reached, ['writs']);
});

test('a guard that throws still releases the navigation it was holding', () => {
  const reported = [];
  const channel = createRouteChromeChannel({
    onNavigate: () => true,
    reportError: (...args) => reported.push(args),
  });
  const ledger = contextFor('ledger');
  channel.beginMount(ledger);
  channel.onBeforeNavigate(ledger, () => {
    throw new Error('companion exploded');
  });

  assert.equal(channel.confirmNavigation('tab'), undefined, 'a thrown guard allows, as it did');
  assert.equal(reported.length, 1);
  // Without the `finally` this is where the SECOND failure lands: one contained companion defect
  // would leave `navigateToTab` refusing for the rest of the mount, with nothing to explain it.
  assert.equal(channel.navigate(ledger, 'crew'), true);
});

test('a navigation asked for while the GM’s dialog is open is refused rather than shared', async () => {
  const reached = [];
  const channel = createRouteChromeChannel({
    onNavigate: (tabId) => {
      reached.push(tabId);
      return true;
    },
  });
  const ledger = contextFor('ledger');
  channel.beginMount(ledger);

  let answer;
  channel.onBeforeNavigate(
    ledger,
    () =>
      new Promise((resolve) => {
        answer = resolve;
      })
  );

  const outer = channel.confirmNavigation('tab');
  assert.equal(typeof outer.then, 'function');
  // CORE'S OWN second navigation still shares the pending answer — that rule is untouched, and
  // asserting it here is what stops this case from being read as a change to it.
  assert.equal(channel.confirmNavigation('close'), outer, 'two Core navigations, one decision');
  // The COMPANION's own request does not join that share: it is a different question, asked by
  // the very party the outstanding one is waiting on.
  assert.equal(channel.navigate(ledger, 'crew'), false);
  assert.deepEqual(reached, []);

  answer(true);
  assert.equal(await outer, true);
  await Promise.resolve();
  assert.equal(channel.navigate(ledger, 'crew'), true, 'and the refusal ends with the answer');
  assert.deepEqual(reached, ['crew']);
});
