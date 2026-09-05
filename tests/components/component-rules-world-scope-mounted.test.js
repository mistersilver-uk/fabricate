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

async function openEditor(
  component,
  { scope, systemId = 'sys-forge', showTags = false, saveResult = true } = {}
) {
  const { calls, actions } = recordingComponentActions();
  const opened = [];
  // THE SAVE IS RECORDED THROUGH THE SAME `calls` LIST as the world-scope writes, and that is the
  // point rather than a convenience: since revision 8 the category's two halves — the in-system
  // VALUE through `onSave` and the membership INHERIT FLAG through `setSectionInherited` — both
  // land on Save, and their ORDER is the thing a half-failed save turns on. Two separate spies
  // could not state an ordering between them at all.
  const onSave = async (id, updates) => {
    calls.push({ verb: 'onSave', args: [id, updates] });
    await Promise.resolve();
    return saveResult;
  };
  const target = await editor.mount({
    onSave,
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

/** Choose one option on the category control, exactly as a GM does. */
function chooseCategory(target, value) {
  const select = target.querySelector('[data-component-edit-category]');
  select.value = value;
  select.dispatchEvent(new target.ownerDocument.defaultView.Event('change', { bubbles: true }));
  return select;
}

/** Submit the editor's form, which is what the shell's header Save does by `form` id. */
function save(target) {
  const form = target.querySelector('#manager-component-edit-form');
  assert.ok(Boolean(form), 'the editor renders its form');
  form.dispatchEvent(
    new target.ownerDocument.defaultView.Event('submit', { bubbles: true, cancelable: true })
  );
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

    it('choosing a concrete category WRITES NOTHING until Save', async () => {
      // Reviewer 9.2. The choice is TWO facts in two world settings keys — the VALUE on the
      // in-system record, the INHERIT FLAG on the membership record — and until revision 8 only
      // the value was buffered. So a GM who picked a category and then walked away left the
      // system silently switched from inheriting to overriding, with no save, nothing on screen
      // saying so, and the flag written for a value that was never persisted.
      const { target, calls } = await openEditor(componentRecord('ingot', 'Iron Ingot', 'Refined'));
      const select = target.querySelector('[data-component-edit-category]');
      const concrete = [...select.options].find((option) => option.value !== '__inherit');
      chooseCategory(target, concrete.value);
      await drain();

      assert.deepEqual(calls, [], 'a draft edit persists nothing, in EITHER key');
      // …and it is a real edit rather than a choice that did not take: the control shows it and
      // the note flips to the overriding face, so the screen previews the pending state.
      assert.equal(select.value, concrete.value);
      assert.ok(
        target
          .querySelector('[data-component-edit-category-note]')
          .classList.contains('is-warning'),
        'the note previews OVERRIDING while the choice is still a draft'
      );
    });

    it('and Save lands BOTH halves, flag first, so a half-failed save cannot hide a value', async () => {
      // THE ORDER IS THE ASSERTION. There is no transaction across the two settings keys, so one
      // can land alone. Flag-first leaves the system overriding with the value it was already
      // resolving — the effective category does not move. Value-first would persist the GM's
      // typed category into a record the read union still masks with the world default, which is
      // the discarded-edit defect this whole change is about.
      const { target, calls } = await openEditor(componentRecord('ingot', 'Iron Ingot', 'Refined'));
      const select = target.querySelector('[data-component-edit-category]');
      const concrete = [...select.options].find((option) => option.value !== '__inherit');
      chooseCategory(target, concrete.value);
      await drain();
      save(target);
      await drain();

      assert.deepEqual(
        calls.map((call) => call.verb),
        ['setSectionInherited', 'onSave'],
        'the membership flag is cleared BEFORE the value is written'
      );
      assert.deepEqual(calls[0].args, ['ingot', 'sys-forge', 'category', false]);
      assert.equal(calls[1].args[1].category, concrete.value, 'and the value is the chosen one');
    });

    it('and choosing the inherit option defers setSectionInherited(…, true) to Save too', async () => {
      // The other direction, from the system that OVERRIDES. Asserted on the forwarded argument,
      // because the action refuses silently for a non-member.
      const { target, calls } = await openEditor(componentRecord('ingot', 'Iron Ingot', 'Refined'), {
        systemId: 'sys-alchemy',
      });
      const select = target.querySelector('[data-component-edit-category]');
      assert.notEqual(select.value, '__inherit', 'the overriding system does not start there');
      chooseCategory(target, '__inherit');
      await drain();
      assert.deepEqual(calls, [], 'still a draft');

      save(target);
      await drain();
      assert.deepEqual(
        calls.filter((call) => call.verb === 'setSectionInherited'),
        [{ verb: 'setSectionInherited', args: ['ingot', 'sys-alchemy', 'category', true] }]
      );
    });

    it('a REFUSED flag write stops the save rather than writing the value alone', async () => {
      // The failure branch of the ordering above. If the first half refuses, the second must not
      // run: a value written under a flag that did not move is a persisted, invisible edit.
      const { target, calls } = await openEditor(componentRecord('ingot', 'Iron Ingot', 'Refined'));
      const select = target.querySelector('[data-component-edit-category]');
      const concrete = [...select.options].find((option) => option.value !== '__inherit');
      chooseCategory(target, concrete.value);
      await drain();
      // The recording bag answers `true` for every verb, so the refusal is injected here rather
      // than by widening that shared fake for one test.
      const editorTarget = target.querySelector('[data-component-edit-category]');
      assert.ok(Boolean(editorTarget), 'the control is still there, so the setup below is real');
      calls.length = 0;
      await editor.setProps({
        actions: {
          setSectionInherited: async () => {
            calls.push({ verb: 'setSectionInherited', args: [] });
            return false;
          },
        },
      });
      save(target);
      await drain();
      assert.deepEqual(
        calls.map((call) => call.verb),
        ['setSectionInherited'],
        'the refusal short-circuits: no value write follows it'
      );
    });

    it('and an untouched switch writes NOTHING on Save, so a save is not a flag write', async () => {
      // The negative control for the branch above. Without it, a `handleSave` that fired
      // `setSectionInherited` unconditionally passes every ordering assertion here — and would
      // write the flag on every save of every component in every system.
      const { target, calls } = await openEditor(componentRecord('ingot', 'Iron Ingot', 'Refined'));
      save(target);
      await drain();
      assert.deepEqual(
        calls.map((call) => call.verb),
        ['onSave'],
        'the value half alone, because the switch was never touched'
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

    it('and the card head carries NO action at all, per M11', async () => {
      // `proto:1329-1339` draws this head as glyph + `h3` + subtitle and nothing else. Revision 5
      // added an `Edit world tags` exit beside the title, on the reasoning that the reference's
      // own caption (`click to mute here`) named an interaction the card does not offer and the
      // exit was the route to where it IS offered. The maintainer ruled the other way on both:
      // the caption loses the clause and the subject-only action is dropped.
      //
      // ASSERTED AS THE HEAD'S WHOLE CONTROL COUNT, not as the absence of one hook. A test that
      // only said `data-component-edit-world-tags-exit` is gone passes the moment the same
      // action comes back under a different attribute, which is the shape of the thing being
      // withdrawn rather than the attribute it happened to carry.
      const { target, opened } = await openEditor(componentRecord('coal', 'Coal', 'Raw'), {
        showTags: true,
      });
      const head = target.querySelector(
        '[data-component-edit-section="tags"] .manager-component-rules-card-head'
      );
      assert.ok(Boolean(head), 'the tags card renders its head');
      assert.equal(
        head.querySelectorAll('button, a, [role="button"]').length,
        0,
        'the reference draws no action in this head and neither does the product'
      );
      assert.ok(
        !target.querySelector('[data-component-edit-world-tags-exit]'),
        'and the revision-5 exit is gone from the screen, not merely out of the head'
      );
      await drain();
      assert.deepEqual(opened, [], 'and nothing routes anywhere on render');
    });

    it('the run is captioned `From the world`, with no instruction it cannot honour', async () => {
      // M11. The caption is the reference's minus its second clause: `click to mute here` is an
      // instruction this card refuses (the chips are not controls — see the sibling assertion
      // above), and muting is authored on the world entry. An instruction a GM cannot follow is
      // worse than a plain label.
      const { target } = await openEditor(componentRecord('coal', 'Coal', 'Raw'), {
        showTags: true,
      });
      const caption = target.querySelector(
        '[data-component-edit-section="world-tags"] .manager-micro-label'
      );
      assert.ok(Boolean(caption), 'the world run is captioned');
      assert.equal(caption.textContent.trim(), 'From the world');
    });

    it('and NO string on this card claims the tag merge the runtime discards', async () => {
      // `### GM World Component Screens` requirement 1: no surface may assert the false half of
      // the merge while it is unconsumed. Two strings on this screen did — the card subtitle
      // (`World tags merge with {system}'s own.`) and the list header's own subtitle, which the
      // shell draws from `componentListSubtitle`. The card's is asserted here; the list's is
      // asserted in `components-browser-view-mounted`, where that header renders.
      //
      // THE SCAN IS OVER THE WHOLE CARD AND OVER THE VERB, not over the one sentence that was
      // wrong: a reworded subtitle that pushed the same claim into the merge note or the group
      // caption would pass a sentence-shaped assertion.
      const { target } = await openEditor(componentRecord('coal', 'Coal', 'Raw'), {
        showTags: true,
      });
      const card = target.querySelector('[data-component-edit-section="tags"]');
      assert.ok(Boolean(card), 'the tags card renders, so this scan is not vacuous');
      assert.match(
        card.textContent,
        /tags are listed here/,
        'the subtitle states what is true: the world list is SHOWN here'
      );
      for (const claim of [/merge/i, /merged/i, /merges/i]) {
        assert.ok(
          !claim.test(card.textContent),
          `the card still asserts a merge (${claim}) that no system resolves`
        );
      }
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

    it('and the OWN run draws the label alone, where the world run leads with a glyph', async () => {
      // UX F-F (r9). `proto:1337` is `<span … >{{ t.name }}</span>` — the label and nothing else,
      // with the selection carried by the chip's own fill. The shipped chip led with `fa-tag` and
      // trailed a `fa-circle-check`/`far fa-circle`, which roughly doubled each chip's width:
      // eleven tags wrapped to four rows here against the reference's one. The world run above
      // (`proto:1333`) IS the one that carries a leading icon, so this is a difference between
      // the two runs rather than a house style, and asserting both directions is what makes it a
      // measurement rather than a deletion.
      const { target } = await openEditor(componentRecord('coal', 'Coal', 'Raw'), {
        showTags: true,
      });

      const ownChips = [...target.querySelectorAll('[data-component-edit-tag-toggle]')];
      assert.ok(ownChips.length >= 2, 'the run draws chips, so the loop below is not vacuous');
      for (const chip of ownChips) {
        assert.equal(
          chip.querySelectorAll('i').length,
          0,
          `the own-tag chip "${chip.textContent}" draws its label and no glyph`
        );
      }
      // AND THE STATE IS STILL SAID, in the one place a screen reader reads it. Dropping the
      // circle costs nothing accessible only while this holds.
      assert.deepEqual(
        ownChips.map((chip) => chip.getAttribute('aria-pressed')),
        ownChips.map((chip) => String(chip.dataset.componentTagChecked === 'true')),
        'every chip still announces its own pressed state'
      );

      // THE POSITIVE CONTROL, and it is the half that stops this reading as "remove all icons":
      // the world run keeps its leading glyph, because the reference draws one there.
      const worldChips = [...target.querySelectorAll('[data-component-edit-world-tag]')];
      assert.ok(worldChips.length > 0, 'the world run renders');
      for (const chip of worldChips) {
        assert.ok(
          Boolean(chip.querySelector('i')),
          `the world tag "${chip.textContent}" still leads with its glyph`
        );
      }
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

    it('the RAIL preview draws its tags as the world entry’s rail draws them, because it IS that rail (M27)', async () => {
      // Maintainer ruling M27: the rules editor's `How players see it` must use the SAME layout as
      // the world component editor's. The rail is now `WorldComponentEntryPreviewRail` at the
      // system scope, so its tag run is whatever that rail draws — the entry's `tone="tag"` chip at
      // the default density — and no longer a micro pill of this editor's own choosing.
      const { target } = await openEditor(componentRecord('coal', 'Coal', 'Raw'), {
        showTags: true,
      });
      const rail = target.querySelector('[data-scoped-entry-preview-tags]');
      assert.ok(Boolean(rail), 'the rail renders its tag row');
      const chips = [...rail.querySelectorAll('.manager-chip')];
      assert.ok(chips.length > 0, 'with at least one chip in it, so the check below is not vacuous');
      assert.deepEqual(
        chips.map((chip) => [chip.classList.contains('is-tag'), chip.classList.contains('is-list')]),
        chips.map(() => [true, false]),
        'every preview chip is the entry rail’s tag chip and none is this editor’s former micro pill'
      );
    });

    it('the rail draws its live-preview strip LAST, after both fact groups', async () => {
      // UX F7. `proto:1516` places `{{ d.pr.pv.live }}` as the rail's FINAL child, after
      // `Produced by`. `ScopedEntityPreview` draws its own `liveNote` region THIRD — above the
      // fact groups — so passing the prop put the strip between the scope sentence and `Used by`,
      // and the rail read `…what a player sees · this updates live · used by · produced by`.
      //
      // ASSERTED AS A POSITION, because nothing else can see it: the strip keeps the same class,
      // the same hook and the same paint wherever it sits, so every existing assertion about it —
      // and the parity region that measures it — passes in both arrangements. The sibling world
      // entry rail already solves this the same way; this is that fix applied here.
      const { target } = await openEditor(componentRecord('coal', 'Coal', 'Raw'), {
        showTags: true,
      });
      const rail = target.querySelector('[data-scoped-entry-preview]');
      assert.ok(Boolean(rail), 'the rail renders');
      const strip = rail.querySelector('[data-scoped-entry-preview-live]');
      assert.ok(Boolean(strip), 'and still draws the live-update strip');
      assert.ok(
        strip.classList.contains('manager-scoped-preview-live'),
        `the strip keeps the shell's own class, which is what paints it; it carried ` +
          `"${strip.className}"`
      );
      // ASSERTED AS A BOOLEAN, NEVER AS TWO NODES. `assert.equal(rail.lastElementChild, strip)`
      // passes identically and DIES on failure: `node:assert` serialises the actual value to
      // build its diff and walks a mounted element's circular tree until the heap goes, so the
      // one arrangement this test exists to catch surfaces as an OOM and a `# cancelled` suite
      // with no message rather than as this sentence. Measured, not theorised.
      assert.ok(
        rail.lastElementChild === strip,
        `the strip is the LAST child of the rail, not a region three places up; the rail ended ` +
          `with <${String(rail.lastElementChild?.tagName || 'nothing').toLowerCase()}> ` +
          `class="${String(rail.lastElementChild?.className || '')}"`
      );
      // NON-VACUITY, and it is what makes the position claim mean something: the two fact groups
      // it now trails are really there, so `lastElementChild` is not the answer a rail with
      // nothing else in it would give.
      assert.ok(
        Boolean(rail.querySelector('[data-component-rail-used-by]')),
        'the `Used by` group renders'
      );
      assert.ok(
        Boolean(rail.querySelector('[data-component-rail-produced-by]')),
        'and `Produced by`, which is the group the reference draws the strip after'
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

  describe('the `How players see it` rail IS the world entry’s rail, at the system scope (M27)', () => {
    // Maintainer ruling M27, tested live at `1f5617d5`: "the 'How players see it' uses a different
    // layout than the world component editor - it must use the same one!" The reference draws the
    // two rails from ONE template (`proto:985-1020` and `proto:1467-1500` differ only in the data
    // bound to them), and the driver's binding reading is that the rules editor renders the SAME
    // preview-rail component the world entry renders, generalised to take a scope, so the two
    // cannot diverge again. Every assertion below is on the ENTRY rail's own hooks, because there
    // is no other rail left to name.
    it('renders the shared rail with the system sentence, the tile, the category and the tags', async () => {
      const { target } = await openEditor(componentRecord('coal', 'Coal', 'Raw'), {
        showTags: true,
      });
      const rail = target.querySelector('main.manager-component-edit-main [data-scoped-entry-preview]');
      assert.ok(Boolean(rail), 'the editor renders the world entry’s rail');
      assert.ok(
        !target.querySelector('[data-component-rules-rail]'),
        'and no rail of its own beside it — the duplicate is gone, not hidden'
      );
      // THE SCOPE is the one thing that reads differently: the system sentence, naming THIS
      // system (`proto:1487`), where the entry reads `Across every system that has rules for it.`
      assert.equal(rail.getAttribute('aria-label'), 'Player preview');
      assert.equal(
        rail.querySelector('[data-scoped-entry-preview-scope-note]').textContent.trim(),
        'What a player sees in Forge.'
      );
      // THE ENTRY'S TILE, with the in-system record's art in it.
      const tile = rail.querySelector('[data-scoped-entry-preview-tile]');
      assert.ok(Boolean(tile), 'the inventory tile');
      assert.equal(
        tile.querySelector('img')?.getAttribute('src'),
        'icons/commodities/metal/ingot-worn-iron.webp',
        'drawing the component’s art'
      );
      assert.equal(
        rail.querySelector('.manager-component-entry-preview-name').textContent.trim(),
        'Coal'
      );
      // `coal` is linked in the corpus (`originItemUuid`), so the tile carries NO status badge and
      // the art note is the linked sentence — the entry rail's own reading of the record.
      assert.ok(!rail.querySelector('[data-scoped-entry-preview-status]'), 'no `No source item` badge');
      assert.match(rail.textContent, /come from the linked item/);
      // THE SYSTEM'S RESOLVED FACTS: `coal` overrides the world's `Raw` here, and the checked
      // system tag joins the applied world tag in the run.
      assert.equal(
        rail.querySelector('[data-scoped-entry-preview-category]').textContent.trim(),
        'Raw'
      );
      const tags = [...rail.querySelectorAll('[data-scoped-entry-preview-tags] .manager-chip')].map(
        (chip) => chip.textContent.trim()
      );
      assert.ok(tags.includes('ore'), `the checked system tag is in the run; it read ${tags.join(', ')}`);
      assert.ok(tags.includes('fuel'), 'and so is the unmuted world tag');
      assert.ok(!tags.includes('bulk'), 'but not the world tag this system mutes');
      const kickers = [...rail.querySelectorAll('.manager-kicker')].map((node) =>
        node.textContent.trim()
      );
      assert.deepEqual(kickers, ['How players see it', 'Used by', 'Produced by']);
    });

    it('narrows both fact groups to THIS system, on the shared rail’s own row hook', async () => {
      // A rail on a system's rules that listed another system's recipes would be a wrong list
      // rather than a long one. The data is the editor's; the rows are the shared rail's.
      const scope = scopeFor();
      const withUsage = {
        ...scope,
        entries: scope.entries.map((entry) =>
          entry.id === 'coal'
            ? {
                ...entry,
                requiredBy: [
                  { id: 'r1', name: 'Forge a Blade', kind: 'recipe', systemId: 'sys-forge', systemName: 'Forge' },
                  { id: 'r2', name: 'Brew a Tonic', kind: 'recipe', systemId: 'sys-alchemy', systemName: 'Alchemy' },
                ],
                producedBy: [
                  { id: 't1', name: 'Pan the Shallows', kind: 'gathering', systemId: 'sys-alchemy', systemName: 'Alchemy' },
                ],
              }
            : entry
        ),
      };
      const { target } = await openEditor(componentRecord('coal', 'Coal', 'Raw'), {
        scope: withUsage,
        showTags: true,
      });
      const usedBy = target.querySelector('[data-component-rail-used-by]');
      const rows = [...usedBy.querySelectorAll('[data-scoped-entry-preview-rule]')].map((row) =>
        row.textContent.replace(/\s+/g, ' ').trim()
      );
      assert.equal(rows.length, 1, `only the Forge recipe is listed; it read ${rows.join(' | ')}`);
      assert.match(rows[0], /Forge a Blade/);
      assert.match(rows[0], /Ingredient/);
      assert.ok(
        !usedBy.textContent.includes('Brew a Tonic'),
        'the Alchemy recipe is another system’s business'
      );
      assert.equal(
        target.querySelector('[data-component-rail-produced-by] .manager-scoped-preview-fact-empty').textContent.trim(),
        'Nothing produces it yet.',
        'and a producer in another system leaves THIS system’s group at its empty sentence'
      );
    });
  });
});
