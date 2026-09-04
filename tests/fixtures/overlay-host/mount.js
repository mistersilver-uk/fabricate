/**
 * Mount a REAL overlay component inside a chosen host, for the positioning proof (issue 1466).
 *
 * Everything here except the surrounding window chrome is production code, reached through the
 * real Svelte plugin: the component is imported from `src/`, its own `<style>` is injected by the
 * compiler exactly as it is in the shipped bundle, and `styles/fabricate.css` is served raw so the
 * popover gets its real `position: absolute`. That matters more than usual here — the subject is a
 * decision the component's SCRIPT makes at runtime, so a hand-written copy of its markup would
 * prove nothing at all.
 *
 * The host is chosen by query string so one page serves every scenario:
 *
 *   ?host=manager   `.fabricate-manager`, the manager's Svelte root inside its window
 *   ?host=app       `.fabricate-app`, the player window's ApplicationV2 frame
 *   ?host=none      a positioned container inside NO application root
 *
 * `?component=` picks `popover` (SearchablePopover), `icon` (IconPicker), `source`
 * (EssenceSourceSelector), `color` (ManagerColorPicker), `actorbar` (ActorSelectTopBar — a
 * real PRODUCT surface rather than a bare primitive, mounted only in the player host it ships
 * in) or `menu` (ActionMenu).
 *
 * `menu` is the only one mounted inside a SHORT, CLIPPING scroller rather than the shared tall
 * one, because the question it answers is different: every picker above asks whether a panel
 * lands at its trigger, and the action menu additionally asks whether it ESCAPES the scrolling
 * column its trigger sits in. `.manager-environment-tab-panel` is `overflow: auto` in the
 * product, so a row menu opened near the bottom of a long Tasks list was cut off by the panel's
 * own edge before issue 1477 portaled it.
 * `?frameLeft=` / `?frameTop=` place the window, so the test can assert against a host whose
 * origin is far from the viewport's — which is the entire discriminating fact. With the frame at
 * the origin every arrangement looks identical.
 */
import { mount } from 'svelte';

import ActionMenu from '../../../src/ui/svelte/components/ActionMenu.svelte';
import ActorSelectTopBar from '../../../src/ui/svelte/apps/ActorSelectTopBar.svelte';
import EssenceSourceSelector from '../../../src/ui/svelte/components/EssenceSourceSelector.svelte';
import IconPicker from '../../../src/ui/svelte/components/IconPicker.svelte';
import ManagerColorPicker from '../../../src/ui/svelte/components/ManagerColorPicker.svelte';
import SearchablePopover from '../../../src/ui/svelte/components/SearchablePopover.svelte';

const params = new URLSearchParams(globalThis.location.search);
const hostKind = params.get('host') ?? 'manager';
const componentKind = params.get('component') ?? 'popover';
const frameLeft = Number(params.get('frameLeft') ?? 220);
const frameTop = Number(params.get('frameTop') ?? 140);

function element(tag, className, styles) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (styles) Object.assign(node.style, styles);
  return node;
}

/**
 * Build the host chain and return the element the component mounts into.
 *
 * Each chain reproduces the real nesting between the application root and the component, because
 * the intermediate elements are not inert: `.fabricate-manager` is the positioned, clipping grid
 * the manager's overlays rely on, and the player app's content column is the scroller an overlay
 * has to escape.
 *
 * @returns {HTMLElement} The mount target.
 */
function buildHost() {
  if (hostKind === 'none') {
    const container = element('div', 'unhosted-container');
    const scroller = element('div', 'fixture-scroller');
    container.append(scroller);
    document.body.append(container);
    return scroller;
  }

  const frameStyles = {
    left: `${frameLeft}px`,
    top: `${frameTop}px`,
    width: '900px',
    height: '520px',
  };

  if (hostKind === 'app') {
    // `SvelteFabricateApp.svelte.js`: `classes: ['fabricate', 'fabricate-app']`, plus the
    // `application` class ApplicationV2 puts on every framed window.
    const frame = element('div', 'application fabricate fabricate-app', frameStyles);
    const content = element('section', 'window-content');
    const shell = element('div', 'fabricate-app-shell');
    const main = element('div', 'fabricate-app-main');
    const scroller = element('div', 'fabricate-app-content fixture-scroller');
    main.append(scroller);
    shell.append(main);
    content.append(shell);
    frame.append(content);
    document.body.append(frame);
    return scroller;
  }

  // `SvelteCraftingSystemManagerApp.svelte.js`: `classes: ['fabricate', 'crafting-system-manager']`,
  // with `.fabricate-manager` as the Svelte root inside the window content.
  const frame = element('div', 'application fabricate crafting-system-manager', frameStyles);
  const content = element('section', 'window-content');
  const managerRoot = element('div', 'fabricate-manager');
  managerRoot.dataset.fabricateTheme = 'dark';
  const main = element('div', 'manager-main fixture-scroller');
  managerRoot.append(main);
  content.append(managerRoot);
  frame.append(content);
  document.body.append(frame);
  return main;
}

const target = buildHost();

// A spacer, so the trigger sits well inside its host rather than at its top-left corner. With the
// trigger at the origin, a host-relative and a viewport-relative arrangement can coincide.
target.append(element('div', 'fixture-spacer', { height: '90px' }));

const mountPoint = element('div', 'fixture-mount');

