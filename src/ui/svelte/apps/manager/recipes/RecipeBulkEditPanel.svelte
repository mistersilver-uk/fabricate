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

  ── THE BOOK AXIS IS A PICKER, NOT A CHIP RUN ─────────────────────────────────────
  The Component Studio stages its many-valued axis (tags) as a flat run of tri-state chips.
  This one deliberately does not, and the divergence is maintainer-decided (issue 1010): a
  chip per book stops being readable at the eight-plus recipe items a real system carries,
  where a system's tag vocabulary is small and flat by nature. So the axis is a SEARCH AND
  PICK control — trigger, searchable option list, pick card with Add and Remove — over one
  book at a time, with a STAGED LIST below it accumulating the answers.

  The divergence is confined to the staged AXIS. The chrome above stays common, and so does
  the staged SHAPE: `bookAdd[]` / `bookRemove[]`, `toBulkRecipeEdit`'s `addBookIds` /
  `removeBookIds`, and the write primitive's books-not-recipes iteration are all unchanged.
  One book on screen is a property of the CONTROL, never of the staged set.

  Consequence, accepted and recorded: Edit and Duplicate live ONLY in
  `RecipeBrowserInspector`, so ticking one box hides them until the selection clears.
  `Clear selection` is the documented escape and is the first control in the header. DELETE
  is no longer in that list — issue 1132 gave the panel its own set delete, because the swap
  was making the one DESTRUCTIVE affordance harder to reach at exactly the moment a GM had
  selected the rows they wanted rid of. Edit and Duplicate stay out: neither is destructive,
  and neither has an impact worth stating, which is what the arm below is paired with.

  ── THE BULK DELETE IS ARMED, AND IT IS PAIRED WITH AN IMPACT STATEMENT ───────────
  `AGENTS.md` reserves `confirmDialog` for bulk actions EXCEPT where the panel states the
  impact of the pending action in view before the control is armed. This card does, so it
  arms. Do not substitute a `confirmDialog`, and do not remove the impact list and leave the
  arm — the carve-out is the pair, not the button. Measured at the shipped 1280x940 the whole
  card is in the first visible state with rail to spare, and on a short rail the impact list
  is the immediately preceding sibling of the control INSIDE the same card, so no scroll
  position exists in which the arm is reachable and the statement is not on screen.

  The card is the shared `BulkDeleteCard` primitive, which is where the pairing, the
  description association, the live region, the zero-row gate, the busy face and the scoped
  CSS live. The `data-recipe-bulk-*` hook names follow this panel's existing convention as
  `*Attr` overrides. What is left here is what is about RECIPES: the four sentences, the
  standing hint, and the impact prop.

  THE STANDING HINT IS NOT A COUNT, and that is why it is always rendered. Deleting a recipe
  is irreversible in a way deleting a component is not: `cleanupLearnedRecipes` forgets with
  `freeLearnBudget: false`, and an orphan entry frees nothing regardless, because a `total`
  pool key is unreconstructable once the recipe is gone. A character who learned from a
  scroll loses the knowledge AND the spent slot, and a recreated recipe has a new id that the
  spent scroll can no longer teach. A GM reading "will forget" has every reason to read it as
  re-teachable.

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
  which of the six cases it is, in place of the control, rather than hiding the section —
  a hidden axis reads as a missing feature. That is not the same fact as the system having
  no usable check at all, which the row's own `No check` pill already reports.

  ── THE BLOCKED-ENABLE FORECAST IS A LOWER BOUND ──────────────────────────────────
  `blockedCount` is counted from the SAME predicate the row's `Can't enable` pill reads, so
  the pilled rows and the counted rows are one set by construction. It cannot see collisions
  the batch itself creates, so the copy says "At least" and names the post-apply notification
  as the authority for the exact number. The bound is only honest while it is BELOW the
  maximum, so the copy has three branches — see `blockedWarningText`.

  Props:
   - count: how many recipes the apply will write to.
   - categoryOptions: the system's effective recipe categories, as plain names — the
     single-recipe editor's own list, NOT the browser filter's `{name, count}` tally: a
     count of the recipes currently IN a category says nothing about it as an assignment
     target, and an in-use-only list would make an authored-but-unused category unreachable.
   - checkTierAxis: `describeRecipeCheckTierAxis(...)` output, `{available, reason}`.
   - checkTierOptions: the system's authored `{id, name, dc}` tiers, from the SAME derived
     the single-recipe editor's dropdown reads.
   - books: the system's AUTHORED recipe-item definitions — `selectedSystem.recipeItemDefinitions`
     — never a vocabulary derived from the books the selected recipes are already in. A book
     holding zero recipes would be invisible to the latter, and it is unreachable as an Add
     target exactly when it is the commonest reason to open this control.
   - bookMembership: `Map<bookId, number>` — how many of the SELECTED recipes each book
     holds. Derived by the caller from the projected rows' `recipeItemIds`, which is
     basis-aware; see `countRecipeBookMembership` for why a count read off
     `definition.recipeIds` would be wrong on every legacy-basis world.
   - blockedCount: how many selected recipes activation would currently refuse.
   - draft / onDraftChange(next): the staged edit, owned by the caller.
   - applying: an in-flight apply; the panel goes inert rather than double-writing.
   - onClearSelection() / onApply().
   - deleting: an in-flight delete; the card renders its busy face. It is the CALLER's own
     flag and never derived from `deleteArmed` — see `BulkDeleteCard` for the blur race.
   - deleteArmed: whether the set delete holds its armed token. The OWNER clears it on any
     change to the selection — an arm is a statement about a SPECIFIC set.
   - deleteImpact: `adminStore.describeRecipeDelete(...)` output, supplied by the owner
     rather than derived here. None of its three numbers is available from the projected
     rows: the learner count needs actor flags and the recipe-item count needs the system's
     definitions with its membership basis.
   - deleteOutcome: an OPTIONAL sentence announcing what a finished delete did when it left
     this card mounted — a refused or no-op write, in practice. The owner sets it and clears
     it on the next arm; the card announces it through its live region and puts focus back on
     the control the confirm's own `disabled` moved to `document.body`.
   - onArmDelete() / onDisarmDelete() / onDelete(ids).
-->
<script>
  import BulkDeleteCard from '../BulkDeleteCard.svelte';
  import Callout from '../Callout.svelte';
  import SearchablePopover from '../SearchablePopover.svelte';
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
    bulkRecipeBookOp,
    bulkRecipeCheckTierSelectValue,
    bulkRecipeDraftHasChanges,
    createRecipeBulkDraft,
    setBulkRecipeBookOp,
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

  // Which book the pick card is composing. PANEL-LOCAL VIEW STATE, not a staged edit: it
  // names no instruction, survives no apply, and belongs in the draft as little as a
  // scroll position does. The draft it composes into is still the caller's.
  //
  // It is an ID rather than the object, so a republished projection (phase 2 resolves each
  // book's real name and art) re-resolves through `books` instead of pinning a stale
  // snapshot — and a book that leaves the vocabulary simply stops resolving, which returns
  // the trigger without an effect to clean up after it.
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

  // ── The set delete (issue 1132) ──────────────────────────────────────────────────
  // Normalized once so every label below reads numbers rather than optional chains, and so
  // an absent prop renders the disabled zero card instead of `NaN recipes`.
  //
  // `deletable` is NOT `count`. A selected id that no longer resolves in the recipe map is
  // pruned from the browser's selection only when the projection republishes — a different
  // moment from the click — and `RecipeManager.deleteRecipe` throws for such an id, so the
  // card states, and the button deletes, the ids that resolve.
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
  // The SUBJECT row, which carries no `count` and therefore always renders: it is the
  // statement of what the button does, and a card that states nothing has lost the pairing
  // the arm depends on.
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
  // ── ONE COUNTABLE NOUN FOR ONE COUNT, ACROSS ALL FOUR SURFACES ───────────────────
  // The recipe-item figure is named `books & scrolls` / `book or scroll` on the card, in
  // the armed accessible name, in the completion toast and in the singular delete dialog.
  // It had been split — the card said one thing and the other three said "recipe item(s)"
  // — and the aria/visible pair was the worst of it: `aria-describedby` points AT this
  // list, so a screen-reader user heard "2 recipe item(s)" as the name of a control
  // described by a row reading "2 books & scrolls", which is a WCAG 2.5.3 smell.
  //
  // The display name won rather than the canonical noun, and the corpus is why. Every
  // other item-referring string under the Recipe lang namespace already says it —
  // `BookPick`, `BookSearch`/`BookSearchOne`, `BookNoMatch`, `BookClearPick`,
  // `AppliedBooks*`, the editor's `Not in any book or scroll` — so naming it `recipe item`
  // here would have swapped a four-surface split for a one-against-ten split inside the
  // studio's own namespace. `recipe item` remains the canonical noun in `openspec/` and in
  // every identifier, exactly as `ui-integration`'s Books & Scrolls section requires.
  //
  // The multi-count strings say "{items} of your books & scrolls" rather than an "(s)"
  // form: "1 of your books & scrolls" is grammatical, so the display name survives into
  // the strings that carry two or three counts without needing "book(s) or scroll(s)".
  //
  // THE TWO CONSEQUENCE ROWS CARRY NO PRONOUN FOR THE RECIPES, and that is a correction to
  // issue 1132's authored copy rather than a style preference. The delta authored
  // "1 book or scroll will lose it." / "{count} books & scrolls will lose them.", branching
  // on the ITEM count while the pronoun agrees with the RECIPE count — so a perfectly
  // ordinary selection of three recipes that share one book rendered "3 recipes will be
  // deleted. 1 book or scroll will lose it." Branching on both counts would need a 2x2 key
  // matrix per row, which is exactly what the `(s)` idiom exists here to avoid. Naming the
  // consequence without a pronoun is correct in every combination, keeps one `…One` sibling
  // per row, and reads as the parallel consequence list the card is.
  //
  // Both rows are FUTURE and subject-less. "Removed from 1 book or scroll." above a button
  // that has not been pressed reads as current state, one line under a subject row that
  // correctly says "will be deleted"; "Will be removed from…" cannot. The elided subject is
  // the device that keeps them count-neutral — "The recipes will be removed from…" re-opens
  // the same 2x2 matrix on the subject.
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
  // The qualifier is the loudest thing on the card and is deliberately part of the ROW
  // rather than a separate sentence: the learn slot is spent by the same act the number
  // counts, so a GM who reads the number has read the consequence.
  //
  // NEITHER HALF OF THE QUALIFIER MAY AGREE WITH A COUNT THIS ROW DOES NOT BRANCH ON. The
  // row branches on the LEARNER count, and the authored copy carried two words that agree
  // with other counts: "cannot teach it again" pronominalized the RECIPES (three selected
  // recipes, one book, and "it" names one of three), and "their learn slot(s)" agrees with
  // the number of slots each character spent, which is the number of selected recipes they
  // had learned — one character who learned three of them loses three slots and still read
  // the singular branch. "a deleted recipe" and the generic-plural rule statement are both
  // true at every combination of the three counts.
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
  // WCAG 2.5.3 Label in Name: the accessible name must CONTAIN the visible label, so a
  // speech-input user can activate the control by saying what they can read. The armed
  // button reads `Confirm delete`, so the name OPENS with that exact string and the counts
  // follow it. The idle pair needs no reordering: its `…DeleteAria*` sibling is the visible
  // label verbatim.
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
  // Three sentences, three different questions, and the last two are gated on their own
  // count by the card. Zero is omitted rather than stated as zero: "0 books & scrolls will
  // lose them." is noise on the commonest selection there is and it buries the one number
  // that always matters.
  const deleteImpactRows = $derived([
    { key: 'recipes', text: impactRecipesLabel },
    { key: 'items', text: impactItemsLabel, count: impact.recipeItemsAffected },
    { key: 'learners', text: impactLearnersLabel, count: impact.learnersAffected },
  ]);

  // `Leave unchanged`, shared with the Component Studio's category sentinel: it is
  // noun-free, both panels render it, and the recipe panel alone renders it TWICE. Its
  // neighbour `Unchanged` (the segment word below) is deliberately a DIFFERENT string —
  // see the note carried on both keys in `ComponentBulkEditPanel.svelte`.
  const leaveUnchangedLabel = $derived(
    text('FABRICATE.Admin.Manager.BulkEdit.CategoryUnchanged', 'Leave unchanged')
  );

  // The section heading, and the accessible name of the staged list under it, so the group
  // name and the heading a sighted GM reads are one string. `recipe item` remains the
  // canonical spec noun; `Books & scrolls` is the display name the manager's own navigation
  // already uses for the same vocabulary, so the panel names it as the GM finds it.
  const booksLabel = $derived(
    text('FABRICATE.Admin.Manager.Recipe.BulkEdit.Books', 'Books & scrolls')
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

  // Six cases, six messages, keyed by the model's own `reason`. A table rather than a
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

  // The pre-flight hazard, and the ONLY tinted strip this panel spends on the Status axis:
  // its standing sub-hint is a sub-hint precisely so the warning is the one thing tinted.
  // The `enable` term is load-bearing rather than redundant with a zero count — a caller
  // that handed this panel a raw blocked tally would otherwise paint the hazard under
  // `Disable`, where nothing can be refused.
  const showBlockedWarning = $derived(stagedStatus === 'enable' && blockedCount > 0);

  // THREE branches, because "at least {n} of {total}" is only honest while `n < total`.
  // The forecast is a lower bound: it sees every recipe activation would refuse today, but
  // not the collisions the batch itself creates, so the real figure can only be higher.
  // Once the bound EQUALS the maximum there is no headroom left for it to be a bound of —
  // "At least 3 of 3", reachable by selecting three drafts and staging Enable, reads as a
  // copy bug rather than as a hedge. Each branch is exact or hedged as the arithmetic
  // actually permits:
  //
  //  - one selected recipe        exact: a batch of one has no intra-batch collision;
  //  - every selected one blocked exact: the bound is already the maximum, nothing the
  //                               write does can improve it;
  //  - otherwise                  a genuine lower bound, and it names the post-apply
  //                               report as the authority for the exact number, which
  //                               turns the hedge into a promise rather than a shrug.
  //                               That authority already exists as `AppliedBlocked`.
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

  // `books` is `selectedSystem.recipeItemDefinitions`, the PROJECTION — and the projection
  // emits `resolvedName`, never a bare `name`. That holds in both publishes the panel can
  // render against: `_projectRecipeItemDefinitionSync` sets it from the stored name or a
  // uuid-derived label in the synchronous phase-1 publish, and `_enrichRecipeItemLibrary`
  // overwrites it with the linked world item's name in the phase-2 one. So a
  // `name`-first chain falls straight through to the id and paints `sm-book` where the GM
  // wrote "Forgecraft Folio".
  //
  // The chain is `CraftingSystemManagerRoot.recipeItemSourceSnapshot`'s, which is how the
  // rest of the manager labels a recipe-item definition; `id` is appended as a last resort
  // because an unnamed option is neither readable nor nameable by speech input.
  function bookLabel(book) {
    return book?.resolvedName || book?.name || book?.id || '';
  }

  // How many of the SELECTED recipes this book holds. Read from the caller's basis-aware
  // map, NEVER from `book.recipeIds`: while a system's membership-basis marker is unset,
  // membership resolves through the legacy `recipe.recipeItemId` scalar and a book that
  // holds every selected recipe still carries an EMPTY `recipeIds`. Counting from the
  // definition would report "holds none selected", disable Remove, and make this axis
  // unusable on exactly the worlds that most need it.
  //
  // Clamped to the selection size so a stale or over-counted map can never render the
  // arithmetically impossible "holds 5 of 3 selected".
  function holdsCount(bookId) {
    return Math.min(Number(bookMembership?.get?.(bookId)) || 0, count);
  }

  // The `kind` half of an option's second line. `derivedType` is `Book` / `Scroll` /
  // `Incomplete`, and the third is deliberately NOT surfaced: the synchronous phase-1
  // publish emits it for EVERY book unconditionally (it derives from a hard-coded zero
  // recipe count), so it is not a fact this control can trust, and it names a validation
  // state rather than a kind. A book holding no recipes yet is the commonest Add target
  // there is; labelling it `Incomplete` in the very control that fixes it would be both
  // unhelpful and, one publish out of two, untrue.
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

  // "holds none of the 12 selected" / "holds all 12 selected" / "holds 3 of 12 selected".
  // Three whole sentences rather than one with an interchangeable number, because the two
  // extremes are the ones the GM acts on and "holds 0 of 12" reads as a broken template.
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

  // The whole authored vocabulary, every time. `SearchablePopover` filters it by the search
  // term and lists ALL of it while the term is empty — which is the correction to the
  // prototype, whose results list is empty until the GM types and therefore shows nothing
  // at all on a system with four books. Nothing is capped either: the popover's option list
  // SCROLLS, so a cap would hide books that scrolling already reaches and reintroduce the
  // unreachable-Add-target defect the authored vocabulary exists to prevent.
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

  // Labelled with the count actually AFFECTED, not with the selection size. The prototype
  // names the whole selection on both buttons while deriving their disabled state from the
  // missing/present counts, so `Add 5` can sit enabled over a book only two recipes are
  // missing — the number on the control and the number it writes disagree.
  //
  // At zero the count is dropped rather than rendered: `Add 0` on a disabled control states
  // a quantity where the honest statement is that there is nothing to do.
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

  // The accessible name OPENS with the visible label and then states the action, which is
  // WCAG 2.5.3 Label in Name — a speech-input user says what they can read. No
  // `aria-pressed`: these are one-shot actions that stage an op and hand the panel back to
  // the trigger, and the staged list below is what reports (and undoes) the result.
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

  // THE STAGED LIST. The prototype computes this list and never renders it, which leaves a
  // one-book-at-a-time control with no record of what the other books were told to do — so
  // the accumulating draft is invisible right up until Apply. It is the confirmation, the
  // undo, and the only surface on which a mixed add/remove draft can be read at all.
  //
  // Sorted by name so the list is stable under re-staging rather than ordered by the
  // accident of which book the GM happened to pick first.
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
          // "no change" is a real and reachable outcome — staging Add on a book that
          // already holds every selected recipe — and stating it here is the only warning
          // the GM gets before Apply reports nothing happened.
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

  // ── Focus across a destructive re-render ─────────────────────────────────────────
  //
  // EVERY gesture on this axis destroys the control that was holding focus: choosing an
  // option unmounts the popover, Add / Remove / the pick-card clear replace the card with
  // the trigger, and unstaging removes its own row. A destroyed node's focus falls to
  // `document.body`, so a keyboard-only GM staging three books would tab back in from the
  // top of the Foundry document six extra times. The retired chip run had no such cost — a
  // chip cycles IN PLACE and keeps focus — so leaving it unhandled would undercut the exact
  // property this redesign exists to improve.
  //
  // `SearchablePopover.close()` already owns this idiom, and its restore correctly DECLINES
  // here rather than being broken: `onChoose` writes `pickedBookId` first, so Svelte's flush
  // microtask is enqueued ahead of the popover's, and by the time the restore runs its
  // trigger has been unmounted by the `{:else}` swap. Nothing took its place. These helpers
  // are what takes its place, and they copy that idiom exactly — `queueMicrotask` plus an
  // optional-chained, connection-guarded `focus()`.
  //
  // `queueMicrotask` works for the same reason it works there: the state write that
  // schedules Svelte's re-render happens BEFORE the call, so Svelte's flush is already ahead
  // of this callback in the queue and the node being focused is the newly rendered one.
  //
  // The target is found by QUERY rather than by a binding, because the whole point is that
  // the node did not exist when the gesture started — there is nothing to have bound. The
  // query is anchored on this panel's own hook, so it can never reach the Component Studio's
  // panel; the attribute name is declared ONCE here and handed to the shell below, so the
  // anchor and the rendered hook cannot drift into a query that matches nothing.
  const PANEL_ATTR = 'data-recipe-bulk-panel';
  const PANEL_HOOK = `[${PANEL_ATTR}]`;
  const BOOK_TRIGGER = '.fab-bulk-book-trigger';

  // First candidate that exists, is still attached and is not disabled. Every hop is
  // guarded: a candidate may never have rendered, may have been detached again by a
  // republished projection, or may be dead under an in-flight apply — in which case focus
  // is left where it is rather than parked on an inert control.
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

  // The picker has just closed with focus inside it. Land on the action the GM opened it to
  // press; Remove when the book already holds every selected recipe and Add is therefore
  // dead, and the clear when an in-flight apply has deadened both.
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

  // Staging CLEARS the pick, deliberately, and this is the one place this control departs
  // from the prototype's behaviour rather than its defects. The prototype keeps the book
  // picked, which leaves two surfaces claiming authority over one fact — an active Add
  // button and a staged row — and makes every subsequent book cost an extra dismissal. With
  // the staged list rendered, the row IS the confirmation and carries the undo, so the pick
  // card is a transient composer: pick, act, and the trigger is back for the next book.
  //
  // Focus follows the gesture to that row's own undo, which is where the GM's attention
  // already is. The trigger is the fallback for a staging that renders no row at all.
  function stageBook(op) {
    if (!pickedBook) return;
    const bookId = pickedBook.id;
    onDraftChange(setBulkRecipeBookOp(draft, bookId, op));
    pickedBookId = '';
    focusAfterRerender([`[data-recipe-bulk-book-unstage="${bookId}"]`, BOOK_TRIGGER]);
  }

  // The neighbour is read from the sorted list BEFORE the mutation, because afterwards this
  // row is gone and its position with it: the row that takes its place, then the row above
  // it when it was the last one, then the trigger once the list empties entirely.
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
  panelAttr={PANEL_ATTR}
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

  <!--
    The hint on the label row swaps from the instruction to a running tally the moment
    anything is staged, so the section heading itself reports the accumulating draft — the
    one line of the panel a GM scrolling past the picker will still read.
  -->
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
      <!--
        The PICK CARD. One book, its membership against the selection, and the two
        instructions that can be given about it. It REPLACES the trigger rather than
        sitting under it: the search and the composer are two steps of one gesture, and
        showing both would put two book-shaped controls in a 300px rail.
      -->
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
        <!--
          Two REAL buttons side by side, each disabled when its own count is zero: Add is
          dead once every selected recipe already holds the book, Remove once none of them
          does. The counts are the affected ones, so the label and the write agree.
        -->
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
      <!--
        The shipped `SearchablePopover`, not a hand-rolled search field: it already owns the
        search input, the option rows, outside-click and Escape dismissal, focus restoration
        to the trigger on a DISMISSAL, and a portal past the manager panel's
        `overflow: hidden`. Its option list SCROLLS, which is what lets this control offer
        the whole authored vocabulary with no cap and no "keep typing to narrow" affordance.

        Restoration on a CHOICE is this component's, not the popover's, and deliberately so:
        choosing replaces the trigger with the pick card, so there is nothing for the popover
        to restore to and its guard correctly declines. See `focusAfterRerender` above.
      -->
      <SearchablePopover
        options={bookOptions}
        disabled={inert}
        pickerClass="fab-bulk-book-picker"
        triggerClass="manager-button manager-travel-picker-trigger fab-bulk-book-trigger"
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
      <!--
        The staged list. A LIST rather than a chip row: these are rows of record, each
        carrying an operation, an affected count and its own undo, and each is read down the
        rail rather than scanned across it.
      -->
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
  The DELETE block sits below the shell rather than inside it: the shell's Apply is the
  panel's primary action, and a destructive action inside the same card would read as a
  second way of applying the staged edit. The Essence and Component Studios' cards are the
  twins. The accepted consequence is that Apply's sticky dock now clamps to the panel's own
  box rather than the rail's bottom edge — see the enumeration in `BulkEditPanelShell`'s
  dock comment and its gate in `tests/components/bulk-edit-dock-pinning.test.js`.

  `busy` is the caller's own `deleting` flag and is NOT folded into `disabled` here: the card
  needs to tell an in-flight write apart from an inert one to render its third face at all.
  `applying` still inerts the control, because a staged apply and a delete must not race.
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
  /* Manager-scoped by PLACEMENT — this component lives under `apps/manager/`, so
     `--fab-mv2-*` (declared on `.fabricate-manager`) is in scope. It sits here rather than
     in `styles/fabricate.css` so `VIEW_RECIPES` in `scripts/ui-pr-screenshot-evidence.mjs`
     routes a change to the views that actually render it, exactly as `BulkEditSection`
     records for the same reason. */

  /* ── The pick card ─────────────────────────────────────────────────────────────── */
  .fab-bulk-book-pick {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-mv2-accent);
    border-radius: 8px;
    background: var(--fab-mv2-bg);
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
    color: var(--fab-mv2-accent);
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
    color: var(--fab-mv2-text);
    font-size: 0.82rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fab-bulk-book-pick-meta {
    min-width: 0;
    overflow: hidden;
    color: var(--fab-mv2-text-muted);
    font-size: 0.62rem;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Foundry's global `button` rule centres content and pins a fixed height; every button
     in this block therefore restates height and alignment (see the CSS override map in
     `CONTRIBUTING.md`). */
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
    color: var(--fab-mv2-text-muted);
    font-size: 0.68rem;
    cursor: pointer;
  }

  .fab-bulk-book-pick-clear:hover:not(:disabled),
  .fab-bulk-book-unstage:hover:not(:disabled) {
    background: var(--fab-surface-raised);
    color: var(--fab-mv2-text);
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
    border: 1px solid var(--fab-mv2-border-strong);
    border-radius: 6px;
    background: var(--fab-surface-raised);
    color: var(--fab-mv2-text);
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

  /* `.is-disabled` is the repo's component-scoped state convention, but these controls
     carry the real `disabled` attribute — the styling hangs off that rather than off a
     generic class, so a dimmed control is inert by construction. */
  .fab-bulk-book-op:disabled,
  .fab-bulk-book-pick-clear:disabled,
  .fab-bulk-book-unstage:disabled {
    border-color: var(--fab-border);
    background: transparent;
    color: var(--fab-mv2-text-muted);
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
    color: var(--fab-mv2-text);
    font-size: 0.68rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fab-bulk-book-staged-count {
    color: var(--fab-mv2-text-muted);
    font-size: 0.58rem;
    line-height: 1.3;
  }
</style>
