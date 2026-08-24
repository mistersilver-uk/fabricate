/**
 * The Component Studio's COMPLICATIONS authoring section, mounted (issue 1286).
 *
 * It pins the decisions that cost a review round each, because every one of them is
 * invisible in a screenshot and cheap to undo:
 *
 * - the section's own VISIBILITY GATE (no progressive activity, no section);
 * - the sub-line, which must say a complication fires when the component is PRODUCED as a
 *   progressive stage, must disclose that a component being salvaged or spent is not
 *   covered (#1287), and must NOT mention player visibility of world data;
 * - the `n/a` header pill being MUTED rather than the shipped `is-disabled` tone, which is
 *   joined to the warning family and would paint "Salvage · n/a" as a hazard;
 * - the TYPED body slot — an authoring row renders the generated trigger sentence, never an
 *   authored description — and its `title`, without which a longer localized form is
 *   invisible past the ellipsis;
 * - the comparator vocabulary being the SIX numeric operators, filtered off the shared
 *   prerequisite table;
 * - the disclosure being a real `<button>` that is not nested inside another one;
 * - the injected `random` mint, so no `Math.random()` literal enters new code (S2245).
 *
 * The section is a CONTROLLED component: it never mutates the array it is handed, it emits
 * a whole new one, and the draft lives in `ComponentEditView`. So most assertions here read
 * what `onChange` was called with rather than what the DOM did next.
 */

import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  COMPONENT_EDIT_VIEW_COMPILED_MODULES,
  COMPONENT_EDIT_VIEW_RAW_MODULES,
} from '../helpers/componentEditViewModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const sectionPath = 'src/ui/svelte/apps/manager/component/ComponentComplicationsSection.svelte';
const sectionSource = readFileSync(resolve(repoRoot, sectionPath), 'utf8');
const summaryRowSource = readFileSync(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte'),
  'utf8'
);
const effectRowSource = readFileSync(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/ComplicationEffectRow.svelte'),
  'utf8'
);

/**
 * The declaration body of one CSS rule in a component's scoped `<style>`.
 *
 * A component's own style block is the ONLY place some of these rulings are stated —
 * spacing that no mounted assertion can read (the harness mounts markup, not a stylesheet)
 * and that the visual-parity harness does not record either, because it measures no
 * `margin` property. `manager-layout.test.js` reads `Chip.svelte`'s block the same way and
 * for the same reason.
 */
function blockIn(source, selector) {
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `expected a \`${selector}\` rule`);
  const end = source.indexOf('}', start);
  return source.slice(start, end);
}

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-complications-section-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/utils/componentComplications.js',
    'src/utils/complicationSummary.js',
    'src/utils/macroReference.js',
    'src/systems/characterPrerequisites.js',
    // The ONE derivation of a `<Stepper>`'s three accessible names from its field label
    // (issue 1050). The roll condition's comparand reaches it (issue 1286).
    'src/ui/svelte/components/stepperLabels.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/apps/manager/ItemDropZone.svelte',
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    'src/ui/svelte/apps/manager/ComplicationEffectRow.svelte',
    'src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte',
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/components/RowDisclosure.svelte',
    // The roll condition's comparand is the shared signed-integer stepper (issue 1286).
    // Import-free leaf, so it needs no `rawModules` entry — but omit it HERE and the suite
    // does not fail, it HANGS and is reported as `# cancelled`.
    'src/ui/svelte/components/Stepper.svelte',
    sectionPath,
  ],
  componentPath: sectionPath,
});

function flushRender() {
  return new Promise((done) => setTimeout(done, 0));
}

const ALL_PROGRESSIVE = Object.freeze({ crafting: true, salvage: true, gathering: true });

/** A normalized complication, as `authoredComplications` would emit it. */
function complication(overrides = {}) {
  return {
    id: 'cx-1',
    name: 'Slag inclusion',
    description: 'The bar looks sound and is not.',
    severity: 'major',
    visibility: 'gmOnly',
    activities: { crafting: true, salvage: false, gathering: false },
    match: 'any',
    when: { stageAwarded: false, stagePartial: false, stageMissed: true, checkTrigger: null },
    rollCondition: { enabled: false, expr: '1d20', cmp: 'eq', value: '1' },
    effectRoll: { enabled: false, expr: '1d6', label: '' },
    ...overrides,
  };
}

/** Mount with the progressive gate open and a recorder on `onChange`. */
async function mountSection(props = {}) {
  const emitted = [];
  const target = await harness.mount({
    activityProgressive: ALL_PROGRESSIVE,
    onChange: (next) => emitted.push(next),
    ...props,
  });
  return { target, emitted };
}

/** Open the one authoring row's detail through the disclosure control. */
async function openFirstRow(target) {
  const disclosure = target.querySelector('[data-complication-disclosure]');
  assert.ok(Boolean(disclosure), 'the row carries a disclosure control');
  disclosure.click();
  await flushRender();
  return disclosure;
}

