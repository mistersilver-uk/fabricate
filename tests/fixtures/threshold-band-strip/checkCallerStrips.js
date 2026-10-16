/**
 * The check editors' strip, frozen (issue 2431, risk R7): each of the four configurations the two
 * check callers pass, with the props of that day only, and the strip's normalized markup. A change
 * to the strip that alters any of these is a change to the check editors.
 */
import { byCodePoint } from '../../helpers/codePointOrder.js';

const RAMP = ['danger', 'warning', 'success', 'info', 'accent'];
const tone = (position) => ({
  color: `color-mix(in oklab, var(--fab-${RAMP[position]}) 26%, var(--fab-bg-0))`,
  ink: `var(--fab-${RAMP[position]}-text)`,
});
const between = (band, next) => `Threshold between ${band?.name || ''} and ${next?.name || ''}`;
const ignore = () => {};
/** The attributes carrying the `$props.id()` prefix. */
const MASKED_IDS = new Set(['id', 'aria-describedby']);

/**
 * The canonical form of a rendered node: comments and whitespace-only text dropped, attributes and
 * class tokens sorted, and the scope hash and `$props.id()` prefix masked, since those vary by build.
 */
export function canonicalStrip(node) {
  if (node.nodeType === 3) return node.textContent.trim() === '' ? '' : node.textContent;
  if (node.nodeType !== 1) return '';
  const value = (attribute) =>
    attribute.name === 'class'
      ? attribute.value
          .split(/\s+/)
          .filter(Boolean)
          .map((token) => token.replace(/^svelte-[a-z0-9]+$/, 'svelte-HASH'))
          .sort(byCodePoint)
          .join(' ')
      : MASKED_IDS.has(attribute.name)
        ? attribute.value.replace(/^.*-bands$/, 'ID-bands')
        : attribute.value;
  const attributes = [...node.attributes]
    .map((attribute) => ` ${attribute.name}="${value(attribute)}"`)
    .sort(byCodePoint)
    .join('');
  const children = [...node.childNodes].map(canonicalStrip).join('');
  const tag = node.tagName.toLowerCase();
  return `<${tag}${attributes}>${children}</${tag}>`;
}

