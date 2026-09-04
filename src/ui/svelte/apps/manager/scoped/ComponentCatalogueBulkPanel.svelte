<!-- Svelte 5 runes mode -->
<!--
  The world Component Catalogue's BULK EDIT panel (issue 1371, epic 1357).

  ── FOUR STAGING GROUPS, AND WHAT EACH ONE IS FOR ─────────────────────────────────────────────
  A world component has exactly three axes whose value is closed and means the same thing for
  every component in a selection: which systems hold it, its world category, and its world tags.
  Membership takes TWO groups rather than one — a direction and a set of systems — because `Add
  to` and `Remove from` are one keystroke apart and destructive in one direction only, so the
  direction is staged on its own track with its own sentence rather than folded into the picker.

  Identity is NOT here, and the panel says so rather than leaving a short panel to be read as an
  unfinished one: a name, an image, a description and a source link are per component by nature,
  and one of them written across a selection is a worse answer than no control.

  ── EACH GROUP IS AN INLINE INSET, NOT A POPOVER TRIGGER (gap-list rows 43-45) ────────────────
  It shipped as three `Pick a … ▾` buttons opening `SearchablePopover`. `proto:628`-`697` draws
  the same object three times INLINE instead: a recessed card holding a 28px search well, a fixed
  window of rows, and a pager. The two forms are not interchangeable at this size — a popover
  hides the corpus behind a click, so a GM cannot see that a search matched nothing, cannot see
  how many systems there are, and cannot read a staged row and an unstaged one side by side. The
  panel is 326px of column that is otherwise empty; the reference spends it on showing the set.

  The three insets are ONE snippet parameterised by a descriptor, not three blocks: they differ
  only in what a row means when it is clicked, and three near-identical blocks are what the
  SonarCloud duplication gate reads them as.

  ── THE REFERENCE'S BULK DELETE IS NOW BUILT (gap-list row 47) ────────────────────────────────
  It was withheld on the reasoning that the catalogue row offers no destructive verb, so a bulk
  delete would put the most destructive verb in the product on the surface with the least context.
  `proto:684`-`688` pins one anyway, with a consequence note under it, and the maintainer's M10
  ruling builds every row of this panel. What makes it safe is the shipped two-step:
  `ArmedDangerButton` arms, states the count in its armed label, and only then writes — the same
  idiom every other delete in this manager uses. The PAGE owns the write and the sequencing, as it
  does for every other axis here.

  ── THE PANEL STAGES; THE PAGE WRITES ────────────────────────────────────────────────────────
  `onApply` hands the OWNER a staged instruction and nothing else. Every write is a read-modify-
  write of the whole world component payload and every landed write is a replicated setting
  update, so they have to run SEQUENTIALLY behind one in-flight flag — which is the page's
  concern, not this component's. Staging here and writing there is also what lets the mounted
  criterion assert the forwarded ACTION NAME and argument list without reaching inside the panel.

  ── THE DOCK NAMES THE WRITE ─────────────────────────────────────────────────────────────────
  The membership group is N components by M systems, so a selection of twelve across three systems
  is thirty-six replicated writes. `Apply 2 changes` named neither the records nor the verb;
  `componentBulkApplyLabel` names both, which `design-system/spec.md:415` requires of a bulk
  commit action.

  ── THE CHROME IS THE SHIPPED PRIMITIVES ─────────────────────────────────────────────────────
  `BulkEditPanelShell` owns the eyebrow, the Clear, the count hero and the Apply dock;
  `BulkEditSection` owns each axis label row; `SegmentedControl` owns the direction track;
  `ArmedDangerButton` owns the two-step delete; `Chip` owns the staged tag run.

  Props:
   - count: how many rows are ticked. Pre-counted by the frame; the panel only words it.
   - systems: `{id, name}[]`, the crafting-system roster.
   - categoryOptions: the world categories already authored across the corpus, with the reserved
     bucket already refused by the caller.
   - tagOptions: the world tag vocabulary, derived from the records that carry it.
   - applying: an in-flight write. Inerts every control and the Apply.
   - deleting: an in-flight bulk delete. Inerts the same set, and puts the danger control into its
     own busy state rather than into the Apply's.
   - onClearSelection(): drop the whole selection.
   - onApply(staged): `{mode, systemIds, category, addTags, removeTags}`. Never called with an
     empty instruction — Apply is genuinely disabled until an axis is staged, so a GM cannot fire
     a no-op write and read success from it.
   - onDelete(): delete every selected component. Called only from the ARMED state of the shipped
     two-step control; `null` withholds the control entirely, so a call site with no delete leg
     offers no dead affordance.
