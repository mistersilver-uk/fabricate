<!-- Svelte 5 runes mode -->
<!--
  The system Component Rules list's BULK EDIT panel (issue 772; rebuilt to the reference for
  issue 1371 r16-list under maintainer rulings M23 and M24). It renders in the shell's existing
  `.manager-inspector` column and REPLACES `ComponentBrowserInspector` for as long as the
  selection is non-empty — the prototype's `bulkOn` / `bulkOff` swap, at its `> 0` threshold.

  It lives under `apps/manager/components/` — the BROWSER's directory, which
  `scripts/ui-pr-screenshot-evidence.mjs` globs for the components views — NOT `component/`,
  which is the EDITOR's.

  ── THE ANATOMY IS THE REFERENCE'S, AND THE WORLD PANEL'S (`proto:1105`-`1275`) ──────────────
  `BULK EDIT · Clear` head; the `N components selected` hero with `Staged changes are written to
  {system} only.` under it; the standing info note; then THREE inline insets — `CATEGORY HERE`,
  `TAGS HERE`, `ESSENCE VALUES` — each a search well over a fixed window of rows carrying an `n/N`
  count of how many SELECTED components already hold the value, and a pager; the `PROGRESSIVE DC`
  group where the system's axis is progressive; and a dock holding the full-width primary
  (`Stage a change to apply to N components` until something is staged, then `Apply <axes> to N
  components`) over the full-width danger `Remove N components from {system}…` with its note.

  What shipped before M23 drew a `CATEGORY Leave unchanged` select, a flat chip run for tags, a
  two-up essence CARD grid and a `DELETE SELECTED COMPONENTS` card below the shell. The maintainer
  ruled that a departure from both the reference and the world panel, so every axis is now an
  inset built on the same primitives the world panel uses — `BulkEditPanelShell` with `dockFoot`,
  `BulkEditSection`, `BulkStagingInset`, `Chip`, `ArmedDangerButton` — and the delete moved INTO
  the dock as the reference's `Remove … from {system}` leg (`proto:1269`-`1272`).

  ── WHAT THE REFERENCE DRAWS THAT THIS PANEL DOES NOT, AND WHY ───────────────────────────────
   - `Inherit from world` as a category row (`proto:5507`-`5511`). The bulk write primitive
     (`applyBulkEditToComponents`) reads `category` as "set this value" and its empty string as
     "leave unchanged"; it has no verb for "drop the override and follow the world", which the
     single editor performs through `setSectionInherited`. A row that promised inheritance would
     be a consequence the store does not perform, so the inset offers the system's categories
     only and the note says what a pick does.
   - `SALVAGE` as a bulk axis (`proto:5637`-`5641`). The primitive carries no salvage axis at all
     — its own docblock says "the bulk axes themselves never carry salvage" — so the group is not
     drawn rather than drawn inert.
   - Per-essence "untouched" rows. The reference stages essences ONE AT A TIME and writes only the
     touched ones; the primitive REPLACES the whole map when the axis is staged, so a row that
     read `—` beside a staged neighbour would be saying "unchanged" about a value the write
     strips to 0. Every row therefore reads `—` while the axis is UNSTAGED (nothing is written)
     and its number — 0 included — once it is staged, which is exactly what the write will do.
     The axis chip that arms and disarms the whole map stays, because on a fresh draft every
     essence is 0 and `Stepper` emits nothing at that boundary, so the chip is the only route to
     "clear essences on every selected component".

  ── THE TAGS NOTE STATES THE TRUE HALF ONLY ──────────────────────────────────────────────────
  The reference's caption ends "World tags merge in on top of them." That merge is unconsumed by
  the read union (`ui-integration/spec.md` `### GM World Component Screens` requirement 1), so the
  note says what IS true: world tags are shown on each record, and this system's own list is what
  these rows change.

  ── THE REMOVE LEG STATES WHAT THE STORE DOES ────────────────────────────────────────────────
  `deleteComponents` is the in-system delete: it drops the selected components' rules in THIS
  system, repairs every recipe here that named them and disables any left without a usable
  ingredient set or result, and touches neither the world record nor another system. The note
  under the danger control says so, with the counted recipe sentences the old impact card carried
  — the reference's "will show a broken ingredient until edited" describes a cascade this store
  does not perform. The store refuses per record — `describeComponentDelete` resolves only the
  components this system holds — so a selection of ghost rows arms to `Cannot remove` and writes
  nothing, the way the world panel's danger leg refuses what its entry refuses.

  ── NOTHING IS WRITTEN UNTIL APPLY ────────────────────────────────────────────────────────────
  Every control stages into a draft the CALLER owns; the browser rows do not change while staging.
  The draft helpers in `componentBulkEditModel.js` are IMMUTABLE — each returns a NEW draft — so
  every mutator here reassigns through `onDraftChange`. An in-place call would compile, run, and
  silently do nothing. The three search wells and page indices are the insets' VIEW, not the
  instruction, so they live here and are not part of the draft.

  Props:
   - count: how many components the apply will write to.
   - systemName: the selected system's name, for the hero hint, the notes and the remove leg.
   - categoryOptions: `componentCategoryOptions(...)` output; rendered WITHOUT the browser's
     `({count})` suffix — the inset's `n/N` is the count that means something here.
   - tags: the system's `itemTags` vocabulary.
   - showEssences / essenceDefinitions: the essence inset and its rows.
   - showProgressiveDifficulty: the three-axis predicate — crafting OR salvage OR gathering
     resolution mode is progressive — the SAME predicate the row badge and the editor read.
   - selectedCards: the selected `itemCards`, for the `n/N` counts and the overwrite warning.
   - draft / onDraftChange(next): the staged edit, owned by the caller.
   - applying: an in-flight apply; the panel goes inert rather than double-writing.
   - onClearSelection() / onApply().
   - deleting: an in-flight remove; inert on the same terms as `applying`.
   - deleteArmed: whether the remove leg holds its armed token. The OWNER clears it on any
     change to the selection — an arm is a statement about a SPECIFIC set.
   - deleteImpact: `describeComponentDeleteImpact(...)` output, supplied by the owner because
     "how many recipes will be disabled" needs recipe bodies, which belong in the store.
   - deleteOutcome: an OPTIONAL sentence announcing what a finished remove did when it left this
     panel mounted — a refused or no-op write (issue 1157). The owner clears it as it arms.
   - onArmDelete() / onDisarmDelete() / onDelete(ids).
