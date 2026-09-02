<!--
  The library's information architecture, every section of it.

  ── WHY EVERY SECTION IS HERE, INCLUDING THE ONES WITH NOTHING TO MOUNT ─────────────────────────

  Ten of the library's seventeen sections name no component: 00 How to use this, 01 Colour, 02 Type,
  03 Space & geometry, 04 States & targets, 05 Foundry contract, 12 Sets & groups, 13 Screen
  recipes, 14 Which one do I use? and 16 Planned migrations. Rendering only the populated ones made
  the page OPEN at "06 Controls", which reads as a truncated library rather than as a complete one
  whose first six sections carry rules instead of components — precisely the reading the numbering
  exists to prevent.

  ── AND WHY 01–04 ARE MEASURED RATHER THAN DRAWN ────────────────────────────────────────────────

  Those four are the vocabulary the components are built out of. The library states them as
  hand-authored swatches, which is a CLAIM about `styles/fabricate.css`; what is drawn here is a
  READING of it — names from the stylesheet's own bytes, values resolved by `getComputedStyle`
  against a real `.fabricate[data-fabricate-theme]` element in each of the seven themes, and the
  state rules read out of the browser's parsed sheet. See `tokens.js`.

  Nothing in this column is a plinth. Every specimen is mounted OUTSIDE this window, as a sibling of
  it, because `styles/fabricate.css` carries 2821 `.fabricate-manager <descendant>` selectors and a
  specimen nested here would be painted by all of them.
-->
<script>
  import Chip from '../../../src/ui/svelte/apps/manager/Chip.svelte';
  import CollapsibleGroupHeader from '../../../src/ui/svelte/components/CollapsibleGroupHeader.svelte';
  import EmptyState from '../../../src/ui/svelte/apps/manager/EmptyState.svelte';
  import IconFactRow from '../../../src/ui/svelte/apps/manager/IconFactRow.svelte';
  import InspectorCard from '../../../src/ui/svelte/components/InspectorCard.svelte';

  import { sectionForToken } from './tokens.js';

  /** Which live panel, if any, each section carries. Section ids come from `library.html`. */
  const LIVE_SECTIONS = Object.freeze({
    colour: 'colour',
    type: 'type',
    space: 'space',
    states: 'states',
  });

  /** The glyph each row kind takes, so the four kinds are distinguishable at a glance. */
  const KIND_ICONS = Object.freeze({
    mounted: 'fas fa-cube',
    xref: 'fas fa-arrow-turn-down',
    unbuilt: 'fas fa-drafting-compass',
    'ruled-out': 'fas fa-ban',
  });

  let {
    groups = [],
    tokenTable,
    stateRules = [],
    selectedPath = '',
    onSelect = () => {},
  } = $props();

  let open = $state({});

  const routed = $derived(
    Object.fromEntries(
      Object.values(LIVE_SECTIONS).map((section) => [
        section,
        (tokenTable?.names ?? []).filter((name) => sectionForToken(name) === section),
      ])
    )
  );

  function isOpen(group) {
    return open[group.id] ?? true;
  }

  function toggle(group) {
    open = { ...open, [group.id]: !isOpen(group) };
  }

  function valueIn(theme, name) {
    return theme.values[name] ?? '';
  }

  /** A value that can be painted as a swatch, as opposed to a length or a font stack. */
  function isColourish(value) {
    return /^(#|rgb|hsl|oklch|color\()/i.test(value.trim());
  }
</script>

{#snippet tokenRow(name)}
  <div class="pl-row">
    <Chip mono>{name}</Chip>
    {#each tokenTable.themes as theme (theme.id)}
      {#if isColourish(valueIn(theme, name))}
        <span
          title={`${theme.label}: ${valueIn(theme, name)}`}
          style={`display:inline-block;width:16px;height:16px;border-radius:4px;border:1px solid var(--fab-border-strong);background:${valueIn(theme, name)}`}
        ></span>
      {:else}
        <Chip tone="neutral" mono truncate title={`${theme.label}: ${valueIn(theme, name)}`}
          >{valueIn(theme, name) || '—'}</Chip
        >
      {/if}
    {/each}
  </div>
{/snippet}

{#snippet livePanel(section)}
  {#if section === LIVE_SECTIONS.states}
    {#each stateRules as entry (entry.state)}
      <IconFactRow
        icon="fas fa-wave-square"
        title={entry.state}
        subtitle={`${entry.rules} rule${entry.rules === 1 ? '' : 's'} · ${entry.tokens.length} token${entry.tokens.length === 1 ? '' : 's'} · ${entry.selectors.join(', ') || 'the base rule'}`}
      />
      {#if entry.tokens.length > 0}
        <div class="pl-row">
          {#each entry.tokens as token (token)}
            <Chip mono tone="muted">{token}</Chip>
          {/each}
        </div>
      {/if}
    {/each}
  {:else}
    <div class="pl-token-grid">
      {#each routed[section] as name (name)}
        {@render tokenRow(name)}
      {/each}
    </div>
  {/if}
{/snippet}

<div class="pl-stack">
  {#each groups as group (group.id)}
    <section class="pl-section">
      <CollapsibleGroupHeader
        name={`${group.num} · ${group.title}`}
        countText={`${group.rows.length}`}
        expanded={isOpen(group)}
        onToggle={() => toggle(group)}
      />
      {#if isOpen(group)}
        <InspectorCard>
          <p>{group.lede}</p>
          {#if LIVE_SECTIONS[group.id]}
            {@render livePanel(LIVE_SECTIONS[group.id])}
          {/if}
          {#if group.rows.length === 0 && !LIVE_SECTIONS[group.id]}
            <EmptyState
              icon="fas fa-scroll"
              title="This section names no component"
              hint="It states a rule instead. It is drawn here so the numbering reads as a complete library rather than a truncated one."
              compact
            />
          {/if}
          {#each group.rows as row (row.kind + (row.path ?? row.name))}
            {#if row.kind === 'mounted' && row.entry}
              <button
                type="button"
                class="pl-rail-entry"
                aria-current={row.path === selectedPath}
                onclick={() => onSelect(row.path)}
              >
                <i class={KIND_ICONS.mounted} aria-hidden="true"></i>
                <span class="pl-rail-entry-name">{row.name}</span>
                <Chip mono tone="muted" truncate>{row.tag}</Chip>
              </button>
            {:else}
              <IconFactRow
                icon={KIND_ICONS[row.kind] ?? 'fas fa-circle'}
                title={row.name}
                subtitle={row.kind === 'xref'
                  ? `Recorded below the caller bar — see "Below the caller bar" for ${row.path}`
                  : (row.why ?? '')}
              />
            {/if}
          {/each}
        </InspectorCard>
      {/if}
    </section>
  {/each}
</div>
