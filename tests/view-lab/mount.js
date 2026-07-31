/**
 * View Lab mount entry.
 *
 * Vite serves this module into `index.html`. It builds a real Foundry V13 application frame
 * (see `foundryFrame.js`) and mounts a real Fabricate app root inside its `.window-content`, so
 * the captured PNG is a whole application window rather than a component on a blank page.
 *
 * The page signals completion with `data-view-lab-ready` / `data-view-lab-error` on `<body>`;
 * the driver waits on those and never on a timer.
 */
import { APP_CHROME } from '../../scripts/lib/foundryChromeSpec.js';
import { assertWindowGeometry, buildAppWindow, configureLabPage } from './foundryFrame.js';
import { createLocalizer } from './labI18n.js';

/**
 * Kill animations, transitions, the caret, and smooth scrolling document-wide.
 *
 * Document-wide and unlayered on purpose: the chrome has transitions of its own
 * (`.application.minimizing`, `.controls-dropdown`, the `--ui-fade-*` variables), and the first
 * View Lab attempt scoped its kill-switch inside the mount root, which missed all of them.
 */
function installDeterminismStyles() {
  const style = document.createElement('style');
  style.dataset.viewLab = 'determinism';
  style.textContent = `
    *, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
      caret-color: transparent !important;
      scroll-behavior: auto !important;
    }
    /* Scoped to window content: a document-wide gutter would shift the frame itself. */
    .window-content, .window-content * { scrollbar-gutter: stable; }
  `;
  document.head.appendChild(style);
}

function readParams() {
  const params = new URLSearchParams(globalThis.location.search);
  return {
    appId: params.get('app') ?? 'fabricate-app',
    caseId: params.get('case') ?? null,
    colorScheme: params.get('colorScheme') === 'dark' ? 'dark' : 'light',
    chromeOnly: params.get('chromeOnly') === '1',
  };
}

async function boot() {
  const params = readParams();
  if (!APP_CHROME[params.appId]) throw new Error(`unknown app: ${params.appId}`);

  const localize = await createLocalizer();
  installDeterminismStyles();
  configureLabPage({ colorScheme: params.colorScheme });

  const built = buildAppWindow({ appId: params.appId, localize });

  // Geometry BEFORE content: a clamped frame is wrong no matter what is inside it, and failing
  // here keeps the error about the window rather than about whatever failed to render in it.
  assertWindowGeometry(built);

  if (!params.chromeOnly) {
    // Content mounting arrives with the fixture/services workstream; until then a chrome-only
    // page is a legitimate render target and the only one this entry supports.
    throw new Error('content cases are not implemented yet; pass chromeOnly=1');
  }

  await document.fonts.ready;
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));

  globalThis.__FABRICATE_VIEW__ = {
    appId: params.appId,
    caseId: params.caseId,
    geometry: built.applied,
  };
  document.body.setAttribute('data-view-lab-ready', params.caseId ?? params.appId);
}

boot().catch((error) => {
  const message = error && error.message ? error.message : String(error);
  document.body.setAttribute('data-view-lab-error', message);
  // Surface through the driver's console-error gate as well as the attribute.
  console.error(error);
});
