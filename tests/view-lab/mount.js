/**
 * View Lab mount entry. The page signals completion with `data-view-lab-ready` /
 * `data-view-lab-error` on `<body>`; the driver waits on those and never on a timer.
 */
import { flushSync, mount } from 'svelte';

import { APP_CHROME } from '../../scripts/lib/foundryChromeSpec.js';
import { assertWindowGeometry, buildAppWindow, configureLabPage } from './foundryFrame.js';
import { DEFAULT_LAB_DIALOG_ANSWER } from './foundryDialog.js';
import {
  findLabInjectedContentWidthLosses,
  measureWithoutLabStyles,
} from './labInjectedLayoutGuard.js';
import { LAB_INTERACTABLE_REFS } from './world/labInteractables.js';
import { buildLabWorld } from './world/labWorld.js';
import { seedRollPromptFixture } from './rollPromptFixtures.js';

const READY_ATTRIBUTE = 'data-view-lab-ready';
const ERROR_ATTRIBUTE = 'data-view-lab-error';

/** The two roles `shim.setViewer` understands. An unknown `viewer=` falls back to the default. */
const VIEWER_ROLES = new Set(['gm', 'player']);

const LONG_DOWNTIME_LOCALIZATION = Object.freeze({
  'FABRICATE.Admin.Manager.World.Downtime.Tabs.Tracking.Label':
    'Campaign-wide tracking and pending decisions',
  'FABRICATE.Admin.Manager.World.Downtime.Tabs.Tracking.AccessibleName':
    'Open campaign-wide tracking and pending decisions',
  'FABRICATE.Admin.Manager.World.Downtime.Tabs.Tracking.Tooltip':
    'Preview campaign-wide tracking and pending decisions in Fabricate Premium',
  'FABRICATE.Admin.Manager.World.Downtime.Tabs.Activities.Label':
    'Reusable individual and collaborative activities',
  'FABRICATE.Admin.Manager.World.Downtime.Tabs.Activities.AccessibleName':
    'Open reusable individual and collaborative activities',
  'FABRICATE.Admin.Manager.World.Downtime.Tabs.Activities.Tooltip':
    'Preview reusable individual and collaborative activities in Fabricate Premium',
  'FABRICATE.Admin.Manager.World.Downtime.Tabs.Factions.Label':
    'Faction relationships, obligations and consequences',
  'FABRICATE.Admin.Manager.World.Downtime.Tabs.Factions.AccessibleName':
    'Open faction relationships, obligations and consequences',
  'FABRICATE.Admin.Manager.World.Downtime.Tabs.Factions.Tooltip':
    'Preview faction relationships, obligations and consequences in Fabricate Premium',
  'FABRICATE.Admin.Manager.World.Downtime.Tabs.Settings.Label':
    'Campaign calendar, permissions and resolution settings',
  'FABRICATE.Admin.Manager.World.Downtime.Tabs.Settings.AccessibleName':
    'Open campaign calendar, permissions and resolution settings',
  'FABRICATE.Admin.Manager.World.Downtime.Tabs.Settings.Tooltip':
    'Preview campaign calendar, permissions and resolution settings in Fabricate Premium',
});

function applyLongDowntimeLocalization(world) {
  if (!world) return;
  const shippedLocalize = world.localize;
  const localize = (key) => LONG_DOWNTIME_LOCALIZATION[key] ?? shippedLocalize(key);
  world.localize = localize;
  world.i18n.localize = localize;
  world.i18n.format = (key, data = {}) =>
    localize(key).replace(/\{(\w+)\}/g, (whole, token) =>
      Object.hasOwn(data, token) ? String(data[token]) : whole
    );
}

/** Kill animations, transitions, the caret, and smooth scrolling document-wide. */
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
      every clipping element under the window — the crafting recipe row's 44px art tile measured a 34px
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
  return style;
}

