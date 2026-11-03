/**
 * Published `Select`s with and without `fill` mounted through the real seam, for
 * `select-fill-rendered.test.js` (issue 2904). One target per case, each `width` px wide and of the
 * `display` it names, at each `size`: `fill` true in a flex and in a block target, and absent in a
 * flex target. `?host=window` draws them in a Fabricate window, else in a companion's shell under no
 * Fabricate root; `?dir=rtl` sets the shell's direction. A choice passes the value back through
 * `update` and is echoed on the case's `data-chosen`; `<body data-fixture-ready>` marks every case
 * mounted.
 */
import '../../../src/ui/publishedComponents.svelte.js';
import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

// ratchet-exempt(lint): the seam's ready check reads Foundry's `game`, which this page stands in for
globalThis.game = { fabricate: { ready: true } };

const params = new URLSearchParams(globalThis.location.search);
const { mount } = publishedComponentSeam.publicApi;

const OPTIONS = Object.freeze([
  { value: 'ash', label: 'Ash' },
  { value: 'oak', label: 'Oak heartwood from the northern grove, seasoned three winters' },
  { value: 'yew', label: 'Yew' },
]);
const SIZES = Object.freeze(['form', 'inline', 'toolbar']);
const WIDTHS = Object.freeze([160, 240, 360]);
const FORMS = Object.freeze([
  { name: 'fill-flex', extra: { fill: true }, display: 'flex' },
  { name: 'fill-block', extra: { fill: true }, display: 'block' },
  { name: 'hug-flex', extra: {}, display: 'flex' },
]);

/** The shell the targets are drawn in: a Fabricate window's content, or a companion's own sheet. */
function shell() {
  if (params.get('host') === 'window') {
    const frame = document.createElement('div');
    frame.className = 'application fabricate fabricate-app';
    const content = document.createElement('section');
    content.className = 'window-content';
    frame.append(content);
    document.body.append(frame);
    return content;
  }
  const sheet = document.createElement('div');
  sheet.className = 'companion-sheet';
  Object.assign(sheet.style, { position: 'fixed', inset: '0', overflow: 'auto' });
  document.body.append(sheet);
  return sheet;
}

function build() {
  const cases = document.createElement('div');
  cases.dataset.fixtureCases = '';
  cases.dir = params.get('dir') ?? 'ltr';
  shell().append(cases);
  for (const size of SIZES) {
    for (const width of WIDTHS) {
      for (const { name, extra, display } of FORMS) {
        const target = document.createElement('div');
        target.dataset.case = [name, size, width].join('-');
        Object.assign(target.style, { width: `${width}px`, display });
        cases.append(target);
        let handle = null;
        const props = (value) => ({
          options: OPTIONS,
          value,
          size,
          ariaLabel: 'Haft wood',
          ...extra,
          onChange: (next) => {
            target.dataset.chosen = String(next);
            handle.update(props(next));
          },
        });
        handle = mount('Select', { target, props: props('ash') });
      }
    }
  }
  document.body.dataset.fixtureReady = '';
}

build();
