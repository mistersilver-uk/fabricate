/**
 * The SALVAGE and GATHERING check-modifier AUTHORING path, end to end (issue 1095).
 *
 * The resolver, the normalizers and the picker itself are each covered elsewhere. What was
 * not covered is the path between them — the two HOSTS that decide whether the picker
 * renders at all, what it is handed, and whether what the GM picks ever reaches a save. Every
 * assertion below was written against a mutation that survived the suite:
 *
 *  - the picker rendered under EVERY combination rule, not only `bySubject`;
 *  - it was unreachable under PROGRESSIVE salvage, because its gate was nested inside the DC
 *    override's `simple || routed` one — while `ChecksView` renders the salvage catalogue card
 *    in the progressive branch and `CraftingEngine` builds the context before dispatch, so the
 *    roll honoured a pick no editor could author;
 *  - `checkModifierIds` dropped out of the salvage dirty signature, which is the issue-651 bug
 *    verbatim: the GM picks, nothing is dirty, Save never enables, the edit is discarded;
 *  - the absence-preserving `delete` in `buildUpdates` went, so an inheriting component saved
 *    an authored pick of zero;
 *  - the cap never reached the picker.
 *
 * The gathering host is asserted alongside the salvage one, in one suite, because the two are
 * the two ends of ONE shared component and the defect that started this was precisely that
 * they disagreed.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  COMPONENT_EDIT_VIEW_COMPILED_MODULES,
  COMPONENT_EDIT_VIEW_RAW_MODULES,
} from '../helpers/componentEditViewModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const CATALOGUE = [
  { id: 'med', label: 'Medicine', icon: 'fas fa-staff-snake' },
  { id: 'alch', label: 'Alchemy', icon: 'fas fa-flask' },
];

const salvageHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-salvage-modifier-pick-',
  rawModules: COMPONENT_EDIT_VIEW_RAW_MODULES,
  compiledModules: COMPONENT_EDIT_VIEW_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/manager/ComponentEditView.svelte',
});

const PICKER = '[data-subject-modifier-picker="salvage-check-modifier"]';

function salvageProps(overrides = {}) {
  const { component, ...rest } = overrides;
  return {
    component: {
      id: 'comp-1',
      name: 'Dragon Scale',
      img: 'icons/svg/item-bag.svg',
      salvage: {
        enabled: true,
        resultGroups: [
          { id: 'grp-1', name: 'Scraps', results: [{ id: 'r1', componentId: 'cmp-a', quantity: 1 }] },
        ],
      },
      ...component,
    },
    componentOptions: [{ id: 'cmp-a', name: 'Scrap', img: 'icons/svg/item-bag.svg' }],
    showSalvage: true,
    salvageResolutionMode: 'simple',
    salvageCheckEnabled: true,
    checkModifierOptions: CATALOGUE,
    salvageModifierPolicy: 'bySubject',
    salvageModifierMaxPicks: null,
    salvageModifierDefaultIds: [],
    ...rest,
  };
}

async function mountSalvage(overrides = {}) {
  const dirtyEvents = [];
  const drafts = [];
  const target = await salvageHarness.mount(
    salvageProps({
      onDirtyChange: (dirty) => dirtyEvents.push(dirty),
      onDraftChange: (summary) => drafts.push(summary),
      ...overrides,
    })
  );
  return { target, dirtyEvents, drafts };
}

/** The authoredness toggle inside the salvage picker. */
function authorToggle(target) {
  return target.querySelector(`${PICKER} [data-subject-modifier-authored]`);
}

