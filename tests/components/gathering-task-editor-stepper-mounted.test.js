/**
 * The gathering task editor's seven migrated numeric fields, MOUNTED (issue 1050).
 *
 * This is the behavioural half that `stepper-call-site-contract.test.js` cannot state. That suite
 * proves each call site passes `allowUnset` if and only if its field genuinely persists absence;
 * this one drives the real component and watches what its update function actually receives — the
 * other end of the chain, where a handler that coerced `null` into a number would break the
 * guarantee without touching a single prop.
 *
 * Seven of the fifteen fields in D1a's two tables live here, including three of the four
 * genuine-absence ones outside the manager root, which is why this is the editor that earns a
 * mount rather than one of the nineteen.
 *
 * It is also the Phase 3 entry for the keyboard non-regression check: `Stepper` owns no keydown
 * handler, so Up/Down are native `<input type="number">` behaviour and the only thing that keeps
 * them working is that the element stays a number input on a live commit path. See
 * `tests/helpers/numericKeyboardStep.js` for why that is driven by `stepUp()` plus an `input`
 * event rather than by a synthesised `keydown`.
 */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { stepMigratedNumberField, stepNativeNumberInput } from '../helpers/numericKeyboardStep.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const EDITOR_PATH = 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-gathering-task-stepper-',
  rawModules: [
    // The SHARED subject check-modifier picker's resolver (issue 1095): it asks what an
    // ABSENT `maxModifierPicks` means rather than coercing it. These four close its graph.
    'src/systems/characterLibraries.js',
    'src/systems/checkModifierResolver.js',
    'src/systems/salvageCheckUsability.js',
    'src/utils/checkModifierPicks.js',
    'src/systems/toolCheckBonus.js',
    'src/utils/craftingCheckExpression.js',
    'src/utils/rollExpressionAverage.js',
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/components/stepperLabels.js',
    'src/ui/svelte/util/dropRateTier.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/gatheringImageDefaults.js',
  ],
  // A component missing here does not fail this suite — it HANGS it, reported as `# cancelled`.
  compiledModules: [
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/components/ChanceSlider.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    // The SHARED subject check-modifier picker (issue 1095) and the two primitives it
    // renders. Omitting a `.svelte` the tree reaches HANGS the suite (# cancelled).
    'src/ui/svelte/apps/manager/SubjectModifierPicker.svelte',
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    // THE manager's labelled push-button (issue 1118). The stamina Add modifier and both
    // Add drop rule controls render it; an omission HANGS the suite (# cancelled).
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/ModifierPillSelect.svelte',
    EDITOR_PATH,
  ],
  componentPath: EDITOR_PATH,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

/**
 * A task with every migrated field populated: both economy cards on, a stamina modifier with both
 * bounds set, a node pool, and an over-time chance respawn (the one branch that renders the
 * chance field).
 */
function taskFixture() {
  return {
    id: 'task-1',
    name: 'Forage',
    dropRows: [],
    staminaCost: 3,
    staminaCostModifiers: [{ id: 'mod-row-1', modifierId: 'mod-a', operator: '+', min: 2, max: 9 }],
    dcOverride: 14,
    nodes: {
      enabled: true,
      max: 4,
      current: 4,
      respawn: {
        policy: 'overTime',
        intervalUnit: 'hours',
        intervalAmount: 6,
        gainMode: 'chance',
        chance: 0.25,
      },
    },
  };
}

/** Mount the editor and return its recorded `onUpdateTask` payloads plus a field lookup. */
async function mountEditor() {
  const updates = [];
  let task = taskFixture();
  const root = await harness.mount({
    task,
    staminaEnabled: true,
    nodesEnabled: true,
    // `routed`, because the DC override card renders only under a routed gathering check
    // (`dcOverrideEnabled`) — under `d100` the field this suite's headline case drives does not
    // exist at all.
    resolutionMode: 'routed',
    characterModifierLibrary: [{ id: 'mod-a', label: 'Herbalism' }],
    onUpdateTask: (patch) => {
      updates.push(patch);
      task = { ...task, ...patch };
    },
  });
  return {
    root,
    updates,
    /**
     * Feed the recorded patches back in, the way the real host does.
     *
     * Not optional bookkeeping: `commit()`'s dedupe guard compares against the value the component
     * currently holds, so a second edit back to the ORIGINAL value is correctly a no-op while the
     * component still believes nothing changed. A test that never re-props would read that
     * correct no-op as a broken commit path.
     */
    sync: () => harness.setProps({ task }),
    /** The real `<input>` behind a Stepper, located by its test hook or its accessible name. */
    field: (selector) => {
      const input = root.querySelector(selector);
      assert.ok(Boolean(input), `expected a mounted field matching ${selector}`);
      assert.equal(input.tagName, 'INPUT', `${selector} must resolve to the real <input>`);
      return input;
    },
  };
}

/** Clear a field the way a user does, firing the real `input` event the commit path listens on. */
function clear(input) {
  input.value = '';
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
}

