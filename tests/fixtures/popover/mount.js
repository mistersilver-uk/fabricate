/**
 * One published `Popover` mounted through the real seam, for `popover-rendered.test.js` (issue
 * 2861). `?host=` chooses where its target and anchor live: `companion`, a shell under no
 * Fabricate root, so the panel opens on the standalone layer over the viewport; `manager`, the
 * Manager's window and root, the anchor in a scroller; `modal`, a published `Modal`'s body in the
 * Manager; `detached`, a Fabricate window in a window `window.open` opened from the page, as
 * Foundry 14 detaches one, built once `[data-fixture-open-detached]` is pressed; `dialog`, a
 * companion's modal `<dialog>`. `?ah` sets the anchor's height, and `?content=picker` draws an
 * `IconPicker`.
 * `?ax`/`?ay` place the anchor's corner in its container; `?placement` and `?outside=0` are passed
 * through, and `?label=title` drops `ariaLabel`; `?content` is `nudge`, `tall`, `select` or
 * `empty`. The companion counts `onClose` on `<body data-closes>`, closes from it, and toggles
 * `open` from a press on its anchor.
 */
import '../../../src/ui/publishedComponents.svelte.js';
import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

// ratchet-exempt(lint): the seam's ready check reads Foundry's `game`, which this page stands in for
globalThis.game = { fabricate: { ready: true } };

const params = new URLSearchParams(globalThis.location.search);
const host = params.get('host') ?? 'companion';
const content = params.get('content') ?? 'nudge';
const ANCHOR_ID = 'fixture-anchor';
const { mount } = publishedComponentSeam.publicApi;

function element(doc, tag, attributes = {}, styles = {}) {
  const node = doc.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  Object.assign(node.style, styles);
  return node;
}

/** A positioned window frame classed `classes`, answering its `.window-content`. */
function windowFrame(doc, classes) {
  const frame = element(
    doc,
    'div',
    { class: `application ${classes}` },
    { left: '160px', top: '80px', width: '900px', height: '600px' }
  );
  const windowContent = element(doc, 'section', { class: 'window-content' });
  frame.append(windowContent);
  doc.body.append(frame);
  return windowContent;
}

/** A scroller taller than its window inside `root`, appended to `windowContent`. */
function scrollerIn(doc, windowContent, root) {
  const scroller = element(doc, 'div', { class: 'fixture-scroller', 'data-fixture-scroller': '' });
  scroller.append(element(doc, 'div', {}, { height: '1600px' }));
  root.append(scroller);
  windowContent.append(root);
  return scroller;
}

/** The element the anchor and the popover's target are put in, for `host`. */
function containerIn(doc) {
  if (host === 'manager' || host === 'modal') {
    const root = element(doc, 'div', {
      class: 'fabricate-manager',
      'data-fabricate-theme': 'dark',
    });
    root.style.height = '100%';
    return scrollerIn(doc, windowFrame(doc, 'fabricate crafting-system-manager'), root);
  }
  if (host === 'detached') {
    const root = element(doc, 'div', { class: 'fabricate-app-main' }, { height: '100%' });
    return scrollerIn(doc, windowFrame(doc, 'fabricate fabricate-app'), root);
  }
  if (host === 'dialog') return companionDialog(doc);
  const shell = element(
    doc,
    'div',
    { class: 'companion-sheet' },
    { position: 'fixed', inset: '0' }
  );
  doc.body.append(shell);
  return shell;
}

/**
 * A companion's modal `<dialog>`, opened with `showModal()`, counting its own closes on
 * `<body data-dialog-closes>`; `?dialogHost=1` gives it a positioned element for `overlayHost`.
 */
function companionDialog(doc) {
  const dialog = element(
    doc,
    'dialog',
    { 'data-fixture-dialog': '' },
    { width: '640px', height: '420px', padding: '0' }
  );
  const pane = element(
    doc,
    'div',
    { 'data-fixture-dialog-pane': '' },
    { position: 'relative', height: '100%' }
  );
  dialog.append(pane);
  doc.body.append(dialog);
  doc.body.dataset.dialogCloses = '0';
  dialog.addEventListener('close', () => {
    doc.body.dataset.dialogCloses = String(Number(doc.body.dataset.dialogCloses) + 1);
  });
  dialog.showModal();
  return pane;
}

