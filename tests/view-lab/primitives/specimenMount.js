/**
 * Primitive Lab specimen boot: `specimen.html` runs this inside one `<iframe>`. It receives one
 * catalogue row over the `specimenProtocol.js` handshake, installs its own Foundry shim (an iframe
 * is a separate realm), mounts the component and reports its size to `mount.js`.
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
 * Report the observed size: the first callback as MOUNTED, every later one as RESIZE.
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

/** Render a mount failure styled inline, with no dependency on any stylesheet. */
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

  // After mounting, so a late web-font swap is in the first reported size.
  await document.fonts.ready;

  if (box) {
    const problem = describeCollapsedSlot(row, frame);
    if (problem) throw new Error(problem);
  }

  // A default slot measures the component's natural box; a boxed slot measures the declared box.
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
