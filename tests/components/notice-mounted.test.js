/**
 * THE NOTICE'S CONTRACT (issue 1505), pinned at the PRIMITIVE rather than through a caller.
 *
 * ── WHY THE UNREACHED PROPS ARE THE POINT OF THIS FILE ───────────────────────────────────────
 * `library.html:958` states this component's API in full, so it ships whole rather than trimmed
 * to what two callers happen to need — and neither shipped caller reaches `action`,
 * `dismissable` or `blocking`. The alchemy banner is a glyph and one sentence; the bulk report
 * is a glyph, a title and a summary. A prop no caller reaches and no test ACTS on is unreachable
 * configuration, which is the rule that withdrew `size`, `unit`, `warning` and `accent` from
 * `StatBox` in this same change. So this file clicks the action, clicks the dismiss control and
 * asserts what each one did, rather than asserting that a button exists.
 *
 * The same rule is why all five tones are exercised here and not only the four two callers
 * reach: `warning` and `info` are alchemy-banner states, and that banner is drawn by no frame
 * today, so the frames are not their discharge either.
 *
 * ── AND WHY TWO CLAUSES READ THE SOURCE ──────────────────────────────────────────────────────
 * The per-tone ink is one rule in the specimen — `.k-notice.<tone> .i, .k-notice.<tone> .ttl` set
 * the glyph and the title together at `library.html:226`, `:228` and `:230` — and a build that
 * split them would render identical markup in every state. A scoped `<style>` block injected into
 * happy-dom is not something `getComputedStyle` can be trusted to resolve, so the pairing and the
 * one deviation from it (`accent` inks `--fab-accent-text`, not `--fab-accent`, because inking an
 * accent band with the accent itself measures 4.48:1 under AA) are asserted against the source.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const NOTICE_PATH = 'src/ui/svelte/components/Notice.svelte';
const noticeSource = readFileSync(resolve(repoRoot, NOTICE_PATH), 'utf8');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-notice-',
  compiledModules: [NOTICE_PATH],
  componentPath: NOTICE_PATH,
});

function flushRender() {
  return new Promise((done) => setTimeout(done, 0));
}

function noticeOf(target) {
  return target.querySelector('.fab-notice');
}

/** Authored classes, with Svelte's per-component scope hash removed. */
function authoredClasses(node) {
  return [...node.classList].filter((name) => !name.startsWith('svelte-'));
}

/**
 * The source with every comment blanked, because a rule is read by finding its closing brace and
 * a `/* ... { box-sizing } ... *\/` note would end it early — silently returning a fragment that
 * matches nothing and reads as a real failure.
 */
const declarationsOnly = noticeSource.replaceAll(/\/\*[\s\S]*?\*\//gu, '');

/** The declaration body of one rule in the component's scoped `<style>` block. */
function ruleBody(selector) {
  const start = declarationsOnly.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `the scoped style block declares \`${selector}\``);
  const open = declarationsOnly.indexOf('{', start);
  const close = declarationsOnly.indexOf('}', open);
  return declarationsOnly.slice(open + 1, close);
}

