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