describe('1286 ComponentComplicationsSection (mounted)', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => harness.teardown());

  beforeEach(() => harness.remount());

  it('renders NOTHING when the system resolves no activity progressively', async () => {
    const target = await harness.mount({
      activityProgressive: { crafting: false, salvage: false, gathering: false },
      complications: [complication()],
    });
    assert.ok(
      !target.querySelector('[data-complications-section]'),
      'a complication has no moment to fire in a system with no progressive resolution'
    );
  });

  it('renders the section once ANY activity is progressive', async () => {
    const { target } = await mountSection({
      activityProgressive: { crafting: false, salvage: true, gathering: false },
    });
    const section = target.querySelector('[data-complications-section]');
    assert.ok(Boolean(section), 'one progressive activity is enough');
    assert.equal(
      section.getAttribute('data-component-edit-section'),
      'complications',
      'the editor section hook the capture walk and the mounted suites address it by'
    );
  });

  it('states that a complication fires on a PRODUCED stage, discloses #1287, and says nothing about player visibility of world data', async () => {
    const { target } = await mountSection();
    const hint = target.querySelector('[data-complications-section] .manager-muted').textContent;
    assert.match(hint, /produced/i, 'the shipped model fires on production, not consumption');
    assert.match(
      hint,
      /itself salvaged or spent/i,
      'the deferred source-component case (#1287) is disclosed rather than left implied'
    );
    assert.doesNotMatch(
      hint,
      /world|setting|determined player|read/i,
      'gmOnly is a DISCLOSURE guarantee; the confidentiality limit belongs in the spec, not ' +
        'in a line of editor chrome that would read as a warning about this component'
    );
  });

  it('renders the empty state through the shared primitive’s INLINE variant', async () => {
    const { target } = await mountSection({ complications: [] });
    const empty = target.querySelector('[data-complications-empty]');
    assert.ok(Boolean(empty), 'the no-state renders through EmptyState, not a local dashed div');
    assert.ok(
      empty.classList.contains('is-inline'),
      'a one-line prompt above an Add button cannot afford the centred hero panel'
    );
  });

  it('mutes the n/a activity pill instead of routing it through the warning family', async () => {
    const { target } = await mountSection({
      activityProgressive: { crafting: true, salvage: false, gathering: false },
      complications: [complication()],
    });
    const pill = (activity) =>
      target.querySelector(`[data-complications-activity-pill="${activity}"]`);
    assert.match(pill('crafting').textContent, /Crafting · 1/, 'a progressive activity counts');
    assert.match(pill('salvage').textContent, /Salvage · n\/a/, 'a non-progressive one says so');
    assert.ok(
      pill('salvage').classList.contains('is-muted'),
      'is-disabled is joined to the WARNING family and would paint this amber'
    );
    assert.ok(
      !pill('salvage').classList.contains('is-disabled'),
      'so the n/a pill must not carry that tone'
    );
  });

  // ── The header pills, the Applies-to chips, and the open row's edge ──────────────────
  //
  // Every one of these is a two-state signal whose WRONG state is the one that renders on
  // the case the signal exists for, which is exactly the class of defect a screenshot of
  // the happy path cannot show.

  it('suppresses a ZERO on a progressive pill, and keeps the count in its title', async () => {
    const { target } = await mountSection({
      activityProgressive: { crafting: true, salvage: true, gathering: false },
      // Enabled for crafting only, so salvage is progressive AND empty — the case the
      // prototype writes as bare "Salvage", never "Salvage · 0".
      complications: [complication()],
    });
    const pill = (activity) =>
      target.querySelector(`[data-complications-activity-pill="${activity}"]`);
    assert.match(pill('salvage').textContent, /Salvage/, 'the activity is still named');
    assert.doesNotMatch(
      pill('salvage').textContent,
      /·/,
      'a zero earns no counter — the empty state below already says there is nothing here'
    );
    assert.match(pill('crafting').textContent, /Crafting · 1/, 'a real count still shows');
    // The count the label drops on the empty pill is not lost anywhere it matters: the
    // title carries it, and agrees in number.
    assert.match(pill('crafting').getAttribute('title'), /1 complication\b/);
    assert.doesNotMatch(pill('crafting').getAttribute('title'), /1 complications/);
    assert.doesNotMatch(
      pill('salvage').getAttribute('title'),
      /\d/,
      'and an empty progressive activity states no number at all'
    );
  });

  it('dims a NOT-PROGRESSIVE Applies-to chip whether or not the GM has chosen it', async () => {
    // The prototype composes two INDEPENDENT axes on this chip: `background: on ?
    // accent-soft : surface-soft`, and `opacity: prog ? 1 : .6` written OUTSIDE the `on`
    // branch. Collapsed into one ternary the warning inverts — the case worth flagging is
    // an activity the GM HAS selected and the system will not resolve progressively, and a
    // single ternary paints exactly that one at full accent strength while receding the
    // harmless unselected one.
    const { target } = await mountSection({
      activityProgressive: { crafting: true, salvage: false, gathering: false },
      complications: [
        complication({ activities: { crafting: true, salvage: true, gathering: false } }),
      ],
    });
    await openFirstRow(target);
    const chip = (activity) => target.querySelector(`[data-complication-activity="${activity}"]`);

    // CHOSEN and not progressive — "stored, and it will not fire". Both signals, together.
    assert.ok(chip('salvage').classList.contains('is-accent'), 'the GM chose it, so it is on');
    assert.ok(
      chip('salvage').classList.contains('is-not-progressive'),
      'and the system will not resolve it, so it is dimmed — this is the case being warned about'
    );

    // NOT chosen and not progressive — dimmed, but never wearing the chosen tone.
    assert.ok(chip('gathering').classList.contains('is-not-progressive'));
    assert.equal(
      chip('gathering').classList.contains('is-accent'),
      false,
      'an unchosen chip is not painted as a choice'
    );

    // Chosen and progressive — the ordinary on state, with nothing to warn about.
    assert.ok(chip('crafting').classList.contains('is-accent'));
    assert.equal(
      chip('crafting').classList.contains('is-not-progressive'),
      false,
      'a progressive activity is never dimmed'
    );
  });

  it('renders the "not progressive" note as its OWN run, not as more of the chip label', async () => {
    const { target } = await mountSection({
      activityProgressive: { crafting: true, salvage: false, gathering: false },
      complications: [complication()],
    });
    await openFirstRow(target);
    const chip = target.querySelector('[data-complication-activity="salvage"]');
    const note = chip.querySelector('.fab-complication-activity-note');
    assert.ok(Boolean(note), 'the annotation is an element the sheet can type separately');
    assert.match(note.textContent, /not progressive/);
    // Concatenated into the chip's own text node it inherited the chip's 600 weight and
    // full size, so the note read as part of the activity's NAME rather than about it.
    assert.doesNotMatch(
      chip.firstChild?.textContent ?? '',
      /not progressive/,
      'the note is not spliced into the chip label'
    );
    assert.equal(
      target.querySelector(
        '[data-complication-activity="crafting"] .fab-complication-activity-note'
      ),
      null,
      'and a progressive activity carries no note at all'
    );
  });

  it('gives an OPEN row the SEVERITY border, which is not the hover edge', async () => {
    const { target } = await mountSection({ complications: [complication()] });
    const row = target.querySelector('[data-complication="cx-1"]');
    assert.ok(
      row.classList.contains('is-gravity-warning'),
      'a MAJOR complication carries its gravity on the row, which is what the edge keys on'
    );

    // The prototype's rule is `border: open ? sev.border : var(--border)`. Painting the
    // open row `--fab-border-strong` instead is what the hover state already draws, so an
    // expanded row and a merely-hovered collapsed one became indistinguishable at rest.
    for (const [tone, token] of [
      ['info', '--fab-info-border'],
      ['warning', '--fab-warning-border'],
      ['danger', '--fab-danger-border'],
    ]) {
      assert.match(
        blockIn(summaryRowSource, `.fab-complication-row.is-expanded.is-gravity-${tone}`),
        new RegExp(String.raw`border-color:\s*var\(${token}\)`),
        `an expanded ${tone} row takes its own gravity border`
      );
    }
    assert.equal(
      summaryRowSource.includes('.fab-complication-row.is-expanded {'),
      false,
      'and there is no tone-blind expanded rule left to reintroduce the strong edge'
    );
    assert.ok(
      summaryRowSource.includes('.fab-complication-row.is-authoring:not(.is-expanded):hover'),
      'hover is scoped to a COLLAPSED row, so an open one keeps its gravity edge under the pointer'
    );
  });

  it('paints "Tell the player" as a CHOSEN state, not a checked one', async () => {
    // The prototype's ON state here is `border: accent-border; background: accent-soft` —
    // the only row in the section it paints that way. Under the neutral treatment (the
    // strong edge and the raised fill) it was indistinguishable from a ticked condition
    // three rows below, so "the player will be told" stopped reading as a decision the GM
    // made and started reading as one more box in a list.
    const { target } = await mountSection({
      complications: [complication({ visibility: 'visible' })],
    });
    await openFirstRow(target);
    const row = target.querySelector('[data-complication-visibility]');
    assert.ok(row.classList.contains('is-on'), 'the complication is visible, so the row is on');
    assert.ok(row.classList.contains('is-on-accent'), 'and its on state is the ACCENT one');
    assert.equal(
      row.classList.contains('is-on-neutral'),
      false,
      'never the neutral one a checked condition wears'
    );

    // A condition keeps the neutral treatment: five rows in one list want to read as a
    // set, and an accent edge on each would make every one of them look singular.
    const condition = target.querySelector('[data-complication-condition="stageMissed"]');
    assert.ok(condition.classList.contains('is-on-neutral'));
    assert.equal(condition.classList.contains('is-on-accent'), false);
  });

  it('draws an EFFECT row to the effect geometry and a CONDITION row to the condition one', async () => {
    // Two shapes in the prototype, not a rounding difference: a condition is `9px 11px`,
    // radius 8, `flex-start`, transparent until checked; an effect is `11px 12px`, radius
    // 9, `center`, and sits on the raised fill whether it is on or off — because an effect
    // is a standing affordance in the "Then" card while a condition is one item in a
    // checklist. `form` is an explicit prop rather than derived from `control`, because
    // "Tell the player" is a `switch` that is NEITHER shape.
    const { target } = await mountSection({ complications: [complication()] });
    await openFirstRow(target);
    const form = (selector) => {
      const node = target.querySelector(selector);
      assert.ok(Boolean(node), `expected ${selector}`);
      return node.classList.contains('is-form-effect') ? 'effect' : 'condition';
    };
    assert.equal(form('[data-complication-condition="stageMissed"]'), 'condition');
    assert.equal(form('[data-complication-roll-condition]'), 'condition');
    assert.equal(form('[data-complication-effect-roll]'), 'effect');
    assert.equal(form('[data-complication-macro] .fab-complication-effect'), 'effect');

    // The macro row has no on-FLAG at all — it is enabled by whether a macro is LINKED —
    // so it must not wear the enabled edge while still revealing its drop zone.
    const macro = target.querySelector('[data-complication-macro] .fab-complication-effect');
    assert.equal(
      macro.classList.contains('is-on'),
      false,
      'a row with no flag cannot be on, and the prototype gives it the plain border'
    );
    assert.ok(
      macro.querySelector('.fab-complication-effect-reveal'),
      'yet its controls are always reachable, which is what `control="none"` means'
    );
  });

  it('draws "Tell the player" as the prototype’s inline PILL, not as a row', async () => {
    // It shares a line with Name and Severity in the prototype: a fixed 34px control sized
    // to its own content, not a full-width row of its own. Drawn in the `condition` form it
    // took a condition’s padding and stretched across the remainder of the field row, and
    // `align-items: flex-start` on a switch row with NO detail line left the label riding
    // high of the knob and the whole control hanging proud of the 34px inputs beside it.
    // This was the largest single contributor to the region’s parity gap.
    const { target } = await mountSection({
      complications: [complication({ visibility: 'visible' })],
    });
    await openFirstRow(target);
    const pill = target.querySelector('[data-complication-visibility]');
    assert.ok(pill.classList.contains('is-form-pill'), 'the pill is its own geometry');
    assert.equal(
      pill.classList.contains('is-form-condition') || pill.classList.contains('is-form-effect'),
      false,
      'and not either of the two row shapes'
    );

    // The geometry itself: the harness mounts markup rather than a stylesheet, so the block
    // is read the way `manager-layout.test.js` reads `Chip.svelte`'s.
    const block = blockIn(effectRowSource, '.fab-complication-effect.is-form-pill');
    assert.match(block, /height:\s*34px/, 'flush with the inputs it shares a line with');
    assert.match(block, /padding:\s*0 12px/);
    assert.match(block, /border-radius:\s*9px/);
    assert.match(block, /width:\s*max-content/, 'sized to its content, never to the field');
    assert.match(block, /align-items:\s*center/, 'a one-line switch centres against its knob');

    // The head centres too, or the copy still rides high inside a centred pill.
    assert.match(
      effectRowSource,
      /\.fab-complication-effect\.is-form-pill \.fab-complication-effect-head/,
      'the pill takes the centred head, the same one the effect form takes'
    );
  });

  it('draws an EFFECT row’s revealed strip FLUSH, because it has no control column', async () => {
    // The 24px indent aligns a revealed strip with its head's copy, PAST a leading
    // checkbox — and an effect row has no checkbox: its control is the switch on the far
    // side, and the macro row (`control="none"`) has no control at all. So the indent
    // referred to a column that does not exist, and the prototype draws the effect-roll
    // reveal and the macro drop zone flush with the row's own padding.
    assert.match(
      blockIn(
        effectRowSource,
        '.fab-complication-effect.is-form-effect .fab-complication-effect-reveal'
      ),
      /margin-left:\s*0/,
      'the effect form cancels the indent'
    );
    // Non-vacuity: a CONDITION row keeps it, because a condition head really does open with
    // a checkbox and its revealed inputs read as belonging under the label.
    assert.match(
      blockIn(effectRowSource, '.fab-complication-effect-reveal'),
      /margin:\s*10px 0 0 24px/,
      'the base indent survives for the form that has a control column'
    );

    const { target } = await mountSection({
      // The effect roll must be ON for its strip to be revealed at all; the macro row has
      // no flag and reveals unconditionally.
      complications: [complication({ effectRoll: { enabled: true, expr: '1d6', label: '' } })],
    });
    await openFirstRow(target);
    for (const selector of [
      '[data-complication-effect-roll]',
      '[data-complication-macro] .fab-complication-effect',
    ]) {
      const row = target.querySelector(selector);
      assert.ok(row.classList.contains('is-form-effect'), `${selector} is an effect row`);
      assert.ok(
        row.querySelector('.fab-complication-effect-reveal'),
        `${selector} reveals a strip for the rule to apply to`
      );
      assert.equal(
        row.querySelector('input[type="checkbox"]'),
        null,
        'and it has no checkbox, which is why the indent referred to nothing'
      );
    }
  });

  it('lets the panel GRID own the spacing around the Add control', async () => {
    // The section root is `.manager-component-panel`, which is `display: grid` with a 12px
    // gap. A grid gap and an item margin ADD, so a 9px margin on each of these rendered as
    // 12 + 9 + 9 = 30px when populated against 12 + 9 = 21px when empty: one section
    // disagreeing with itself, and both far past the prototype's own 9px. Nothing else
    // catches it — the visual-parity harness records no `margin` property.
    for (const selector of ['.fab-complications-list', '.fab-complications-add']) {
      assert.doesNotMatch(
        blockIn(sectionSource, selector),
        /margin/,
        `${selector} must not add to the panel's grid gap`
      );
    }
  });

  it('renders the generated TRIGGER SENTENCE as the row body, with the full string as its title', async () => {
    const { target } = await mountSection({
      complications: [
        complication({
          when: {
            stageAwarded: false,
            stagePartial: true,
            stageMissed: true,
            checkTrigger: null,
          },
          rollCondition: { enabled: true, expr: '1d20', cmp: 'eq', value: '1' },
          effectRoll: { enabled: true, expr: '2d6', label: 'Shrapnel' },
        }),
      ],
    });
    const body = target.querySelector('.fab-complication-row-body');
    const expected =
      'When the award is missed or the award is only partly covered or 1d20 = 1 · rolls 2d6';
    assert.equal(body.textContent, expected, 'clause order, conjunction, glyph and effect tail');
    assert.equal(
      body.getAttribute('title'),
      expected,
      'the line ellipsises rather than wrapping, so the title is the only way back to the full string'
    );
  });

  it('never shows the row an authored DESCRIPTION in the authoring variant', async () => {
    const { target } = await mountSection({ complications: [complication()] });
    const row = target.querySelector('[data-complication-row]');
    assert.equal(row.getAttribute('data-complication-row'), 'authoring');
    assert.ok(
      !row.textContent.includes('The bar looks sound'),
      'the body slot is TYPED: a GM variant renders the trigger, never the description'
    );
  });

  it('shows the Player pill only for a complication the player is told about', async () => {
    const { target } = await mountSection({ complications: [complication()] });
    assert.ok(
      !target.querySelector('.fab-complication-row-line .manager-chip.is-neutral'),
      'a gmOnly complication carries no Player pill'
    );
    harness.remount();

    const visible = await harness.mount({
      activityProgressive: ALL_PROGRESSIVE,
      complications: [complication({ visibility: 'visible' })],
    });
    const pill = visible.querySelector('.fab-complication-row-line .manager-chip.is-neutral');
    assert.ok(Boolean(pill), 'a visible one does');
    assert.equal(pill.textContent, 'Player');
  });

  it('makes the disclosure a real button that is NOT nested inside another button', async () => {
    const { target } = await mountSection({ complications: [complication()] });
    const disclosure = target.querySelector('[data-complication-disclosure]');
    assert.equal(disclosure.tagName, 'BUTTON', 'RowDisclosure renders a real button');
    assert.ok(
      !disclosure.parentElement.closest('button'),
      'a whole-row button around it would nest buttons — invalid DOM no mounted test notices'
    );
    const remove = target.querySelector('[data-complication-remove]');
    assert.equal(remove.tagName, 'BUTTON', 'and the delete control is its SIBLING, not a child');
    assert.ok(!remove.contains(disclosure) && !disclosure.contains(remove));
  });

  it('offers exactly the six NUMERIC comparators', async () => {
    const { target } = await mountSection({
      // The revealed input strip renders only while the row is ON, which is also what keeps
      // a disabled effect's inputs out of the tab order.
      complications: [
        complication({ rollCondition: { enabled: true, expr: '1d20', cmp: 'eq', value: '1' } }),
      ],
    });
    await openFirstRow(target);
    const select = target.querySelector('[data-complication-roll-condition-cmp]');
    assert.ok(Boolean(select), 'the condition-roll row reveals its comparator');
    assert.deepEqual(
      [...select.options].map((option) => option.value),
      ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
      'a dice total has no boolean or existence reading, and `exists` would always fire'
    );
  });

  /** Open the one row and reveal the dice-condition strip, which renders only while it is ON. */
  async function openRollCondition(value = '1') {
    const { target, emitted } = await mountSection({
      complications: [
        complication({ rollCondition: { enabled: true, expr: '1d20', cmp: 'eq', value } }),
      ],
    });
    await openFirstRow(target);
    return { target, emitted };
  }

  it('draws the comparand as the shared Stepper, still typeable, and commits a STRING', async () => {
    // The primitive's whole point is that its input stays a real field — a click-only stepper
    // is a keyboard regression, and its own header says so. What THIS call site has to get
    // right is the boundary: `Stepper` speaks numbers, the persisted comparand is text (it is
    // `text()`-coerced by `authoredComplications`), so a commit that leaked a number through
    // would change the persisted shape while every visible thing still looked right.
    const { target, emitted } = await openRollCondition();
    const input = target.querySelector('[data-complication-roll-condition-value]');
    assert.ok(Boolean(input), 'the hook rides `inputProps` onto the real input, not the wrapper');
    assert.equal(input.tagName, 'INPUT', 'and it is the typeable control, never the wrapper div');
    assert.equal(input.type, 'number');
    assert.equal(input.step, '1', 'integer steps');
    assert.ok(
      Boolean(target.querySelector('[data-stepper-decrement]')),
      'the −/+ adjuncts are there too — they are adjuncts to the field, not a replacement'
    );

    input.value = '12';
    input.dispatchEvent(new target.ownerDocument.defaultView.Event('input', { bubbles: true }));
    await flushRender();
    assert.equal(emitted.at(-1)[0].rollCondition.value, '12', 'a string, as the normalizer emits');
    assert.equal(typeof emitted.at(-1)[0].rollCondition.value, 'string');
  });

  it('lets the comparand go NEGATIVE, because a modified roll can', async () => {
    // `min`/`max` are left at the primitive's own `null` deliberately. A complication that
    // fires when a heavily penalised total lands at or below `-1` is legitimate authoring, and
    // a `min={0}` here would be a rule this section has no basis to invent — it would also
    // clamp silently rather than refusing, so nothing would say the value had been rewritten.
    const { target, emitted } = await openRollCondition();
    const input = target.querySelector('[data-complication-roll-condition-value]');
    assert.equal(input.min, '', 'no lower bound is declared at all');
    assert.equal(input.max, '', 'nor an upper one');

    input.value = '-1';
    input.dispatchEvent(new target.ownerDocument.defaultView.Event('input', { bubbles: true }));
    await flushRender();
    assert.equal(emitted.at(-1)[0].rollCondition.value, '-1', 'the sign survives the round trip');
  });

  it('keeps the comparator, the expression and the comparand in ONE row element', async () => {
    // The defect was three fields on three lines. `.fab-complication-effect-reveal` is a
    // WRAPPING strip — right for the rows with one or two controls, wrong for a three-part
    // sentence — so the sentence gets its own nowrap row inside it. A mounted test cannot
    // measure the layout, but it CAN pin that the three fields share one parent and that the
    // parent is the rule that says `nowrap`; without that they are back to being three
    // independent flex items in a wrapping strip.
    const { target } = await openRollCondition();
    const row = target.querySelector('.fab-complication-condition-row');
    assert.ok(Boolean(row), 'the sentence has a row of its own');
    for (const hook of [
      '[data-complication-roll-condition-expr]',
      '[data-complication-roll-condition-cmp]',
      '[data-complication-roll-condition-value]',
    ]) {
      assert.ok(row.querySelector(hook), `${hook} is inside it`);
    }
    assert.match(
      blockIn(sectionSource, '.fab-complication-condition-row'),
      /flex-wrap:\s*nowrap/,
      'and the row does not wrap, which is what puts them on one line'
    );
    assert.match(
      blockIn(sectionSource, '.fab-complication-comparand'),
      /--fab-stepper-fill-height:\s*34px/,
      'the Stepper takes the row height from its layout context — 34px, the inputs beside it'
    );
  });

  it('mutes the trigger clause and makes it UNINTERACTABLE when the system names no triggers', async () => {
    // Defect 4. `disabled` is a real attribute rather than `pointer-events: none`, because the
    // latter leaves the control in the tab order and reachable by keyboard — a worse bug than
    // the one being fixed. The muting itself copies the Applies-to chips' not-progressive
    // treatment, which is the panel's existing answer to "visible but unusable".
    const { target } = await mountSection({
      complications: [complication()],
      triggerOptions: [],
    });
    await openFirstRow(target);
    const wrapper = target.querySelector('[data-complication-trigger-clause]');
    assert.ok(wrapper.classList.contains('is-unavailable'), 'the clause reads as unavailable');
    assert.equal(
      target.querySelector('[data-complication-condition="checkTrigger"] input[type="checkbox"]')
        .disabled,
      true,
      'a real `disabled`, so the checkbox leaves the tab order rather than merely ignoring a click'
    );
    assert.ok(
      !target.querySelector('[data-complication-trigger]'),
      'and with the row off there is no empty picker to reach either'
    );
    assert.match(
      target.querySelector('[data-complication-trigger-hint]').textContent,
      /add one under Checks/,
      'the GM is told what to do about it'
    );
    assert.match(
      blockIn(sectionSource, '.fab-complication-trigger.is-unavailable > :global(.fab-complication-effect)'),
      /opacity:\s*0\.6/,
      '`opacity` is the chips’ own device, and the one property that composes with the row’s tone'
    );
  });

  it('leaves an ALREADY-NAMED trigger operable after its vocabulary empties', async () => {
    // The other half of defect 4, and the reason the predicate is not simply
    // `triggerOptions.length === 0`. A complication that already names a trigger carries a
    // persisted value; muting the row would strand it behind a disabled control — the row
    // would read as unavailable while `when.checkTrigger` stayed set, and nothing could clear
    // it. So this case stays live, the picker names the dangling id, and unchecking clears it.
    const { target } = await mountSection({
      complications: [
        complication({
          when: {
            stageAwarded: false,
            stagePartial: false,
            stageMissed: false,
            checkTrigger: 'gone',
          },
        }),
      ],
      triggerOptions: [],
    });
    await openFirstRow(target);
    const wrapper = target.querySelector('[data-complication-trigger-clause]');
    assert.ok(!wrapper.classList.contains('is-unavailable'), 'not muted — it has a value');
    assert.ok(!target.querySelector('[data-complication-trigger-hint]'), 'and no add-one hint');
    const box = target.querySelector(
      '[data-complication-condition="checkTrigger"] input[type="checkbox"]'
    );
    assert.equal(box.checked, true, 'the row shows the persisted value rather than reading unset');
    assert.equal(box.disabled, false, 'and stays operable, so the stale value can be cleared');
    assert.match(
      target.querySelector('[data-complication-trigger]').textContent,
      /Trigger no longer exists/,
      'the dangling id is named rather than silently rewritten'
    );
  });

  it('labels each trigger option by the activity that OWNS it, and keeps an id that no longer resolves', async () => {
    const { target } = await mountSection({
      complications: [
        complication({
          when: {
            stageAwarded: false,
            stagePartial: false,
            stageMissed: false,
            checkTrigger: 'gone',
          },
        }),
      ],
      triggerOptions: [
        { id: 'nat1', label: 'On a natural 1', activity: 'salvage' },
        { id: 'nat1c', label: 'On a natural 1', activity: 'crafting' },
      ],
    });
    await openFirstRow(target);
    const select = target.querySelector('[data-complication-trigger]');
    const labels = [...select.options].map((option) => option.textContent.trim());
    assert.deepEqual(
      labels.slice(0, 2),
      ['On a natural 1 · Salvage', 'On a natural 1 · Crafting'],
      'each check block owns its own id space, so identical labels must be distinguishable'
    );
    assert.ok(
      labels.includes('Trigger no longer exists'),
      'a dangling id is named and KEPT — inert, not silently rewritten to another trigger'
    );
  });

  it('emits a NEW array on every edit and never mutates the one it was given', async () => {
    const authored = [complication()];
    const frozen = JSON.stringify(authored);
    const { target, emitted } = await mountSection({ complications: authored });
    await openFirstRow(target);

    target
      .querySelector('[data-complication-condition="stageAwarded"] input[type="checkbox"]')
      .click();
    assert.equal(emitted.length, 1, 'one emission per edit');
    assert.equal(emitted[0][0].when.stageAwarded, true, 'the clause is set');
    assert.equal(emitted[0][0].when.stageMissed, true, 'and its siblings are untouched');
    assert.notEqual(emitted[0], authored, 'a whole new array');
    assert.equal(JSON.stringify(authored), frozen, 'the input is left exactly as it arrived');
  });

  it('adds a complication whose id comes from the injected mint', async () => {
    const { target, emitted } = await mountSection({
      complications: [],
      random: () => 'minted-id',
      activityProgressive: { crafting: true, salvage: false, gathering: false },
    });
    target.querySelector('[data-complications-add]').click();
    assert.equal(emitted.length, 1);
    const [added] = emitted[0];
    assert.equal(added.id, 'minted-id', 'the host’s mint is used, never `Math.random()`');
    assert.equal(added.severity, 'minor', 'the MODEL’s declared default, not a second one');
    assert.equal(added.visibility, 'gmOnly', 'the safe audience default');
    assert.equal(added.match, 'any');
    assert.deepEqual(
      added.activities,
      { crafting: true, salvage: false, gathering: false },
      'a new complication is enabled exactly where this system can actually fire it'
    );
    assert.equal(added.when.stageMissed, true, 'and starts on the condition a GM usually wants');
    assert.equal(added.when.checkTrigger, null, 'the trigger clause is an ID, never a boolean');
  });

  it('removes the complication the delete control names', async () => {
    const { target, emitted } = await mountSection({
      complications: [complication(), complication({ id: 'cx-2', name: 'Second' })],
    });
    target.querySelectorAll('[data-complication-remove]')[0].click();
    assert.deepEqual(
      emitted[0].map((entry) => entry.id),
      ['cx-2'],
      'the other survives'
    );
  });

  it('offers the world’s script macros from the projection the store already publishes', async () => {
    const { target } = await mountSection({
      complications: [complication()],
      macroOptions: [
        { uuid: 'Macro.abc', name: 'Shrapnel Burst' },
        { uuid: 'Macro.def', name: 'Taint the Yield' },
      ],
    });
    await openFirstRow(target);
    const browse = target.querySelector('[data-complication-macro-browse]');
    assert.ok(Boolean(browse), 'the browse control is a separate button beside the drop target');
    browse.click();
    await flushRender();
    const options = [...document.querySelectorAll('[data-popover-option]')].map((node) =>
      node.getAttribute('data-popover-option')
    );
    assert.deepEqual(options, ['Macro.abc', 'Macro.def'], 'straight from `macroOptions`');
  });

  it('names a linked macro from that same projection rather than showing its uuid', async () => {
    const { target } = await mountSection({
      complications: [complication({ macroUuid: 'Macro.abc' })],
      macroOptions: [{ uuid: 'Macro.abc', name: 'Shrapnel Burst' }],
    });
    const body = target.querySelector('.fab-complication-row-body');
    assert.match(body.textContent, /runs Shrapnel Burst$/, 'the effect tail names the macro');
  });

  it('falls back to the uuid for a linked macro the picker list cannot name', async () => {
    // A compendium macro, or one since deleted. `resolveMacroName` fails OPEN with no
    // resolver — outside a live world the uuid IS the best available label, and reporting
    // "not found" there would paint every linked macro as broken in every screenshot. This
    // also exercises the synchronous branch of that resolver inside the effect.
    const { target } = await mountSection({
      complications: [complication({ macroUuid: 'Compendium.pack.Macro.xyz' })],
      macroOptions: [{ uuid: 'Macro.abc', name: 'Shrapnel Burst' }],
    });
    await flushRender();
    const body = target.querySelector('.fab-complication-row-body');
    assert.match(body.textContent, /runs Compendium\.pack\.Macro\.xyz$/, 'the uuid stands in');
  });

  it('carries NO `Math.random()` literal, which is the whole reason `random` is a prop', () => {
    // COMMENTS ARE STRIPPED FIRST, and that is not a loophole: the header docblock QUOTES
    // the sibling idiom in order to say why this section does not use it, and a naive
    // substring match over the whole file would fail on the explanation rather than on the
    // code. What must not appear is the CALL.
    const code = sectionSource
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    assert.ok(
      !code.includes('Math.random'),
      'every sibling section mints ids with that idiom; copying it puts S2245 in new code'
    );
    assert.match(
      code,
      /globalThis\.foundry\?\.utils\?\.randomID/,
      'and the fallback when the host passes no mint is Foundry’s own id generator'
    );
  });

  it('renders the DISPLAY emphasis by default, which is the accordion’s', async () => {
    const { target } = await mountSection({ complications: [complication()] });
    const nameEl = target.querySelector('.fab-complication-row-name');
    assert.ok(nameEl.classList.contains('is-display'), 'the accordion row keeps the serif name');
    assert.equal(nameEl.classList.contains('is-inline'), false);
  });

  it('draws the effect roll’s LABEL in prose, not in the expression’s mono face', async () => {
    // The label borrowed `.fab-complication-expression` for its flex sizing and inherited the
    // mono face with it. A label is the sentence a GM writes for the chat card; only the dice
    // expression beside it is an expression.
    const { target } = await mountSection({
      complications: [complication({ effectRoll: { enabled: true, expr: '1d6', label: '' } })],
    });
    await openFirstRow(target);
    const label = target.querySelector('[data-complication-effect-roll-label]');
    const expression = target.querySelector('[data-complication-effect-roll-expr]');
    assert.equal(
      label.classList.contains('fab-complication-expression'),
      false,
      'the label does not wear the expression class'
    );
    assert.ok(
      expression.classList.contains('fab-complication-expression'),
      'the expression beside it still does — which is what keeps this from being vacuous'
    );

    assert.doesNotMatch(
      blockIn(sectionSource, '.fab-complication-effect-label'),
      /font-family/,
      'the label names no face and inherits the host sans'
    );
    assert.match(
      blockIn(sectionSource, '.fab-complication-expression'),
      /font-family:\s*var\(--fab-font-mono\)/,
      'and the expression keeps mono'
    );
  });
});

