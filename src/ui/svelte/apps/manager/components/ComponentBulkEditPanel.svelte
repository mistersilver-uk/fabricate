<!--
  The system Component Rules list's BULK EDIT panel. It renders in the shell's `.manager-inspector`
  column and REPLACES `ComponentBrowserInspector` while the selection is non-empty. It lives under
  the BROWSER's directory, which `scripts/ui-pr-screenshot-evidence.mjs` globs for the components
  views, NOT `component/`, which is the EDITOR's. See `openspec/specs/ui-integration/spec.md` →
  "Bulk edit panels" and "Emptying a bulk selection" for the shared contract.

  The anatomy is the reference's and the world panel's: a `BULK EDIT · Clear` head; the
  `N components selected` hero; the standing note; THREE insets — `CATEGORY HERE`, `TAGS HERE`,
  `ESSENCE VALUES` — each a search well over a windowed row list carrying an `n/N` count of how
  many SELECTED components already hold the value, and a pager; `PROGRESSIVE DC` where the system's
  axis is progressive; and a dock holding the primary over the danger `Remove N components…`. Every
  axis is built on the same primitives the world panel uses.

  THREE THINGS THE REFERENCE DRAWS THAT THIS PANEL DOES NOT, each because the write primitive has no
  verb for them. `Inherit from world` as a category row: `applyBulkEditToComponents` reads `category`
  as "set this value" and its empty string as "leave unchanged", with no way to drop an override.
  `SALVAGE` as an axis: the primitive carries none, so the group is absent rather than inert.
  Per-essence "untouched" rows: the primitive REPLACES the whole map, so every row reads `—` while
  the axis is UNSTAGED and its number — 0 included — once staged, which is what the write does. The
  axis chip stays, because on a fresh draft every essence is 0 and `Stepper` emits nothing there.

  The tags note states the TRUE HALF only: the reference's "World tags merge in on top of them" is
  unconsumed by the read union (`ui-integration/spec.md` `### GM World Component Screens`
  requirement 1). The remove leg states what `deleteComponents` does — an IN-SYSTEM delete that
  repairs this system's recipes and touches neither the world record nor another system — and it
  refuses per record, so a selection of ghost rows arms to `Cannot remove` and writes nothing.

  NOTHING IS WRITTEN UNTIL APPLY. Every control stages into a draft the CALLER owns, and the draft
  helpers in `componentBulkEditModel.js` are IMMUTABLE, so every mutator reassigns through
  `onDraftChange`; an in-place call would compile, run and silently do nothing. The search wells and
  page indices are the insets' VIEW rather than the instruction, so they live here.

  Props: count; systemName; categoryOptions (WITHOUT the browser's `({count})` suffix — the inset's
  `n/N` is the count that means something here); tags; showEssences / essenceDefinitions;
  showProgressiveDifficulty (crafting OR salvage OR gathering progressive — the SAME predicate the
  row badge and the editor read); selectedCards; draft / onDraftChange(next); applying; deleting;
  deleteArmed (the OWNER clears it on any selection change — an arm is about a SPECIFIC set);
  deleteImpact (supplied by the owner, since counting disabled recipes needs recipe bodies);
  deleteOutcome (an OPTIONAL sentence for a refused or no-op write); onClearSelection, onApply,
  onArmDelete, onDisarmDelete, onDelete(ids).
