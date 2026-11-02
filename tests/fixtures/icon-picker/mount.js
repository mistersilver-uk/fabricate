/**
 * Published `IconPicker`s mounted through the real seam in a Fabricate window, for
 * `icon-picker-icon-only-rendered.test.js` (issues 2899, 2905): each case in a target of its own,
 * `[data-case]` at the width it names, on the window's `--fab-bg-1` ground. `?theme=` names the
 * palette. A choice passes the chosen glyph back as `value`, as a companion's `update` does.
 */
import '../../../src/ui/publishedComponents.svelte.js';
import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

// ratchet-exempt(lint): the seam's ready check reads Foundry's `game`, which this page stands in for
globalThis.game = { fabricate: { ready: true } };

const params = new URLSearchParams(globalThis.location.search);
const { mount } = publishedComponentSeam.publicApi;
const LABELS = Object.freeze({
  listLabel: 'Reagent icons',
  searchLabel: 'Search reagent icons',
  noMatchesText: 'No icon matches.',
});
const CASES = Object.freeze([
  ['captioned', 240, { value: 'fas fa-flask', ariaLabel: 'Reagent icon' }],
  ['holds', 240, { value: 'fas fa-flask', ariaLabel: 'Reagent icon: Flask' }],
  ['unlisted', 240, { value: 'fas fa-premium-sigil-glyph', ariaLabel: 'Icon' }],
  ['narrow', 64, { value: 'fas fa-wand-magic-sparkles', ariaLabel: 'Faction icon' }],
  ['icon-only', 240, { value: 'fas fa-flask', ariaLabel: 'Reagent icon', iconOnly: true }],
  [
    'icon-only-narrow',
    64,
    { value: 'fas fa-wand-magic-sparkles', ariaLabel: 'Faction icon', iconOnly: true },
  ],
]);

const frame = document.createElement('div');
frame.className = 'application fabricate fabricate-app';
frame.dataset.fabricateTheme = params.get('theme') ?? 'fabricate';
const content = document.createElement('section');
content.className = 'window-content';
frame.append(content);
document.body.append(frame);

const handles = {};
for (const [id, width, props] of CASES) {
  const target = document.createElement('div');
  target.dataset.case = id;
  target.style.width = `${width}px`;
  content.append(target);
  let current = { ...LABELS, ...props };
  const onChange = (value) => {
    current = { ...current, value };
    handle.update({ ...current, onChange });
  };
  const handle = mount('IconPicker', { target, props: { ...current, onChange } });
  handles[id] = handle;
}

// ratchet-exempt(lint): the page's handles and ready mark, which the rendered suite reads
globalThis.__iconPickers = handles;
// ratchet-exempt(lint): as above
globalThis.__iconPickerReady = true;