/** The value the last recorded patch wrote at `path`, or `undefined` when no patch touched it. */
function lastWrite(updates, read) {
  for (let index = updates.length - 1; index >= 0; index -= 1) {
    const value = read(updates[index]);
    if (value !== undefined) return value;
  }
  return undefined;
}

// The genuine-absence fields, and the write each one has to produce when cleared. Driven as a
// table for the same reason the source contract is: the assertions are identical and only the
// field and its expected write differ.
const CLEARS_TO_ABSENCE = [
  {
    id: 'dcOverride',
    selector: '[data-gathering-task-dc-override]',
    read: (patch) => patch.dcOverride,
    expected: null,
  },
  {
    id: 'nodes.max',
    selector: '[data-gathering-task-node-count]',
    // Clearing the pool nulls the whole `nodes` object, which is what
    // `normalizeNodeConfig(null)` short-circuits on.
    read: (patch) => patch.nodes,
    expected: null,
  },
  {
    id: 'stamina modifier min',
    selector: 'input[aria-label="Minimum"]',
    read: (patch) => patch.staminaCostModifiers?.[0]?.min,
    expected: null,
  },
  {
    id: 'stamina modifier max',
    selector: 'input[aria-label="Maximum"]',
    read: (patch) => patch.staminaCostModifiers?.[0]?.max,
    expected: null,
  },
];

// The cosmetic-zero fields. The invariant is deliberately NOT "clearing persists 0":
// `allowUnset={false}` cannot do that — `onInput` returns early on `''` and `onBlur` re-asserts
// the prior value — so the testable statement is that the update function never RECEIVES `null`,
// paired with a live-value check proving the field still commits at all.
const NEVER_RECEIVES_NULL = [
  {
    id: 'staminaCost',
    selector: '[data-gathering-task-stamina-cost]',
    read: (patch) => patch.staminaCost,
  },
  {
    id: 'respawn.intervalAmount',
    selector: '[data-gathering-task-node-interval]',
    read: (patch) => patch.nodes?.respawn?.intervalAmount,
  },
  {
    id: 'respawn.chance',
    selector: '[data-gathering-task-node-chance]',
    read: (patch) => patch.nodes?.respawn?.chance,
  },
];