function readParams() {
  const params = new URLSearchParams(globalThis.location.search);
  return {
    appId: params.get('app') ?? 'fabricate-app',
    caseId: params.get('case') ?? null,
    tab: params.get('tab') ?? null,
    // DARK by default, because that is what the smoke renders and the smoke is the fidelity
    // authority.
    colorScheme: params.get('colorScheme') === 'light' ? 'light' : 'dark',
    // Which crafting system the manager opens on.
    system: params.get('system') ?? null,
    gatheringTaskMode: params.get('gatheringTaskMode') ?? null,
    rollPromptState: params.get('rollPromptState') ?? null,
    journalCaseState: params.get('journalCaseState') ?? null,
    // TWO things, and the name says only the second: a world seeded with NO crafting systems, and
    // the persisted selection cleared through the real admin store after construction.
    clearSystem: params.get('clearSystem') === '1',
    // Seed an EMPTY party list, for the World > Parties empty state.
    noParties: params.get('noParties') === '1',
    // Hold the Knowledge snapshot read in flight, or make it reject, for the surface's loading and
    // error frames (issue 1969).
    knowledgeLoading: params.get('knowledgeLoading') === '1',
    knowledgeError: params.get('knowledgeError') === '1',
    // Build a world with NO Tools at all, for the world Tools Catalogue's empty state.
    noTools: params.get('noTools') === '1',
    // Seed NO world component records of the lab's own, so the world's tag vocabulary is empty and
    // — with `clearSystem` beside it — its component catalogue is too (issue 1540).
    noAuthoredWorldComponents: params.get('noAuthoredWorldComponents') === '1',
    // Grow the world's non-GM roster to eight, for the two Access frames whose subject is the
    // Players roster's own pager and its no-match line (issue 1515).
    manyPlayers: params.get('manyPlayers') === '1',
    // Evidence-only localization stress. It changes no shipped string and exists solely so the
    // named long-label frame cannot collapse to the ordinary stacked Map frame.
    longTravelLabels: params.get('longTravelLabels') === '1',
    longDowntimeLabels: params.get('longDowntimeLabels') === '1',
    // An active scene with no regions, for the Map Region Links no-regions empty state.
    noSceneRegions: params.get('noSceneRegions') === '1',
    // Register a stand-in companion World-nav provider before the manager mounts, so the frames can
    // photograph the PREMIUM-INSTALLED chrome: the title bar's gold badge and the rail's muted
    // Downtime chip.
    downtimeProvider: params.get('downtimeProvider') === '1',
    // view-lab-region:player-extension-params
    // Register a stand-in companion PLAYER navigation provider before the player app mounts, so
    // the frames can photograph a companion tab in the nav rail and its panel beneath the Actor
    // selection top bar (issue 1198). Nothing shipped changes: the provider lives in this file
    // and registers with the production page-session registry the player app itself reads.
    //
    // These three params are their own attributed REGION. Only the player window can render what
    // they produce, and `scripts/lib/viewLabCases.js` keys `ATTRIBUTED_LAB_INPUTS` on that fact —
    // so a hunk confined to this block selects the player frames instead of the whole corpus.
    playerProvider: params.get('playerProvider') === '1',
    // Make that provider's mount throw, for Core's own fault state.
    playerProviderFault: params.get('playerProviderFault') === '1',
    // Evidence-only label stress for the rail's truncation rule.
    longPlayerLabels: params.get('longPlayerLabels') === '1',
    // view-lab-region:end
    // view-lab-region:canvas-mount-params
    // The two params only the three CANVAS windows read (issue 1520).
    //
    // `interactable` names WHICH seeded behaviour the config panel opens against, by the key
    // `LAB_INTERACTABLE_REFS` declares rather than by a three-part ref: the panel is opened
    // AGAINST a behaviour, so its ref is instance state and there is no `mountManagerApp`
    // analogue for it. `noInteractables` builds a world whose scene carries none, which is the
    // Manage panel's empty state and the one state no seeded behaviour count can produce.
    //
    // Their own attributed REGION, and the readership is structural rather than assumed: neither
    // param is read anywhere but `mountCanvasApp` and the world build it drives, and no player or
    // manager frame mounts a canvas window at all. `scripts/lib/viewLabCases.js` keys
    // `ATTRIBUTED_LAB_INPUTS` on that fact, so a hunk confined to this block selects the canvas
    // frames rather than the whole corpus.
    interactable: params.get('interactable') ?? null,
    noInteractables: params.get('noInteractables') === '1',
    // view-lab-region:end
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
    // player app, GM for the manager — because that is what every existing case assumes (issue
    // 901).
    viewer: VIEWER_ROLES.has(params.get('viewer')) ? params.get('viewer') : null,
    // How the lab answers a Foundry DialogV2: `open` to leave it standing for the screenshot,
    // `enter` (the default) to press whichever button Foundry marks default, or a button action by
    // name.
    dialog: params.get('dialog') ?? DEFAULT_LAB_DIALOG_ANSWER,
  };
}

