<!-- Svelte 5 runes mode -->
<!--
  Shared world-entry participation card for components and essences.
  It owns the searchable membership projection, three-column rows, and one armed removal token.
-->
<script>
  import ArmedDangerButton from '../../../components/ArmedDangerButton.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import ManagerSearchField from '../../../components/ManagerSearchField.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import { componentEntrySystemFilters } from './componentScoped.js';

  let {
    entryId = '',
    entityName = '',
    rows = [],
    worldCategory = '',
    armedToken = '',
    text = (key, fallback) => fallback,
    phrase = (key, fallback) => fallback,
    summaryFor = () => ({ member: false, text: '' }),
    rowMetaFor = () => '',
    heading = '',
    subtitle = '',
    openRulesAria = (_row) => '',
    removeLabel = '',
    removeConsequenceFor = null,
    addAria = (_row) => '',
    onArm = () => {},
    onDisarm = () => {},
    onAdd = () => {},
    onRemove = () => {},
    onOpenSystemRules = null,
  } = $props();

  let filter = $state('all');
  let search = $state('');
  let searchField = $state(null);

  const memberRows = $derived(rows.filter((row) => row?.member === true));

  // Segment counts and visible rows use membership records independently of enabled state.
  const visibleRows = $derived(
    rows
      .filter((row) => {
        if (filter === 'with') return row.member === true;
        if (filter === 'without') return row.member !== true;
        return true;
      })
      .filter((row) => {
        const needle = search.trim().toLowerCase();
        return (
          !needle ||
          String(row.systemName || row.systemId || '')
            .toLowerCase()
            .includes(needle)
        );
      })
  );

  const filters = $derived(
    componentEntrySystemFilters({ total: rows.length, members: memberRows.length })
  );

  /** Reveal the non-member cohort and focus its search field. */
  function revealAddable() {
    filter = 'without';
    search = '';
    searchField?.querySelector?.('input')?.focus?.();
  }

  /** Key an armed removal to the persisted entity/system pair. */
  function removeToken(row) {
    return `scoped-membership-remove:${entryId}|${row?.systemId ?? ''}`;
  }

  /** Describe the entity-specific consequence in the icon-only removal control's name. */
  function removeConsequence(row) {
    if (typeof removeConsequenceFor === 'function') return removeConsequenceFor(row);
    return phrase(
      'FABRICATE.Admin.Manager.Scoped.Component.RemoveConsequence',
      'Remove {entity} from {system}. Removing it also rewrites every recipe in that system that names it, and disables any recipe left without a usable ingredient set or result. The world record is untouched, and no other system changes.',
      { entity: entityName || entryId, system: row?.systemName || row?.systemId }
    );
  }
</script>

<InspectorCard
  class="manager-component-entry-card manager-component-entry-systems-card"
  data-scoped-entry-systems={entryId}
  data-scoped-entry-systems-card=""
