<!-- Svelte 5 runes mode -->
<!--
  The component browser's BULK EDIT panel (issue 772). It renders in the shell's existing
  `.manager-inspector` column and REPLACES `ComponentBrowserInspector` for as long as the
  selection is non-empty — the prototype's `bulkOn` / `bulkOff` swap, at its `> 0`
  threshold, not `> 1`. One ticked box is already a bulk edit; making the GM tick a second
  one before the panel appears hides the whole feature behind an unexplained threshold.

  It lives under `apps/manager/components/` — the BROWSER's directory, which
  `scripts/ui-pr-screenshot-evidence.mjs` globs for the components views — NOT `component/`,
  which is the EDITOR's. Its CHROME does not: the header, hero, section headings, staged
  select and Apply were extracted to `BulkEditPanelShell` / `BulkEditSection` /
  `BulkEditSelect` under `apps/manager/` so the Recipe Studio's panel renders the same
  chrome (issue 1010). What remains here is what is genuinely about COMPONENTS: the
  category, tag, essence and progressive-DC axes.

  Consequence, accepted and recorded: unlink and copy-source-UUID live ONLY in
  `ComponentBrowserInspector`, so ticking one box hides them until the selection clears.
  `Clear selection` is the documented escape and is the first control in the header. DELETE is
  no longer in that list — issue 1129 gave the panel its own set delete, because the swap was
  making the one DESTRUCTIVE affordance harder to reach the moment a GM selected the rows they
  wanted rid of. Unlink and copy-source stay out: neither is destructive, and neither has an
  impact worth stating, which is what the arm below is paired with.

  ── THE BULK DELETE IS ARMED, AND IT IS PAIRED WITH AN IMPACT STATEMENT ───────────
  `AGENTS.md` reserves `confirmDialog` for bulk actions EXCEPT where the panel states the
  impact of the pending action in view before the control is armed. This card does, so it
  arms. Do not substitute a `confirmDialog`, and do not remove the impact list and leave the
  arm — the carve-out is the pair, not the button.

  ── NOTHING IS WRITTEN UNTIL APPLY ────────────────────────────────────────────────
  Every control stages into a draft the CALLER owns; the browser rows do not change while
  staging. The draft helpers in `componentBulkEditModel.js` are IMMUTABLE — each returns a
  NEW draft — so every mutator here reassigns through `onDraftChange`. An in-place call
  would compile, run, and silently do nothing.

  ── MAKING THE OVERWRITE LEGIBLE ──────────────────────────────────────────────────
  Essences and progressive DC are destructive axes whose staged value can be
  indistinguishable from their unstaged one (an all-zero map, a zero DC), so:
   - the essences section carries a PERMANENT sub-hint saying the write overwrites every
     selected component. It is a sub-hint, not a `Callout`, matching the prototype and
     reserving the one tinted strip in a 320px rail for the actual hazard;
   - a `Callout tone="warning"` renders ONLY when the axis is staged AND the staged map
     would in fact change or remove AUTHORED essence values, naming that count;
   - each of the two axes carries a staged-axis CHIP that is also the arm/disarm control.
     It is rendered in BOTH states on purpose: `Stepper` never emits a no-op (it returns
     early when the clamped candidate equals the current value, and `−` is disabled at
     `min`), so on a fresh draft — every essence 0 — the steppers CANNOT stage the axis at
     all. The chip is therefore the only path to "clear essences on everything", not merely
     a safety net for an already-staged axis;
   - `tag="button"` and `type="button"` on that chip are load-bearing: `Chip` defaults to a
     `<span>` and defaults no `type`, which would make the only route to arming or
     unstaging a destructive axis non-focusable and non-keyboard-operable. Its accessible
     name OPENS with its visible label and then states the ACTION: the label alone ("Will
     overwrite") does not tell a screen-reader user that activating it reverts the axis,
     while an action-only name breaks WCAG 2.5.3 Label in Name — a speech-input user says
     what they can read, and a name that omits the visible string is unactivatable by it;
   - `Apply` names the exact blast radius and is inert until something is staged.

  Props:
   - count: how many components the apply will write to.
   - categoryOptions: `componentCategoryOptions(...)` output; rendered WITHOUT the
     browser's `({count})` suffix, since a count of components currently in a category is
     meaningless as an assignment target.
   - tags: the system's `itemTags` vocabulary.
   - showEssences / essenceDefinitions: the essence section and its cards.
   - showProgressiveDifficulty: the three-axis predicate — crafting OR salvage OR gathering
     resolution mode is progressive — the SAME predicate the row badge and the
     single-component editor control read.
   - selectedCards: the selected `itemCards`, for the conditional warning count only.
   - draft / onDraftChange(next): the staged edit, owned by the caller.
   - applying: an in-flight apply; the panel goes inert rather than double-writing.
   - onClearSelection() / onApply().
   - deleting: an in-flight delete; inert on the same terms as `applying`.
   - deleteArmed: whether the set delete holds its armed token. The OWNER clears it on any
     change to the selection — an arm is a statement about a SPECIFIC set.
   - deleteImpact: `describeComponentDeleteImpact(...)` output, supplied by the owner rather
     than derived here. See the note beside `impact` for why this one number cannot come from
     the rows.
   - onArmDelete() / onDisarmDelete() / onDelete(ids).
-->
<script>
  import ArmedDangerButton from '../ArmedDangerButton.svelte';
  import Chip from '../Chip.svelte';
  import Callout from '../Callout.svelte';
  import BulkEditPanelShell from '../BulkEditPanelShell.svelte';
  import BulkEditSection from '../BulkEditSection.svelte';
  import BulkEditSelect from '../BulkEditSelect.svelte';
  import EssenceQuantityCard from './EssenceQuantityCard.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { getComponentCategoryLabel } from '../../../../../utils/componentCategories.js';
  // The add-new offer projection (issue 1036). The `essenceDefinitions` PROP stays
  // unfiltered — the warning count reads the selection's authored values against it — and
  // only the staging grid narrows.
  import { visibleEssenceOptions } from '../../../../../utils/essenceValidation.js';
  import {
    bulkDraftHasChanges,
    countComponentsChangingEssences,
    createComponentBulkDraft,
    cycleBulkTag,
    setBulkCategory,
    setBulkDifficulty,
    setBulkEssence,
    toggleBulkDifficultyStaged,
    toggleBulkEssencesStaged,
  } from '../../../../../utils/componentBulkEditModel.js';

  let {
    count = 0,
    categoryOptions = [],
    tags = [],
    showEssences = false,
    essenceDefinitions = [],
    showProgressiveDifficulty = false,
    selectedCards = [],
    draft = createComponentBulkDraft(),
    applying = false,
    deleting = false,
    deleteArmed = false,
    deleteImpact = null,
    onDraftChange = () => {},
    onClearSelection = () => {},
    onApply = () => {},
    onArmDelete = () => {},
    onDisarmDelete = () => {},
    onDelete = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements)) {
      result = result.replace(`{${token}}`, value);
    }
    return result;
  }

  const stagedTagAdd = $derived(Array.isArray(draft?.tagAdd) ? draft.tagAdd : []);
  const stagedTagRemove = $derived(Array.isArray(draft?.tagRemove) ? draft.tagRemove : []);
  const stagedEssences = $derived(
    draft?.essences && typeof draft.essences === 'object' ? draft.essences : {}
  );
  const essencesStaged = $derived(draft?.essencesStaged === true);
  const difficultyStaged = $derived(draft?.difficultyStaged === true);
  const inert = $derived(applying === true || deleting === true);
  const canApply = $derived(bulkDraftHasChanges(draft) && !inert);

  // The delete impact arrives as a PROP rather than being computed here — the deliberate
  // deviation from `EssenceBulkEditPanel`, which derives its own from the selected rows.
  // "How many recipes will be disabled" cannot be answered per row: whether a recipe survives
  // depends on the WHOLE selection, since two selected components may be the only two options
  // of one ingredient group. It needs recipe bodies, which belong in the store rather than in
  // a Svelte prop. See `adminStore.describeComponentDelete`.
  const impact = $derived({
    deletable: Number(deleteImpact?.deletable) || 0,
    deletableIds: Array.isArray(deleteImpact?.deletableIds) ? deleteImpact.deletableIds : [],
    recipesRewritten: Number(deleteImpact?.recipesRewritten) || 0,
    recipesDisabled: Number(deleteImpact?.recipesDisabled) || 0,
  });

  // Declaration order is the system's own vocabulary order, as the editor's grid and the
  // prototype both show it — no re-sort, so the two essence surfaces read the same.
  // The staged map is a WHOLE-MAP replacement, so this grid is simultaneously the offer
  // and the only place a staged value can be edited back down: a disabled essence is
  // withheld from the offer, but one already carrying a staged quantity stays visible so
  // the GM can clear it (issue 1036).
  const essenceCards = $derived(
    visibleEssenceOptions(
      Array.isArray(essenceDefinitions) ? essenceDefinitions : [],
      (definition) => Number(stagedEssences[definition?.id]) > 0
    ).map((definition) => ({
      id: definition.id,
      name: definition.name || definition.id,
      icon: String(definition.icon || '').trim(),
      quantity: Number(stagedEssences[definition.id]) || 0,
    }))
  );

  // The conditional hazard, counted over AUTHORED values on the selected rows: an increase
  // counts as surely as a clear, because overwriting a hand-tuned 3 with a 5 destroys that
  // authored 3. A component with no authored essences is never counted — the staged map
  // purely ADDS to it.
  const essenceWarningCount = $derived(
    countComponentsChangingEssences(selectedCards, stagedEssences)
  );

  const headingLabel = $derived(
    count === 1
      ? text(
          'FABRICATE.Admin.Manager.Component.BulkEdit.SelectedHeadingOne',
          '1 component selected'
        )
      : format(
          'FABRICATE.Admin.Manager.Component.BulkEdit.SelectedHeading',
          '{count} components selected',
          { count }
        )
  );
  const applyLabel = $derived(
    count === 1
      ? text('FABRICATE.Admin.Manager.Component.BulkEdit.ApplyOne', 'Apply to 1 component')
      : format('FABRICATE.Admin.Manager.Component.BulkEdit.Apply', 'Apply to {count} components', {
          count,
        })
  );

  // The delete labels use the same `…One` sibling-key ternary the rest of this panel already
  // uses, so the impact statement never says "1 recipes will be rewritten".
  const deleteLabel = $derived(
    impact.deletable === 1
      ? text('FABRICATE.Admin.Manager.Component.BulkEdit.DeleteOne', 'Delete 1 component')
      : format('FABRICATE.Admin.Manager.Component.BulkEdit.Delete', 'Delete {count} components', {
          count: impact.deletable,
        })
  );
  const impactComponentsLabel = $derived(
    impact.deletable === 1
      ? text(
          'FABRICATE.Admin.Manager.Component.BulkEdit.ImpactComponentsOne',
          '1 component will be deleted.'
        )
      : format(
          'FABRICATE.Admin.Manager.Component.BulkEdit.ImpactComponents',
          '{count} components will be deleted.',
          { count: impact.deletable }
        )
  );
  const impactRecipesLabel = $derived(
    impact.recipesRewritten === 1
      ? text(
          'FABRICATE.Admin.Manager.Component.BulkEdit.ImpactRecipesOne',
          '1 recipe will be rewritten.'
        )
      : format(
          'FABRICATE.Admin.Manager.Component.BulkEdit.ImpactRecipes',
          '{count} recipes will be rewritten.',
          { count: impact.recipesRewritten }
        )
  );
  const impactDisabledLabel = $derived(
    impact.recipesDisabled === 1
      ? text(
          'FABRICATE.Admin.Manager.Component.BulkEdit.ImpactDisabledOne',
          '1 of those recipes will be left uncraftable and disabled.'
        )
      : format(
          'FABRICATE.Admin.Manager.Component.BulkEdit.ImpactDisabled',
          '{count} of those recipes will be left uncraftable and disabled.',
          { count: impact.recipesDisabled }
        )
  );
  const deleteAriaLabel = $derived(
    impact.deletable === 1
      ? text('FABRICATE.Admin.Manager.Component.BulkEdit.DeleteAriaOne', 'Delete 1 component')
      : format(
          'FABRICATE.Admin.Manager.Component.BulkEdit.DeleteAria',
          'Delete {count} components',
          {
            count: impact.deletable,
          }
        )
  );
  // `Unchanged`, NOT "Leave unchanged". This label sits on a `<button>` whose activation
  // ARMS the axis, so an imperative reading ("leave unchanged") names the opposite of what
  // pressing it does — a GM who wants essences untouched would click it and stage the
  // wipe. Its staged twin reads "Will overwrite" / "Will set", which is STATE phrasing, so
  // a neutral state word is also the consistent choice. The `<select>` sentinel keeps
  // `CategoryUnchanged` ("Leave unchanged"): there it genuinely is an option to choose.
  // Both keys are noun-free, so both moved to the neutral `BulkEdit.*` namespace together
  // (issue 1010) — moving one and not the other is exactly the drift this note guards.
  const unchangedLabel = $derived(text('FABRICATE.Admin.Manager.BulkEdit.Unchanged', 'Unchanged'));

  // The tri-state cycle stated in full. "click to add · again to remove" named only two of
  // the three stops and left the third — the one that UNDOES a staged remove — undiscoverable
  // except by clicking a third time and watching what happens.
  //
  // This studio is now the key's ONLY consumer. The Recipe Studio's book axis was a
  // matching chip run when the key moved to the neutral `BulkEdit.*` namespace, but it is
  // now a search-and-pick control (issue 1010) and cycles nothing, so there is no shared
  // instruction left to state. The key stays here rather than moving back under
  // `Component.*`: the shared namespace still describes what it is — a neutral, noun-free
  // bulk-edit string — and the divergence is in the two studios' staged AXES, which the
  // spec permits, not in their shared chrome, which it does not.
  const chipCycleHint = $derived(
    text(
      'FABRICATE.Admin.Manager.BulkEdit.TagsHint',
      'click to add · again to remove · again to leave unchanged'
    )
  );

  // The chip run is a GROUP, not a stray sequence of buttons: it is one axis whose members
  // are read together, and without the role a screen-reader user arrives at a `<button>`
  // named "Add sundry to every selected component" with nothing saying which control they
  // are inside. Named from the section's own visible label, so the group name and the
  // heading a sighted GM reads are one string.
  const tagsLabel = $derived(text('FABRICATE.Admin.Manager.Component.BulkEdit.Tags', 'Tags'));

  function tagState(tag) {
    if (stagedTagAdd.includes(tag)) return 'add';
    if (stagedTagRemove.includes(tag)) return 'remove';
    return 'none';
  }

  // Tri-state colour maps onto the shipped chip tones: add is the success family, remove
  // the danger family, leave the neutral one. The trailing glyph reinforces it for anyone
  // who cannot separate the three by hue.
  const TAG_TONES = { add: 'positive', remove: 'danger', none: 'neutral' };
  const TAG_ICONS = { add: 'fas fa-plus', remove: 'fas fa-minus', none: 'far fa-circle' };

  // The accessible name OPENS with the visible label and then states the STAGED ACTION:
  // `aria-pressed` cannot honestly describe a control with three states, so the name
  // carries it instead — but an action-FIRST name breaks WCAG 2.5.3 Label in Name, which
  // is the rule the staged-essences chip above already states for this same panel. The em
  // dash rather than a comma or a colon is what lets a lowercase tag vocabulary (`ore`,
  // `ingot`) lead without opening a sentence on a lowercase word. Same shape as the Recipe
  // Studio's book chips, which are the other tri-state run in the manager.
  function tagActionLabel(tag) {
    const state = tagState(tag);
    if (state === 'add') {
      return format(
        'FABRICATE.Admin.Manager.Component.BulkEdit.TagStateAdd',
        '{tag} — add to every selected component.',
        { tag }
      );
    }
    if (state === 'remove') {
      return format(
        'FABRICATE.Admin.Manager.Component.BulkEdit.TagStateRemove',
        '{tag} — remove from every selected component.',
        { tag }
      );
    }
    return format(
      'FABRICATE.Admin.Manager.Component.BulkEdit.TagStateNone',
      '{tag} — leave unchanged.',
      { tag }
    );
  }

  function categoryOptionLabel(name) {
    return getComponentCategoryLabel(name, localize);
  }

  // Every mutator below REASSIGNS through the caller: the model's helpers return a NEW
  // draft and never mutate their argument.
  function cycleTag(tag) {
    onDraftChange(cycleBulkTag(draft, tag));
  }

  function setCategory(value) {
    onDraftChange(setBulkCategory(draft, value));
  }

  function setEssence(essenceId, quantity) {
    onDraftChange(setBulkEssence(draft, essenceId, quantity));
  }

  function toggleEssences() {
    onDraftChange(toggleBulkEssencesStaged(draft));
  }

  function setDifficulty(value) {
    onDraftChange(setBulkDifficulty(draft, value));
  }

  function toggleDifficulty() {
    onDraftChange(toggleBulkDifficultyStaged(draft));
  }
