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

  Props:
   - open: whether the dialog is mounted at all.
   - systemId / systemName: which system is being added to. `systemName` is the title's subject.
   - entries: the world component scope's `entries` projection, unfiltered.
   - onAdd(entityId): the composed adoption for ONE record. Awaited; a `false` return stops the
     run, because the next write would be issued against a payload the failed one may have left.
   - onClose(): dismiss. Called by the chrome's close control, by Cancel, and after a run.
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
   * Adopt every ticked record, one at a time, then close.
   *
   * The selection is read in the OFFER's order rather than in tick order, so two GMs ticking the
   * same rows in a different sequence produce the same sequence of writes.
   */
  async function apply() {
    if (applying) return;
    const targets = selectedOffered.map((row) => row.id);
    if (targets.length === 0) return;
    applying = true;
    try {
      for (const entityId of targets) {
        if ((await onAdd(entityId)) === false) return;
      }
    } finally {
      applying = false;
    }
    selectedIds = new Set();
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
    'New rules start empty. Nothing is inherited from the catalogue.'
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

    {#if visible.length === 0}
      <p class="manager-muted" data-component-add-from-catalogue-empty>
        {offered.length === 0
          ? format(
              'FABRICATE.Admin.Manager.Component.AddFrom.EmptyAll',
              '{system} already has rules for every component in the catalogue.',
              { system: systemName }
            )
          : text(
              'FABRICATE.Admin.Manager.Component.AddFrom.EmptySearch',
              'No catalogue component matches that search.'
            )}
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

  /* The footer note leads the rail; `ManagerModal`'s footer is `justify-content: flex-end`, so
     the note claims the free space rather than the buttons. */
  .manager-component-add-from-count {
    margin-right: auto;
    color: var(--fab-text-subtle);
    font-weight: 500;
    font-size: 0.69rem;
  }
</style>