/**
 * Build a stand-in application instance without constructing one.
 *
 * @param {Function} AppClass The application class (never constructed).
 * @param {object} fields Instance fields the borrowed methods read off `this`.
 * @returns {object} A prototype-backed stand-in.
 */
function borrowInstance(AppClass, fields) {
  return Object.assign(Object.create(AppClass.prototype), fields);
}

// view-lab-region:lab-player-provider
/** The exact report Core makes when it contains a player companion's mount fault. */
const EXPECTED_PLAYER_FAULT_REPORT = 'Fabricate | Player extension mount failed:';

/**
 * A stand-in companion PLAYER navigation provider, for the companion-surface frames.
 *
 * @param {object} [options] Which variant to build.
 * @param {boolean} [options.fault] Throw from `mount`, for Core's fault state.
 * @param {boolean} [options.longLabels] Use the worst-case labels the rail must truncate.
 * @returns {object} An API-v1 player navigation provider.
 */
function labPlayerProvider({ fault = false, longLabels = false } = {}) {
  const tab = (id, short, long, icon) => {
    const label = longLabels ? long : short;
    return {
      id,
      label,
      // An `aria-label` REPLACES the accessible name, so it must contain the visible label text
      // or Label-in-Name breaks for speech-input users. Composed from the label for that reason.
      accessibleName: `Open ${label}`,
      tooltip: `${label} · Downtime Studio`,
      icon,
    };
  };

  return {
    apiVersion: 1,
    id: 'downtime',
    tabs: [
      tab('board', 'Board', 'Downtime board and pending decisions', 'fas fa-chart-simple'),
      tab('projects', 'Projects', 'Commissions, projects and standing orders', 'fas fa-list-check'),
      tab('ledger', 'Ledger', 'Ledger of every character’s downtime', 'fas fa-scroll'),
    ],
    mount({ target: mountTarget, tabId, context }) {
      if (fault) throw new Error('view lab: the stand-in player companion failed to mount');
      const panel = mountTarget.ownerDocument.createElement('div');
      panel.style.padding = '20px';
      const heading = mountTarget.ownerDocument.createElement('h2');
      heading.textContent = `Downtime Studio — ${tabId}`;
      const body = mountTarget.ownerDocument.createElement('p');
      // Drawn from the frozen mount context, so the frame shows that the context reached the
      // companion rather than merely that something mounted.
      body.textContent = `Companion content for actor ${context.actorId ?? 'none selected'}.`;
      panel.append(heading, body);
      mountTarget.append(panel);
      return () => panel.remove();
    },
  };
}
// view-lab-region:end