</script>

<!--
  The chrome — header, hero, section headings, the staged select and Apply — is the shared
  primitive set (issue 1010). This panel supplies only the NOUN-bearing strings (the hero
  heading and the Apply label) and the four component axes; every hook name is left at the
  primitive's Component Studio default, so the smoke selectors, the view-lab cases and the
  shipped mounted assertions resolve unchanged.

  The axes are emitted as SIBLING flex items of the shell's panel, not wrapped: the shell's
  uniform `gap` is the panel's rhythm and a wrapper per section would re-space the rail.
-->
<BulkEditPanelShell heading={headingLabel} {applyLabel} {canApply} {onClearSelection} {onApply}>
  <BulkEditSection
    label={text('FABRICATE.Admin.Manager.Component.BulkEdit.Category', 'Category')}
  />
  <!--
    The sentinel is FIRST and carries `value=""`, which is the model's `Leave unchanged`.
    The options carry NO `({count})` suffix the browser's filter uses: a count of the
    components currently IN a category says nothing about it as an assignment target.
  -->
  <BulkEditSelect
    data-component-bulk-category=""
    value={draft?.category || ''}
    disabled={applying}
    ariaLabel={text('FABRICATE.Admin.Manager.Component.BulkEdit.Category', 'Category')}
    onChange={(value) => setCategory(value)}
  >
    <option value=""
      >{text('FABRICATE.Admin.Manager.BulkEdit.CategoryUnchanged', 'Leave unchanged')}</option
    >
    {#each categoryOptions as option (option.name)}
      <option value={option.name}>{categoryOptionLabel(option.name)}</option>
    {/each}
  </BulkEditSelect>

  <BulkEditSection
    label={tagsLabel}
    hint={chipCycleHint}
    subhint={tags.length === 0
      ? text(
          'FABRICATE.Admin.Manager.Component.BulkEdit.NoTags',
          'This system defines no item tags.'
        )
      : ''}
    subhintAttr="data-component-bulk-tags-empty"
  />
  {#if tags.length > 0}
    <!--
      A FLAT run of tri-state chips rather than an Add/Remove segmented control plus a
      searchable popover: the whole tag vocabulary and the staged answer for every entry
      are visible at once, which is the same argument the component editor already records
      for its toggle pills over the old add-menu. `type` and every `data-*` hook ride
      Chip's rest spread onto the real `<button>`; the children carry NO internal
      whitespace, because `Chip` records that call sites assert exact `textContent`.
    -->
    <div class="manager-chip-row" role="group" aria-label={tagsLabel} data-component-bulk-tags>
      {#each tags as tag (tag)}
        <Chip
          tag="button"
          type="button"
          tone={TAG_TONES[tagState(tag)]}
          icon="fas fa-tag"
          data-bulk-tag={tag}
          data-bulk-tag-state={tagState(tag)}
          aria-label={tagActionLabel(tag)}
          disabled={applying}
          onclick={() => cycleTag(tag)}
          >{tag}<i class={TAG_ICONS[tagState(tag)]} aria-hidden="true"></i></Chip
        >
      {/each}
    </div>
  {/if}

  {#if showEssences}
    <!-- PERMANENT sub-hint, and a sub-hint rather than a Callout: the one tinted strip in a
         320px rail is reserved for the conditional hazard below. A STANDING SENTENCE, so it
         wears `-subhint` rather than the inline `-hint` scale — the sentence that makes
         the destructive axis legible must not be the smallest text in the panel. -->
    <BulkEditSection
      label={text('FABRICATE.Admin.Manager.Component.BulkEdit.Essences', 'Essences')}
      subhint={text(
        'FABRICATE.Admin.Manager.Component.BulkEdit.EssencesOverwriteHint',
        'Applying essences overwrites the essence values on every selected component.'
      )}
    >
      {#snippet trailing()}
        <!--
          Rendered in BOTH states: on a fresh draft every essence is 0 and `Stepper` emits
          nothing at that boundary, so this chip is the ONLY way to stage "clear essences on
          every selected component". `tag`/`type` are load-bearing (see the header comment).
        -->
        <Chip
          tag="button"
          type="button"
          tone={essencesStaged ? 'warning' : 'neutral'}
          data-component-bulk-essences-staged={essencesStaged}
          aria-label={essencesStaged
            ? text(
                'FABRICATE.Admin.Manager.Component.BulkEdit.EssencesStagedChipAction',
                'Will overwrite — essences will be overwritten on every selected component. Activate to leave them unchanged.'
              )
            : text(
                'FABRICATE.Admin.Manager.Component.BulkEdit.EssencesUnstagedChipAction',
                'Unchanged — essences are left unchanged. Activate to overwrite them on every selected component.'
              )}
          disabled={applying}
          onclick={() => toggleEssences()}
          >{essencesStaged
            ? text(
                'FABRICATE.Admin.Manager.Component.BulkEdit.EssencesStagedChip',
                'Will overwrite'
              )
            : unchangedLabel}</Chip
        >
      {/snippet}
    </BulkEditSection>
    {#if essencesStaged && essenceWarningCount > 0}
      <Callout
        tone="warning"
        text={format(
          'FABRICATE.Admin.Manager.Component.BulkEdit.EssencesOverwriteWarning',
          'This will change or remove authored essence values on {count} of the selected components.',
          { count: essenceWarningCount }
        )}
        dataAttr="data-component-bulk-essence-warning"
        dataValue={String(essenceWarningCount)}
      />
    {/if}
    {#if essenceCards.length > 0}
      <!-- A TWO-up, where the editor renders the same card four-up: which grid a card sits
           in is host layout, and the card's own appearance travels with it. -->
      <div class="manager-component-bulk-essence-grid" data-component-bulk-essences>
        {#each essenceCards as essence (essence.id)}
          <EssenceQuantityCard
            id={essence.id}
            name={essence.name}
            icon={essence.icon}
            quantity={essence.quantity}
            disabled={applying}
            ariaLabel={format('FABRICATE.Admin.Items.Editor.QuantityLabel', 'Quantity for {name}', {
              name: essence.name,
            })}
            decrementLabel={format(
              'FABRICATE.Admin.Items.Editor.DecrementEssence',
              'Decrement {name}',
              { name: essence.name }
            )}
            incrementLabel={format(
              'FABRICATE.Admin.Items.Editor.IncrementEssence',
              'Increment {name}',
              { name: essence.name }
            )}
            onChange={(quantity) => setEssence(essence.id, quantity)}
          />
        {/each}
      </div>
    {/if}
  {/if}

  {#if showProgressiveDifficulty}
    <BulkEditSection
      label={text('FABRICATE.Admin.Manager.Component.BulkEdit.ProgressiveDc', 'Progressive DC')}
      subhint={text(
        'FABRICATE.Admin.Manager.Component.BulkEdit.ProgressiveDcHint',
        'DC when used as a progressive result'
      )}
    >
      {#snippet trailing()}
        <Chip
          tag="button"
          type="button"
          tone={difficultyStaged ? 'warning' : 'neutral'}
          data-component-bulk-difficulty-staged={difficultyStaged}
          aria-label={difficultyStaged
            ? text(
                'FABRICATE.Admin.Manager.Component.BulkEdit.ProgressiveDcStagedChipAction',
                'Will set — the progressive DC will be set on every selected component. Activate to leave it unchanged.'
              )
            : text(
                'FABRICATE.Admin.Manager.Component.BulkEdit.ProgressiveDcUnstagedChipAction',
                'Unchanged — the progressive DC is left unchanged. Activate to set it on every selected component.'
              )}
          disabled={applying}
          onclick={() => toggleDifficulty()}
          >{difficultyStaged
            ? text('FABRICATE.Admin.Manager.Component.BulkEdit.ProgressiveDcStagedChip', 'Will set')
            : unchangedLabel}</Chip
        >
      {/snippet}
    </BulkEditSection>
    <div class="manager-component-bulk-dc-row">
      <i class="fas fa-dice-d20" aria-hidden="true"></i>
      <span class="manager-component-bulk-dc-copy"
        >{text(
          'FABRICATE.Admin.Manager.Component.BulkEdit.ProgressiveDcSentence',
          'Set every selected component to'
        )}</span
      >
      <!-- 0..35, matching the shipped single-component control; 0 CLEARS the value. -->
      <Stepper
        value={Number(draft?.difficulty) || 0}
        min={0}
        max={35}
        disabled={applying}
        ariaLabel={text(
          'FABRICATE.Admin.Manager.Component.BulkEdit.ProgressiveDc',
          'Progressive DC'
        )}
        decrementLabel={text(
          'FABRICATE.Admin.Manager.Component.ProgressiveDifficultyDecrement',
          'Decrease difficulty'
        )}
        incrementLabel={text(
          'FABRICATE.Admin.Manager.Component.ProgressiveDifficultyIncrement',
          'Increase difficulty'
        )}
        inputProps={{ 'data-component-bulk-difficulty': '' }}
        onChange={(value) => setDifficulty(value)}
      />
    </div>
  {/if}
</BulkEditPanelShell>

<!--
  The DELETE block sits below the shell rather than inside it: the shell's Apply is the
  panel's primary action, and a destructive action inside the same card would read as a
  second way of applying the staged edit. The Essence Studio's card is the twin.
-->
<section
  class="manager-inspector-card manager-component-bulk-delete"
  data-component-bulk-delete-card
>
  <div class="manager-edit-card-heading">
    <h3 class="manager-card-title">
      {text(
        'FABRICATE.Admin.Manager.Component.BulkEdit.DeleteHeading',
        'Delete selected components'
      )}
    </h3>
  </div>

  <!--
    Stated BEFORE the action is armed, and recomputed from the selection because the impact
    prop is re-derived by the owner whenever the selected set changes.

    Three numbers, three different questions. `recipes rewritten` is a count of DISTINCT
    recipes, never a per-component sum — a recipe naming two selected components is rewritten
    once — and `disabled` is the SUBSET of those left with no ingredient sets or no results.
    `describeComponentDeleteImpact` owns that arithmetic and counts through the very functions
    the delete executes through; this component only renders it.
  -->
  <ul class="manager-component-bulk-impact" data-component-bulk-impact>
    <li data-component-bulk-impact-row="components">
      {impactComponentsLabel}
    </li>
    <li data-component-bulk-impact-row="recipes">
      {impactRecipesLabel}
    </li>
    <li data-component-bulk-impact-row="disabled">
      {impactDisabledLabel}
    </li>
  </ul>

  <ArmedDangerButton
    token="delete-components"
    armed={deleteArmed === true}
    disabled={impact.deletable === 0 || inert}
    idleLabel={deleteLabel}
    armedLabel={text('FABRICATE.Admin.Manager.Component.BulkEdit.DeleteConfirm', 'Confirm delete')}
    idleAriaLabel={deleteAriaLabel}
    armedAriaLabel={format(
      'FABRICATE.Admin.Manager.Component.BulkEdit.DeleteConfirmAria',
      'Confirm deleting {count} component(s) and rewriting {recipes} recipe(s)',
      { count: impact.deletable, recipes: impact.recipesRewritten }
    )}
    onArm={onArmDelete}
    onDisarm={onDisarmDelete}
    onConfirm={() => onDelete(impact.deletableIds)}
  />
</section>

<style>
  /* Manager-scoped by PLACEMENT — this component lives under `apps/manager/`, so
     `--fab-mv2-*` (declared on `.fabricate-manager`) is in scope. Its appearance lives
     HERE rather than in `styles/fabricate.css` so `VIEW_RECIPES` in
     `scripts/ui-pr-screenshot-evidence.mjs` routes a change to the components views that
     actually render it instead of matching the broad `theme-or-global-ui` recipe.

     What is left here is only what is genuinely about COMPONENTS. The panel container, the
     header, the hero, the section label scales, the staged select and Apply all moved to
     `BulkEditPanelShell` / `BulkEditSection` / `BulkEditSelect` under `apps/manager/`
     (issue 1010), which is why nothing below styles this component's own root: there is no
     longer a root element here, only the axes the shell renders between its hero and its
     Apply button. */

  /* The panel's 2-up, against the editor's 4-up. Both render the same card. */
  .manager-component-bulk-essence-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-component-bulk-dc-row {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    min-width: 0;
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-mv2-border);
    border-radius: 10px;
    background: var(--fab-mv2-bg);
  }

  .manager-component-bulk-dc-row > i {
    flex: 0 0 auto;
    color: var(--fab-mv2-info);
    font-size: 0.8rem;
  }

  .manager-component-bulk-dc-copy {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--fab-mv2-text-muted);
    font-size: 0.62rem;
    line-height: 1.3;
  }

  .manager-component-bulk-delete {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  /* The armed danger button reads at the shared inspector-action label size, for the reason
     recorded on the Essence Studio's twin: `ArmedDangerButton` renders a bare
     `.manager-button`, which carries no font-size of its own and so inherits the app's body
     size — visibly chunkier than every other right-rail control. Scoped to this card only, so
     the row-level `ArmedDangerButton` uses elsewhere in the manager are untouched, and only
     the type scale changes — the danger/armed colour treatment from `styles/fabricate.css`
     is untouched. */
  .manager-component-bulk-delete :global(.manager-button) {
    min-height: 34px;
    padding: 0 var(--fab-space-3);
    font-size: 0.72rem;
    font-weight: 700;
  }

  /* WEIGHT, not size: this is the sentence the GM is asked to act on, so it takes the
     secondary text colour and a heavier face to read as a statement rather than a footnote,
     while keeping the small type because the card is a rail and not a dialog. */
  .manager-component-bulk-impact {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    margin: 0;
    padding-left: var(--fab-space-4);
    color: var(--fab-text-secondary);
    font-size: 0.72rem;
    font-weight: 600;
  }
</style>
