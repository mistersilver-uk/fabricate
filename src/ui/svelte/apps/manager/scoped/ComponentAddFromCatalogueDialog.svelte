<!-- Svelte 5 runes mode -->
<!--
  `Add from catalogue to {system}` — the system Component Rules list's header action (M9,
  `proto:1046` → `d.sl.onAddFrom` → `proto:5545` → the `addFrom` modal at `proto:6027-6039`).

  == WHAT THIS REPLACES, AND WHY IT IS A DIALOG RATHER THAN A ROUTE ==========================
  Revision 5 shipped the header action as `openWorldScopedEntry('world-component-catalogue', '')`.
  `world-component-catalogue` is a VIEW LAB CASE ID, not a route token: it is in no route table,
  the view chain has no branch for it, and the root's navigation helper assigns whatever token it
  is handed — so the control dropped the GM on the crafting-systems library with no world rail
  leaf lit. The maintainer ruled (M9) that the fix is the reference's own answer: an IN-PLACE
  picker, not a corrected route. Navigating away is the wrong verb for it — the GM is standing on
  the list they want the components to appear in, and the whole point of the reference's modal is
  that they stay there and watch the rows arrive.

  == WHAT IT LISTS ==========================================================================
  `CAT.filter(c => !this.has(c.id, S.sysId))` — the world catalogue records this system has NO
  membership record for. Not "everything", and not "everything minus what is on screen": the
  filter is over the world corpus against this system's membership, so a component hidden by the
  list's own search or category filter is still correctly absent from here if the system holds it.
  The non-member predicate is computed HERE rather than passed in precisely so a mounted test can
  drive it; a caller that pre-filtered would leave the rule untested wherever it actually lives.

  == THREE DEPARTURES FROM THE REFERENCE, EACH NAMED ========================================
  1. A SEARCH FIELD, which `proto:6027-6039` does not draw. The reference's fixture holds a dozen
     catalogue entries; a real world holds hundreds, and a modal that can only be scrolled is the
     standing objection to a surface that enumerates a corpus. Assigned by the revision-8 brief.
  2. THE APPLY LABEL reads `Add {n} to {system}`; `proto:6055` writes `Create rules` for every
     modal in the family. Assigned by the brief, and it is the more accurate of the two here —
     this action adopts EXISTING catalogue records into a system, and a GM who has ticked three
     rows is told how many and where.
  3. THE BODY SCROLLS RATHER THAN PAGES, which IS the reference (`max-height: 80%; overflow:
     auto`). It is a bounded box with a search over it, not a page-length column under a pager
     that counts a different list — which is the specific defect the system list's own ghost
     cohort was corrected for in this same revision.

  == THE WRITE IS SEQUENTIAL, BEHIND ONE IN-FLIGHT FLAG ======================================
  The bulk-apply precedent (`WorldComponentCataloguePage.applyBulk`) states the reason at length:
  every world-scope action loads the persisted payload, edits it and writes it back, so a
  `Promise.all` over N adoptions would have N writers racing one setting and the last one home
  would carry only its own edit. The flag ALSO inerts the Apply, so the guard is reachable.

  It calls ONE seam, `onAdd(entityId)`, which the root binds to the COMPOSED `addToSystem` — the
  verb that writes both the membership record and the in-system row. A dialog that wrote the
  membership half alone would leave every adopted component invisible to the list it was adopted
  into.

  == A REFUSAL IS REPORTED, AND THE RUN CONTINUES (issue 1371, r11) =========================
  `openspec/specs/ui-integration/spec.md` `### GM World Component Screens` requirement 6 is
  explicit about this exact write: the refusal is REPORTED rather than thrown, so a bulk apply
  continues through its remaining pairs instead of abandoning the run at the first collision.
  `WorldComponentCataloguePage.applyBulk` already does that and this dialog did not — it returned
  at the first `false`, so a GM who ticked eight rows and hit one duplicate-source collision got
  one adoption, one notification and six rows silently skipped.

  The reason the first draft gave — that "the next write would be issued against a payload the
  failed one may have left" — is NOT TRUE of the shipped store. `joinComponentToSystem` catches
  its own refusal, removes the membership record THAT CALL wrote, notifies, and only then answers
  `false`; the refusal it catches (`_assertUniqueComponentSourcesForSystem`) is raised before the
  system is persisted at all. So there is no half-written payload for the next target to land on,
  and stopping the run cost the GM the other seven adoptions for nothing.

  What a refusal leaves behind is therefore stated rather than guessed: the adopted records leave
  the offer on the next projection, the refused ones stay TICKED so the GM can see which ones did
  not land, the count of them is said in the dialog beside the notifications the store raised, and
  the dialog stays OPEN. It closes only when every target succeeded — closing on a partial run
  would hide the failures behind the screen the GM was returned to.

  == ITS PER-OPEN STATE IS RE-SEEDED ON THE OPEN TRANSITION (issue 1371, r11) ===============
  This dialog is mounted UNCONDITIONALLY at the manager root and takes `open` as a prop, and
  `ManagerModal` gates only its CHROME behind `{#if open}` — so this component instance, and with
  it `query`, `selectedIds` and `applying`, lives for the whole manager session. Cancel reset
  none of them: ticking two rows in one system, cancelling, selecting another system and
  reopening showed the same two rows ticked and an ENABLED `Add 2 to {the other system}`.

  The fix is the shipped one from the sibling dialog mounted at the same level
  (`ImportFolderMappingModal.svelte`): an `$effect` keyed on the open transition that re-seeds the
  per-open state. The key carries `systemId` as well as `open`, because the offer and the
  selection must not be able to disagree about which system is being added to, and a re-open
  against a DIFFERENT system is the case that made this reachable at all.

  The same effect lands focus inside the dialog, as the sibling's does. Without it the GM's focus
  stays on the header button BEHIND an `aria-modal="true"` dialog, and a plain Tab walks the page
  underneath it.

  Props:
   - open: whether the dialog's chrome is rendered. NOT whether this component is mounted — see
     the re-seed note above.
   - systemId / systemName: which system is being added to. `systemName` is the title's subject.
   - entries: the world component scope's `entries` projection, unfiltered.
   - onAdd(entityId): the composed adoption for ONE record. Awaited. Anything other than `true` is
     a REFUSAL: the run continues, the record stays ticked and the dialog stays open. `!== true`
     rather than `=== false` because the composed verb answers "whether anything was written", and
     a caller whose optional chain answers `undefined` has written nothing either.
   - onClose(): dismiss. Called by the chrome's close control, by Cancel, and after a run in which
     every target succeeded.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { componentSourceLine } from './componentScoped.js';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import ManagerModal from '../ManagerModal.svelte';
  import ManagerSearchField from '../../../components/ManagerSearchField.svelte';
  import SelectionCheckbox from '../../../components/SelectionCheckbox.svelte';

  let {
    open = false,
    systemId = '',
    systemName = '',
    entries = [],
    onAdd = async () => {},
    onClose = () => {},
  } = $props();

  let query = $state('');
  let selectedIds = $state(new Set());
  let applying = $state(false);
  // How many of the LAST run's targets the composed write refused. Zero at every other moment,
  // because the sentence it drives is about a run that has just finished.
  let refusedCount = $state(0);

  /**
   * The open transition this instance has already been seeded for.
   *
   * A PLAIN `let`, not `$state`: the effect below writes it, and a reactive value written by the
   * effect that reads it re-runs that effect forever. `ImportFolderMappingModal` uses the same
   * plain-key form for the same reason.
   */
  let seededOpenKey = '';

  // RE-SEED ON THE OPEN TRANSITION, KEYED ON THE SUBJECT AS WELL AS THE FLAG (issue 1371, r11).
  // See the "per-open state" note in the header: the instance outlives every open, so `Cancel`
  // used to leave a selection armed against whichever system was chosen next. `systemId` is in
  // the key because a re-open against a DIFFERENT system is exactly the case that made a stale
  // selection dangerous rather than merely untidy.
  $effect(() => {
    const key = `${open ? 'open' : 'closed'}|${systemId}`;
    if (key === seededOpenKey) return;
    seededOpenKey = key;
    if (!open) return;
    query = '';
    selectedIds = new Set();
    applying = false;
    refusedCount = 0;
    focusIntoDialog();
  });

  /**
   * Land keyboard focus on the picker's search field once the portaled panel has mounted.
   *
   * WHY IT IS A QUERY RATHER THAN A `bind:this`. `ManagerModal` owns the dialog root and
   * `ManagerSearchField` owns the input, and neither publishes an element seam; wrapping the
   * field in a `bind:this` element of this component's own is not free either, because
   * `.manager-search` is `flex: 1 1 260px` and only behaves as a field while it is a FLEX ITEM of
   * the panel. So the lookup goes through this dialog's own two stable hooks — the panel's root
   * and the search input inside it — which is a narrower query than the `document.querySelector`
   * for an application root that issue 1466 removed, and it cannot resolve into another dialog.
   *
   * `queueMicrotask` for the sibling's reason (`ImportFolderMappingModal.svelte`): the panel is
   * PORTALED, so it is not in the document yet at the moment the effect runs.
   *
   * @returns {void}
   */
  function focusIntoDialog() {
    queueMicrotask(() => {
      const panel = globalThis.document?.querySelector?.(
        '[data-component-add-from-catalogue-dialog]'
      );
      panel?.querySelector?.('[data-component-add-from-catalogue-search]')?.focus?.();
    });
  }

  function text(key, fallback) {
    if (!key) return fallback ?? '';
    const translated = localize(key);
    return translated && translated !== key ? translated : (fallback ?? key);
  }

  /**
   * The English fallback's own `{token}` substitution, matching the fourteen shipped sites.
   *
   * NOT routed through `game.i18n.format`: the bridge's `format` returns the KEY for a missing
   * string, which defeats the fallback every call site here depends on.
   *
   * @param {string} key
   * @param {string} fallback
   * @param {object} data
   * @returns {string}
   */
  function format(key, fallback, data = {}) {
    let out = text(key, fallback);
    for (const [name, value] of Object.entries(data)) out = out.replaceAll(`{${name}}`, value);
    return out;
  }

  /** Whether this system already holds a rules record for one world entry. */
  function heldHere(entry) {
    return (Array.isArray(entry?.systems) ? entry.systems : []).some(
      (row) => row?.systemId === systemId && row?.member === true
    );
  }

  // THE OFFER, IN THE CATALOGUE'S OWN ORDER. Sorted by name so the list is answerable, which the
  // reference's fixture gets for free from a hand-ordered array and a real corpus does not.
  const offered = $derived(
    (Array.isArray(entries) ? entries : [])
      .filter((entry) => entry?.id && !heldHere(entry))
      .map((entry) => ({
        id: String(entry.id),
        name: String(entry.entity?.name || entry.id),
        // `c.src` IN THE REFERENCE, WHICH IS THE SOURCE AND NOT THE DESCRIPTION. The captured
        // prototype frame writes `Foundry item` / `Compendium` under each name, and that is the
        // one fact a GM deciding whether to adopt a record needs: what it IS. This is the shipped
        // `componentSourceLine`, the same answer the catalogue inspector and the world entry's
        // header draw, so the three sites cannot disagree about a record's source. Round 8's
        // first draft read `entity.description` and rendered blank for most of the corpus,
        // because a world record's description is a snapshot only a linked creation fills.
        meta: componentSourceLine(entry, text),
        // `memberSys(c.id).length + ' other systems'` — how much of the world already holds it,
        // which is the one fact that tells a GM whether this is a well-established record.
        memberCount: Number(entry.membershipCount) || 0,
      }))
      .sort((left, right) => left.name.localeCompare(right.name))
  );

  const visible = $derived(
    (() => {
      const needle = query.trim().toLowerCase();
      if (!needle) return offered;
      return offered.filter(
        (row) => row.name.toLowerCase().includes(needle) || row.meta.toLowerCase().includes(needle)
      );
    })()
  );

  // THE SELECTION IS PRUNED TO WHAT IS STILL OFFERED, not to what is VISIBLE. A search term that
  // hides a ticked row must not silently drop it — the GM narrowed the list, they did not untick
  // anything — but a row that has left the offer entirely (it was adopted, or the corpus changed
  // under the dialog) has to go, or the count and the Apply would both name a record this system
  // already holds.
  // WHETHER THE WORLD HAS A CATALOGUE AT ALL, which is a different fact from an exhausted offer.
  // Read off the raw `entries` rather than off `offered`, because `offered` is zero for both.
  const catalogueIsEmpty = $derived((Array.isArray(entries) ? entries : []).length === 0);

  const selectedOffered = $derived(offered.filter((row) => selectedIds.has(row.id)));
  const selectedCount = $derived(selectedOffered.length);

  function toggle(entityId, next) {
    // COPY-THEN-REASSIGN, the shipped idiom (`RecipesBrowserView.toggleGroup`): the reactive unit
    // is the `selectedIds` binding, not the Set, and every reader of it is a `$derived` over the
    // whole value. A `SvelteSet` mutated in place would be the other shape and is not needed for
    // one field local to this dialog.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const ids = new Set(selectedIds);
    if (next) ids.add(entityId);
    else ids.delete(entityId);
    selectedIds = ids;
  }

  function dismiss() {
    if (applying) return;
    onClose();
  }

  /**
   * Adopt every ticked record, one at a time, and close only if every one of them landed.
   *
   * The selection is read in the OFFER's order rather than in tick order, so two GMs ticking the
   * same rows in a different sequence produce the same sequence of writes.
   *
   * A REFUSAL DOES NOT ABANDON THE RUN. See the header note: requirement 6 of `### GM World
   * Component Screens` states that the composed verb reports its refusal and a bulk apply carries
   * on, which is what `WorldComponentCataloguePage.applyBulk` does with the same seam. The
   * refused ids are the NEXT selection, so the adopted rows drop out of the offer and the refused
   * ones stay ticked under a sentence saying how many there were.
   *
   * @returns {Promise<void>}
   */
  async function apply() {
    if (applying) return;
    const targets = selectedOffered.map((row) => row.id);
    if (targets.length === 0) return;
    applying = true;
    const refused = [];
    try {
      for (const entityId of targets) {
        // `!== true`, not `=== false`: the composed verb answers whether anything was WRITTEN, so
        // a `false` refusal and an `undefined` from a seam that is not wired are the same fact.
        if ((await onAdd(entityId)) !== true) refused.push(entityId);
      }
    } finally {
      applying = false;
    }
    selectedIds = new Set(refused);
    refusedCount = refused.length;
    if (refused.length > 0) return;
    query = '';
    onClose();
  }

  const applyLabel = $derived(
    format('FABRICATE.Admin.Manager.Component.AddFrom.Apply', 'Add {count} to {system}', {
      count: selectedCount,
      system: systemName,
    })
  );
