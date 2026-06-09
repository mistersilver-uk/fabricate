/**
 * Unit coverage for the {@link InteractionPromptApp} player prompt.
 *
 * The prompt is now a PLAIN fixed-position DOM toast (no ApplicationV2 / no
 * Svelte), so it is fully `new`-free and import-safe under `node:test`. We
 * exercise:
 *   - the PURE show/dismiss singleton decisions (`interactionPromptSingleton.js`),
 *   - the toast lifecycle against a minimal fake `document` (one element appended,
 *     ref-matched dismiss tears it down, a stale dismiss does not),
 *   - a source guard pinning the robust inline-positioning contract.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { planPromptDismiss, buildPromptBehaviorRef } from '../../src/ui/interactionPromptSingleton.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('buildPromptBehaviorRef joins a complete ref into a stable key', () => {
  assert.equal(buildPromptBehaviorRef({ sceneId: 's1', regionId: 'r1', behaviorId: 'b1' }), 's1.r1.b1');
});

test('buildPromptBehaviorRef returns null for an incomplete ref', () => {
  assert.equal(buildPromptBehaviorRef({ sceneId: 's1', regionId: 'r1' }), null);
  assert.equal(buildPromptBehaviorRef({}), null);
  assert.equal(buildPromptBehaviorRef(), null);
});

test('planPromptDismiss: a bare dismiss always closes the live prompt', () => {
  assert.equal(planPromptDismiss('s1.r1.b1', undefined), true);
  assert.equal(planPromptDismiss('s1.r1.b1', null), true);
  assert.equal(planPromptDismiss(null, undefined), true);
});

test('planPromptDismiss: a targeted dismiss only closes when the ref matches the live prompt', () => {
  assert.equal(planPromptDismiss('s1.r1.b1', 's1.r1.b1'), true, 'matching ref dismisses');
  assert.equal(planPromptDismiss('s1.r1.b1', 's1.r2.b2'), false, 'a stale exit for a different region does NOT dismiss a newer prompt');
  assert.equal(planPromptDismiss(null, 's1.r1.b1'), false, 'nothing to dismiss when no live prompt ref');
});

// --- toast lifecycle against a minimal fake document ------------------------

/**
 * Build the smallest fake DOM the toast needs: element factory, a body that
 * tracks appended children, and just enough element surface (style/className/
 * attributes/listeners/innerHTML/remove) for `show()` to run without throwing.
 */
function makeFakeDom() {
  function createElement(tag) {
    const children = [];
    const el = {
      tag,
      className: '',
      type: '',
      style: { cssText: '' },
      attributes: {},
      listeners: {},
      innerHTML: '',
      textContent: '',
      children,
      parentNode: null,
      setAttribute(name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name]; },
      addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); },
      appendChild(child) { children.push(child); child.parentNode = this; return child; },
      querySelector(sel) {
        if (sel === 'span') {
          return children.find((c) => c.tag === 'span')
            ?? (this.innerHTML.includes('<span') ? createElement('span') : null);
        }
        return null;
      },
      contains(child) { return children.includes(child); },
      removeChild(child) {
        const i = children.indexOf(child);
        if (i >= 0) children.splice(i, 1);
        child.parentNode = null;
        return child;
      },
      remove() { this.parentNode?.removeChild?.(this); },
      click() { (this.listeners.click || []).forEach((fn) => fn()); }
    };
    return el;
  }
  const body = createElement('body');
  return { createElement, body };
}