// ── THE CLIPPING COLUMN (issue 1477) ────────────────────────────────────────────────────────
// For the action menu only, the trigger is put inside a SHORT `overflow: auto` box, near its
// bottom edge, and the box is the element the test measures the panel against. That box is the
// fixture's stand-in for `.manager-environment-tab-panel`, the scroller the composition list
// actually lives in — and it is what makes the clipping question askable at all. Mounted into the
// shared tall scroller the menu would fit whether or not it was portaled, and the measurement
// would pass on the unfixed tree.
if (componentKind === 'menu') {
  const column = element('div', 'clipping-column');
  const spacer = element('div', 'clipping-spacer');
  column.append(spacer, mountPoint);
  target.append(column);
} else {
  target.append(mountPoint);
}

/**
 * A stand-in for `services.actorBar`, matching the read surface `ActorSelectTopBar` uses.
 *
 * Plain rather than reactive: this fixture opens the picker once and measures it, so nothing here
 * has to survive a store update. Two actors, one with an image and one without, so the trigger and
 * the rows both draw their real shapes.
 *
 * @returns {object} The store shape the bar reads.
 */
function actorBarStore() {
  const actors = [
    { id: 'a1', uuid: 'Actor.a1', name: 'Aria the Bold', img: 'icons/svg/mystery-man.svg' },
    { id: 'a2', uuid: 'Actor.a2', name: 'Borin Stonebrew', img: null },
    { id: 'a3', uuid: 'Actor.a3', name: 'Celyn of the Vale', img: 'icons/svg/mystery-man.svg' },
  ];
  return {
    selectableActors: actors,
    selectedActorId: 'a1',
    get selectedActor() {
      return actors[0];
    },
    staminaPool: { current: 4, max: 10 },
    conditions: { weather: 'clear', timeOfDay: 'dusk' },
    conditionVisibility: { weather: true, timeOfDay: true },
    realmContext: { enabled: false, realms: [] },
    loaded: true,
    selectActor: () => {},
  };
}

/**
 * The six overlay subjects this fixture can mount, by `?component=`.
 *
 * All three of the `src/ui/svelte/components/` pickers are here rather than only `IconPicker`
 * (issue 1470), because the CSS half of the defect is PER FAMILY: each carries its own class
 * family and its own namespace roots, so one of them positioning correctly outside the manager
 * says nothing about the other two.
 */
const COMPONENTS = {
  icon: [IconPicker, { value: 'fas fa-fire', buttonTitle: 'Choose an icon' }],
  source: [
    EssenceSourceSelector,
    {
      items: [
        { id: 'alpha', name: 'Alpha', img: 'icons/svg/item-bag.svg' },
        { id: 'beta', name: 'Beta', img: 'icons/svg/item-bag.svg' },
      ],
      value: null,
      onChange: () => {},
    },
  ],
  color: [ManagerColorPicker, { colorToken: 'sage', buttonTitle: 'Choose a colour' }],
  // THE overflow action menu (issue 1477). Four verbs, so the panel is decisively taller than the
  // 120px clipping column it opens inside: a panel that had NOT escaped could not extend past the
  // column's bottom edge, which is the first of the test's two readings.
  menu: [
    ActionMenu,
    {
      items: [
        { id: 'open-source', label: 'Open source task', icon: 'fas fa-up-right-from-square' },
        { id: 'force-include', label: 'Force add', icon: 'fas fa-plus' },
        { id: 'restore', label: 'Restore', icon: 'fas fa-rotate-left' },
        { id: 'exclude', label: 'Exclude from environment', icon: 'fas fa-ban', danger: true },
      ],
      triggerLabel: 'More actions',
      onSelect: () => {},
    },
  ],
  popover: [
    SearchablePopover,
    {
      options: [
        { id: 'alpha', label: 'Alpha' },
        { id: 'beta', label: 'Beta' },
        { id: 'gamma', label: 'Gamma' },
      ],
      value: 'alpha',
      triggerClass: 'manager-travel-trigger',
      triggerLabel: 'Alpha',
      onChoose: () => {},
    },
  ],
  // THE PRIMITIVE'S FIRST PLAYER-WINDOW ADOPTER (issue 1475), and the reason it is a whole
  // product surface rather than another bare picker: the entry above proves `SearchablePopover`
  // CAN land in `.fabricate-app`, and nothing in the product depended on that. This one does.
  //
  // It is also the sharper measurement of the two, because the panel is now anchored to a trigger
  // sitting in a full-width bar rather than to a picker in the middle of a pane — the arrangement
  // that has to survive is "panel below the bar's own control", and the shipped alternative it
  // replaced was an `position: absolute` panel inside the bar with no portal at all.
  //
  // `activeTab: 'gathering'` deliberately: it draws the bar's right-hand context cluster, so the
  // trigger is measured in a bar of realistic width, and it is the one populated tab that renders
  // no `ComponentSourcesBar` (which would want a `services` bag this fixture has no business
  // faking).
  actorbar: [
    ActorSelectTopBar,
    {
      store: actorBarStore(),
      activeTab: 'gathering',
    },
  ],
};

const [Component, props] = COMPONENTS[componentKind] ?? COMPONENTS.popover;
mount(Component, { target: mountPoint, props });

globalThis.__overlayHostFixtureReady = true;
