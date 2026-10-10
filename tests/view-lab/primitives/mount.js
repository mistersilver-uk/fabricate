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
import { MAX_APPLIED_RESIZES, createSizeGovernor, layoutFor } from './hostLayout.js';
import { resolveSlots } from './inject.js';
import { LIVE_CLASS, PAGE_CLASS, readLibrary } from './library.js';
import { placeSpecimen } from './liveness.js';
import { readSlotBox } from './slot.js';
import {
  SPECIMEN_ACT_DONE,
  SPECIMEN_ACT_GRANT,
  SPECIMEN_ACT_REQUEST,
  SPECIMEN_ASSIGN,
  SPECIMEN_ERROR,
  SPECIMEN_MOUNTED,
  SPECIMEN_READY,
  SPECIMEN_RECHECK,
  SPECIMEN_REACHED,
  SPECIMEN_RESIZE,
  createActTurns,
} from './specimenProtocol.js';
import { armReadyWatchdog } from './specimenWatchdog.js';
import { SILENT, standUpSlots } from './standUp.js';

/**
 * How many specimens load at once. Each fetches dozens of modules, and standing up the whole
 * catalogue together makes Chromium refuse hundreds with `net::ERR_INSUFFICIENT_RESOURCES`.
 */
const STAND_UP_POOL_SIZE = 12;

const MOUNTED_ATTRIBUTE = 'data-primitive-lab-mounted';
const READY_ATTRIBUTE = 'data-primitive-lab-ready';
const ERROR_ATTRIBUTE = 'data-primitive-lab-error';

/** The identity marker `npm run lab:check` reads off each specimen's `<iframe>`. */
const SPECIMEN_ATTRIBUTE = 'data-primitive-lab-specimen';

/** The drawing's width as measured before it was replaced, and `capped` when it has a `max-width`. */
const DRAWN_ATTRIBUTE = 'data-primitive-lab-drawn';
const CAPPED_ATTRIBUTE = 'data-primitive-lab-capped';

/** Applied once an iframe's measured size has been read and applied. See `page.css`. */
const SIZED_CLASS = 'pl-specimen-sized';

/** Applied while a block specimen fills the replaced drawing's inline size. See `page.css`. */
const FILL_CLASS = 'pl-specimen-fill';

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

/** Measure the live drawing and its parent for `layoutFor`, with the row's `inset` around them. */
function readHostLayout(host, row) {
  const parentStyle = getComputedStyle(host.parentElement);
  const style = getComputedStyle(host);
  return layoutFor(
    {
      display: style.display,
      maxWidth: style.maxWidth,
      drawnWidth: host.getBoundingClientRect().width,
      parent: {
        display: parentStyle.display,
        clientWidth: host.parentElement.clientWidth,
        paddingLeft: Number.parseFloat(parentStyle.paddingLeft),
        paddingRight: Number.parseFloat(parentStyle.paddingRight),
      },
    },
    row
  );
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

/**
 * Create one specimen's `<iframe>`, measure the drawing it stands for, and place it there with no
 * `src`, so the measurement sees every earlier slot placed and none yet sized.
 *
 * @param {{host: Element, row: object}} slot One resolved slot.
 * @returns {{slot: object, iframe: HTMLIFrameElement, host: object}} What `loadSpecimen` takes.
 */
function placeSpecimenFrame(slot) {
  const iframe = document.createElement('iframe');
  iframe.className = LIVE_CLASS;
  iframe.setAttribute(SPECIMEN_ATTRIBUTE, slot.row.path);
  iframe.title = `${slot.row.spec}: ${slot.row.path}`;
  const host = readHostLayout(slot.host, slot.row);
  iframe.setAttribute(DRAWN_ATTRIBUTE, String(slot.host.getBoundingClientRect().width));
  if (host.maxInlineSize !== 'none') iframe.setAttribute(CAPPED_ATTRIBUTE, '');
  // Before READY, so the first report is measured at the width the specimen will keep.
  if (host.presize) iframe.style.width = host.presize;
  presizeBoxedSlot(iframe, slot.row);
  placeSpecimen(slot, iframe, document, { spansRow: host.spansRow });
  return { slot, iframe, host };
}

/**
 * Grant or end a specimen's act turn, recording each specimen that acted for the re-checks.
 *
 * @returns {boolean} Whether `data` was an act-turn message.
 */
function onActMessage(data, iframe, row, acts) {
  if (data.type === SPECIMEN_ACT_REQUEST) {
    acts.acted.set(iframe, row);
    acts.turns.request(iframe, () =>
      iframe.contentWindow.postMessage({ type: SPECIMEN_ACT_GRANT }, globalThis.location.origin)
    );
    return true;
  }
  if (data.type !== SPECIMEN_ACT_DONE) return false;
  acts.turns.release(iframe);
  return true;
}

/** How long an acted specimen has to answer a re-check before its silence is the problem. */
const RECHECK_MS = 2000;

/** Ask one acted specimen whether its fixture's `reached` still holds. */
function askReached(iframe) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(null), RECHECK_MS);
    function finish(reached) {
      clearTimeout(timer);
      globalThis.removeEventListener('message', onMessage);
      resolve(reached);
    }
    function onMessage(event) {
      if (event.origin !== globalThis.location.origin) return;
      if (event.source !== iframe.contentWindow) return;
      if (event.data?.type === SPECIMEN_REACHED) finish(event.data.reached === true);
    }
    globalThis.addEventListener('message', onMessage);
    iframe.contentWindow.postMessage({ type: SPECIMEN_RECHECK }, globalThis.location.origin);
  });
}

