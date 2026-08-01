/**
 * View Lab mount entry.
 *
 * Vite serves this module into `index.html`. It builds a real Foundry V13 application frame (see
 * `foundryFrame.js`), boots the real Fabricate runtime against a fixture world (see
 * `world/labWorld.js`), and mounts the real app root inside the frame's `.window-content`. The
 * captured PNG is therefore a whole application window, drawn by the same code and the same
 * cascade production uses.
 *
 * The page signals completion with `data-view-lab-ready` / `data-view-lab-error` on `<body>`; the
 * driver waits on those and never on a timer.
 */
import { flushSync, mount } from 'svelte';

import { APP_CHROME } from '../../scripts/lib/foundryChromeSpec.js';
import { assertWindowGeometry, buildAppWindow, configureLabPage } from './foundryFrame.js';
import { buildLabWorld } from './world/labWorld.js';

const READY_ATTRIBUTE = 'data-view-lab-ready';
const ERROR_ATTRIBUTE = 'data-view-lab-error';

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
    tab: params.get('tab') ?? null,
    // DARK by default, because that is what the smoke renders and the smoke is the fidelity
    // authority. Foundry's configureUI prefers the world's core.uiConfig.colorScheme.applications
    // over the browser's prefers-color-scheme, so reasoning from Playwright's default (light) gets
    // this wrong - as an earlier version of this file did. It matters more than it sounds:
    // Fabricate's headings inherit Foundry's --color-text-primary, which is rgb(17,17,17) under
    // theme-light and rgb(247,243,232) under theme-dark, so the wrong theme renders every heading
    // near-black on Fabricate's dark panels.
    colorScheme: params.get('colorScheme') === 'light' ? 'light' : 'dark',
    // Which crafting system the manager opens on. A seeded setting rather than a click, because
    // three manager surfaces exist only for a system in the right visibility mode - clicking to
    // them is impossible when the rail entry is not rendered at all.
    system: params.get('system') ?? null,
    // The Graph rail placeholder is advertised only behind the experimental toggle, so a case that
    // reproduces the smoke's experimental-off frame has to turn it back off.
    experimental: params.get('experimental') !== '0',
    // Capture geometry override. The smoke photographs the manager at 1280x820, not its declared
    // 1280x940, so a case pins the size its smoke counterpart uses (see SMOKE_MANAGER_POSITION).
    position:
      params.get('w') && params.get('h')
        ? { width: Number(params.get('w')), height: Number(params.get('h')) }
        : null,
    chromeOnly: params.get('chromeOnly') === '1',
  };
}

/**
 * Build a stand-in application instance without constructing one.
 *
 * `Object.create(AppClass.prototype)` gives an object that HAS every method the class defines —
 * `_buildServices`, `_prepareSvelteProps`, and the dozens of private helpers those call — while
 * skipping the constructor, which would drag in the ApplicationV2 machinery the lab has no use for.
 *
 * The alternative, hand-listing the methods a props build happens to touch, is how the seam layer
 * drifts: it works until someone adds a call, and then it fails with a `not a function` that looks
 * like a lab bug rather than a missing stub. Borrowing the whole prototype means the lab renders
 * from production's real service bag, so there is nothing to keep in sync.
 *
 * @param {Function} AppClass The application class (never constructed).
 * @param {object} fields Instance fields the borrowed methods read off `this`.
 * @returns {object} A prototype-backed stand-in.
 */
function borrowInstance(AppClass, fields) {
  return Object.assign(Object.create(AppClass.prototype), fields);
}

async function mountPlayerApp(content, params) {
  const [{ SvelteFabricateApp }, { default: FabricateAppRoot }, { isAlchemyTabAvailable }] =
    await Promise.all([
      import('/src/ui/SvelteFabricateApp.svelte.js'),
      import('/src/ui/svelte/apps/FabricateAppRoot.svelte'),
      import('/src/ui/svelte/util/alchemyTabAvailability.js'),
    ]);

  const activeTab = params.tab ?? 'crafting';
  const app = borrowInstance(SvelteFabricateApp, {
    _activeTab: activeTab,
    _services: null,
    _activeCanvasTool: null,
    _scopedInteractableRef: null,
    _scopedEnvironmentId: null,
    _scopedTaskId: null,
    _scopedActorId: null,
    _hookIds: null,
    // The lab never re-renders through ApplicationV2; a tab click in a captured frame is a no-op.
    render: () => {},
  });
  const services = app._buildServices();

  const props = {
    activeTab,
    showAlchemy: isAlchemyTabAvailable(services),
    onSelectTab: () => {},
    services,
    activeCanvasTool: null,
    scopedEnvironmentId: null,
    scopedTaskId: null,
    scopedActorId: null,
  };
  const instance = mount(FabricateAppRoot, { target: content, props });
  return { instance, services, props };
}

