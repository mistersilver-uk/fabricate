/**
 * Primitive Lab boot.
 *
 * Vite serves this module into `tests/view-lab/primitives.html`. It proves the harvested chrome is
 * being served, installs the Foundry globals a shared component reads, renders
 * `openspec/specs/design-system/library.html` as the page, and swaps each hand-drawn specimen the
 * catalogue has a mapping for for the real component.
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
 *   data-primitive-lab-ready     ABSENT until the page has finished. Present with no value once it
 *                                has, success or failure.
 *   data-primitive-lab-error     ABSENT while nothing has failed. Present, naming how many failed
 *                                and which, as soon as one has. Presence IS the failure signal —
 *                                it never reads `0`, because `'0'` is a truthy string and a
 *                                consumer testing the attribute would reject a healthy page.
 *                                Absence-means-well is also the convention
 *                                `tests/view-lab/mount.js` already uses for `data-view-lab-error`.
 *
 * ── EACH ROW'S SPECIMEN ALSO NAMES ITSELF ─────────────────────────────────────────────────────
 *
 *   data-primitive-lab-specimen  the catalogue row's `path`, on exactly one wrapper per ROW. The
 *                                count above can then be checked for IDENTITY rather than only for
 *                                size, because a page that mounted the right NUMBER of the wrong
 *                                components reports a count indistinguishable from a correct one.
 *                                `describeMountFailure` compares the two sets by membership, so a
 *                                path drawn eleven times — `<Button>` alone is — is expected and
 *                                agrees, while the equality on the COUNT is what makes a missing
 *                                one fail. `LiveSpecimen.svelte` holds the one-element-per-row rule.
 *
 * ── AND IT FAILS CLOSED ON A MISSING CHROME HARVEST ───────────────────────────────────────────
 *
 * `scripts/lib/foundryChromeCache.js` already rules on this for the View Lab: it "never renders
 * half-chrome — a frame drawn without the real cascade is worse than no frame, because it looks
 * authoritative". The same rule binds here, and harder, because this page's whole subject is how
 * components are painted. A missing harvest 503s the entire `/@foundry-chrome/` prefix, which takes
 * out `foundry2.css` — so no `@layer reset`, plus all of Font Awesome, every `:root` custom
 * property Foundry sets, and `/icons/`. Every specimen would still render. Every one of them would
 * be wrong, and none would say so.
 *
 * So the stylesheet is PROBED before anything is mounted, and a non-2xx renders the harvest
 * instructions as the body and mounts nothing.
 *
 * ── WHY EACH LIVE SLOT CARRIES A PRODUCTION WINDOW SUBTREE THAT DRAWS NOTHING ─────────────────
 *
 * Every slot is `.application.fabricate.crafting-system-manager > section.window-content >
 * .fabricate-manager`, and `page.css` gives all three `display: contents`. That is not ceremony:
 * each one supplies something a bare root loses, silently, against the harvested 14.365 chrome.
 *
 *   - `foundry2.css:6997` — `.application { font-size: var(--font-size-14) }`, against
 *     `foundry2.css:13936`'s `body { font-size: var(--font-size-15) }`. Without it every unsized
 *     Fabricate text renders at 15px where production renders 14px, and `styles/fabricate.css`
 *     names "Foundry's 14px `.application` base" by hand in five places.
 *   - `foundry2.css:351` — a ten-token custom-property block declared on `.application`
 *     (`--color-fieldset-border`, `--color-form-label`, …). `RadioCardGroup` renders a `fieldset`,
 *     which `foundry2.css:5290` borders with one of them, and `styles/fabricate.css` references
 *     none of the ten — so the loss is invisible to any Fabricate-side grep.
 *   - `styles/fabricate.css:1136` — the bare-heading reset is scoped
 *     `.fabricate :where(.window-content) h1…h6`, because core's `@layer elements` styles bare
 *     headings and core's own antidote is V1-only.
 *   - `.fabricate-manager` is what 2821 descendant selectors in `styles/fabricate.css` require, and
 *     `.fabricate[data-fabricate-theme]` is what puts the theme's tokens in scope on a subtree
 *     rather than on the document (`applyFabricateTheme()` writes the document root and would
 *     repaint the whole page).
 *
 * `display: contents` is the disclosed deviation, and it buys the one thing the plinth version of
 * this page could not have: a specimen that sits in the library's own dense layout with no window
 * chrome around it. What it costs is stated rather than hidden — the frame is no longer a
 * containing block (`overlayHost.js` relies on `.application` being positioned) and
 * `.fabricate-manager` is no longer a query container, so an overlay or a container-query breakpoint
 * cannot be judged from this page. No Controls entry reaches either.
 */
import { mount } from 'svelte';