describe('Gathering task editor steppers (issue 1050)', () => {
  // ── Two adds on one screen, two roles, and both were wrong (issue 1118) ──────────────
  //
  // Audit rows 34 and 35. The gathering task editor renders two ADD verbs, and the sweep found
  // them spelt as one bare `manager-button` each:
  //
  //  - Add modifier appends to the stamina modifier list directly above it, which is `dashed`:
  //    a dashed outline reads as the empty slot the next row will fill. It takes NO `fullWidth`
  //    — that is the delta's per-row ruling, and it is about the container: the list is a
  //    column of grid rows, and a full-width dashed control under them reads as a fourth row
  //    rather than as the thing that adds one. Its scoped `justify-self: start` went with the
  //    conversion rather than being fought for; `justify-self` is a grid property and the
  //    button's parent is a column flex container, so it had never done anything.
  //  - Add drop rule is the drops section's CREATE action in toolbar chrome, which is
  //    `primary`. The proof it was a mistake rather than a choice is on the SAME screen: the
  //    identical verb in the drops empty state calls the same `onAddDrop` with the same label
  //    and already shipped `is-primary`. Two spellings of one verb on one screen.
  //
  // Each is addressed by its own hook, and the two are asserted against EACH OTHER: moving
  // either role onto the other control reds this, where "the editor contains a dashed button"
  // and "the editor contains a primary button" would both still pass.
  it('paints Add modifier as a dashed append and Add drop rule as the toolbar primary', async () => {
    const { root } = await mountEditor();

    const addModifier = root.querySelector('[data-gathering-add-stamina-modifier]');
    assert.ok(Boolean(addModifier), 'the stamina card renders its Add modifier control');
    assert.ok(
      addModifier.classList.contains('fab-manager-button'),
      `Add modifier renders through the ManagerButton primitive, got ${addModifier.className}`
    );
    assert.ok(
      addModifier.classList.contains('is-dashed'),
      `Add modifier takes the dashed append role, got ${addModifier.className}`
    );
    assert.ok(
      !addModifier.classList.contains('is-full-width'),
      `and is deliberately NOT full width, got ${addModifier.className}`
    );

    const addDrop = root.querySelector('[data-gathering-add-drop="toolbar"]');
    assert.ok(Boolean(addDrop), 'the drops toolbar renders its Add drop rule control');
    assert.ok(
      addDrop.classList.contains('fab-manager-button'),
      `Add drop rule renders through the ManagerButton primitive, got ${addDrop.className}`
    );
    assert.ok(
      addDrop.classList.contains('is-primary'),
      `Add drop rule takes the primary role, got ${addDrop.className}`
    );
    assert.ok(
      !addDrop.classList.contains('is-dashed'),
      `and not the append role that belongs to the control above, got ${addDrop.className}`
    );
    assert.ok(
      !addModifier.classList.contains('is-primary'),
      `nor Add modifier the toolbar create role, got ${addModifier.className}`
    );
  });

  it('renders every migrated field as a real number input inside a Stepper', async () => {
    // Fail closed: if a selector stopped resolving, every table-driven assertion below would
    // silently assert nothing, and `field()` throwing here says so in one place.
    const { field } = await mountEditor();
    for (const { selector } of [...CLEARS_TO_ABSENCE, ...NEVER_RECEIVES_NULL]) {
      assert.equal(field(selector).type, 'number', `${selector} is still a number input`);
      assert.ok(
        Boolean(field(selector).closest('.fab-stepper')),
        `${selector} sits inside the shared Stepper rather than standing bare`
      );
    }
  });

  it('persists absence when a genuine-absence field is cleared', async () => {
    for (const testCase of CLEARS_TO_ABSENCE) {
      const { field, updates } = await mountEditor();
      clear(field(testCase.selector));
      assert.equal(
        lastWrite(updates, testCase.read),
        testCase.expected,
        `${testCase.id}: clearing it must persist absence, not the 0 that Number(null) coerces to`
      );
      harness.remount();
    }
  });

  it('never hands a cosmetic-zero field null, and still commits a real edit', async () => {
    for (const testCase of NEVER_RECEIVES_NULL) {
      const { field, updates } = await mountEditor();
      const input = field(testCase.selector);
      clear(input);
      assert.ok(
        !updates.some((patch) => testCase.read(patch) === null),
        `${testCase.id}: 0 is its real persisted value, so null must never reach its update function`
      );
      // The other half: a field that committed nothing at all would pass the assertion above
      // vacuously.
      const stepped = Number(stepNativeNumberInput(input, 'up'));
      assert.ok(Number.isFinite(stepped), `${testCase.id}: the field still steps`);
      assert.notEqual(
        lastWrite(updates, testCase.read),
        undefined,
        `${testCase.id}: and the step reaches the update function`
      );
    }
  });

  it('still steps from the keyboard, which is native number-input behaviour', async () => {
    // Phase 3's keyboard non-regression check. `Stepper` has no keydown handler of its own, so
    // this is what proves the migration did not quietly trade the arrows for a `type="text"` box:
    // `stepUp()` throws on a non-steppable input, and the recorded commit proves the `input` event
    // the browser fires afterwards still reaches `onInput` -> `commit` -> the call site.
    const { field, updates, sync } = await mountEditor();
    const dc = field('[data-gathering-task-dc-override]');
    assert.equal(
      stepMigratedNumberField(dc, 'up', 'the DC override'),
      '15',
      'ArrowUp steps the displayed value'
    );
    assert.equal(lastWrite(updates, (patch) => patch.dcOverride), 15, 'and commits it');
    await sync();
    assert.equal(stepNativeNumberInput(dc, 'down'), '14', 'ArrowDown steps it back');
    assert.equal(lastWrite(updates, (patch) => patch.dcOverride), 14, 'and commits that too');
  });

  it('lets the respawn unit select size to its content, on specificity not source order', () => {
    // The interval row is `display: flex` with two `width: 100%` children — the filled stepper
    // and the unit `<select>`, which takes its width from the blanket
    // `.fabricate-manager .manager-field select` rule. They split the track 50/50, leaving the
    // typeable half at ~22-42px: under half of what an unfilled stepper offers, and not enough
    // for "1440". The remedy pins the SIBLING, so the stepper keeps `fill` and takes the rest.
    //
    // The attribute qualifier in that rule is what makes it work, and it is easy to delete as
    // redundant because `select` alone reads like it says the same thing. It does not. Svelte 5
    // emits its scoping class as `:where(.svelte-hash)` on every compound after the first, and
    // `:where()` contributes ZERO specificity — so the unqualified form compiles to (0,2,1),
    // exactly TIES the blanket rule, and resolves on the load order of two separately delivered
    // stylesheets. Asserted on the compiled CSS rather than the source, because the source is
    // not where the tie happens.
    const compiled = scopedComponentCss(resolve(repoRoot, EDITOR_PATH)).css;
    const rule = /\.manager-task-node-interval-row[^{]*select[^{]*\{[^}]*\}/.exec(
      compiled.replace(/\/\*[\s\S]*?\*\//g, '')
    );
    assert.ok(Boolean(rule), 'the interval-row select rule survives compilation');
    const selector = rule[0].split('{')[0];
    // `:where()` is free, so it is excluded from the count on purpose.
    const classColumn = selector.replace(/:where\([^)]*\)/g, '').match(/\.[\w-]+|\[[^\]]+\]/g);
    assert.ok(
      classColumn.length > 2,
      `${selector.trim()} must out-specify \`.fabricate-manager .manager-field select\` (0,2,1), `
        + `but its class column is ${classColumn.length}`
    );
    assert.match(rule[0], /width: auto/, 'and it is the width that is being released');
  });
});