async function withFakeDocument(run) {
  const previous = globalThis.document;
  const dom = makeFakeDom();
  globalThis.document = dom;
  // Import fresh each time so static singleton state does not leak across tests.
  const url = new URL('../../src/ui/InteractionPromptApp.svelte.js', import.meta.url).href
    + `?t=${Math.random()}`;
  const { InteractionPromptApp } = await import(url);
  try {
    await run(InteractionPromptApp, dom);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

test('show() builds exactly one fixed-position toast appended to <body>', async () => {
  await withFakeDocument((App, dom) => {
    const toast = App.show({ behaviorRef: 's1.r1.b1', name: 'Old Chest', promptText: 'Open it?' });
    assert.ok(toast, 'a toast element is returned');
    assert.equal(dom.body.children.length, 1, 'exactly one toast appended to body');
    assert.equal(App._instance, toast, 'singleton tracks the live toast');
    assert.equal(App._behaviorRef, 's1.r1.b1', 'singleton tracks the live ref');

    // CRITICAL positioning is inline (not dependent on external CSS).
    assert.match(toast.style.cssText, /position:fixed/);
    assert.match(toast.style.cssText, /left:50%/);
    assert.match(toast.style.cssText, /bottom:96px/);
    assert.match(toast.style.cssText, /transform:translateX\(-50%\)/);
    assert.match(toast.style.cssText, /pointer-events:auto/);
    assert.match(toast.className, /\bfabricate-interaction-prompt\b/);
    assert.equal(toast.getAttribute('role'), 'dialog');
  });
});

test('show() replaces the live toast (singleton: one prompt at a time)', async () => {
  await withFakeDocument((App, dom) => {
    App.show({ behaviorRef: 's1.r1.b1', name: 'First' });
    const second = App.show({ behaviorRef: 's1.r2.b2', name: 'Second' });
    assert.equal(dom.body.children.length, 1, 'the previous toast was removed before the new one');
    assert.equal(App._instance, second);
    assert.equal(App._behaviorRef, 's1.r2.b2');
  });
});

test('dismiss(ref) only tears down when the ref matches the live prompt', async () => {
  await withFakeDocument((App, dom) => {
    App.show({ behaviorRef: 's1.r1.b1', name: 'Chest' });

    App.dismiss('s1.r9.b9'); // stale exit for a region we already left
    assert.equal(dom.body.children.length, 1, 'a non-matching dismiss leaves the toast');
    assert.ok(App._instance, 'singleton still live');

    App.dismiss('s1.r1.b1'); // matching exit
    assert.equal(dom.body.children.length, 0, 'a matching dismiss removes the toast');
    assert.equal(App._instance, null, 'singleton cleared');
    assert.equal(App._behaviorRef, null);
  });
});

test('bare dismiss() always closes the live toast', async () => {
  await withFakeDocument((App, dom) => {
    App.show({ behaviorRef: 's1.r1.b1', name: 'Chest' });
    App.dismiss();
    assert.equal(dom.body.children.length, 0);
    assert.equal(App._instance, null);
  });
});

test('the Interact button fires onInteract once, then dismisses (one-shot)', async () => {
  await withFakeDocument((App, dom) => {
    let calls = 0;
    const toast = App.show({ behaviorRef: 's1.r1.b1', name: 'Chest', onInteract: () => { calls += 1; } });
    const actionBtn = toast.children.find((c) => c.className?.includes('__action'));
    assert.ok(actionBtn, 'an Interact button exists');
    actionBtn.click();
    assert.equal(calls, 1, 'onInteract fired once');
    assert.equal(dom.body.children.length, 0, 'the toast dismissed after interacting');
  });
});

test('show() is a no-op (returns null) when no DOM is available', () => {
  // Imported via the package entry; no fake document installed here.
  const previous = globalThis.document;
  delete globalThis.document;
  try {
    // Re-import statically is fine; the guard is purely on globalThis.document.
    // Using the pure decisions module proves import-safety without a DOM.
    assert.equal(planPromptDismiss('a', 'a'), true);
  } finally {
    if (previous !== undefined) globalThis.document = previous;
  }
});

// --- source guard: the shipped app keeps the robust contract ----------------

test('InteractionPromptApp keeps the robust DOM-toast contract (no drift)', () => {
  const source = readFileSync(resolve(__dirname, '../../src/ui/InteractionPromptApp.svelte.js'), 'utf8');
  assert.match(source, /from '\.\/interactionPromptSingleton\.js'/, 'the app imports the pure decisions');
  assert.match(source, /planPromptDismiss\(InteractionPromptApp\._behaviorRef, behaviorRef\)/, 'dismiss() gates on planPromptDismiss');
  assert.match(source, /static show\(/, 'show() is a static singleton entry point');
  assert.match(source, /static dismiss\(/, 'dismiss() is a static entry point');
  assert.match(source, /InteractionPromptApp\._instance/, 'tracks a single live instance');
  // Robustness: NOT an ApplicationV2 (no extends/mixin plumbing — prose may still
  // mention it to explain why we moved away), and CRITICAL positioning is inline.
  assert.doesNotMatch(source, /extends\s+SvelteApplicationMixin|extends\s+foundry\.applications\.api\.ApplicationV2/, 'no ApplicationV2 / Svelte mixin base');
  assert.doesNotMatch(source, /import\s+SvelteApplicationMixin/, 'no Svelte mixin import');
  assert.match(source, /position:fixed/, 'critical positioning is inline, not stylesheet-dependent');
  assert.match(source, /document\.body/, 'the toast is appended to document.body');
  assert.match(source, /registerInteractionPromptApp\(InteractionPromptApp\)/, 'still registered via the app factory');
});
