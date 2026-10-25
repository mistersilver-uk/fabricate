/**
 * The specimens the standalone style root's rendered admission test draws (issue 2456): each
 * widened entry's props, covering every value of the vocabularies that test reads from the
 * components, and the computed properties it compares element by element.
 */

const press = () => {};

/** Each widened entry's specimens, by id, with the props each mounts with. */
export const STANDALONE_SPECIMENS = Object.freeze({
  Button: Object.freeze({
    'button-neutral': { role: 'neutral', children: 'Clear filters', onclick: press },
    'button-primary': { role: 'primary', children: 'Craft', onclick: press },
    'button-ghost': { role: 'ghost', children: 'Cancel', onclick: press },
    'button-dashed': { role: 'dashed', children: 'Add step', onclick: press },
    'button-danger': { role: 'danger', children: 'Delete', onclick: press },
    'button-warning': { role: 'warning', children: 'Override', onclick: press },
    'button-full-width': { fullWidth: true, children: 'Start batch', onclick: press },
    'button-disabled': { disabled: true, children: 'Not yet', onclick: press },
  }),
  IconButton: Object.freeze({
    'icon-button-neutral': { icon: 'fas fa-gear', ariaLabel: 'Settings', onclick: press },
    'icon-button-primary': {
      role: 'primary',
      icon: 'fas fa-plus',
      ariaLabel: 'Add',
      onclick: press,
    },
    'icon-button-ghost': { role: 'ghost', icon: 'fas fa-eye', ariaLabel: 'Show', onclick: press },
    'icon-button-danger': {
      role: 'danger',
      icon: 'fas fa-trash',
      ariaLabel: 'Remove',
      onclick: press,
    },
    'icon-button-ghost-danger': {
      role: 'ghost-danger',
      icon: 'fas fa-xmark',
      ariaLabel: 'Discard',
      onclick: press,
    },
    'icon-button-size-24': { size: 24, icon: 'fas fa-pen', ariaLabel: 'Edit', onclick: press },
    'icon-button-size-26': { size: 26, icon: 'fas fa-copy', ariaLabel: 'Copy', onclick: press },
    'icon-button-disabled': {
      disabled: true,
      icon: 'fas fa-lock',
      ariaLabel: 'Locked',
      onclick: press,
    },
  }),
  StatusToggle: Object.freeze({
    'toggle-off': { on: false, ariaLabel: 'Group by category', onclick: press },
    'toggle-on': { on: true, ariaLabel: 'Hidden tasks', onclick: press },
  }),
  InspectorCard: Object.freeze({
    'card-filled': { children: true },
  }),
  Well: Object.freeze({
    'well-labelled': { label: 'Chosen reagents', children: true },
    'well-unlabelled': { children: true },
  }),
});

/**
 * The computed properties compared on every element drawn: the union of the lists
 * `re-rooted-controls-host-independence.test.js` compares for these controls, then the ink, the
 * focus ring, the motion and the disabled face the admission clause reads.
 */
export const STANDALONE_COMPARED = Object.freeze([
  'min-height',
  'height',
  'max-width',
  'width',
  'box-sizing',
  'display',
  'flex-direction',
  'align-items',
  'gap',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-left',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  'border-top-color',
  'border-radius',
  'background-color',
  'background-clip',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'overflow',
  'text-overflow',
  'flex-wrap',
  'color',
  'color-scheme',
  'opacity',
  'cursor',
  'outline-style',
  'outline-width',
  'outline-color',
  'outline-offset',
  'box-shadow',
  'transition-duration',
]);