function setChecked(input, checked) {
  input.checked = checked;
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

/**
 * Let the editor's `$effect`s run.
 *
 * `onDirtyChange` and `onDraftChange` are emitted from effects, not from the change handler,
 * so a test that read them synchronously after a click would see the state BEFORE the edit
 * and pass for the wrong reason on a component that emitted nothing at all.
 */
function flushEffects() {
  return new Promise((done) => setTimeout(done, 0));
}

describe('salvage check-modifier pick — the ComponentEditView host', () => {
  before(() => salvageHarness.setup());
  after(() => salvageHarness.teardown());

  it('renders ONLY under the bySubject rule', async () => {
    for (const policy of ['addAll', 'highest', 'playerPicks']) {
      salvageHarness.remount();
      const { target } = await mountSalvage({ salvageModifierPolicy: policy });
      assert.ok(
        !target.querySelector(PICKER),
        `${policy} does not hand the selection to the component, so offering a picker would ` +
          'be a control the system ignores'
      );
    }
    salvageHarness.remount();
    const { target } = await mountSalvage({ salvageModifierPolicy: 'bySubject' });
    assert.ok(Boolean(target.querySelector(PICKER)), 'bySubject is the one rule that offers it');
  });

  // THE REGRESSION THIS SUITE EXISTS FOR. `progressive` is excluded from the DC-override gate
  // (`simple || routed`), so nesting the picker inside it made the control unreachable in a
  // mode whose ROLL honours the pick — `ChecksView` renders the salvage catalogue card in the
  // progressive branch and `CraftingEngine._runSalvageCraftingCheck` builds the context before
  // dispatch, for every mode.
  it('renders in EVERY salvage resolution mode, including progressive', async () => {
    for (const salvageResolutionMode of ['simple', 'routed', 'progressive']) {
      salvageHarness.remount();
      const { target } = await mountSalvage({ salvageResolutionMode });
      assert.ok(
        Boolean(target.querySelector(PICKER)),
        `${salvageResolutionMode}: the pick reaches the roll, so it must be authorable`
      );
    }
  });

  it('does not render when the system salvage check is off', async () => {
    const { target } = await mountSalvage({ salvageCheckEnabled: false });
    assert.ok(
      !target.querySelector(PICKER),
      'no salvage check rolls, so there is nothing for a modifier to be added to'
    );
    salvageHarness.remount();
  });

  it('offers the SYSTEM catalogue it was handed', async () => {
    const { target } = await mountSalvage({ component: { salvage: { enabled: true, checkModifierIds: ['med'] } } });
    assert.ok(
      Boolean(target.querySelector(`${PICKER} [data-modifier-pill="med"]`)),
      'the authored pick renders as a pill from the catalogue, by id'
    );
    salvageHarness.remount();
  });

  // THE HOST→PICKER HOP FOR `inheritedIds`, which nothing pinned. The root→host hop is pinned by
  // the source contract at the foot of this file; this is the OTHER half, and replacing
  // `inheritedIds={salvageModifierDefaultIds}` with `[]` left the whole suite green.
  //
  // The symptom is not a blank. The picker falls into its EMPTY-SET branch and tells the GM that
  // "the salvage check's default set is empty, so no check modifier applies to this component" —
  // while the roll is in fact applying it. A confident false statement, on the one screen whose
  // job is to say what this component actually rolls.
  it('names the SALVAGE default set in the inherit note it hands the picker', async () => {
    const { target } = await mountSalvage({ salvageModifierDefaultIds: ['med'] });
    const note = target.querySelector(`${PICKER} [data-subject-modifier-inherited]`);
    assert.ok(note, 'a component that authored no pick renders the inherit note');
    assert.match(
      note.textContent,
      /Medicine/,
      'the inherited entry is NAMED from this activity’s own default set'
    );
    assert.ok(
      !/empty/i.test(note.textContent),
      'and the empty-set sentence is not what a non-empty default set renders'
    );
    salvageHarness.remount();
  });

  it('threads the salvage cap, so the picker bounds what the salvage roll bounds', async () => {
    const { target } = await mountSalvage({
      salvageModifierMaxPicks: 1,
      component: { salvage: { enabled: true, checkModifierIds: ['med'] } },
    });
    const hint = target.querySelector(`${PICKER} [data-subject-modifier-cap]`);
    assert.ok(hint, 'a bounded salvage cap reaches the picker');
    assert.equal(hint.dataset.subjectModifierCap, 'reached', 'one pick against a cap of one');
    salvageHarness.remount();
  });

  // ISSUE 651, VERBATIM. A field the salvage signature does not see never marks the editor
  // dirty, so Save never enables and the edit is discarded on exit — with persistence working
  // perfectly the whole time.
  it('marks the editor DIRTY when the GM authors a pick', async () => {
    const { target, dirtyEvents } = await mountSalvage();
    assert.ok(!dirtyEvents.includes(true), 'nothing is dirty before the GM touches anything');
    setChecked(authorToggle(target), true);
    await flushEffects();
    assert.ok(
      dirtyEvents.includes(true),
      'authoring a pick enables Save — without this the GM’s pick is silently thrown away'
    );
    salvageHarness.remount();
  });

  it('emits an authored EMPTY pick as `[]`, and an ABSENT one as a DELETED key', async () => {
    const { target, drafts } = await mountSalvage();
    setChecked(authorToggle(target), true);
    await flushEffects();
    const authored = drafts.at(-1).updates.salvage;
    assert.deepEqual(
      authored.checkModifierIds,
      [],
      'an authored pick of zero is persisted as an empty array — a real pick, not an absence'
    );

    salvageHarness.remount();
    const { drafts: untouched } = await mountSalvage();
    await flushEffects();
    const inheriting = untouched.at(-1).updates.salvage;
    assert.equal(
      Object.hasOwn(inheriting, 'checkModifierIds'),
      false,
      'a component that authored nothing must persist NO key: `_normalizeSalvage` keys ' +
        'authoredness on Array.isArray at entry, so writing `null` would read as inherit ' +
        'by accident and writing `[]` would author a pick of zero the GM never made'
    );
    salvageHarness.remount();
  });

  it('round-trips an authored pick back OUT of the editor to the parent', async () => {
    const { target, drafts } = await mountSalvage({
      component: { salvage: { enabled: true, checkModifierIds: [] } },
    });
    target.querySelector(`${PICKER} [data-modifier-pill-menu-button]`).click();
    await Promise.resolve();
    const option = target.querySelector(`${PICKER} [data-modifier-pill-option="alch"]`);
    assert.ok(Boolean(option), 'the add menu offers the catalogue entry');
    option.click();
    await flushEffects();
    assert.deepEqual(drafts.at(-1).updates.salvage.checkModifierIds, ['alch']);
    salvageHarness.remount();
  });
});

// ── the gathering host ───────────────────────────────────────────────────────

const GATHERING_PATH = 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte';
const GATHERING_PICKER = '[data-subject-modifier-picker="gathering-check-modifier"]';

const gatheringHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-gathering-modifier-pick-',
  rawModules: [
    'src/systems/characterLibraries.js',
    'src/systems/checkModifierResolver.js',
    'src/systems/salvageCheckUsability.js',
    'src/utils/checkModifierPicks.js',
    'src/systems/toolCheckBonus.js',
    'src/utils/craftingCheckExpression.js',
    'src/utils/rollExpressionAverage.js',
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/components/stepperLabels.js',
    'src/ui/svelte/util/dropRateTier.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/gatheringImageDefaults.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/components/ChanceSlider.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/apps/manager/SubjectModifierPicker.svelte',
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    // THE manager's labelled push-button (issue 1118). The stamina Add modifier and both
    // Add drop rule controls render it; an omission HANGS the suite (# cancelled).
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/ModifierPillSelect.svelte',
    GATHERING_PATH,
  ],
  componentPath: GATHERING_PATH,
});

