<!-- Svelte 5 runes mode -->
<!--
  The world Component Catalogue's BULK EDIT panel (issue 1371, epic 1357).

  FOUR STAGING GROUPS. A world component has three axes whose value is closed and means the same
  thing across a selection: which systems hold it, its world category and its world tags.
  Membership takes TWO groups — a direction and a set — because `Add to` and `Remove from` are
  one keystroke apart and destructive in one direction only. Identity is NOT here, and the panel
  says so rather than leaving a short panel to read as an unfinished one.

  EACH GROUP IS AN INLINE INSET, NOT A POPOVER TRIGGER (`proto:628`-`697`): a popover hides the
  corpus behind a click, so a GM cannot see that a search matched nothing or read a staged row
  beside an unstaged one. The three insets are ONE snippet parameterised by a descriptor, which
  is also what keeps them off the SonarCloud duplication gate.

  THE PANEL STAGES; THE PAGE WRITES. `onApply` hands the owner a staged instruction and nothing
  else, because every write is a read-modify-write of the whole payload and they have to run
  SEQUENTIALLY behind one in-flight flag. THE DOCK NAMES THE WRITE, which
  `design-system/spec.md:434` requires of a bulk commit action. The chrome is the shipped
  primitives throughout, and the geometry is the reference's on the published rungs (M24).

  `onApply(staged)` is never called with an empty instruction — Apply is disabled until an axis
  is staged. `essences` is `essenceId -> quantity` with `0` meaning strip, resolved into
  per-system writes by the page. `onDelete()` is called only from the ARMED state of the shipped
  two-step control, and `null` withholds the control rather than offering a dead affordance.
