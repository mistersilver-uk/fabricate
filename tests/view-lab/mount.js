/*
 * View Lab mount entry (issue 823, Design B/D/E).
 *
 * Vite serves this module; it mounts a case's REAL repository Svelte component
 * inside a lightweight Foundry application-frame wrapper, rendered over the
 * single-sourced compat CSS + bundled fonts + production `styles/fabricate.css` in
 * a real Blink engine. It reuses the Foundry-free `game.i18n` stub SHAPE from
 * `tests/helpers/svelte-component-harness.js` (localize/format) — it adds NO new
 * `game`/`CONFIG`/`ui`/`Hooks` scaffolding — and imports NOTHING from that harness
 * (Vite resolves the component graph itself, so the allowlist-hang risk never applies).
 *
 * Exposes `window.__FABRICATE_VIEW__ = { caseId, state, patchState(patch), whenReady() }`.
 */
import { mount, unmount } from 'svelte';

import { VIEW_CASES } from '../../scripts/lib/viewLabCases.js';
import { getFixture } from './fixtures.js';
import { REQUIRED_TEXT_FONTS, FA_FONT, assertFontsLoaded, browserFontSurface } from './fontPresence.js';

// Lazy importers for every component the registry can mount. `import.meta.glob`
// keys are absolute-from-Vite-root (`/src/…`); the registry stores `src/…`.
const COMPONENT_IMPORTERS = import.meta.glob('/src/ui/svelte/**/*.svelte');

function currentCaseId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('case') || (window.__VIEW_LAB_CASE__ ?? null);
}

function seedI18n(i18nMap = {}) {
  // The SAME stub shape installComponentTestGlobals uses, seeded with the fixture's
  // localized strings so a case can render real localized text (font-metric width
  // depends on it) instead of the bare key. `format` interpolates `{name}` tokens from
  // the seeded string so a `localize(key, { dc })` call paints "DC 15", not raw JSON.
  const resolve = (key) => (Object.prototype.hasOwnProperty.call(i18nMap, key) ? i18nMap[key] : key);
  window.game = {
    i18n: {
      localize: resolve,
      format: (key, data = {}) =>
        resolve(key).replace(/\{(\w+)\}/g, (whole, token) =>
          Object.prototype.hasOwnProperty.call(data, token) ? String(data[token]) : whole,
        ),
    },
  };
}

// Size the CAPTURED frame to the case viewport width so the width-sensitive cases
// exercise the width they name (a 320 narrow row stacks/wraps at 320, a 360 long-name
// row ellipsises at 360) — the frame is what `locator.screenshot()` captures, so a
// `max-content` frame would collapse below the viewport and the declared width would
// never bind.
function buildFrame(width) {
  const frame = document.createElement('div');
  frame.className = 'application theme-dark view-lab-frame';
  frame.setAttribute('data-view-lab-frame', '');
  if (Number.isFinite(width)) frame.style.width = `${width}px`;
  const content = document.createElement('section');
  content.className = 'window-content';
  const root = document.createElement('div');
  root.className = 'fabricate fabricate-manager view-lab-root';
  root.setAttribute('data-fabricate-theme', 'dark');
  const mountPoint = document.createElement('div');
  mountPoint.setAttribute('data-view-lab-mount', '');
  root.appendChild(mountPoint);
  content.appendChild(root);
  frame.appendChild(content);
  document.body.appendChild(frame);
  return mountPoint;
}

/**
 * Trigger loading of every bundled face. @font-face fonts load LAZILY (only when a
 * glyph is painted), so a case that does not happen to paint Spectral leaves it
 * "unloaded" and `document.fonts.check` returns false. This actively loads each
 * family; a missing/404 woff2 leaves the face unloaded, which the assertion below
 * then catches (fail-closed). `document.fonts.load` rejections are swallowed here so
 * the AFFIRMATIVE `check` — not a load rejection — is the single source of truth.
 */
async function loadBundledFonts() {
  const loads = [];
  for (const family of REQUIRED_TEXT_FONTS) {
    for (const weight of [400, 500, 600, 700]) loads.push(document.fonts.load(`${weight} 16px "${family}"`));
  }
  loads.push(document.fonts.load(`900 16px "${FA_FONT}"`, String.fromCharCode(0xf00c)));
  await Promise.all(loads.map((p) => p.catch(() => {})));
}

async function decodeVisibleImages(rootEl) {
  const images = [...rootEl.querySelectorAll('img')].filter((img) => img.getAttribute('src'));
  await Promise.all(
    images.map((img) => (typeof img.decode === 'function' ? img.decode().catch(() => {}) : Promise.resolve())),
  );
}

async function boot() {
  const caseId = currentCaseId();
  const viewCase = VIEW_CASES.find((entry) => entry.id === caseId);
  if (!viewCase) {
    document.body.setAttribute('data-view-lab-error', `unknown case: ${caseId}`);
    throw new Error(`Unknown View Lab case: ${caseId}`);
  }
  const fixture = getFixture(viewCase.fixtureId) || { props: {} };
  seedI18n(fixture.i18n);

  const importerKey = `/${viewCase.component}`;
  const importer = COMPONENT_IMPORTERS[importerKey];
  if (!importer) throw new Error(`No component importer for ${viewCase.component}`);
  const module = await importer();
  const Component = module.default;

  const mountPoint = buildFrame(viewCase.viewport?.width);
  const state = { props: { ...(fixture.props || {}) } };
  let instance = mount(Component, { target: mountPoint, props: state.props });

  const readyPromise = (async () => {
    // fonts.ready gates TIMING only (see fontPresence.js); actively load the bundled
    // faces, await settle, THEN affirmatively assert presence via the browser surface.
    await loadBundledFonts();
    await document.fonts.ready;
    assertFontsLoaded(browserFontSurface());
    await decodeVisibleImages(mountPoint);
    // One frame so layout settles under the real cascade.
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    document.body.setAttribute('data-view-lab-ready', caseId);
  })();

  window.__FABRICATE_VIEW__ = {
    caseId,
    get state() {
      return state.props;
    },
    patchState(patch = {}) {
      // Remount with patched props (Svelte 5 leaf components take props at mount).
      Object.assign(state.props, patch);
      if (instance) unmount(instance);
      mountPoint.replaceChildren();
      instance = mount(Component, { target: mountPoint, props: state.props });
    },
    whenReady: () => readyPromise,
  };

  await readyPromise;
}

boot().catch((error) => {
  document.body.setAttribute('data-view-lab-error', String(error && error.message ? error.message : error));
  // Surface as a console error so the lab's console-error gate (Design D) trips.
  console.error(error);
});
