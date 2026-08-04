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
import { DEFAULT_LAB_DIALOG_ANSWER } from './foundryDialog.js';
import { buildLabWorld } from './world/labWorld.js';

const READY_ATTRIBUTE = 'data-view-lab-ready';
const ERROR_ATTRIBUTE = 'data-view-lab-error';

/** The two roles `shim.setViewer` understands. An unknown `viewer=` falls back to the default. */
const VIEWER_ROLES = new Set(['gm', 'player']);

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
    /*
      NO scrollbar-gutter. There used to be
      \`.window-content, .window-content * { scrollbar-gutter: stable; }\` here, for capture
      determinism, and it was the single worst thing in the page.

      \`scrollbar-gutter: stable\` reserves gutter space on any element that is a SCROLL CONTAINER,
      and \`overflow: hidden\` makes one. The \`*\` therefore carved ~10px out of the content box of
      every clipping element under the window — \`.crafting-thumb\` measured a 44px box with a 34px
      content box, so every item image in every published frame was drawn narrow, left-aligned and
      needlessly cropped by its own \`object-fit: cover\`.

      Narrowing it to \`.window-content\` alone is not enough either: when the content does not
      overflow, production draws no scrollbar and uses the full width, while a reserved gutter
      still takes 10px. That is the same lie at the top level, and \`assertNoLabInducedClipping\`
      catches it.

      So there is no gutter at all now, and scrollbars behave exactly as they do in production.
      Determinism instead rests on what it should rest on: fixed fixtures, asserted-loaded fonts,
      and decoded images — a scrollbar that appears here is one that appears for a real user.
    */
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
    // Who is looking. Defaults below to the viewer each window is normally used by — player for the
    // player app, GM for the manager — because that is what every existing case assumes. A case
    // OVERRIDES it only when the difference between the two viewers IS the thing photographed: a
    // GM opening the player app is an ordinary state (they own the same tabs), and issue 901's
    // Journal redaction has no frame at all unless both halves can be captured.
    viewer: VIEWER_ROLES.has(params.get('viewer')) ? params.get('viewer') : null,
    // How the lab answers a Foundry DialogV2: `open` to leave it standing for the screenshot,
    // `enter` (the default) to press whichever button Foundry marks default, or a button action by
    // name. A case that wants a dialog IN FRAME must ask for `dialog=open` — see `foundryDialog.js`
    // for why leaving every dialog open by default silently rewrote a shipped frame.
    dialog: params.get('dialog') ?? DEFAULT_LAB_DIALOG_ANSWER,
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
      import('../../src/ui/SvelteFabricateApp.svelte.js'),
      import('../../src/ui/svelte/apps/FabricateAppRoot.svelte'),
      import('../../src/ui/svelte/util/alchemyTabAvailability.js'),
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
      import('../../src/ui/SvelteCraftingSystemManagerApp.svelte.js'),
      import('../../src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte'),
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
 * Takes a LIST of roots because a Foundry `DialogV2` is a sibling of the application window, not a
 * child of it (`_insertElement` appends to `document.body`) — so a dialog opened by a step is
 * outside the frame's subtree and would otherwise be neither observed nor image-decoded before the
 * capture, even though it lands on top of the frame in the photograph.
 *
 * @param {HTMLElement[]} roots Subtrees to watch.
 * @param {object|null} [services] Player service bag, whose stores are waited on.
 */
async function settle(roots, services = null) {
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
    for (const root of roots) {
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
    }
    quietTimer = setTimeout(finish, 120);
  });

  await document.fonts.ready;
  const images = roots
    .flatMap((root) => [...root.querySelectorAll('img')])
    .filter((img) => img.getAttribute('src'));
  await Promise.all(
    images.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()))
  );
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