-->
<script>
  import ArmedDangerButton from '../../../components/ArmedDangerButton.svelte';
  import BulkEditPanelShell from '../BulkEditPanelShell.svelte';
  import BulkEditSection from '../BulkEditSection.svelte';
  import BulkStagingInset from '../BulkStagingInset.svelte';
  import Callout from '../../../components/Callout.svelte';
  import Chip from '../../../components/Chip.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { paginateRows } from '../../../../model/browserPagination.js';
  import {
    componentBulkApplyLabel,
    componentBulkDeleteNote,
    componentBulkEssenceCarried,
    componentBulkEssenceHint,
    componentBulkEssencePlan,
    componentBulkMembershipModes,
    componentBulkWriteCount,
  } from './componentScoped.js';

  /**
   * One staging inset's visible page: the rows that survive its search, windowed. SHARED BY ALL
   * THREE INSETS, so the predicate, the window size and the range sentence cannot drift.
   *
   * IT LIVES HERE RATHER THAN IN `componentScoped.js`, AND THE ADDRESS IS THE POINT: that module
   * is the import-free leaf `ComponentEditView.svelte` pulls in, so every module it imports has
   * to appear in every mounted manifest — and a missing entry reads as `# cancelled`, not
   * `# fail`. Holding it beside its only caller keeps the pagination leaf in the CATALOGUE's
   * own closure.
   */
  function componentBulkPickerPage(items, { query, pageIndex, pageSize = 5 }) {
    const needle = String(query ?? '')
      .trim()
      .toLowerCase();
    const matched = (Array.isArray(items) ? items : []).filter(
      (item) =>
        !needle ||
        String(item?.name ?? '')
          .toLowerCase()
          .includes(needle)
    );
    const page = paginateRows(matched, { pageIndex, pageSize }, pageSize);
    // THE SHAPE `BulkStagingInset` WORDS: it owns the range and page sentences, so the caller
    // hands numbers, never strings.
    return {
      rows: page.rows,
      pageIndex: page.pageIndex,
      pageCount: page.pageCount,
      rangeStart: page.rangeStart,
      rangeEnd: page.rangeEnd,
      total: matched.length,
    };
  }

  let {
    count = 0,
    systems = [],
    categoryOptions = [],
    tagOptions = [],
    essences = [],
    // THE PROJECTED ENTRIES, for the essence group's two facts (M31): the `n/N` counts records
    // whose WORLD map carries an essence, and the write count is one world write per changed
    // record. Only the page holds the projection; the staged map is this panel's.
    entries = [],
    selectedIds = [],
    applying = false,
    deleting = false,
    onClearSelection = () => {},
    onApply = () => {},
    onDelete = null,
    // WHICH OF THE SELECTION THE DELETE MAY TOUCH (epic decision 7), computed by the page because
    // only it holds the projected entries. `null` means "every selected component is free", so a
    // call site not yet taught the plan behaves as it did rather than withholding a delete.
    deletePlan = null,
  } = $props();

  /** The unstaged sentinel, shared by both tracks and by the Apply gate. */
  const UNCHANGED = 'unchanged';
  /** The category picker's own CLEAR value, distinct from leaving it unchanged. */
  const NO_CATEGORY = 'none';

  // THE PANEL'S OWN STATE, safe here because the frame renders this snippet only while the
  // selection is non-empty, so a staged instruction cannot outlive the set it was staged against.
  let mode = $state(UNCHANGED);
  let stagedSystemIds = $state([]);
  let stagedCategory = $state(UNCHANGED);
  /** @type {Record<string, 'add'|'remove'>} */
  let stagedTags = $state({});
  /** `essenceId -> quantity`, `0` meaning strip; absent meaning unchanged (M25). */
  let stagedEssences = $state({});

  /**
   * One inset's VIEW — its search and its page — behind the one pair of handlers every inset
   * binds. Four hand-written copies of the same two closures shipped green with a no-op in one;
   * with a factory there is one binding per inset to prove. A query resets the page. The view is
   * deliberately no part of what `onApply` hands over, so a Clear leaves the window as it was.
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

  const systemView = insetView();
  const categoryView = insetView();
  const tagView = insetView();
  const essenceView = insetView();

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
  const essencesStaged = $derived(Object.keys(stagedEssences).length > 0);
  const canApply = $derived(
    (membershipStaged || categoryStaged || tagsStaged || essencesStaged) && !inert
  );

  // THE ESSENCE AXIS'S TWO FACTS, READ OFF EACH RECORD'S WORLD MAP (M31): how many of the
  // selection carry each essence, and one world write per record whose map changes.
  const selectedComponentIds = $derived(
    (Array.isArray(selectedIds) ? selectedIds : []).map((id) => String(id))
  );
  const essenceCarried = $derived(
    componentBulkEssenceCarried(selectedComponentIds, { entries, systems })
  );
  const essencePlan = $derived(
    componentBulkEssencePlan(selectedComponentIds, stagedEssences, { entries, systems })
  );

  // THE ESSENCE ROSTER, worded for the shared inset's `stepper` kind. `min: null`, deliberately:
  // the reference's `−` below zero returns a row to unchanged (`proto:5631`), which the inset
  // reports as a negative step and `stageEssenceStep` reads as an unstage.
  const essenceRoster = $derived(
    (Array.isArray(essences) ? essences : []).map((essence) => ({
      id: String(essence?.id ?? ''),
      name: String(essence?.name ?? essence?.id ?? ''),
      icon: String(essence?.icon ?? ''),
      colorToken: String(essence?.colorToken ?? ''),
    }))
  );
  const essencePageView = $derived(
    componentBulkPickerPage(essenceRoster, {
      query: essenceView.query,
      pageIndex: essenceView.page,
    })
  );
  const essenceRows = $derived(
    essencePageView.rows.map((essence) => {
      const staged = stagedEssences[essence.id];
      const touched = staged !== undefined;
      return {
        ...essence,
        value: touched ? Number(staged) : null,
        state: touched ? (Number(staged) > 0 ? 'set' : 'strip') : 'unchanged',
        active: touched,
        allowUnset: true,
        min: null,
        meta: `${Number(essenceCarried[essence.id]) || 0}/${Number(count) || 0}`,
      };
    })
  );
  const stagedEssenceIds = $derived(
    Object.keys(stagedEssences).filter((id) => essenceRoster.some((essence) => essence.id === id))
  );

  const writeCount = $derived(
    componentBulkWriteCount({
      selected: count,
      systems: membershipStaged ? stagedSystemIds.length : 0,
      category: categoryStaged,
      tags: tagsStaged,
      essences: essencePlan.length,
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
        essences: essencesStaged,
        writes: writeCount,
      },
      phrase
    )
  );

  /**
   * THE DELETE'S THREE FACTS, ALL READ OFF ONE PLAN (epic decision 7). A selection with nothing
   * held normalises to the whole selection, so the counts, labels and note are what they were.
   */
  const plan = $derived({
    deletable: Array.isArray(deletePlan?.deletable) ? deletePlan.deletable : null,
    blocked: Array.isArray(deletePlan?.blocked) ? deletePlan.blocked : [],
  });
  // The COUNT THE DELETE WOULD ACTUALLY WRITE, which both labels say and the note counts.
  const deletableCount = $derived(plan.deletable === null ? count : plan.deletable.length);
  const deleteNote = $derived(
    componentBulkDeleteNote(
      {
        deletable: plan.deletable ?? Array.from({ length: count }, (_, index) => index),
        blocked: plan.blocked,
      },
      phrase
    )
  );

  /**
   * THE IDLE VERB, WHICH PROMISES NOTHING IT WILL NOT DO: counted where a count is true and
   * uncounted where nothing can go, since `Delete 0 components…` promises an outcome and
   * `Delete 2 components…` over a fully-held selection promises a false one.
   */
  const deleteLabel = $derived(
    deleteNote.refused
      ? text('FABRICATE.Admin.Manager.Scoped.Component.BulkDeleteNone', 'Delete from the world…')
      : deletableCount === 1
        ? text('FABRICATE.Admin.Manager.Scoped.Component.BulkDeleteOne', 'Delete 1 component…')
        : phrase(
            'FABRICATE.Admin.Manager.Scoped.Component.BulkDelete',
            'Delete {count} components…',
            {
              count: deletableCount,
            }
          )
  );

  /**
   * THE ARMED LABEL BRANCHES, AND THE CONTROL NEVER GOES `disabled` — `ui-integration/spec.md`
   * `### Scoped entity editor patterns` requirement 16 states both halves and why: a disabled
   * button satisfies any assertion that the delete did not happen while explaining nothing, and
   * the armed label is what states the outcome before the second press takes it.
   */
  const deleteArmedLabel = $derived(
    // The ARMED accessible name carries the same sentence the note states, so the two agree.
    deleteNote.refused
      ? text('FABRICATE.Admin.Manager.Scoped.Component.DeleteBlocked', 'Cannot delete')
      : phrase(
          'FABRICATE.Admin.Manager.Scoped.Component.BulkDeleteArmed',
          'Confirm — delete {count} from the world',
          { count: deletableCount }
        )
  );

  // BUILT FROM THE MODEL, NOT RE-DECLARED BESIDE IT: the panel used to spell both labels and both
  // notes inline while the model stated them with no consumer — two implementations of one meaning.
  const membershipModes = $derived(componentBulkMembershipModes(phrase));
  const modeSegments = $derived(
    membershipModes.map((entry) => ({
      value: entry.id,
      labelKey: '',
      fallback: entry.label,
      icon: entry.icon,
    }))
  );

  // WHAT THE STAGED DIRECTION WILL DO: `Add to` and `Remove from` alone restate the highlighted
  // segment, where these state the blast radius a GM is deciding on.
  const modeNote = $derived(
    membershipModes.find((candidate) => candidate.id === mode)?.note ??
      text(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkModeIdle',
        'Choose a direction, then the systems it applies to.'
      )
  );

  // THE THREE INSETS, EACH AS ONE DESCRIPTOR: the snippet below renders whichever it is handed,
  // so what differs between systems, categories and tags is this data and nothing about markup.
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
    componentBulkPickerPage(systemItems, { query: systemView.query, pageIndex: systemView.page })
  );
  const categoryPageView = $derived(
    componentBulkPickerPage(categoryItems, {
      query: categoryView.query,
      pageIndex: categoryView.page,
    })
  );
  const tagPageView = $derived(
    componentBulkPickerPage(tagItems, { query: tagView.query, pageIndex: tagView.page })
  );

  const stagedLabel = $derived(
    text('FABRICATE.Admin.Manager.Scoped.Component.BulkStaged', 'Staged')
  );

  const systemInset = $derived({
    id: 'systems',
    query: systemView.query,
    onQuery: systemView.onQuery,
    placeholder: text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkSystemSearch',
      'Search systems'
    ),
    empty: text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkSystemNoMatch',
      'No crafting system matches that search.'
    ),
    // THE DIRECTION GATES THE SET: staging systems under `Unchanged` would compose an instruction
    // with a target and no verb.
    disabled: mode === UNCHANGED,
    page: systemPageView,
    onPage: systemView.onPage,
    onChoose: (id) => toggleSystem(id),
    // THE ROW'S LEADING EDGE IS A CHECK BOX, NOT A GLYPH (`proto:5273`, M24).
    kind: 'check',
    rows: systemPageView.rows.map((item) => ({
      id: item.id,
      name: item.name,
      state: stagedSystemIds.includes(item.id) ? 'on' : 'off',
      meta: stagedSystemIds.includes(item.id) ? stagedLabel : '',
    })),
  });

  const categoryInset = $derived({
    id: 'category',
    query: categoryView.query,
    onQuery: categoryView.onQuery,
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
    onPage: categoryView.onPage,
    onChoose: (id) => {
      if (!inert) stagedCategory = id;
    },
    kind: 'radio',
    rows: categoryPageView.rows.map((item) => ({
      id: item.id,
      name: item.name,
      state: stagedCategory === item.id ? 'on' : 'off',
      meta: stagedCategory === item.id ? stagedLabel : '',
    })),
  });

  const tagInset = $derived({
    id: 'tags',
    query: tagView.query,
    onQuery: tagView.onQuery,
    placeholder: text('FABRICATE.Admin.Manager.Scoped.Component.BulkTagSearch', 'Search tags'),
    empty: text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkTagNoMatch',
      'No world tag matches that search.'
    ),
    disabled: false,
    page: tagPageView,
    onPage: tagView.onPage,
    onChoose: (id) => cycleTag(id),
    kind: 'tri',
    rows: tagPageView.rows.map((item) => ({
      id: item.id,
      name: item.name,
      state: stagedTags[item.id] ?? 'off',
      meta: stagedTags[item.id] ? tagDirectionLabel(item.id) : '',
    })),
  });

  function toggleSystem(systemId) {
    if (inert || !systemId || mode === UNCHANGED) return;
    stagedSystemIds = stagedSystemIds.includes(systemId)
      ? stagedSystemIds.filter((id) => id !== systemId)
      : [...stagedSystemIds, systemId];
  }

  // THREE STATES, CYCLED IN ONE DIRECTION: unchanged, add, remove. A row that only toggled would
  // leave no way back to "leave this tag alone" on a panel whose point is a partial instruction.
  function cycleTag(tag) {
    if (inert || !tag) return;
    const next = { ...stagedTags };
    if (next[tag] === 'add') next[tag] = 'remove';
    else if (next[tag] === 'remove') delete next[tag];
    else next[tag] = 'add';
    stagedTags = next;
  }

  // THE TWO DIRECTIONS MUST NOT LOOK ALIKE. `muted` and `neutral` differ only in their ink token,
  // so "staged for removal" and "leave alone" were the same chip; `warning` is the family that
  // means "this will take something away", and the glyph carries the state where colour cannot.
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

  /** One chip's accessible name, which is where the DIRECTION lives. */
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

  /** Stage one essence's value, or unstage it (M25); the inset walks the states, this owns the map. */
  function stageEssence(essenceId, value) {
    if (inert || !essenceId) return;
    const next = { ...stagedEssences };
    if (value === null || value === undefined) delete next[essenceId];
    else next[essenceId] = Math.max(0, Number(value) || 0);
    stagedEssences = next;
  }

  /**
   * The shared inset's stepper report, read as the reference reads its own (`proto:5629-5631`):
   * a cleared field or a step below zero UNSTAGES, `0` STRIPS, anything above is a value.
   */
  function stageEssenceStep(essenceId, next) {
    if (next === null || next === undefined || Number(next) < 0) stageEssence(essenceId, null);
    else stageEssence(essenceId, Math.min(9, Number(next)));
  }

  function applyStaged() {
    if (!canApply) return;
    onApply({
      mode: membershipStaged ? mode : UNCHANGED,
      systemIds: membershipStaged ? [...stagedSystemIds] : [],
      category: categoryStaged ? (stagedCategory === NO_CATEGORY ? '' : stagedCategory) : null,
      addTags: [...addTags],
      removeTags: [...removeTags],
      essences: { ...stagedEssences },
    });
    mode = UNCHANGED;
    stagedSystemIds = [];
    stagedCategory = UNCHANGED;
    stagedTags = {};
    stagedEssences = {};
  }
