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

  ── THE PANEL STAGES; THE PAGE WRITES ────────────────────────────────────────────────────────
  `onApply` hands the OWNER a staged instruction and nothing else. Every write is a read-modify-
  write of the whole world component payload and every landed write is a replicated setting
  update, so they have to run SEQUENTIALLY behind one in-flight flag — which is the page's
  concern, not this component's. Staging here and writing there is also what lets the mounted
  criterion assert the forwarded ACTION NAME and argument list without reaching inside the panel.

  ── THE COUNT IS STATED BEFORE APPLY ─────────────────────────────────────────────────────────
  The membership group is N components by M systems, so a selection of twelve across three systems
  is thirty-six replicated writes. A panel that presented that as one action would understate it
  by an order of magnitude, so the Apply dock's own sentence carries the write count.

  ── THE CHROME IS THE SHIPPED PRIMITIVES ─────────────────────────────────────────────────────
  `BulkEditPanelShell` owns the eyebrow, the Clear, the count hero and the Apply dock;
  `BulkEditSection` owns each axis label row; `SegmentedControl` owns the two tracks;
  `SearchablePopover` owns both searchable pickers, on the recipe bulk panel's precedent — it is
  the only shipped panel that stages a popover inside a section, and a hand-rolled picker here
  would be a second implementation of it.

  Props:
   - count: how many rows are ticked. Pre-counted by the frame; the panel only words it.
   - systems: `{id, name}[]`, the crafting-system roster.
   - categoryOptions: the world categories already authored across the corpus, with the reserved
     bucket already refused by the caller.
   - tagOptions: the world tag vocabulary, derived from the records that carry it.
   - applying: an in-flight write. Inerts every control and the Apply.
   - onClearSelection(): drop the whole selection.
   - onApply(staged): `{mode, systemIds, category, addTags, removeTags}`. Never called with an
     empty instruction — Apply is genuinely disabled until an axis is staged, so a GM cannot fire
     a no-op write and read success from it.
