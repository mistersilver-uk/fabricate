/**
 * Primitive Lab boot.
 *
 * Vite serves this module into `tests/view-lab/primitives.html`. It proves the harvested chrome is
 * being served, installs the Foundry globals a shared component reads, derives the page model from
 * the manifest and the library, measures the theme vocabulary out of the real cascade, and mounts
 * the harness.
 *
 * ── THE PAGE SIGNALS COMPLETION WITH THREE ATTRIBUTES ON `<body>` ─────────────────────────────
 *
 *   data-primitive-lab-mounted   how many DISTINCT catalogued components mounted. A count, and a
 *                                POSITIVE one, because the thing a driver has to be able to
 *                                distinguish is "everything mounted" from "nothing was rendered at
 *                                all" — and an error attribute reading 0 says the same thing in
 *                                both cases. It is compared by equality against a number Node
 *                                derives from the catalogue, so a specimen that quietly stopped
 *                                being rendered fails rather than passing more quickly.
 *   data-primitive-lab-ready     ABSENT until every specimen instance has settled. Present with no
 *                                value once they all have, success or failure.
 *   data-primitive-lab-error     ABSENT while nothing has failed. Present, naming how many failed
 *                                and which, as soon as one has. Presence IS the failure signal —
 *                                it never reads `0`, because `'0'` is a truthy string and a
 *                                consumer testing the attribute would reject a healthy page. That
 *                                is not hypothetical: it is what this attribute did on the first
 *                                integrated run, and `scripts/primitive-lab-smoke.mjs` rejected a
 *                                page that had mounted every specimen correctly. Absence-means-well
 *                                is also the convention `tests/view-lab/mount.js` already uses for
 *                                `data-view-lab-error`.
 *
 * ── EACH CATALOGUED ROW'S PLINTH ALSO NAMES ITSELF ────────────────────────────────────────────
 *
 *   data-primitive-lab-specimen  the catalogue row's `path`, on exactly one plinth per row. The
 *                                count above can then be checked for IDENTITY rather than only for
 *                                size, because a page that mounted the right NUMBER of the wrong
 *                                components reports a count indistinguishable from a correct one.
 *                                `Plinth.svelte` holds the one-element-per-path invariant and
 *                                `PrimitiveLab.svelte` decides which call site carries it.
 *
 * ── AND IT FAILS CLOSED ON A MISSING CHROME HARVEST ───────────────────────────────────────────
 *
 * `scripts/lib/foundryChromeCache.js` already rules on this for the View Lab: it "never renders
 * half-chrome — a frame drawn without the real cascade is worse than no frame, because it looks
 * authoritative". The same rule binds here, and harder, because this page's whole subject is how
 * components are painted. A missing harvest 503s the entire `/@foundry-chrome/` prefix, which takes
 * out `foundry2.css` — so no `@layer reset`, so no `* { box-sizing: border-box }`, which
 * `styles/fabricate.css` declares only 36 times in 24,850 lines — plus all of Font Awesome, every
 * `:root` custom property Foundry sets, and `/icons/`. Every specimen would still render. Every one
 * of them would be wrong, and none would say so.
 *
 * So the stylesheet is PROBED before anything is mounted, and a non-2xx renders the harvest
 * instructions as the body and mounts nothing.
 */
import { mount } from 'svelte';

import { installFoundryShim } from '../foundry/installFoundryShim.js';
import { createMinimalLabWorld } from '../foundry/minimalLabWorld.js';
import { configureLabPage } from '../foundryFrame.js';
import { createLocalizer, toI18nStub } from '../labI18n.js';

import { buildModel } from './model.js';
import PrimitiveLab from './PrimitiveLab.svelte';
import { readStateRules, readThemeTokenTable } from './tokens.js';

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
 * Publish one progress report onto `<body>`.
 *
 * READINESS COUNTS INSTANCES; THE MOUNTED ATTRIBUTE COUNTS COMPONENTS. They are different numbers
 * and the page needs both: the selected specimen is rendered once on the workbench, once per theme
 * and once per story cell, so `mounted` deduplicates by component path to stay comparable against a
 * count Node derives from the catalogue, while `settled` counts every instance so readiness cannot
 * be published while part of the page is still building itself.
 *
 * @param {{mounted: string[], failed: {instanceId: string, message: string}[], settled: number,
 *   expected: number}} progress What has settled so far, against the render plan.
 */
function publishProgress({ mounted, failed, settled, expected }) {
  document.body.setAttribute(MOUNTED_ATTRIBUTE, String(mounted.length));
  if (failed.length === 0) document.body.removeAttribute(ERROR_ATTRIBUTE);
  else {
    document.body.setAttribute(
      ERROR_ATTRIBUTE,
      `${failed.length}: ${failed
        .map((entry) => `${entry.instanceId} — ${entry.message}`)
        .join(' | ')}`
    );
  }
  if (settled >= expected && expected > 0) document.body.setAttribute(READY_ATTRIBUTE, '');
  else document.body.removeAttribute(READY_ATTRIBUTE);
}

/**
 * Honour `?mount=all` — which this page satisfies by already having done it.
 *
 * WITHOUT THE QUERY: every catalogued row is mounted. `PrimitiveLab.svelte`'s third region draws
 * one plinth per catalogue row, for every group, unconditionally. The rail's selection decides only
 * which row is ADDITIONALLY repeated on the workbench, across the seven-theme comparison row and
 * over the story matrix, so there is no selection-only mode for the query to switch out of.
 *
 * WITH THE QUERY: nothing changes. It is an explicit no-op, stated rather than inferred, because
 * `scripts/primitive-lab-smoke.mjs` navigates with it — it has to drive every specimen and will not
 * walk the rail — and a reader who found the query there and no mention of it here would have to
 * read the whole render plan to discover it was already satisfied.
 *
 * ANY OTHER VALUE IS REFUSED rather than ignored, and that is what keeps the no-op honest. A page
 * that answered `?mount=controls` by mounting all fifty-seven would report a partial request as a
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
      'no query at all: every catalogued row is mounted on its own plinth either way.'
  );
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
  // `<body class="vtt game system-… theme-…">`), so anything the harness needs on the body has to
  // be added AFTER it or it is silently discarded.
  configureLabPage();
  document.body.classList.add('pl-body');

  const [model, tokenTable] = await Promise.all([
    buildModel(),
    // Probed against `document.body`, which is emphatically NOT inside a Fabricate application
    // root. See `readThemeTokenTable`: a probe inside `.fabricate-manager` would be reached by
    // 2821 descendant rules a themed root in production never sees.
    readThemeTokenTable(document.body),
  ]);
  const stateRules = readStateRules();

  const target = document.createElement('div');
  document.body.append(target);
  mount(PrimitiveLab, {
    target,
    props: { model, tokenTable, stateRules, onProgress: publishProgress },
  });
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
