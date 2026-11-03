/**
 * Each published overlay entry mounted through a fresh seam inside a `<dialog>` (issue 2884).
 * `globalThis.__topLayer.open({ entry, modal, outsideHost, root })` opens the dialog with
 * `showModal()`, or `show()` when `modal` is false, mounts `entry` in it, and with `outsideHost`
 * passes an `overlayHost` on `<body>` outside the dialog, the old placement, as the negative
 * control; `root: 'around'` puts the dialog inside a Fabricate window root, and `targetOutside` puts
 * the target on `<body>`, outside the dialog that holds the anchor.
 */
import {
  COMPONENTS,
  LOADERS,
  publishedComponentRuntime,
} from '../../../src/ui/publishedComponents.svelte.js';
import { createPublishedComponents } from '../../../src/ui/publishedComponentSeam.js';

const ui = (() => {
  const seam = createPublishedComponents({ isReady: () => true });
  seam.register({ ...publishedComponentRuntime, components: COMPONENTS, loaders: LOADERS });
  return seam.publicApi;
})();

const LETTERS = Object.freeze([
  { value: 'alpha', label: 'Alpha' },
  { value: 'beta', label: 'Beta' },
  { value: 'gamma', label: 'Gamma' },
]);

const closes = [];

/** Each entry's props, given its `update` for an entry the companion opens and closes. */
const ENTRIES = Object.freeze({
  Select: () => ({ options: LETTERS, value: 'alpha', ariaLabel: 'Letter', onChange() {} }),
  IconPicker: () => ({
    value: 'fas fa-gear',
    ariaLabel: 'Glyph',
    listLabel: 'Glyphs',
    searchLabel: 'Find a glyph',
    noMatchesText: 'No glyph matches',
    onChange() {},
  }),
  ActionMenu: () => ({
    items: [
      { id: 'rename', label: 'Rename' },
      { id: 'delete', label: 'Delete' },
    ],
    ariaLabel: 'Reagent actions',
    onSelect() {},
  }),
  Typeahead: () => ({ options: LETTERS, query: 'a', ariaLabel: 'Find a letter', onChange() {} }),
  Popover: (update, open) => ({
    open,
    anchorId: 'fixture-anchor',
    title: 'Adjust the score',
    body: true,
    onClose: () => {
      closes.push('Popover');
      update(false);
    },
  }),
  Modal: (update, open) => ({
    open,
    title: 'Rename the reagent',
    closeLabel: 'Close',
    body: true,
    onClose: () => {
      closes.push('Modal');
      update(false);
    },
  }),
});

/** The DialogV2 stand-in: a header, the mount's target and, for a companion-opened entry, an anchor. */
function dialogFor(entry, { root, targetOutside }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'application dialog';
  const header = document.createElement('header');
  header.textContent = 'Reagent';
  header.dataset.fixtureHeader = '';
  const target = document.createElement('div');
  target.className = 'fixture-target';
  dialog.append(header);
  (targetOutside ? document.body : dialog).append(target);
  if (entry === 'Popover' || entry === 'Modal') {
    const anchor = document.createElement('button');
    Object.assign(anchor, { type: 'button', id: 'fixture-anchor', textContent: 'Open' });
    dialog.append(anchor);
  }
  document.body.append(root === 'around' ? windowRoot(dialog) : dialog);
  return { dialog, target };
}

/** A Fabricate window root holding `child`. */
function windowRoot(child) {
  const root = document.createElement('div');
  root.className = 'fabricate fabricate-app';
  root.style.position = 'relative';
  root.append(child);
  return root;
}

function open({ entry, modal = true, outsideHost = false, ...placed }) {
  const { dialog, target } = dialogFor(entry, placed);
  if (modal) dialog.showModal();
  else dialog.show();
  let overlayHost;
  if (outsideHost) {
    overlayHost = document.createElement('div');
    overlayHost.className = 'fabricate fixture-host';
    document.body.append(overlayHost);
  }
  let handle = null;
  const update = (next) => handle.update(ENTRIES[entry](update, next));
  handle = ui.mount(entry, { target, props: ENTRIES[entry](update, false), overlayHost });
  const anchor = dialog.querySelector('#fixture-anchor');
  anchor?.addEventListener('click', () => update(true));
  if (entry === 'Popover') {
    const field = Object.assign(document.createElement('input'), { ariaLabel: 'Score' });
    handle.slot('body').append(field);
  }
  if (entry === 'Modal') {
    const save = Object.assign(document.createElement('button'), {
      type: 'button',
      textContent: 'Save',
    });
    handle.slot('body').append(save);
  }
  return true;
}

// ratchet-exempt(lint): the Playwright suite reads the fixture's API and readiness off the page.
Object.assign(globalThis, { __topLayer: { open, closes }, __topLayerReady: true });