// view-lab-region:mount-player-app
async function mountPlayerApp(content, params) {
  const [
    { SvelteFabricateApp },
    { default: FabricateAppRoot },
    { isAlchemyTabAvailable },
    { playerExtensions },
    { deriveExtensionSurfaces },
  ] = await Promise.all([
    import('../../src/ui/SvelteFabricateApp.svelte.js'),
    import('../../src/ui/svelte/apps/FabricateAppRoot.svelte'),
    import('../../src/ui/svelte/util/alchemyTabAvailability.js'),
    import('../../src/ui/playerExtensions.js'),
    import('../../src/ui/playerNavModel.js'),
  ]);

  // Core CONTAINS a companion mount fault by REPORTING it, so the fault frame's own subject
  // produces a `console.error` — and the capture driver fails any frame that logs one.
  if (params.playerProviderFault) {
    const reportedError = console.error.bind(console);
    console.error = (...args) => {
      if (typeof args[0] === 'string' && args[0].startsWith(EXPECTED_PLAYER_FAULT_REPORT)) return;
      reportedError(...args);
    };
  }

  // Registered BEFORE the props bag is built, because the snapshot below is derived once and this
  // borrowed instance has no subscription to refresh it.
  if (params.playerProvider) {
    playerExtensions.publicApi.registerPlayerNavProvider(
      labPlayerProvider({ fault: params.playerProviderFault, longLabels: params.longPlayerLabels })
    );
  }

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
  installJournalCaseServiceSeam(services, params.journalCaseState);

  const props = {
    activeTab,
    showAlchemy: isAlchemyTabAvailable(services),
    onSelectTab: () => {},
    services,
    activeCanvasTool: null,
    scopedEnvironmentId: null,
    scopedTaskId: null,
    scopedActorId: null,
    // DERIVED, and not `playerExtensions` alone.
    extensionSurfaces: deriveExtensionSurfaces(playerExtensions, {
      experimentalFeaturesEnabled: params.experimental,
    }),
    // The registry itself, carried only so the mount host emits its surface hooks through the
    // same injectable edge the registry's own hooks travel on.
    playerExtensions,
  };
  const instance = mount(FabricateAppRoot, { target: content, props });
  return { instance, services, props };
}

function installJournalCaseServiceSeam(services, state) {
  if (!state || !services) return;
  const list = services.listJournalForActor?.bind(services);
  const execute = services.executeJournalRunCommand?.bind(services);
  const fixtureExecute = globalThis.game?.fabricate?.executeJournalCaseFixtureCommand;
  const fixtureEvents = globalThis.game?.fabricate?.journalCaseFixtureEvents;
  if (typeof fixtureExecute === 'function') {
    services.executeJournalRunCommand = async (command) =>
      (await fixtureExecute(command)) ?? execute?.(command) ?? null;
    if (Array.isArray(fixtureEvents)) {
      services.notify = (message) => {
        fixtureEvents.push({ type: 'notification', message, state });
      };
    }
  }
  if (state === 'loading') {
    services.listJournalForActor = () => new Promise(() => {});
    return;
  }
  if (state === 'error-retry') {
    let recovered = false;
    services.recoverJournalCaseFixture = () => {
      recovered = true;
    };
    services.listJournalForActor = (...args) => {
      if (!recovered) return Promise.reject(new Error('View Lab Journal load failure'));
      return list?.(...args) ?? null;
    };
    return;
  }
  if (state === 'no-actor-empty') {
    services.getSelectedActorId = () => '';
    services.listJournalForActor = async () => ({
      selectedActorId: null,
      selectedActorUuid: null,
      actor: null,
      worldTime: Number(services.getWorldTime?.() ?? 0),
      activeRuns: [],
      history: [],
      counts: { active: 0, history: 0 },
    });
  }
}
// view-lab-region:end

/**
 * A stand-in companion Downtime provider, for the premium-installed frames.
 *
 * @returns {object} An API-v1 World navigation provider.
 */