-->
<script>
  import ArmedDangerButton from '../ArmedDangerButton.svelte';
  import BulkEditPanelShell from '../BulkEditPanelShell.svelte';
  import BulkEditSection from '../BulkEditSection.svelte';
  import BulkStagingInset from '../BulkStagingInset.svelte';
  import Callout from '../Callout.svelte';
  import Chip from '../Chip.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { announceAfterFocusMove } from '../../../util/announceAfterFocus.js';
  import { getComponentCategoryLabel } from '../../../../../utils/componentCategories.js';
  // The add-new offer projection (issue 1036). The `essenceDefinitions` PROP stays unfiltered —
  // the warning count reads the selection's authored values against it — and only the inset
  // narrows.
  import { visibleEssenceOptions } from '../../../../../utils/essenceValidation.js';
  import {
    bulkDraftHasChanges,
    countComponentsChangingEssences,
    countSelectedWithCategory,
    countSelectedWithEssence,
    countSelectedWithTag,
    createComponentBulkDraft,
    cycleBulkTag,
    pageBulkInsetRows,
    setBulkCategory,
    setBulkDifficulty,
    setBulkEssence,
    stagedBulkAxes,
    toggleBulkDifficultyStaged,
    toggleBulkEssencesStaged,
  } from '../../../../../utils/componentBulkEditModel.js';

  let {
    count = 0,
    systemName = '',
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
    deleteOutcome = '',
    onDraftChange = () => {},
    onClearSelection = () => {},
    onApply = () => {},
    onArmDelete = () => {},
    onDisarmDelete = () => {},
    onDelete = () => {},
  } = $props();

  const KEY = 'FABRICATE.Admin.Manager.Component.BulkEdit';

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements ?? {})) {
      result = result.replaceAll(`{${token}}`, String(value));
    }
    return result;
  }

  /** `count`-branched pair of sibling keys, so no sentence ever says "1 components". */
  function counted(stem, one, many, replacements) {
    const data = { count, ...replacements };
    return count === 1
      ? format(`${KEY}.${stem}One`, one, data)
      : format(`${KEY}.${stem}`, many, data);
  }

  const system = $derived(
    String(systemName || '').trim() || text(`${KEY}.ThisSystem`, 'this system')
  );

  // ── THE DRAFT, READ ─────────────────────────────────────────────────────────────────────
  const stagedCategory = $derived(typeof draft?.category === 'string' ? draft.category : '');
  const stagedTagAdd = $derived(Array.isArray(draft?.tagAdd) ? draft.tagAdd : []);
  const stagedTagRemove = $derived(Array.isArray(draft?.tagRemove) ? draft.tagRemove : []);
  const stagedEssences = $derived(
    draft?.essences && typeof draft.essences === 'object' ? draft.essences : {}
  );
  const essencesStaged = $derived(draft?.essencesStaged === true);
  const difficultyStaged = $derived(draft?.difficultyStaged === true);
  const categoryStaged = $derived(stagedCategory.trim() !== '');
  const tagsStaged = $derived(stagedTagAdd.length + stagedTagRemove.length > 0);
  const inert = $derived(applying === true || deleting === true);
  const canApply = $derived(bulkDraftHasChanges(draft) && !inert);
  const axes = $derived(stagedBulkAxes(draft));

  // ── THE INSETS' VIEW STATE: one search and one page per inset ───────────────────────────
  let categoryQuery = $state('');
  let categoryPage = $state(0);
  let tagQuery = $state('');
  let tagPage = $state(0);
  let essenceQuery = $state('');
  let essencePage = $state(0);

  const byName = (a, b) => String(a.name).localeCompare(String(b.name));
  const carried = (n) => format(`${KEY}.Carried`, '{count}/{total}', { count: n, total: count });

  // ── CATEGORY HERE ───────────────────────────────────────────────────────────────────────
  // The system's categories, sorted as the reference sorts them (`proto:5510`). No `Inherit from
  // world` row: see the header.
  const categoryItems = $derived(
    (Array.isArray(categoryOptions) ? categoryOptions : [])
      .map((option) => ({
        id: String(option?.name ?? ''),
        name: getComponentCategoryLabel(String(option?.name ?? ''), localize),
      }))
      .filter((item) => item.id)
      .sort(byName)
  );
  const categoryPageView = $derived(
    pageBulkInsetRows(categoryItems, { query: categoryQuery, pageIndex: categoryPage })
  );
  const categoryHint = $derived(
    categoryStaged
      ? (categoryItems.find((item) => item.id === stagedCategory)?.name ?? stagedCategory)
      : text('FABRICATE.Admin.Manager.BulkEdit.Unchanged', 'Unchanged')
  );
  const categoryNote = $derived(
    categoryStaged
      ? counted(
          'CategoryStagedNote',
          'Written as a {system} value on the 1 selected. Its world classification is untouched.',
          'Written as a {system} value on all {count}. Their world classification is untouched.',
          { system }
        )
      : text(
          `${KEY}.CategoryIdleNote`,
          'Pick one to set it here on every selected component, or leave it unchanged.'
        )
  );

  // ── TAGS HERE ───────────────────────────────────────────────────────────────────────────
  const tagItems = $derived(
    (Array.isArray(tags) ? tags : [])
      .map((tag) => ({ id: String(tag ?? ''), name: String(tag ?? '') }))
      .filter((item) => item.id)
      .sort(byName)
  );
  const tagPageView = $derived(
    pageBulkInsetRows(tagItems, { query: tagQuery, pageIndex: tagPage })
  );
  const tagHint = $derived(
    tagsStaged
      ? [
          stagedTagAdd.length > 0
            ? format(`${KEY}.TagStagedAdded`, '+{count}', { count: stagedTagAdd.length })
            : '',
          stagedTagRemove.length > 0
            ? format(`${KEY}.TagStagedRemoved`, '−{count}', { count: stagedTagRemove.length })
            : '',
        ]
          .filter(Boolean)
          .join(' ')
      : text('FABRICATE.Admin.Manager.BulkEdit.Unchanged', 'Unchanged')
  );

  function tagState(tag) {
    if (stagedTagAdd.includes(tag)) return 'add';
    if (stagedTagRemove.includes(tag)) return 'remove';
    return 'none';
  }

  // Tri-state colour maps onto the shipped chip tones: add is the info family, remove the danger
  // family, leave the neutral one. The glyph reinforces it for anyone who cannot separate the
  // three by hue (`proto:5601`).
  const TAG_TONES = { add: 'info', remove: 'danger', none: 'neutral' };
  const TAG_ICONS = { add: 'fas fa-plus', remove: 'fas fa-minus', none: 'fas fa-tag' };

  // The accessible name OPENS with the visible label and then states the STAGED ACTION:
  // `aria-pressed` cannot honestly describe a control with three states, so the name carries it
  // — but an action-FIRST name breaks WCAG 2.5.3 Label in Name. The em dash is what lets a
  // lowercase tag vocabulary lead without opening a sentence on a lowercase word.
  function tagActionLabel(tag) {
    const state = tagState(tag);
    if (state === 'add') {
      return format(`${KEY}.TagStateAdd`, '{tag} — add to every selected component.', { tag });
    }
    if (state === 'remove') {
      return format(`${KEY}.TagStateRemove`, '{tag} — remove from every selected component.', {
        tag,
      });
    }
    return format(`${KEY}.TagStateNone`, '{tag} — leave unchanged.', { tag });
  }

  // ── ESSENCE VALUES ──────────────────────────────────────────────────────────────────────
  // A disabled essence is withheld from the offer, but one already carrying a staged quantity
  // stays visible so the GM can clear it (issue 1036). Sorted as the reference sorts
  // (`proto:5520`).
  const essenceItems = $derived(
    visibleEssenceOptions(
      Array.isArray(essenceDefinitions) ? essenceDefinitions : [],
      (definition) => Number(stagedEssences[definition?.id]) > 0
    )
      .map((definition) => ({
        id: String(definition?.id ?? ''),
        name: String(definition?.name || definition?.id || ''),
        icon: String(definition?.icon || '').trim(),
      }))
      .filter((item) => item.id)
      .sort(byName)
  );
  const essencePageView = $derived(
    pageBulkInsetRows(essenceItems, { query: essenceQuery, pageIndex: essencePage })
  );
  const essencesSetCount = $derived(
    Object.values(stagedEssences).filter((quantity) => Number(quantity) > 0).length
  );
  const essenceHint = $derived(
    essencesStaged
      ? format(`${KEY}.EssencesStagedCount`, '{count} set', { count: essencesSetCount })
      : text('FABRICATE.Admin.Manager.BulkEdit.Unchanged', 'Unchanged')
  );
  // The conditional hazard, counted over AUTHORED values on the selected rows: an increase counts
  // as surely as a clear, because overwriting a hand-tuned 3 with a 5 destroys that authored 3.
  const essenceWarningCount = $derived(
    countComponentsChangingEssences(selectedCards, stagedEssences)
  );
  const unchangedLabel = $derived(text('FABRICATE.Admin.Manager.BulkEdit.Unchanged', 'Unchanged'));

  // ── THE HEAD, THE HERO AND THE FOOT ─────────────────────────────────────────────────────
  const headingLabel = $derived(
    counted('SelectedHeading', '1 component selected', '{count} components selected')
  );

  const AXIS_LABELS = {
    category: ['AxisCategory', 'category'],
    tags: ['AxisTags', 'tags'],
    essences: ['AxisEssences', 'essences'],
    difficulty: ['AxisDc', 'DC'],
  };

  // The reference's foot (`proto:5551`-`5553`): inert `Stage a change to apply to N components`
  // until an axis is staged; then `Apply <axes> to N components` for one or two axes and
  // `Edit N components` for more, because a label naming four axes no longer fits a rail.
  const applyLabel = $derived.by(() => {
    if (axes.length === 0) {
      return counted(
        'FootIdle',
        'Stage a change to apply to 1 component',
        'Stage a change to apply to {count} components'
      );
    }
    if (axes.length > 2) {
      return counted('FootEdit', 'Edit 1 component', 'Edit {count} components');
    }
    const named = axes
      .map((axis) => AXIS_LABELS[axis])
      .map(([key, fallback]) => text(`${KEY}.${key}`, fallback))
      .join(text(`${KEY}.AxisJoin`, ' + '));
    return counted(
      'FootApply',
      'Apply {axes} to 1 component',
      'Apply {axes} to {count} components',
      {
        axes: named,
      }
    );
  });

  // ── THE REMOVE LEG ──────────────────────────────────────────────────────────────────────
  // The impact arrives as a PROP rather than being computed here: "how many recipes will be
  // disabled" cannot be answered per row, since whether a recipe survives depends on the WHOLE
  // selection against real recipe bodies. See `adminStore.describeComponentDelete`.
  const impact = $derived({
    deletable: Number(deleteImpact?.deletable) || 0,
    deletableIds: Array.isArray(deleteImpact?.deletableIds) ? deleteImpact.deletableIds : [],
    recipesRewritten: Number(deleteImpact?.recipesRewritten) || 0,
    recipesDisabled: Number(deleteImpact?.recipesDisabled) || 0,
  });
  const removeRefused = $derived(impact.deletable === 0);

  // Counted where a count is true, and uncounted where nothing can go: `Remove 0 components…` is
  // a promise of an outcome and `Remove 2 components…` over a selection of ghosts is a false one.
  const removeLabel = $derived.by(() => {
    if (removeRefused) return format(`${KEY}.RemoveNone`, 'Remove from {system}…', { system });
    return impact.deletable === 1
      ? format(`${KEY}.RemoveOne`, 'Remove 1 component from {system}…', { system })
      : format(`${KEY}.Remove`, 'Remove {count} components from {system}…', {
          count: impact.deletable,
          system,
        });
  });
  // THE ARMED LABEL BRANCHES, AND THE CONTROL NEVER GOES `disabled` for a refusal: a disabled
  // button satisfies any assertion that the remove did not happen while leaving the GM no
  // explanation at all. The second press states the outcome before it is taken.
  const removeArmedLabel = $derived(
    removeRefused
      ? text(`${KEY}.RemoveBlocked`, 'Cannot remove')
      : format(`${KEY}.RemoveArmed`, 'Confirm — remove {count} from {system}', {
          count: impact.deletable,
          system,
        })
  );
  // The consequence, COUNTED. The subject sentence always renders; each recipe sentence is gated
  // on its own count, so the commonest selection of all — components no recipe names — states
  // one fact rather than one fact and two noughts.
  const removeNote = $derived.by(() => {
    if (removeRefused) {
      return format(
        `${KEY}.RemoveNoteNone`,
        'None of the selected components has rules in {system}, so there is nothing to remove here.',
        { system }
      );
    }
    const sentences = [
      format(
        `${KEY}.RemoveNote`,
        'Removing them drops their rules in {system} only. Their catalogue entries and every other system are untouched.',
        { system }
      ),
    ];
    if (impact.recipesRewritten > 0) {
      sentences.push(
        impact.recipesRewritten === 1
          ? text(`${KEY}.ImpactRecipesOne`, '1 recipe will be rewritten.')
          : format(`${KEY}.ImpactRecipes`, '{count} recipes will be rewritten.', {
              count: impact.recipesRewritten,
            })
      );
    }
    if (impact.recipesDisabled > 0) {
      sentences.push(
        impact.recipesDisabled === 1
          ? text(
              `${KEY}.ImpactDisabledOne`,
              '1 of those recipes is enabled today and will be disabled.'
            )
          : format(
              `${KEY}.ImpactDisabled`,
              '{count} of those recipes are enabled today and will be disabled.',
              { count: impact.recipesDisabled }
            )
      );
    }
    return sentences.join(' ');
  });
  const removeArmedAnnouncement = $derived(
    format(
      `${KEY}.RemoveArmedAnnouncement`,
      'Remove armed. Activate again to remove {count} component(s) from {system} and rewrite {recipes} recipe(s).',
      { count: impact.deletable, recipes: impact.recipesRewritten, system }
    )
  );

  // ── WHAT THE LIVE REGION SAYS, AND WHEN ─────────────────────────────────────────────────
  // Ported from `BulkDeleteCard`, which this leg replaces on this panel: arming changes the
  // control's label and accessible name WHILE IT HOLDS FOCUS, and a name change under focus is
  // not reliably announced, so the state change is announced in its own polite region. Three
  // transitions — armed, disarmed without confirming, and an awaited write that left the panel
  // mounted — and the last two cannot be told apart from the props alone, so this is `$state`
  // driven by an effect watching the transition.
  let announcement = $state('');
  let wasArmed = false;
  let announcedOutcome = '';
  let control = $state(null);
  let announcementTicket = 0;

  function say(next) {
    announcementTicket += 1;
    announcement = next;
  }

  // Restore focus to the control ONLY WHEN FOCUS IS ACTUALLY NOWHERE (issue 1157): the confirm's
  // own `disabled` left it on `<body>`, and that is the one state worth rescuing.
  function restoreFocusToControl() {
    if (typeof document === 'undefined') return false;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected !== false) return false;
    control?.focus?.();
    return document.activeElement !== active;
  }

  function speakOutcome(outcome) {
    announcementTicket += 1;
    const ticket = announcementTicket;
    announceAfterFocusMove(restoreFocusToControl, () => {
      if (ticket === announcementTicket) announcement = outcome;
    });
  }

  $effect(() => {
    const outcome = String(deleteOutcome || '');
    if (deleting === true) {
      wasArmed = false;
      announcedOutcome = '';
      say('');
      return;
    }
    if (deleteArmed === true) {
      wasArmed = true;
      announcedOutcome = '';
      say(removeArmedAnnouncement);
      return;
    }
    if (outcome && outcome !== announcedOutcome) {
      announcedOutcome = outcome;
      wasArmed = false;
      speakOutcome(outcome);
      return;
    }
    if (outcome) return;
    announcedOutcome = '';
    const cancelled = wasArmed === true;
    wasArmed = false;
    say(cancelled ? text(`${KEY}.RemoveCancelled`, 'Remove cancelled. Nothing was removed.') : '');
  });

  // ── MUTATORS: every one REASSIGNS through the caller ────────────────────────────────────
  function chooseCategory(name) {
    if (inert) return;
    onDraftChange(setBulkCategory(draft, stagedCategory === name ? '' : name));
  }

  function cycleTag(tag) {
    if (inert) return;
    onDraftChange(cycleBulkTag(draft, tag));
  }

  function setEssence(essenceId, quantity) {
    onDraftChange(setBulkEssence(draft, essenceId, quantity ?? 0));
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

  function confirmRemove() {
    if (removeRefused) {
      onDisarmDelete();
      return;
    }
    onDelete(impact.deletableIds);
  }
</script>

<!--
  The chrome — header, hero, section headings and the dock — is the shared primitive set. This
  panel supplies the NOUN-bearing strings and the axes; every hook name is left at the primitive's
  Component Studio default, so the smoke selectors, the view-lab cases and the mounted assertions
  resolve unchanged. The axes are SIBLING flex items of the shell's panel, not wrapped: the shell's
  uniform `gap` is the panel's rhythm.
-->
<BulkEditPanelShell
  heading={headingLabel}
  {applyLabel}
  {canApply}
  clearLabel={text('FABRICATE.Admin.Manager.BulkEdit.Clear', 'Clear')}
  hint={format(`${KEY}.WrittenToHint`, 'Staged changes are written to {system} only.', { system })}
  {onClearSelection}
  {onApply}
  dockFoot={componentBulkRemove}
>
  <!-- The standing explanation, directly under the hero (`proto:1110`): it says what CANNOT be
       bulk-edited, so it belongs before the groups a GM is about to read. -->
  <Callout
    tone="info"
    text={text(
      `${KEY}.PerComponentNote`,
      "Names, art and source links are world catalogue data and stay per component. What you change in bulk here is this system's own rules: its category, its tags and its essence values."
    )}
    dataAttr="data-component-bulk-per-component-note"
  />

  <!-- ── CATEGORY HERE (`proto:1113`-`1137`) ────────────────────────────────────────────── -->
  <BulkEditSection
    label={text(`${KEY}.CategoryHere`, 'Category here')}
    hint={categoryHint}
    trailing={categoryStaged ? clearCategory : undefined}
  />
  <BulkStagingInset
    id="category"
    query={categoryQuery}
    onQuery={(next) => {
      categoryQuery = next;
      categoryPage = 0;
    }}
    placeholder={text(`${KEY}.CategorySearch`, 'Search categories')}
    page={categoryPageView}
    onPage={(next) => (categoryPage = next)}
    empty={categoryItems.length === 0
      ? format(`${KEY}.CategoryNone`, '{system} defines no component categories.', { system })
      : text(`${KEY}.CategoryNoMatch`, 'No category matches that search.')}
    hasRows={categoryPageView.rows.length > 0}
    disabled={inert}
    rowsAttr="data-component-bulk-categories"
  >
    {#each categoryPageView.rows as item (item.id)}
      {@const chosen = stagedCategory === item.id}
      <!-- A RADIO, not a toggle: one category is written, and clicking the chosen row un-stages
           it (`proto:5575`, `setB({cat:on?'':c})`). -->
      <button
        type="button"
        class="fab-bulk-inset-row"
        class:is-staged={chosen}
        data-keyboard-focus="true"
        data-component-bulk-category-option={item.id}
        data-component-bulk-option-state={chosen ? 'on' : 'off'}
        aria-pressed={chosen}
        aria-label={chosen
          ? format(
              `${KEY}.CategoryOptionStagedAria`,
              '{category}: staged as the category here. Activate to leave the category unchanged.',
              { category: item.name }
            )
          : format(
              `${KEY}.CategoryOptionAria`,
              '{category}: set as the category here on every selected component',
              { category: item.name }
            )}
        disabled={inert}
        onclick={() => chooseCategory(item.id)}
      >
        <i class={chosen ? 'fas fa-circle-check' : 'far fa-circle'} aria-hidden="true"></i>
        <span class="fab-bulk-inset-name">{item.name}</span>
        <span class="fab-bulk-inset-meta"
          >{carried(countSelectedWithCategory(selectedCards, item.id))}</span
        >
      </button>
    {/each}
  </BulkStagingInset>
  <p
    class="fab-component-bulk-note"
    data-component-bulk-category-note={categoryStaged ? 'staged' : 'idle'}
  >
    {categoryNote}
  </p>

  <!-- ── TAGS HERE (`proto:1140`-`1164`) ─────────────────────────────────────────────────── -->
  <BulkEditSection
    label={text(`${KEY}.TagsHere`, 'Tags here')}
    hint={tagHint}
    trailing={tagsStaged ? clearTags : undefined}
  />
  {#if tagsStaged}
    <!-- THE STAGED RUN, above the inset exactly as `proto:1146` draws it: the one place the
         DIRECTION is painted rather than listed a row at a time. Clicking a chip cycles the tag
         onward, so a run is also a way back to "leave unchanged". -->
    <div
      class="fab-component-bulk-chips"
      role="group"
      aria-label={text(`${KEY}.TagsHere`, 'Tags here')}
      data-component-bulk-tags
    >
      {#each [...stagedTagAdd, ...stagedTagRemove] as tag (tag)}
        <Chip
          tag="button"
          type="button"
          tone={TAG_TONES[tagState(tag)]}
          icon={TAG_ICONS[tagState(tag)]}
          data-component-bulk-tag-chip={tag}
          data-component-bulk-tag-chip-state={tagState(tag)}
          aria-label={tagActionLabel(tag)}
          disabled={inert}
          onclick={() => cycleTag(tag)}>{tag}</Chip
        >
      {/each}
    </div>
  {/if}
  {#if tagItems.length > 0}
    <BulkStagingInset
      id="tags"
      query={tagQuery}
      onQuery={(next) => {
        tagQuery = next;
        tagPage = 0;
      }}
      placeholder={text(`${KEY}.TagSearch`, 'Search tags')}
      page={tagPageView}
      onPage={(next) => (tagPage = next)}
      empty={text(`${KEY}.TagNoMatch`, 'No tag matches that search.')}
      hasRows={tagPageView.rows.length > 0}
      disabled={inert}
    >
      {#each tagPageView.rows as item (item.id)}
        {@const state = tagState(item.id)}
        <!-- THREE STATES, CYCLED IN ONE DIRECTION: leave, add, remove (`proto:5586`-`5588`). The
             `data-bulk-tag` pair is the hook the smoke walk, the view-lab cases and the root suite
             drive, kept on the row so none of them moves. -->
        <button
          type="button"
          class="fab-bulk-inset-row"
          class:is-staged={state === 'add'}
          class:is-removing={state === 'remove'}
          data-keyboard-focus="true"
          data-bulk-tag={item.id}
          data-bulk-tag-state={state}
          aria-pressed={state !== 'none'}
          aria-label={tagActionLabel(item.id)}
          disabled={inert}
          onclick={() => cycleTag(item.id)}
        >
          <i class={TAG_ICONS[state]} aria-hidden="true"></i>
          <span class="fab-bulk-inset-name">{item.name}</span>
          <span class="fab-bulk-inset-meta"
            >{carried(countSelectedWithTag(selectedCards, item.id))}</span
          >
        </button>
      {/each}
    </BulkStagingInset>
  {:else}
    <p class="manager-muted fab-component-bulk-empty" data-component-bulk-tags-empty>
      {format(`${KEY}.TagsNone`, '{system} defines no component tags.', { system })}
    </p>
  {/if}
  <p class="fab-component-bulk-note" data-component-bulk-tags-note>
    {text(
      `${KEY}.TagsNote`,
      "World tags are shown on each record; this system's own list is what these rows change."
    )}
  </p>

  <!-- ── ESSENCE VALUES (`proto:1166`-`1213`) ───────────────────────────────────────────── -->
  {#if showEssences}
    <!-- PERMANENT sub-hint: the sentence that makes the destructive axis legible must not be the
         smallest text in the panel. The chip in the label row ARMS and DISARMS the whole-map
         axis and is rendered in BOTH states, because on a fresh draft the steppers cannot stage
         "clear essences on everything" at all. -->
    <BulkEditSection
      label={text(`${KEY}.EssenceValues`, 'Essence values')}
      hint={essenceHint}
      subhint={text(
        `${KEY}.EssencesOverwriteHint`,
        'Applying essences overwrites the essence values on every selected component.'
      )}
    >
      {#snippet trailing()}
        <Chip
          tag="button"
          type="button"
          tone={essencesStaged ? 'warning' : 'neutral'}
          data-component-bulk-essences-staged={essencesStaged}
          aria-label={essencesStaged
            ? text(
                `${KEY}.EssencesStagedChipAction`,
                'Will overwrite — essences will be overwritten on every selected component. Activate to leave them unchanged.'
              )
            : text(
                `${KEY}.EssencesUnstagedChipAction`,
                'Unchanged — essences are left unchanged. Activate to overwrite them on every selected component.'
              )}
          disabled={inert}
          onclick={() => toggleEssences()}
          >{essencesStaged
            ? text(`${KEY}.EssencesStagedChip`, 'Will overwrite')
            : unchangedLabel}</Chip
        >
      {/snippet}
    </BulkEditSection>
    {#if essencesStaged && essenceWarningCount > 0}
      <Callout
        tone="warning"
        text={format(
          `${KEY}.EssencesOverwriteWarning`,
          'This will change or remove authored essence values on {count} of the selected components.',
          { count: essenceWarningCount }
        )}
        dataAttr="data-component-bulk-essence-warning"
        dataValue={String(essenceWarningCount)}
      />
    {/if}
    <!-- r16-cat: swap for the shared essence inset. Maintainer ruling M25 puts an `ESSENCE VALUES`
         inset on the WORLD bulk panel too and requires ONE shared component for both; lane CAT
         publishes its contract at `artifacts/r16-essence-inset-contract.md`, which was absent when
         this group was built, so it stands on `BulkStagingInset` with the row drawn here. -->
    <BulkStagingInset
      id="essences"
      query={essenceQuery}
      onQuery={(next) => {
        essenceQuery = next;
        essencePage = 0;
      }}
      placeholder={text(`${KEY}.EssenceSearch`, 'Search essences')}
      page={essencePageView}
      onPage={(next) => (essencePage = next)}
      empty={text(`${KEY}.EssenceNoMatch`, 'No essence matches that search.')}
      hasRows={essencePageView.rows.length > 0}
      disabled={inert}
      rowsAttr="data-component-bulk-essences"
      minRows={6}
    >
      {#each essencePageView.rows as essence (essence.id)}
        {@const quantity = Number(stagedEssences[essence.id]) || 0}
        <!-- The reference's row (`proto:1203`-`1211`): glyph medallion, serif name, `n/N`, then the
             `− value +` stepper. `—` while the axis is UNSTAGED, because nothing is written then;
             the number — 0 included — once it is staged, because that is what the write does. The
             shared `Stepper` is the control (design-system: a number a GM can change is a stepper),
             and stepping an unstaged row up is what stages the axis. -->
        <div
          class="fab-bulk-inset-row is-static fab-component-bulk-essence-row"
          class:is-staged={essencesStaged && quantity > 0}
          data-component-edit-essence={essence.id}
          data-component-essence-active={essencesStaged && quantity > 0}
        >
          <span class="fab-component-bulk-essence-glyph" aria-hidden="true">
            <i class={essence.icon || 'fas fa-mortar-pestle'}></i>
          </span>
          <span class="fab-bulk-inset-name fab-component-bulk-essence-name">{essence.name}</span>
          <span class="fab-bulk-inset-meta"
            >{carried(countSelectedWithEssence(selectedCards, essence.id))}</span
          >
          <Stepper
            value={essencesStaged ? quantity : null}
            allowUnset={!essencesStaged}
            placeholder="—"
            min={0}
            disabled={inert}
            ariaLabel={format('FABRICATE.Admin.Items.Editor.QuantityLabel', 'Quantity for {name}', {
              name: essence.name,
            })}
            decrementLabel={format(
              'FABRICATE.Admin.Items.Editor.DecrementEssence',
              'Decrement {name}',
              {
                name: essence.name,
              }
            )}
            incrementLabel={format(
              'FABRICATE.Admin.Items.Editor.IncrementEssence',
              'Increment {name}',
              {
                name: essence.name,
              }
            )}
            inputProps={{ 'data-component-bulk-essence-input': essence.id }}
            onChange={(next) => setEssence(essence.id, next)}
          />
        </div>
      {/each}
    </BulkStagingInset>
    <p class="fab-component-bulk-note" data-component-bulk-essences-note>
      {counted(
        'EssencesNote',
        'Every row reads unchanged until the axis is staged. Step a value up to write it on the 1 selected; a row left at 0 strips that essence from it.',
        'Every row reads unchanged until the axis is staged. Step a value up to write it on all {count}; a row left at 0 strips that essence from them.'
      )}
    </p>
  {/if}

  <!-- ── PROGRESSIVE DC (`proto:1224`-`1232`) ───────────────────────────────────────────── -->
  {#if showProgressiveDifficulty}
    <BulkEditSection
      label={text(`${KEY}.ProgressiveDc`, 'Progressive DC')}
      subhint={text(`${KEY}.ProgressiveDcHint`, 'DC when used as a progressive result')}
    >
      {#snippet trailing()}
        <Chip
          tag="button"
          type="button"
          tone={difficultyStaged ? 'warning' : 'neutral'}
          data-component-bulk-difficulty-staged={difficultyStaged}
          aria-label={difficultyStaged
            ? text(
                `${KEY}.ProgressiveDcStagedChipAction`,
                'Will set — the progressive DC will be set on every selected component. Activate to leave it unchanged.'
              )
            : text(
                `${KEY}.ProgressiveDcUnstagedChipAction`,
                'Unchanged — the progressive DC is left unchanged. Activate to set it on every selected component.'
              )}
          disabled={inert}
          onclick={() => toggleDifficulty()}
          >{difficultyStaged
            ? text(`${KEY}.ProgressiveDcStagedChip`, 'Will set')
            : unchangedLabel}</Chip
        >
      {/snippet}
    </BulkEditSection>
    <div class="manager-component-bulk-dc-row">
      <i class="fas fa-dice-d20" aria-hidden="true"></i>
      <span class="manager-component-bulk-dc-copy"
        >{text(`${KEY}.ProgressiveDcSentence`, 'Set every selected component to')}</span
      >
      <!-- 0..35, matching the shipped single-component control; 0 CLEARS the value. -->
      <Stepper
        value={Number(draft?.difficulty) || 0}
        min={0}
        max={35}
        disabled={inert}
        ariaLabel={text(`${KEY}.ProgressiveDc`, 'Progressive DC')}
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
  THE REMOVE LEG, IN THE DOCK (`proto:1269`-`1272`). The reference pins the destructive verb and
  its consequence note INSIDE the pinned foot, under the primary action, on the dock's own column
  rhythm — the world panel's `dockFoot`. It states its consequence BEFORE it is armed, the
  consequence is the control's `aria-describedby`, and the arm is announced through the polite
  region below, which exists in the document before it has any text.

  `data-component-bulk-remove` is the leg's hook; `token="delete-components"` is kept so the
  `[data-arm-token="delete-components"][data-armed=…]` selectors the view-lab cases pin still name
  this control.
-->
{#snippet componentBulkRemove()}
  <div class="fab-component-bulk-remove" data-component-bulk-remove>
    <ArmedDangerButton
      bind:this={control}
      token="delete-components"
      armed={deleteArmed === true}
      busy={deleting === true}
      disabled={applying === true}
      idleIcon="fas fa-arrow-right-from-bracket"
      idleLabel={removeLabel}
      armedLabel={removeArmedLabel}
      busyLabel={text(`${KEY}.RemoveBusy`, 'Removing…')}
      idleAriaLabel={removeLabel}
      armedAriaLabel={`${removeArmedLabel} — ${removeNote}`}
      describedBy="component-bulk-remove-note"
      showTitle={false}
      onArm={onArmDelete}
      onDisarm={onDisarmDelete}
      onConfirm={confirmRemove}
    />
    <p
      class="fab-component-bulk-note"
      id="component-bulk-remove-note"
      data-component-bulk-remove-note={removeRefused ? 'refused' : 'proceed'}
    >
      {removeNote}
    </p>
    <p class="visually-hidden" aria-live="polite" data-component-bulk-delete-announce>
      {announcement}
    </p>
  </div>
{/snippet}

{#snippet clearCategory()}
  <button
    type="button"
    class="fab-component-bulk-clear"
    data-keyboard-focus="true"
    data-component-bulk-clear-category
    disabled={inert}
    onclick={() => onDraftChange(setBulkCategory(draft, ''))}
  >
    {text('FABRICATE.Admin.Manager.BulkEdit.Clear', 'Clear')}
  </button>
{/snippet}

{#snippet clearTags()}
  <button
    type="button"
    class="fab-component-bulk-clear"
    data-keyboard-focus="true"
    data-component-bulk-clear-tags
    disabled={inert}
    onclick={() => onDraftChange({ ...draft, tagAdd: [], tagRemove: [] })}
  >
    {text('FABRICATE.Admin.Manager.BulkEdit.Clear', 'Clear')}
  </button>
{/snippet}

<style>
  /* THEME-ROOT tokens only, for the reason `BulkEditPanelShell` records. The appearance lives
     HERE rather than in `styles/fabricate.css` so `VIEW_RECIPES` in
     `scripts/ui-pr-screenshot-evidence.mjs` routes a change to the components views that render
     it. The inset's own chrome is `BulkStagingInset`'s; what is left here is what is about THIS
     panel's rows and notes. */

  .fab-component-bulk-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  .fab-component-bulk-empty {
    margin: 0;
    font-size: 0.68rem;
  }

  /* The note under a control, in the reference's 10px subtle ink (`proto:1164`). */
  .fab-component-bulk-note {
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 0.63rem;
    line-height: 1.5;
  }

  /* A group head's trailing Clear: bare type, like the shell's own Clear, with Foundry's host
     button geometry reset explicitly. */
  .fab-component-bulk-clear {
    appearance: none;
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

  .fab-component-bulk-clear:hover:not(:disabled) {
    color: var(--fab-text);
  }

  .fab-component-bulk-clear:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  /* ── THE ESSENCE ROW (`proto:1203`) ─────────────────────────────────────────────────────
     The inset's row, as a STATIC box holding a control rather than being one: `padding:5px 9px`
     around a 22px glyph and a 22px stepper. It keeps the row family's paint (from
     `BulkStagingInset`) and only stops being a pointer target. */
  .fab-component-bulk-essence-row.is-static {
    cursor: default;
  }

  /* The 22px glyph medallion on `--fab-bg-3`, radius 6 (`proto:5629`). */
  .fab-component-bulk-essence-glyph {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: var(--fab-bg-3);
    color: var(--fab-text-secondary);
    font-size: 0.62rem;
  }

  /* `600 11px var(--serif)` in the text ink (`proto:1205`). */
  .fab-component-bulk-essence-name {
    color: var(--fab-text);
    font-family: var(--fab-font-serif);
    font-size: 0.68rem;
  }

  /* THE STEPPER'S SLOT HAS NO INTRINSIC WIDTH, so its input is capped in this layout context
     rather than by the primitive (see `Stepper.svelte`'s `fill` note): the reference's value
     column is 26px, and the shared 48px would push the `n/N` off the row in a 320px rail.
     `:global()` because the input is rendered by the child and never carries this hash. */
  .fab-component-bulk-essence-row :global(.fab-stepper-input) {
    width: 30px;
  }

  .fab-component-bulk-essence-row :global(.fab-stepper) {
    flex: 0 0 auto;
  }

  .manager-component-bulk-dc-row {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    min-width: 0;
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 10px;
    background: var(--fab-bg-1);
  }

  .manager-component-bulk-dc-row > i {
    flex: 0 0 auto;
    color: var(--fab-info);
    font-size: 0.8rem;
  }

  .manager-component-bulk-dc-copy {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--fab-text-muted);
    font-size: 0.62rem;
    line-height: 1.3;
  }

  /* THE REMOVE LEG RENDERS INSIDE THE SHELL'S DOCK, and this rule still reaches it: a snippet
     carries the scope hash of the component that DEFINES it. It states no spacing above itself —
     the dock's own `has-foot` column rhythm owns the gap between the primary and this leg. */
  .fab-component-bulk-remove {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
  }
</style>