async function mountGathering(overrides = {}) {
  const updates = [];
  const target = await gatheringHarness.mount({
    task: { id: 'task-1', name: 'Forage', dropRows: [] },
    resolutionMode: 'routed',
    checkModifierOptions: CATALOGUE,
    gatheringModifierPolicy: 'bySubject',
    gatheringModifierMaxPicks: null,
    gatheringModifierDefaultIds: [],
    onUpdateTask: (patch) => updates.push(patch),
    ...overrides,
  });
  return { target, updates };
}

describe('gathering check-modifier pick — the GatheringTaskEditView host', () => {
  before(() => gatheringHarness.setup());
  after(() => gatheringHarness.teardown());

  it('renders ONLY under the bySubject rule', async () => {
    for (const policy of ['addAll', 'highest', 'playerPicks']) {
      gatheringHarness.remount();
      const { target } = await mountGathering({ gatheringModifierPolicy: policy });
      assert.ok(!target.querySelector(GATHERING_PICKER), `${policy} offers no task picker`);
    }
    gatheringHarness.remount();
    const { target } = await mountGathering();
    assert.ok(Boolean(target.querySelector(GATHERING_PICKER)));
    gatheringHarness.remount();
  });

  it('patches an authored pick, and an UNDEFINED to restore inheritance', async () => {
    const { target, updates } = await mountGathering();
    const toggle = target.querySelector(`${GATHERING_PICKER} [data-subject-modifier-authored]`);
    setChecked(toggle, true);
    assert.deepEqual(updates.at(-1), { checkModifierIds: [] }, 'ON authors a pick of zero');

    gatheringHarness.remount();
    const { target: authored, updates: second } = await mountGathering({
      task: { id: 'task-1', name: 'Forage', dropRows: [], checkModifierIds: ['med'] },
    });
    setChecked(authored.querySelector(`${GATHERING_PICKER} [data-subject-modifier-authored]`), false);
    assert.deepEqual(
      second.at(-1),
      { checkModifierIds: undefined },
      'OFF patches UNDEFINED, which is what makes the normalizer drop the key and inherit — ' +
        'a `null` or a `[]` here would be a different roll'
    );
    gatheringHarness.remount();
  });

  // The same hop on the OTHER host, and asserted separately rather than inferred from the salvage
  // one: they are two different wirings in two different files, and one component with two
  // disagreeing hosts is the defect this whole suite exists for. Replacing
  // `inheritedIds={gatheringModifierDefaultIds}` with `[]` was likewise green.
  it('names the GATHERING default set in the inherit note it hands the picker', async () => {
    const { target } = await mountGathering({ gatheringModifierDefaultIds: ['med'] });
    const note = target.querySelector(`${GATHERING_PICKER} [data-subject-modifier-inherited]`);
    assert.ok(note, 'a task that authored no pick renders the inherit note');
    assert.match(note.textContent, /Medicine/, 'the inherited entry is NAMED');
    assert.ok(
      !/empty/i.test(note.textContent),
      'telling the GM the set is empty while the roll applies it is worse than saying nothing'
    );
    gatheringHarness.remount();
  });

  it('threads the gathering cap', async () => {
    const { target } = await mountGathering({
      gatheringModifierMaxPicks: 2,
      task: { id: 'task-1', name: 'Forage', dropRows: [], checkModifierIds: ['med'] },
    });
    const hint = target.querySelector(`${GATHERING_PICKER} [data-subject-modifier-cap]`);
    assert.ok(hint, 'a bounded gathering cap reaches the picker');
    assert.equal(hint.dataset.subjectModifierCap, 'available');
    gatheringHarness.remount();
  });
});

