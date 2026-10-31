/**
 * The published `Callout`'s `actionsPlacement` and the published `Notice`'s `assertive` (issue
 * 2855): `'below'` writes its one class and keeps the actions after the body, any other value draws
 * `'inline'`; `assertive` draws `role="alert"` at the `danger` tone for the boolean `true` alone,
 * inserted already holding its text, and the role an update finds is the one the mount drew.
 * Limit: happy-dom lays nothing out, so the stacked actions' geometry is
 * `callout-actions-below-rendered.test.js`'s, and no screen reader is run, so what is announced
 * is the documented expectation, not a measurement.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';

const { ui, freshTarget, mountEntry } = publishedEntrySeam('fabricate-published-callout-notice-');
const REFUSAL = 'Fabricate | published components: ';
const NOTE = Object.freeze({
  title: 'Begin an activity',
  text: 'Pick one to start.',
  actions: true,
});
const FAULT = Object.freeze({
  title: 'Something went wrong',
  detail: 'The studio could not draw.',
});
const BELOW = 'is-actions-below';

/**
 * Runs `run` while recording every change under `target` and, at the moment it is made, each
 * insertion into `target` itself; returns `run`'s result and what breaks "the alert arrives once,
 * whole": its role and title read at insertion, one inserted element, only empty anchors beside
 * it, and no change of any kind inside it after.
 */
async function recordInsertion(target, run) {
  const records = [];
  const observer = new MutationObserver((batch) => {
    records.push(...batch);
  });
  observer.observe(target, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
  });
  const atInsertion = [];
  let inside = false;
  const spied = ['insertBefore', 'appendChild', 'append'].map((name) => {
    target[name] = function (...nodes) {
      const outer = !inside;
      inside = true;
      for (const node of outer ? nodes : []) {
        const alert = node?.matches?.('.fab-notice') ? node : node?.querySelector?.('.fab-notice');
        if (alert) atInsertion.push([alert.getAttribute('role'), alert.textContent]);
      }
      try {
        return Object.getPrototypeOf(target)[name].apply(this, nodes);
      } finally {
        if (outer) inside = false;
      }
    };
    return name;
  });
  const result = await run();
  await settle();
  records.push(...observer.takeRecords());
  observer.disconnect();
  for (const name of spied) delete target[name];
  const alert = target.querySelector('.fab-notice');
  const findings = [];
  const [role, held] = atInsertion[0] ?? [];
  if (atInsertion.length !== 1) findings.push(`${atInsertion.length} insertions of the alert`);
  if (role !== 'alert') findings.push('the alert was inserted without its role');
  if (!held?.includes(FAULT.title)) findings.push('the alert was inserted without its text');
  const added = records.flatMap((record) =>
    record.target === target ? [...record.addedNodes] : []
  );
  const elements = added.filter((node) => node.nodeType === 1);
  if (elements.length !== 1 || elements[0] !== alert) findings.push('another element was added');
  const anchors = added.filter((node) => node.nodeType !== 1);
  if (anchors.some((node) => node.textContent !== '')) findings.push('text was added beside it');
  const within = records.filter((record) => alert?.contains(record.target));
  findings.push(...within.map((record) => `a ${record.type} change inside the alert`));
  return { result, findings };
}

/** The roles and live attribute a notice root carries. */
const announcing = (root) => [root.getAttribute('role'), root.getAttribute('aria-live')];

describe('the published Callout and Notice describe their new keys', () => {
  it('lists actionsPlacement after actions, and assertive after onDismiss, as optional data keys', () => {
    const callout = Object.keys(ui().describe('Callout').props);
    assert.deepEqual(callout.slice(-2), ['actions', 'actionsPlacement']);
    const notice = Object.keys(ui().describe('Notice').props);
    assert.deepEqual(notice.slice(-2), ['onDismiss', 'assertive']);
    assert.deepEqual(ui().describe('Notice').props.assertive, { kind: 'data', required: false });
    assert.deepEqual(ui().describe('Callout').props.actionsPlacement, {
      kind: 'data',
      required: false,
    });
  });
});