function labDowntimeProvider() {
  // NAMED ONCE, then used twice: as the provider's tab set, and as the source the cross-navigation
  // control below reads its destination's real label out of (issue 1332).
  const tabs = [
    {
      id: 'ledger',
      label: 'Test Companion — Ledger',
      accessibleName: 'Open the downtime ledger',
      // The widest sub-item case (AC-16/AC-18) needs a four-digit `.manager-nav-count` beside
      // a long multi-word label, on the same tab, or the widest case is one the layout
      // assertions do not look at.
      badge: { count: 1284, accessibleName: '1,284 downtime claims waiting for review' },
      tooltip: 'Every character’s downtime, in one ledger',
      icon: 'fas fa-scroll',
      title: 'Downtime ledger',
      subtitle: 'Downtime Studio · Every character’s work, in one place.',
      breadcrumb: 'Ledger',
    },
    {
      id: 'crew',
      label: 'Test Companion — Crew',
      accessibleName: 'Open the downtime crew roster',
      tooltip: 'Who is working on what',
      icon: 'fas fa-users-gear',
    },
    {
      id: 'writs',
      label: 'Test Companion — Writs',
      accessibleName: 'Open downtime writs',
      tooltip: 'Standing orders and commissions',
      icon: 'fas fa-file-signature',
    },
  ];
  // The tab this screen's cross-navigation control points at: the next of the stand-in's own
  // three, wrapping. Derived rather than mapped, so adding a tab above needs nothing here.
  const nextTab = (tabId) => tabs[(tabs.findIndex((tab) => tab.id === tabId) + 1) % tabs.length];

  return {
    apiVersion: 1,
    id: 'downtime',
    tabs,
    // A companion that OWNS ITS LAYOUT, because that is the state issue 1213's contract is about
    // and the frame has to be able to show it.
    mount({ target: mountTarget, tabId, context }) {
      const doc = mountTarget.ownerDocument;
      const element = (tag, cssText, textContent) => {
        const node = doc.createElement(tag);
        node.style.cssText = cssText;
        if (textContent !== undefined) node.textContent = textContent;
        return node;
      };

      // THE DRILL-DOWN, and the only reason this stand-in has an interactive control at all.
      const openEditor = element(
        'button',
        'flex:0 0 auto;align-self:flex-start;padding:6px 10px;border-radius:6px;' +
          'border:1px solid var(--fab-border);background:var(--fab-bg-3);color:var(--fab-text)',
        'Open Marn the Quartermaster'
      );
      openEditor.type = 'button';
      // `setAttribute` with the literal hook, not `dataset.labCompanionDrilldown`: the case
      // registry's selector guard greps the source for the hook a selector names, and a
      // camel-cased `dataset` write leaves that literal nowhere in the file — so the guard
      // could never fail on a rename of the very hook a capture step depends on.
      openEditor.setAttribute('data-lab-companion-drilldown', '');
      const closeEditor = () => context?.setRouteChrome?.(null);
      openEditor.addEventListener('click', () => {
        context?.setRouteChrome?.({
          title: 'Marn the Quartermaster',
          subtitle: 'Test companion record · not a Fabricate surface',
          breadcrumb: 'Marn',
          actionsLabel: 'Crew member actions',
          // An asset the LAB serves. A Foundry core path resolves in a real world and 404s
          // here, and the harness treats a console error during render as a failure -- so a
          // core icon would fail the capture rather than merely render a broken medallion.
          image: 'assets/img/fabricate-logo.jpg',
          status: { label: 'Unsaved' },
          actions: [
            {
              id: 'lab-back',
              label: 'Back to crew',
              tone: 'ghost',
              icon: 'fas fa-arrow-left',
              onSelect: closeEditor,
            },
            {
              id: 'lab-delete',
              label: 'Delete',
              tone: 'danger',
              icon: 'fas fa-trash',
              onSelect: () => {},
            },
            {
              // NOT `closeEditor`. The case asserts this control accepts a real click, and the
              // harness does that by clicking it and then re-reading the element it clicked.
              id: 'lab-save',
              label: 'Save crew member',
              tone: 'primary',
              icon: 'fas fa-save',
              onSelect: () => {},
            },
          ],
        });
        // Item 1: the rail sub-item for the tab already on screen pops one level rather than
        // doing nothing, which is a behaviour only a live mount can supply.
        context?.onRouteReselect?.(closeEditor);
      });

      // Item 2 (issue 1332): A COMPANION SENDING THE GM TO ANOTHER OF ITS OWN TABS, which is the
      // control the seam was widened for — a setting shown where the GM feels its effect, with a
      // way to reach the screen where it is changed.
      const destination = nextTab(tabId);
      const crossLink = element(
        'button',
        'flex:0 0 auto;align-self:flex-start;padding:6px 10px;border-radius:6px;' +
          'border:1px solid var(--fab-border);background:var(--fab-bg-3);color:var(--fab-text)',
        `Go to ${destination.label}`
      );
      crossLink.type = 'button';
      // The literal hook, for the reason the drill-down states above it: the case registry's
      // selector guard greps this file for the hook a selector names, and a `dataset` write
      // would leave that literal nowhere in it.
      crossLink.setAttribute('data-lab-companion-tab-link', '');
      crossLink.addEventListener('click', () => context?.navigateToTab?.(destination.id));

      const panel = element(
        'div',
        'height:100%;min-height:0;display:flex;flex-direction:column;gap:12px;' +
          'padding:16px;border:2px dashed var(--fab-accent);border-radius:12px;' +
          'background:var(--fab-bg-2)'
      );
      // THE BANNER, AND IT IS FOR THE PHOTOGRAPH RATHER THAN FOR THE TEST (issue 1324).
      const banner = element(
        'div',
        'flex:0 0 auto;padding:8px 12px;border:1px solid var(--fab-warning);border-radius:8px;' +
          'background:var(--fab-warning-soft, var(--fab-bg-3));color:var(--fab-warning);' +
          'font-size:11px;font-weight:700;letter-spacing:0.04em',
        'TEST-ONLY COMPANION — registered by tests/view-lab/mount.js so Core can photograph its ' +
          'own companion seam. Not a Fabricate feature; in neither the free module nor Premium.'
      );
      banner.setAttribute('data-lab-companion-banner', '');
      panel.append(banner);
      panel.append(
        element('h2', 'flex:0 0 auto;margin:0;font-size:14px', `Test companion — ${tabId}`)
      );
      panel.append(openEditor);
      panel.append(crossLink);
      const scroller = element(
        'div',
        'flex:1 1 auto;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:8px'
      );
      scroller.dataset.labCompanionScroll = '';
      for (let row = 1; row <= 16; row += 1) {
        scroller.append(
          element(
            'p',
            'flex:0 0 auto;margin:0;padding:10px 12px;border-radius:8px;background:var(--fab-bg-1)',
            `Standing order ${row} — the companion owns this scroller, not Core.`
          )
        );
      }
      panel.append(scroller);
      panel.append(
        element(
          'p',
          'flex:0 0 auto;margin:0;color:var(--fab-text-subtle);font-size:11px',
          'Pinned footer — on the panel’s bottom edge only if the target is full height.'
        )
      );
      mountTarget.append(panel);
      return () => panel.remove();
    },
  };
}