// ── the manager root's wiring, pinned at the source ──────────────────────────
//
// The root is not mountable in isolation here, and these four wirings are invisible from
// either host: each one resolves to a legal default (`[]`, `'addAll'`, `null`) that renders a
// picker which simply never offers anything, or offers the WRONG activity's rule. Reading the
// crafting check's rule for the salvage picker is the highest-value one — the two happen to
// agree in the lab fixture, so a frame would not show it either.
describe('CraftingSystemManagerRoot threads each host its OWN activity’s selection', () => {
  const source = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte'),
    'utf8'
  );

  it('hands both hosts the SYSTEM library', () => {
    const wirings = [...source.matchAll(/checkModifierOptions=\{([^}]+)\}/g)].map((m) => m[1]);
    assert.equal(wirings.length, 2, 'one wiring per host — salvage and gathering');
    for (const wiring of wirings) {
      assert.match(
        wiring,
        /selectedSystem\?\.modifiers/,
        'the library is SYSTEM-level since issue 1095 and is named `modifiers` since issue ' +
          '1117; an empty literal here renders a picker with nothing in it'
      );
    }
  });

  it('reads each activity’s OWN rule, cap and default set', () => {
    for (const [prefix, key] of [
      ['salvage', 'salvageCraftingCheck'],
      ['gathering', 'gatheringCraftingCheck'],
    ]) {
      for (const [prop, field] of [
        ['ModifierPolicy', 'defaultModifierPolicy'],
        ['ModifierMaxPicks', 'maxModifierPicks'],
        ['ModifierDefaultIds', 'defaultModifierIds'],
      ]) {
        const match = source.match(
          new RegExp(String.raw`${prefix}${prop}=\{[\s\S]{0,120}?\?\.(\w+)\?\.(\w+)`)
        );
        assert.ok(match, `${prefix}${prop} is wired`);
        assert.equal(
          match[1],
          key,
          `${prefix}${prop} must read ${key}, never another activity's check — the catalogue ` +
            'is shared but the SELECTION is not'
        );
        assert.equal(match[2], field, `${prefix}${prop} reads ${field}`);
      }
    }
  });
});