describe('1505 Notice — the API the library states', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => harness.teardown());

  it('announces a blocking notice as an alert, and every other one through a live region', async () => {
    const blocking = await harness.mount({ title: 'This recipe cannot be saved', blocking: true });
    assert.equal(noticeOf(blocking).getAttribute('role'), 'alert', 'blocking interrupts');
    assert.equal(
      noticeOf(blocking).getAttribute('aria-live'),
      null,
      'and does not also declare a politeness a live region would have to arbitrate'
    );
    harness.remount();

    const polite = await harness.mount({ title: '4 essences deleted' });
    assert.equal(
      noticeOf(polite).getAttribute('aria-live'),
      'polite',
      'a notice that appears without a focus change is still announced'
    );
    assert.equal(noticeOf(polite).getAttribute('role'), null, 'without claiming the page');
    harness.remount();
  });

  it('resolves all five tones, and falls back to danger rather than rendering unstyled', async () => {
    for (const tone of ['danger', 'warning', 'info', 'success', 'accent']) {
      const target = await harness.mount({ tone, title: 'Something happened' });
      assert.deepEqual(
        authoredClasses(noticeOf(target)),
        ['fab-notice', `is-${tone}`],
        `${tone} paints exactly one tone class`
      );
      assert.equal(noticeOf(target).getAttribute('data-notice-tone'), tone);
      harness.remount();
    }

    const unknown = await harness.mount({ tone: 'chartreuse', title: 'Something happened' });
    assert.deepEqual(
      authoredClasses(noticeOf(unknown)),
      ['fab-notice', 'is-danger'],
      'an unknown tone is the unmodified specimen, not an untinted box'
    );
    harness.remount();
  });

  it('renders the glyph, the title and the optional detail, in that order', async () => {
    const target = await harness.mount({
      tone: 'success',
      icon: 'fas fa-trash',
      title: '4 essences deleted',
      detail: '2 kept, still in use',
    });
    const notice = noticeOf(target);
    assert.ok(
      Boolean(notice.querySelector('i.fa-trash')),
      'a caller-supplied glyph wins over the per-tone default — two states can share one tone'
    );
    assert.equal(notice.querySelector('i').getAttribute('aria-hidden'), 'true');
    assert.equal(notice.querySelector('.fab-notice-title').textContent, '4 essences deleted');
    assert.equal(notice.querySelector('.fab-notice-detail').textContent, '2 kept, still in use');
    harness.remount();

    const titleOnly = await harness.mount({ tone: 'success', title: '4 essences deleted' });
    assert.ok(
      !noticeOf(titleOnly).querySelector('.fab-notice-detail'),
      'a notice with nothing to add renders no empty second line'
    );
    assert.ok(
      Boolean(noticeOf(titleOnly).querySelector('i.fa-circle-check')),
      'and falls back to the tone default when the caller supplies no glyph'
    );
    harness.remount();
  });

  it('CLICKS the action and forwards the event to the caller handler', async () => {
    const received = [];
    const target = await harness.mount({
      title: 'This recipe cannot be saved',
      action: {
        label: 'Show both',
        onClick: (...args) => {
          received.push(args);
        },
      },
    });
    const button = target.querySelector('[data-notice-action]');
    assert.ok(Boolean(button), 'the action renders as one button');
    assert.equal(button.textContent.trim(), 'Show both', 'labelled by the caller, not by default');
    assert.equal(
      button.getAttribute('data-keyboard-focus'),
      'true',
      'so Foundry sees the focus and Space does not pause the game behind the window'
    );

    button.click();
    await flushRender();
    assert.equal(received.length, 1, 'the handler fired exactly once');
    assert.equal(received[0].length, 1, 'and was forwarded one argument');
    assert.equal(received[0][0]?.type, 'click', 'which is the click event');
    harness.remount();
  });

  it('CLICKS the dismiss control and the notice leaves the DOM', async () => {
    const target = await harness.mount({
      title: 'Unsaved changes',
      dismissable: true,
      dismissLabel: 'Dismiss this notice',
    });
    const dismiss = target.querySelector('[data-notice-dismiss]');
    assert.ok(Boolean(dismiss), 'the dismiss control renders when it is asked for');
    assert.equal(dismiss.getAttribute('aria-label'), 'Dismiss this notice');
    assert.equal(dismiss.getAttribute('data-keyboard-focus'), 'true');

    dismiss.click();
    await flushRender();
    assert.ok(!noticeOf(target), 'a dismissed notice is gone, not merely hidden');
    harness.remount();
  });

  it('emits neither control unless it is asked for, and never names one in English', async () => {
    const target = await harness.mount({ title: 'Unsaved changes' });
    assert.ok(!target.querySelector('[data-notice-action]'), 'no action, no button');
    assert.ok(!target.querySelector('[data-notice-dismiss]'), 'no dismissal, no button');
    harness.remount();

    const unlabelled = await harness.mount({ title: 'Unsaved changes', dismissable: true });
    assert.equal(
      unlabelled.querySelector('[data-notice-dismiss]').getAttribute('aria-label'),
      null,
      'an unnamed control omits the attribute — an EMPTY aria-label suppresses the name instead'
    );
    harness.remount();
  });

  it('carries both root hooks verbatim, the bare one as an empty string', async () => {
    const target = await harness.mount({
      title: 'Brewed',
      dataAttr: 'data-alchemy-banner',
      stateDataAttr: 'data-alchemy-banner-status',
      stateDataValue: 'brewing',
    });
    const notice = noticeOf(target);
    assert.equal(
      notice.getAttribute('data-alchemy-banner'),
      '',
      'a hook written bare on the element this replaces stays bare, not `="true"`'
    );
    assert.equal(notice.getAttribute('data-alchemy-banner-status'), 'brewing');
    harness.remount();

    const bare = await harness.mount({ title: 'Brewed' });
    assert.equal(
      noticeOf(bare)
        .getAttributeNames()
        .filter((name) => name.startsWith('data-alchemy')).length,
      0,
      'an unset hook is ABSENT rather than an empty attribute a selector would still match'
    );
    harness.remount();
  });

  it('sets the glyph and the title in ONE rule per tone, as the specimen does', () => {
    for (const [tone, ink] of [
      ['warning', '--fab-warning-text'],
      ['info', '--fab-info-text'],
      ['success', '--fab-success-text'],
      // The one deviation: the specimen declares no accent notice, and the accent itself
      // measures 4.48:1 on an accent band in `ironblood-forge`.
      ['accent', '--fab-accent-text'],
    ]) {
      const body = ruleBody(
        `.fab-notice.is-${tone} > i,\n  .fab-notice.is-${tone} .fab-notice-title`
      );
      assert.match(
        body,
        new RegExp(String.raw`color:\s*var\(${ink}\)`, 'u'),
        `${tone} inks its glyph and its title together, at ${ink}`
      );
    }

    assert.doesNotMatch(
      declarationsOnly,
      /color:\s*var\(--fab-accent\)/,
      'the accent band never inks itself with the accent — that is the sub-AA pair'
    );
  });

  it('declares flex-start rather than inheriting it, and keeps the detail neutral', () => {
    const root = ruleBody('.fab-notice');
    assert.match(
      root,
      /align-items:\s*flex-start/,
      'the specimen declares no alignment at all, so this one is stated rather than borrowed'
    );
    assert.match(root, /border-radius:\s*11px/, 'r11, on the published radius ladder');
    assert.match(root, /padding:\s*var\(--fab-space-3\)/);
    assert.match(root, /gap:\s*var\(--fab-space-3\)/);

    const detail = ruleBody('.fab-notice-detail');
    assert.match(detail, /color:\s*var\(--fab-text-muted\)/, 'the detail is neutral at every tone');
    assert.match(
      detail,
      /font-variant-numeric:\s*tabular-nums/,
      'a live count sentence must not jitter as the run resolves'
    );
  });
});