</script>

<!--
  THE THREE PER-SITE PARAMETERS THIS PANEL ASKS `BulkEditPanelShell` FOR, each defaulting to what
  ships so the Component, Recipe and Essence Studios are untouched: `clearLabel` (`proto:626`
  reads `Clear`, and the selection is the only thing it could clear), `hint` (naming the staging
  THIS panel offers), and `dockFoot` (the danger leg, which `proto:686`-`688` pins INSIDE the dock
  and which rendered as the panel's last content — the right reading order in the wrong box).
-->
<BulkEditPanelShell
  heading={headingLabel}
  {applyLabel}
  {canApply}
  clearLabel={text('FABRICATE.Admin.Manager.BulkEdit.Clear', 'Clear')}
  hint={text(
    'FABRICATE.Admin.Manager.Scoped.Component.BulkStagingHint',
    'Pick the systems to add them to, stage a category, tags or essence values, then commit below.'
  )}
  panelAttr="data-world-component-bulk-panel"
  clearAttr="data-world-component-bulk-clear"
  countAttr="data-world-component-bulk-count"
  applyAttr="data-world-component-bulk-apply"
  dockBleed="space-4"
  {onClearSelection}
  onApply={applyStaged}
  dockFoot={onDelete ? componentBulkDanger : undefined}
>
  <!--
    THE STANDING EXPLANATION IS SECOND, DIRECTLY UNDER THE REGISTER (`proto:618`): it says what
    CANNOT be bulk-edited, so it belongs before the groups a GM is about to read rather than after
    the decision they have made. INFO IS RETAINED AND THE JUDGEMENT IS RECORDED (issue 1505): the
    widened tone union would put a standing note at neutral, but `proto:618` and `proto:1110` ask
    for the tint on this note and its per-system twin. Whether a prototype anchor outranks the
    tone rule is issue 1580's question, and this pair moves under it or not at all.
  -->
  <Callout
    tone="info"
    text={text(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkPerComponentNote',
      'Names and source links stay per component. What you can change in bulk is which systems these components belong to, and their world category, tags and essence values — the values every system inherits unless it overrides.'
    )}
    dataAttr="data-world-component-bulk-per-component-note"
  />

  <BulkEditSection
    label={text('FABRICATE.Admin.Manager.Scoped.Component.BulkMembership', 'Membership change')}
  />
  <SegmentedControl
    fill={true}
    tone="accent"
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
  <!-- BELOW the control, where `proto:625` writes it: the note describes what the chosen direction
       will do, so it reads as a consequence rather than an instruction about an unreached control. -->
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
    <!-- THE STAGED RUN, above the inset exactly as `proto:706` draws it: the one place the
         DIRECTION is painted rather than listed, which is why the chips survive the move. -->
    <div class="fab-bulk-component-chips" data-world-component-bulk-tags>
      {#each [...addTags, ...removeTags] as tag (tag)}
        <!-- `aria-pressed` REPORTS STAGED-VERSUS-UNSTAGED AND NOTHING ELSE, which is all a
             two-state attribute can honestly say about a three-state control. The DIRECTION is
             in the accessible NAME, which has room for it. -->
        <Chip
          tag="button"
          type="button"
          density="inspector"
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
        'No world tags are authored yet. Create them in Tags & Categories first.'
      )}
    </p>
  {/if}

  <!--
    THE ESSENCE VALUES GROUP (M25), drawn by the inset the system panel also draws. IT WRITES THE
    WORLD SECTION (M31, superseding M25's route): one `updateWorldDefaultSection(id, 'essences',
    map)` per record whose map changes, which every inheriting system follows at once. M25's write
    went into each component's IN-SYSTEM rules, which no world screen reads.
  -->
  <BulkEditSection
    label={text('FABRICATE.Admin.Manager.BulkEdit.EssenceValues', 'Essence values')}
    hint={componentBulkEssenceHint(stagedEssences, phrase)}
    trailing={essencesStaged ? clearEssences : undefined}
  />
  {#if essenceRoster.length > 0}
    {#if stagedEssenceIds.length > 0}
      <!-- THE STAGED RUN, above the inset as `proto:1189` draws it: a `positive` chip for a value,
           a `danger` chip reading `removed` for a strip. A chip is a button, and the click unstages. -->
      <div class="fab-bulk-component-chips" data-world-component-bulk-essence-chips>
        {#each stagedEssenceIds as id (id)}
          {@const essence = essenceRoster.find((candidate) => candidate.id === id)}
          {@const value = Number(stagedEssences[id]) || 0}
          <Chip
            tag="button"
            type="button"
            density="inspector"
            tone={value > 0 ? 'positive' : 'danger'}
            icon={essence?.icon ?? ''}
            data-world-component-bulk-essence-chip={id}
            data-world-component-bulk-essence-chip-state={value > 0 ? 'set' : 'strip'}
            aria-label={phrase(
              'FABRICATE.Admin.Manager.BulkEdit.EssenceUnstage',
              'Unstage {name}',
              {
                name: essence?.name ?? id,
              }
            )}
            disabled={inert}
            onclick={() => stageEssence(id, null)}
            >{essence?.name ?? id}
            {value > 0 ? value : text('FABRICATE.Admin.Manager.BulkEdit.EssenceRemoved', 'removed')}
            <i class="fas fa-xmark" aria-hidden="true"></i></Chip
          >
        {/each}
      </div>
    {/if}
    <BulkStagingInset
      id="essences"
      kind="stepper"
      rows={essenceRows}
      rowAttr="data-world-component-bulk-essence"
      rowStateAttr="data-world-component-bulk-essence-state"
      inputAttr="data-world-component-bulk-essence-input"
      onStep={stageEssenceStep}
      query={essenceView.query}
      onQuery={essenceView.onQuery}
      placeholder={text('FABRICATE.Admin.Manager.BulkEdit.EssenceSearch', 'Search essences')}
      page={essencePageView}
      onPage={essenceView.onPage}
      empty={text(
        'FABRICATE.Admin.Manager.BulkEdit.EssenceNoMatch',
        'No essence matches that search.'
      )}
      hasRows={essenceRows.length > 0}
      disabled={inert}
    />
    <p class="fab-bulk-component-note" data-world-component-bulk-essence-note>
      {phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkEssenceNote',
        'Every row starts unchanged. Step a value up to set it as the world value on all {count}, which every system that inherits it follows; step down to 0 to strip that essence from them. A system that overrides keeps its own.',
        { count }
      )}
    </p>
  {:else}
    <p class="manager-muted fab-bulk-component-empty" data-world-component-bulk-essences-empty>
      {text(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkNoEssences',
        'No world essences are defined yet. Create them in the Essence catalogue first.'
      )}
    </p>
  {/if}
</BulkEditPanelShell>

<!--
  EVERY `<button>` BELOW DECLARES `data-keyboard-focus="true"`, AND IT IS NOT DECORATION.
  `KeyboardManager#hasFocus` returns `!!focused.form` for a BUTTON and this route renders no form,
  so while one of these held focus the window read as UNFOCUSED and every core keybinding stayed
  live: Space pauses the game, the arrows pan the canvas behind the manager.
  `tests/design-system-keyboard-focus.test.js` is the gate, and all six arrived with this panel.