/**
 * Re-ask every acted specimen's `reached`: a state an act reached can be undone by a later act or
 * a press, which the act's own check at mount cannot see. Each failure is a problem and an error.
 */
async function recheckActs(acted, problems, when) {
  const specimens = [...acted];
  const answers = await Promise.all(specimens.map(([iframe]) => askReached(iframe)));
  for (const [index, reached] of answers.entries()) {
    if (reached) continue;
    const [, row] = specimens[index];
    const problem =
      `${row.spec} / ${row.path}: fixture ${row.fixture} ` +
      (reached === null ? `did not answer the re-check ${when}` : `no longer holds ${when}`);
    console.error(`Fabricate Primitive Lab: ${problem}`);
    problems.push(problem);
  }
}

/**
 * Load one placed specimen and run the `specimenProtocol.js` handshake. The listener stays after
 * MOUNTED, because every later RESIZE is the same specimen re-measured.
 *
 * @param {{slot: object, iframe: HTMLIFrameElement, host: object}} placed From `placeSpecimenFrame`.
 * @param {string[]} problems The collector.
 * @param {{mounted: number}} results Mutated in place: `mounted` counts settled, mounted iframes.
 * @param {() => void} onReady Called when the specimen announces ready.
 * @param {{turns: object, acted: Map<HTMLIFrameElement, object>}} acts The page's act turns, and
 *   each specimen that acted with its row.
 * @returns {Promise<string|undefined>} Settles once mounted or errored, or as `SILENT`.
 */
function loadSpecimen({ slot, iframe, host }, problems, results, onReady, acts) {
  const admit = createSizeGovernor();
  const history = [];
  let runaway = false;
  let cancelWatchdog = () => {};

  const settled = new Promise((resolve) => {
    function onMessage(event) {
      if (event.origin !== globalThis.location.origin) return;
      if (event.source !== iframe.contentWindow) return;
      const data = event.data ?? {};
      if (onActMessage(data, iframe, slot.row, acts)) return;
      if (data.type === SPECIMEN_READY) {
        cancelWatchdog();
        onReady();
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
        // Its failure is already the problem; a re-check would only report it again as silent.
        acts.acted.delete(iframe);
        acts.turns.release(iframe);
        applySize(iframe, data, host);
        problems.push(`${slot.row.spec} / ${slot.row.path}: ${data.message}`);
        globalThis.removeEventListener('message', onMessage);
        resolve();
      }
    }
    globalThis.addEventListener('message', onMessage);
    iframe.src = SPECIMEN_URL;
    // Armed after `src`: the placed iframe's own `about:blank` load must not start the clock.
    cancelWatchdog = armReadyWatchdog(iframe, () => {
      problems.push(
        `${slot.row.spec} / ${slot.row.path}: its document never announced ready after loading. ` +
          'Either a module it imports failed to compile or import (the dev server log names the file), ' +
          'or the browser refused a request for lack of resources (the console shows ' +
          'net::ERR_INSUFFICIENT_RESOURCES).'
      );
      globalThis.removeEventListener('message', onMessage);
      resolve(SILENT);
    });
  });
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
  const acts = { turns: createActTurns(), acted: new Map() };
  // Every specimen settles before the report is published, a bounded few loading at a time.
  await standUpSlots(slots, {
    place: placeSpecimenFrame,
    load: (placed, onReady) => loadSpecimen(placed, problems, results, onReady, acts),
    poolSize: STAND_UP_POOL_SIZE,
    problems,
  });
  // A late font or container query re-measures a specimen; ready must not precede that.
  await whenSizesAreQuiet();
  await recheckActs(acts.acted, problems, 'after the last act');

  publishReport({ mounted: results.mounted, problems });
  const published = problems.length;
  await recheckActs(acts.acted, problems, 'after the page reported ready');
  if (problems.length > published) refreshProblems(problems);
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
