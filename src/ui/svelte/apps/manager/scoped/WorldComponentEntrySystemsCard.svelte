<!-- Svelte 5 runes mode -->
<!--
  `Systems using this component` (issue 1371, maintainer parity round 4) — `proto:920-953`.

  == THREE BANDS, EACH PADDING ITSELF =======================================================
  The card carries `overflow: hidden` and NO padding of its own: a head band with a glyph, an
  `h3`, a subtitle and a trailing `Add to systems…`; a toolbar band with a search well, a
  segmented filter carrying per-segment counts, and the shown/total count pinned right; and a
  rows band that scrolls internally at 330px. Round 3 drew a bare kicker reading the DATA
  (`2 OF 6 SYSTEMS HAVE RULES`), a `<select>` filter and a full-width search.

  == THE ROW IS THREE COLUMNS ON ONE LINE ===================================================
  A fixed 196px name block carrying the system name over its resolution mode, a flexible
  ellipsised summary, and a trailing action cluster. Round 3 drew the name, a chip, a
  full-width summary paragraph BELOW the row and — on a non-member — a filled green primary
  with a hint paragraph beside it, which is the maintainer's stated example of the failure.

  == THE TRAILING CLUSTER IS COMPOSED HERE RATHER THAN THROUGH `MembershipActions` ==========
  That component's contract is a filled `is-primary` add with an explanatory line and a
  labelled `Remove`; the reference draws a DASHED add with no line, and a 26px square exit
  icon. Both are the shipped primitives — `ManagerButton role="dashed"` and the shared
  `ArmedDangerButton` — so nothing is re-derived here, and the arm token keeps the SAME
  `scoped-membership-remove:{entity}|{system}` shape so the window-wide "exactly one armed
  control" invariant still holds across this card and every other membership cluster.
-->
<script>
  import ArmedDangerButton from '../ArmedDangerButton.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import ManagerSearchField from '../../../components/ManagerSearchField.svelte';
  import SegmentedControl from '../SegmentedControl.svelte';
  import { componentEntrySystemFilters, componentSystemModeLabel } from './componentScoped.js';

  let {
    entryId = '',
    entityName = '',
    rows = [],
    /** The crafting-system roster, for the resolution mode each row states. */
    systems = [],
    worldCategory = '',
    armedToken = '',
    text = (key, fallback) => fallback,
    phrase = (key, fallback) => fallback,
    summaryFor = () => ({ member: false, text: '' }),
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

  // The rows the card draws: the membership filter, then the search term. `with` and `without`
  // are the two halves of `member`, and `all` is their union — so every previously reachable row
  // is still reachable and the segment counts are computed over the SAME arrays.
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

  const modeBySystem = $derived(
    new Map(
      (Array.isArray(systems) ? systems : []).map((system) => [
        String(system?.id ?? ''),
        componentSystemModeLabel(system?.resolutionMode, text),
      ])
    )
  );

  /**
   * The head action, which REVEALS the addable cohort rather than opening a picker.
   *
   * `proto:925` draws `+ Add to systems…` as a modal picker over the non-member systems. This
   * repository has no such overlay and `actions` exposes only the per-pair `addToSystem`, so the
   * honest behaviour of the control is the one thing it can do with what is here: narrow the card
   * to the systems the component is NOT in — each of which carries its own `Add to system` — and
   * put the caret in the search field. It is named in the handoff as a partial rather than left
   * as a control that does nothing.
   *
   * @returns {void}
   */
  function revealAddable() {
    filter = 'without';
    search = '';
    searchField?.querySelector?.('input')?.focus?.();
  }

  /**
   * One row's arm token. Keyed on the DOCUMENT ID PAIR rather than a row index, because a
   * re-projected list must not be able to arm one row and remove another.
   *
   * @param {object} row
   * @returns {string}
   */
  function removeToken(row) {
    return `scoped-membership-remove:${entryId}|${row?.systemId ?? ''}`;
  }

  /**
   * The consequence sentence the armed exit icon announces and shows on hover.
   *
   * `ArmedDangerButton` requires each aria label to CONTAIN its state's visible label, because
   * WCAG 2.5.3 makes a control whose name omits the visible string unactivatable by speech input
   * — and in this form the idle face has NO visible label at all, so the sentence is the only
   * name it has.
   *
   * @param {object} row
   * @returns {string}
   */
  function removeConsequence(row) {
    return phrase(
      'FABRICATE.Admin.Manager.Scoped.Membership.RemoveConsequence',
      'Remove {entity} from {system}. Its overrides go with it; the world record and every other system are untouched.',
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
        {text(
          'FABRICATE.Admin.Manager.Scoped.Component.Entry.SystemsTitle',
          'Systems using this component'
        )}
      </h3>
      <p class="manager-subtitle">
        {text(
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
    <!--
      THE FILTER IS A PILL RUN ON A SOFT ACCENT TRACK (`proto:5457`): three unenclosed segments
      at radius 999, the chosen one on `--fab-accent-soft` behind `--fab-accent-border` in
      `--fab-accent`, the rest on a `--fab-bg-1` fill behind a hairline in `--fab-text-muted`,
      all three at 600. `shape` is the construction and `tone` is the paint, so both are opt-in
      and neither moves another `SegmentedControl`. The tallies stay on `badge`, not `count`:
      `.manager-segment-count.is-badge` inks the idle numeral `--fab-text-subtle` and lets the
      chosen one inherit the accent, which is what the reference draws.
    -->
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
            >{modeBySystem.get(row.systemId) ?? ''}</span
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
                title={phrase(
                  'FABRICATE.Admin.Manager.Scoped.Component.OpenSystemRulesAria',
                  'Open this component in {system}',
                  { system: row.systemName }
                )}
                aria-label={phrase(
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
              idleAriaLabel={`${text('FABRICATE.Admin.Manager.Scoped.Component.Entry.RemoveFromSystem', 'Remove from this system')} — ${removeConsequence(row)}`}
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
              aria-label={phrase(
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