/**
 * The faces the chrome paints with, matched by PATTERN rather than by name.
 *
 * Foundry 14 moved Font Awesome from Pro 6 to Pro 7, which renames the CSS family from
 * `Font Awesome 6 Pro` to `Font Awesome 7 Pro`. Nothing would have noticed: the stylesheet still
 * returns 200, `document.fonts.ready` still resolves, and every `.fa-solid` element simply falls
 * back to the default sans-serif — so the icons vanish and a blank-iconed PNG publishes as
 * authoritative evidence. `await document.fonts.ready` is not a check; it resolves happily when
 * zero faces loaded. So the family is discovered from the registered `@font-face` set (which keeps
 * this from needing an edit on the next Font Awesome major) and then actually loaded.
 */
const REQUIRED_CHROME_FACES = [
  {
    // Foundry ships Pro; the header controls, the resize grip and every Fabricate icon are drawn
    // with it. V14's stylesheet also declares `Font Awesome 5 Pro` as a back-compat alias, and
    // either resolving proves the webfonts harvested.
    family: /^Font Awesome \d+ Pro$/,
    probes: ['900 1em', '400 1em'],
    what: 'Font Awesome Pro — every icon in the chrome and in Fabricate',
  },
  {
    // `--font-primary`. Only 400 and 700 are declared by `foundry2.css`.
    family: /^Signika$/,
    probes: ['400 1em', '700 1em'],
    what: 'Signika — the body face of every window',
  },
  {
    // `--font-h1`, which is what the window title is set in.
    family: /^Modesto Condensed$/,
    probes: ['1em'],
    what: 'Modesto Condensed — the window title',
  },
];

/**
 * Fail the render when a face the chrome depends on did not load.
 *
 * Runs for chrome-only baselines too: the empty frame is precisely where a missing face is most
 * visible and least excusable.
 *
 * @returns {Promise<void>}
 * @throws {Error} Naming every missing family and probe, because "fonts did not load" is not
 *   actionable and this is the one V14 breakage that is otherwise silent.
 */
