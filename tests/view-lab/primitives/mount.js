/**
 * Primitive Lab boot (issue 1487): render `library.html` as the page and stand up an isolated
 * `<iframe>` (`specimen.html`) for every drawing the catalogue maps, in its place or, for a name
 * the library does not yet record as shipped, beside it (`liveness.js`). This page links no
 * Foundry stylesheet, so core cannot repaint the library's drawings; each specimen carries the
 * cascade.
 *
 * `<body>` reports through three attributes `scripts/lib/primitiveLabSmoke.js` reads:
 * `data-primitive-lab-mounted` is the positive count of rows mounted, `data-primitive-lab-ready` is
 * absent until every iframe settles, and `data-primitive-lab-error` is present only on a failure.
 * Each iframe carries `data-primitive-lab-specimen` with its row's `path`, on the `<iframe>` itself
 * because the smoke's `page.evaluate` reads only this top document, never a specimen's realm.
 */
import MANIFEST from '../../../scripts/lib/designSystemPrimitives.json' with { type: 'json' };

import { CATALOGUE } from './catalogue.js';
import { MAX_APPLIED_RESIZES, createSizeGovernor, describeHost } from './hostLayout.js';
import { resolveSlots } from './inject.js';
import { LIVE_CLASS, PAGE_CLASS, readLibrary } from './library.js';
import { BESIDE } from './liveness.js';
import { readSlotBox } from './slot.js';
import {
  SPECIMEN_ASSIGN,
  SPECIMEN_ERROR,
  SPECIMEN_MOUNTED,
  SPECIMEN_READY,
  SPECIMEN_RESIZE,
} from './specimenProtocol.js';
import { armReadyWatchdog } from './specimenWatchdog.js';

const MOUNTED_ATTRIBUTE = 'data-primitive-lab-mounted';
const READY_ATTRIBUTE = 'data-primitive-lab-ready';
const ERROR_ATTRIBUTE = 'data-primitive-lab-error';

/** The identity marker `npm run lab:check` reads off each specimen's `<iframe>`. */
const SPECIMEN_ATTRIBUTE = 'data-primitive-lab-specimen';

/** Applied once an iframe's measured size has been read and applied. See `page.css`. */
const SIZED_CLASS = 'pl-specimen-sized';

/** Applied while a block specimen fills the replaced drawing's inline size. See `page.css`. */
const FILL_CLASS = 'pl-specimen-fill';

/** The label on a specimen standing beside its drawing, in the library's own status chip. */
const SHIPPED_LABEL_CLASS = 'st st-shipped pl-shipped-label';

/** The query parameter that says how much of the catalogue to mount. */
const MOUNT_PARAMETER = 'mount';

/** The only value it accepts — and what `scripts/primitive-lab-smoke.mjs` navigates with. */
const MOUNT_ALL_VALUE = 'all';

/** The stylesheet whose absence means no chrome. Probed, then linked by each specimen itself. */
const CHROME_PROBE_URL = '/@foundry-chrome/css/foundry2.css';

/** Where the dev server reports what it knows about the harvest. */
const CHROME_STATUS_URL = '/@primitive-lab/chrome-status';

/** The document one specimen's `<iframe>` navigates to. Carries no row of its own in its URL. */
const SPECIMEN_URL = '/tests/view-lab/primitives/specimen.html';

/**
 * Fail closed unless the harvested stylesheet itself is served; the status endpoint only supplies
 * the instructions.
 *
 * @throws {Error} With the harvest instructions when the chrome is not being served.
 */
async function requireChrome() {
  const probe = await fetch(CHROME_PROBE_URL, { method: 'GET' }).catch(() => null);
  if (probe?.ok) return;
  const status = await fetch(CHROME_STATUS_URL)
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  throw new Error(
    status?.message ??
      `Fabricate Primitive Lab: ${CHROME_PROBE_URL} answered ${probe?.status ?? 'nothing'}.\n` +
        'The harvested Foundry window chrome is not being served, so no specimen can be drawn ' +
        'against the real cascade.\n\nRun: npm run viewlab:chrome:harvest'
  );
}

/** Render the fail-closed message styled inline, since the cascade is what is missing. */
function renderMissingChrome(message) {
  const pre = document.createElement('pre');
  pre.style.cssText =
    'margin:0;padding:24px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;' +
    'color:#f4d9c0;background:#150f0f;min-height:100vh;white-space:pre-wrap';
  pre.textContent = message;
  document.body.replaceChildren(pre);
  document.body.setAttribute(MOUNTED_ATTRIBUTE, '0');
  document.body.setAttribute(ERROR_ATTRIBUTE, 'no chrome harvest');
  document.body.setAttribute(READY_ATTRIBUTE, '');
}

