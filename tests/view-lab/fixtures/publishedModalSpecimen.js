/**
 * The published `Modal` specimen's wiring (issue 2656), which `PublishedModal.svelte` mounts and
 * `tests/components/published-modal-mounted.test.js` holds: a published `Button` opener and a
 * dialog whose footer `Button` and `onClose` run one close path. The opener's `onclick` opens the
 * dialog only when it was closed as the press began, which the ground records on `pointerdown`.
 * Opening focuses the footer button from a later task; closing focuses the opener first, writes
 * `data-lab-modal-closed="1"` on the ground and passes `open: false` with the dialog's other keys.
 */

/** The dialog's props but `open`, its slots and its callback. */
export const DIALOG = Object.freeze({
  title: 'Rename the reagent',
  subtitle: 'Flask of quicksilver',
  closeLabel: 'Close',
});
export const OPENER_LABEL = 'Rename reagent';
export const BODY_TEXT =
  'The new name replaces the old one in every recipe that lists this reagent.';
export const DONE_LABEL = 'Done';

/** Mounts the specimen with `mount`, the dialog's host `ground`; answers its teardown. */
export function mountModalSpecimen({ mount, ground, opener, target }) {
  const doc = ground.ownerDocument;
  let isOpen = false;
  let openAtPress = false;
  const props = { ...DIALOG, body: true, footer: true, onClose: () => close() };
  const dialog = mount('Modal', { target, props: { ...props, open: false }, overlayHost: ground });
  const paragraph = doc.createElement('p');
  paragraph.textContent = BODY_TEXT;
  dialog.slot('body').append(paragraph);
  const footer = doc.createElement('div');
  footer.setAttribute('data-lab-modal-footer', '');
  dialog.slot('footer').append(footer);
  const done = mount('Button', {
    target: footer,
    props: { role: 'primary', children: DONE_LABEL, onclick: () => close() },
  });
  const openerButton = mount('Button', {
    target: opener,
    props: {
      children: OPENER_LABEL,
      onclick: () => {
        const pressedOpen = openAtPress;
        openAtPress = false;
        if (!pressedOpen && !isOpen) show();
      },
    },
  });
  const recordPress = (event) => {
    if (opener.contains(event.target)) openAtPress = isOpen;
  };
  ground.addEventListener('pointerdown', recordPress);

  function show() {
    isOpen = true;
    ground.removeAttribute('data-lab-modal-closed');
    dialog.update({ ...props, open: true });
    doc.defaultView.setTimeout(() => footer.querySelector('button')?.focus());
  }

  function close() {
    opener.querySelector('button')?.focus();
    isOpen = false;
    ground.setAttribute('data-lab-modal-closed', '1');
    dialog.update({ ...props, open: false });
  }

  return () => {
    ground.removeEventListener('pointerdown', recordPress);
    openerButton.destroy();
    done.destroy();
    dialog.destroy();
  };
}