-->
<!--
  THE DANGER LEG, IN THE DOCK. `proto:686`-`688` pins the destructive verb and its consequence
  note INSIDE the pinned dock; it shipped as the panel's last CONTENT, so a GM who had scrolled
  could have the Apply in front of them and the delete somewhere above. The sibling card and the
  dock foot are alternatives, not a pair.

  IT REFUSES WHAT THE ENTRY REFUSES (epic decision 7): the plan splits the selection, the button
  counts and writes only the free records, and the note NAMES the held ones and their systems.
  THE CONTROL STAYS ENABLED EVEN WHEN NOTHING CAN GO, which is requirement 16's own rule, so the
  ARMED label is what states the outcome.
-->
{#snippet componentBulkDanger()}
  <div class="fab-bulk-component-danger" data-world-component-bulk-danger>
    <ArmedDangerButton
      token="world-component-bulk-delete"
      armed={deleteArmed}
      busy={deleting === true}
      disabled={applying === true}
      idleLabel={deleteLabel}
      armedLabel={deleteArmedLabel}
      busyLabel={text('FABRICATE.Admin.Manager.Scoped.Component.BulkDeleteBusy', 'Deleting…')}
      idleAriaLabel={deleteLabel}
      armedAriaLabel={`${deleteArmedLabel} — ${deleteNote.text}`}
      describedBy="world-component-bulk-delete-note"
      onArm={() => (deleteArmed = true)}
      onDisarm={() => (deleteArmed = false)}
      onConfirm={() => {
        deleteArmed = false;
        onDelete();
      }}
    />
    <p
      class="fab-bulk-component-note"
      id="world-component-bulk-delete-note"
      data-world-component-bulk-delete-note={deleteNote.refused ? 'refused' : 'proceed'}
    >
      {deleteNote.text}
    </p>
  </div>
{/snippet}

{#snippet clearSystems()}
  <button
    type="button"
    class="fab-bulk-component-clear"
    data-keyboard-focus="true"
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
    data-keyboard-focus="true"
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
    data-keyboard-focus="true"
    data-world-component-bulk-clear-tags
    disabled={inert}
    onclick={() => (stagedTags = {})}
  >
    {text('FABRICATE.Admin.Manager.BulkEdit.Clear', 'Clear')}
  </button>
{/snippet}

{#snippet clearEssences()}
  <button
    type="button"
    class="fab-bulk-component-clear"
    data-keyboard-focus="true"
    data-world-component-bulk-clear-essences
    disabled={inert}
    onclick={() => (stagedEssences = {})}
  >
    {text('FABRICATE.Admin.Manager.BulkEdit.Clear', 'Clear')}
  </button>
{/snippet}

<!--
  ONE INSET, RENDERED THREE TIMES (`proto:628`-`697`), AND IT IS `BulkStagingInset`'S: the search
  well, the row window, the pager and the rows are the shared component's, drawn from this panel's
  descriptors — what a row means, what pressing it does, and what it says when it is staged.
-->
{#snippet stagingInset(inset)}
  <BulkStagingInset
    id={inset.id}
    kind={inset.kind}
    rows={inset.rows}
    rowAttr="data-world-component-bulk-option"
    rowStateAttr="data-world-component-bulk-option-state"
    onRow={inset.onChoose}
    query={inset.query}
    onQuery={inset.onQuery}
    placeholder={inset.placeholder}
    page={inset.page}
    onPage={inset.onPage}
    empty={inset.empty}
    hasRows={inset.rows.length > 0}
    disabled={inert}
    rowsDisabled={inset.disabled}
  />
{/snippet}

<style>
  /* STATIC class names, so `lint:svelte:warnings` stays at zero. */
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

  /* A group head's trailing Clear: bare type, with Foundry's host button geometry reset. */
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

  /* THE DANGER LEG RENDERS INSIDE THE SHELL'S DOCK, and this rule still reaches it: a snippet
     carries the scope hash of the component that DEFINES it, not of the one that renders it. It
     states no spacing above itself, because the dock's own `has-foot` rhythm owns that gap. */
  .fab-bulk-component-danger {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
  }
</style>