/** The body slot's content, by `?content`. */
function fill(slot) {
  const doc = slot.ownerDocument;
  if (content === 'empty') return;
  if (content === 'tall') {
    for (let line = 1; line <= 40; line += 1) {
      slot.append(element(doc, 'p', { 'data-fixture-line': String(line) }, { margin: '0' }));
      slot.lastChild.textContent = `Line ${line} of the companion’s own notes`;
    }
    return;
  }
  if (content === 'picker') {
    const target = element(doc, 'div', { 'data-fixture-picker': '' });
    slot.append(target);
    mount('IconPicker', {
      target,
      props: {
        value: 'fas fa-flask',
        ariaLabel: 'Glyph',
        listLabel: 'Glyphs',
        searchLabel: 'Search glyphs',
        noMatchesText: 'No glyph matches',
        onChange: () => {},
      },
    });
    return;
  }
  if (content === 'select') {
    const target = element(doc, 'div', { 'data-fixture-select': '' });
    slot.append(target);
    const select = {
      options: [
        { value: 'gm', label: 'GM award' },
        { value: 'rest', label: 'Long rest' },
        { value: 'curse', label: 'Curse' },
      ],
      value: 'gm',
      ariaLabel: 'Reason',
      onChange: (value) => handle.update({ ...select, value }),
    };
    const handle = mount('Select', { target, props: select });
    return;
  }
  slot.append(
    element(doc, 'input', { type: 'number', 'aria-label': 'Value', 'data-fixture-value': '' })
  );
  const row = element(doc, 'div', {}, { display: 'flex', gap: '4px' });
  for (const delta of ['−5', '−2', '−1', '+1', '+2', '+5']) {
    const button = element(doc, 'button', { type: 'button', 'data-fixture-delta': delta });
    button.textContent = delta;
    row.append(button);
  }
  slot.append(row);
  slot.append(
    element(doc, 'input', { type: 'text', 'aria-label': 'Reason', 'data-fixture-reason': '' })
  );
}

/** Builds the scene in `doc`, mounts the popover, and records it on `globalThis.__popover`. */
function build(doc) {
  let container = containerIn(doc);
  if (host === 'modal') {
    const dialogTarget = element(doc, 'div');
    container.append(dialogTarget);
    const dialog = mount('Modal', {
      target: dialogTarget,
      props: {
        open: true,
        title: 'Ability scores',
        closeLabel: 'Close',
        body: true,
        onClose: () => {
          doc.body.dataset.modalCloses = String(Number(doc.body.dataset.modalCloses ?? 0) + 1);
        },
      },
    });
    container = dialog.slot('body');
  }
  const anchor = element(doc, 'button', {
    type: 'button',
    id: ANCHOR_ID,
    'data-fixture-anchor': '',
  });
  anchor.textContent = 'Strength 14';
  Object.assign(anchor.style, {
    left: `${Number(params.get('ax') ?? 40)}px`,
    top: `${Number(params.get('ay') ?? 40)}px`,
    ...(params.get('ah') && { height: `${Number(params.get('ah'))}px` }),
    ...(host === 'modal' && { position: 'static' }),
  });
  const target = element(doc, 'div', { 'data-fixture-target': '' });
  // A control of the companion's after the anchor, which a plain Tab from the anchor would reach.
  const after = element(doc, 'button', { type: 'button', 'data-fixture-after': '' });
  after.textContent = 'Next cell';
  Object.assign(after.style, { position: 'absolute', left: '600px', top: '700px' });
  container.append(anchor, target, after);
  doc.body.dataset.closes = '0';
  let props = {
    open: params.get('open') !== '0',
    anchorId: ANCHOR_ID,
    title: 'Strength',
    ...(params.get('label') !== 'title' && { ariaLabel: 'Adjust Strength' }),
    body: true,
    onClose: () => {
      doc.body.dataset.closes = String(Number(doc.body.dataset.closes) + 1);
      update({ open: false });
    },
    ...(params.get('placement') && { placement: params.get('placement') }),
    ...(params.get('outside') === '0' && { closeOnOutsideClick: false }),
  };
  const overlayHost =
    params.get('dialogHost') === '1' ? doc.querySelector('[data-fixture-dialog-pane]') : undefined;
  const handle = mount('Popover', { target, props, overlayHost });
  function update(next) {
    props = { ...props, ...next };
    handle.update(props);
  }
  anchor.addEventListener('click', () => update({ open: !props.open }));
  fill(handle.slot('body'));
  // ratchet-exempt(lint): the page's handle and ready mark, which the rendered suite reads
  globalThis.__popover = { handle, update, doc, anchor };
  // ratchet-exempt(lint): as above
  globalThis.__popoverReady = true;
}

/** Opens the detached window, gives it the module sheet and the fixture chrome, then builds in it. */
async function buildDetached() {
  const popup = globalThis.open('', 'fabricate-detached', 'width=1100,height=760');
  const doc = popup.document;
  doc.body.className = 'vtt game theme-dark';
  const link = element(doc, 'link', {
    rel: 'stylesheet',
    href: new URL('/@popover-styles/fabricate.css', globalThis.location.href).href,
  });
  const loaded = new Promise((done) => link.addEventListener('load', done, { once: true }));
  const chrome = element(doc, 'style');
  chrome.textContent = document.querySelector('style[data-fixture-chrome]').textContent;
  doc.head.append(link, chrome);
  await loaded;
  build(doc);
}

if (host === 'detached') {
  document
    .querySelector('[data-fixture-open-detached]')
    .addEventListener('click', () => void buildDetached());
} else {
  build(document);
}