/** Publish the page's own report, what mounted and what did not, onto `<body>`. */
function publishReport({ mounted, problems }) {
  document.body.setAttribute(MOUNTED_ATTRIBUTE, String(mounted));
  if (problems.length === 0) document.body.removeAttribute(ERROR_ATTRIBUTE);
  else document.body.setAttribute(ERROR_ATTRIBUTE, `${problems.length}: ${problems.join(' | ')}`);
  document.body.setAttribute(READY_ATTRIBUTE, '');
}

/** Re-publish the error attribute when a problem arrives after the page already reported ready. */
function refreshProblems(problems) {
  if (!document.body.hasAttribute(READY_ATTRIBUTE)) return;
  document.body.setAttribute(ERROR_ATTRIBUTE, `${problems.length}: ${problems.join(' | ')}`);
}

/**
 * Accept no query or `?mount=all`, both of which mount every row, and refuse any other mode so a
 * partial request is never reported as the whole catalogue.
 *
 * @throws {Error} When the query names a mode this page does not have.
 */
function requireSupportedMountMode() {
  const requested = new URLSearchParams(globalThis.location.search).get(MOUNT_PARAMETER);
  if (requested === null || requested === MOUNT_ALL_VALUE) return;
  throw new Error(
    `Fabricate Primitive Lab: ?${MOUNT_PARAMETER}=${requested} is not a mode this page has. ` +
      `The only accepted value is ${MOUNT_ALL_VALUE}, and it is also what the page does with ` +
      'no query at all: the whole library is rendered and every catalogued row is mounted.'
  );
}

/** Adopt the library's own body into this document, and install its stylesheet. */
function renderLibrary(library) {
  const style = document.createElement('style');
  style.dataset.plLibrary = '';
  style.textContent = library.css;
  document.head.append(style);
  // `adoptNode` detaches the node, so re-reading `firstChild` walks the list without skipping.
  while (library.body.firstChild) document.body.append(document.adoptNode(library.body.firstChild));
}

/** When any iframe last took a new size, so ready can wait for the page to stop moving. */
let lastSizeChange = 0;

/** How long no iframe may change size before the page publishes ready. */
const QUIET_MS = 300;

/** The longest the page waits for quiet; a specimen still moving by then is the runaway cap's. */
const QUIET_BUDGET_MS = 4000;

/** Resolve once no applied size has changed for `QUIET_MS`, or the budget is spent. */
async function whenSizesAreQuiet() {
  const started = performance.now();
  while (
    performance.now() - lastSizeChange < QUIET_MS &&
    performance.now() - started < QUIET_BUDGET_MS
  ) {
    await new Promise((resolve) => setTimeout(resolve, QUIET_MS / 3));
  }
}

/**
 * Apply a specimen's reported size to its `<iframe>`, and reveal it once sized. A filling specimen
 * takes the replaced drawing's inline size (`page.css`), so only its height is the report's.
 */
function applySize(iframe, { width, height, fill = false }, host) {
  lastSizeChange = performance.now();
  iframe.classList.toggle(FILL_CLASS, fill);
  iframe.style.width = fill ? host.inlineSize : `${width}px`;
  iframe.style.maxWidth = fill && host.maxInlineSize !== 'none' ? host.maxInlineSize : '';
  iframe.style.height = `${height}px`;
  iframe.classList.add(SIZED_CLASS);
}

/** Read the live drawing's facts for `describeHost`. */
function readHostLayout(host) {
  const parent = host.parentElement;
  const parentStyle = getComputedStyle(parent);
  const style = getComputedStyle(host);
  return describeHost({
    display: style.display,
    maxWidth: style.maxWidth,
    drawnWidth: host.getBoundingClientRect().width,
    availableWidth:
      parent.clientWidth -
      Number.parseFloat(parentStyle.paddingLeft) -
      Number.parseFloat(parentStyle.paddingRight),
  });
}

/**
 * Give a boxed row's iframe its declared box before the specimen lays out, because the box is
 * the specimen's viewport: a fixed overlay centres in it and a popover flips and clamps against it.
 */
function presizeBoxedSlot(iframe, row) {
  let box;
  try {
    box = readSlotBox(row);
  } catch {
    return; // The specimen reports the malformed declaration itself.
  }
  if (box?.width) iframe.style.width = `${box.width}px`;
  if (box?.height) iframe.style.height = `${box.height}px`;
}

/** Put the specimen where its drawing stood, or after the kept drawing under a `shipped` label. */
function placeSpecimen(slot, iframe) {
  if (slot.mode !== BESIDE) {
    slot.host.replaceWith(iframe);
    return;
  }
  const label = document.createElement('span');
  label.className = SHIPPED_LABEL_CLASS;
  label.textContent = 'shipped';
  slot.host.after(label, iframe);
}

