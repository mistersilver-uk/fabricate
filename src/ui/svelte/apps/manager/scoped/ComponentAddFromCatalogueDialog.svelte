<!-- Svelte 5 runes mode -->
<!--
  `Add from catalogue to {system}` — the system Component Rules list's header action (M9,
  `proto:6027-6039`). A DIALOG rather than a route: the GM is standing on the list they want the
  components to appear in, and the point of the modal is that they stay and watch the rows arrive.
  It lists the world catalogue records this system holds NO membership record for, and that
  predicate is computed HERE so a mounted test can drive it. Three departures from the reference,
  each assigned by the brief: a SEARCH FIELD, an APPLY LABEL naming the act, and a scrolling body.

  THE WRITE IS SEQUENTIAL behind one in-flight flag, because every world-scope action reads, edits
  and writes back one setting. A REFUSAL IS REPORTED AND THE RUN CONTINUES (`### GM World
  Component Screens` requirement 6): refused records stay TICKED with their count stated, and the
  dialog closes only when every target landed. ITS PER-OPEN STATE IS RE-SEEDED ON THE OPEN
  TRANSITION, keyed on `systemId` as well as `open`, because the instance outlives every open; a
  RUN PINS ITS SUBJECT at entry, and the re-seed defers until the run lands.
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
  // How many of the LAST run's targets the composed write refused; zero at every other moment.
  let refusedCount = $state(0);

  /** A PLAIN `let`, not `$state`: a reactive key written by the effect that reads it never rests. */
  let seededOpenKey = '';

  // RE-SEED ON THE OPEN TRANSITION, KEYED ON THE SUBJECT AS WELL AS THE FLAG: a re-open against a
  // DIFFERENT system is what made a stale selection dangerous rather than untidy. AND IT WAITS
  // FOR A RUN TO LAND — `applying` is read here, never written, so while a run is open the key
  // is left unrecorded and the effect re-seeds the moment the flag falls.
  $effect(() => {
    const key = `${open ? 'open' : 'closed'}|${systemId}`;
    if (key === seededOpenKey) return;
    if (applying) return;
    seededOpenKey = key;
    if (!open) return;
    query = '';
    selectedIds = new Set();
    refusedCount = 0;
    focusIntoDialog();
  });

  /**
   * Land keyboard focus on the picker's search field once the portaled panel has mounted. A
   * QUERY rather than a `bind:this`, because neither `ManagerModal` nor `ManagerSearchField`
   * publishes an element seam and a wrapper would break `.manager-search`'s flex sizing; it goes
   * through this dialog's own two hooks. `queueMicrotask` because the panel is PORTALED.
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
   * The English fallback's own `{token}` substitution. NOT `game.i18n.format`, whose bridge
   * returns the KEY for a missing string and defeats the fallback every call site depends on.
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

  // THE OFFER, SORTED BY NAME so the list is answerable, which a hand-ordered fixture gets free.
  const offered = $derived(
    (Array.isArray(entries) ? entries : [])
      .filter((entry) => entry?.id && !heldHere(entry))
      .map((entry) => ({
        id: String(entry.id),
        name: String(entry.entity?.name || entry.id),
        // `c.src` IN THE REFERENCE, WHICH IS THE SOURCE AND NOT THE DESCRIPTION: what a record IS
        // is the fact a GM adopting it needs. The shipped `componentSourceLine`, so this, the
        // catalogue inspector and the entry header cannot disagree about a record's source.
        meta: componentSourceLine(entry, text),
        // How much of the world already holds it — whether this is a well-established record.
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

  // THE SELECTION IS PRUNED TO WHAT IS STILL OFFERED, not to what is VISIBLE: a search term that
  // hides a ticked row must not untick it, but a row that has left the offer has to go.
  // WHETHER THE WORLD HAS A CATALOGUE AT ALL is a different fact from an exhausted offer, read
  // off the raw `entries`, because `offered` is zero for both.
  const catalogueIsEmpty = $derived((Array.isArray(entries) ? entries : []).length === 0);

  const selectedOffered = $derived(offered.filter((row) => selectedIds.has(row.id)));
  const selectedCount = $derived(selectedOffered.length);

  function toggle(entityId, next) {
    // COPY-THEN-REASSIGN, the shipped idiom: the reactive unit is the `selectedIds` binding and
    // every reader is a `$derived` over the whole value, not a `SvelteSet` mutated in place.
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
   * Adopt every ticked record, one at a time, and close only if every one of them landed. The
   * selection is read in the OFFER's order, so two GMs ticking the same rows in a different
   * sequence produce the same writes. A REFUSAL DOES NOT ABANDON THE RUN: the refused ids are
   * the NEXT selection, so adopted rows drop out of the offer and refused ones stay ticked.
   */
  async function apply() {
    if (applying) return;
    const targets = selectedOffered.map((row) => row.id);
    if (targets.length === 0) return;
    // THE SUBJECT IS PINNED AT ENTRY, with the targets: `systemId` is a prop the root can change
    // under an open run, and a loop reading it live would land writes in an unticked system.
    const system = systemId;
    applying = true;
    const refused = [];
    try {
      for (const entityId of targets) {
        // `!== true`, not `=== false`: the composed verb answers whether anything was WRITTEN, so
        // a refusal and an `undefined` from an unwired seam are the same fact.
        if ((await onAdd(entityId, system)) !== true) refused.push(entityId);
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

  // The action names the ACT rather than restating the count and the system, which the foot note
  // and the title already draw (issue 1371 r12-list).
  const applyLabel = $derived(
    text('FABRICATE.Admin.Manager.Component.AddFrom.Apply', 'Create rules')
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
    'New rules inherit the world category and essence values until this system overrides them; nothing else is copied.'
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
      <!-- THE RUN'S REFUSALS, COUNTED: the store raises one notification each with its reason,
           and this says why the ticks are still here. `role="status"`, since the run finished. -->
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
        <!-- THREE STATES, THREE SENTENCES. An empty catalogue is a fact about the WORLD, an
             exhausted offer about this SYSTEM, and an empty search about what the GM typed; one
             sentence for the first two told a fresh world it already had rules for everything. -->
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
            <!-- THE WHOLE ROW IS THE TARGET (`proto:6053`). A `<label>` gives that hit area to a
                 pointer AND a real focusable input to the keyboard; the reference's `<div>` neither. -->
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
    <!-- `{n} selected` is the reference's own `footNote`, and it LEADS the rail (`proto:3752`). -->
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
      <!-- At rest the label stands alone; the spinner is the reference's unreachable state. -->
      {#if applying}
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      {/if}
      <span>{applyLabel}</span>
    </ManagerButton>
  {/snippet}
</ManagerModal>

<style>
  /* `ManagerModal` owns the panel, header and footer rail; this block owns the two between them. */

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

  /* `proto:6053`; the padding pair snaps to the 4px scale and the radius is the ROW rung. */
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

  /* A picked row lifts onto the active surface and its accent hairline, as the reference draws. */
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

  /* Warning ink rather than danger: the records that did not land are still offered and ticked. */
  .manager-component-add-from-refused {
    margin: 0;
    color: var(--fab-warning-text);
    font-weight: 500;
    font-size: 0.69rem;
    line-height: 1.45;
  }

  /* The footer note LEADS the rail, claiming the free space of a `flex-end` footer. */
  .manager-component-add-from-count {
    margin-right: auto;
    color: var(--fab-text-subtle);
    font-weight: 500;
    font-size: 0.69rem;
  }
</style>
