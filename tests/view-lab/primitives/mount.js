/**
 * Primitive Lab boot.
 *
 * Vite serves this module into `tests/view-lab/primitives.html`. It proves the harvested chrome is
 * being served, renders `openspec/specs/design-system/library.html` as the page, and stands up an
 * isolated `<iframe>` for every hand-drawn specimen the catalogue has a mapping for.
 *
 * ── THE PAGE LOADS NO FOUNDRY STYLESHEET AT ALL (issue 1487) ──────────────────────────────────
 *
 * `primitives.html` links the library's own stylesheet and `styles/fabricate.css` (for its
 * `--fab-*` tokens ONLY — see `primitives.html` for why that file has no bare-element rule to
 * repeat the mistake with) and nothing else. That is the whole fix for the regression this change
 * addresses: `foundry2.css` loaded UNLAYERED alongside the library used to reach every one of the
 * library's 948 hand-drawn elements — a bare `<table>`, a bare `<button>`, a bare heading —
 * because `library.html` opened as a file never loads Foundry's stylesheet and its drawings are
 * unstyled by core, but this page's foundry2.css link painted them anyway. A `<DataTable>` entry
 * with no live specimen and no built component rendered with a header band and row striping the
 * reference never has, for exactly that reason.
 *
 * The fix is not a reset that neutralises core across those 948 elements — that was considered and
 * rejected: hand-derived, drifts as Foundry changes, and it would falsify the LIVE specimens in the
 * same subtree too. It is this: stop loading `foundry2.css` on this page at all, and give every
 * live specimen its OWN document that carries the production cascade itself. `specimen.html` is
 * that document; `slot.js`'s docblock covers what moved there and why an iframe is structurally
 * more faithful than the old shared-page `display: contents` slot, not less.
 *
 * ── THE PAGE SIGNALS COMPLETION WITH THREE ATTRIBUTES ON `<body>` ─────────────────────────────
 *
 *   data-primitive-lab-mounted   how many catalogue ROWS mounted. A count, and a POSITIVE one,
 *                                because the thing a driver has to be able to distinguish is
 *                                "everything mounted" from "nothing was rendered at all" — and an
 *                                error attribute reading 0 says the same thing in both cases. It is
 *                                compared by equality against a number Node derives from the
 *                                catalogue, so a specimen that quietly stopped being rendered fails
 *                                rather than passing more quickly.
 *   data-primitive-lab-ready     ABSENT until every iframe has reported mounted or errored.
 *                                Present with no value once it has, success or failure.
 *   data-primitive-lab-error     ABSENT while nothing has failed. Present, naming how many failed
 *                                and which, as soon as one has. Presence IS the failure signal —
 *                                it never reads `0`, because `'0'` is a truthy string and a
 *                                consumer testing the attribute would reject a healthy page.
 *
 * ── EACH SPECIMEN'S IFRAME ALSO NAMES ITSELF, ON ITSELF ───────────────────────────────────────
 *
 *   data-primitive-lab-specimen  the catalogue row's `path`, on the `<iframe>` element itself — not
 *                                inside its document. `scripts/primitive-lab-smoke.mjs` reads this
 *                                with `document.querySelectorAll` against the TOP-LEVEL document
 *                                only (Playwright's `page.evaluate` does not reach into a child
 *                                frame's DOM), so the identity marker has to live on the element
 *                                standing IN the page, which is now the iframe rather than a
 *                                mounted wrapper div. `LiveSpecimen.svelte` still stamps the same
 *                                attribute on its own root inside the iframe's document, which
 *                                keeps that half of the contract exactly as documented there — it
 *                                is simply not the copy this smoke reads.
 *
 * ── AND IT FAILS CLOSED ON A MISSING CHROME HARVEST ───────────────────────────────────────────
 *
 * `scripts/lib/foundryChromeCache.js` already rules on this for the View Lab: it "never renders
 * half-chrome — a frame drawn without the real cascade is worse than no frame, because it looks
 * authoritative". The same rule binds here: a missing harvest 503s the entire `/@foundry-chrome/`
 * prefix, which every specimen iframe depends on to render correctly, so the stylesheet is PROBED
 * before a single iframe is created and a non-2xx renders the harvest instructions as the body and
 * mounts nothing.
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
 * Confirm the harvested chrome is being served.
 *
 * The probe is the STYLESHEET rather than the status endpoint, because the stylesheet is the thing
 * that has to arrive. A status endpoint answering "available" while the mount 404s a path is a
 * state the page must not boot in, and reading the artifact itself is the only check that cannot
 * be right about the wrong thing.
 *
 * @returns {Promise<void>}
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

/**
 * Render the fail-closed message, and nothing else.
 *
 * Styled inline, in a system font, with no dependency on any stylesheet: this is the one thing on
 * the page that has to render correctly when the cascade is the thing that is missing.
 *
 * @param {string} message The harvest instructions.
 */
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