/**
 * The HOST half (issue 1286). The section is a controlled component, so the half that
 * decides whether a GM's work survives lives in `ComponentEditView`: the draft, the dirty
 * signature and `buildUpdates()`.
 *
 * This is not belt-and-braces. The identical defect has shipped TWICE from that file — an
 * authored field left out of the signature allowlist persisted correctly and could never be
 * SAVED, because nothing was ever dirty and the Save button never enabled (issue 651 for
 * `allowPlayerResultReorder`, issue 676 for `enabled`). A section that emits a perfect array
 * into an editor that drops it on exit is the same bug a third time.
 */
const editorHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-complications-editor-',
  rawModules: COMPONENT_EDIT_VIEW_RAW_MODULES,
  compiledModules: COMPONENT_EDIT_VIEW_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/manager/ComponentEditView.svelte',
});

/** Mount the editor with a recorder on the two callbacks the manager root wires. */
async function mountEditor(props = {}) {
  const dirtyEvents = [];
  const drafts = [];
  const target = await editorHarness.mount({
    component: { id: 'steel', name: 'Steel ingot', ...(props.component || {}) },
    salvageResolutionMode: 'progressive',
    random: () => 'minted-id',
    onDirtyChange: (dirty) => dirtyEvents.push(dirty),
    onDraftChange: (draft) => drafts.push(draft),
    ...props,
  });
  return { target, dirtyEvents, drafts };
}

