/**
 * Primitive Lab specimen boot: `specimen.html` runs this inside one `<iframe>`. It receives one
 * catalogue row over the `specimenProtocol.js` handshake, installs its own Foundry shim (an iframe
 * is a separate realm), mounts the component and reports its size to `mount.js`.
 */
import { mount } from 'svelte';

import { FABRICATE_THEME_ATTRIBUTE, FABRICATE_THEME_IDS } from '../../../src/ui/theme.js';
import { configureLabPage } from '../foundryFrame.js';
import { createLocalizer, toI18nStub } from '../labI18n.js';

import { loadComponent } from './importers.js';
import { installPrimitiveLabFoundry } from './labFoundry.js';
import LiveSpecimen from './LiveSpecimen.svelte';
import {
  applySlotBox,
  buildSpecimenFrame,
  describeCollapsedSlot,
  readSlotBox,
  readSlotInset,
} from './slot.js';
import {
  SPECIMEN_ASSIGN,
  SPECIMEN_ERROR,
  SPECIMEN_MOUNTED,
  SPECIMEN_READY,
  SPECIMEN_RESIZE,
} from './specimenProtocol.js';
import { readSpecimenSnippets } from './specimenSnippets.js';

/** A fallback box, big enough to show the printed error message, when mounting fails. */
const ERROR_BOX = Object.freeze({ width: 420, height: 120 });

/** Post a plain, structured-clonable message to the parent frame. */
function postToParent(message) {
  globalThis.parent.postMessage(message, globalThis.location.origin);
}

/**
 * Announce readiness, and wait for the parent to hand back this iframe's one catalogue row.
 *
 * @returns {Promise<{row: object, fill: boolean}>} The assigned row, and whether the drawing it
 *   replaces was block-level.
 */
function waitForAssignment() {
  return new Promise((resolve) => {
    function onMessage(event) {
      if (event.origin !== globalThis.location.origin) return;
      if (event.source !== globalThis.parent) return;
      if (event.data?.type !== SPECIMEN_ASSIGN) return;
      globalThis.removeEventListener('message', onMessage);
      resolve({ row: event.data.row, fill: event.data.fill === true });
    }
    globalThis.addEventListener('message', onMessage);
    postToParent({ type: SPECIMEN_READY });
  });
}

/**
 * Whether the specimen renders a block-level box, looking through `display: contents` wrappers.
 *
 * @param {Element} parent The `.pl-specimen` wrapper, or a `contents` element inside it.
 * @returns {boolean} True when any rendered child is block-level rather than inline-level.
 */
function rendersBlock(parent) {
  return [...parent.children].some((child) => {
    const { display } = getComputedStyle(child);
    if (display === 'contents') return rendersBlock(child);
    return display !== 'none' && !display.startsWith('inline');
  });
}

/**
 * Report the observed size: the first callback as MOUNTED, every later one as RESIZE.
 *
 * @param {Element} target The `.pl-specimen` wrapper (default slot) or `.application` (boxed).
 * @param {boolean} fill Whether the parent sizes the inline axis, so only the height is the report.
 * @returns {Promise<void>} Resolves once the first (MOUNTED) report has been sent.
 */
function reportSize(target, fill) {
  return new Promise((resolve) => {
    let reported = false;
    const observer = new ResizeObserver((entries) => {
      const [entry] = entries;
      const borderBox = entry.borderBoxSize?.[0];
      const width = borderBox ? borderBox.inlineSize : entry.contentRect.width;
      const height = borderBox ? borderBox.blockSize : entry.contentRect.height;
      const size = { width: Math.ceil(width), height: Math.ceil(height), fill };
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
  const { row, fill: hostIsBlock } = await waitForAssignment();
  const box = readSlotBox(row);
  const inset = readSlotInset(row);

  const i18n = toI18nStub(await createLocalizer());
  installPrimitiveLabFoundry(i18n);
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
      snippets: readSpecimenSnippets(row),
    },
  });

  // After mounting, so a late web-font swap is in the first reported size.
  await document.fonts.ready;

  if (box) {
    const problem = describeCollapsedSlot(row, frame);
    if (problem) throw new Error(problem);
  }

  // A default slot measures the component's natural box; a boxed slot measures the declared box.
  const wrapper = root.querySelector('.pl-specimen');
  if (inset) wrapper.style.padding = `${inset}px`;
  const fill = !box && hostIsBlock && rendersBlock(wrapper);
  document.body.classList.toggle('pl-fill', fill);
  await reportSize(box ? frame : wrapper, fill);
}

try {
  await boot();
} catch (error) {
  const message = String(error?.message ?? error);
  console.error(error);
  renderError(message);
  postToParent({ type: SPECIMEN_ERROR, message, ...ERROR_BOX });
}