/**
 * Publish the page's own report onto `<body>`.
 *
 * @param {{mounted: number, problems: string[]}} report What mounted, and what did not.
 */
function publishReport({ mounted, problems }) {
  document.body.setAttribute(MOUNTED_ATTRIBUTE, String(mounted));
  if (problems.length === 0) document.body.removeAttribute(ERROR_ATTRIBUTE);
  else document.body.setAttribute(ERROR_ATTRIBUTE, `${problems.length}: ${problems.join(' | ')}`);
  document.body.setAttribute(READY_ATTRIBUTE, '');
}

/**
 * Honour `?mount=all` — which this page satisfies by already having done it.
 *
 * WITHOUT THE QUERY: every catalogued row is mounted. The page is the library, top to bottom, and
 * there is no selection to switch out of — so there is no partial mode for the query to enable.
 *
 * WITH THE QUERY: nothing changes. It is an explicit no-op, stated rather than inferred, because
 * `scripts/primitive-lab-smoke.mjs` navigates with it and a reader who found the query there and
 * no mention of it here would have to read the whole boot to discover it was already satisfied.
 *
 * ANY OTHER VALUE IS REFUSED rather than ignored, and that is what keeps the no-op honest. A page
 * that answered `?mount=controls` by mounting everything would report a partial request as a
 * complete catalogue, and the refusal costs one comparison.
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

/**
 * Adopt the library's own body into this document, and install its stylesheet.
 *
 * The `<style>` is appended to `<head>` after the library's own load — there is nothing else to
 * beat, since this page links no other stylesheet at all. Svelte's own injected component blocks
 * only ever land inside a specimen's OWN document now, so there is no ordering concern with them
 * here either.
 *
 * @param {{body: HTMLElement, css: string}} library The parsed library.
 */
function renderLibrary(library) {
  const style = document.createElement('style');
  style.dataset.plLibrary = '';
  style.textContent = library.css;
  document.head.append(style);
  // `adoptNode` DETACHES the node from the parsed document, so reading `firstChild` again each
  // time walks the whole list — where a `for…of` over the live `childNodes` would skip every
  // second node as the collection shrank under it.
  while (library.body.firstChild) document.body.append(document.adoptNode(library.body.firstChild));
}

/**
 * Apply a specimen's reported size to its `<iframe>`, and reveal it once sized.
 *
 * @param {HTMLIFrameElement} iframe The specimen's frame.
 * @param {{width: number, height: number}} size The iframe's own report.
 */
function applySize(iframe, { width, height }) {
  iframe.style.width = `${width}px`;
  iframe.style.height = `${height}px`;
  iframe.classList.add(SIZED_CLASS);
}

/**
 * Stand up one specimen: create its `<iframe>`, place it where the drawing stood, run the
 * handshake `specimenProtocol.js` describes, and resolve once it has settled.
 *
 * @param {{host: Element, row: object}} slot One resolved slot.
 * @param {string[]} problems The collector.
 * @param {{mounted: number}} results Mutated in place: `mounted` is incremented once per settled,
 *   successfully-mounted iframe.
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
  // BEFORE the chrome probe: this one is a read of the request itself, and a page asked for a mode
  // it does not have should say so rather than spend a harvest check answering a question nobody
  // asked.
  requireSupportedMountMode();
  await requireChrome();

  // `PAGE_CLASS` is the `@scope` root every library rule hangs off, so it still has to be on
  // `<body>` — see `primitives.html` for the one other stylesheet this page loads
  // (`styles/fabricate.css`, for its `--fab-*` tokens only; it has no bare-element rule to scope
  // against in the first place).
  document.body.classList.add(PAGE_CLASS);

  renderLibrary(await readLibrary());

  const { slots, problems } = resolveSlots(document.body, CATALOGUE);
  const results = { mounted: 0 };
  // EVERY specimen settles before the report is published, exactly as every import used to be
  // awaited before any slot was drawn: a page that stopped waiting after the first iframe would be
  // reporting readiness in whatever order Chromium happened to schedule iframe navigations, not in
  // an order anyone can reason about.
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