// view-lab-region:mount-canvas-app
/**
 * The three GM canvas windows, each keyed by its own {@link APP_CHROME} id. `ref` is the one thing
 * this table has that `mountManagerApp` has no analogue for.
 */
const CANVAS_APP_MOUNTS = Object.freeze({
  'fabricate-interactable-browser': Object.freeze({
    exportName: 'InteractableBrowserApp',
    load: () =>
      Promise.all([
        import('../../src/ui/InteractableBrowserApp.svelte.js'),
        import('../../src/ui/svelte/apps/InteractableBrowserRoot.svelte'),
      ]),
  }),
  'fabricate-interactable-config': Object.freeze({
    exportName: 'InteractableConfigApp',
    load: () =>
      Promise.all([
        import('../../src/ui/InteractableConfigApp.svelte.js'),
        import('../../src/ui/svelte/apps/InteractableConfigRoot.svelte'),
      ]),
    ref: (params) => {
      const key = params.interactable ?? 'configured';
      const ref = LAB_INTERACTABLE_REFS[key];
      // Loudly, and by name. A missing ref renders a panel with no behaviour in it, which looks
      // like a screen rather than like a fault and would publish as evidence of one.
      if (!ref) {
        throw new Error(
          `view lab: unknown interactable "${key}"; ` +
            `labInteractables.js declares ${Object.keys(LAB_INTERACTABLE_REFS).join(', ')}`
        );
      }
      return ref;
    },
  }),
  'fabricate-interactables-manager': Object.freeze({
    exportName: 'InteractablesManagerApp',
    load: () =>
      Promise.all([
        import('../../src/ui/InteractablesManagerApp.svelte.js'),
        import('../../src/ui/svelte/apps/interactables/InteractablesManagerRoot.svelte'),
      ]),
  }),
});