</script>

<ManagerModal
  {open}
  title={format(
    'FABRICATE.Admin.Manager.Component.AddFrom.Title',
    'Add from catalogue to {system}',
    { system: systemName }
  )}
  subtitle={text(
    'FABRICATE.Admin.Manager.Component.AddFrom.Subtitle',
    'New rules start empty; the world category is inherited until this system overrides it.'
  )}
  closeLabel={text('FABRICATE.Admin.Manager.Component.AddFrom.Close', 'Close')}
  rootAttributes={{ 'data-component-add-from-catalogue-dialog': '' }}
  width="580px"
  onClose={dismiss}
>
  {#snippet body()}
    <ManagerSearchField
      bind:value={query}
      placeholder={text(
        'FABRICATE.Admin.Manager.Component.AddFrom.SearchPlaceholder',
        'Search the catalogue…'
      )}
      ariaLabel={text(
        'FABRICATE.Admin.Manager.Component.AddFrom.SearchLabel',
        'Search catalogue components'
      )}
      inputAttrs={{ 'data-component-add-from-catalogue-search': '' }}
    />

    {#if refusedCount > 0}
      <!-- THE RUN'S REFUSALS, COUNTED. The store raises one notification per refusal with the
           reason in it; this says how many there were and why the ticks are still here, which a
           transient toast cannot. `role="status"` rather than `alert`: the run finished, and the
           GM is being told what it did rather than interrupted. -->
      <p
        class="manager-component-add-from-refused"
        role="status"
        data-component-add-from-catalogue-refused
      >
        {format(
          refusedCount === 1
            ? 'FABRICATE.Admin.Manager.Component.AddFrom.RefusedOne'
            : 'FABRICATE.Admin.Manager.Component.AddFrom.Refused',
          refusedCount === 1
            ? '{count} component could not be added and is still selected here.'
            : '{count} components could not be added and are still selected here.',
          { count: refusedCount }
        )}
      </p>
    {/if}

    {#if visible.length === 0}
      <p class="manager-muted" data-component-add-from-catalogue-empty>
        <!-- THREE STATES, THREE SENTENCES. `EmptyAll` used to answer for two of them, so a world
             with no world components at all was told this system "already has rules for every
             component in the catalogue" — which on a fresh world is false in both halves. An
             empty catalogue is a fact about the WORLD; an exhausted offer is a fact about this
             system; an empty search is a fact about what the GM just typed. -->
        {#if offered.length > 0}
          {text(
            'FABRICATE.Admin.Manager.Component.AddFrom.EmptySearch',
            'No catalogue component matches that search.'
          )}
        {:else if catalogueIsEmpty}
          {text(
            'FABRICATE.Admin.Manager.Component.AddFrom.EmptyCatalogue',
            'The world component catalogue is empty, so there is nothing to add from yet.'
          )}
        {:else}
          {format(
            'FABRICATE.Admin.Manager.Component.AddFrom.EmptyAll',
            '{system} already has rules for every component in the catalogue.',
            { system: systemName }
          )}
        {/if}
      </p>
    {:else}
      <ul class="manager-component-add-from-list" role="list">
        {#each visible as row (row.id)}
          <li>
            <!-- THE WHOLE ROW IS THE TARGET, as the reference draws it (`proto:6053` binds the
                 click to the row, not to the box). A `<label>` around the shared selection
                 control gives that hit area to a pointer AND a real focusable input to the
                 keyboard, which the reference's `<div>` gives to neither. -->
            <label
              class={`manager-component-add-from-row ${selectedIds.has(row.id) ? 'is-picked' : ''}`}
              data-component-add-from-catalogue-row={row.id}
            >
              <SelectionCheckbox
                size="sm"
                wrapper="contents"
                checked={selectedIds.has(row.id)}
                disabled={applying}
                ariaLabel={format(
                  'FABRICATE.Admin.Manager.Component.AddFrom.SelectNamed',
                  'Add {name} to {system}',
                  { name: row.name, system: systemName }
                )}
                onChange={(next) => toggle(row.id, next)}
                data-component-add-from-catalogue-select={row.id}
              />
              <span class="manager-component-add-from-identity">
                <span class="manager-component-add-from-name">{row.name}</span>
                {#if row.meta}
                  <span class="manager-component-add-from-meta">{row.meta}</span>
                {/if}
              </span>
              <span class="manager-component-add-from-tag">
                {format(
                  row.memberCount === 1
                    ? 'FABRICATE.Admin.Manager.Component.AddFrom.MemberCountOne'
                    : 'FABRICATE.Admin.Manager.Component.AddFrom.MemberCount',
                  row.memberCount === 1 ? '{count} other system' : '{count} other systems',
                  { count: row.memberCount }
                )}
              </span>
            </label>
          </li>
        {/each}
      </ul>
    {/if}
  {/snippet}

  {#snippet footer()}
    <!-- `{n} selected` is the reference's own `footNote`, and it leads the rail (`proto:3752`)
         rather than trailing the actions. -->
    <span class="manager-component-add-from-count" data-component-add-from-catalogue-count>
      {format('FABRICATE.Admin.Manager.Component.AddFrom.SelectedCount', '{count} selected', {
        count: selectedCount,
      })}
    </span>
    <ManagerButton data-component-add-from-catalogue-cancel disabled={applying} onclick={dismiss}>
      {text('FABRICATE.Admin.Manager.Cancel', 'Cancel')}
    </ManagerButton>
    <ManagerButton
      role="primary"
      data-component-add-from-catalogue-apply
      disabled={applying || selectedCount === 0}
      onclick={apply}
    >
      <i class={applying ? 'fas fa-spinner fa-spin' : 'fas fa-plus'} aria-hidden="true"></i>
      <span>{applyLabel}</span>
    </ManagerButton>
  {/snippet}
</ManagerModal>

<style>
  /* The dialog's own body. `ManagerModal` owns the panel, the header and the footer rail; this
     block owns the two things between them — the search field's spacing and the picker list. */

  .manager-component-add-from-list {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-height: 0;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }

  /* `proto:6053`: `gap:10px;padding:9px 11px;border-radius:9px`. The padding pair snaps to the
     4px scale and the radius is the ROW rung, which is 9. */
  .manager-component-add-from-row {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-2);
    cursor: pointer;
  }

  /* The reference lifts a picked row onto the active surface and its accent hairline, which is
     what makes a multi-select legible without a second column of ticks. */
  .manager-component-add-from-row.is-picked {
    border-color: var(--fab-accent-border);
    background: var(--fab-surface-active);
  }

  .manager-component-add-from-identity {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .manager-component-add-from-name {
    color: var(--fab-text);
    font-weight: 600;
    font-size: 0.75rem;
    font-family: var(--fab-font-serif);
  }

  .manager-component-add-from-meta,
  .manager-component-add-from-tag {
    overflow: hidden;
    color: var(--fab-text-subtle);
    font-weight: 500;
    font-size: 0.6rem;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .manager-component-add-from-tag {
    flex: 0 0 auto;
  }

  /* The refusal line. Warning ink rather than danger: the run partly succeeded, and the records
     that did not land are still on offer and still ticked. */
  .manager-component-add-from-refused {
    margin: 0;
    color: var(--fab-warning-text);
    font-weight: 500;
    font-size: 0.69rem;
    line-height: 1.45;
  }

  /* The footer note leads the rail; `ManagerModal`'s footer is `justify-content: flex-end`, so
     the note claims the free space rather than the buttons. */
  .manager-component-add-from-count {
    margin-right: auto;
    color: var(--fab-text-subtle);
    font-weight: 500;
    font-size: 0.69rem;
  }
</style>