export const CHECK_CALLER_STRIPS = [
  {
    name: 'relative',
    props: {
      binding: 'relative',
      readonly: false,
      leadingTick: '',
      previewDc: 12,
      previewLabel: 'Uncommon Craft',
      ariaLabel: 'Outcome bands',
      boundaryLabel: between,
      fallbackNote: 'These tiers leave a gap or overlap.',
      'data-outcome-band-strip': '',
      onChange: ignore,
      bands: [
        { id: 'ruined', name: 'Ruined', from: 2, index: 0, ...tone(0) },
        { id: 'flawed', name: 'Flawed', from: 7, index: 1, ...tone(1) },
        { id: 'success', name: 'Success', from: 12, index: 2, ...tone(2) },
        { id: 'fine', name: 'Fine', from: 17, index: 3, ...tone(3) },
        { id: 'masterwork', name: 'Masterwork', from: 22, index: 4, ...tone(4) },
      ],
    },
    html: '<div class="fab-band-strip svelte-HASH" data-outcome-band-strip=""><div aria-label="Outcome bands — Uncommon Craft" class="fab-band-strip-track svelte-HASH" data-band-strip-track="" role="group"><span class="fab-band-strip-band svelte-HASH" data-band-strip-band="ruined" style="left: 0%; width: 20%; --fab-band-strip-fill: color-mix(in oklab, var(--fab-danger) 26%, var(--fab-bg-0)); --fab-band-strip-ink: var(--fab-danger-text);"><span class="fab-band-strip-band-name svelte-HASH">Ruined</span></span><span class="fab-band-strip-band svelte-HASH" data-band-strip-band="flawed" style="left: 20%; width: 20%; --fab-band-strip-fill: color-mix(in oklab, var(--fab-warning) 26%, var(--fab-bg-0)); --fab-band-strip-ink: var(--fab-warning-text);"><span class="fab-band-strip-band-name svelte-HASH">Flawed</span></span><span class="fab-band-strip-band svelte-HASH" data-band-strip-band="success" style="left: 40%; width: 20%; --fab-band-strip-fill: color-mix(in oklab, var(--fab-success) 26%, var(--fab-bg-0)); --fab-band-strip-ink: var(--fab-success-text);"><span class="fab-band-strip-band-name svelte-HASH">Success</span></span><span class="fab-band-strip-band svelte-HASH" data-band-strip-band="fine" style="left: 60%; width: 20%; --fab-band-strip-fill: color-mix(in oklab, var(--fab-info) 26%, var(--fab-bg-0)); --fab-band-strip-ink: var(--fab-info-text);"><span class="fab-band-strip-band-name svelte-HASH">Fine</span></span><span class="fab-band-strip-band svelte-HASH" data-band-strip-band="masterwork" style="left: 80%; width: 20%; --fab-band-strip-fill: color-mix(in oklab, var(--fab-accent) 26%, var(--fab-bg-0)); --fab-band-strip-ink: var(--fab-accent-text);"><span class="fab-band-strip-band-name svelte-HASH">Masterwork</span></span><span aria-label="Threshold between Ruined and Flawed" aria-orientation="horizontal" aria-valuemax="11" aria-valuemin="3" aria-valuenow="7" aria-valuetext="7 — DC -5 against Uncommon Craft" class="fab-band-strip-handle svelte-HASH" data-band-strip-handle="0" data-keyboard-focus="true" role="slider" style="left: 20%;" tabindex="0"><span aria-hidden="true" class="fab-band-strip-grip svelte-HASH"></span></span><span aria-label="Threshold between Flawed and Success" aria-orientation="horizontal" aria-valuemax="16" aria-valuemin="8" aria-valuenow="12" aria-valuetext="12 — DC +0 against Uncommon Craft" class="fab-band-strip-handle svelte-HASH" data-band-strip-handle="1" data-keyboard-focus="true" role="slider" style="left: 40%;" tabindex="0"><span aria-hidden="true" class="fab-band-strip-grip svelte-HASH"></span></span><span aria-label="Threshold between Success and Fine" aria-orientation="horizontal" aria-valuemax="21" aria-valuemin="13" aria-valuenow="17" aria-valuetext="17 — DC +5 against Uncommon Craft" class="fab-band-strip-handle svelte-HASH" data-band-strip-handle="2" data-keyboard-focus="true" role="slider" style="left: 60%;" tabindex="0"><span aria-hidden="true" class="fab-band-strip-grip svelte-HASH"></span></span><span aria-label="Threshold between Fine and Masterwork" aria-orientation="horizontal" aria-valuemax="26" aria-valuemin="18" aria-valuenow="22" aria-valuetext="22 — DC +10 against Uncommon Craft" class="fab-band-strip-handle svelte-HASH" data-band-strip-handle="3" data-keyboard-focus="true" role="slider" style="left: 80%;" tabindex="0"><span aria-hidden="true" class="fab-band-strip-grip svelte-HASH"></span></span></div><div aria-hidden="true" class="fab-band-strip-ticks svelte-HASH"><span class="fab-band-strip-tick svelte-HASH" style="left: 20%;">7</span><span class="fab-band-strip-tick svelte-HASH" style="left: 40%;">12</span><span class="fab-band-strip-tick svelte-HASH" style="left: 60%;">17</span><span class="fab-band-strip-tick svelte-HASH" style="left: 80%;">22</span></div></div>',
  },
  {
    name: 'fixed',
    props: {
      binding: 'fixed',
      readonly: false,
      leadingTick: '',
      previewDc: 0,
      previewLabel: '',
      ariaLabel: 'Outcome bands',
      boundaryLabel: between,
      fallbackNote: 'These tiers leave a gap or overlap.',
      'data-outcome-band-strip': '',
      onChange: ignore,
      bands: [
        { id: 'slag', name: 'Slag', from: 1, to: 9, index: 0, ...tone(0) },
        { id: 'rough', name: 'Rough', from: 10, to: 17, index: 1, ...tone(2) },
        { id: 'masterwork', name: 'Masterwork', from: 18, to: 26, index: 2, ...tone(4) },
      ],
    },
    html: '<div class="fab-band-strip svelte-HASH" data-outcome-band-strip=""><div aria-label="Outcome bands" class="fab-band-strip-track svelte-HASH" data-band-strip-track="" role="group"><span class="fab-band-strip-band svelte-HASH" data-band-strip-band="slag" style="left: 0%; width: 34.61538461538461%; --fab-band-strip-fill: color-mix(in oklab, var(--fab-danger) 26%, var(--fab-bg-0)); --fab-band-strip-ink: var(--fab-danger-text);"><span class="fab-band-strip-band-name svelte-HASH">Slag</span></span><span class="fab-band-strip-band svelte-HASH" data-band-strip-band="rough" style="left: 34.61538461538461%; width: 30.769230769230774%; --fab-band-strip-fill: color-mix(in oklab, var(--fab-success) 26%, var(--fab-bg-0)); --fab-band-strip-ink: var(--fab-success-text);"><span class="fab-band-strip-band-name svelte-HASH">Rough</span></span><span class="fab-band-strip-band svelte-HASH" data-band-strip-band="masterwork" style="left: 65.38461538461539%; width: 34.61538461538461%; --fab-band-strip-fill: color-mix(in oklab, var(--fab-accent) 26%, var(--fab-bg-0)); --fab-band-strip-ink: var(--fab-accent-text);"><span class="fab-band-strip-band-name svelte-HASH">Masterwork</span></span><span aria-label="Threshold between Slag and Rough" aria-orientation="horizontal" aria-valuemax="17" aria-valuemin="2" aria-valuenow="10" aria-valuetext="10" class="fab-band-strip-handle svelte-HASH" data-band-strip-handle="0" data-keyboard-focus="true" role="slider" style="left: 34.61538461538461%;" tabindex="0"><span aria-hidden="true" class="fab-band-strip-grip svelte-HASH"></span></span><span aria-label="Threshold between Rough and Masterwork" aria-orientation="horizontal" aria-valuemax="26" aria-valuemin="11" aria-valuenow="18" aria-valuetext="18" class="fab-band-strip-handle svelte-HASH" data-band-strip-handle="1" data-keyboard-focus="true" role="slider" style="left: 65.38461538461539%;" tabindex="0"><span aria-hidden="true" class="fab-band-strip-grip svelte-HASH"></span></span></div><div aria-hidden="true" class="fab-band-strip-ticks svelte-HASH"><span class="fab-band-strip-tick svelte-HASH" style="left: 34.61538461538461%;">10</span><span class="fab-band-strip-tick svelte-HASH" style="left: 65.38461538461539%;">18</span></div></div>',
  },
  {
    name: 'simple',
    props: {
      binding: 'simple',
      readonly: false,
      leadingTick: '',
      previewLabel: 'Smith’s Tools',
      min: 1,
      max: 30,
      ariaLabel: 'Two outcomes',
      boundaryLabel: () => 'Difficulty class',
      fallbackNote: 'This check has no reachable range to draw against yet.',
      'data-simple-band-strip': '',
      onChange: ignore,
      bands: [
        { id: 'failure', name: 'Failure', from: 1, index: 0, ...tone(0) },
        { id: 'success', name: 'Success', from: 15, index: 1, ...tone(2) },
      ],
    },
    html: '<div class="fab-band-strip svelte-HASH" data-simple-band-strip=""><div aria-label="Two outcomes — Smith’s Tools" class="fab-band-strip-track svelte-HASH" data-band-strip-track="" role="group"><span class="fab-band-strip-band svelte-HASH" data-band-strip-band="failure" style="left: 0%; width: 48.275862068965516%; --fab-band-strip-fill: color-mix(in oklab, var(--fab-danger) 26%, var(--fab-bg-0)); --fab-band-strip-ink: var(--fab-danger-text);"><span class="fab-band-strip-band-name svelte-HASH">Failure</span></span><span class="fab-band-strip-band svelte-HASH" data-band-strip-band="success" style="left: 48.275862068965516%; width: 51.724137931034484%; --fab-band-strip-fill: color-mix(in oklab, var(--fab-success) 26%, var(--fab-bg-0)); --fab-band-strip-ink: var(--fab-success-text);"><span class="fab-band-strip-band-name svelte-HASH">Success</span></span><span aria-label="Difficulty class" aria-orientation="horizontal" aria-valuemax="29" aria-valuemin="2" aria-valuenow="15" aria-valuetext="15 — Smith’s Tools" class="fab-band-strip-handle svelte-HASH" data-band-strip-handle="0" data-keyboard-focus="true" role="slider" style="left: 48.275862068965516%;" tabindex="0"><span aria-hidden="true" class="fab-band-strip-grip svelte-HASH"></span></span></div><div aria-hidden="true" class="fab-band-strip-ticks svelte-HASH"><span class="fab-band-strip-tick svelte-HASH" style="left: 48.275862068965516%;">15</span></div></div>',
  },
  {
    name: 'readonly with a leading tick',
    props: {
      binding: 'fixed',
      readonly: true,
      leadingTick: '<0',
      previewDc: 0,
      previewLabel: '',
      ariaLabel: 'Outcome bands',
      boundaryLabel: between,
      fallbackNote: 'This check has no reachable range to draw against yet.',
      'data-outcome-band-strip': '',
      onChange: ignore,
      bands: [
        { id: 'botch', name: 'Botch', from: -1, to: -1, index: 0, range: 'below 0', ...tone(0) },
        { id: 'ruined', name: 'Ruined', from: 0, to: 1, index: 1, range: '0–1', ...tone(1) },
        { id: 'success', name: 'Success', from: 2, to: 2, index: 2, range: '2', ...tone(2) },
        {
          id: 'masterwork',
          name: 'Masterwork',
          from: 3,
          to: 5,
          index: 3,
          range: '3–5',
          ...tone(4),
        },
      ],
    },
    html: '<div class="fab-band-strip svelte-HASH" data-outcome-band-strip=""><div aria-describedby="ID-bands" aria-label="Outcome bands" class="fab-band-strip-track svelte-HASH" data-band-strip-track="" role="group"><span class="fab-band-strip-band svelte-HASH" data-band-strip-band="botch" style="left: 0%; width: 14.285714285714285%; --fab-band-strip-fill: color-mix(in oklab, var(--fab-danger) 26%, var(--fab-bg-0)); --fab-band-strip-ink: var(--fab-danger-text);"><span class="fab-band-strip-band-name svelte-HASH">Botch</span></span><span class="fab-band-strip-band svelte-HASH" data-band-strip-band="ruined" style="left: 14.285714285714285%; width: 28.57142857142857%; --fab-band-strip-fill: color-mix(in oklab, var(--fab-warning) 26%, var(--fab-bg-0)); --fab-band-strip-ink: var(--fab-warning-text);"><span class="fab-band-strip-band-name svelte-HASH">Ruined</span></span><span class="fab-band-strip-band svelte-HASH" data-band-strip-band="success" style="left: 42.857142857142854%; width: 14.285714285714285%; --fab-band-strip-fill: color-mix(in oklab, var(--fab-success) 26%, var(--fab-bg-0)); --fab-band-strip-ink: var(--fab-success-text);"><span class="fab-band-strip-band-name svelte-HASH">Success</span></span><span class="fab-band-strip-band svelte-HASH" data-band-strip-band="masterwork" style="left: 57.14285714285714%; width: 42.85714285714286%; --fab-band-strip-fill: color-mix(in oklab, var(--fab-accent) 26%, var(--fab-bg-0)); --fab-band-strip-ink: var(--fab-accent-text);"><span class="fab-band-strip-band-name svelte-HASH">Masterwork</span></span></div><div aria-hidden="true" class="fab-band-strip-ticks svelte-HASH"><span class="fab-band-strip-tick is-leading svelte-HASH" data-band-strip-leading-tick="" style="left: 0%;"><0</span><span class="fab-band-strip-tick svelte-HASH" style="left: 14.285714285714285%;">0</span><span class="fab-band-strip-tick svelte-HASH" style="left: 42.857142857142854%;">2</span><span class="fab-band-strip-tick svelte-HASH" style="left: 57.14285714285714%;">3</span></div><ul class="visually-hidden" data-band-strip-band-list="" id="ID-bands"><li>Botch: below 0</li><li>Ruined: 0–1</li><li>Success: 2</li><li>Masterwork: 3–5</li></ul></div>',
  },
];
