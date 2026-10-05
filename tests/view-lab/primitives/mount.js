/**
 * Primitive Lab boot (issue 1487): render `library.html` as the page and stand up an isolated
 * `<iframe>` (`specimen.html`) for every drawing the catalogue maps. This page links no Foundry
 * stylesheet, so core cannot repaint the library's drawings; each specimen carries the cascade.
 *
 * `<body>` reports through three attributes `scripts/lib/primitiveLabSmoke.js` reads:
 * `data-primitive-lab-mounted` is the positive count of rows mounted, `data-primitive-lab-ready` is
 * absent until every iframe settles, and `data-primitive-lab-error` is present only on a failure.
 * Each iframe carries `data-primitive-lab-specimen` with its row's `path`.
 */
import { CATALOGUE } from './catalogue.js';
import { resolveSlots } from './inject.js';
import { LIVE_CLASS, PAGE_CLASS, readLibrary } from './library.js';
import {
  SPECIMEN_ASSIGN,
  SPECIMEN_ERROR,
  SPECIMEN_MOUNTED,
  SPECIMEN_READY,
  SPECIMEN_RESIZE,
} from './specimenProtocol.js';

const MOUNTED_ATTRIBUTE = 'data-primitive-lab-mounted';
const READY_ATTRIBUTE = 'data-primitive-lab-ready';
const ERROR_ATTRIBUTE = 'data-primitive-lab-error';

/** The identity marker `npm run lab:check` reads off each specimen's `<iframe>`. */
const SPECIMEN_ATTRIBUTE = 'data-primitive-lab-specimen';

/** Applied once an iframe's measured size has been read and applied. See `page.css`. */
const SIZED_CLASS = 'pl-specimen-sized';

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

/** Apply a specimen's reported size to its `<iframe>`, and reveal it once sized. */
function applySize(iframe, { width, height }) {
  iframe.style.width = `${width}px`;
  iframe.style.height = `${height}px`;
  iframe.classList.add(SIZED_CLASS);
}

/**
 * Stand up one specimen: create its `<iframe>`, place it where the drawing stood, run the
 * `specimenProtocol.js` handshake, and resolve once it has settled.
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

  const settled = new Promise((resolve) => {
    globalThis.addEventListener('message', function onMessage(event) {
      if (event.source !== iframe.contentWindow) return;
      const data = event.data ?? {};
      if (data.type === SPECIMEN_READY) {
        iframe.contentWindow.postMessage(
          { type: SPECIMEN_ASSIGN, row: slot.row },
          globalThis.location.origin
        );
        return;
      }
      if (data.type === SPECIMEN_MOUNTED) {
        applySize(iframe, data);
        results.mounted += 1;
        globalThis.removeEventListener('message', onMessage);
        resolve();
        return;
      }
      if (data.type === SPECIMEN_RESIZE) {
        applySize(iframe, data);
        return;
      }
      if (data.type === SPECIMEN_ERROR) {
        applySize(iframe, data);
        problems.push(`${slot.row.spec} / ${slot.row.path}: ${data.message}`);
        globalThis.removeEventListener('message', onMessage);
        resolve();
      }
    });
  });

  iframe.src = SPECIMEN_URL;
  slot.host.replaceWith(iframe);
  return settled;
}

async function boot() {
  requireSupportedMountMode();
  await requireChrome();

  // The `@scope` root every library rule hangs off.
  document.body.classList.add(PAGE_CLASS);

  renderLibrary(await readLibrary());

  const { slots, problems } = resolveSlots(document.body, CATALOGUE);
  const results = { mounted: 0 };
  // Every specimen settles before the report is published.
  await Promise.all(slots.map((slot) => standUpSpecimen(slot, problems, results)));

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
