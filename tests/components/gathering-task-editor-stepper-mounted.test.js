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
import { stepNativeNumberInput } from '../helpers/numericKeyboardStep.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-gathering-task-stepper-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
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
    'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte',
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
    assert.equal(stepNativeNumberInput(dc, 'up'), '15', 'ArrowUp steps the displayed value');
    assert.equal(lastWrite(updates, (patch) => patch.dcOverride), 15, 'and commits it');
    await sync();
    assert.equal(stepNativeNumberInput(dc, 'down'), '14', 'ArrowDown steps it back');
    assert.equal(lastWrite(updates, (patch) => patch.dcOverride), 14, 'and commits that too');
  });
});
