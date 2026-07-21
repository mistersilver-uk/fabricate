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

// Lazy importers for every component the registry can mount. `import.meta.glob`
// keys are absolute-from-Vite-root (`/src/…`); the registry stores `src/…`.
const COMPONENT_IMPORTERS = import.meta.glob('/src/ui/svelte/**/*.svelte');

// The families the View Lab bundles and the FA icon face. FA glyphs are FONT glyphs,
// so a missing FA font renders tofu (not a failed <img>) — the presence assertion,
// not the image-decode gate, is what catches it.
const REQUIRED_TEXT_FONTS = Object.freeze(['Signika', 'Spectral', 'JetBrains Mono']);
const FA_FONT = 'Font Awesome 6 Free';

function currentCaseId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('case') || (window.__VIEW_LAB_CASE__ ?? null);
}

function seedI18n(i18nMap = {}) {
  // The SAME stub shape installComponentTestGlobals uses, seeded with the fixture's
  // localized strings so a case can render real localized text (font-metric width
  // depends on it) instead of the bare key.
  window.game = {
    i18n: {
      localize: (key) => (Object.prototype.hasOwnProperty.call(i18nMap, key) ? i18nMap[key] : key),
      format: (key, data) => `${key}:${JSON.stringify(data)}`,
    },
  };
}

function buildFrame() {
  const frame = document.createElement('div');
  frame.className = 'application theme-dark view-lab-frame';
  frame.setAttribute('data-view-lab-frame', '');
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

/**
 * FAIL-CLOSED font/glyph PRESENCE assertion (Design E). `document.fonts.ready`
 * gates TIMING only — it resolves even when a face 404'd — so it CANNOT make a load
 * failure fatal. This affirmatively checks each family is actually loaded and that a
 * representative FA glyph resolves to the FA face (canvas width-probe), and THROWS if
 * any is absent. A silent Arial/tofu fallback that renders green is the exact worst
 * outcome this gate exists to prevent.
 */
export function assertFontsLoaded() {
  const missing = [];
  for (const family of REQUIRED_TEXT_FONTS) {
    if (!document.fonts.check(`16px "${family}"`)) missing.push(family);
  }
  if (!document.fonts.check(`900 16px "${FA_FONT}"`)) missing.push(FA_FONT);

  // Canvas width-probe: a known FA glyph string must render WIDER than 0 and differ
  // from the same codepoint in a generic serif (tofu/fallback would collapse to the
  // serif metric). This catches a face that "checks" true but never actually painted.
  const probe = (font, text) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = font;
    return ctx.measureText(text).width;
  };
  const faGlyph = String.fromCharCode(0xf00c); // fa-check (Font Awesome solid)
  const faWidth = probe(`900 32px "${FA_FONT}"`, faGlyph);
  const serifWidth = probe('32px serif', faGlyph);
  if (!(faWidth > 0) || Math.abs(faWidth - serifWidth) < 0.5) {
    missing.push(`${FA_FONT} (glyph probe: FA=${faWidth}, serif=${serifWidth})`);
  }

  if (missing.length > 0) {
    throw new Error(
      `View Lab font PRESENCE assertion failed — missing/unloaded: ${missing.join(', ')}. ` +
        'Capture is aborted (a silent Arial/tofu fallback would render green). ' +
        'Confirm the bundled woff2 under assets/fonts/ are present and served.',
    );
  }
  return true;
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

  const mountPoint = buildFrame();
  const state = { props: { ...(fixture.props || {}) } };
  let instance = mount(Component, { target: mountPoint, props: state.props });

  const readyPromise = (async () => {
    // fonts.ready gates TIMING only (see assertFontsLoaded); actively load the bundled
    // faces, await settle, THEN affirmatively assert presence.
    await loadBundledFonts();
    await document.fonts.ready;
    assertFontsLoaded();
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