/**
 * Stand up one specimen: create its `<iframe>`, place it where the drawing stood, run the
 * `specimenProtocol.js` handshake, and resolve once it has settled. The listener stays after
 * MOUNTED, because every later RESIZE is the same specimen re-measured.
 *
 * @param {{host: Element, row: object}} slot One resolved slot.
 * @param {string[]} problems The collector.
 * @param {{mounted: number}} results Mutated in place: `mounted` counts settled, mounted iframes.
 * @returns {Promise<void>} Resolves once this iframe has mounted or reported an error.
 */
function standUpSpecimen(slot, problems, results) {
  const iframe = document.createElement('iframe');
  iframe.className = LIVE_CLASS;
  iframe.setAttribute(SPECIMEN_ATTRIBUTE, slot.row.path);
  iframe.title = `${slot.row.spec}: ${slot.row.path}`;
  const host = readHostLayout(slot.host);
  // Before READY, so the first report is measured at the width the specimen will keep.
  if (host.presize) iframe.style.width = host.presize;
  presizeBoxedSlot(iframe, slot.row);
  const admit = createSizeGovernor();
  const history = [];
  let runaway = false;
  let cancelWatchdog = () => {};

  const settled = new Promise((resolve) => {
    function onMessage(event) {
      if (event.origin !== globalThis.location.origin) return;
      if (event.source !== iframe.contentWindow) return;
      const data = event.data ?? {};
      if (data.type === SPECIMEN_READY) {
        cancelWatchdog();
        iframe.contentWindow.postMessage(
          { type: SPECIMEN_ASSIGN, row: slot.row, fill: host.fill },
          globalThis.location.origin
        );
        return;
      }
      if (data.type === SPECIMEN_MOUNTED) {
        admit(data, 'mounted');
        applySize(iframe, data, host);
        results.mounted += 1;
        resolve();
        return;
      }
      if (data.type === SPECIMEN_RESIZE) {
        if (runaway) return;
        const decision = admit(data, 'resize');
        history.push(`${data.width}x${data.height}`);
        if (decision === 'same') return;
        if (decision === 'runaway') {
          runaway = true;
          problems.push(
            `${slot.row.spec} / ${slot.row.path}: its size was still changing after ` +
              `${MAX_APPLIED_RESIZES} re-measures (reports ${history.slice(-6).join(', ')}). ` +
              'A height that follows its own iframe, such as `100vh` or `min-height: 100%`, ' +
              'grows without bound here: give the row a `slot` box or fix the specimen.'
          );
          refreshProblems(problems);
          return;
        }
        applySize(iframe, data, host);
        return;
      }
      if (data.type === SPECIMEN_ERROR) {
        applySize(iframe, data, host);
        problems.push(`${slot.row.spec} / ${slot.row.path}: ${data.message}`);
        globalThis.removeEventListener('message', onMessage);
        resolve();
      }
    }
    globalThis.addEventListener('message', onMessage);
    cancelWatchdog = armReadyWatchdog(iframe, () => {
      problems.push(
        `${slot.row.spec} / ${slot.row.path}: its document never announced ready after loading. ` +
          'A module it imports failed to compile or import; the dev server log names the file.'
      );
      globalThis.removeEventListener('message', onMessage);
      resolve();
    });
  });

  iframe.src = SPECIMEN_URL;
  placeSpecimen(slot, iframe);
  return settled;
}

async function boot() {
  requireSupportedMountMode();
  await requireChrome();

  // The `@scope` root every library rule hangs off.
  document.body.classList.add(PAGE_CLASS);

  renderLibrary(await readLibrary());

  const { slots, problems } = resolveSlots(document.body, CATALOGUE, [
    ...MANIFEST.designSystemPrimitives,
    ...MANIFEST.notAPrimitive,
  ]);
  const results = { mounted: 0 };
  // Every specimen settles before the report is published.
  await Promise.all(slots.map((slot) => standUpSpecimen(slot, problems, results)));
  // A late font or container query re-measures a specimen; ready must not precede that.
  await whenSizesAreQuiet();

  publishReport({ mounted: results.mounted, problems });
}

try {
  await boot();
} catch (error) {
  const message = String(error?.message ?? error);
  if (message.startsWith('Fabricate View Lab:') || message.includes('viewlab:chrome:harvest')) {
    renderMissingChrome(message);
  } else {
    console.error(error);
    document.body.setAttribute(MOUNTED_ATTRIBUTE, '0');
    document.body.setAttribute(ERROR_ATTRIBUTE, message);
    document.body.setAttribute(READY_ATTRIBUTE, '');
  }
}
