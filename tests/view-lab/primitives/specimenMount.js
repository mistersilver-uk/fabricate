/**
 * Primitive Lab specimen boot — the module `specimen.html` runs inside ONE `<iframe>`.
 *
 * This document mounts exactly one catalogue row's component, then reports its size back to
 * `mount.js` (the parent) and does nothing else. It never fetches the library, never resolves a
 * `draws` selector and never sees any row but its own: `mount.js` already resolved every address
 * and its own copy of `slot.js` before this document existed, so all that has to cross the frame
 * boundary is the ONE row this iframe stands up.
 *
 * ── THE HANDSHAKE, IN FULL ─────────────────────────────────────────────────────────────────────
 *
 * `specimenProtocol.js` names all five messages. In order: this module posts READY the moment it
 * is listening; the parent replies with ASSIGN, carrying the row; this module installs a minimal
 * Foundry shim, mounts `LiveSpecimen`, waits for fonts and layout to settle, and posts MOUNTED with
 * its measured size (or ERROR, with a fallback size, if any step throws). A `ResizeObserver` stays
 * attached afterward and posts RESIZE on any later change — a web font swap, most plausibly — so
 * the parent can keep the `<iframe>` sized correctly without this module ever polling.
 *
 * ── WHY EACH SPECIMEN INSTALLS ITS OWN FOUNDRY SHIM RATHER THAN SHARING ONE ───────────────────
 *
 * An iframe is a separate JavaScript realm with its own `globalThis`, so `game`/`Hooks`/`foundry`
 * installed in the parent document are simply not visible here — there is nothing to share. The
 * cost is real (every specimen re-fetches `lang/en.json`, which the browser's own HTTP cache
 * absorbs, and re-builds the same handful of plain objects `installFoundryShim` always built) but
 * it is the same cost `index.html` and `primitives.html` already pay once each; this only pays it
 * once per specimen instead of once per page.
 */
import { mount } from 'svelte';

import { FABRICATE_THEME_ATTRIBUTE, FABRICATE_THEME_IDS } from '../../../src/ui/theme.js';
import { installFoundryShim } from '../foundry/installFoundryShim.js';
import { createMinimalLabWorld } from '../foundry/minimalLabWorld.js';
import { configureLabPage } from '../foundryFrame.js';
import { createLocalizer, toI18nStub } from '../labI18n.js';

import { loadComponent } from './importers.js';
import LiveSpecimen from './LiveSpecimen.svelte';
import { applySlotBox, buildSpecimenFrame, describeCollapsedSlot, readSlotBox } from './slot.js';
import {
  SPECIMEN_ASSIGN,
  SPECIMEN_ERROR,
  SPECIMEN_MOUNTED,
  SPECIMEN_READY,
  SPECIMEN_RESIZE,
} from './specimenProtocol.js';

/** A fallback box, big enough to show the printed error message, when mounting fails. */
const ERROR_BOX = Object.freeze({ width: 420, height: 120 });

/**
 * Post a message to the parent frame.
 *
 * @param {object} message A plain, structured-clonable object.
 */
function postToParent(message) {
  globalThis.parent.postMessage(message, globalThis.location.origin);
}

/**
 * Announce readiness, and wait for the parent to hand back this iframe's one catalogue row.
 *
 * @returns {Promise<object>} The assigned row.
 */
function waitForAssignment() {
  return new Promise((resolve) => {
    function onMessage(event) {
      if (event.source !== globalThis.parent || event.data?.type !== SPECIMEN_ASSIGN) return;
      globalThis.removeEventListener('message', onMessage);
      resolve(event.data.row);
    }
    globalThis.addEventListener('message', onMessage);
    postToParent({ type: SPECIMEN_READY });
  });
}

/**
 * Watch the sized element and keep the parent informed.
 *
 * The FIRST callback is reported as MOUNTED (the parent counts it and reveals the iframe); every
 * later one is reported as RESIZE (the parent only re-sizes). `ResizeObserver`'s first callback
 * fires asynchronously once layout has actually settled, which is what lets this module report a
 * real size rather than one read a frame too early.
 *
 * @param {Element} target The `.pl-specimen` wrapper (default slot) or `.application` (boxed).
 * @returns {Promise<void>} Resolves once the first (MOUNTED) report has been sent.
 */
function reportSize(target) {
  return new Promise((resolve) => {
    let reported = false;
    const observer = new ResizeObserver((entries) => {
      const [entry] = entries;
      const borderBox = entry.borderBoxSize?.[0];
      const width = borderBox ? borderBox.inlineSize : entry.contentRect.width;
      const height = borderBox ? borderBox.blockSize : entry.contentRect.height;
      const size = { width: Math.ceil(width), height: Math.ceil(height) };
      if (reported) {
        postToParent({ type: SPECIMEN_RESIZE, ...size });
      } else {
        reported = true;
        postToParent({ type: SPECIMEN_MOUNTED, ...size });
        resolve();
      }
    });
    observer.observe(target);
  });
}

/**
 * Render the fail-closed message inline, with no dependency on any stylesheet — the same rule
 * `mount.js`'s `renderMissingChrome` follows, applied to a single-specimen failure instead of a
 * whole-page one.
 *
 * @param {string} message What went wrong.
 */
function renderError(message) {
  const pre = document.createElement('pre');
  pre.style.cssText =
    'margin:0;padding:12px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;' +
    'color:#f4d9c0;background:#150f0f;white-space:pre-wrap;box-sizing:border-box;' +
    `width:${ERROR_BOX.width}px;min-height:${ERROR_BOX.height}px`;
  pre.textContent = message;
  document.body.replaceChildren(pre);
}

async function boot() {
  const row = await waitForAssignment();
  const box = readSlotBox(row);

  const i18n = toI18nStub(await createLocalizer());
  installFoundryShim(createMinimalLabWorld({ i18n }));
  configureLabPage();

  const { frame, root } = buildSpecimenFrame({
    themeAttribute: FABRICATE_THEME_ATTRIBUTE,
    themeId: FABRICATE_THEME_IDS.FABRICATE,
  });
  if (box) applySlotBox(box, frame);
  document.body.append(frame);

  const component = await loadComponent(row.path);
  mount(LiveSpecimen, {
    target: root,
    props: {
      path: row.path,
      component,
      props: row.props ?? {},
      content: row.content ?? null,
    },
  });

  // AFTER mounting, so a web font that swaps in late is reflected in the first reported size
  // rather than racing it.
  await document.fonts.ready;

  if (box) {
    const problem = describeCollapsedSlot(row, frame);
    if (problem) throw new Error(problem);
  }

  // The default slot measures `.pl-specimen` (the component's own natural box — see
  // `specimenFrame.css`); a boxed slot measures `.application` itself, which is the box the row
  // declared.
  const measured = box ? frame : root.querySelector('.pl-specimen');
  await reportSize(measured);
}

try {
  await boot();
} catch (error) {
  const message = String(error?.message ?? error);
  console.error(error);
  renderError(message);
  postToParent({ type: SPECIMEN_ERROR, message, ...ERROR_BOX });
}
