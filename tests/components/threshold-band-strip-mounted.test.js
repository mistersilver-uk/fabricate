/**
 * `ThresholdBandStrip`, the product's ONE threshold band strip (issue 1096).
 *
 * The strip is a VISUALISATION over state the numeric `Stepper`s in the tier rows still own,
 * so almost everything worth pinning here is about not lying: which authored field each
 * handle writes, what it announces, where it stops, and what it does when the authored set
 * cannot be drawn as one continuous strip at all.
 *
 * Every keyboard assertion below drives the handle the way a GM does — a real `keydown` on
 * the focusable `role="slider"` element — rather than calling an internal. That distinction
 * is the whole point of the WCAG 2.5.8 and keyboard-operability requirements: a strip that
 * only moved under a pointer would satisfy a source assertion and fail every GM who does not
 * use one.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-band-strip-',
  rawModules: [],
  compiledModules: ['src/ui/svelte/components/ThresholdBandStrip.svelte'],
  componentPath: 'src/ui/svelte/components/ThresholdBandStrip.svelte',
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

/** Five relative tiers at −10/−5/0/+5/+10 against DC 12 — the frames' own worked example. */
const RELATIVE_BANDS = [
  { id: 'ruined', name: 'Ruined', from: 2 },
  { id: 'flawed', name: 'Flawed', from: 7 },
  { id: 'success', name: 'Success', from: 12 },
  { id: 'fine', name: 'Fine', from: 17 },
  { id: 'masterwork', name: 'Masterwork', from: 22 },
];

/** Four fixed tiers, Slag 1–9 / Rough 10–17 / Serviceable 18–26 / Masterwork 27–34. */
const FIXED_BANDS = [
  { id: 'slag', name: 'Slag', from: 1, to: 9 },
  { id: 'rough', name: 'Rough', from: 10, to: 17 },
  { id: 'serviceable', name: 'Serviceable', from: 18, to: 26 },
  { id: 'masterwork', name: 'Masterwork', from: 27, to: 34 },
];

const handles = (root) => [...root.querySelectorAll('[data-band-strip-handle]')];

