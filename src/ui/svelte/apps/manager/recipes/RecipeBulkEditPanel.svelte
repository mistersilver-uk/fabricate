<!-- Svelte 5 runes mode -->
<!--
  The GM recipe browser's BULK EDIT panel (issue 1010). It renders in the shell's existing
  `.manager-inspector` column and REPLACES `RecipeBrowserInspector` for as long as the
  selection is non-empty — the same `> 0` threshold, and for the same reason, that
  `ComponentBulkEditPanel` records: one ticked box is already a bulk edit, and making the
  GM tick a second one before the panel appears hides the whole feature behind an
  unexplained threshold.

  It lives under `apps/manager/recipes/` — the BROWSER's directory, which
  `scripts/ui-pr-screenshot-evidence.mjs` globs for the `manager-recipes` views — and NOT
  under `recipe/`, which is the EDITOR's: a browser-side component placed there would
  republish the five recipe-EDITOR frames and never the browser frame.

  Its CHROME is not its own. The header, hero, section headings, staged select and Apply
  are the shared `BulkEditPanelShell` / `BulkEditSection` / `BulkEditSelect` primitives
  under `apps/manager/`, so this panel and the Component Studio's render the same controls
  rather than two implementations of one meaning. What is here is what is genuinely about
  RECIPES: the category, status, lock, check-tier and recipe-book axes.

  Consequence, accepted and recorded: Edit, Duplicate and Delete live ONLY in
  `RecipeBrowserInspector`, so ticking one box hides them until the selection clears.
  `Clear selection` is the documented escape and is the first control in the header.

  ── NOTHING IS WRITTEN UNTIL APPLY ────────────────────────────────────────────────
  Every control stages into a draft the CALLER owns — the manager root, because this panel
  is unmounted the moment the selection empties and a panel-owned draft would be destroyed
  by the very transition meant to DISCARD it. The draft helpers in `recipeBulkEditModel.js`
  are IMMUTABLE — each returns a NEW draft — so every mutator here reassigns through
  `onDraftChange`. An in-place call would compile, run, and silently do nothing.

  ── THE THREE INSTRUCTIONS OF THE CHECK-TIER AXIS ─────────────────────────────────
  `Leave unchanged`, `Default DC` and a named tier are three distinct instructions and the
  select never collapses two of them: the first omits `checkTierId` from the write, the
  second writes `null`. The model owns both sentinels (and records that the shipped
  single-recipe editor gives `''` the OPPOSITE meaning); this component only renders them.

  When the system's crafting check carries no recipe-level tier at all, the panel STATES
  which of the five cases it is, in place of the control, rather than hiding the section —
  a hidden axis reads as a missing feature. That is not the same fact as the system having
  no usable check at all, which the row's own `No check` pill already reports.

  ── THE BLOCKED-ENABLE FORECAST IS A LOWER BOUND ──────────────────────────────────
  `blockedCount` is counted from the SAME predicate the row's `Can't enable` pill reads, so
  the pilled rows and the counted rows are one set by construction. It cannot see collisions
  the batch itself creates, so the copy says "At least", and the post-apply notification is
  the authority.

  Props:
   - count: how many recipes the apply will write to.
   - categoryOptions: the system's effective recipe categories, as plain names — the
     single-recipe editor's own list, NOT the browser filter's `{name, count}` tally: a
     count of the recipes currently IN a category says nothing about it as an assignment
     target, and an in-use-only list would make an authored-but-unused category unreachable.
   - checkTierAxis: `describeRecipeCheckTierAxis(...)` output, `{available, reason}`.
   - checkTierOptions: the system's authored `{id, name, dc}` tiers, from the SAME derived
     the single-recipe editor's dropdown reads.
   - books: the system's recipe-item definitions, one tri-state chip each.
   - blockedCount: how many selected recipes activation would currently refuse.
   - draft / onDraftChange(next): the staged edit, owned by the caller.
   - applying: an in-flight apply; the panel goes inert rather than double-writing.
   - onClearSelection() / onApply().
-->
<script>
  import Chip from '../Chip.svelte';
  import Callout from '../Callout.svelte';
  import SegmentedControl from '../SegmentedControl.svelte';
  import BulkEditPanelShell from '../BulkEditPanelShell.svelte';
  import BulkEditSection from '../BulkEditSection.svelte';
  import BulkEditSelect from '../BulkEditSelect.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { getRecipeCategoryLabel } from '../../../../../utils/recipeCategories.js';
  import {
    RECIPE_BULK_LOCK_VALUES,
    RECIPE_BULK_STATUS_VALUES,
    RECIPE_CHECK_TIER_DEFAULT,
    RECIPE_CHECK_TIER_UNCHANGED,
    bulkRecipeCheckTierSelectValue,
    bulkRecipeDraftHasChanges,
    createRecipeBulkDraft,
    cycleBulkRecipeBook,
    setBulkRecipeCategory,
    setBulkRecipeCheckTier,
    setBulkRecipeLock,
    setBulkRecipeStatus,
  } from '../../../../../utils/recipeBulkEditModel.js';

  let {
    count = 0,
    categoryOptions = [],
    checkTierAxis = { available: false, reason: 'noTiers' },
    checkTierOptions = [],
    books = [],
    blockedCount = 0,
    draft = createRecipeBulkDraft(),
    applying = false,
    onDraftChange = () => {},
    onClearSelection = () => {},
    onApply = () => {},
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

  const stagedStatus = $derived(draft?.status || 'unchanged');
  const stagedLock = $derived(draft?.lock || 'unchanged');
  const stagedBookAdd = $derived(Array.isArray(draft?.bookAdd) ? draft.bookAdd : []);
  const stagedBookRemove = $derived(Array.isArray(draft?.bookRemove) ? draft.bookRemove : []);
  const inert = $derived(applying === true);
  const canApply = $derived(bulkRecipeDraftHasChanges(draft) && !inert);

  const headingLabel = $derived(
    count === 1
      ? text('FABRICATE.Admin.Manager.Recipe.BulkEdit.SelectedHeadingOne', '1 recipe selected')
      : format(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.SelectedHeading',
          '{count} recipes selected',
          { count }
        )
  );
  const applyLabel = $derived(
    count === 1
      ? text('FABRICATE.Admin.Manager.Recipe.BulkEdit.ApplyOne', 'Apply to 1 recipe')
      : format('FABRICATE.Admin.Manager.Recipe.BulkEdit.Apply', 'Apply to {count} recipes', {
          count,
        })
  );

  // `Leave unchanged`, shared with the Component Studio's category sentinel: it is
  // noun-free, both panels render it, and the recipe panel alone renders it TWICE. Its
  // neighbour `Unchanged` (the segment word below) is deliberately a DIFFERENT string —
  // see the note carried on both keys in `ComponentBulkEditPanel.svelte`.
  const leaveUnchangedLabel = $derived(
    text('FABRICATE.Admin.Manager.BulkEdit.CategoryUnchanged', 'Leave unchanged')
  );

  // The two segmented axes are the same control with different words, so the segment table
  // is data and the option list is built once. `disabled` rides the option itself rather
  // than a class: `SegmentedControl.select()` guards only `next !== value`, so a
  // dimmed-but-live segment would still stage an edit mid-apply.
  const STATUS_SEGMENT_LABELS = {
    unchanged: ['FABRICATE.Admin.Manager.BulkEdit.Unchanged', 'Unchanged'],
    enable: ['FABRICATE.Admin.Manager.BulkEdit.StatusEnable', 'Enable'],
    disable: ['FABRICATE.Admin.Manager.BulkEdit.StatusDisable', 'Disable'],
  };
  const LOCK_SEGMENT_LABELS = {
    unchanged: ['FABRICATE.Admin.Manager.BulkEdit.Unchanged', 'Unchanged'],
    lock: ['FABRICATE.Admin.Manager.BulkEdit.Lock', 'Lock'],
    unlock: ['FABRICATE.Admin.Manager.BulkEdit.Unlock', 'Unlock'],
  };

  function segmentOptions(values, labels, disabled) {
    return values.map((value) => ({
      value,
      labelKey: labels[value][0],
      fallback: labels[value][1],
      disabled,
    }));
  }

  const statusSegments = $derived(
    segmentOptions(RECIPE_BULK_STATUS_VALUES, STATUS_SEGMENT_LABELS, inert)
  );
  const lockSegments = $derived(
    segmentOptions(RECIPE_BULK_LOCK_VALUES, LOCK_SEGMENT_LABELS, inert)
  );

  // Five cases, five messages, keyed by the model's own `reason`. A table rather than a
  // chain of `{:else if}` blocks, so adding a reason to the model without a message here
  // renders an empty strip instead of silently falling through to the wrong one.
  const CHECK_TIER_REASON_MESSAGES = {
    progressive: [
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.CheckTierProgressive',
      'This system resolves progressively — difficulty lives on each result component, not on the recipe, so there is no recipe-level check tier to bulk edit.',
    ],
    dynamic: [
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.CheckTierDynamic',
      "This system's crafting check resolves its DC dynamically at craft time, so recipes carry no tier to select.",
    ],
    fixed: [
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.CheckTierFixed',
      "This system's routed check uses fixed outcome tiers, so a recipe's difficulty comes from its minimum success tier rather than a check tier.",
    ],
    unrecognisedMode: [
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.CheckTierUnrecognisedMode',
      "Fabricate doesn't recognise this system's resolution mode, so it can't tell which check tiers apply. Check the system's Crafting settings.",
    ],
    noTiers: [
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.CheckTierNoTiers',
      "This system's crafting check authors no tiers, so every recipe uses its default DC. Add tiers under Checks to assign them here.",
    ],
  };

  const checkTierAvailable = $derived(checkTierAxis?.available === true);
  const checkTierReason = $derived(String(checkTierAxis?.reason || ''));
  const checkTierMessage = $derived.by(() => {
    const message = CHECK_TIER_REASON_MESSAGES[checkTierReason];
    return message ? text(message[0], message[1]) : '';
  });
  const checkTierValue = $derived(bulkRecipeCheckTierSelectValue(draft));

  // The pre-flight hazard, and the ONLY tinted strip this panel spends on the Status axis:
  // its standing sub-hint is a sub-hint precisely so the warning is the one thing tinted.
  // The `enable` term is load-bearing rather than redundant with a zero count — a caller
  // that handed this panel a raw blocked tally would otherwise paint the hazard under
  // `Disable`, where nothing can be refused.
  const showBlockedWarning = $derived(stagedStatus === 'enable' && blockedCount > 0);
  const blockedWarningText = $derived(
    count === 1
      ? text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.BlockedWarningOne',
          "The selected recipe can't be enabled yet and will stay off."
        )
      : format(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.BlockedWarning',
          "At least {count} of {total} selected recipes can't be enabled yet and will stay off.",
          { count: blockedCount, total: count }
        )
  );

  // Tri-state colour maps onto the shipped chip tones, exactly as the Component Studio's
  // tag run does: add is the success family, remove the danger family, leave the neutral
  // one. The trailing glyph reinforces it for anyone who cannot separate the three by hue.
  const BOOK_TONES = { add: 'positive', remove: 'danger', none: 'neutral' };
  const BOOK_ICONS = { add: 'fas fa-plus', remove: 'fas fa-minus', none: 'far fa-circle' };

  function bookState(bookId) {
    if (stagedBookAdd.includes(bookId)) return 'add';
    if (stagedBookRemove.includes(bookId)) return 'remove';
    return 'none';
  }

  function bookLabel(book) {
    return book?.name || book?.id || '';
  }

  // The accessible name OPENS with the visible label and then states the staged ACTION.
  // Opening with the label is WCAG 2.5.3 Label in Name — a speech-input user says what they
  // can read — and the action half is there because `aria-pressed` cannot honestly describe
  // a control with THREE states, so the name has to carry it instead.
  function bookActionLabel(book) {
    const state = bookState(book.id);
    const name = bookLabel(book);
    if (state === 'add') {
      return format(
        'FABRICATE.Admin.Manager.Recipe.BulkEdit.BookChipActionAdd',
        '{book} — add to every selected recipe.',
        { book: name }
      );
    }
    if (state === 'remove') {
      return format(
        'FABRICATE.Admin.Manager.Recipe.BulkEdit.BookChipActionRemove',
        '{book} — remove from every selected recipe.',
        { book: name }
      );
    }
    return format(
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.BookChipActionNone',
      '{book} — leave unchanged.',
      { book: name }
    );
  }

  // Every mutator below REASSIGNS through the caller: the model's helpers return a NEW
  // draft and never mutate their argument.
  function setCategory(value) {
    onDraftChange(setBulkRecipeCategory(draft, value));
  }

  function setStatus(value) {
    onDraftChange(setBulkRecipeStatus(draft, value));
  }

  function setLock(value) {
    onDraftChange(setBulkRecipeLock(draft, value));
  }

  function setCheckTier(value) {
    onDraftChange(setBulkRecipeCheckTier(draft, value));
  }

  function cycleBook(bookId) {
    onDraftChange(cycleBulkRecipeBook(draft, bookId));
  }
</script>

<!--
  The axes are emitted as SIBLING flex items of the shell's panel, not wrapped: the shell's
  uniform `gap` is the panel's rhythm and a wrapper per section would re-space the rail.
  Each section reads label row -> sub-hint -> control, which is the shipped order; a
  conditional Callout goes BELOW its control, where it comments on a staged choice.

  Every hook name is an OVERRIDE. The primitives default to the Component Studio's strings
  so its smoke selectors and view-lab cases kept working through the extraction, so this
  studio must name its own or both browsers would answer to one set of hooks.
-->
<BulkEditPanelShell
  heading={headingLabel}
  {applyLabel}
  {canApply}
  panelAttr="data-recipe-bulk-panel"
  clearAttr="data-recipe-bulk-clear"
  countAttr="data-recipe-bulk-count"
  applyAttr="data-recipe-bulk-apply"
  {onClearSelection}
  {onApply}
>
  <BulkEditSection label={text('FABRICATE.Admin.Manager.Recipe.Category', 'Category')} />
  <!-- The sentinel is FIRST and carries `value=""`, which is the model's `Leave unchanged`. -->
  <BulkEditSelect
    data-recipe-bulk-category=""
    value={draft?.category || ''}
    disabled={inert}
    ariaLabel={text('FABRICATE.Admin.Manager.Recipe.Category', 'Category')}
    onChange={(value) => setCategory(value)}
  >
    <option value="">{leaveUnchangedLabel}</option>
    {#each categoryOptions as category (category)}
      <option value={category}>{getRecipeCategoryLabel(category, localize)}</option>
    {/each}
  </BulkEditSelect>

  <!--
    The standing sub-hint states the RULE; the Callout below the control states the COUNT.
    They share a meaning and deliberately not their words — the shipped essence pair models
    the same split — and this one is worded to still read under `Disable` and `Unchanged`,
    where nothing is being refused but the rule still holds.
  -->
  <BulkEditSection
    label={text('FABRICATE.Admin.Manager.Recipe.Status', 'Status')}
    subhint={text(
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.StatusHint',
      'Enabling is gated by the activation check, so a refused recipe is left switched off.'
    )}
  />
  <!--
    `fill` on both segmented axes: the shipped default is a content-hugging track, which
    would float two small tiles at the left of a rail whose other controls are full-width
    selects. `variant` is deliberately NOT used — these segments are staged INTENTIONS
    rather than outcomes, and tinting `Disable` as a hazard would make an ordinary bulk
    retire read like the genuine one the warning strip below is spending its colour on.
  -->
  <SegmentedControl
    options={statusSegments}
    value={stagedStatus}
    fill={true}
    groupName="recipe-bulk-status"
    ariaLabel={text('FABRICATE.Admin.Manager.Recipe.Status', 'Status')}
    dataAttr="data-recipe-bulk-status"
    optionDataAttr="data-recipe-bulk-status-option"
    onChange={(value) => setStatus(value)}
  />
  {#if showBlockedWarning}
    <Callout
      tone="warning"
      text={blockedWarningText}
      dataAttr="data-recipe-bulk-blocked-warning"
      dataValue={String(blockedCount)}
    />
  {/if}

  <BulkEditSection label={text('FABRICATE.Admin.Manager.BulkEdit.Lock', 'Lock')} />
  <SegmentedControl
    options={lockSegments}
    value={stagedLock}
    fill={true}
    groupName="recipe-bulk-lock"
    ariaLabel={text('FABRICATE.Admin.Manager.BulkEdit.Lock', 'Lock')}
    dataAttr="data-recipe-bulk-lock"
    optionDataAttr="data-recipe-bulk-lock-option"
    onChange={(value) => setLock(value)}
  />

  <!--
    The sub-hint renders ONLY in the available branch. Outside it a progressive system
    would state "The DC these recipes roll against" directly above a Callout saying there
    is no recipe-level check tier at all — two contradicting sentences, one above the other.
  -->
  <BulkEditSection
    label={text('FABRICATE.Admin.Manager.Recipe.CheckTier', 'Check tier')}
    subhint={checkTierAvailable
      ? text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.CheckTierHint',
          "The DC these recipes roll against — not the check's outcome tiers."
        )
      : ''}
  />
  {#if checkTierAvailable}
    <BulkEditSelect
      data-recipe-bulk-check-tier=""
      value={checkTierValue}
      disabled={inert}
      ariaLabel={text('FABRICATE.Admin.Manager.Recipe.CheckTier', 'Check tier')}
      onChange={(value) => setCheckTier(value)}
    >
      <option value={RECIPE_CHECK_TIER_UNCHANGED}>{leaveUnchangedLabel}</option>
      <!-- A REAL instruction, not a second way of saying "leave alone": it clears every
           selected recipe to the system's default DC. -->
      <option value={RECIPE_CHECK_TIER_DEFAULT}
        >{text('FABRICATE.Admin.Manager.Recipe.CheckTierDefault', 'Default DC')}</option
      >
      {#each checkTierOptions as tier (tier.id)}
        <option value={tier.id}
          >{(tier.name || text('FABRICATE.Admin.Manager.Recipe.CheckTierUnnamed', 'Unnamed tier')) +
            ` (DC ${tier.dc})`}</option
        >
      {/each}
    </BulkEditSelect>
  {:else}
    <Callout
      tone="info"
      text={checkTierMessage}
      dataAttr="data-recipe-bulk-check-tier-unavailable"
      dataValue={checkTierReason}
    />
  {/if}

  <BulkEditSection
    label={text('FABRICATE.Admin.Manager.Recipe.BulkEdit.Books', 'Recipe books')}
    hint={text('FABRICATE.Admin.Manager.BulkEdit.TagsHint', 'click to add · again to remove')}
    subhint={books.length === 0
      ? text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.NoBooks',
          'This system defines no recipe books.'
        )
      : ''}
    subhintAttr="data-recipe-bulk-books-empty"
  />
  {#if books.length > 0}
    <!--
      A FLAT run of tri-state chips: the whole book vocabulary and the staged answer for
      every entry are visible at once. `tag` and `type` are load-bearing — `Chip` defaults
      to a `<span>` and defaults no `type`, which would make a tri-state control
      non-focusable and, inside a form, a submit button. The children carry NO internal
      whitespace, because `Chip` records that call sites assert exact `textContent`.
    -->
    <div class="manager-chip-row" data-recipe-bulk-books>
      {#each books as book (book.id)}
        <Chip
          tag="button"
          type="button"
          tone={BOOK_TONES[bookState(book.id)]}
          icon="fas fa-book"
          data-bulk-book={book.id}
          data-bulk-book-state={bookState(book.id)}
          aria-label={bookActionLabel(book)}
          disabled={inert}
          onclick={() => cycleBook(book.id)}
          >{bookLabel(book)}<i class={BOOK_ICONS[bookState(book.id)]} aria-hidden="true"></i></Chip
        >
      {/each}
    </div>
  {/if}
</BulkEditPanelShell>