-->
<script>
  import ArmedDangerButton from '../../../components/ArmedDangerButton.svelte';
  import BulkEditPanelShell from '../BulkEditPanelShell.svelte';
  import BulkEditSection from '../BulkEditSection.svelte';
  import BulkStagingInset from '../BulkStagingInset.svelte';
  import Callout from '../../../components/Callout.svelte';
  import Chip from '../../../components/Chip.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { announceAfterFocusMove } from '../../../util/announceAfterFocus.js';
  import { getComponentCategoryLabel } from '../../../../../utils/componentCategories.js';
  // The `essenceDefinitions` PROP stays unfiltered — the warning count reads authored values
  // against it — and only the inset narrows.
  import { visibleEssenceOptions } from '../../../../model/essenceValidation.js';
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
  } from '../../../../model/componentBulkEditModel.js';

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

  /**
   * One inset's VIEW — its search and its page — behind the one pair of handlers every inset binds.
   * Three hand-written copies of the same two closures let a no-op in any one of them ship green.
   * A query resets the page, because a search over a moved window would show its second page of
   * matches first. The view is no part of what `onApply` hands over, so a Clear un-stages the
   * instruction and leaves the window where the GM left it.
   */
  function insetView() {
    const view = $state({ query: '', page: 0 });
    return {
      get query() {
        return view.query;
      },
      get page() {
        return view.page;
      },
      onQuery: (next) => {
        view.query = next;
        view.page = 0;
      },
      onPage: (next) => {
        view.page = next;
      },
    };
  }

  const categoryView = insetView();
  const tagView = insetView();
  const essenceView = insetView();

  const byName = (a, b) => String(a.name).localeCompare(String(b.name));
  const carried = (n) => format(`${KEY}.Carried`, '{count}/{total}', { count: n, total: count });

  // CATEGORY HERE: the system's categories, reference-sorted. No `Inherit from world` — see above.
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
    pageBulkInsetRows(categoryItems, { query: categoryView.query, pageIndex: categoryView.page })
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

  const tagItems = $derived(
    (Array.isArray(tags) ? tags : [])
      .map((tag) => ({ id: String(tag ?? ''), name: String(tag ?? '') }))
      .filter((item) => item.id)
      .sort(byName)
  );
  const tagPageView = $derived(
    pageBulkInsetRows(tagItems, { query: tagView.query, pageIndex: tagView.page })
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

  // Tri-state colour maps onto the shipped chip tones — add info, remove danger, leave neutral —
  // and the glyph reinforces it for anyone who cannot separate the three by hue.
  const TAG_TONES = { add: 'info', remove: 'danger', none: 'neutral' };
  const TAG_ICONS = { add: 'fas fa-plus', remove: 'fas fa-minus', none: 'fas fa-tag' };

  // The name OPENS with the visible label, then the STAGED ACTION: `aria-pressed` cannot describe
  // three states, and an action-FIRST name breaks WCAG 2.5.3 Label in Name.
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

  // ESSENCE VALUES: a disabled essence is withheld, unless it already carries a staged quantity,
  // so the GM can still clear it.
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
    pageBulkInsetRows(essenceItems, { query: essenceView.query, pageIndex: essenceView.page })
  );
  const essencesSetCount = $derived(
    Object.values(stagedEssences).filter((quantity) => Number(quantity) > 0).length
  );
  const essenceHint = $derived(
    essencesStaged
      ? format(`${KEY}.EssencesStagedCount`, '{count} set', { count: essencesSetCount })
      : text('FABRICATE.Admin.Manager.BulkEdit.Unchanged', 'Unchanged')
  );
  // The hazard, counted over AUTHORED values: an increase counts as surely as a clear.
  const essenceWarningCount = $derived(
    countComponentsChangingEssences(selectedCards, stagedEssences)
  );
  const unchangedLabel = $derived(text('FABRICATE.Admin.Manager.BulkEdit.Unchanged', 'Unchanged'));

  const headingLabel = $derived(
    counted('SelectedHeading', '1 component selected', '{count} components selected')
  );

  const AXIS_LABELS = {
    category: ['AxisCategory', 'category'],
    tags: ['AxisTags', 'tags'],
    essences: ['AxisEssences', 'essences'],
    difficulty: ['AxisDc', 'DC'],
  };

  // Inert until an axis is staged, then `Apply <axes> to N components` for one or two axes and
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

  // THE REMOVE LEG. The impact arrives as a PROP: whether a recipe survives depends on the WHOLE
  // selection against real recipe bodies, which is `adminStore.describeComponentDelete`'s.
  const impact = $derived({
    deletable: Number(deleteImpact?.deletable) || 0,
    deletableIds: Array.isArray(deleteImpact?.deletableIds) ? deleteImpact.deletableIds : [],
    recipesRewritten: Number(deleteImpact?.recipesRewritten) || 0,
    recipesDisabled: Number(deleteImpact?.recipesDisabled) || 0,
  });
  const removeRefused = $derived(impact.deletable === 0);

  // Counted only where a count is true: `Remove 2 components…` over ghosts promises a false outcome.
  const removeLabel = $derived.by(() => {
    if (removeRefused) return format(`${KEY}.RemoveNone`, 'Remove from {system}…', { system });
    return impact.deletable === 1
      ? format(`${KEY}.RemoveOne`, 'Remove 1 component from {system}…', { system })
      : format(`${KEY}.Remove`, 'Remove {count} components from {system}…', {
          count: impact.deletable,
          system,
        });
  });
  // NEVER `disabled` for a refusal: a disabled button satisfies any assertion that the remove did
  // not happen while leaving the GM no explanation. The second press states the outcome first.
  const removeArmedLabel = $derived(
    removeRefused
      ? text(`${KEY}.RemoveBlocked`, 'Cannot remove')
      : format(`${KEY}.RemoveArmed`, 'Confirm — remove {count} from {system}', {
          count: impact.deletable,
          system,
        })
  );
  // The consequence, COUNTED: the subject sentence always renders and each recipe sentence is
  // gated on its own count, so the commonest selection states one fact rather than two noughts.
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

  // Arming changes the control's label and accessible name WHILE IT HOLDS FOCUS, and a name change
  // under focus is not reliably announced, so the state change gets its own polite region. Three
  // transitions, and the last two are indistinguishable from the props alone, so this is `$state`.
  let announcement = $state('');
  let wasArmed = false;
  let announcedOutcome = '';
  let control = $state(null);
  let announcementTicket = 0;

  function say(next) {
    announcementTicket += 1;
    announcement = next;
  }

  // ONLY WHEN FOCUS IS ACTUALLY NOWHERE: the confirm's own `disabled` left it on `<body>`.
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
  The chrome is the shared primitive set; this panel supplies the NOUN-bearing strings and the axes,
  leaving every hook name at the primitive's Component Studio default so the smoke selectors, the
  view-lab cases and the mounted assertions resolve unchanged. The axes are SIBLING flex items of
  the shell's panel, not wrapped: the shell's uniform `gap` is the panel's rhythm.
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
  <!-- The standing explanation, directly under the hero: it says what CANNOT be bulk-edited, so it
       belongs before the groups a GM is about to read.

       INFO IS RETAINED AND THE JUDGEMENT IS RECORDED. `openspec/specs/ui-integration/spec.md` →
       "Standing statements" would put a permanent explanation at neutral, and the prototype asks
       for the tint here and on the world twin at `scoped/ComponentCatalogueBulkPanel.svelte`. The
       two panels carrying this note without that anchor are already quieted, so the open question
       is only whether a prototype anchor outranks the tone rule — issue 1580's, and this pair
       moves under it together or not at all. -->
  <Callout
    tone="info"
    text={text(
      `${KEY}.PerComponentNote`,
      "Names, art and source links are world catalogue data and stay per component. What you change in bulk here is this system's own rules: its category, its tags and its essence values."
    )}
    dataAttr="data-component-bulk-per-component-note"
  />

  <BulkEditSection
    label={text(`${KEY}.CategoryHere`, 'Category here')}
    hint={categoryHint}
    trailing={categoryStaged ? clearCategory : undefined}
  />
  <BulkStagingInset
    id="category"
    query={categoryView.query}
    onQuery={categoryView.onQuery}
    placeholder={text(`${KEY}.CategorySearch`, 'Search categories')}
    page={categoryPageView}
    onPage={categoryView.onPage}
    empty={categoryItems.length === 0
      ? format(`${KEY}.CategoryNone`, '{system} defines no component categories.', { system })
      : text(`${KEY}.CategoryNoMatch`, 'No category matches that search.')}
    hasRows={categoryPageView.rows.length > 0}
    disabled={inert}
    rowsAttr="data-component-bulk-categories"
  >
    {#each categoryPageView.rows as item (item.id)}
      {@const chosen = stagedCategory === item.id}
      <!-- A RADIO, not a toggle: one category is written, and re-clicking it un-stages. -->
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

  <BulkEditSection
    label={text(`${KEY}.TagsHere`, 'Tags here')}
    hint={tagHint}
    trailing={tagsStaged ? clearTags : undefined}
  />
  {#if tagsStaged}
    <!-- THE STAGED RUN, above the inset: the one place the DIRECTION is painted rather than listed
         a row at a time, and clicking a chip cycles onward, so it is also a way back to "leave". -->
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
      query={tagView.query}
      onQuery={tagView.onQuery}
      placeholder={text(`${KEY}.TagSearch`, 'Search tags')}
      page={tagPageView}
      onPage={tagView.onPage}
      empty={text(`${KEY}.TagNoMatch`, 'No tag matches that search.')}
      hasRows={tagPageView.rows.length > 0}
      disabled={inert}
    >
      {#each tagPageView.rows as item (item.id)}
        {@const state = tagState(item.id)}
        <!-- THREE STATES, CYCLED IN ONE DIRECTION: leave, add, remove. The `data-bulk-tag` pair
             stays on the row, since the smoke walk, the view-lab cases and the root suite drive it. -->
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

  {#if showEssences}
    <!-- PERMANENT sub-hint: the sentence making a destructive axis legible must not be the panel's
         smallest text. The chip ARMS and DISARMS the whole-map axis and renders in BOTH states,
         because a fresh draft's steppers cannot stage "clear essences on everything" at all. -->
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
      <!-- WARNING STANDS: authored data about to be overwritten on a counted number of rows is the
           conditional hazard `ui-integration/spec.md` → "Standing statements" reserves it for. -->
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
    <!-- The same `BulkStagingInset` `stepper` kind the world Component catalogue draws, over this
         system's essences. What is this panel's is the WHOLE-MAP reading: every row reads `—` while
         the axis is unstaged and the number the write will set — 0 included — once it is. -->
    <BulkStagingInset
      id="essences"
      kind="stepper"
      rows={essencePageView.rows.map((essence) => {
        const quantity = Number(stagedEssences[essence.id]) || 0;
        return {
          id: essence.id,
          name: essence.name,
          icon: essence.icon,
          colorToken: essence.colorToken,
          value: essencesStaged ? quantity : null,
          state: essencesStaged ? (quantity > 0 ? 'set' : 'strip') : 'unchanged',
          active: essencesStaged && quantity > 0,
          allowUnset: !essencesStaged,
          min: 0,
          meta: carried(countSelectedWithEssence(selectedCards, essence.id)),
        };
      })}
      rowAttr="data-component-edit-essence"
      activeAttr="data-component-essence-active"
      inputAttr="data-component-bulk-essence-input"
      onStep={(essenceId, next) => setEssence(essenceId, next)}
      query={essenceView.query}
      onQuery={essenceView.onQuery}
      placeholder={text(`${KEY}.EssenceSearch`, 'Search essences')}
      page={essencePageView}
      onPage={essenceView.onPage}
      empty={text(`${KEY}.EssenceNoMatch`, 'No essence matches that search.')}
      hasRows={essencePageView.rows.length > 0}
      disabled={inert}
      rowsAttr="data-component-bulk-essences"
      minRows={6}
    />
    <p class="fab-component-bulk-note" data-component-bulk-essences-note>
      {counted(
        'EssencesNote',
        'Every row reads unchanged until the axis is staged. Step a value up to write it on the 1 selected; a row left at 0 strips that essence from it.',
        'Every row reads unchanged until the axis is staged. Step a value up to write it on all {count}; a row left at 0 strips that essence from them.'
      )}
    </p>
  {/if}

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
  THE REMOVE LEG, IN THE DOCK. The destructive verb and its consequence note sit INSIDE the pinned
  foot on the dock's own column rhythm. It states its consequence BEFORE it is armed, that
  consequence is the control's `aria-describedby`, and the arm is announced through the polite
  region below, which exists in the document before it has any text. `token="delete-components"` is
  kept so the `[data-arm-token="delete-components"][data-armed=…]` view-lab selectors still resolve.
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
  /* THEME-ROOT tokens only, for the reason `BulkEditPanelShell` records. The appearance lives HERE
     rather than in `styles/fabricate.css` so `scripts/ui-pr-screenshot-evidence.mjs` routes a
     change to the components views that render it. */

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

  /* A group head's trailing Clear: bare type, with Foundry's host button geometry reset. */
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

  /* THE REMOVE LEG RENDERS INSIDE THE SHELL'S DOCK and this rule still reaches it, because a
     snippet carries the scope hash of the component that DEFINES it. No spacing above: the dock's
     own `has-foot` column rhythm owns that gap. */
  .fab-component-bulk-remove {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
  }
</style>
