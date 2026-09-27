/** The SALVAGE and GATHERING check-modifier AUTHORING path, end to end (issue 1095). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import {
  COMPONENT_EDIT_VIEW_COMPILED_MODULES,
  COMPONENT_EDIT_VIEW_RAW_MODULES,
} from '../helpers/componentEditViewModules.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const CATALOGUE = [
  { id: 'med', label: 'Medicine', icon: 'fas fa-staff-snake' },
  { id: 'alch', label: 'Alchemy', icon: 'fas fa-flask' },
];

const MARKED_IDS = CATALOGUE.map((entry) => entry.id);

const salvageHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-salvage-modifier-pick-',
  rawModules: COMPONENT_EDIT_VIEW_RAW_MODULES,
  compiledModules: [...COMPONENT_EDIT_VIEW_COMPILED_MODULES],
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
    // The activity MARKS the whole catalogue.
    salvageModifierDefaultIds: MARKED_IDS,
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

/** Let the editor's `$effect`s run. */
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

  // THE HOST→PICKER HOP FOR `inheritedIds`.
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

  // THE SAME HOST→PICKER HOP, now carrying a SECOND job (issue 1608). `inheritedIds` was
  // only ever read for the inherit note above, so a host that wired it correctly for that
  // reading proved nothing about the new one — and the bound is the half a GM cannot see
  // going wrong, because a picker offering too much looks exactly like a picker offering
  // the right amount until you know what the check marked.
  it('bounds the salvage pick by the SALVAGE mark, keeping an un-marked pick on the record (issue 1608)', async () => {
    const { target } = await mountSalvage({
      salvageModifierDefaultIds: ['med'],
      // `alch` was picked while it was marked; the salvage check has since un-marked it.
      component: { salvage: { enabled: true, checkModifierIds: ['med', 'alch'] } },
    });
    assert.ok(
      target.querySelector(`${PICKER} [data-modifier-pill="med"]`),
      'the marked pick reaches the row'
    );
    assert.ok(
      !target.querySelector(`${PICKER} [data-modifier-pill="alch"]`),
      'the un-marked one draws no chip — the mark reached the picker as a BOUND, not just ' +
        'as the inherit note’s name list'
    );
    assert.equal(
      target
        .querySelector(`${PICKER} [data-subject-modifier-suppressed]`)
        ?.getAttribute('data-subject-modifier-suppressed'),
      '1',
      'and the note counts it, so the chip that vanished is accounted for on screen'
    );
    salvageHarness.remount();

    // THE NEGATIVE CONTROL: marking both must restore the second chip and silence the
    // note, or the assertions above would pass against a picker that rendered no chips.
    const { target: wide } = await mountSalvage({
      salvageModifierDefaultIds: MARKED_IDS,
      component: { salvage: { enabled: true, checkModifierIds: ['med', 'alch'] } },
    });
    assert.ok(
      wide.querySelector(`${PICKER} [data-modifier-pill="alch"]`),
      'marking alch puts its chip back'
    );
    assert.ok(
      !wide.querySelector(`${PICKER} [data-subject-modifier-suppressed]`),
      'and nothing is suppressed, so no note renders'
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
    // The option is in the PORTALED panel.
    const option = target.querySelector('[data-modifier-pill-option="alch"]');
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
    // Issue 1504: the raw closure the shared `<Select>` reaches through `SearchablePopover`.
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    'src/systems/characterLibraries.js',
    'src/systems/checkModifierResolver.js',
    'src/systems/checkModifierRouter.js',
    'src/systems/salvageCheckUsability.js',
    'src/utils/checkModifierPicks.js',
    'src/systems/toolCheckBonus.js',
    'src/utils/craftingCheckExpression.js',
    'src/utils/rollExpressionAverage.js',
    'src/utils/rollFormulaRollability.js',
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/components/stepperLabels.js',
    'src/ui/svelte/util/dropRateTier.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    // The availability menus and `ModifierPillSelect`'s add menu are `SearchablePopover`
    // now (issue 1458), which portals its panel and lays it out against the trigger.
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/util/overlayBounds.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/pickerOptionModel.js',
    'src/ui/svelte/util/overlayHost.js',
    'src/gatheringImageDefaults.js',
    'src/ui/model/complicationSummary.js',
    'src/systems/characterPrerequisites.js',
    // The gathering host's seven converted option vocabularies (issue 1510).
    'src/ui/svelte/apps/manager/gatheringTaskSelectOptions.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/components/ChanceSlider.svelte',
    'src/ui/svelte/components/ManagerSearchField.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    // Issue 1504: the shared `<Select>`'s whole compiled closure.
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/components/RadioCardGroup.svelte',
    'src/ui/svelte/components/RowDisclosure.svelte',
    'src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeResultsSection.svelte',
    // The result group card renders the product's ONE ordered list (issue 1512) and the stage's
    // complication band through it.
    'src/ui/svelte/components/SortableList.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeStageComplicationBand.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeResultGroupCard.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeResultItemRow.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeRoutingAssignment.svelte',
    'src/ui/svelte/apps/manager/SubjectModifierPicker.svelte',
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/ModifierPillSelect.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
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
    // The activity MARKS the whole catalogue.
    gatheringModifierDefaultIds: MARKED_IDS,
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

  // The same hop on the OTHER host.
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
describe('CraftingSystemManagerRoot threads each host its OWN activity’s selection', () => {
  const source = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte'),
    'utf8'
  );

  // STILL THE WHOLE LIBRARY, deliberately.
  it('hands both hosts the WORLD library, unnarrowed', () => {
    const wirings = [...source.matchAll(/checkModifierOptions=\{([^}]+)\}/g)].map((m) => m[1]);
    assert.equal(wirings.length, 2, 'one wiring per host — salvage and gathering');
    for (const wiring of wirings) {
      assert.match(
        wiring,
        /selectedSystemModifiers/,
        'the library is ONE list since issue 1117 and WORLD scope since issue 1308, read off the ' +
          'view state rather than the selection; an empty literal here renders a picker with ' +
          'nothing in it'
      );
      assert.ok(
        !/defaultModifierIds|ModifierDefaultIds/.test(wiring),
        'and it is NOT intersected with the mark here — the picker owns that, and a ' +
          'pre-narrowed list would leave the suppressed-picks note with nothing to count'
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
