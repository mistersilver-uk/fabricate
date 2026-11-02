/**
 * Each described control the published seam mounts live (issue 2895), in a `[data-case]` cell,
 * with `game.tooltip` standing in for Foundry's `TooltipManager` as
 * `.agents/docs/foundry-and-architecture.md` reads it: `activate` closes another element's tooltip,
 * writes the text into `#tooltip` and sets `aria-describedby="tooltip"`, and `deactivate` empties
 * it and removes the attribute whatever its value.
 */
import '../../../src/ui/publishedComponents.svelte.js';
import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

const LABEL = 'Back 1 day';
const DESCRIPTION = 'Moves the date back 1 day; credits stay';
const TIP = 'Rewinds the clock';

const panel = document.querySelector('#tooltip');

const tooltip = {
  element: null,
  activate(element, { text = '' } = {}) {
    if (this.element && this.element !== element) this.deactivate();
    this.element = element;
    panel.textContent = text;
    element.setAttribute('aria-describedby', 'tooltip');
  },
  deactivate() {
    panel.textContent = '';
    this.element?.removeAttribute('aria-describedby');
    this.element = null;
  },
};

// ratchet-exempt(lint): the seam's ready check and the tooltip read Foundry's `game`, stood in for here
globalThis.game = { fabricate: { ready: true }, tooltip };

const CASES = Object.freeze([
  ['icon', 'IconButton', { icon: 'fas fa-backward', ariaLabel: LABEL }],
  ['button-tooltip', 'Button', { children: LABEL, tooltip: TIP }],
  ['button-hinted', 'Button', { children: LABEL, tooltip: TIP, 'aria-describedby': 'hint' }],
]);

const root = document.querySelector('[data-fixture-root]');
for (const [id, name, props] of CASES) {
  const target = document.createElement('div');
  target.dataset.case = id;
  root.append(target);
  publishedComponentSeam.publicApi.mount(name, {
    target,
    props: { ...props, description: DESCRIPTION, onclick() {} },
  });
}

// ratchet-exempt(lint): the ready mark the rendered suite waits for
globalThis.__describedReady = true;
