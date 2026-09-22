<!--
  The GM recipe browser's BULK EDIT panel. It renders in the shell's `.manager-inspector` column and
  REPLACES `RecipeBrowserInspector` while the selection is non-empty, on the `> 0` threshold
  `ComponentBulkEditPanel` records. It lives under the BROWSER's directory, which
  `scripts/ui-pr-screenshot-evidence.mjs` globs for the `manager-recipes` views, and NOT under
  `recipe/`, which is the EDITOR's and would republish five editor frames and never the browser one.
  See `openspec/specs/ui-visual-style/spec.md` → "Bulk edit panels" for the shared contract.

  Its CHROME is the shared `BulkEditPanelShell` / `BulkEditSection` / `BulkEditSelect` primitives,
  so this panel and the Component Studio's render the same controls rather than two implementations
  of one meaning. What is here is about RECIPES: the category, status, lock, check-tier and book axes.

  THE BOOK AXIS IS A PICKER, NOT A CHIP RUN, and the divergence from the Component Studio is
  maintainer-decided: a chip per book stops being readable at the eight-plus recipe items a real
  system carries, where a tag vocabulary is small and flat by nature. So it is a SEARCH AND PICK
  control over one book at a time, with a STAGED LIST accumulating the answers. The divergence is
  confined to the staged AXIS — the chrome and the staged SHAPE are unchanged, and one book on
  screen is a property of the CONTROL, never of the staged set. Accepted consequence: Edit and
  Duplicate live only in `RecipeBrowserInspector`, so ticking one box hides them until the selection
  clears, with `Clear selection` as the documented escape. Delete is not in that list, because the
  swap was making the one DESTRUCTIVE affordance harder to reach exactly when a GM had selected the
  rows they wanted rid of.

  THE BULK DELETE IS ARMED, AND IT IS PAIRED WITH AN IMPACT STATEMENT. `AGENTS.md` reserves
  `confirmDialog` for bulk actions EXCEPT where the panel states the pending impact in view before
  the control is armed. Do not substitute a `confirmDialog`, and do not remove the impact list and
  leave the arm: the carve-out is the pair, not the button. The impact list is the immediately
  preceding sibling INSIDE the same card, so no scroll position reaches the arm without it. The card
  is the shared `BulkDeleteCard`; what is left here is the four sentences, the standing hint and the
  impact prop.

  THE STANDING HINT IS NOT A COUNT, which is why it always renders. Deleting a recipe is
  irreversible in a way deleting a component is not: an orphan learned entry frees no budget, a
  `total` pool key is unreconstructable once the recipe is gone, and a recreated recipe has a new id
  the spent scroll can no longer teach. A GM reading "will forget" would read it as re-teachable.

  NOTHING IS WRITTEN UNTIL APPLY. Every control stages into a draft the CALLER owns — the manager
  root, because this panel is unmounted the moment the selection empties and a panel-owned draft
  would be destroyed by the transition meant to DISCARD it. The helpers in `recipeBulkEditModel.js`
  are IMMUTABLE, so every mutator reassigns through `onDraftChange`; an in-place call would compile,
  run and silently do nothing.

  THE CHECK-TIER AXIS CARRIES THREE INSTRUCTIONS and the select never collapses two of them:
  `Leave unchanged` omits `checkTierId` from the write, `Default DC` writes `null`, and a named tier
  writes its id. The model owns both sentinels — and records that the single-recipe editor gives
  `''` the OPPOSITE meaning. Where the system carries no recipe-level tier at all, the panel STATES
  which of the six cases it is in place of the control, because a hidden axis reads as a missing
  feature; that is not the same fact as having no usable check, which the row's pill reports.

  THE BLOCKED-ENABLE FORECAST IS A LOWER BOUND, counted from the SAME predicate the row's
  `Can't enable` pill reads, so the pilled and counted rows are one set by construction. It cannot
  see collisions the batch itself creates, so the copy hedges and names the post-apply notification
  as the authority — honestly only while the bound is BELOW the maximum, hence `blockedWarningText`.

  Props: count; categoryOptions (the single-recipe editor's own list, NOT the browser filter's
  `{name, count}` tally, which would make an authored-but-unused category unreachable);
  checkTierAxis; checkTierOptions (the SAME derived the single-recipe editor reads); books (the
  system's AUTHORED definitions, never a vocabulary derived from the books the selection is already
  in, which would hide the empty book that is the commonest Add target); bookMembership
  (`Map<bookId, number>` over the SELECTED recipes, basis-aware — see `countRecipeBookMembership`);
  blockedCount; draft / onDraftChange(next); applying; onClearSelection; onApply; deleting (the
  CALLER's own flag, never derived from `deleteArmed` — see `BulkDeleteCard` for the blur race);
  deleteArmed (the OWNER clears it on any selection change — an arm is about a SPECIFIC set);
  deleteImpact (`adminStore.describeRecipeDelete(...)`, supplied by the owner because none of its
  three numbers is available from the projected rows); deleteOutcome (an OPTIONAL sentence for a
  refused or no-op write); onArmDelete, onDisarmDelete, onDelete(ids).
-->
<script>
  import BulkDeleteCard from '../BulkDeleteCard.svelte';
  import Callout from '../../../components/Callout.svelte';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
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
    bulkRecipeBookOp,
    bulkRecipeCheckTierSelectValue,
    bulkRecipeDraftHasChanges,
    createRecipeBulkDraft,
    setBulkRecipeBookOp,
    setBulkRecipeCategory,
    setBulkRecipeCheckTier,
    setBulkRecipeLock,
    setBulkRecipeStatus,
  } from '../../../../model/recipeBulkEditModel.js';

  let {
    count = 0,
    categoryOptions = [],
    checkTierAxis = { available: false, reason: 'noTiers' },
    checkTierOptions = [],
    books = [],
    bookMembership = new Map(),
    blockedCount = 0,
    draft = createRecipeBulkDraft(),
    applying = false,
    deleting = false,
    deleteArmed = false,
    deleteImpact = null,
    deleteOutcome = '',
    onDraftChange = () => {},
    onClearSelection = () => {},
    onApply = () => {},
    onArmDelete = () => {},
    onDisarmDelete = () => {},
    onDelete = () => {},
  } = $props();

  // Which book the pick card is composing: PANEL-LOCAL VIEW STATE, not a staged edit — it names no
  // instruction and survives no apply. An ID rather than the object, so a republished projection
  // re-resolves through `books` instead of pinning a stale snapshot, and a book that leaves the
  // vocabulary stops resolving and returns the trigger with no effect to clean up after.
  let pickedBookId = $state('');

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

  // Normalized once, so every label reads numbers rather than optional chains and an absent prop
  // renders the disabled zero card instead of `NaN recipes`. `deletable` is NOT `count`: a selected
  // id that no longer resolves is pruned only when the projection republishes, a different moment
  // from the click, and `RecipeManager.deleteRecipe` throws for it.
  const impact = $derived({
    deletable: Number(deleteImpact?.deletable) || 0,
    deletableIds: Array.isArray(deleteImpact?.deletableIds) ? deleteImpact.deletableIds : [],
    recipeItemsAffected: Number(deleteImpact?.recipeItemsAffected) || 0,
    learnersAffected: Number(deleteImpact?.learnersAffected) || 0,
  });

  // The `…One` sibling-key ternary this panel already uses everywhere else, so the impact
  // statement never says "1 recipes will be deleted".
  const deleteLabel = $derived(
    impact.deletable === 1
      ? text('FABRICATE.Admin.Manager.Recipe.BulkEdit.DeleteOne', 'Delete 1 recipe')
      : format('FABRICATE.Admin.Manager.Recipe.BulkEdit.Delete', 'Delete {count} recipes', {
          count: impact.deletable,
        })
  );
  const deleteAriaLabel = $derived(
    impact.deletable === 1
      ? text('FABRICATE.Admin.Manager.Recipe.BulkEdit.DeleteAriaOne', 'Delete 1 recipe')
      : format('FABRICATE.Admin.Manager.Recipe.BulkEdit.DeleteAria', 'Delete {count} recipes', {
          count: impact.deletable,
        })
  );
  // The SUBJECT row carries no `count` and always renders: a card that states nothing has lost
  // the pairing the arm depends on.
  const impactRecipesLabel = $derived(
    impact.deletable === 1
      ? text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.ImpactRecipesOne',
          '1 recipe will be deleted.'
        )
      : format(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.ImpactRecipes',
          '{count} recipes will be deleted.',
          { count: impact.deletable }
        )
  );
  // ONE COUNTABLE NOUN FOR ONE COUNT, ACROSS ALL FOUR SURFACES: the recipe-item figure is named
  // `books & scrolls` on the card, in the armed accessible name, in the completion toast and in the
  // singular delete dialog. `aria-describedby` points AT this list, so a split between the aria and
  // the visible text is a WCAG 2.5.3 smell. The DISPLAY name won rather than the canonical noun
  // because every other item-referring string in the Recipe lang namespace already says it;
  // `recipe item` remains canonical in `openspec/` and in every identifier, as `ui-system-studio`'s
  // Books & Scrolls section requires.
  //
  // THE TWO CONSEQUENCE ROWS CARRY NO PRONOUN FOR THE RECIPES. Branching the pronoun on the ITEM
  // count while it agrees with the RECIPE count rendered "3 recipes will be deleted. 1 book or
  // scroll will lose it."; branching on both would need a 2x2 key matrix per row. Naming the
  // consequence without a pronoun is correct in every combination and keeps one `…One` sibling per
  // row. Both rows are FUTURE and subject-less, because "Removed from 1 book or scroll." under a
  // button nobody has pressed reads as current state, and a stated subject re-opens the matrix.
  const impactItemsLabel = $derived(
    impact.recipeItemsAffected === 1
      ? text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.ImpactItemsOne',
          'Will be removed from 1 book or scroll.'
        )
      : format(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.ImpactItems',
          'Will be removed from {count} books & scrolls.',
          { count: impact.recipeItemsAffected }
        )
  );
  // The qualifier is part of the ROW rather than a separate sentence: the learn slot is spent by
  // the same act the number counts, so a GM who reads the number has read the consequence.
  //
  // NEITHER HALF OF IT MAY AGREE WITH A COUNT THIS ROW DOES NOT BRANCH ON. The row branches on the
  // LEARNER count, and the authored copy carried two words agreeing with other counts — one
  // pronominalizing the RECIPES, one the slots each character spent. The wording here is true at
  // every combination of the three counts.
  const impactLearnersLabel = $derived(
    impact.learnersAffected === 1
      ? text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.ImpactLearnersOne',
          'Will be forgotten by 1 character — spent learn slots are not given back, and a spent book or scroll cannot teach a deleted recipe again.'
        )
      : format(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.ImpactLearners',
          'Will be forgotten by {count} characters — spent learn slots are not given back, and a spent book or scroll cannot teach a deleted recipe again.',
          { count: impact.learnersAffected }
        )
  );
  // WCAG 2.5.3 Label in Name: the accessible name must CONTAIN the visible label, so the armed
  // name OPENS with `Confirm delete` and the counts follow. The idle pair needs no reordering.
  const deleteArmedAriaLabel = $derived(
    format(
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.DeleteConfirmAria',
      'Confirm delete — {count} recipe(s), {items} of your books & scrolls and {learners} character(s) affected. This cannot be undone.',
      {
        count: impact.deletable,
        items: impact.recipeItemsAffected,
        learners: impact.learnersAffected,
      }
    )
  );
  const deleteArmedAnnouncement = $derived(
    format(
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.DeleteArmedAnnouncement',
      'Delete armed. Activate again to delete {count} recipe(s). This cannot be undone.',
      { count: impact.deletable }
    )
  );
  // Three sentences, three questions; the last two are gated on their own count, because
  // "0 books & scrolls will lose them." buries the one number that always matters.
  const deleteImpactRows = $derived([
    { key: 'recipes', text: impactRecipesLabel },
    { key: 'items', text: impactItemsLabel, count: impact.recipeItemsAffected },
    { key: 'learners', text: impactLearnersLabel, count: impact.learnersAffected },
  ]);

  // `Leave unchanged`, shared with the Component Studio's category sentinel. Its neighbour
  // `Unchanged` (the segment word) is deliberately a DIFFERENT string.
  const leaveUnchangedLabel = $derived(
    text('FABRICATE.Admin.Manager.BulkEdit.CategoryUnchanged', 'Leave unchanged')
  );

  /**
   * The category axis as the shared select's option list. The sentinel is FIRST and carries the
   * empty string — the model's `Leave unchanged`, and this axis's only unstaging affordance. The
   * shared control gives that row a non-empty `data-popover-option`, so it is addressable by a
   * capture step and a mounted test rather than being the one row with no handle.
   */
  const categorySelectOptions = $derived([
    { value: '', label: leaveUnchangedLabel },
    ...categoryOptions.map((category) => ({
      value: category,
      label: getRecipeCategoryLabel(category, localize),
    })),
  ]);

  const checkTierInstructionsGroup = $derived(
    text('FABRICATE.Admin.Manager.Recipe.BulkEdit.CheckTierGroupInstructions', 'Instructions')
  );

  const checkTierTiersGroup = $derived(
    text('FABRICATE.Admin.Manager.Recipe.BulkEdit.CheckTierGroupTiers', 'Authored tiers')
  );

  /**
   * The check-tier axis as the shared select's option list, GROUPED and HINTED. THIS IS THE ONE
   * LIST IN THIS PANEL THAT IS NOT A FLAT VOCABULARY, which is why it earns the grouped shape: it
   * mixes two INSTRUCTIONS with the system's authored tiers, and `Default DC` is a real instruction
   * clearing every selected recipe rather than a second way of saying "leave alone".
   *
   * The two instructions carry a `group` of their own, authored FIRST because `Select` derives its
   * bucket order from first appearance, each with its own `hint`. BOTH GROUP VALUES ARE LOCALIZED,
   * because the value IS the heading text — which makes `data-popover-group` locale-dependent, so
   * nothing may key off it and a row's identity handle is `data-popover-option`. `showTick` is TRUE
   * as the caller's judgement: with instructions beside named tiers the label alone does not say
   * which kind is live.
   */
  const checkTierSelectOptions = $derived([
    {
      value: RECIPE_CHECK_TIER_UNCHANGED,
      label: leaveUnchangedLabel,
      hint: text(
        'FABRICATE.Admin.Manager.Recipe.BulkEdit.CheckTierUnchangedHint',
        'Every selected recipe keeps the tier it has.'
      ),
      group: checkTierInstructionsGroup,
    },
    {
      value: RECIPE_CHECK_TIER_DEFAULT,
      label: text('FABRICATE.Admin.Manager.Recipe.CheckTierDefault', 'Default DC'),
      hint: text(
        'FABRICATE.Admin.Manager.Recipe.BulkEdit.CheckTierDefaultHint',
        "Clears every selected recipe to the system's default DC."
      ),
      group: checkTierInstructionsGroup,
    },
    ...checkTierOptions.map((tier) => ({
      value: tier.id,
      label: `${tier.name || text('FABRICATE.Admin.Manager.Recipe.CheckTierUnnamed', 'Unnamed tier')} (DC ${tier.dc})`,
      group: checkTierTiersGroup,
    })),
  ]);

  // The section heading and the staged list's accessible name, so both read as one string.
  // `recipe item` remains the canonical spec noun; this is the display name the rail already uses.
  const booksLabel = $derived(
    text('FABRICATE.Admin.Manager.Recipe.BulkEdit.Books', 'Books & scrolls')
  );

  // Two segmented axes, one control with different words, so the table is data. `disabled` rides
  // the option rather than a class: `SegmentedControl.select()` guards only `next !== value`.
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

  // Six cases keyed by the model's own `reason`, as a table rather than an `{:else if}` chain, so
  // a new reason with no message renders an empty strip instead of the wrong one.
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
    noCheck: [
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.CheckTierNoCheck',
      'This system rolls no crafting check, so there are no check tiers to assign. Give it a check under Checks if you want recipes to carry a difficulty.',
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

  // The pre-flight hazard, and the ONLY tinted strip the Status axis spends. The `enable` term is
  // load-bearing rather than redundant with a zero count: a raw blocked tally would otherwise paint
  // the hazard under `Disable`, where nothing can be refused.
  const showBlockedWarning = $derived(stagedStatus === 'enable' && blockedCount > 0);

  // THREE branches, because "at least {n} of {total}" is only honest while `n < total`; at the
  // maximum — three drafts, staging Enable — it reads as a copy bug rather than a hedge.
  //
  //  - one selected recipe        exact: a batch of one has no intra-batch collision;
  //  - every selected one blocked exact: the bound is already the maximum;
  //  - otherwise                  a genuine lower bound, naming the post-apply report as the
  //                               authority, which turns the hedge into a promise.
  const blockedWarningText = $derived.by(() => {
    if (count === 1) {
      return text(
        'FABRICATE.Admin.Manager.Recipe.BulkEdit.BlockedWarningOne',
        "The selected recipe can't be enabled yet and will stay off."
      );
    }
    if (blockedCount >= count) {
      return format(
        'FABRICATE.Admin.Manager.Recipe.BulkEdit.BlockedWarningAll',
        'None of the {count} selected recipes can be enabled yet — they will all stay off.',
        { count }
      );
    }
    return format(
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.BlockedWarning',
      "At least {count} of {total} selected recipes can't be enabled yet and will stay off — " +
        'applying reports the exact number.',
      { count: blockedCount, total: count }
    );
  });

  // ── The book axis ────────────────────────────────────────────────────────────────

  // `books` is the PROJECTION, which emits `resolvedName` and never a bare `name`, in BOTH
  // publishes the panel can render against — so a `name`-first chain falls through to the id and
  // paints `sm-book` where the GM wrote "Forgecraft Folio". The chain is
  // `CraftingSystemManagerRoot.recipeItemSourceSnapshot`'s, with `id` as a last resort because an
  // unnamed option is neither readable nor nameable by speech input.
  function bookLabel(book) {
    return book?.resolvedName || book?.name || book?.id || '';
  }

  // How many of the SELECTED recipes this book holds, from the caller's basis-aware map and NEVER
  // from `book.recipeIds`: while the membership-basis marker is unset, membership resolves through
  // the legacy scalar and a book holding every selected recipe still carries an EMPTY `recipeIds`,
  // which would disable Remove on exactly the worlds that most need this axis. Clamped to the
  // selection size, so a stale map cannot render "holds 5 of 3 selected".
  function holdsCount(bookId) {
    return Math.min(Number(bookMembership?.get?.(bookId)) || 0, count);
  }

  // The `kind` half of an option's second line. `Incomplete` is deliberately NOT surfaced: the
  // synchronous publish emits it for EVERY book unconditionally, so it is untrue one publish in
  // two, and it names a validation state rather than a kind — on the commonest Add target there is.
  function bookKind(book) {
    const type = String(book?.derivedType || '');
    if (type === 'Book') {
      return text('FABRICATE.Admin.Manager.Recipe.BulkEdit.BookKindBook', 'Recipe book');
    }
    if (type === 'Scroll') {
      return text('FABRICATE.Admin.Manager.Recipe.BulkEdit.BookKindScroll', 'Scroll');
    }
    return text('FABRICATE.Admin.Manager.Recipe.BulkEdit.BookKindItem', 'Recipe item');
  }

  // Three whole sentences rather than one with an interchangeable number: the two extremes are
  // what the GM acts on, and "holds 0 of 12" reads as a broken template.
  function bookHolds(bookId) {
    const holds = holdsCount(bookId);
    if (holds === 0) {
      return format(
        'FABRICATE.Admin.Manager.Recipe.BulkEdit.BookHoldsNone',
        'holds none of the {total} selected',
        { total: count }
      );
    }
    if (holds >= count) {
      return format(
        'FABRICATE.Admin.Manager.Recipe.BulkEdit.BookHoldsAll',
        'holds all {total} selected',
        {
          total: count,
        }
      );
    }
    return format(
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.BookHoldsSome',
      'holds {count} of {total} selected',
      { count: holds, total: count }
    );
  }

  function bookMeta(book) {
    return format('FABRICATE.Admin.Manager.Recipe.BulkEdit.BookMeta', '{kind} · {holds}', {
      kind: bookKind(book),
      holds: bookHolds(book?.id),
    });
  }

  const addWord = $derived(text('FABRICATE.Admin.Manager.Recipe.BulkEdit.BookOpAdd', 'Add'));
  const removeWord = $derived(
    text('FABRICATE.Admin.Manager.Recipe.BulkEdit.BookOpRemove', 'Remove')
  );

  function opWord(op) {
    return op === 'add' ? addWord : removeWord;
  }

  // The whole authored vocabulary, every time: `SearchablePopover` lists all of it while the term
  // is empty, correcting the prototype, whose list is empty until the GM types. Nothing is capped
  // either — the option list SCROLLS, so a cap would re-create the unreachable-Add-target defect.
  const bookOptions = $derived(
    books.map((book) => {
      const op = bulkRecipeBookOp(draft, book.id);
      return {
        id: book.id,
        dataId: book.id,
        label: bookLabel(book),
        img: book.resolvedImg || '',
        icon: 'fas fa-book',
        meta: bookMeta(book),
        // An already-staged book says so in the list, so re-picking one is a deliberate
        // revision rather than a blind overwrite.
        trailing: op === 'none' ? '' : opWord(op),
      };
    })
  );

  // The pick resolves through `books` on every read, so it self-heals: a book that leaves
  // the vocabulary simply returns the trigger.
  const pickedBook = $derived(books.find((book) => book.id === pickedBookId) || null);
  const pickedHolds = $derived(pickedBook ? holdsCount(pickedBook.id) : 0);
  const pickedMissing = $derived(pickedBook ? count - pickedHolds : 0);

  // Labelled with the count actually AFFECTED, not the selection size: the prototype names the
  // whole selection while deriving `disabled` from the missing/present counts, so its label and its
  // write disagree. At zero the count is dropped, since `Add 0` states a quantity where the honest
  // statement is that there is nothing to do.
  function opButtonLabel(op, affected) {
    if (affected === 0) return opWord(op);
    if (op === 'add') {
      return format('FABRICATE.Admin.Manager.Recipe.BulkEdit.BookAdd', 'Add {count}', {
        count: affected,
      });
    }
    return format('FABRICATE.Admin.Manager.Recipe.BulkEdit.BookRemove', 'Remove {count}', {
      count: affected,
    });
  }

  // The name OPENS with the visible label, per WCAG 2.5.3 Label in Name. No `aria-pressed`: these
  // are one-shot actions, and the staged list below is what reports and undoes the result.
  function opActionLabel(op, affected, book) {
    const name = bookLabel(book);
    if (op === 'add') {
      if (affected === 0) {
        return format(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.BookAddNone',
          'Add — every selected recipe already has {book}.',
          { book: name }
        );
      }
      return format(
        'FABRICATE.Admin.Manager.Recipe.BulkEdit.BookAddAction',
        'Add {count} — add {book} to every selected recipe that is missing it.',
        { count: affected, book: name }
      );
    }
    if (affected === 0) {
      return format(
        'FABRICATE.Admin.Manager.Recipe.BulkEdit.BookRemoveNone',
        'Remove — no selected recipe has {book}.',
        { book: name }
      );
    }
    return format(
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.BookRemoveAction',
      'Remove {count} — remove {book} from every selected recipe that has it.',
      { count: affected, book: name }
    );
  }

  // THE STAGED LIST, which the prototype computes and never renders — leaving a one-book-at-a-time
  // control with no record of what the other books were told to do. It is the confirmation, the
  // undo, and the only surface a mixed add/remove draft can be read on. Sorted by name, so it is
  // stable under re-staging rather than ordered by which book the GM picked first.
  const stagedBooks = $derived.by(() =>
    books
      .filter((book) => bulkRecipeBookOp(draft, book.id) !== 'none')
      .map((book) => {
        const op = bulkRecipeBookOp(draft, book.id);
        const holds = holdsCount(book.id);
        const affected = op === 'add' ? count - holds : holds;
        return {
          id: book.id,
          op,
          name: bookLabel(book),
          opLabel: opWord(op),
          icon: op === 'add' ? 'fas fa-plus' : 'fas fa-minus',
          // "no change" is reachable — Add on a book that already holds every selected recipe —
          // and this is the only warning before Apply reports nothing happened.
          countLabel: stagedCountLabel(affected),
          unstageLabel: format(
            'FABRICATE.Admin.Manager.Recipe.BulkEdit.BookUnstage',
            '{book} — leave this book unchanged.',
            { book: bookLabel(book) }
          ),
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name))
  );

  function stagedCountLabel(affected) {
    if (affected === 0) {
      return text('FABRICATE.Admin.Manager.Recipe.BulkEdit.BookStagedNoChange', 'no change');
    }
    if (affected === 1) {
      return text('FABRICATE.Admin.Manager.Recipe.BulkEdit.BookStagedRecipesOne', '1 recipe');
    }
    return format('FABRICATE.Admin.Manager.Recipe.BulkEdit.BookStagedRecipes', '{count} recipes', {
      count: affected,
    });
  }

  const booksHint = $derived.by(() => {
    if (stagedBooks.length === 1) {
      return text('FABRICATE.Admin.Manager.Recipe.BulkEdit.BooksStagedHintOne', '1 change staged');
    }
    if (stagedBooks.length > 1) {
      return format(
        'FABRICATE.Admin.Manager.Recipe.BulkEdit.BooksStagedHint',
        '{count} changes staged',
        { count: stagedBooks.length }
      );
    }
    return text(
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.BooksHint',
      'Pick one, then add it where missing or remove it where present'
    );
  });

  const bookSearchPlaceholder = $derived(
    books.length === 1
      ? text('FABRICATE.Admin.Manager.Recipe.BulkEdit.BookSearchOne', 'Search 1 book or scroll…')
      : format(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.BookSearch',
          'Search {count} books & scrolls…',
          { count: books.length }
        )
  );

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

  // FOCUS ACROSS A DESTRUCTIVE RE-RENDER. Every gesture on this axis destroys the control holding
  // focus — choosing unmounts the popover, Add/Remove/clear replace the card with the trigger, and
  // unstaging removes its own row — and a destroyed node's focus falls to `document.body`, so a
  // keyboard-only GM staging three books would tab in from the top of the Foundry document six
  // extra times. The retired chip run cycled IN PLACE and kept focus, so leaving this unhandled
  // would undercut the property the redesign exists to improve.
  //
  // `SearchablePopover.close()` owns the same idiom, and its own restore correctly DECLINES here:
  // `onChoose` writes `pickedBookId` first, so by the time it runs its trigger is unmounted and
  // nothing took its place. These helpers are what takes its place, copying that idiom exactly —
  // `queueMicrotask` plus an optional-chained, connection-guarded `focus()`, which works because
  // the state write scheduling the re-render happens BEFORE the call.
  //
  // The target is found by QUERY rather than a binding, because the node did not exist when the
  // gesture started. The query is anchored on this panel's own hook, declared ONCE here and handed
  // to the shell, so the anchor and the rendered hook cannot drift apart.
  const PANEL_ATTR = 'data-recipe-bulk-panel';
  const PANEL_HOOK = `[${PANEL_ATTR}]`;
  const BOOK_TRIGGER = '.fab-bulk-book-trigger';

  // First candidate that exists, is attached and is not disabled; otherwise focus is left where it
  // is rather than parked on an inert control.
  function focusAfterRerender(selectors) {
    queueMicrotask(() => {
      if (typeof document === 'undefined') return;
      for (const selector of selectors) {
        const node = document.querySelector(`${PANEL_HOOK} ${selector}`);
        if (!node || node.isConnected === false || node.disabled === true) continue;
        node.focus?.();
        return;
      }
    });
  }

  // The picker has closed with focus inside it: land on the action the GM opened it to press.
  function pickBook(bookId) {
    pickedBookId = bookId;
    focusAfterRerender([
      '[data-recipe-bulk-book-add]',
      '[data-recipe-bulk-book-remove]',
      '[data-recipe-bulk-book-clear-pick]',
    ]);
  }

  function clearPick() {
    pickedBookId = '';
    focusAfterRerender([BOOK_TRIGGER]);
  }

  // Staging CLEARS the pick, the one place this control departs from the prototype's BEHAVIOUR
  // rather than its defects: keeping the book picked leaves two surfaces claiming authority over
  // one fact and costs an extra dismissal per book. With the staged list rendered, the row IS the
  // confirmation and carries the undo, so the pick card is a transient composer. Focus follows the
  // gesture to that row's undo, with the trigger as the fallback when no row renders.
  function stageBook(op) {
    if (!pickedBook) return;
    const bookId = pickedBook.id;
    onDraftChange(setBulkRecipeBookOp(draft, bookId, op));
    pickedBookId = '';
    focusAfterRerender([`[data-recipe-bulk-book-unstage="${bookId}"]`, BOOK_TRIGGER]);
  }

  // Read BEFORE the mutation, because afterwards this row and its position are gone: the row that
  // takes its place, then the row above when it was last, then the trigger once the list empties.
  function unstageBook(bookId) {
    const order = stagedBooks.map((entry) => entry.id);
    const index = order.indexOf(bookId);
    const neighbour = index < 0 ? '' : (order[index + 1] ?? order[index - 1] ?? '');
    onDraftChange(setBulkRecipeBookOp(draft, bookId, 'none'));
    focusAfterRerender(
      neighbour ? [`[data-recipe-bulk-book-unstage="${neighbour}"]`, BOOK_TRIGGER] : [BOOK_TRIGGER]
    );
  }
</script>

<!--
  The axes are SIBLING flex items of the shell's panel, not wrapped: the shell's uniform `gap` is
  the rhythm and a wrapper per section would re-space the rail. Each section reads label row →
  sub-hint → control, and a conditional Callout goes BELOW its control. Every hook name is an
  OVERRIDE, because the primitives default to the Component Studio's strings.
-->
<BulkEditPanelShell
  heading={headingLabel}
  {applyLabel}
  {canApply}
  panelAttr={PANEL_ATTR}
  clearAttr="data-recipe-bulk-clear"
  countAttr="data-recipe-bulk-count"
  applyAttr="data-recipe-bulk-apply"
  {onClearSelection}
  {onApply}
>
  <BulkEditSection label={text('FABRICATE.Admin.Manager.Recipe.Category', 'Category')} />
  <!-- `showTick={false}`: the trigger states the staged category, and a tick beside a flat run
       of vocabulary names would mark what the control already says. -->
  <BulkEditSelect
    data-recipe-bulk-category=""
    value={draft?.category || ''}
    options={categorySelectOptions}
    showTick={false}
    disabled={inert}
    ariaLabel={text('FABRICATE.Admin.Manager.Recipe.Category', 'Category')}
    onChange={(value) => setCategory(value)}
  />

  <!-- The standing sub-hint states the RULE and the Callout below the control states the COUNT,
       deliberately not in the same words; this one still reads under `Disable` and `Unchanged`. -->
  <BulkEditSection
    label={text('FABRICATE.Admin.Manager.Recipe.Status', 'Status')}
    subhint={text(
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.StatusHint',
      'Enabling is gated by the activation check, so a refused recipe is left switched off.'
    )}
  />
  <!-- `fill` on both segmented axes, because the content-hugging default would float two small
       tiles beside full-width selects. `variant` is deliberately NOT used: these segments are
       staged INTENTIONS, and tinting `Disable` would spend the colour the warning strip needs. -->
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

  <!-- ONLY in the available branch: outside it the sub-hint would sit directly above a Callout
       saying there is no recipe-level check tier at all. -->
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
    <!-- GROUPED, HINTED AND TICKED: two rows are INSTRUCTIONS and the rest are authored tiers.
         `checkTierSelectOptions` carries the reasoning. -->
    <BulkEditSelect
      data-recipe-bulk-check-tier=""
      value={checkTierValue}
      options={checkTierSelectOptions}
      showTick={true}
      disabled={inert}
      ariaLabel={text('FABRICATE.Admin.Manager.Recipe.CheckTier', 'Check tier')}
      onChange={(value) => setCheckTier(value)}
    />
  {:else}
    <!-- INFO stands: it reports why THIS selection has no tier to set, which is live state. -->
    <Callout
      tone="info"
      text={checkTierMessage}
      dataAttr="data-recipe-bulk-check-tier-unavailable"
      dataValue={checkTierReason}
    />
  {/if}

  <!-- The label row's hint swaps to a running tally once anything is staged, so the heading itself
       reports the accumulating draft. -->
  <BulkEditSection
    label={booksLabel}
    hint={booksHint}
    subhint={books.length === 0
      ? text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.NoBooks',
          'This system defines no books or scrolls.'
        )
      : ''}
    subhintAttr="data-recipe-bulk-books-empty"
  />
  {#if books.length > 0}
    {#if pickedBook}
      <!-- The PICK CARD: one book, its membership, and the two instructions about it. It REPLACES
           the trigger, because showing both would put two book-shaped controls in a 300px rail. -->
      <div class="fab-bulk-book-pick" data-recipe-bulk-book-pick={pickedBook.id}>
        <div class="fab-bulk-book-pick-head">
          <span class="fab-bulk-book-pick-art" aria-hidden="true">
            {#if pickedBook.resolvedImg}
              <img src={pickedBook.resolvedImg} alt="" />
            {:else}
              <i class="fas fa-book"></i>
            {/if}
          </span>
          <span class="fab-bulk-book-pick-copy">
            <strong class="fab-bulk-book-pick-name">{bookLabel(pickedBook)}</strong>
            <span class="fab-bulk-book-pick-meta">{bookMeta(pickedBook)}</span>
          </span>
          <button
            type="button"
            class="fab-bulk-book-pick-clear"
            data-recipe-bulk-book-clear-pick
            aria-label={text(
              'FABRICATE.Admin.Manager.Recipe.BulkEdit.BookClearPick',
              'Clear the picked book or scroll'
            )}
            disabled={inert}
            onclick={() => clearPick()}
          >
            <i class="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
        <!-- Two REAL buttons, each disabled when its own count is zero. The counts are the
             AFFECTED ones, so the label and the write agree. -->
        <div class="fab-bulk-book-pick-actions">
          <button
            type="button"
            class="fab-bulk-book-op is-add"
            data-recipe-bulk-book-add
            aria-label={opActionLabel('add', pickedMissing, pickedBook)}
            disabled={inert || pickedMissing === 0}
            onclick={() => stageBook('add')}
          >
            <i class="fas fa-plus" aria-hidden="true"></i>{opButtonLabel('add', pickedMissing)}
          </button>
          <button
            type="button"
            class="fab-bulk-book-op is-remove"
            data-recipe-bulk-book-remove
            aria-label={opActionLabel('remove', pickedHolds, pickedBook)}
            disabled={inert || pickedHolds === 0}
            onclick={() => stageBook('remove')}
          >
            <i class="fas fa-minus" aria-hidden="true"></i>{opButtonLabel('remove', pickedHolds)}
          </button>
        </div>
      </div>
    {:else}
      <!-- The shipped `SearchablePopover`, not a hand-rolled search field: it owns the input, the
           rows, outside-click and Escape dismissal, focus restoration on a DISMISSAL, and a portal
           past the panel's `overflow: hidden`, and its list SCROLLS. Restoration on a CHOICE is
           this component's, because choosing replaces the trigger and the popover's guard correctly
           declines — see `focusAfterRerender` above. -->
      <SearchablePopover
        options={bookOptions}
        disabled={inert}
        pickerClass="fab-bulk-book-picker"
        triggerClass="fabricate-button manager-button manager-travel-picker-trigger fab-bulk-book-trigger"
        triggerIcon="fas fa-magnifying-glass"
        triggerLabel={text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.BookPick',
          'Pick a book or scroll'
        )}
        triggerAriaLabel={text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.BookPick',
          'Pick a book or scroll'
        )}
        dialogAriaLabel={booksLabel}
        searchPlaceholder={bookSearchPlaceholder}
        searchAriaLabel={bookSearchPlaceholder}
        emptyHint={text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.BookNoMatch',
          'No book or scroll by that name.'
        )}
        onChoose={(id) => pickBook(id)}
      />
    {/if}
    {#if stagedBooks.length > 0}
      <!-- A LIST rather than a chip row: rows of record, each carrying an operation, an affected
           count and its own undo, read down the rail rather than scanned across it. -->
      <ul class="fab-bulk-book-staged" aria-label={booksLabel} data-recipe-bulk-books-staged>
        {#each stagedBooks as entry (entry.id)}
          <li
            class={`fab-bulk-book-staged-row is-${entry.op}`}
            data-bulk-book={entry.id}
            data-bulk-book-state={entry.op}
          >
            <span class="fab-bulk-book-staged-op">
              <i class={entry.icon} aria-hidden="true"></i>{entry.opLabel}
            </span>
            <span class="fab-bulk-book-staged-copy">
              <span class="fab-bulk-book-staged-name">{entry.name}</span>
              <span class="fab-bulk-book-staged-count">{entry.countLabel}</span>
            </span>
            <button
              type="button"
              class="fab-bulk-book-unstage"
              data-recipe-bulk-book-unstage={entry.id}
              aria-label={entry.unstageLabel}
              disabled={inert}
              onclick={() => unstageBook(entry.id)}
            >
              <i class="fas fa-xmark" aria-hidden="true"></i>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</BulkEditPanelShell>

<!--
  The DELETE block sits BELOW the shell: the shell's Apply is the panel's primary action, and a
  destructive action in the same card would read as a second way of applying the staged edit. The
  accepted consequence is that Apply's sticky dock clamps to the panel's own box — see
  `BulkEditPanelShell`'s dock comment and `tests/components/bulk-edit-dock-pinning.test.js`.

  `busy` is the caller's own `deleting` flag and is NOT folded into `disabled`, because the card
  must tell an in-flight write from an inert one to render its third face. `applying` still inerts
  the control, since a staged apply and a delete must not race.
-->
<BulkDeleteCard
  token="delete-recipes"
  heading={text('FABRICATE.Admin.Manager.Recipe.BulkEdit.DeleteHeading', 'Delete selected recipes')}
  rows={deleteImpactRows}
  standingHint={text(
    'FABRICATE.Admin.Manager.Recipe.BulkEdit.DeleteStandingHint',
    'Deleting is permanent. A recipe you recreate is a new recipe.'
  )}
  idleLabel={deleteLabel}
  armedLabel={text('FABRICATE.Admin.Manager.Recipe.BulkEdit.DeleteConfirm', 'Confirm delete')}
  busyLabel={text('FABRICATE.Admin.Manager.BulkEdit.Deleting', 'Deleting…')}
  idleAriaLabel={deleteAriaLabel}
  armedAriaLabel={deleteArmedAriaLabel}
  armedAnnouncement={deleteArmedAnnouncement}
  disarmedAnnouncement={text(
    'FABRICATE.Admin.Manager.BulkEdit.DeleteCancelled',
    'Delete cancelled. Nothing was deleted.'
  )}
  outcomeAnnouncement={deleteOutcome}
  armed={deleteArmed === true}
  busy={deleting === true}
  disabled={impact.deletable === 0 || applying === true}
  cardAttr="data-recipe-bulk-delete-card"
  impactAttr="data-recipe-bulk-impact"
  rowAttr="data-recipe-bulk-impact-row"
  announceAttr="data-recipe-bulk-delete-announce"
  onArm={onArmDelete}
  onDisarm={onDisarmDelete}
  onConfirm={() => onDelete(impact.deletableIds)}
/>

<style>
  /* THEME-ROOT tokens only: a scoped `<style>` may not reach an area-scoped `--fab-manager-*`
     property from any directory (`openspec/specs/design-system/spec.md`, "The token namespace is
     one generation and names its purpose"). It sits here rather than in `styles/fabricate.css` so
     `scripts/ui-pr-screenshot-evidence.mjs` routes a change to the views that render it. */

  /* ── The pick card ─────────────────────────────────────────────────────────────── */
  .fab-bulk-book-pick {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-accent);
    border-radius: 8px;
    background: var(--fab-bg-1);
  }

  .fab-bulk-book-pick-head {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .fab-bulk-book-pick-art {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    overflow: hidden;
    border-radius: 6px;
    background: var(--fab-surface-raised);
    color: var(--fab-accent);
    font-size: 0.68rem;
  }

  .fab-bulk-book-pick-art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .fab-bulk-book-pick-copy {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
  }

  .fab-bulk-book-pick-name {
    min-width: 0;
    overflow: hidden;
    color: var(--fab-text);
    font-size: 0.82rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fab-bulk-book-pick-meta {
    min-width: 0;
    overflow: hidden;
    color: var(--fab-text-muted);
    font-size: 0.62rem;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Foundry's global `button` rule centres content and pins a height, so every button here
     restates both (see the CSS override map in `CONTRIBUTING.md`). */
  .fab-bulk-book-pick-clear,
  .fab-bulk-book-unstage {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--fab-text-muted);
    font-size: 0.68rem;
    cursor: pointer;
  }

  .fab-bulk-book-pick-clear:hover:not(:disabled),
  .fab-bulk-book-unstage:hover:not(:disabled) {
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }

  .fab-bulk-book-pick-actions {
    display: flex;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  .fab-bulk-book-op {
    display: flex;
    flex: 1 1 0;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-1);
    height: auto;
    min-height: 30px;
    padding: 0 var(--fab-space-2);
    border: 1px solid var(--fab-border-strong);
    border-radius: 6px;
    background: var(--fab-surface-raised);
    color: var(--fab-text);
    font-size: 0.68rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }

  .fab-bulk-book-op.is-add:hover:not(:disabled) {
    border-color: var(--fab-success-border);
    color: var(--fab-success-text);
  }

  .fab-bulk-book-op.is-remove:hover:not(:disabled) {
    border-color: var(--fab-danger-border);
    color: var(--fab-danger-text);
  }

  /* These controls carry the real `disabled` attribute and the styling hangs off it rather than
     off `.is-disabled`, so a dimmed control is inert by construction. */
  .fab-bulk-book-op:disabled,
  .fab-bulk-book-pick-clear:disabled,
  .fab-bulk-book-unstage:disabled {
    border-color: var(--fab-border);
    background: transparent;
    color: var(--fab-text-muted);
    opacity: 0.55;
    cursor: default;
  }

  /* ── The staged list ───────────────────────────────────────────────────────────── */
  .fab-bulk-book-staged {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .fab-bulk-book-staged-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
    padding: var(--fab-space-1) var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 6px;
  }

  .fab-bulk-book-staged-op {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--fab-space-2xs);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .fab-bulk-book-staged-row.is-add {
    border-color: var(--fab-success-border);
  }

  .fab-bulk-book-staged-row.is-add .fab-bulk-book-staged-op {
    color: var(--fab-success-text);
  }

  .fab-bulk-book-staged-row.is-remove {
    border-color: var(--fab-danger-border);
  }

  .fab-bulk-book-staged-row.is-remove .fab-bulk-book-staged-op {
    color: var(--fab-danger-text);
  }

  .fab-bulk-book-staged-copy {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
  }

  .fab-bulk-book-staged-name {
    min-width: 0;
    overflow: hidden;
    color: var(--fab-text);
    font-size: 0.68rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fab-bulk-book-staged-count {
    color: var(--fab-text-muted);
    font-size: 0.58rem;
    line-height: 1.3;
  }
</style>