>
  <div class="manager-component-entry-card-head manager-component-entry-systems-head">
    <i class="fas fa-layer-group manager-card-glyph is-accent" aria-hidden="true"></i>
    <div class="manager-component-entry-card-head-copy">
      <h3 class="manager-card-heading">
        {heading ||
          text(
            'FABRICATE.Admin.Manager.Scoped.Component.Entry.SystemsTitle',
            'Systems using this component'
          )}
      </h3>
      <p class="manager-subtitle">
        {subtitle ||
          text(
            'FABRICATE.Admin.Manager.Scoped.Component.Entry.SystemsSubtitle',
            'A system uses it when it has rules for it — that is where category, tags, essences and salvage live.'
          )}
      </p>
    </div>
    <ManagerButton
      class="manager-component-entry-head-action"
      data-scoped-entry-add-to-systems
      onclick={revealAddable}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span
        >{text(
          'FABRICATE.Admin.Manager.Scoped.Component.Entry.AddToSystems',
          'Add to systems…'
        )}</span
      >
    </ManagerButton>
  </div>

  <div class="manager-component-entry-systems-toolbar">
    <div class="manager-component-entry-systems-search" bind:this={searchField}>
      <ManagerSearchField
        compact
        value={search}
        onInput={(next) => (search = next)}
        placeholder={text(
          'FABRICATE.Admin.Manager.Scoped.Component.Entry.SystemSearch',
          'Find a system…'
        )}
        ariaLabel={text(
          'FABRICATE.Admin.Manager.Scoped.Component.Entry.SystemSearch',
          'Find a system…'
        )}
        inputAttrs={{ 'data-scoped-entry-system-search': '' }}
      />
    </div>
    <SegmentedControl
      density="compact"
      shape="pill"
      tone="accent-soft"
      options={filters}
      value={filter}
      onChange={(next) => (filter = next)}
      groupName={`scoped-entry-system-filter-${entryId}`}
      ariaLabel={text(
        'FABRICATE.Admin.Manager.Scoped.Component.SystemFilterLabel',
        'Filter systems by whether they have rules'
      )}
      dataAttr="data-scoped-entry-system-filters"
      optionDataAttr="data-scoped-entry-system-filter"
    />
    <span class="manager-component-entry-system-count" data-scoped-entry-system-count
      >{phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.SystemShown',
        '{shown} of {total} systems',
        { shown: visibleRows.length, total: rows.length }
      )}</span
    >
  </div>

  <ul class="manager-component-entry-systems" role="list">
    {#each visibleRows as row (row.systemId)}
      {@const summary = summaryFor(row, { worldCategory })}
      <li
        class="manager-component-entry-system"
        class:is-outsider={row.member !== true}
        data-scoped-entry-system={row.systemId}
      >
        <div class="manager-component-entry-system-identity">
          <span class="manager-component-entry-system-name">{row.systemName}</span>
          <span
            class="manager-component-entry-system-mode"
            data-scoped-entry-system-mode={row.systemId}
            >{rowMetaFor(row)}</span
          >
        </div>
        <span
          class="manager-component-entry-system-summary"
          class:is-absent={!summary.member}
          title={summary.text}
          data-scoped-entry-system-summary={row.systemId}>{summary.text}</span
        >
        <div class="manager-scoped-membership-actions manager-component-entry-row-actions">
          {#if row.member === true}
            {#if onOpenSystemRules}
              <ManagerButton
                class="manager-component-entry-system-rules"
                data-scoped-entry-system-rules={row.systemId}
                title={openRulesAria(row) ||
                  phrase(
                    'FABRICATE.Admin.Manager.Scoped.Component.OpenSystemRulesAria',
                    'Open this component in {system}',
                    { system: row.systemName }
                  )}
                aria-label={openRulesAria(row) ||
                  phrase(
                    'FABRICATE.Admin.Manager.Scoped.Component.OpenSystemRulesAria',
                    'Open this component in {system}',
                    { system: row.systemName }
                  )}
                onclick={() => onOpenSystemRules(entryId, row.systemId)}
              >
                <span
                  >{text(
                    'FABRICATE.Admin.Manager.Scoped.Component.Entry.ViewSystemRules',
                    'View system rules'
                  )}</span
                >
                <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
              </ManagerButton>
            {/if}
            <ArmedDangerButton
              token={removeToken(row)}
              armed={armedToken === removeToken(row)}
              idleLabel=""
              idleIcon="fas fa-arrow-right-from-bracket"
              armedLabel={text(
                'FABRICATE.Admin.Manager.Scoped.Membership.RemoveConfirm',
                'Confirm?'
              )}
              idleAriaLabel={`${removeLabel || text('FABRICATE.Admin.Manager.Scoped.Component.Entry.RemoveFromSystem', 'Remove from this system')} — ${removeConsequence(row)}`}
              armedAriaLabel={`${text('FABRICATE.Admin.Manager.Scoped.Membership.RemoveConfirm', 'Confirm?')} — ${removeConsequence(row)}`}
              {onArm}
              {onDisarm}
              onConfirm={() => onRemove(row.systemId)}
            />
          {:else}
            <ManagerButton
              role="dashed"
              class="manager-component-entry-system-add"
              data-scoped-membership-add
              aria-label={addAria(row) ||
                phrase(
                  'FABRICATE.Admin.Manager.Scoped.Component.Entry.AddToSystemAria',
                  'Add {entity} to {system}',
                  { entity: entityName || entryId, system: row.systemName || row.systemId }
                )}
              onclick={() => onAdd(row.systemId)}
            >
              {text('FABRICATE.Admin.Manager.Scoped.Component.Entry.AddToSystem', 'Add to system')}
            </ManagerButton>
          {/if}
        </div>
      </li>
    {:else}
      <li class="manager-component-entry-system-empty" data-scoped-entry-systems-empty>
        {text(
          'FABRICATE.Admin.Manager.Scoped.Component.SystemsNoMatch',
          'No crafting system matches that filter.'
        )}
      </li>
    {/each}
  </ul>
</InspectorCard>