import { FABRICATE_THEME_ATTRIBUTE, FABRICATE_THEME_IDS } from '../../../src/ui/theme.js';
import { installFoundryShim } from '../foundry/installFoundryShim.js';
import { createMinimalLabWorld } from '../foundry/minimalLabWorld.js';
import { configureLabPage } from '../foundryFrame.js';
import { createLocalizer, toI18nStub } from '../labI18n.js';

import { CATALOGUE } from './catalogue.js';
import { loadComponent } from './importers.js';
import { resolveSlots } from './inject.js';
import { LIVE_CLASS, PAGE_CLASS, readLibrary } from './library.js';
import LiveSpecimen from './LiveSpecimen.svelte';

const MOUNTED_ATTRIBUTE = 'data-primitive-lab-mounted';
const READY_ATTRIBUTE = 'data-primitive-lab-ready';
const ERROR_ATTRIBUTE = 'data-primitive-lab-error';

/** The query parameter that says how much of the catalogue to mount. */
const MOUNT_PARAMETER = 'mount';

/** The only value it accepts — and what `scripts/primitive-lab-smoke.mjs` navigates with. */
const MOUNT_ALL_VALUE = 'all';

/** The stylesheet whose absence means no chrome. Probed, then linked by the page itself. */
const CHROME_PROBE_URL = '/@foundry-chrome/css/foundry2.css';

/** Where the dev server reports what it knows about the harvest. */
const CHROME_STATUS_URL = '/@primitive-lab/chrome-status';

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
 * The `<style>` is appended to `<head>` AFTER the three cascade links, so the library's unlayered
 * kit beats Foundry's layered sheet exactly as it does in the standalone file. Svelte's own
 * injected component blocks land later still, which is also production's order.
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
 * Build one live slot: the production window subtree, ready for a specimen.
 *
 * @returns {{live: HTMLElement, root: HTMLElement}} The slot, and the element to mount into.
 */
function createLiveSlot() {
  const live = document.createElement('div');
  live.className = LIVE_CLASS;
  const frame = document.createElement('div');
  frame.className = 'application fabricate crafting-system-manager';
  frame.setAttribute(FABRICATE_THEME_ATTRIBUTE, FABRICATE_THEME_IDS.FABRICATE);
  const content = document.createElement('section');
  content.className = 'window-content';
  const root = document.createElement('div');
  root.className = 'fabricate-manager';
  content.append(root);
  frame.append(content);
  live.append(frame);
  return { live, root };
}

/**
 * Resolve a row's component, reporting a bad path as a row defect rather than a page failure.
 *
 * @param {object} row A catalogue row.
 * @param {string[]} problems The collector.
 * @returns {Promise<unknown|null>} The component, or null when the row named nothing.
 */
async function toComponent(row, problems) {
  try {
    return await loadComponent(row.path);
  } catch (error) {
    problems.push(`${row.spec} / ${row.path}: ${String(error?.message ?? error)}`);
    return null;
  }
}

async function boot() {
  // BEFORE the chrome probe: this one is a read of the request itself, and a page asked for a mode
  // it does not have should say so rather than spend a harvest check answering a question nobody
  // asked.
  requireSupportedMountMode();
  await requireChrome();

  const i18n = toI18nStub(await createLocalizer());
  installFoundryShim(createMinimalLabWorld({ i18n }));

  // configureLabPage REPLACES `document.body.className` outright (it reproduces Foundry's own
  // `<body class="vtt game system-… theme-…">`), so anything the page needs on the body has to be
  // added AFTER it or it is silently discarded — and `PAGE_CLASS` is the `@scope` root every
  // library rule hangs off, so losing it would leave the page unstyled.
  configureLabPage();
  document.body.classList.add(PAGE_CLASS);

  renderLibrary(await readLibrary());

  const { slots, problems } = resolveSlots(document.body, CATALOGUE);
  // EVERY import is awaited before ANY slot is drawn. Mounting as each chunk lands would make the
  // page settle in an order Vite's optimiser decides, so a run that timed out would be reporting
  // the module graph rather than the catalogue — and readiness would have to be counted rather
  // than simply reached.
  const components = new Map(
    await Promise.all(slots.map(async (slot) => [slot, await toComponent(slot.row, problems)]))
  );

  let mounted = 0;
  for (const slot of slots) {
    const component = components.get(slot);
    if (!component) continue;
    const { live, root } = createLiveSlot();
    slot.host.replaceWith(live);
    mount(LiveSpecimen, {
      target: root,
      props: {
        path: slot.row.path,
        component,
        props: slot.row.props ?? {},
        content: slot.row.content ?? null,
      },
    });
    mounted += 1;
  }

  publishReport({ mounted, problems });
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