-->
<script>
  import ArmedDangerButton from '../ArmedDangerButton.svelte';
  import BulkEditPanelShell from '../BulkEditPanelShell.svelte';
  import BulkEditSection from '../BulkEditSection.svelte';
  import Callout from '../Callout.svelte';
  import Chip from '../Chip.svelte';
  import SegmentedControl from '../SegmentedControl.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import {
    componentBulkApplyLabel,
    componentBulkMembershipModes,
    componentBulkPickerPage,
    componentBulkWriteCount,
  } from './componentScoped.js';

  let {
    count = 0,
    systems = [],
    categoryOptions = [],
    tagOptions = [],
    applying = false,
    deleting = false,
    onClearSelection = () => {},
    onApply = () => {},
    onDelete = null,
  } = $props();

  /** The unstaged sentinel, shared by both tracks and by the Apply gate. */
  const UNCHANGED = 'unchanged';
  /** The category picker's own CLEAR value, distinct from leaving it unchanged. */
  const NO_CATEGORY = 'none';

  // THE PANEL'S OWN STATE, safe to hold here precisely because the frame renders this snippet
  // only while the selection is non-empty: clearing the selection unmounts the panel, so a staged
  // instruction can never outlive the set it was staged against.
  let mode = $state(UNCHANGED);
  let stagedSystemIds = $state([]);
  let stagedCategory = $state(UNCHANGED);
  /** @type {Record<string, 'add'|'remove'>} */
  let stagedTags = $state({});

  // ONE SEARCH AND ONE PAGE INDEX PER INSET. They are the inset's VIEW rather than its
  // instruction, so they are deliberately not part of what `onApply` hands over and are reset
  // only when the inset's own Clear is used.
  let systemQuery = $state('');
  let systemPage = $state(0);
  let categoryQuery = $state('');
  let categoryPage = $state(0);
  let tagQuery = $state('');
  let tagPage = $state(0);

  /** Whether the two-step delete is armed. Local, because arming is a panel-local intent. */
  let deleteArmed = $state(false);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function phrase(key, fallback, data) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(data ?? {})) {
      result = result.replaceAll(`{${token}}`, String(value));
    }
    return result;
  }

  const inert = $derived(applying === true || deleting === true);
  const addTags = $derived(Object.keys(stagedTags).filter((tag) => stagedTags[tag] === 'add'));
  const removeTags = $derived(
    Object.keys(stagedTags).filter((tag) => stagedTags[tag] === 'remove')
  );
  const membershipStaged = $derived(mode !== UNCHANGED && stagedSystemIds.length > 0);
  const categoryStaged = $derived(stagedCategory !== UNCHANGED);
  const tagsStaged = $derived(addTags.length + removeTags.length > 0);
  const canApply = $derived((membershipStaged || categoryStaged || tagsStaged) && !inert);

  const writeCount = $derived(
    componentBulkWriteCount({
      selected: count,
      systems: membershipStaged ? stagedSystemIds.length : 0,
      category: categoryStaged,
      tags: tagsStaged,
    })
  );

  const headingLabel = $derived(
    count === 1
      ? text('FABRICATE.Admin.Manager.Scoped.Component.BulkHeadingOne', '1 component selected')
      : phrase(
          'FABRICATE.Admin.Manager.Scoped.Component.BulkHeading',
          '{count} components selected',
          { count }
        )
  );

  const applyLabel = $derived(
    componentBulkApplyLabel(
      {
        count,
        mode,
        systems: stagedSystemIds.length,
        category: categoryStaged,
        tags: tagsStaged,
        writes: writeCount,
      },
      phrase
    )
  );

  const deleteLabel = $derived(
    count === 1
      ? text('FABRICATE.Admin.Manager.Scoped.Component.BulkDeleteOne', 'Delete 1 component…')
      : phrase(
          'FABRICATE.Admin.Manager.Scoped.Component.BulkDelete',
          'Delete {count} components…',
          {
            count,
          }
        )
  );

  // BUILT FROM THE MODEL, NOT RE-DECLARED BESIDE IT (issue 1371, round 2). The panel used to
  // spell the same two labels and both mode notes inline while `componentBulkMembershipModes`
  // stated them in the model with no consumer anywhere — two implementations of one meaning, and
  // the one the delta said the mounted criterion would read was the dead one.
  const membershipModes = $derived(componentBulkMembershipModes(phrase));
  const modeSegments = $derived(
    membershipModes.map((entry) => ({
      value: entry.id,
      labelKey: '',
      fallback: entry.label,
      icon: entry.icon,
    }))
  );

  // WHAT THE STAGED DIRECTION WILL DO. `Add to` and `Remove from` alone restate the highlighted
  // segment; these state the blast radius, which is the fact a GM is deciding on — and the
  // removal sentence is the one that has to be unambiguous.
  const modeNote = $derived(
    membershipModes.find((candidate) => candidate.id === mode)?.note ??
      text(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkModeIdle',
        'Choose a direction, then the systems it applies to.'
      )
  );

  // ── THE THREE INSETS, EACH AS ONE DESCRIPTOR ────────────────────────────────────────────────
  // The snippet below renders whichever it is handed, so what differs between systems, categories
  // and tags is exactly this data and nothing about the markup.
  const systemItems = $derived(
    (Array.isArray(systems) ? systems : []).map((system) => ({
      id: String(system?.id ?? ''),
      name: String(system?.name ?? system?.id ?? ''),
    }))
  );

  const categoryItems = $derived([
    {
      id: NO_CATEGORY,
      name: text('FABRICATE.Admin.Manager.Scoped.Component.BulkNoCategory', 'No world category'),
    },
    ...(Array.isArray(categoryOptions) ? categoryOptions : []).map((category) => ({
      id: String(category),
      name: String(category),
    })),
  ]);

  const tagItems = $derived(
    (Array.isArray(tagOptions) ? tagOptions : []).map((tag) => ({
      id: String(tag),
      name: String(tag),
    }))
  );

  const systemPageView = $derived(
    componentBulkPickerPage(systemItems, { query: systemQuery, pageIndex: systemPage }, phrase)
  );
  const categoryPageView = $derived(
    componentBulkPickerPage(
      categoryItems,
      { query: categoryQuery, pageIndex: categoryPage },
      phrase
    )
  );
  const tagPageView = $derived(
    componentBulkPickerPage(tagItems, { query: tagQuery, pageIndex: tagPage }, phrase)
  );

  const stagedLabel = $derived(
    text('FABRICATE.Admin.Manager.Scoped.Component.BulkStaged', 'Staged')
  );

  const systemInset = $derived({
    id: 'systems',
    query: systemQuery,
    onQuery: (next) => {
      systemQuery = next;
      systemPage = 0;
    },
    placeholder: text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkSystemSearch',
      'Search systems'
    ),
    empty: text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkSystemNoMatch',
      'No crafting system matches that search.'
    ),
    // THE DIRECTION GATES THE SET, not the other way round: staging systems under `Unchanged`
    // would compose an instruction with a target and no verb.
    disabled: mode === UNCHANGED,
    page: systemPageView,
    onPage: (next) => (systemPage = next),
    onChoose: (id) => toggleSystem(id),
    rows: systemPageView.rows.map((item) => ({
      id: item.id,
      name: item.name,
      state: stagedSystemIds.includes(item.id) ? 'on' : 'off',
      icon: stagedSystemIds.includes(item.id) ? 'fas fa-square-check' : 'far fa-square',
      meta: stagedSystemIds.includes(item.id) ? stagedLabel : '',
    })),
  });

  const categoryInset = $derived({
    id: 'category',
    query: categoryQuery,
    onQuery: (next) => {
      categoryQuery = next;
      categoryPage = 0;
    },
    placeholder: text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkCategorySearch',
      'Search categories'
    ),
    empty: text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkCategoryNoMatch',
      'No world category matches that search.'
    ),
    disabled: false,
    page: categoryPageView,
    onPage: (next) => (categoryPage = next),
    onChoose: (id) => {
      if (!inert) stagedCategory = id;
    },
    rows: categoryPageView.rows.map((item) => ({
      id: item.id,
      name: item.name,
      state: stagedCategory === item.id ? 'on' : 'off',
      icon: stagedCategory === item.id ? 'fas fa-circle-check' : 'far fa-circle',
      meta: stagedCategory === item.id ? stagedLabel : '',
    })),
  });

  const tagInset = $derived({
    id: 'tags',
    query: tagQuery,
    onQuery: (next) => {
      tagQuery = next;
      tagPage = 0;
    },
    placeholder: text('FABRICATE.Admin.Manager.Scoped.Component.BulkTagSearch', 'Search tags'),
    empty: text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkTagNoMatch',
      'No world tag matches that search.'
    ),
    disabled: false,
    page: tagPageView,
    onPage: (next) => (tagPage = next),
    onChoose: (id) => cycleTag(id),
    rows: tagPageView.rows.map((item) => ({
      id: item.id,
      name: item.name,
      state: stagedTags[item.id] ?? 'off',
      icon: tagGlyph(item.id) || 'far fa-circle',
      meta: stagedTags[item.id] ? tagDirectionLabel(item.id) : '',
      hook: 'tag',
    })),
  });

  function toggleSystem(systemId) {
    if (inert || !systemId || mode === UNCHANGED) return;
    stagedSystemIds = stagedSystemIds.includes(systemId)
      ? stagedSystemIds.filter((id) => id !== systemId)
      : [...stagedSystemIds, systemId];
  }

  // THREE STATES, CYCLED IN ONE DIRECTION: unchanged, add, remove. A row that only toggled
  // would give a GM no way back to "leave this tag alone" once they had touched it, which on a
  // panel whose whole point is a partial instruction is the one state that must stay reachable.
  function cycleTag(tag) {
    if (inert || !tag) return;
    const next = { ...stagedTags };
    if (next[tag] === 'add') next[tag] = 'remove';
    else if (next[tag] === 'remove') delete next[tag];
    else next[tag] = 'add';
    stagedTags = next;
  }

  // THE TWO DIRECTIONS MUST NOT LOOK ALIKE (issue 1371, round 2). `muted` and `neutral` differ
  // only in their ink token — same border, no fill on either — so "staged for removal" and "leave
  // alone" were the same chip, on the one panel whose own header says the directions are one
  // keystroke apart and destructive in one of them. `warning` is the family that means "this will
  // take something away", and the glyph carries the state where colour alone should not.
  function tagTone(tag) {
    if (stagedTags[tag] === 'add') return 'info';
    if (stagedTags[tag] === 'remove') return 'warning';
    return 'neutral';
  }

  function tagGlyph(tag) {
    if (stagedTags[tag] === 'add') return 'fas fa-plus';
    if (stagedTags[tag] === 'remove') return 'fas fa-minus';
    return '';
  }

  function tagDirectionLabel(tag) {
    return stagedTags[tag] === 'remove'
      ? text('FABRICATE.Admin.Manager.Scoped.Component.BulkTagRemoveShort', 'Remove')
      : text('FABRICATE.Admin.Manager.Scoped.Component.BulkTagAddShort', 'Add');
  }

  /**
   * One chip's accessible name, which is where the DIRECTION lives.
   *
   * @param {string} tag
   * @returns {string}
   */
  function tagAria(tag) {
    if (stagedTags[tag] === 'add') {
      return phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkTagAddAria',
        '{tag}: add to every selected component',
        { tag }
      );
    }
    if (stagedTags[tag] === 'remove') {
      return phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkTagRemoveAria',
        '{tag}: remove from every selected component',
        { tag }
      );
    }
    return phrase(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkTagLeaveAria',
      '{tag}: leave unchanged',
      { tag }
    );
  }

  function applyStaged() {
    if (!canApply) return;
    onApply({
      mode: membershipStaged ? mode : UNCHANGED,
      systemIds: membershipStaged ? [...stagedSystemIds] : [],
      category: categoryStaged ? (stagedCategory === NO_CATEGORY ? '' : stagedCategory) : null,
      addTags: [...addTags],
      removeTags: [...removeTags],
    });
    mode = UNCHANGED;
    stagedSystemIds = [];
    stagedCategory = UNCHANGED;
    stagedTags = {};
  }
