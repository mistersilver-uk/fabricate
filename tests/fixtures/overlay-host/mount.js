/** Mount a REAL overlay component inside a chosen host, for the positioning proof (issue 1466). */
import { createRawSnippet, mount } from 'svelte';

import ActionMenu from '../../../src/ui/svelte/components/ActionMenu.svelte';
import ActorSelectTopBar from '../../../src/ui/svelte/apps/ActorSelectTopBar.svelte';
import EssenceSourceSelector from '../../../src/ui/svelte/components/EssenceSourceSelector.svelte';
import IconPicker from '../../../src/ui/svelte/components/IconPicker.svelte';
import Modal from '../../../src/ui/svelte/components/Modal.svelte';
import RecipeDurationEditor from '../../../src/ui/svelte/apps/manager/recipe/RecipeDurationEditor.svelte';
import SearchablePopover from '../../../src/ui/svelte/components/SearchablePopover.svelte';
import TintPickerButton from '../../../src/ui/svelte/components/TintPickerButton.svelte';

import AnchoredPopoverHost from './AnchoredPopoverHost.svelte';
import ModalPickerHost from './ModalPickerHost.svelte';
import TintAnchoredHost from './TintAnchoredHost.svelte';

const params = new URLSearchParams(globalThis.location.search);
const hostKind = params.get('host') ?? 'manager';
const componentKind = params.get('component') ?? 'popover';
const frameLeft = Number(params.get('frameLeft') ?? 220);
const frameTop = Number(params.get('frameTop') ?? 140);

/**
 * Swap the flat module sheet for an `@import` into the cascade layer `layer`, as Foundry loads a
 * module's styles in `layer(modules)`, so an unlayered component style outranks every rule in it.
 *
 * @param {string} layer The cascade layer's name.
 */
async function loadSheetInLayer(layer) {
  const flat = document.querySelector('link[href$="fabricate.css"]');
  const layered = document.createElement('style');
  layered.textContent = `@import url('${new URL(flat.href).pathname}') layer(${layer});`;
  const loaded = new Promise((resolve, reject) => {
    layered.addEventListener('load', resolve, { once: true });
    layered.addEventListener('error', reject, { once: true });
  });
  document.head.append(layered);
  await loaded;
  flat.remove();
}

function element(tag, className, styles) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (styles) Object.assign(node.style, styles);
  return node;
}

/**
 * Build the host chain and return the element the component mounts into.
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
    // `SvelteFabricateApp.svelte.js`: `classes: ['fabricate', 'fabricate-app',
    // 'fabricate-app-window']`, plus the `application` class ApplicationV2 puts on every framed
    // window (issue 1520).
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

// `?wrap=biome-add` mounts into the New-biome form's grid, so a trigger is measured in the 38px
// column it ships in (issue 2459).
const inBiomeForm = params.get('wrap') === 'biome-add';
const mountPoint = element(
  inBiomeForm ? 'form' : 'div',
  inBiomeForm ? 'manager-condition-add manager-biome-add' : 'fixture-mount'
);

// THE CLIPPING COLUMN (issue 1477) ──────────────────────────────────────────────────────── For the
// action menu only, the trigger is put inside a SHORT `overflow: auto` box, near its bottom edge,
// and the box is the element the test measures the panel against.
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

/** A static snippet drawing `html`. */
const snippet = (html) => createRawSnippet(() => ({ render: () => html }));

/**
 * The shared dialog (issue 2661), trapping focus under `?trap=1`; `<body data-modal-closes>`
 * counts `onClose`.
 *
 * @returns {object} The Modal's props.
 */
function modalProps() {
  document.body.dataset.modalCloses = '0';
  return {
    open: true,
    title: 'Import report',
    subtitle: 'Three components imported',
    trapFocus: params.get('trap') === '1',
    onClose: () => {
      document.body.dataset.modalCloses = String(Number(document.body.dataset.modalCloses) + 1);
    },
    body: snippet('<p data-modal-text>Every component kept its source link.</p>'),
    footer: snippet('<button type="button" data-modal-done>Done</button>'),
  };
}

/** The overlay subjects this fixture can mount, by `?component=` (issue 1470). */
const COMPONENTS = {
  icon: [IconPicker, { value: 'fas fa-fire', ariaLabel: 'Choose an icon' }],
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
  // `allowCustom` keeps the hex field, so the clamp is measured on the panel's tallest shape: the
  // gathering-biome form, the one caller that opts in (issue 2352).
  color: [
    TintPickerButton,
    { colorToken: 'sage', ariaLabel: 'Choose a colour', allowCustom: true },
  ],
  // THE SIXTH COPY OF THE POSITIONING PASS (issue 1500), and the only one of the six that had no
  // row here.
  duration: [
    RecipeDurationEditor,
    {
      timeRequirement: { minutes: 30, hours: 2, days: 0, months: 0, years: 0 },
      onChange: () => {},
    },
  ],
  // THE overflow action menu (issue 1477).
  menu: [
    ActionMenu,
    {
      items: [
        { id: 'open-source', label: 'Open source task', icon: 'fas fa-up-right-from-square' },
        { id: 'force-include', label: 'Force add', icon: 'fas fa-plus' },
        { id: 'restore', label: 'Restore', icon: 'fas fa-rotate-left' },
        { id: 'exclude', label: 'Exclude from environment', icon: 'fas fa-ban', danger: true },
      ],
      ariaLabel: 'More actions',
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
      onSelect: () => {},
    },
  ],
  // THE PRIMITIVE'S FIRST PLAYER-WINDOW ADOPTER (issue 1475), and the reason it is a whole product
  // surface rather than another bare picker: the entry above proves `SearchablePopover` CAN land in
  // `.fabricate-app`, and nothing in the product depended on that.
  // The picker opened from a caller's anchor rather than its own trigger (issue 2459).
  'anchored-popover': [AnchoredPopoverHost, { form: params.get('form') ?? 'element' }],
  // The tint palette opened from a caller's anchor, as the biome edit palette opens it (issue 2459).
  'tint-anchored': [TintAnchoredHost, {}],
  modal: [Modal, componentKind === 'modal' ? modalProps() : {}],
  // A dialog holding an IconPicker, a Select and a SetPicker, trapping focus under `?trap=1`, for
  // the Tab and Escape proof (issues 2676, 2699); `?last=footer` ends it on a search-free footer
  // picker (issue 2739).
  'modal-picker': [
    ModalPickerHost,
    { trapFocus: params.get('trap') === '1', footerPicker: params.get('last') === 'footer' },
  ],
  actorbar: [
    ActorSelectTopBar,
    {
      store: actorBarStore(),
      activeTab: 'gathering',
    },
  ],
};

// `?layer=<name>` measures the product cascade rather than the flat sheet.
if (params.get('layer')) await loadSheetInLayer(params.get('layer'));

const [Component, props] = COMPONENTS[componentKind] ?? COMPONENTS.popover;
mount(Component, { target: mountPoint, props });

// The page's next tab stop after the frame, where a Tab a panel leaves unhandled lands.
if (componentKind === 'modal-picker') {
  const pageAfter = document.createElement('button');
  Object.assign(pageAfter, { type: 'button', textContent: 'Page after' });
  pageAfter.dataset.pageAfter = '';
  document.body.append(pageAfter);
}

globalThis.__overlayHostFixtureReady = true;