-->
<script>
  import BulkEditPanelShell from '../BulkEditPanelShell.svelte';
  import BulkEditSection from '../BulkEditSection.svelte';
  import Callout from '../Callout.svelte';
  import Chip from '../Chip.svelte';
  import SearchablePopover from '../SearchablePopover.svelte';
  import SegmentedControl from '../SegmentedControl.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { componentBulkWriteCount } from './componentScoped.js';

  let {
    count = 0,
    systems = [],
    categoryOptions = [],
    tagOptions = [],
    applying = false,
    onClearSelection = () => {},
    onApply = () => {},
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

  const inert = $derived(applying === true);
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
    writeCount === 1
      ? text('FABRICATE.Admin.Manager.Scoped.Component.BulkApplyOne', 'Apply 1 change')
      : phrase('FABRICATE.Admin.Manager.Scoped.Component.BulkApply', 'Apply {count} changes', {
          count: writeCount,
        })
  );

  const modeSegments = $derived([
    {
      value: UNCHANGED,
      labelKey: 'FABRICATE.Admin.Manager.BulkEdit.Unchanged',
      fallback: 'Unchanged',
    },
    {
      value: 'add',
      labelKey: 'FABRICATE.Admin.Manager.Scoped.Component.BulkAddTo',
      fallback: 'Add to',
    },
    {
      value: 'remove',
      labelKey: 'FABRICATE.Admin.Manager.Scoped.Component.BulkRemoveFrom',
      fallback: 'Remove from',
    },
  ]);

  // WHAT THE STAGED DIRECTION WILL DO. `Add to` and `Remove from` alone restate the highlighted
  // segment; these state the blast radius, which is the fact a GM is deciding on — and the
  // removal sentence is the one that has to be unambiguous.
  const modeNote = $derived(
    {
      add: text(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkAddNote',
        'Every selected component gains rules in each chosen system, inheriting the world category.'
      ),
      remove: text(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkRemoveNote',
        'Every selected component loses its rules in each chosen system. The world record is untouched.'
      ),
    }[mode] ?? text('FABRICATE.Admin.Manager.BulkEdit.LeaveUnchanged', 'Leave unchanged')
  );

  const systemOptions = $derived(
    (Array.isArray(systems) ? systems : []).map((system) => ({
      id: String(system?.id ?? ''),
      dataId: String(system?.id ?? ''),
      label: String(system?.name ?? system?.id ?? ''),
      icon: 'fas fa-screwdriver-wrench',
      trailing: stagedSystemIds.includes(String(system?.id ?? ''))
        ? text('FABRICATE.Admin.Manager.Scoped.Component.BulkStaged', 'Staged')
        : '',
    }))
  );

  const categoryPopoverOptions = $derived([
    {
      id: NO_CATEGORY,
      dataId: NO_CATEGORY,
      label: text('FABRICATE.Admin.Manager.Scoped.Component.BulkNoCategory', 'No world category'),
      icon: 'fas fa-ban',
    },
    ...(Array.isArray(categoryOptions) ? categoryOptions : []).map((category) => ({
      id: String(category),
      dataId: String(category),
      label: String(category),
      icon: 'fas fa-tag',
    })),
  ]);

  const categoryLabel = $derived(
    {
      [UNCHANGED]: text('FABRICATE.Admin.Manager.BulkEdit.LeaveUnchanged', 'Leave unchanged'),
      [NO_CATEGORY]: text(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkNoCategory',
        'No world category'
      ),
    }[stagedCategory] ?? stagedCategory
  );

  const stagedSystemNames = $derived(
    stagedSystemIds.map((id) => ({
      id,
      name: String(
        (Array.isArray(systems) ? systems : []).find((system) => system?.id === id)?.name ?? id
      ),
    }))
  );

  function toggleSystem(systemId) {
    if (inert || !systemId) return;
    stagedSystemIds = stagedSystemIds.includes(systemId)
      ? stagedSystemIds.filter((id) => id !== systemId)
      : [...stagedSystemIds, systemId];
  }

  // THREE STATES, CYCLED IN ONE DIRECTION: unchanged, add, remove. A chip that only toggled
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

  function tagTone(tag) {
    if (stagedTags[tag] === 'add') return 'info';
    if (stagedTags[tag] === 'remove') return 'muted';
    return 'neutral';
  }

  function tagStateLabel(tag) {
    if (stagedTags[tag] === 'add') {
      return text('FABRICATE.Admin.Manager.Scoped.Component.BulkTagAdd', 'Add');
    }
    if (stagedTags[tag] === 'remove') {
      return text('FABRICATE.Admin.Manager.Scoped.Component.BulkTagRemove', 'Remove');
    }
    return text('FABRICATE.Admin.Manager.BulkEdit.Unchanged', 'Unchanged');
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
  <BulkEditSection
    label={text('FABRICATE.Admin.Manager.Scoped.Component.BulkMembership', 'System membership')}
    subhint={modeNote}
    subhintAttr="data-world-component-bulk-mode-state"
    subhintValue={mode}
  />
  <SegmentedControl
    fill={true}
    options={modeSegments}
    value={mode}
    groupName="world-component-bulk-mode"
    ariaLabel={text('FABRICATE.Admin.Manager.Scoped.Component.BulkMembership', 'System membership')}
    dataAttr="data-world-component-bulk-mode"
    optionDataAttr="data-world-component-bulk-mode-option"
    onChange={(next) => {
      if (!inert) mode = next;
    }}
  />

  <BulkEditSection
    label={text('FABRICATE.Admin.Manager.Scoped.Component.BulkSystems', 'Systems')}
    subhint={stagedSystemIds.length === 0
      ? text('FABRICATE.Admin.Manager.Scoped.Component.BulkNoSystems', 'No system chosen')
      : phrase('FABRICATE.Admin.Manager.Scoped.Component.BulkSystemCount', '{count} chosen', {
          count: stagedSystemIds.length,
        })}
    subhintAttr="data-world-component-bulk-systems-state"
    subhintValue={String(stagedSystemIds.length)}
  />
  <SearchablePopover
    options={systemOptions}
    disabled={inert || mode === UNCHANGED}
    pickerClass="fab-bulk-component-system-picker"
    triggerClass="manager-button fab-bulk-component-system-trigger"
    triggerIcon="fas fa-magnifying-glass"
    triggerLabel={text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkPickSystem',
      'Pick a crafting system'
    )}
    triggerAriaLabel={text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkPickSystem',
      'Pick a crafting system'
    )}
    triggerData={{ 'data-world-component-bulk-system-trigger': '' }}
    dialogAriaLabel={text('FABRICATE.Admin.Manager.Scoped.Component.BulkSystems', 'Systems')}
    searchPlaceholder={text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkSystemSearch',
      'Search systems…'
    )}
    searchAriaLabel={text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkSystemSearch',
      'Search systems…'
    )}
    emptyHint={text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkSystemNoMatch',
      'No crafting system by that name.'
    )}
    onChoose={(id) => toggleSystem(id)}
  />
  {#if stagedSystemNames.length > 0}
    <div class="fab-bulk-component-chips" data-world-component-bulk-systems-staged>
      {#each stagedSystemNames as system (system.id)}
        <Chip
          tag="button"
          type="button"
          tone="info"
          icon="fas fa-xmark"
          data-world-component-bulk-system={system.id}
          aria-label={phrase(
            'FABRICATE.Admin.Manager.Scoped.Component.BulkSystemDrop',
            'Remove {system} from the staged systems',
            { system: system.name }
          )}
          onclick={() => toggleSystem(system.id)}>{system.name}</Chip
        >
      {/each}
    </div>
  {/if}

  <BulkEditSection
    label={text('FABRICATE.Admin.Manager.Scoped.Component.BulkCategory', 'World category')}
    subhint={categoryLabel}
    subhintAttr="data-world-component-bulk-category-state"
    subhintValue={stagedCategory}
  />
  <SearchablePopover
    options={categoryPopoverOptions}
    disabled={inert}
    pickerClass="fab-bulk-component-category-picker"
    triggerClass="manager-button fab-bulk-component-category-trigger"
    triggerIcon="fas fa-magnifying-glass"
    triggerLabel={text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkPickCategory',
      'Pick a world category'
    )}
    triggerAriaLabel={text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkPickCategory',
      'Pick a world category'
    )}
    triggerData={{ 'data-world-component-bulk-category-trigger': '' }}
    dialogAriaLabel={text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkCategory',
      'World category'
    )}
    searchPlaceholder={text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkCategorySearch',
      'Search categories…'
    )}
    searchAriaLabel={text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkCategorySearch',
      'Search categories…'
    )}
    emptyHint={text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkCategoryNoMatch',
      'No world category by that name.'
    )}
    onChoose={(id) => {
      if (!inert) stagedCategory = id;
    }}
  />

  <BulkEditSection
    label={text('FABRICATE.Admin.Manager.Scoped.Component.BulkTags', 'World tags')}
    subhint={tagsStaged
      ? phrase(
          'FABRICATE.Admin.Manager.Scoped.Component.BulkTagState',
          '{added} added · {removed} removed',
          { added: addTags.length, removed: removeTags.length }
        )
      : text('FABRICATE.Admin.Manager.BulkEdit.LeaveUnchanged', 'Leave unchanged')}
    subhintAttr="data-world-component-bulk-tags-state"
    subhintValue={String(addTags.length + removeTags.length)}
  />
  {#if tagOptions.length > 0}
    <div class="fab-bulk-component-chips" data-world-component-bulk-tags>
      {#each tagOptions as tag (tag)}
        <Chip
          tag="button"
          type="button"
          tone={tagTone(tag)}
          data-world-component-bulk-tag={tag}
          aria-pressed={Boolean(stagedTags[tag])}
          aria-label={phrase(
            'FABRICATE.Admin.Manager.Scoped.Component.BulkTagAria',
            '{tag}: {state}',
            { tag, state: tagStateLabel(tag) }
          )}
          onclick={() => cycleTag(tag)}>{tag}</Chip
        >
      {/each}
    </div>
  {:else}
    <p class="manager-muted fab-bulk-component-empty" data-world-component-bulk-tags-empty>
      {text(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkNoTags',
        'No world tags are authored yet. Add one on a component entry first.'
      )}
    </p>
  {/if}

  <Callout
    tone="info"
    text={text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkPerComponentNote',
      'Names and source links stay per component. What you can change in bulk is which systems these components belong to, and their world category and tags.'
    )}
    dataAttr="data-world-component-bulk-per-component-note"
  />
</BulkEditPanelShell>

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
</style>