describe('1286 ComponentEditView — the complications draft survives Save', () => {
  before(async () => {
    await editorHarness.setup();
  });

  after(() => editorHarness.teardown());

  beforeEach(() => editorHarness.remount());

  it('lights the section up from the salvage axis this view already knows', async () => {
    const { target } = await mountEditor();
    assert.ok(
      Boolean(target.querySelector('[data-component-edit-section="complications"]')),
      'a progressive-salvage system needs no extra host wiring to reach the section'
    );
    editorHarness.remount();

    const simple = await editorHarness.mount({
      component: { id: 'steel' },
      salvageResolutionMode: 'simple',
    });
    assert.ok(
      !simple.querySelector('[data-component-edit-section="complications"]'),
      'and a system with no progressive activity at all renders no section'
    );
  });

  it('marks the editor DIRTY when a complication is added, and carries it in updates', async () => {
    const { target, dirtyEvents, drafts } = await mountEditor();
    assert.ok(!dirtyEvents.includes(true), 'not dirty before any edit');

    target.querySelector('[data-complications-add]').click();
    await flushRender();

    assert.equal(dirtyEvents.at(-1), true, 'which is what enables Save');
    const updates = drafts.at(-1).updates;
    assert.equal(updates.complications.length, 1, 'the draft rides the editor’s updates');
    assert.equal(updates.complications[0].id, 'minted-id');
    assert.equal(
      drafts.at(-1).complicationCount,
      1,
      'and the draft summary counts them, as it does groups and essences'
    );
  });

  it('keeps complications OUT of updates.salvage — they are a top-level sibling', async () => {
    const { target, drafts } = await mountEditor({
      showSalvage: true,
      component: { id: 'steel', salvage: { enabled: true, resultGroups: [] } },
    });
    target.querySelector('[data-complications-add]').click();
    await flushRender();

    const updates = drafts.at(-1).updates;
    assert.ok(Array.isArray(updates.complications), 'top level');
    assert.ok(
      !Object.hasOwn(updates.salvage, 'complications'),
      'a cross-activity concern inside the salvage sub-record would be spec-invalid the ' +
        'moment the system turns salvage off'
    );
  });

  it('emits an EMPTY array when the last complication is deleted, which is how the key is removed', async () => {
    const { target, drafts } = await mountEditor({
      component: {
        id: 'steel',
        complications: [complication()],
      },
    });
    target.querySelector('[data-complication-remove]').click();
    await flushRender();

    assert.deepEqual(
      drafts.at(-1).updates.complications,
      [],
      'an authored [] normalizes to ABSENT, so omitting the field would make the deletion ' +
        'unsaveable — the issue-651 shape of defect'
    );
  });

  it('returns to CLEAN when an edit is undone, so the exit guard does not nag over a no-op', async () => {
    const { target, dirtyEvents } = await mountEditor();
    target.querySelector('[data-complications-add]').click();
    await flushRender();
    assert.equal(dirtyEvents.at(-1), true);

    target.querySelector('[data-complication-remove]').click();
    await flushRender();
    assert.equal(
      dirtyEvents.at(-1),
      false,
      'the baseline is the cloned persisted list, so add-then-remove re-equals it'
    );
  });
});

