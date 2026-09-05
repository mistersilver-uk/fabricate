import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const segmentedSource = readFileSync(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/SegmentedControl.svelte'),
  'utf8'
);

// Shared mounted-component harness (no inlined mount boilerplate — that trips the
// Sonar duplication gate).
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-segmented-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: ['src/ui/svelte/apps/manager/SegmentedControl.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/SegmentedControl.svelte'
});

const OPTIONS = [
  { value: 'destroyed', labelKey: 'FABRICATE.X.Destroyed', fallback: 'Destroyed', icon: 'fas fa-trash' },
  { value: 'inert', labelKey: 'FABRICATE.X.Inert', fallback: 'Becomes inert' }
];

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('SegmentedControl (mounted)', () => {
  it('renders one radio segment per option with the fallback labels', async () => {
    const root = await harness.mount({ options: OPTIONS, value: 'destroyed', groupName: 'when-spent' });
    const segments = root.querySelectorAll('.manager-segment');
    assert.equal(segments.length, 2);
    const radios = root.querySelectorAll('input[type="radio"]');
    assert.equal(radios.length, 2);
    assert.equal(radios[0].getAttribute('name'), 'when-spent');
    const labels = [...root.querySelectorAll('.manager-segment-label')].map(n => n.textContent);
    assert.deepEqual(labels, ['Destroyed', 'Becomes inert']);
  });

  it('reflects the selected value on the active segment and its radio', async () => {
    const root = await harness.mount({ options: OPTIONS, value: 'inert', groupName: 'g' });
    const active = root.querySelector('.manager-segment.is-active');
    assert.ok(active, 'expected an active segment');
    assert.equal(active.querySelector('.manager-segment-label').textContent, 'Becomes inert');
    const radios = root.querySelectorAll('input[type="radio"]');
    assert.equal(radios[0].checked, false);
    assert.equal(radios[1].checked, true);
  });

  it('calls onChange with the option value when a segment is selected', async () => {
    const calls = [];
    const root = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      onChange: (v) => calls.push(v)
    });
    const inertRadio = root.querySelectorAll('input[type="radio"]')[1];
    inertRadio.checked = true;
    inertRadio.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    assert.deepEqual(calls, ['inert']);
  });

  it('does not fire onChange when the already-selected segment is chosen', async () => {
    const calls = [];
    const root = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      onChange: (v) => calls.push(v)
    });
    const destroyedRadio = root.querySelectorAll('input[type="radio"]')[0];
    destroyedRadio.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    assert.deepEqual(calls, []);
  });

  it('adds the is-fill class to the track only when fill is set', async () => {
    const plain = await harness.mount({ options: OPTIONS, value: 'destroyed', groupName: 'g' });
    assert.equal(
      plain.querySelector('.manager-segmented').classList.contains('is-fill'),
      false,
      'the default track hugs its content (no is-fill)'
    );
    harness.remount();
    const filled = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      fill: true
    });
    assert.ok(
      filled.querySelector('.manager-segmented.is-fill'),
      'fill=true makes the track span its container full-width'
    );
  });

  it('tints only the ACTIVE segment with its per-option variant', async () => {
    const options = [
      { value: 'success', variant: 'success', fallback: 'Automatic success' },
      { value: 'none', variant: 'neutral', fallback: 'No effect' },
      { value: 'failure', variant: 'danger', fallback: 'Automatic failure' }
    ];
    const root = await harness.mount({ options, value: 'failure', groupName: 'g' });
    const seg = (value) =>
      [...root.querySelectorAll('.manager-segment')].find(
        (node) => node.querySelector('input').value === value
      );
    assert.ok(seg('failure').classList.contains('is-danger'), 'the active segment is tinted');
    assert.equal(
      seg('success').classList.contains('is-success'),
      false,
      'an INACTIVE segment carries no variant class — it stays the muted track colour'
    );
    assert.equal(
      seg('none').classList.contains('is-neutral'),
      false,
      'and the neutral variant is likewise inactive-clean'
    );
  });

  // ── The semantic variant ramp (issue 1286) ─────────────────────────────────────
  //
  // `info` and `warning` were added so a three-way minor/major/severe control can name
  // every one of its segments. The CSS declared only `success` and `danger` before, so two
  // of the three severity segments rendered as the plain active tile — the class was there
  // and the colour was not, which is the failure a class-only assertion cannot see.
  it('tints the active segment for EVERY declared variant, and paints each one', async () => {
    const options = [
      { value: 'minor', variant: 'info', fallback: 'Minor' },
      { value: 'major', variant: 'warning', fallback: 'Major' },
      { value: 'severe', variant: 'danger', fallback: 'Severe' }
    ];
    for (const { value, variant } of [
      { value: 'minor', variant: 'info' },
      { value: 'major', variant: 'warning' },
      { value: 'severe', variant: 'danger' }
    ]) {
      const root = await harness.mount({ options, value, groupName: 'severity' });
      const active = root.querySelector('.manager-segment.is-active');
      assert.ok(
        active.classList.contains(`is-${variant}`),
        `the active ${value} segment carries is-${variant}`
      );
      assert.ok(
        segmentedSource.includes(`.manager-segment.is-active.is-${variant}`),
        `and the scoped style block actually PAINTS is-${variant}`
      );
      const others = [...root.querySelectorAll('.manager-segment')].filter(
        (node) => node !== active
      );
      for (const other of others) {
        assert.deepEqual(
          [...other.classList].filter((name) => name.startsWith('is-')),
          [],
          'an inactive segment stays the muted track colour whatever it would become'
        );
      }
      harness.remount();
    }
  });

  it('leaves a variant-free consumer’s markup unchanged', async () => {
    // The three shipped consumers (whenSpent, learning scope, recipe step mode) set no
    // variant, so the conversion must not add a class to their segments.
    const root = await harness.mount({ options: OPTIONS, value: 'destroyed', groupName: 'g' });
    const active = root.querySelector('.manager-segment.is-active');
    // The scoped-style hash class is compiler output, not authored markup.
    const authored = [...active.classList].filter((name) => !name.startsWith('svelte-')).sort();
    assert.deepEqual(authored, ['is-active', 'manager-segment']);
  });

  it('carries `disabled` onto the RADIO, not merely onto a class', async () => {
    const calls = [];
    const options = [
      { value: 'a', fallback: 'A' },
      { value: 'b', fallback: 'B', disabled: true }
    ];
    const root = await harness.mount({
      options,
      value: 'a',
      groupName: 'g',
      optionDataAttr: 'data-seg',
      onChange: (v) => calls.push(v)
    });
    const disabledSegment = root.querySelector('[data-seg="b"]');
    assert.ok(disabledSegment.classList.contains('is-disabled'), 'the segment is marked disabled');
    const radio = disabledSegment.querySelector('input[type="radio"]');
    assert.equal(radio.disabled, true, 'the radio itself is disabled');
    // A dimmed-but-live radio would still fire: `select()` only guards `next !== value`.
    radio.click();
    assert.deepEqual(calls, [], 'a disabled segment cannot change the selection');
    assert.equal(
      root.querySelector('[data-seg="a"] input[type="radio"]').disabled,
      false,
      'its sibling stays interactive'
    );
  });

  // ── The icon-only variant (issue 1036) ──────────────────────────────────────────
  //
  // Opt-in, and the opt-out side is the half worth pinning: the essence library's
  // list/grid toggle is the only consumer that sets it, so the other four must render
  // exactly what they rendered before the flag existed.
  it('adds is-icon-only to the track only when iconOnly is set', async () => {
    const plain = await harness.mount({ options: OPTIONS, value: 'destroyed', groupName: 'g' });
    assert.equal(
      plain.querySelector('.manager-segmented').classList.contains('is-icon-only'),
      false,
      'the default track renders its labels (no is-icon-only)'
    );
    harness.remount();
    const compact = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      iconOnly: true
    });
    assert.ok(
      compact.querySelector('.manager-segmented.is-icon-only'),
      'iconOnly=true compacts the track to glyph tiles'
    );
  });

  // The variant is a pure CSS statement over the SAME DOM. The label span is CLIPPED,
  // never dropped and never `display: none` — the `<label>` IS the radio's accessible
  // name, so removing the text would leave every segment of an icon-only track anonymous
  // to a screen reader. `title` is the pointer half of the same affordance, and it is
  // added ONLY here: a labelled segment whose tooltip repeats its own visible words is
  // noise, and the attribute would be a markup change for the four existing consumers.
  it('keeps the label text as the accessible name and titles the tile, in icon-only only', async () => {
    const compact = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      iconOnly: true
    });
    assert.deepEqual(
      [...compact.querySelectorAll('.manager-segment-label')].map((n) => n.textContent),
      ['Destroyed', 'Becomes inert'],
      'an icon-only segment still carries its words — they are clipped by CSS, not dropped'
    );
    assert.deepEqual(
      [...compact.querySelectorAll('.manager-segment')].map((n) => n.getAttribute('title')),
      ['Destroyed', 'Becomes inert'],
      'and names itself to the pointer'
    );
    harness.remount();

    const plain = await harness.mount({ options: OPTIONS, value: 'destroyed', groupName: 'g' });
    assert.deepEqual(
      [...plain.querySelectorAll('.manager-segment')].map((n) => n.hasAttribute('title')),
      [false, false],
      'a labelled consumer gets no title attribute at all — its markup is untouched'
    );
  });

  // The View Lab's `manager-essences-grid` case steps on `[data-essence-view-option="grid"]`,
  // which is this hook. `view-lab-screenshots.mjs` calls `target.click()`, whose hit-target
  // check requires the element under the click point to BE the target or a DESCENDANT of it —
  // so the hook must stay on the enclosing `<label>` and never move to the radio. A selector
  // that resolves to the 1x1 clipped radio times out for 30s, and one failing case fails the
  // whole capture job and publishes NOTHING, which lets the screenshot gate pass on stale
  // frames. The compaction must not have moved it.
  it('keeps optionDataAttr on the clickable LABEL in the icon-only variant', async () => {
    const root = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      iconOnly: true,
      optionDataAttr: 'data-seg'
    });
    const hook = root.querySelector('[data-seg="inert"]');
    assert.ok(Boolean(hook), 'the option hook must resolve to an element');
    assert.equal(hook.tagName, 'LABEL', 'the hook is the label, never the hidden radio');
    assert.equal(
      hook.querySelector('input[type="radio"]').getAttribute('data-seg'),
      null,
      'and the radio does not also carry it, which would make the selector ambiguous'
    );
    // The tile's visible content is the glyph, so a compacted segment that rendered no
    // icon would be an empty click target.
    assert.ok(
      Boolean(root.querySelector('[data-seg="destroyed"] i.fa-trash')),
      'the glyph is what the tile shows'
    );
  });

  // ── The tag TONE (issue 1373) ───────────────────────────────────────────────────
  //
  // `tone` says what the track is ABOUT and repaints its edge and both segments together;
  // the per-option `variant` tints one ACTIVE segment to say what choosing it means. They
  // are different axes, so the opt-out side is what matters here: nine of the ten consumers
  // pass no tone and must render exactly the markup they rendered before it existed.
  it('adds is-tag to the track only when tone is set, and leaves the segments alone', async () => {
    const plain = await harness.mount({ options: OPTIONS, value: 'destroyed', groupName: 'g' });
    assert.equal(
      plain.querySelector('.manager-segmented').classList.contains('is-tag'),
      false,
      'the default track carries no tone class'
    );
    harness.remount();
    const toned = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      tone: 'tag'
    });
    assert.ok(
      toned.querySelector('.manager-segmented.is-tag'),
      'tone="tag" marks the TRACK'
    );
    // The tone is a track statement, so no segment gains a class: painting the chosen one
    // through `is-tag` on the SEGMENT would collide with the per-option variant ramp, which
    // is the axis this prop deliberately is not.
    assert.equal(
      [...toned.querySelectorAll('.manager-segment')].filter((segment) =>
        segment.classList.contains('is-tag')
      ).length,
      0,
      'no segment carries the tone class'
    );
    // An unknown tone renders the default track rather than an is-<anything> class, so a
    // typo degrades to the shipped rendering instead of emitting a selector nothing styles.
    harness.remount();
    const unknown = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      tone: 'wat'
    });
    assert.equal(
      unknown.querySelector('.manager-segmented').className.includes('is-wat'),
      false,
      'an unknown tone emits no class of its own'
    );
  });

  // ── THE PILL SHAPE AND THE SOFT-ACCENT TONE (issue 1371) ───────────────────────────────
  //
  // The reference draws its entry filter (`proto:5457`, `All / With rules / Without`) as a RUN
  // OF SEPARATE PILLS rather than as tiles inside a frame: no track fill, no track edge, radius
  // 999 per segment, every segment at 600, the idle one a real tile on `--fab-bg-1` behind a
  // `--fab-border` hairline and the chosen one soft accent. Two props, on the two axes this
  // component already separates — `shape` for the construction, `tone` for the paint — because
  // the shipped `tone="accent"` is the OTHER accent control (`proto:1558`, the cohort switch,
  // solid fill on a bare idle segment) and both have to keep rendering.
  //
  // A parity lane proved this is unreachable from `styles/fabricate.css` at any specificity:
  // Foundry imports the module sheet at `layer(modules)` and this component's block is injected
  // unlayered, so the primitive's own declaration wins however the sheet's selector is written.
  it('adds is-pill to the track only when shape is set, and rounds only the segments', async () => {
    const plain = await harness.mount({ options: OPTIONS, value: 'destroyed', groupName: 'g' });
    assert.equal(
      plain.querySelector('.manager-segmented').classList.contains('is-pill'),
      false,
      'the default track carries no shape class'
    );
    harness.remount();

    const pill = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      shape: 'pill'
    });
    assert.ok(pill.querySelector('.manager-segmented.is-pill'), 'shape="pill" marks the TRACK');
    // The shape is a track statement for the same reason the tone is: painting it onto the
    // chosen segment would collide with the per-option variant ramp, which is the axis neither
    // of these props is.
    assert.equal(
      [...pill.querySelectorAll('.manager-segment')].filter((segment) =>
        segment.classList.contains('is-pill')
      ).length,
      0,
      'no segment carries the shape class'
    );
    harness.remount();

    const unknown = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      shape: 'wat'
    });
    assert.equal(
      unknown.querySelector('.manager-segmented').className.includes('is-wat'),
      false,
      'an unknown shape degrades to the shipped track rather than emitting a dead selector'
    );
  });

  it('adds is-accent-soft WITHOUT disturbing the shipped solid is-accent tone', async () => {
    const soft = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      tone: 'accent-soft'
    });
    const softTrack = soft.querySelector('.manager-segmented');
    assert.ok(softTrack.classList.contains('is-accent-soft'), 'tone="accent-soft" marks the TRACK');
    // `is-accent` is a PREFIX of `is-accent-soft`, and a class list is matched by whole token, so
    // the shipped cohort switch's rules must not reach this track. Asserted rather than assumed:
    // a `className.includes(...)` check anywhere would read the two as the same tone.
    assert.equal(
      softTrack.classList.contains('is-accent'),
      false,
      'the soft tone is NOT the solid accent tone, however the class strings read'
    );
    harness.remount();

    const solid = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      tone: 'accent'
    });
    const solidTrack = solid.querySelector('.manager-segmented');
    assert.ok(solidTrack.classList.contains('is-accent'), 'the shipped solid accent still paints');
    assert.equal(
      solidTrack.classList.contains('is-accent-soft'),
      false,
      'and it did not acquire the new one'
    );
  });

  it('composes the pill run with the compact density and the badge slot', async () => {
    // The consuming lane passes all three: `density="compact"` is the rung the reference's
    // `padding: 5px 11px` / 10.5px segment already lands on, `shape="pill"` is the corner and
    // the frameless track, `tone="accent-soft"` is the paint, and the tally rides the mono
    // `badge` slot the reference draws it in.
    const root = await harness.mount({
      options: [
        { value: 'all', fallback: 'All', badge: 6 },
        { value: 'in', fallback: 'With rules', badge: 2 }
      ],
      value: 'all',
      groupName: 'g',
      density: 'compact',
      shape: 'pill',
      tone: 'accent-soft'
    });
    const track = root.querySelector('.manager-segmented');
    for (const expected of ['is-compact', 'is-pill', 'is-accent-soft']) {
      assert.ok(track.classList.contains(expected), `the track carries ${expected}`);
    }
    assert.equal(
      root.querySelectorAll('.manager-segment-count.is-badge').length,
      2,
      'both segments draw their mono tally'
    );
  });

  it('paints every declared shape and tone in the scoped style block', () => {
    // The mirror guard, in both directions. A value accepted by the class builder but never
    // given a rule renders as the shipped track while the class assertions above still pass:
    // the class is there, the treatment is not, and nothing says so. Derived from the
    // component's own class expression rather than restated, so a fourth value added to one
    // and not the other fails here instead of shipping unpinned.
    const trackClasses = segmentedSource.slice(
      segmentedSource.indexOf('class={`manager-segmented'),
      segmentedSource.indexOf('role="radiogroup"')
    );
    const declared = [...trackClasses.matchAll(/' (is-[a-z-]+)'/g)].map(([, name]) => name);
    assert.ok(declared.length >= 8, `the track builder still names its variants (${declared})`);
    const styleBlock = segmentedSource.slice(segmentedSource.indexOf('<style>'));
    // Whole-token match, not `includes`. `is-accent` is a PREFIX of `is-accent-soft`, so a
    // substring lookup would report the solid cohort tone as painted by the soft one's rules
    // and this guard would answer yes to a question nothing had asked.
    assert.deepEqual(
      declared.filter(
        (name) => !new RegExp(`\\.manager-segmented\\.${name}(?![\\w-])`).test(styleBlock)
      ),
      [],
      'every track variant the builder can emit declares a rule of its own'
    );
  });

  it('states the pill run and the soft accent in tokens, at the reference values', () => {
    // `proto:5457` exactly: radius 999 per segment, `font: 600`, the idle segment on
    // `background: var(--bg1); border: 1px solid var(--border); color: var(--muted)` and the
    // chosen one on `var(--accent-soft)` / `var(--accent-border)` / `var(--accent)`. The three
    // accent tokens are BYTE-EQUAL to the reference's here — `--fab-accent-soft` is
    // `rgb(232 198 167 / 16%)` and the reference draws `rgba(232,198,167,.16)` — so this is a
    // token statement rather than an approximation, and no colour literal enters `src/ui/**`.
    //
    // Each assertion is anchored to ITS OWN rule head with a `[^}]*` body, so a declaration
    // that drifted into a neighbouring rule cannot satisfy the one that lost it.
    const styleBlock = segmentedSource.slice(segmentedSource.indexOf('<style>'));
    const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rule = (head, declaration) =>
      new RegExp(`${escape(head)}\\s*\\{[^}]*${escape(declaration)}`);

    assert.match(
      styleBlock,
      rule('.manager-segmented.is-pill', 'padding: 0'),
      'the pill run has no track frame to pad'
    );
    assert.match(
      styleBlock,
      rule('.manager-segmented.is-pill .manager-segment', 'border-radius: 999px'),
      'every segment is a stadium'
    );
    assert.match(
      styleBlock,
      rule('.manager-segmented.is-pill .manager-segment:not(.is-active)', 'font-weight: 600'),
      'and the idle segment carries the reference weight rather than the track densities\u2019 500'
    );

    assert.match(
      styleBlock,
      rule(
        '.manager-segmented.is-accent-soft .manager-segment.is-active',
        'background: var(--fab-accent-soft)'
      )
    );
    assert.match(
      styleBlock,
      rule(
        '.manager-segmented.is-accent-soft .manager-segment.is-active',
        'border-color: var(--fab-accent-border)'
      )
    );
    assert.match(
      styleBlock,
      rule('.manager-segmented.is-accent-soft .manager-segment.is-active', 'color: var(--fab-accent)')
    );
    assert.match(
      styleBlock,
      rule(
        '.manager-segmented.is-accent-soft .manager-segment:not(.is-active)',
        'background: var(--fab-bg-1)'
      )
    );
    assert.match(
      styleBlock,
      rule(
        '.manager-segmented.is-accent-soft .manager-segment:not(.is-active)',
        'border-color: var(--fab-border)'
      )
    );
    assert.match(
      styleBlock,
      rule(
        '.manager-segmented.is-accent-soft .manager-segment:not(.is-active)',
        'color: var(--fab-text-muted)'
      )
    );
  });

  it('stamps dataAttr and optionDataAttr hooks', async () => {
    const root = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      dataAttr: 'data-when-spent-control',
      optionDataAttr: 'data-when-spent-option'
    });
    assert.ok(root.querySelector('[data-when-spent-control]'));
    assert.ok(root.querySelector('[data-when-spent-option="inert"]'));
  });
});