async function assertChromeFontsLoaded() {
  await document.fonts.ready;
  const registered = [...document.fonts].map((face) => face.family.replaceAll('"', ''));
  const problems = [];

  for (const required of REQUIRED_CHROME_FACES) {
    const family = registered.find((name) => required.family.test(name));
    if (!family) {
      problems.push(
        `no @font-face family matching ${required.family} is registered (${required.what})`
      );
      continue;
    }
    for (const probe of required.probes) {
      const specifier = `${probe} "${family}"`;
      // `load()` is what pulls a lazily-fetched face; `check()` alone reports false for a face
      // nothing has needed yet, which would fail every render rather than the broken ones.
      await document.fonts.load(specifier).catch(() => {});
      if (!document.fonts.check(specifier)) {
        problems.push(`${specifier} did not load (${required.what})`);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `view lab: harvested Foundry fonts are missing or renamed, so this frame would publish with ` +
        `fallback glyphs:\n  ${problems.join('\n  ')}\n` +
        `Registered families: ${[...new Set(registered)].sort((left, right) => left.localeCompare(right)).join(', ') || '(none)'}\n` +
        'Re-harvest the chrome: npm run viewlab:chrome:harvest -- --force'
    );
  }
}

/**
 * Fail the render when a lab-injected style has resized an element's content box.
 *
 * The determinism styles above are the lab's own, and they are the one thing in the page that
 * production does not have — so when one of them changes layout, the frame lies and nothing else
 * would notice. `scrollbar-gutter: stable` on every `.window-content` descendant did exactly that
 * for months: it reserves gutter space on any scroll container, `overflow: hidden` makes one, and
 * so every clipping element rendered ~10px narrower than its own box.
 *
 * The invariant is arithmetic and holds for any element that is not scrolling: content width ==
 * border width - padding - border. A reserved gutter breaks it, and nothing legitimate does.
 * Elements that genuinely scroll are exempt, because a real scrollbar breaks it too — and that is
 * production behaviour, not a lab artefact.
 *
 * @param {HTMLElement} frame The application frame.
 * @throws {Error} Naming the offending elements, because a silent 10px is exactly what shipped.
 */
function assertNoLabInducedClipping(frame) {
  const offenders = [];
  for (const element of frame.querySelectorAll('*')) {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    if (box.width === 0) continue;
    // `clientWidth` is defined only for elements that generate a CSS box with client geometry.
    // A non-replaced INLINE box — every `span`, `strong`, `em` — reports 0, which read as "loses
    // its whole width" and failed 106 of 150 frames the first time this guard ran.
    if (style.display.startsWith('inline') && style.display !== 'inline-block') continue;
    // A real scrollbar legitimately eats content width; only non-scrolling elements are pinned.
    if (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth) {
      continue;
    }
    const chrome =
      Number.parseFloat(style.paddingLeft) +
      Number.parseFloat(style.paddingRight) +
      Number.parseFloat(style.borderLeftWidth) +
      Number.parseFloat(style.borderRightWidth);
    const expected = style.boxSizing === 'border-box' ? box.width - chrome : box.width;
    const lost = expected - element.clientWidth;
    // 1px of tolerance for sub-pixel rounding; a reserved gutter is an order of magnitude larger.
    if (lost > 1) {
      offenders.push(
        `${element.tagName.toLowerCase()}.${[...element.classList].join('.') || '(no class)'} ` +
          `loses ${lost.toFixed(1)}px of content width (box ${box.width.toFixed(1)}, client ${element.clientWidth})`
      );
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      'view lab: a lab-injected style is resizing content boxes, so this frame would not depict ' +
        `production layout:\n  ${offenders.slice(0, 8).join('\n  ')}` +
        (offenders.length > 8 ? `\n  ... and ${offenders.length - 8} more` : '')
    );
  }
}

/**
 * The subtrees a settle pass has to watch: the application window, plus any dialog standing over it.
 *
 * @param {HTMLElement} frame The application frame.
 * @param {object|null} world The lab world, or null for a chrome-only render.
 * @returns {HTMLElement[]} Roots to observe.
 */
function labSettleRoots(frame, world) {
  return [frame, ...(world ? world.shim.openDialogs() : [])];
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
  // Same reasoning for the faces. A frame drawn in fallback glyphs is wrong whatever it contains,
  // and this is the one way the chrome can be wrong without anything else complaining.
  await assertChromeFontsLoaded();

  let mounted = null;
  if (!params.chromeOnly) {
    // Player frames must render as a NON-GM viewer or redaction never engages; the world had to be
    // built as GM, so the flip happens here, after initialization and before the services are built.
    // A case may override with `viewer=` when the GM/player difference is what it photographs.
    const defaultViewer = params.appId === 'fabricate-app' ? 'player' : 'gm';
    world.shim.setViewer(params.viewer ?? defaultViewer);
    // Before any step can click something that confirms.
    world.shim.setDialogAnswer(params.dialog);
    mounted =
      params.appId === 'fabricate-app'
        ? await mountPlayerApp(built.content, params)
        : await mountManagerApp(built.content, params);
    await settle([built.frame], mounted?.services ?? null);
    // After settle, because the check needs the populated tree — an empty window has nothing
    // clipped to measure.
    assertNoLabInducedClipping(built.frame);
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
    // The dialogs standing in the page, so a case can assert one opened and the driver can settle
    // it. `frame.screenshot()` clips the PAGE to the frame's box rather than rendering the frame in
    // isolation, so a dialog centred in the viewport lands on top of the window in the capture —
    // which is where Foundry puts it.
    dialogs: () => (world ? world.shim.openDialogs() : []),
    settle: () => settle(labSettleRoots(built.frame, world), mounted?.services ?? null),
  };
  document.body.setAttribute(READY_ATTRIBUTE, params.caseId ?? params.appId);
}

boot().catch((error) => {
  const message = error && error.message ? error.message : String(error);
  document.body.setAttribute(ERROR_ATTRIBUTE, message);
  // Surface through the driver's console-error gate as well as the attribute.
  console.error(error);
});