/**
 * Mount one of the three canvas windows into the built frame.
 *
 * @param {HTMLElement} content The frame's `.window-content`.
 * @param {object} params The parsed query params.
 * @returns {Promise<{instance: object, services: object, props: object}>} The mounted window.
 */
async function mountCanvasApp(content, params) {
  const spec = CANVAS_APP_MOUNTS[params.appId];
  const [appModule, rootModule] = await spec.load();

  const app = borrowInstance(appModule[spec.exportName], {
    _services: null,
    ...(spec.ref ? { _ref: spec.ref(params) } : {}),
    // The lab never re-renders through ApplicationV2; an action in a captured frame is a no-op.
    render: () => {},
  });
  const props = app._prepareSvelteProps();
  const instance = mount(rootModule.default, { target: content, props });
  return { instance, services: props.services, props };
}
// view-lab-region:end

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
    // Own properties shadow the prototype's snapshot builder, which `io.knowledgeSnapshot` calls.
    // The rejecting promise is made per call, so nothing rejects at mount.
    ...(params.knowledgeLoading ? { _buildKnowledgeSnapshot: () => new Promise(() => {}) } : {}),
    ...(params.knowledgeError
      ? {
          _buildKnowledgeSnapshot: () =>
            Promise.reject(new Error('view lab: knowledge read failed')),
        }
      : {}),
  });
  const props = app._prepareSvelteProps();
  const services = props.services;
  if (params.downtimeProvider) {
    props.managerExtensions.publicApi.registerWorldNavProvider(labDowntimeProvider());
  }
  if (params.clearSystem) await props.store.selectSystem('');
  const instance = mount(CraftingSystemManagerRoot, { target: content, props });
  return { instance, services, props, store: props.store, tab: params.tab };
}

/**
 * The mount path for the window a case names (issue 1520).
 *
 * @param {HTMLElement} content The frame's `.window-content`.
 * @param {object} params The parsed query params.
 * @returns {Promise<object>} The mounted window.
 */
async function mountAppFor(content, params) {
  if (params.appId === 'fabricate-app') return mountPlayerApp(content, params);
  if (params.appId === 'fabricate-crafting-system-manager') return mountManagerApp(content, params);
  if (CANVAS_APP_MOUNTS[params.appId]) return mountCanvasApp(content, params);
  throw new Error(`view lab: no mount path for app "${params.appId}"`);
}

