/**
 * The two SYSTEM-scope component screens' world-scope halves, mounted (issue 1371, epic 1357).
 *
 * ## The three states a system-scope screen can be in, and why each needs its own fixture
 *
 * A component this system holds and INHERITS the world category; one it holds and OVERRIDES; and
 * one the world corpus knows and this system has no record for at all. The third is the whole
 * point of the widened membership filter, and it is unreachable from a fixture built out of the
 * system's own component cards — which is the shape every mounted assertion about this screen had
 * before this lane.
 *
 * ## And why the zero point is the criterion rather than the populated case
 *
 * The sibling Tool Rules list records the measured defect: three places asked "is there anything
 * on this screen" and all three answered with the raw prop, so for a system that has adopted
 * nothing the toolbar counted the widened cohort over a body drawing the zero state — and the ONE
 * route in the product to adopt a component into an empty system became unreachable, by the
 * segment AND by the zero state's own button.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  COMPONENT_EDIT_VIEW_COMPILED_MODULES,
  COMPONENT_EDIT_VIEW_RAW_MODULES,
} from '../helpers/componentEditViewModules.js';
import {
  COMPONENT_SYSTEMS,
  componentCorpus,
  recordingComponentActions,
} from '../helpers/componentScopeMountModules.js';
import { projectWorldScopeEntity } from '../../src/ui/svelte/stores/worldScopeProjection.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const editor = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-component-rules-world-',
  rawModules: COMPONENT_EDIT_VIEW_RAW_MODULES,
  compiledModules: [...COMPONENT_EDIT_VIEW_COMPILED_MODULES],
  componentPath: 'src/ui/svelte/apps/manager/ComponentEditView.svelte',
});

async function drain() {
  for (let index = 0; index < 40; index += 1) await Promise.resolve();
}

function scopeFor(overrides) {
  return projectWorldScopeEntity({
    entityType: 'component',
    corpus: componentCorpus(overrides),
    systems: COMPONENT_SYSTEMS,
  });
}

/** The in-system record the editor is opened on, which carries the RESOLVED category. */
function componentRecord(id, name, category) {
  return {
    id,
    name,
    img: 'icons/commodities/metal/ingot-worn-iron.webp',
    description: '',
    category,
    tags: [],
    essences: {},
  };
}

async function openEditor(component, { scope, systemId = 'sys-forge', showTags = false } = {}) {
  const { calls, actions } = recordingComponentActions();
  const opened = [];
  const target = await editor.mount({
    component,
    scope: scope ?? scopeFor(),
    actions,
    systemId,
    showTags,
    // `{tag, checked}` RECORDS, which is what `cloneTagOptions` reads: a bare string list
    // clones to two `{tag: undefined}` entries and the writable card's keyed `{#each}`
    // throws `each_key_duplicate` before a single assertion runs.
    tagOptions: [
      { tag: 'ore', checked: true },
      { tag: 'ingot', checked: false },
    ],
    categoryOptions: ['Refined', 'Raw'],
    onOpenWorldEntry: (route, entityId) => opened.push([route, entityId]),
  });
  return { target, calls, opened };
}

