<!-- Svelte 5 runes mode -->
<!--
  The component browser's BULK EDIT panel (issue 772). It renders in the shell's existing
  `.manager-inspector` column and REPLACES `ComponentBrowserInspector` for as long as the
  selection is non-empty — the prototype's `bulkOn` / `bulkOff` swap, at its `> 0`
  threshold, not `> 1`. One ticked box is already a bulk edit; making the GM tick a second
  one before the panel appears hides the whole feature behind an unexplained threshold.

  It lives under `apps/manager/components/` — the BROWSER's directory, which
  `scripts/ui-pr-screenshot-evidence.mjs` globs for the components views — NOT `component/`,
  which is the EDITOR's.

  Consequence, accepted and recorded: unlink, delete and copy-source-UUID live ONLY in
  `ComponentBrowserInspector`, so ticking one box hides them until the selection clears.
  `Clear selection` is the documented escape and is the first control in the header.

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
-->
<script>
  import Chip from '../Chip.svelte';
  import Callout from '../Callout.svelte';
  import EssenceQuantityCard from './EssenceQuantityCard.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { getComponentCategoryLabel } from '../../../../../utils/componentCategories.js';
  import {
    bulkDraftHasChanges,
    countComponentsChangingEssences,
    createComponentBulkDraft,
    cycleBulkTag,
    setBulkCategory,
    setBulkDifficulty,
    setBulkEssence,
    toggleBulkDifficultyStaged,
    toggleBulkEssencesStaged
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
    onDraftChange = () => {},
    onClearSelection = () => {},
    onApply = () => {}
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
  const stagedEssences = $derived(draft?.essences && typeof draft.essences === 'object' ? draft.essences : {});
  const essencesStaged = $derived(draft?.essencesStaged === true);
  const difficultyStaged = $derived(draft?.difficultyStaged === true);
  const canApply = $derived(bulkDraftHasChanges(draft) && applying !== true);

  // Declaration order is the system's own vocabulary order, as the editor's grid and the
  // prototype both show it — no re-sort, so the two essence surfaces read the same.
  const essenceCards = $derived(
    (Array.isArray(essenceDefinitions) ? essenceDefinitions : []).map((definition) => ({
      id: definition.id,
      name: definition.name || definition.id,
      icon: String(definition.icon || '').trim(),
      quantity: Number(stagedEssences[definition.id]) || 0
    }))
  );

  // The conditional hazard, counted over AUTHORED values on the selected rows: an increase
  // counts as surely as a clear, because overwriting a hand-tuned 3 with a 5 destroys that
  // authored 3. A component with no authored essences is never counted — the staged map
  // purely ADDS to it.
  const essenceWarningCount = $derived(countComponentsChangingEssences(selectedCards, stagedEssences));

  const headingLabel = $derived(
    count === 1
      ? text('FABRICATE.Admin.Manager.Component.BulkEdit.SelectedHeadingOne', '1 component selected')
      : format('FABRICATE.Admin.Manager.Component.BulkEdit.SelectedHeading', '{count} components selected', { count })
  );
  const applyLabel = $derived(
    count === 1
      ? text('FABRICATE.Admin.Manager.Component.BulkEdit.ApplyOne', 'Apply to 1 component')
      : format('FABRICATE.Admin.Manager.Component.BulkEdit.Apply', 'Apply to {count} components', { count })
  );
  // `Unchanged`, NOT "Leave unchanged". This label sits on a `<button>` whose activation
  // ARMS the axis, so an imperative reading ("leave unchanged") names the opposite of what
  // pressing it does — a GM who wants essences untouched would click it and stage the
  // wipe. Its staged twin reads "Will overwrite" / "Will set", which is STATE phrasing, so
  // a neutral state word is also the consistent choice. The `<select>` sentinel keeps
  // `CategoryUnchanged` ("Leave unchanged"): there it genuinely is an option to choose.
  const unchangedLabel = $derived(text('FABRICATE.Admin.Manager.Component.BulkEdit.Unchanged', 'Unchanged'));

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

  // The accessible name states the STAGED ACTION, not the state: `aria-pressed` cannot
  // honestly describe a control with three states, so the name carries it instead.
  function tagActionLabel(tag) {
    const state = tagState(tag);
    if (state === 'add') {
      return format('FABRICATE.Admin.Manager.Component.BulkEdit.TagStateAdd', 'Add {tag} to every selected component', { tag });
    }
    if (state === 'remove') {
      return format('FABRICATE.Admin.Manager.Component.BulkEdit.TagStateRemove', 'Remove {tag} from every selected component', { tag });
    }
    return format('FABRICATE.Admin.Manager.Component.BulkEdit.TagStateNone', 'Leave {tag} unchanged', { tag });
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

<section class="manager-component-bulk-panel" data-component-bulk-panel>
  <header class="manager-component-bulk-header">
    <p class="manager-component-bulk-eyebrow">{text('FABRICATE.Admin.Manager.Component.BulkEdit.PanelTitle', 'Bulk edit')}</p>
    <button
      type="button"
      class="manager-component-bulk-clear"
      data-component-bulk-clear
      onclick={() => onClearSelection()}
    >
      <i class="fas fa-xmark" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Component.BulkEdit.ClearSelection', 'Clear selection')}</span>
    </button>
  </header>

  <div class="manager-component-bulk-hero">
    <span class="manager-component-bulk-hero-icon" aria-hidden="true"><i class="fas fa-layer-group"></i></span>
    <div class="manager-component-bulk-hero-copy">
      <strong class="manager-component-bulk-hero-title" data-component-bulk-count>{headingLabel}</strong>
      <span class="manager-component-bulk-hero-hint">{text('FABRICATE.Admin.Manager.Component.BulkEdit.SelectedHint', 'Stage changes below, then apply to all at once.')}</span>
    </div>
  </div>

  <p class="manager-component-bulk-label">{text('FABRICATE.Admin.Manager.Component.BulkEdit.Category', 'Category')}</p>
  <!--
    The sentinel is FIRST and carries `value=""`, which is the model's `Leave unchanged`.
    The options carry NO `({count})` suffix the browser's filter uses: a count of the
    components currently IN a category says nothing about it as an assignment target.
  -->
  <select
    class="manager-component-bulk-select"
    data-component-bulk-category
    value={draft?.category || ''}
    disabled={applying}
    aria-label={text('FABRICATE.Admin.Manager.Component.BulkEdit.Category', 'Category')}
    onchange={(event) => setCategory(event.currentTarget.value)}
  >
    <option value="">{text('FABRICATE.Admin.Manager.Component.BulkEdit.CategoryUnchanged', 'Leave unchanged')}</option>
    {#each categoryOptions as option (option.name)}
      <option value={option.name}>{categoryOptionLabel(option.name)}</option>
    {/each}
  </select>

  <div class="manager-component-bulk-label-row">
    <p class="manager-component-bulk-label">{text('FABRICATE.Admin.Manager.Component.BulkEdit.Tags', 'Tags')}</p>
    <span class="manager-component-bulk-hint">{text('FABRICATE.Admin.Manager.Component.BulkEdit.TagsHint', 'click to add · again to remove')}</span>
  </div>
  {#if tags.length === 0}
    <!-- The panel's OWN sub-hint scale, not the global `manager-muted` (0.78rem): that
         class would make an empty-state aside the LARGEST text in a rail whose loudest
         copy is 0.62rem. -->
    <p class="manager-component-bulk-subhint" data-component-bulk-tags-empty>{text('FABRICATE.Admin.Manager.Component.BulkEdit.NoTags', 'This system defines no item tags.')}</p>
  {:else}
    <!--
      A FLAT run of tri-state chips rather than an Add/Remove segmented control plus a
      searchable popover: the whole tag vocabulary and the staged answer for every entry
      are visible at once, which is the same argument the component editor already records
      for its toggle pills over the old add-menu. `type` and every `data-*` hook ride
      Chip's rest spread onto the real `<button>`; the children carry NO internal
      whitespace, because `Chip` records that call sites assert exact `textContent`.
    -->
    <div class="manager-chip-row" data-component-bulk-tags>
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
    <div class="manager-component-bulk-label-row">
      <p class="manager-component-bulk-label">{text('FABRICATE.Admin.Manager.Component.BulkEdit.Essences', 'Essences')}</p>
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
          ? text('FABRICATE.Admin.Manager.Component.BulkEdit.EssencesStagedChipAction', 'Will overwrite — essences will be overwritten on every selected component. Activate to leave them unchanged.')
          : text('FABRICATE.Admin.Manager.Component.BulkEdit.EssencesUnstagedChipAction', 'Unchanged — essences are left unchanged. Activate to overwrite them on every selected component.')}
        disabled={applying}
        onclick={() => toggleEssences()}
      >{essencesStaged
          ? text('FABRICATE.Admin.Manager.Component.BulkEdit.EssencesStagedChip', 'Will overwrite')
          : unchangedLabel}</Chip
      >
    </div>
    <!-- PERMANENT, and a sub-hint rather than a Callout: the one tinted strip in a 320px
         rail is reserved for the conditional hazard below. A STANDING SENTENCE, so it
         wears `-subhint` rather than the inline `-hint` scale — the sentence that makes
         the destructive axis legible must not be the smallest text in the panel. -->
    <p class="manager-component-bulk-subhint">{text('FABRICATE.Admin.Manager.Component.BulkEdit.EssencesOverwriteHint', 'Applying essences overwrites the essence values on every selected component.')}</p>
    {#if essencesStaged && essenceWarningCount > 0}
      <Callout
        tone="warning"
        text={format('FABRICATE.Admin.Manager.Component.BulkEdit.EssencesOverwriteWarning', 'This will change or remove authored essence values on {count} of the selected components.', { count: essenceWarningCount })}
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
            ariaLabel={format('FABRICATE.Admin.Items.Editor.QuantityLabel', 'Quantity for {name}', { name: essence.name })}
            decrementLabel={format('FABRICATE.Admin.Items.Editor.DecrementEssence', 'Decrement {name}', { name: essence.name })}
            incrementLabel={format('FABRICATE.Admin.Items.Editor.IncrementEssence', 'Increment {name}', { name: essence.name })}
            onChange={(quantity) => setEssence(essence.id, quantity)}
          />
        {/each}
      </div>
    {/if}
  {/if}

  {#if showProgressiveDifficulty}
    <div class="manager-component-bulk-label-row">
      <p class="manager-component-bulk-label">{text('FABRICATE.Admin.Manager.Component.BulkEdit.ProgressiveDc', 'Progressive DC')}</p>
      <Chip
        tag="button"
        type="button"
        tone={difficultyStaged ? 'warning' : 'neutral'}
        data-component-bulk-difficulty-staged={difficultyStaged}
        aria-label={difficultyStaged
          ? text('FABRICATE.Admin.Manager.Component.BulkEdit.ProgressiveDcStagedChipAction', 'Will set — the progressive DC will be set on every selected component. Activate to leave it unchanged.')
          : text('FABRICATE.Admin.Manager.Component.BulkEdit.ProgressiveDcUnstagedChipAction', 'Unchanged — the progressive DC is left unchanged. Activate to set it on every selected component.')}
        disabled={applying}
        onclick={() => toggleDifficulty()}
      >{difficultyStaged
          ? text('FABRICATE.Admin.Manager.Component.BulkEdit.ProgressiveDcStagedChip', 'Will set')
          : unchangedLabel}</Chip
      >
    </div>
    <p class="manager-component-bulk-subhint">{text('FABRICATE.Admin.Manager.Component.BulkEdit.ProgressiveDcHint', 'DC when used as a progressive result')}</p>
    <div class="manager-component-bulk-dc-row">
      <i class="fas fa-dice-d20" aria-hidden="true"></i>
      <span class="manager-component-bulk-dc-copy">{text('FABRICATE.Admin.Manager.Component.BulkEdit.ProgressiveDcSentence', 'Set every selected component to')}</span>
      <!-- 0..35, matching the shipped single-component control; 0 CLEARS the value. -->
      <Stepper
        value={Number(draft?.difficulty) || 0}
        min={0}
        max={35}
        disabled={applying}
        ariaLabel={text('FABRICATE.Admin.Manager.Component.BulkEdit.ProgressiveDc', 'Progressive DC')}
        decrementLabel={text('FABRICATE.Admin.Manager.Component.ProgressiveDifficultyDecrement', 'Decrease difficulty')}
        incrementLabel={text('FABRICATE.Admin.Manager.Component.ProgressiveDifficultyIncrement', 'Increase difficulty')}
        inputProps={{ 'data-component-bulk-difficulty': '' }}
        onChange={(value) => setDifficulty(value)}
      />
    </div>
  {/if}

  <button
    type="button"
    class="manager-button manager-component-bulk-apply"
    data-component-bulk-apply
    disabled={!canApply}
    onclick={() => onApply()}
  >
    <i class="fas fa-check-double" aria-hidden="true"></i>
    <span>{applyLabel}</span>
  </button>
</section>

<style>
  /* Manager-scoped by PLACEMENT — this component lives under `apps/manager/`, so
     `--fab-mv2-*` (declared on `.fabricate-manager`) is in scope. Its appearance lives
     HERE rather than in `styles/fabricate.css` so `VIEW_RECIPES` in
     `scripts/ui-pr-screenshot-evidence.mjs` routes a change to the components views that
     actually render it instead of matching the broad `theme-or-global-ui` recipe. */

  .manager-component-bulk-panel {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-component-bulk-header {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    justify-content: space-between;
    min-width: 0;
  }

  /* ACCENT, where the single-component inspector's eyebrow is subtle: the rail has
     changed what it is for, and that is the first thing the GM must read. */
  .manager-component-bulk-eyebrow {
    margin: 0;
    color: var(--fab-mv2-accent);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  /* The documented escape from a mode that hides unlink / delete / copy-source, so it is
     a real focusable button and the FIRST control in the panel — Foundry's host button
     geometry (fixed height, its own font) reset explicitly, as `Chip` does. */
  .manager-component-bulk-clear {
    appearance: none;
    display: inline-flex;
    gap: var(--fab-space-chip);
    align-items: center;
    flex: 0 0 auto;
    width: auto;
    height: auto;
    min-height: 0;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--fab-text-subtle);
    font-family: inherit;
    font-size: 0.62rem;
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
  }

  .manager-component-bulk-clear:hover {
    color: var(--fab-mv2-text);
  }

  .manager-component-bulk-clear:focus-visible,
  .manager-component-bulk-apply:focus-visible,
  .manager-component-bulk-select:focus-visible {
    outline: 2px solid var(--fab-mv2-accent);
    outline-offset: 2px;
  }

  .manager-component-bulk-clear > i {
    font-size: 0.58rem;
  }

  /* The hero restates the blast radius in the rail, so the number the Apply button names
     is never the only place it appears. */
  .manager-component-bulk-hero {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    min-width: 0;
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-accent-border);
    border-radius: 10px;
    background: var(--fab-accent-soft);
  }

  .manager-component-bulk-hero-icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 9px;
    background: var(--fab-bg-0);
    color: var(--fab-mv2-accent);
    font-size: 0.86rem;
  }

  .manager-component-bulk-hero-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .manager-component-bulk-hero-title {
    color: var(--fab-mv2-text);
    font-family: var(--fab-font-serif);
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .manager-component-bulk-hero-hint {
    color: var(--fab-mv2-text-muted);
    font-size: 0.62rem;
    line-height: 1.35;
  }

  /* Sections are uppercase micro-labels ON the panel background — the treatment the
     single-component inspector this panel replaces already uses, so the rail reads the
     same either way.

     The panel's SECTION RHYTHM lives on this margin and on the label row's below, because
     the container's flex `gap` is uniform, and a uniform gap puts a section heading
     exactly as far from the previous section's last control as from its own — so the
     panel reads as one undifferentiated stack. The prototype separates sections by twice
     what it puts between controls WITHIN one; the container gap already supplies the
     inner spacing, and this extra `space-2` is what turns the flat run back into groups. */
  .manager-component-bulk-label {
    margin: var(--fab-space-2) 0 0;
    color: var(--fab-text-subtle);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .manager-component-bulk-label-row {
    display: flex;
    gap: var(--fab-space-2);
    align-items: baseline;
    justify-content: space-between;
    min-width: 0;
    /* The row carries the section break for the label INSIDE it (which is zeroed just
       below, since a flex item's own margin would push it off the shared baseline). */
    margin-top: var(--fab-space-2);
  }

  .manager-component-bulk-label-row > .manager-component-bulk-label {
    margin-top: 0;
  }

  /* Two hint scales, deliberately. `-hint` is the INLINE aside that sits on a label row's
     baseline and must not out-weigh the label beside it. `-subhint` is a STANDING
     SENTENCE addressed to the GM — the essence-overwrite warning and the DC's meaning —
     which is read, not glanced at, so it is a step larger and looser. Collapsing the two
     made the sentence explaining the panel's destructive axis the smallest text in it. */
  .manager-component-bulk-hint {
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 0.58rem;
    font-weight: 400;
    line-height: 1.4;
  }

  .manager-component-bulk-subhint {
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 0.62rem;
    font-weight: 400;
    line-height: 1.4;
  }

  /* Full width, and wearing the Fabricate select treatment rather than Foundry core's
     default light chrome — the same treatment the toolbar's filter selects carry. */
  .manager-component-bulk-select {
    width: 100%;
    min-width: 0;
    height: 32px;
    padding: 0 var(--fab-space-2);
    border: 1px solid var(--fab-mv2-border-strong);
    border-radius: 8px;
    color: var(--fab-mv2-text);
    background: var(--fab-surface-soft);
    font-family: inherit;
    font-size: 0.72rem;
    cursor: pointer;
  }

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

  /* Full-width and accent, the loudest thing on the panel — and genuinely inert until an
     axis is staged, so the GM cannot fire a no-op write and read success from it.
     Geometry, weight and foreground are the browser inspector's primary button verbatim
     (`.manager-button.manager-component-browser-inspector-edit`, styles/fabricate.css),
     because this button LITERALLY SWAPS PLACES with it in the rail's bottom slot the
     moment a box is ticked: 38px and 0.78rem, so the swap does not resize or re-type the
     slot, and `--fab-on-accent` — the token that means "foreground ON an accent fill" —
     rather than `--fab-bg-1`, which is a surface colour and differs from it in all seven
     themes. */
  .manager-component-bulk-apply {
    display: flex;
    gap: var(--fab-space-chip);
    align-items: center;
    justify-content: center;
    width: 100%;
    height: auto;
    min-height: 38px;
    margin-top: var(--fab-space-1);
    padding: 0 var(--fab-space-3);
    border: 1px solid var(--fab-accent-border);
    border-radius: 9px;
    color: var(--fab-on-accent);
    background: var(--fab-accent);
    font-family: inherit;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
  }

  /* The same accent-strong hover its twin carries. Without it the rail's primary action
     is the only button on the panel with no pointer feedback. */
  .manager-component-bulk-apply:not(:disabled):hover {
    border-color: var(--fab-accent);
    background: var(--fab-accent-strong);
  }

  .manager-component-bulk-apply:disabled {
    border-color: var(--fab-mv2-border);
    color: var(--fab-text-disabled);
    background: var(--fab-surface-soft);
    cursor: default;
  }
</style>