/**
 * Wait until the window has stopped changing. Real stores do real asynchronous loads, so "rendered"
 * is not a moment the mount call knows about.
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

  // view-lab-region:player-settle-stores
  // Wait for the STORES, not just the DOM. A store that is still loading renders its empty state,
  // which is quiet in exactly the same way a finished render is — so DOM stillness alone let the
  // journal capture "No active runs" while three were on their way in. Each player store exposes
  // `loading`, and most also `loadedOnce`; a store that has neither is skipped rather than waited on.
  //
  // RE-DERIVED against a companion-surface frame (issue 1198) and it verifiably needs no new
  // entry. A companion panel is mounted SYNCHRONOUSLY from `PlayerExtensionHost`'s mount effect —
  // an asynchronous `mount` is rejected at registration — so it is fully drawn before this pass
  // begins, and it introduces no store of its own: the seam creates, reads and writes no record,
  // setting or flag. The six names below still matter on such a frame because `ActorSelectTopBar`
  // renders above EVERY tab and the shell keeps the Journal badge fresh while its tab is closed.
  //
  // This block is also its own attributed REGION, and player-only readership is a fact rather
  // than an assumption: it waits on six names (`journal`, `crafting`, `inventory`, `alchemy`,
  // `craftingSources`, `actorBar`) that the player service bag declares and the Manager's
  // `_buildServices()` does not declare at all, so `watched` is empty for every manager frame.
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
  // view-lab-region:end

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

/** The faces the chrome paints with, matched by PATTERN rather than by name. */
const REQUIRED_CHROME_FACES = [
  {
    // Foundry ships Pro; the header controls, the resize grip and every Fabricate icon are drawn
    // with it.
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
 * @throws {Error} Naming every missing family and probe, because "fonts did not load" is not
 * actionable and this is the one V14 breakage that is otherwise silent.
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
 * Measure content widths that can be compared with the same render minus lab styles.
 *
 * @param {HTMLElement} frame The application frame.
 */
function measureContentWidths(frame) {
  return [...frame.querySelectorAll('*')].flatMap((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    // Inline text nodes report no client geometry, so their zero width is not layout evidence.
    if (
      box.width === 0 ||
      (style.display.startsWith('inline') && style.display !== 'inline-block')
    ) {
      return [];
    }
    return [{ element, boxWidth: box.width, clientWidth: element.clientWidth }];
  });
}

/**
 * Fail only when the View Lab's own stylesheet, rather than production CSS, shrinks content.
 *
 * @param {HTMLElement} frame The application frame.
 * @param {HTMLStyleElement} determinismStyle The View Lab's own stylesheet.
 * @throws {Error} Naming the offending elements, because a silent 10px is exactly what shipped.
 */
function assertNoLabInducedClipping(frame, determinismStyle) {
  const withLab = measureContentWidths(frame);
  const sheet = determinismStyle.sheet;
  if (!sheet) throw new Error('view lab: determinism stylesheet did not create a CSS stylesheet');

  const withoutLab = measureWithoutLabStyles(sheet, () => measureContentWidths(frame));

  const offenders = findLabInjectedContentWidthLosses(withLab, withoutLab);
  if (offenders.length > 0) {
    throw new Error(
      'view lab: a lab-injected style is resizing content boxes, so this frame would not depict ' +
        `production layout:\n  ${offenders
          .slice(0, 8)
          .map(
            ({ element, boxWidth, clientWidth, lost }) =>
              `${element.tagName.toLowerCase()}.${[...element.classList].join('.') || '(no class)'} ` +
              `loses ${lost.toFixed(1)}px of content width (box ${boxWidth.toFixed(1)}, client ${clientWidth})`
          )
          .join('\n  ')}` +
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

  const determinismStyle = installDeterminismStyles();

  const world = params.chromeOnly
    ? null
    : await buildLabWorld({
        managedSystemId: params.system,
        experimentalFeatures: params.experimental,
        clearSystem: params.clearSystem,
        noParties: params.noParties,
        noTools: params.noTools,
        noAuthoredWorldComponents: params.noAuthoredWorldComponents,
        longTravelLabels: params.longTravelLabels,
        noInteractables: params.noInteractables,
        noSceneRegions: params.noSceneRegions,
        gatheringTaskMode: params.gatheringTaskMode,
        journalCaseState: params.journalCaseState,
      });
  await seedRollPromptFixture(world, params.rollPromptState);
  if (params.longDowntimeLabels) applyLongDowntimeLocalization(world);
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
    // BEFORE the services are built, for the same reason the viewer flip is: the manager's
    // world-user projection reads `game.users.players` when it is constructed and nothing
    // re-reads it afterwards.
    if (params.manyPlayers) world.shim.seedPlayerRoster();
    // Before any step can click something that confirms.
    world.shim.setDialogAnswer(params.dialog);
    mounted = await mountAppFor(built.content, params);
    await settle([built.frame], mounted?.services ?? null);
    // After settle, because the check needs the populated tree — an empty window has nothing
    // clipped to measure.
    assertNoLabInducedClipping(built.frame, determinismStyle);
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
    journalCaseEvents: world?.fabricate?.journalCaseFixtureEvents ?? [],
    // The dialogs standing in the page, so a case can assert one opened and the driver can settle
    // it.
    dialogs: () => (world ? world.shim.openDialogs() : []),
    settle: () => settle(labSettleRoots(built.frame, world), mounted?.services ?? null),
  };
  if (params.journalCaseState) {
    document.body.setAttribute('data-journal-case-state', params.journalCaseState);
  }
  document.body.setAttribute(READY_ATTRIBUTE, params.caseId ?? params.appId);
}

boot().catch((error) => {
  const message = error && error.message ? error.message : String(error);
  document.body.setAttribute(ERROR_ATTRIBUTE, message);
  // Surface through the driver's console-error gate as well as the attribute.
  console.error(error);
});