function press(handle, key) {
  handle.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('ThresholdBandStrip: geometry and handles', () => {
  it('renders N bands and N−1 handles, so the outermost authored values carry none', async () => {
    const root = await harness.mount({ bands: RELATIVE_BANDS, previewDc: 12 });
    assert.equal(root.querySelectorAll('[data-band-strip-band]').length, 5);
    assert.equal(handles(root).length, 4, 'five tiers, four boundaries');
    // The frames are explicit about this: five steppers at −10/−5/0/+5/+10 carry only FOUR
    // boundary labels, and Ruined's own DC is not one of them.
    assert.deepEqual(
      handles(root).map((handle) => handle.getAttribute('aria-valuenow')),
      ['7', '12', '17', '22']
    );
  });

  it('gives every handle a real ARIA slider identity and a focusable stop', async () => {
    const root = await harness.mount({
      bands: RELATIVE_BANDS,
      previewDc: 12,
      previewLabel: 'Uncommon Craft',
    });
    for (const handle of handles(root)) {
      assert.equal(handle.getAttribute('role'), 'slider');
      assert.equal(handle.getAttribute('tabindex'), '0', 'reachable by Tab, with no pointer');
      assert.ok(handle.getAttribute('aria-label'), 'the handle names the boundary it moves');
      for (const attribute of ['aria-valuenow', 'aria-valuemin', 'aria-valuemax']) {
        assert.ok(handle.hasAttribute(attribute), `${attribute} is declared`);
      }
    }
  });

  it('names the previewed record in the GROUP label, not only in the announcement', async () => {
    const root = await harness.mount({
      bands: RELATIVE_BANDS,
      previewDc: 12,
      previewLabel: 'Uncommon Craft',
      groupLabel: 'Outcome bands',
    });
    assert.match(
      root.querySelector('[data-band-strip-track]').getAttribute('aria-label'),
      /Outcome bands — Uncommon Craft/
    );
  });
});

describe('ThresholdBandStrip: the two number systems', () => {
  it('announces the ABSOLUTE value, because that is what the visible tick reads', async () => {
    const root = await harness.mount({ bands: RELATIVE_BANDS, previewDc: 12 });
    const ticks = [...root.querySelectorAll('.fab-band-strip-tick')].map((tick) =>
      tick.textContent.trim()
    );
    assert.deepEqual(ticks, ['7', '12', '17', '22']);
    assert.deepEqual(
      handles(root).map((handle) => handle.getAttribute('aria-valuenow')),
      ticks,
      'aria-valuenow carries the number the eye reads, not the offset the stepper shows'
    );
  });

  it('carries BOTH readings in aria-valuetext, because the absolute one is record-relative', async () => {
    // Switching the PREVIEW AGAINST record re-announces every handle with no data change at
    // all, so the announcement has to say what did not change. "17 — DC +5 against Uncommon
    // Craft" is one sentence holding both.
    const root = await harness.mount({
      bands: RELATIVE_BANDS,
      previewDc: 12,
      previewLabel: 'Uncommon Craft',
    });
    const text = handles(root)[2].getAttribute('aria-valuetext');
    assert.match(text, /^17\b/, 'the absolute value leads');
    assert.match(text, /DC \+5/, 'and the offset the tier row shows is stated too');
    assert.match(text, /Uncommon Craft/, 'against the named record');
  });

  it('converts back to an OFFSET on write, so the tier row stays authoritative', async () => {
    const writes = [];
    const root = await harness.mount({
      bands: RELATIVE_BANDS,
      previewDc: 12,
      onChange: (patch) => writes.push(patch),
    });
    press(handles(root)[2], 'ArrowRight');
    assert.deepEqual(writes, [{ binding: 'relative', index: 3, dc: 6 }]);
  });
});

describe('ThresholdBandStrip: the band↔boundary mapping, per binding', () => {
  it('relative handle i writes outcomes[i+1].dc', async () => {
    const writes = [];
    const root = await harness.mount({
      bands: RELATIVE_BANDS,
      previewDc: 12,
      onChange: (patch) => writes.push(patch),
    });
    for (const [handleIndex, expectedIndex] of [
      [0, 1],
      [1, 2],
      [3, 4],
    ]) {
      writes.length = 0;
      press(handles(root)[handleIndex], 'ArrowRight');
      assert.equal(
        writes[0].index,
        expectedIndex,
        `handle ${handleIndex} writes tier ${expectedIndex}`
      );
    }
  });

  it('fixed handle i writes the coupled end/start pair as ONE update', async () => {
    const writes = [];
    const root = await harness.mount({
      binding: 'fixed',
      bands: FIXED_BANDS,
      onChange: (patch) => writes.push(patch),
    });
    press(handles(root)[1], 'ArrowRight');
    // A half-applied move is the failure this shape exists to make unreachable: writing the
    // end without the start opens a one-value gap that `rangeGap` then reports as an error
    // the GM never made.
    assert.equal(writes.length, 1, 'one patch, not two');
    assert.deepEqual(writes[0], {
      binding: 'fixed',
      index: 1,
      end: 18,
      nextIndex: 2,
      start: 19,
    });
  });

  it("the simple binding's single handle writes the check's own DC", async () => {
    const writes = [];
    const root = await harness.mount({
      binding: 'simple',
      bands: [
        { id: 'failure', name: 'Failure', from: 0 },
        { id: 'success', name: 'Success', from: 10 },
      ],
      min: 0,
      max: 20,
      onChange: (patch) => writes.push(patch),
    });
    assert.equal(handles(root).length, 1, 'two bands, one boundary');
    press(handles(root)[0], 'ArrowRight');
    assert.deepEqual(writes, [{ binding: 'simple', dc: 11 }]);
  });

  it('writes through the AUTHORED index when the tier list is authored high-to-low', async () => {
    // A GM who lists Masterwork first has authored a valid descending list, and the shipped
    // lab fixture does exactly that. Drawing by value while writing by drawn POSITION would
    // move the wrong tier — silently, and in the direction that looks like it worked.
    const writes = [];
    const root = await harness.mount({
      bands: [
        { id: 'masterwork', name: 'Masterwork', from: 17, index: 0 },
        { id: 'standard', name: 'Standard', from: 12, index: 1 },
        { id: 'ruined', name: 'Ruined', from: 7, index: 2 },
      ],
      previewDc: 12,
      onChange: (patch) => writes.push(patch),
    });
    assert.deepEqual(
      [...root.querySelectorAll('[data-band-strip-band]')].map((band) =>
        band.getAttribute('data-band-strip-band')
      ),
      ['ruined', 'standard', 'masterwork'],
      'drawn in value order'
    );
    press(handles(root)[1], 'ArrowRight');
    assert.equal(writes[0].index, 0, 'and written to Masterwork, which is authored FIRST');
  });
});

describe('ThresholdBandStrip: bounds and the clamp', () => {
  it('bounds every handle ONE STEP inside its neighbour, and the outermost inside the track', async () => {
    const root = await harness.mount({ bands: RELATIVE_BANDS, previewDc: 12, step: 1 });
    const bounds = handles(root).map((handle) => [
      handle.getAttribute('aria-valuemin'),
      handle.getAttribute('aria-valuemax'),
    ]);
    // Interior handles: the neighbouring boundaries, one step in.
    assert.deepEqual(bounds[1], ['8', '16']);
    assert.deepEqual(bounds[2], ['13', '21']);
    // Outermost: one step inside the TRACK, which in `relative` is the authored range
    // extended one tier interval past the outermost tier (that extension is what makes the
    // last band the same width as its neighbours rather than a sliver).
    //
    // ONE STEP INSIDE, not the raw edge. The first band's lower edge is 2 and its upper edge
    // is this handle: bounding it at 2 let a drag put the two edges on the same value and
    // collapse Ruined to zero width — a named tier reduced to nothing, with its focus ring
    // clipped away by the track's `overflow: hidden`, so the GM could neither see it nor aim
    // at it again. The same argument bounds the last handle one step inside the far edge.
    assert.equal(bounds[0][0], '3', 'one step above the first band’s own lower edge');
    assert.equal(bounds[3][1], '26', 'one step below the far edge of the track');
  });

  it('never lets a drag collapse the first or the last band', async () => {
    // The bound above, driven the way a GM drives it. `Home` on handle 0 goes as low as the
    // strip permits; the emitted offset must still leave Ruined a band.
    const writes = [];
    const root = await harness.mount({
      bands: RELATIVE_BANDS,
      previewDc: 12,
      step: 1,
      onChange: (patch) => writes.push(patch),
    });
    press(handles(root)[0], 'Home');
    assert.deepEqual(writes.at(-1), { binding: 'relative', index: 1, dc: -9 }, 'absolute 3, not 2');
    press(handles(root).at(-1), 'End');
    assert.deepEqual(writes.at(-1), { binding: 'relative', index: 4, dc: 14 }, 'absolute 26, not 27');
  });

  it('takes the fixed domain from the authored span, whose last band ends INCLUSIVELY', async () => {
    const root = await harness.mount({ binding: 'fixed', bands: FIXED_BANDS });
    const first = handles(root)[0];
    const last = handles(root).at(-1);
    assert.equal(first.getAttribute('aria-valuemin'), '2', 'one step above min(start)');
    // The track runs to `max(end) + 1` because a fixed range is INCLUSIVE — band *i* is drawn
    // to where band *i+1* starts, which is `end + 1` — so one step inside it is `max(end)`.
    assert.equal(last.getAttribute('aria-valuemax'), '34', 'max(end)');
  });

  it('draws the LAST fixed band the same width as an equal-sized neighbour', async () => {
    // Slag 1–9 and Rough 10–17 are 9 and 8 wide; Masterwork 27–34 is 8 wide and must render
    // 8 wide. Ending the drawing at the authored `to` made it 7 — one unit narrow on every
    // fixed check, which reads as the top tier being rarer than it is.
    const root = await harness.mount({ binding: 'fixed', bands: FIXED_BANDS });
    const widths = [...root.querySelectorAll('[data-band-strip-band]')].map((band) =>
      Number((band.getAttribute('style').match(/width:\s*([\d.]+)%/) || [])[1])
    );
    const total = 34 + 1 - 1; // trackMax 35 − domain.min 1
    assert.ok(Math.abs(widths[1] - (8 / total) * 100) < 0.01, 'Rough is 8 units wide');
    assert.ok(
      Math.abs(widths[3] - (8 / total) * 100) < 0.01,
      'and so is Masterwork — inclusive ranges meet at end + 1'
    );
  });

  it('reports a describable range for a tier narrower than its own step', async () => {
    // Authored data can put two boundaries closer together than `step`, which inverts the
    // naive bound and announces `aria-valuemin` ABOVE `aria-valuemax` — a range no assistive
    // technology can describe. The honest answer is that this handle has nowhere to go.
    const root = await harness.mount({
      bands: [
        { id: 'a', name: 'A', from: 0 },
        { id: 'b', name: 'B', from: 4 },
        { id: 'c', name: 'C', from: 6 },
        { id: 'd', name: 'D', from: 20 },
      ],
      step: 5,
      previewDc: 0,
    });
    for (const handle of handles(root)) {
      const min = Number(handle.getAttribute('aria-valuemin'));
      const max = Number(handle.getAttribute('aria-valuemax'));
      const now = Number(handle.getAttribute('aria-valuenow'));
      assert.ok(min <= max, `aria-valuemin ${min} must not exceed aria-valuemax ${max}`);
      assert.ok(now >= min && now <= max, `aria-valuenow ${now} must sit inside [${min}, ${max}]`);
    }
  });

  it('round-trips a DESCENDING fixed list through the authored index, not the drawn one', async () => {
    // A GM who lists Masterwork first has authored valid data. The strip DRAWS in value order
    // and WRITES through each band's own authored index, so the coupled fixed pair must name
    // the authored positions — reversed here — rather than the drawn ones.
    const writes = [];
    const descending = [...FIXED_BANDS].reverse().map((band, index) => ({ ...band, index }));
    const root = await harness.mount({
      binding: 'fixed',
      bands: descending,
      step: 1,
      onChange: (patch) => writes.push(patch),
    });
    // Handle 1 sits at the Rough/Serviceable seam: value 18. Drawn positions 1 and 2;
    // authored positions 2 (Serviceable) and 1 (Rough) in the reversed list.
    assert.equal(handles(root)[1].getAttribute('aria-valuenow'), '18');
    press(handles(root)[1], 'ArrowRight');
    assert.deepEqual(writes.at(-1), {
      binding: 'fixed',
      index: 2,
      end: 18,
      nextIndex: 1,
      start: 19,
    });
  });

  it('CLAMPS at a neighbour rather than swapping or reordering', async () => {
    const writes = [];
    const root = await harness.mount({
      bands: RELATIVE_BANDS,
      previewDc: 12,
      onChange: (patch) => writes.push(patch),
    });
    // `End` drives the handle as far as it may go; a further press must produce NOTHING.
    press(handles(root)[1], 'End');
    assert.deepEqual(writes.at(-1), { binding: 'relative', index: 2, dc: 4 }, 'clamped to 16');
    const beforeExtra = writes.length;
    // The mount is uncontrolled here, so `aria-valuenow` has not moved; drive it past the
    // neighbour explicitly and assert the emitted value is the CLAMP, never the request.
    press(handles(root)[1], 'PageUp');
    assert.equal(writes.length, beforeExtra + 1);
    assert.equal(writes.at(-1).dc, 4, 'a page-sized jump lands on the same clamp, not past it');
  });

  it('drives from every required key, so the strip is fully operable with no pointer', async () => {
    const writes = [];
    const root = await harness.mount({
      bands: RELATIVE_BANDS,
      previewDc: 12,
      step: 1,
      pageStep: 3,
      onChange: (patch) => writes.push(patch),
    });
    const handle = handles(root)[1];
    const emitted = (key) => {
      writes.length = 0;
      press(handle, key);
      return writes[0]?.dc;
    };
    assert.equal(emitted('ArrowRight'), 1, 'ArrowRight steps up one');
    assert.equal(emitted('ArrowUp'), 1);
    assert.equal(emitted('ArrowLeft'), -1, 'ArrowLeft steps down one');
    assert.equal(emitted('ArrowDown'), -1);
    assert.equal(emitted('PageUp'), 3, 'PageUp moves a page');
    assert.equal(emitted('PageDown'), -3);
    assert.equal(emitted('Home'), -4, 'Home goes to the lower bound (8 against DC 12)');
    assert.equal(emitted('End'), 4, 'End goes to the upper bound (16 against DC 12)');
    // …and an unrelated key is not swallowed.
    assert.equal(emitted('Enter'), undefined);
  });
});

describe('ThresholdBandStrip: colour, gradients and the fallback', () => {
  it('renders NO gradient anywhere — each band is a solid fill with a hard edge', async () => {
    const root = await harness.mount({
      bands: FIXED_BANDS.map((band) => ({ ...band, color: 'var(--fab-success-soft)' })),
      binding: 'fixed',
    });
    for (const band of root.querySelectorAll('[data-band-strip-band]')) {
      assert.doesNotMatch(band.getAttribute('style') || '', /gradient/i);
    }
    // …and the component's OWN stylesheet declares none either. The mounted half above can
    // only see what lands inline, and happy-dom applies no stylesheet at all, so a gradient
    // moved into the scoped block would satisfy it and paint one in every browser. The
    // exemption `ui-integration/spec.md` grants a full-track semantic scale is deliberately
    // NOT claimed: it requires the gradient to run across the COMPLETE track with the fill
    // kept full-width, which is the opposite of per-band identity.
    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/components/ThresholdBandStrip.svelte'),
      'utf8'
    );
    // The anchor is CHECKED before it is sliced on. `indexOf` answers -1 for a block that has
    // been renamed or removed, `slice(-1)` then returns the last CHARACTER of the file, and
    // the negative assertion below passes over a one-character string — green, having read
    // nothing at all.
    const styleStart = source.indexOf('<style>');
    assert.notEqual(styleStart, -1, 'the component still has a scoped style block to read');
    const styles = source.slice(styleStart);
    assert.ok(styles.length > 500, 'and the slice is the block, not a fragment');
    assert.doesNotMatch(styles, /gradient\(/i, 'the scoped block declares no gradient either');
  });

  it('gives every handle a hit area of at least 24x24 CSS pixels (WCAG 2.5.8)', () => {
    // Asserted against the DECLARATION rather than a measured box, and the limitation is
    // stated rather than hidden: happy-dom performs no layout, so `getBoundingClientRect`
    // returns zeros for every element here and a measured assertion would pass on an empty
    // rule. The measured proof is the rendered frame; this is the guard that the rule the
    // frame depends on is still written down. The ~2px seam between two bands is not a
    // target, which is why the visible grip is deliberately NARROWER than this box.
    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/components/ThresholdBandStrip.svelte'),
      'utf8'
    );
    const handleRule = source.slice(
      source.indexOf('.fab-band-strip-handle {'),
      source.indexOf('.fab-band-strip-handle:focus-visible')
    );
    assert.match(handleRule, /width:\s*24px/);
    assert.match(handleRule, /height:\s*24px/);
  });

  it('applies each band colour inline, as authored data rather than a source literal', async () => {
    const root = await harness.mount({
      binding: 'fixed',
      bands: FIXED_BANDS.map((band, index) => ({
        ...band,
        color: index % 2 === 0 ? 'var(--fab-success-soft)' : 'var(--fab-danger-soft)',
      })),
    });
    // The colour lands as a CUSTOM PROPERTY the scoped rule paints from, not as a bare
    // `background`. That is what gives it a declared fallback (an unset `var()` paints
    // nothing at all), and it is also the only shape happy-dom's `cssText` parser preserves
    // for a `color-mix()` — which the routed editor's tonal ramp derives.
    const painted = [...root.querySelectorAll('[data-band-strip-band]')].map(
      (band) => /--fab-band-strip-fill:\s*([^;]+)/.exec(band.getAttribute('style'))?.[1]
    );
    assert.equal(painted.filter(Boolean).length, 4);
    for (const colour of painted) assert.match(colour, /var\(--fab-/);
    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/components/ThresholdBandStrip.svelte'),
      'utf8'
    );
    assert.match(
      source,
      /background:\s*var\(--fab-band-strip-fill,\s*var\(--fab-[\w-]+\)\);/,
      'and the rule that paints it declares a fallback, so an unset colour is not transparent'
    );
  });

  it('carries each band INK the same way, and omits it rather than inventing one', async () => {
    // The ink travels with the fill because the two are one decision: the name is drawn ON the
    // fill, so only whoever chose the fill can know what stays readable on it. A band that
    // supplies no ink must emit NOTHING, or the scoped rule's `--fab-text` fallback is
    // unreachable and an untinted band's name has no declared colour at all.
    const root = await harness.mount({
      binding: 'fixed',
      bands: FIXED_BANDS.map((band, index) => ({
        ...band,
        color: 'var(--fab-success)',
        ...(index === 0 ? {} : { ink: 'var(--fab-success-text)' }),
      })),
    });
    const inked = [...root.querySelectorAll('[data-band-strip-band]')].map(
      (band) => /--fab-band-strip-ink:\s*([^;]+)/.exec(band.getAttribute('style'))?.[1]
    );
    assert.equal(inked[0], undefined, 'a band with no ink emits no ink property');
    assert.deepEqual(inked.slice(1), [
      'var(--fab-success-text)',
      'var(--fab-success-text)',
      'var(--fab-success-text)',
    ]);
    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/components/ThresholdBandStrip.svelte'),
      'utf8'
    );
    assert.match(
      source,
      /color:\s*var\(--fab-band-strip-ink,\s*var\(--fab-text\)\);/,
      'and the band-name rule reads it with the declared fallback'
    );
  });

  it('falls back to the tier rows with a stated note when the set is GAPPED', async () => {
    const root = await harness.mount({
      binding: 'fixed',
      bands: [
        { id: 'slag', name: 'Slag', from: 1, to: 9 },
        // 10 belongs to nobody: a roll landing there matches no tier at all.
        { id: 'rough', name: 'Rough', from: 11, to: 17 },
      ],
      fallbackNote: 'These tiers leave a gap.',
    });
    assert.ok(root.querySelector('[data-band-strip-fallback]'), 'the note renders');
    assert.ok(!root.querySelector('[data-band-strip-track]'), 'and the strip does not');
    assert.match(root.querySelector('[data-band-strip-fallback]').textContent, /gap/);
  });

  it('falls back on an OVERLAPPING or inverted set too, rather than drawing a clean seam', async () => {
    for (const bands of [
      [
        { id: 'a', name: 'A', from: 1, to: 12 },
        { id: 'b', name: 'B', from: 10, to: 17 },
      ],
      [
        { id: 'a', name: 'A', from: 10 },
        { id: 'b', name: 'B', from: 10 },
      ],
    ]) {
      const root = await harness.mount({ binding: 'fixed', bands, fallbackNote: 'note' });
      assert.ok(
        root.querySelector('[data-band-strip-fallback]'),
        `${JSON.stringify(bands)} must not be drawn as a contiguous strip`
      );
      harness.remount();
    }
  });

  it('falls back below two bands, because one band has no boundary to move', async () => {
    const root = await harness.mount({
      bands: [{ id: 'only', name: 'Only', from: 1 }],
      fallbackNote: 'note',
    });
    assert.ok(root.querySelector('[data-band-strip-fallback]'));
  });
});