async function mountManagerApp(content, params) {
  const [{ SvelteCraftingSystemManagerApp }, { default: CraftingSystemManagerRoot }] =
    await Promise.all([
      import('/src/ui/SvelteCraftingSystemManagerApp.svelte.js'),
      import('/src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte'),
    ]);

  const app = borrowInstance(SvelteCraftingSystemManagerApp, {
    _adminStore: null,
    _services: null,
    _confirmDiscardDirtyEssenceDraft: null,
    _confirmDiscardDirtyToolDraft: null,
    _userHooks: null,
    render: () => {},
  });
  const props = app._prepareSvelteProps();
  const services = props.services;
  const instance = mount(CraftingSystemManagerRoot, { target: content, props });
  return { instance, services, props, store: props.store, tab: params.tab };
}

/**
 * Wait until the window has stopped changing.
 *
 * Real stores do real asynchronous loads, so "rendered" is not a moment the mount call knows about.
 * The gate is: let microtasks and Svelte effects settle, then require the DOM to be quiet for a
 * short window, then let two frames paint. A timeout throws with the case named rather than hanging.
 *
 * @param {HTMLElement} root Subtree to watch.
 */
async function settle(root, services = null) {
  for (let pass = 0; pass < 6; pass++) {
    await Promise.resolve();
    flushSync();
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  // Wait for the STORES, not just the DOM. A store that is still loading renders its empty state,
  // which is quiet in exactly the same way a finished render is — so DOM stillness alone let the
  // journal capture "No active runs" while three were on their way in. Each player store exposes
  // `loading`, and most also `loadedOnce`; a store that has neither is skipped rather than waited on.
  if (services) {
    const watched = ['journal', 'crafting', 'inventory', 'alchemy', 'craftingSources', 'actorBar']
      .map((name) => services[name])
      .filter((store) => store && typeof store === 'object' && 'loading' in store);

    for (let pass = 0; pass < 40; pass++) {
      const pending = watched.filter(
        (store) => store.loading === true || ('loadedOnce' in store && store.loadedOnce === false)
      );
      if (pending.length === 0) break;
      flushSync();
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    flushSync();
  }

  await new Promise((resolve) => {
    let quietTimer = null;
    const observer = new MutationObserver(() => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, 120);
    });
    const finish = () => {
      observer.disconnect();
      resolve();
    };
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    quietTimer = setTimeout(finish, 120);
  });

  await document.fonts.ready;
  const images = [...root.querySelectorAll('img')].filter((img) => img.getAttribute('src'));
  await Promise.all(
    images.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()))
  );
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function boot() {
  const params = readParams();
  if (!APP_CHROME[params.appId]) throw new Error(`unknown app: ${params.appId}`);

  installDeterminismStyles();

  const world = params.chromeOnly
    ? null
    : await buildLabWorld({
        managedSystemId: params.system,
        experimentalFeatures: params.experimental,
      });
  const localize = world ? world.localize : (key) => key;
  configureLabPage({ colorScheme: params.colorScheme });

  const built = buildAppWindow({
    appId: params.appId,
    localize,
    position: params.position ?? undefined,
  });
  // Geometry BEFORE content: a clamped frame is wrong no matter what is inside it, and failing
  // here keeps the error about the window rather than about whatever failed to render in it.
  assertWindowGeometry(built);

  let mounted = null;
  if (!params.chromeOnly) {
    // Player frames must render as a NON-GM viewer or redaction never engages; the world had to be
    // built as GM, so the flip happens here, after initialization and before the services are built.
    world.shim.setViewer(params.appId === 'fabricate-app' ? 'player' : 'gm');
    mounted =
      params.appId === 'fabricate-app'
        ? await mountPlayerApp(built.content, params)
        : await mountManagerApp(built.content, params);
    await settle(built.frame, mounted?.services ?? null);
  } else {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  globalThis.__FABRICATE_VIEW__ = {
    appId: params.appId,
    caseId: params.caseId,
    geometry: built.applied,
    world,
    services: mounted?.services ?? null,
    store: mounted?.store ?? null,
    frame: built.frame,
    settle: () => settle(built.frame, mounted?.services ?? null),
  };
  document.body.setAttribute(READY_ATTRIBUTE, params.caseId ?? params.appId);
}

boot().catch((error) => {
  const message = error && error.message ? error.message : String(error);
  document.body.setAttribute(ERROR_ATTRIBUTE, message);
  // Surface through the driver's console-error gate as well as the attribute.
  console.error(error);
});