/*
 * THE SHARED ROW MUST NOT HARD-CODE ONE TYPE TREATMENT, and the effect roll's LABEL is not
 * an expression. Both are the same failure seen twice: a declaration that reads as belonging
 * to the element it is on, while the element is shared with a context that wants the other
 * value.
 *
 * `ComplicationSummaryRow` serves SIX call sites. The prototypes draw its name two ways —
 * the Component Studio's accordion in the serif display face at 12.5px, and both GM
 * read-only strips in the host sans, smaller — so the row carried one of the two and the
 * other two screens drifted from a single root cause. The fix is a prop, not a call-site
 * override: an override would put the treatment in the consumer's stylesheet, where the next
 * consumer cannot find it and the primitive still claims to own it.
 *
 * The `fontFamily` axis is why these are pinned in SOURCE: the harness mounts markup, not a
 * stylesheet, and a face is exactly what happy-dom cannot compute. The part a DOM CAN answer
 * — which class each context renders, and which class the label does not wear — is asserted
 * mounted, in the suite above that owns the harness.
 */
describe('1286 the complication row exposes its name treatment, and prose is not mono', () => {
  const componentEditViewSource = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/ComponentEditView.svelte'),
    'utf8'
  );
  const recipeResultRowSource = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/recipe/RecipeResultItemRow.svelte'),
    'utf8'
  );

  it('states no face and no size on the shared name, only on its two emphases', () => {
    const base = blockIn(summaryRowSource, '.fab-complication-row-name');
    assert.doesNotMatch(
      base,
      /font-family|font-size/,
      'the base rule carries the ink, the weight and the leading — never one context’s face'
    );

    const display = blockIn(summaryRowSource, '.fab-complication-row-name.is-display');
    assert.match(display, /font-family:\s*var\(--fab-font-serif\)/);
    assert.match(display, /font-size:\s*12\.5px/);

    const inline = blockIn(summaryRowSource, '.fab-complication-row-name.is-inline');
    assert.match(inline, /font-size:\s*11\.5px/);
    assert.doesNotMatch(
      inline,
      /font-family/,
      'a strip name takes the HOST face, which is inherited rather than named: this ' +
        'repository ships serif and mono tokens and no sans one'
    );
  });

  it('has both GM read-only strips ASK for the inline treatment', () => {
    // Read at the call sites, because "the prop exists" and "the drift is fixed" are two
    // different claims and only the second one is the finding. A prop nothing passes leaves
    // both strips exactly as they were.
    for (const [name, source] of [
      ['the Component Studio salvage strip', componentEditViewSource],
      ['the Recipe Studio stage strip', recipeResultRowSource],
    ]) {
      assert.match(
        source,
        /<ComplicationSummaryRow\s+variant="readonly-gm"\s+nameEmphasis="inline"/,
        `${name} passes the inline emphasis`
      );
    }

    // Non-vacuity: the ACCORDION deliberately passes nothing and takes the default, so the
    // scan above cannot be passing because every call site spells the prop.
    assert.doesNotMatch(
      sectionSource,
      /nameEmphasis/,
      'the authoring section relies on the default, which is the treatment it already had'
    );
  });
});