describe('the published Callout actionsPlacement', () => {
  it("writes is-actions-below for 'below', the actions after the body, and an update to 'inline' removes it from the same root", async () => {
    const { target, handle } = mountEntry('Callout', { ...NOTE, actionsPlacement: 'below' });
    await settle();
    const root = target.firstElementChild;
    assert.ok(root.classList.contains(BELOW));
    const [glyph, body, host] = root.children;
    assert.equal(root.children.length, 3);
    assert.deepEqual(
      [glyph.localName, body.classList[0], host.classList[0]],
      ['i', 'manager-callout-body', 'manager-callout-actions'],
      'the glyph, the body, then the actions host'
    );
    const slot = handle.slot('actions');
    assert.ok(root.lastElementChild.contains(slot), 'the slot in the host after the body');
    handle.update({ ...NOTE, actionsPlacement: 'inline' });
    await settle();
    assert.ok(target.firstElementChild === root && !root.classList.contains(BELOW));
    assert.ok(handle.slot('actions') === slot && root.contains(slot), 'the same slot, in place');
    handle.destroy();
  });

  it("draws 'inline' for any other value, nothing coerced", async () => {
    for (const actionsPlacement of ['inline', 'Below', ' below', 'stacked', true, 1, null]) {
      const { target, handle } = mountEntry('Callout', { ...NOTE, actionsPlacement });
      await settle();
      assert.ok(!target.firstElementChild.classList.contains(BELOW), String(actionsPlacement));
      handle.destroy();
    }
  });

  it('writes nothing for the default, so a note mounted without it is drawn as before', async () => {
    const { target, handle } = mountEntry('Callout', NOTE);
    await settle();
    assert.deepEqual(
      [...target.firstElementChild.classList].filter((name) => name.startsWith('is-')),
      []
    );
    handle.destroy();
  });
});

describe('the published Notice assertive', () => {
  it('draws role="alert" with no aria-live at the danger tone, the default and a tone outside the set', async () => {
    for (const tone of [undefined, 'danger', 'crimson']) {
      const { target, handle } = mountEntry('Notice', { ...FAULT, tone, assertive: true });
      await settle();
      assert.deepEqual(announcing(target.firstElementChild), ['alert', null], String(tone));
      handle.destroy();
    }
  });

  it('draws the polite status at every other tone, for false and for anything but the boolean true', async () => {
    const cases = [
      ...['warning', 'info', 'success', 'accent'].map((tone) => [{ tone, assertive: true }, tone]),
      ...[false, 'true', 1, 'yes', null].map((assertive) => [{ assertive }, String(assertive)]),
    ];
    for (const [props, label] of cases) {
      const { target, handle } = mountEntry('Notice', { ...FAULT, ...props });
      await settle();
      assert.deepEqual(announcing(target.firstElementChild), ['status', 'polite'], label);
      handle.destroy();
    }
  });

  it('inserts the alert already holding its role and title in one insertion, and changes nothing inside it after', async () => {
    const target = freshTarget();
    const handle = await recordInsertion(target, () =>
      ui().mount('Notice', { target, props: { ...FAULT, assertive: true } })
    ).then(({ result, findings }) => {
      assert.deepEqual(findings, [], 'one insertion, complete when made');
      return result;
    });
    handle.destroy();
  });

  it('the insertion check fails an alert inserted empty and filled after', async () => {
    const target = freshTarget();
    const { findings } = await recordInsertion(target, async () => {
      const alert = document.createElement('div');
      alert.className = 'fab-notice';
      alert.setAttribute('role', 'alert');
      target.append(alert);
      await settle();
      alert.textContent = FAULT.title;
    });
    assert.deepEqual(findings, [
      'the alert was inserted without its text',
      'a childList change inside the alert',
    ]);
  });

  it('keeps the role the mount drew across an update that changes assertive or tone, on the same root', async () => {
    for (const [first, next, role] of [
      [{ assertive: true }, { assertive: false }, 'alert'],
      [{ assertive: true }, { assertive: true, tone: 'warning' }, 'alert'],
      [{ assertive: false }, { assertive: true }, 'status'],
      [{ tone: 'warning', assertive: true }, { tone: 'danger', assertive: true }, 'status'],
    ]) {
      const { target, handle } = mountEntry('Notice', { ...FAULT, ...first });
      await settle();
      const root = target.firstElementChild;
      assert.equal(handle.update({ ...FAULT, ...next }), true);
      await settle();
      assert.ok(target.firstElementChild === root, 'the same root');
      assert.equal(root.getAttribute('role'), role, JSON.stringify([first, next]));
      if (next.tone) assert.ok(root.classList.contains(`is-${next.tone}`), 'the tone repaints');
      handle.destroy();
    }
  });

  it('refuses a function for assertive (M10)', () => {
    const target = freshTarget();
    assert.throws(
      () => ui().mount('Notice', { target, props: { ...FAULT, assertive: () => true } }),
      { name: 'TypeError', message: `${REFUSAL}"assertive" must not hold a function` }
    );
    assert.equal(target.childNodes.length, 0);
  });
});
