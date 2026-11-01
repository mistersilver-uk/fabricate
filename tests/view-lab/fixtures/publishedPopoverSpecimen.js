/**
 * The popover specimen's wiring (issue 2861), which `PublishedPopover.svelte` mounts and
 * `tests/components/published-popover-mounted.test.js` runs the View Lab cases against: a
 * companion's ability grid on a positioned ground that is also each popover's `overlayHost`, and
 * two open `Popover`s, a nudge each, both stating `'bottom-start'`: one under a cell in the grid's
 * top row, with room below, and one under a cell in its bottom row, with none, so it flips above.
 * Each holds a published `Field` with a value input, six published delta `Button`s at the 24
 * rung, the last disabled at the cap, and a reason `Field`. Every word is a companion's final
 * text, so none is localized.
 */

/** The View Lab cases this specimen draws, its base case first. */
export const POPOVER_CASES = Object.freeze(['manager-published-popover-specimen']);

/** The grid's cells, top row then bottom row, each `[key, label, score]`. */
export const POPOVER_CELLS = Object.freeze([
  Object.freeze([
    ['strength', 'Strength', 14],
    ['dexterity', 'Dexterity', 12],
    ['constitution', 'Constitution', 13],
  ]),
  Object.freeze([
    ['intelligence', 'Intelligence', 10],
    ['wisdom', 'Wisdom', 18],
    ['charisma', 'Charisma', 8],
  ]),
]);

/** The two nudges: the cell each is anchored to, and its value against the cap of 20. */
export const POPOVER_NUDGES = Object.freeze([
  Object.freeze({ cell: 'strength', label: 'Strength', value: 14 }),
  Object.freeze({ cell: 'wisdom', label: 'Wisdom', value: 18 }),
]);

const DELTAS = Object.freeze([-5, -2, -1, 1, 2, 5]);
const CAP = 20;

/** The anchor id of the cell `key`, and the panel id its popover takes. */
export const cellId = (key) => `lab-popover-${key}`;
export const panelId = (key) => `${cellId(key)}-popover`;

const noop = () => {};

/** An element named `tag` in `parent`'s document, carrying `text` and `attributes`, appended. */
function drawn(parent, tag, text, attributes = {}) {
  const element = parent.ownerDocument.createElement(tag);
  if (text) element.textContent = text;
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  parent.append(element);
  return element;
}

/** A labelled field of the published `Field` in `slot`, holding a caption and an input. */
function labelledField(mount, slot, caption, input) {
  const target = drawn(slot, 'div', '');
  const field = mount('Field', { target, props: { as: 'label', size: '26', children: true } });
  const column = field.slot('children');
  drawn(column, 'span', caption);
  drawn(column, 'input', '', input);
  return field;
}

/** One nudge's body: the value field, the delta row and the reason field. */
function fillNudge(mount, slot, { cell, value }) {
  const handles = [labelledField(mount, slot, 'Value', { type: 'number', value: String(value) })];
  const row = drawn(slot, 'div', '', { 'data-lab-popover-deltas': cell });
  row.style.cssText = 'display: flex; gap: 4px';
  for (const delta of DELTAS) {
    const target = drawn(row, 'div', '', { 'data-lab-popover-delta': `${cell}${delta}` });
    target.style.display = 'flex';
    handles.push(
      mount('Button', {
        target,
        props: {
          children: delta > 0 ? `+${delta}` : `−${-delta}`,
          size: '24',
          disabled: value + delta > CAP,
          onclick: noop,
        },
      })
    );
  }
  handles.push(
    labelledField(mount, slot, 'Reason', { type: 'text', placeholder: 'Blessing of the oak' })
  );
  return handles;
}

/**
 * Mounts the specimen with `mount` into `ground`, which it fills: the grid, a target per nudge and
 * each nudge open on its cell. Answers its teardown.
 */
export function mountPopoverSpecimen({ mount, ground }) {
  ground.setAttribute('data-lab-popover-ground', '');
  const rows = POPOVER_CELLS.map((cells, index) => {
    const row = drawn(ground, 'div', '', { 'data-lab-popover-row': String(index) });
    for (const [key, label, score] of cells) {
      drawn(row, 'button', `${label} ${score}`, {
        type: 'button',
        id: cellId(key),
        'aria-haspopup': 'dialog',
        'aria-expanded': String(POPOVER_NUDGES.some(({ cell }) => cell === key)),
        'aria-controls': panelId(key),
      });
    }
    return row;
  });
  ground.insertBefore(drawn(ground, 'div', '', { 'data-lab-popover-spacer': '' }), rows[1]);
  const handles = POPOVER_NUDGES.flatMap((nudge) => {
    const target = drawn(ground, 'div', '', { 'data-lab-popover-target': nudge.cell });
    const popover = mount('Popover', {
      target,
      overlayHost: ground,
      props: {
        open: true,
        anchorId: cellId(nudge.cell),
        placement: 'bottom-start',
        title: nudge.label,
        ariaLabel: `Adjust ${nudge.label}`,
        body: true,
        onClose: noop,
      },
    });
    return [...fillNudge(mount, popover.slot('body'), nudge), popover];
  });
  return () => {
    for (const handle of handles) handle.destroy();
    ground.replaceChildren();
  };
}