</script>

<BulkEditPanelShell
  heading={headingLabel}
  {applyLabel}
  {canApply}
  panelAttr="data-world-component-bulk-panel"
  clearAttr="data-world-component-bulk-clear"
  countAttr="data-world-component-bulk-count"
  applyAttr="data-world-component-bulk-apply"
  {onClearSelection}
  onApply={applyStaged}
>
  <!--
    THE STANDING EXPLANATION IS SECOND, DIRECTLY UNDER THE REGISTER (gap-list row 40).

    `proto:618` puts it there and the panel put it last, immediately above the Apply dock — which
    inverts what it is for: it says what CANNOT be bulk-edited, so it belongs before the groups a
    GM is about to read rather than after the decision they have already made.
  -->
  <Callout
    tone="info"
    text={text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkPerComponentNote',
      'Names and source links stay per component. What you can change in bulk is which systems these components belong to, and their world category and tags.'
    )}
    dataAttr="data-world-component-bulk-per-component-note"
  />

  <BulkEditSection
    label={text('FABRICATE.Admin.Manager.Scoped.Component.BulkMembership', 'Membership change')}
  />
  <SegmentedControl
    fill={true}
    options={modeSegments}
    value={mode}
    groupName="world-component-bulk-mode"
    ariaLabel={text('FABRICATE.Admin.Manager.Scoped.Component.BulkMembership', 'Membership change')}
    dataAttr="data-world-component-bulk-mode"
    optionDataAttr="data-world-component-bulk-mode-option"
    onChange={(next) => {
      if (!inert) mode = next;
    }}
  />
  <!-- BELOW the control, which is where `proto:625` writes it: the note describes what the
       chosen direction will do, so it reads as a consequence of the track above rather than as
       an instruction about a control the GM has not reached yet. -->
  <p class="fab-bulk-component-note" data-world-component-bulk-mode-state={mode}>{modeNote}</p>

  <BulkEditSection
    label={text('FABRICATE.Admin.Manager.Scoped.Component.BulkSystems', 'Systems')}
    hint={stagedSystemIds.length === 0
      ? text('FABRICATE.Admin.Manager.Scoped.Component.BulkNoSystems', 'None')
      : phrase('FABRICATE.Admin.Manager.Scoped.Component.BulkSystemCount', '{count} chosen', {
          count: stagedSystemIds.length,
        })}
    trailing={stagedSystemIds.length > 0 ? clearSystems : undefined}
  />
  {@render stagingInset(systemInset)}

  <BulkEditSection
    label={text('FABRICATE.Admin.Manager.Scoped.Component.BulkCategory', 'World category')}
    hint={categoryStaged
      ? (categoryItems.find((item) => item.id === stagedCategory)?.name ?? stagedCategory)
      : text('FABRICATE.Admin.Manager.BulkEdit.LeaveUnchanged', 'Leave unchanged')}
    trailing={categoryStaged ? clearCategory : undefined}
  />
  {@render stagingInset(categoryInset)}
  <p class="fab-bulk-component-note" data-world-component-bulk-category-state={stagedCategory}>
    {text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkCategoryNote',
      'The world category is the value a system resolves while its own inherit switch is on.'
    )}
  </p>

  <BulkEditSection
    label={text('FABRICATE.Admin.Manager.Scoped.Component.BulkTags', 'World tags')}
    hint={tagsStaged
      ? phrase(
          'FABRICATE.Admin.Manager.Scoped.Component.BulkTagState',
          '{added} added · {removed} removed',
          { added: addTags.length, removed: removeTags.length }
        )
      : text('FABRICATE.Admin.Manager.BulkEdit.LeaveUnchanged', 'Leave unchanged')}
    trailing={tagsStaged ? clearTags : undefined}
  />
  {#if tagsStaged}
    <!-- THE STAGED RUN, above the inset exactly as `proto:706` draws it. It is the one place the
         DIRECTION is painted rather than merely listed, which is why the chips survive the move
         to an inset: a run of two tones says at a glance what a column of rows says one row at a
         time. -->
    <div class="fab-bulk-component-chips" data-world-component-bulk-tags>
      {#each [...addTags, ...removeTags] as tag (tag)}
        <!--
          `aria-pressed` REPORTS STAGED-VERSUS-UNSTAGED AND NOTHING ELSE, because that is the only
          thing a two-state attribute can honestly say about a three-state control. The DIRECTION
          is in the accessible NAME, which has room for it.
        -->
        <Chip
          tag="button"
          type="button"
          tone={tagTone(tag)}
          icon={tagGlyph(tag)}
          data-world-component-bulk-tag-chip={tag}
          data-world-component-bulk-tag-state={stagedTags[tag] || 'unchanged'}
          aria-pressed={Boolean(stagedTags[tag])}
          aria-label={tagAria(tag)}
          onclick={() => cycleTag(tag)}>{tag}</Chip
        >
      {/each}
    </div>
  {/if}
  {#if tagItems.length > 0}
    {@render stagingInset(tagInset)}
  {:else}
    <p class="manager-muted fab-bulk-component-empty" data-world-component-bulk-tags-empty>
      {text(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkNoTags',
        'No world tags are authored yet. Add one on a component entry first.'
      )}
    </p>
  {/if}

  <!--
    THE DANGER LEG (gap-list row 47). `proto:686`-`688` pins it inside the dock, under the primary
    action; `BulkEditPanelShell` owns that dock and takes no slot in it, so this renders as the
    panel's last content instead — directly above the dock, in the same reading order, with the
    same consequence note under it. Moving it INTO the dock needs an opt-in on the shell, which no
    lane owns this revision; it is recorded rather than worked around.
  -->
  {#if onDelete}
    <div class="fab-bulk-component-danger" data-world-component-bulk-danger>
      <ArmedDangerButton
        token="world-component-bulk-delete"
        armed={deleteArmed}
        busy={deleting === true}
        disabled={applying === true}
        idleLabel={deleteLabel}
        armedLabel={phrase(
          'FABRICATE.Admin.Manager.Scoped.Component.BulkDeleteArmed',
          'Confirm — delete {count} from the world',
          { count }
        )}
        busyLabel={text('FABRICATE.Admin.Manager.Scoped.Component.BulkDeleteBusy', 'Deleting…')}
        idleAriaLabel={deleteLabel}
        armedAriaLabel={phrase(
          'FABRICATE.Admin.Manager.Scoped.Component.BulkDeleteArmed',
          'Confirm — delete {count} from the world',
          { count }
        )}
        describedBy="world-component-bulk-delete-note"
        onArm={() => (deleteArmed = true)}
        onDisarm={() => (deleteArmed = false)}
        onConfirm={() => {
          deleteArmed = false;
          onDelete();
        }}
      />
      <p class="fab-bulk-component-note" id="world-component-bulk-delete-note">
        {text(
          'FABRICATE.Admin.Manager.Scoped.Component.BulkDeleteNote',
          'This removes the world record, its world defaults and every system’s rules for it. Recipes that reference it stop resolving.'
        )}
      </p>
    </div>
  {/if}
</BulkEditPanelShell>

{#snippet clearSystems()}
  <button
    type="button"
    class="fab-bulk-component-clear"
    data-world-component-bulk-clear-systems
    disabled={inert}
    onclick={() => (stagedSystemIds = [])}
  >
    {text('FABRICATE.Admin.Manager.BulkEdit.Clear', 'Clear')}
  </button>
{/snippet}

{#snippet clearCategory()}
  <button
    type="button"
    class="fab-bulk-component-clear"
    data-world-component-bulk-clear-category
    disabled={inert}
    onclick={() => (stagedCategory = UNCHANGED)}
  >
    {text('FABRICATE.Admin.Manager.BulkEdit.Clear', 'Clear')}
  </button>
{/snippet}

{#snippet clearTags()}
  <button
    type="button"
    class="fab-bulk-component-clear"
    data-world-component-bulk-clear-tags
    disabled={inert}
    onclick={() => (stagedTags = {})}
  >
    {text('FABRICATE.Admin.Manager.BulkEdit.Clear', 'Clear')}
  </button>
{/snippet}

<!--
  ONE INSET, RENDERED THREE TIMES (`proto:628`-`697`).

  The search well, the fixed row window and the pager are identical in all three groups and only
  the DESCRIPTOR differs — what a row means, what clicking it does, and what it says when it is
  staged. Writing it once is what keeps the three groups from drifting apart a control at a time,
  and it is what the SonarCloud duplication gate requires of three near-identical blocks.

  Every row is a real `<button>` with `aria-pressed`, because a row here is a control: the tag
  rows cycle three states and the system rows toggle, and neither is expressible as a link.
-->
{#snippet stagingInset(inset)}
  <div class="fab-bulk-component-inset" data-world-component-bulk-inset={inset.id}>
    <div class="fab-bulk-component-inset-search">
      <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
      <input
        type="search"
        value={inset.query}
        placeholder={inset.placeholder}
        aria-label={inset.placeholder}
        disabled={inert}
        data-world-component-bulk-search={inset.id}
        oninput={(event) => inset.onQuery(event.currentTarget.value)}
      />
    </div>
    <div class="fab-bulk-component-inset-rows">
      {#each inset.rows as row (row.id)}
        <button
          type="button"
          class="fab-bulk-component-inset-row"
          class:is-staged={row.state !== 'off'}
          data-world-component-bulk-option={row.id}
          data-world-component-bulk-option-state={row.state}
          aria-pressed={row.state !== 'off'}
          disabled={inert || inset.disabled}
          onclick={() => inset.onChoose(row.id)}
        >
          <i class={row.icon} aria-hidden="true"></i>
          <span class="fab-bulk-component-inset-name">{row.name}</span>
          {#if row.meta}
            <span class="fab-bulk-component-inset-meta">{row.meta}</span>
          {/if}
        </button>
      {:else}
        <p class="fab-bulk-component-inset-empty" data-world-component-bulk-empty={inset.id}>
          {inset.empty}
        </p>
      {/each}
    </div>
    <div class="fab-bulk-component-inset-pager">
      <span class="fab-bulk-component-inset-range" data-world-component-bulk-range={inset.id}>
        {inset.page.range}
      </span>
      <div class="fab-bulk-component-inset-pages">
        <button
          type="button"
          class="fab-bulk-component-inset-page"
          data-world-component-bulk-prev={inset.id}
          disabled={inert || inset.page.pageIndex === 0}
          aria-label={text('FABRICATE.Admin.Manager.Pagination.Previous', 'Previous page')}
          onclick={() => inset.onPage(inset.page.pageIndex - 1)}
        >
          <i class="fas fa-chevron-left" aria-hidden="true"></i>
        </button>
        <span class="fab-bulk-component-inset-page-label">{inset.page.pageLabel}</span>
        <button
          type="button"
          class="fab-bulk-component-inset-page"
          data-world-component-bulk-next={inset.id}
          disabled={inert || inset.page.pageIndex >= inset.page.pageCount - 1}
          aria-label={text('FABRICATE.Admin.Manager.Pagination.Next', 'Next page')}
          onclick={() => inset.onPage(inset.page.pageIndex + 1)}
        >
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  </div>
{/snippet}

<style>
  /* STATIC class names, so Svelte can prove each selector is used and `lint:svelte:warnings`
     stays at zero. */
  .fab-bulk-component-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  .fab-bulk-component-empty {
    margin: 0;
    font-size: 0.68rem;
  }

  /* The note under a control, in the reference's 10px subtle ink. */
  .fab-bulk-component-note {
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 0.63rem;
    line-height: 1.5;
  }

  /* A group head's trailing Clear: bare type, like the selection band's pair, with Foundry's
     host button geometry reset explicitly as `Chip` and the panel's own Clear both do. */
  .fab-bulk-component-clear {
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

  .fab-bulk-component-clear:hover:not(:disabled) {
    color: var(--fab-text);
  }

  .fab-bulk-component-clear:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  /* ── THE STAGING INSET (`proto:628`) ───────────────────────────────────────────────────────
     A recess one rung BELOW the panel, hairline, radius 9 — `design-system/spec.md:218` puts a
     well on 9, which is the reference's own value. The reference's 9px padding takes
     `--fab-space-2`, the nearest step on the published 4px scale. */
  .fab-bulk-component-inset {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-0);
  }

  /* The 28px search well, lifted back to `--fab-bg-1` inside the recess (`proto:630`). */
  .fab-bulk-component-inset-search {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    min-width: 0;
    height: 28px;
    padding: 0 var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: var(--fab-bg-1);
  }

  .fab-bulk-component-inset-search > i {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-size: 0.56rem;
  }

  /* Foundry core sizes every `<input>` to its own height and border; both are reset here so the
     field is the WELL and not a second box inside it. */
  .fab-bulk-component-inset-search input {
    flex: 1 1 auto;
    width: auto;
    height: auto;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--fab-text);
    font-family: inherit;
    font-size: 0.66rem;
    font-weight: 500;
  }

  /* THE WINDOW IS A FIXED HEIGHT, which is the whole reason the reference draws a pager on it:
     a list that grew and shrank with its search would move the two groups below it on every
     keystroke. Five rows plus their gaps is the reference's own 181px. */
  .fab-bulk-component-inset-rows {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
    min-height: 170px;
    align-content: flex-start;
  }

  .fab-bulk-component-inset-row {
    appearance: none;
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: 0;
    margin: 0;
    padding: var(--fab-space-1) var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: var(--fab-bg-1);
    color: var(--fab-text);
    font-family: inherit;
    font-size: 0.68rem;
    text-align: left;
    cursor: pointer;
  }

  .fab-bulk-component-inset-row:hover:not(:disabled) {
    border-color: var(--fab-border-strong);
  }

  .fab-bulk-component-inset-row.is-staged {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  .fab-bulk-component-inset-row:disabled {
    color: var(--fab-text-disabled);
    cursor: default;
  }

  .fab-bulk-component-inset-row:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .fab-bulk-component-inset-row > i {
    flex: 0 0 auto;
    width: 9px;
    font-size: 0.56rem;
  }

  .fab-bulk-component-inset-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    font-family: var(--fab-font-serif);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fab-bulk-component-inset-meta {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-size: 0.56rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
  }

  .fab-bulk-component-inset-empty {
    margin: 0;
    padding: var(--fab-space-3) var(--fab-space-2);
    color: var(--fab-text-disabled);
    font-size: 0.63rem;
  }

  /* The pager is lifted back to `--fab-bg-1` like the search well, so the recess reads as a card
     with two lit edges rather than as a flat band (`proto:641`). */
  .fab-bulk-component-inset-pager {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    min-width: 0;
    padding: var(--fab-space-1) var(--fab-space-2);
    border: 1px solid var(--fab-border);
    /* 7, NOT THE REFERENCE'S 8. `design-system/spec.md:218` gives a 26-32px control 7 and puts
       nothing on 8 at all, and `design-system-debt-ratchets` refuses a new off-ladder radius —
       the same snap the row's own 8 takes to 9 one file over. */
    border-radius: 7px;
    background: var(--fab-bg-1);
  }

  .fab-bulk-component-inset-range {
    color: var(--fab-text-subtle);
    font-size: 0.56rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .fab-bulk-component-inset-pages {
    display: flex;
    gap: var(--fab-space-chip);
    align-items: center;
    margin-left: auto;
  }

  .fab-bulk-component-inset-page {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    min-height: 0;
    margin: 0;
    padding: 0;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-bg-0);
    color: var(--fab-text-secondary);
    font-size: 0.56rem;
    cursor: pointer;
  }

  .fab-bulk-component-inset-page:disabled {
    color: var(--fab-text-disabled);
    cursor: default;
  }

  .fab-bulk-component-inset-page:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .fab-bulk-component-inset-page-label {
    min-width: 62px;
    color: var(--fab-text-secondary);
    font-size: 0.56rem;
    font-weight: 600;
    text-align: center;
    white-space: nowrap;
  }

  .fab-bulk-component-danger {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
  }
</style>