describe('the system Component Rules editor over the world layer (issue 1371)', () => {
  before(async () => {
    await editor.setup();
  });

  after(() => {
    editor.teardown();
  });

  describe('the identity callout is clamped and routes to the world entry', () => {
    // AC-13 and AC-16's mounted half. The banner is the ONE callout since issue 1371's parity
    // round 4 (gap-list row 129): the `SharedDefinitionCallout` under the identity strip and the
    // strip itself were two stacked cards making one statement, and the reference draws one.
    it('reads 0 other systems for a component NO system has a record for', async () => {
      const { target } = await openEditor(componentRecord('resin', 'Wildwood Resin', 'general'));
      const note = target.querySelector('[data-component-identity-note]');
      assert.ok(Boolean(note), 'the editor renders the identity callout');
      assert.match(note.textContent, /0 other systems/);
      assert.ok(
        !note.textContent.includes('-1'),
        "transcribing the prototype's own unclamped string renders `shared with -1 other systems`"
      );
    });

    it('and 1 other system for one two systems hold', async () => {
      // The positive control: with the count above zero the clamp is invisible, which is why the
      // zero fixture is the criterion rather than this one.
      const { target } = await openEditor(componentRecord('ingot', 'Iron Ingot', 'Refined'));
      assert.match(
        target.querySelector('[data-component-identity-note]').textContent,
        /1 other system\./
      );
    });

    it('and it is ONE callout, carrying the World catalogue pill', async () => {
      // The removal, stated where a reader will look for it. Two cards drawing one fact is the
      // shape the reference collapses, and an assertion on the survivor alone cannot say the
      // second one went.
      const { target } = await openEditor(componentRecord('ingot', 'Iron Ingot', 'Refined'));
      assert.ok(
        !target.querySelector('[data-scoped-shared-definition]'),
        'the second card is gone rather than merely re-styled'
      );
      assert.equal(
        target.querySelector('[data-component-world-pill]').textContent.trim(),
        'World catalogue',
        'and the pill reads the catalogue rather than a "World definition"'
      );
    });

    it('and its exit invokes the navigation prop with the ROUTE TOKEN', async () => {
      const { target, opened } = await openEditor(
        componentRecord('ingot', 'Iron Ingot', 'Refined')
      );
      target.querySelector('[data-component-edit-action="open-world-entry"]').click();
      await drain();
      assert.deepEqual(
        opened,
        [['world-component-entry', 'ingot']],
        'the issue body named `world-component-edit`, which resolves to nothing — and no shipped ' +
          'test would have said so'
      );
    });
  });

  describe('the category control is ONE select whose first option is the inherit option', () => {
    // AC-14, rebuilt to the reference for issue 1371's parity round 4 (gap-list rows 133, 143).
    // The card used to float a `<select>` into its head, DISABLE it while the section inherited,
    // and repeat the choice as a second labelled row with a toggle and the note beside it. The
    // reference draws the head, then one full-width select whose FIRST option is
    // `Inherit from world · {value}`, then the note directly under it.
    it('offers the inherit option FIRST and selects it while the section inherits', async () => {
      const { target } = await openEditor(componentRecord('ingot', 'Iron Ingot', 'Refined'));
      const select = target.querySelector('[data-component-edit-category]');
      assert.ok(Boolean(select), 'the editor renders its category control');
      assert.equal(
        select.options[0].value,
        '__inherit',
        'the inherit option is folded into the control rather than living beside it'
      );
      assert.match(select.options[0].textContent, /Inherit from world/);
      assert.match(
        select.options[0].textContent,
        /Refined/,
        'and it NAMES the world value, which is the whole reason it is an option and not a switch'
      );
      assert.equal(select.value, '__inherit', 'an inheriting section selects it');
      assert.equal(
        select.disabled,
        false,
        'the control is no longer disabled: choosing a concrete category IS how you override'
      );
      assert.ok(
        !target.querySelector('[data-scoped-inherit-toggle="category"]'),
        'and the separate toggle is gone with the second labelled row it sat in'
      );
    });

    it('choosing a concrete category clears the inherit flag AND stages the value', async () => {
      // TWO WRITES, and the second is the one a lock used to stand in for: the read union
      // re-applies an inheriting world category AFTER the in-system re-spread, so a value staged
      // without clearing the flag is discarded on the very next read.
      const { target, calls } = await openEditor(componentRecord('ingot', 'Iron Ingot', 'Refined'));
      const select = target.querySelector('[data-component-edit-category]');
      const concrete = [...select.options].find((option) => option.value !== '__inherit');
      select.value = concrete.value;
      select.dispatchEvent(new target.ownerDocument.defaultView.Event('change', { bubbles: true }));
      await drain();

      assert.deepEqual(
        calls.filter((call) => call.verb === 'setSectionInherited'),
        [{ verb: 'setSectionInherited', args: ['ingot', 'sys-forge', 'category', false] }],
        'the membership flag is cleared, or the staged value is discarded on the next read'
      );
    });

    it('and choosing the inherit option forwards setSectionInherited(…, true)', async () => {
      // The other direction, from the system that OVERRIDES. Asserted on the forwarded argument,
      // because the action refuses silently for a non-member.
      const { target, calls } = await openEditor(componentRecord('ingot', 'Iron Ingot', 'Refined'), {
        systemId: 'sys-alchemy',
      });
      const select = target.querySelector('[data-component-edit-category]');
      assert.notEqual(select.value, '__inherit', 'the overriding system does not start there');
      select.value = '__inherit';
      select.dispatchEvent(new target.ownerDocument.defaultView.Event('change', { bubbles: true }));
      await drain();

      assert.deepEqual(
        calls.filter((call) => call.verb === 'setSectionInherited'),
        [{ verb: 'setSectionInherited', args: ['ingot', 'sys-alchemy', 'category', true] }]
      );
    });

    it('and WITHHOLDS the inherit option when no world category is authored', async () => {
      // THE FIXTURE IS A MEMBER WITH NO WORLD DEFAULT, and that is the whole point of it.
      // `orphan` is a `sys-forge` member whose world record carries no `category`, which is the
      // only fixture that isolates the branch this test names: the affordance is withheld for a
      // non-member first, so a non-member fixture never reaches the world-value half.
      const { target } = await openEditor(componentRecord('orphan', 'Unbound Salt', 'general'));
      const select = target.querySelector('[data-component-edit-category]');
      assert.ok(
        ![...select.options].some((option) => option.value === '__inherit'),
        'the option is ABSENT rather than offered against an unauthored world value'
      );
      assert.equal(select.disabled, false, 'and this system supplies its own value');
      const note = target.querySelector('[data-component-edit-category-note]');
      assert.ok(Boolean(note), 'the third branch of the note renders in its place');
      assert.match(note.textContent, /No world category is set/);
    });

    it('and the two states PAINT differently, which is what the tone field was for', async () => {
      // THE RENDERED CLASS, NOT THE MODEL FIELD. `componentCategoryNote` has answered
      // `tone: 'info'` / `'warning'` since round 1 and the unit test asserted the string, but the
      // note dropped the value on the floor: both states painted one muted ink, so the whole
      // mapping of the reference's raw hex onto Fabricate's families was a constant with no pixel
      // behind it. That is the anti-guard shape — an assertion satisfied by a value nothing
      // consumes — and only a class read off the DOM closes it.
      const { target: inheriting } = await openEditor(
        componentRecord('ingot', 'Iron Ingot', 'Refined')
      );
      const inheritNote = inheriting.querySelector('[data-component-edit-category-note]');
      assert.ok(Boolean(inheritNote), 'the inheriting state renders its note');
      assert.ok(
        inheritNote.classList.contains('is-info'),
        `the inheriting note carries the info family; it carried "${inheritNote.className}"`
      );
      assert.ok(
        Boolean(inheritNote.querySelector('i.fa-earth-americas')),
        'and the glyph the model names, so the state survives a monochrome render'
      );

      const { target: overriding } = await openEditor(
        componentRecord('ingot', 'Iron Ingot', 'Refined'),
        { systemId: 'sys-alchemy' }
      );
      const overrideNote = overriding.querySelector('[data-component-edit-category-note]');
      assert.ok(
        overrideNote.classList.contains('is-warning'),
        `the overriding note carries the warning family; it carried "${overrideNote.className}"`
      );
      assert.notEqual(
        inheritNote.className,
        overrideNote.className,
        'and the two are DIFFERENT, which is the whole claim: a single ink for both passes every ' +
          'assertion above it'
      );
    });
  });

  describe('the world tag card is READ-ONLY and distinct from the writable one', () => {
    // AC-12's editor half. The scope is load-bearing in BOTH directions: the shipped in-system
    // chips are real buttons BY DESIGN, so an unscoped no-button assertion FAILS on a correct
    // implementation — and a `showTags: false` fixture written to dodge that deletes the very
    // card this criterion exists to distinguish the world card from.
    it('renders BOTH cards at once, each under its own hook', async () => {
      const { target } = await openEditor(componentRecord('coal', 'Coal', 'Raw'), {
        showTags: true,
      });
      assert.ok(
        Boolean(target.querySelector('[data-component-edit-tags]')),
        'the shipped WRITABLE in-system tag card'
      );
      assert.ok(
        Boolean(target.querySelector('[data-component-edit-world-tags]')),
        'and the new READ-ONLY world tag card beside it'
      );
    });

    it('one chip per world tag, with the muted one on the muted tone', async () => {
      const { target } = await openEditor(componentRecord('coal', 'Coal', 'Raw'), {
        showTags: true,
      });
      const card = target.querySelector('[data-component-edit-world-tags]');
      const chips = [...card.querySelectorAll('[data-component-edit-world-tag]')];
      assert.deepEqual(
        chips.map((chip) => chip.getAttribute('data-component-edit-world-tag')),
        ['fuel', 'bulk']
      );
      const muted = card.querySelector('[data-component-edit-world-tag="bulk"]');
      assert.equal(muted.getAttribute('data-component-world-tag-muted'), 'true');
      assert.ok(
        muted.classList.contains('is-muted'),
        'the muted tone, never `is-disabled` — that one is joined to the WARNING family and ' +
          'would paint a muted tag amber, reading as a hazard the GM must act on'
      );
    });

    it('and NO chip in that card is a button', async () => {
      const { target } = await openEditor(componentRecord('coal', 'Coal', 'Raw'), {
        showTags: true,
      });
      const card = target.querySelector('[data-component-edit-world-tags]');
      assert.equal(
        card.querySelectorAll('button').length,
        0,
        'muting is authored on the world entry; this screen shows the state and routes there'
      );
      // THE SCOPE IS THE ASSERTION. The shipped in-system chips ARE buttons, so an unscoped
      // version of this check fails on a correct implementation — which is what proves the
      // selector above is actually distinguishing the two cards.
      assert.ok(
        target.querySelectorAll('[data-component-edit-tags] button').length > 0,
        'the writable card next to it is made of real toggles, by design'
      );
    });

    it('and it EXITS to where the list is authored, on the seam the banner already uses', async () => {
      // A read-only card that says the list belongs elsewhere and offers no route there leaves a
      // GM scrolled to the tags with nothing to do but scroll back up. The exit is the SAME seam
      // the attribution banner uses — no route is minted here, and the gateway's unsaved-changes
      // guard runs before the move, which matters because this editor buffers its identity edits.
      const { target, opened } = await openEditor(componentRecord('coal', 'Coal', 'Raw'), {
        showTags: true,
      });
      const exit = target.querySelector('[data-component-edit-world-tags-exit]');
      assert.ok(Boolean(exit), 'the world tag card offers its own exit');
      exit.click();
      await drain();
      assert.deepEqual(
        opened,
        [['world-component-entry', 'coal']],
        'the ROUTE TOKEN and the entity id, so the exit lands on this component rather than on ' +
          'the catalogue'
      );
    });

    it('and BOTH runs are drawn at the reference TAG-RUN scale, lit, unlit and struck', async () => {
      // `proto:5692` and `proto:5711` draw every tag chip on this screen at `padding: 5px 11-12px`,
      // a stadium corner and `600 11px` — the scale of a chip a GM CLICKS rather than reads. Two
      // parity lanes measured that one mismatch as ~34 of this screen's 117 drift lines, the
      // largest single cause on it. The scale is `Chip`'s `density="tag-run"`, and it composes
      // with the three paints rather than replacing any of them, which is the claim here: one
      // size across a run that draws a lit chip, an unlit one and a switched-off one.
      const { target } = await openEditor(componentRecord('coal', 'Coal', 'Raw'), {
        showTags: true,
      });

      const scaled = (selector) =>
        [...target.querySelectorAll(selector)].map((chip) => chip.classList.contains('is-tag-run'));

      assert.deepEqual(
        scaled('[data-component-edit-world-tag]'),
        [true, true],
        'the world run — an unmuted chip AND the muted one, which is the struck face'
      );
      assert.deepEqual(
        scaled('[data-component-edit-tag-toggle]'),
        [true, true],
        "and the system's own run — a checked chip AND an unchecked one"
      );

      const muted = target.querySelector('[data-component-edit-world-tag="bulk"]');
      assert.ok(
        muted.classList.contains('is-tag-run') && muted.classList.contains('is-struck'),
        `the scale and the switched-off paint compose; the muted chip carried "${muted.className}"`
      );
      const lit = target.querySelector('[data-component-edit-tag-toggle="ore"]');
      assert.ok(
        lit.classList.contains('is-tag-run') && lit.classList.contains('is-tag'),
        `and so do the scale and the lit purple; the checked chip carried "${lit.className}"`
      );
    });

    it('and the WORLD run is inked blue where the system run is purple, per the reference', async () => {
      // `proto:5692` inks a world tag blue and `proto:5711` inks the system's own purple, and the
      // two runs stand one label apart. A single tone across both would make the card's two
      // groups distinguishable only by their labels, which is what the colour is for.
      const { target } = await openEditor(componentRecord('coal', 'Coal', 'Raw'), {
        showTags: true,
      });
      assert.ok(
        target
          .querySelector('[data-component-edit-world-tag="fuel"]')
          .classList.contains('is-info'),
        'the unmuted world tag takes the info family'
      );
      assert.ok(
        !target.querySelector('[data-component-edit-tag-toggle="ore"]').classList.contains('is-info'),
        'and the system run does not, so the two really are different families'
      );
    });

    it('the RAIL preview draws its tags at the micro scale instead, because they are read', async () => {
      // `proto:6147`, the shared preview builder this rail renders through: `padding: 2px 8px;
      // border-radius: 999px; font: 600 9px` in the tag tone. A preview tag is a fact, not a
      // control, so it takes `list` where the two authoring runs above take `tag-run` — the same
      // split the reference draws, at two scales in one screen.
      const { target } = await openEditor(componentRecord('coal', 'Coal', 'Raw'), {
        showTags: true,
      });
      const rail = target.querySelector('[data-component-rail-tags]');
      assert.ok(Boolean(rail), 'the rail renders its tag row');
      const chips = [...rail.querySelectorAll('.manager-chip')];
      assert.ok(chips.length > 0, 'with at least one chip in it, so the check below is not vacuous');
      assert.deepEqual(
        chips.map((chip) => [chip.classList.contains('is-list'), chip.classList.contains('is-tag-run')]),
        chips.map(() => [true, false]),
        'every preview chip is the micro pill and none of them is the control scale'
      );
    });

    it('and the write path it declines to use IS available to it', async () => {
      // The read-only-ness is NOT structural: this view declares `actions`, and the call site
      // binds it to the component family — the one family carrying `setMutedTags`. So after this
      // lane the screen holds a live write path, and the assertion above is the only thing
      // withholding it.
      const { calls } = await openEditor(componentRecord('coal', 'Coal', 'Raw'), {
        showTags: true,
      });
      assert.deepEqual(
        calls.filter((call) => call.verb === 'setMutedTags'),
        [],
        'and it writes nothing on render'
      );
    });
  });
});
