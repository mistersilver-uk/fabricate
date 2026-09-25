<!--
  A Component Rules list row. Members expose system facts and Edit rules; absent world components
  follow the Essence Rules row: world identity, membership chip and one primary adoption action.
  Strings arrive pre-localized, and the browser owns selection and persistence.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import EssenceChip from './EssenceChip.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import SelectionCheckbox from '../../../components/SelectionCheckbox.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';

  let {
    component = null,
    // Whether this system has a rules record for the component.
    member = true,
    selected = false,
    // Pre-localized progressive-difficulty badge text, or '' to omit.
    difficultyBadge = '',
    // The badge's own text is the VALUE alone, so the thing it measures is named here instead.
    difficultyBadgeTitle = '',
    // The `Salvage` name-line pill's label, or '' when this component does not salvage here.
    salvageLabel = '',
    // The absent row's own name-line pill.
    notInSystemLabel = '',
    // The member-only `Recipes` stat.
    recipesValue = '',
    recipesLabel = '',
    noDescriptionText = '',
    // Whether this row is ticked for BULK edit (issue 772), and the pre-localized
    // accessible name for the box that ticks it.
    bulkSelected = false,
    selectLabel = '',
    // Each control takes a VISIBLE label and a NAMED one: `Edit rules ↗` on every row is ambiguous
    // the moment a screen reader lists them, so the named form is the accessible name and tooltip.
    editLabel = '',
    editNamedLabel = '',
    addLabel = '',
    addNamedLabel = '',
    onSelect = () => {},
    onEdit = () => {},
    onAdd = () => {},
    onToggleSelect = () => {},
  } = $props();

  // THE DRAWN RUN, NOT THE RESOLVED MAP. The card carries both: `essences` whole, because the
  // component editor is seeded from it and a narrowed seed would drop every off-roster essence on
  // the next save; `essenceChips` drawn, in this system's roster order and no wider.
  const essenceRun = $derived(component?.essenceChips ?? component?.essences);
  const essences = $derived(member && Array.isArray(essenceRun) ? essenceRun : []);
</script>

<li
  class="manager-component-row"
  class:is-selected={selected}
  class:is-bulk-selected={bulkSelected}
  class:is-ghost={!member}
  data-component-id={component?.id}
  data-component-bulk-selected={bulkSelected}
  data-component-member={member}
  aria-current={selected ? 'true' : undefined}
>
  <!-- The bulk checkbox belongs only to records this system can edit. -->
  {#if member}
    <SelectionCheckbox
      size="lg"
      wrapper="label"
      checked={bulkSelected}
      ariaLabel={selectLabel}
      data-component-select={component?.id}
      onChange={() => onToggleSelect(component?.id)}
    />
  {/if}

  <button type="button" class="manager-component-identity" onclick={() => onSelect(component?.id)}>
    <!-- The shared Medallion, as the recipe row uses: a flat fill on the surface ramp with a real
         glyph fallback, `tint` carrying the component's own colour where the projection resolves
         one. `variant="glyph-chip"` exists because the reference draws this leading chip BORDERLESS
         while the shipped tile wears a hairline — three `compare` lines on this row. The variant
         owns only the absent edge; the size and the tint stay the caller's. -->
    <Medallion
      art={component?.img}
      alt=""
      icon="fas fa-cube"
      size={40}
      tint={component?.color || ''}
      variant="glyph-chip"
    />
    <span class="manager-system-copy">
      <span class="manager-component-name-line">
        <span class="manager-system-name" title={component?.name}>{component?.name}</span>
        {#if member && salvageLabel}
          <Chip tone="info" icon="fas fa-recycle">{salvageLabel}</Chip>
        {/if}
        {#if !member && notInSystemLabel}
          <Chip tone="subtle" icon="fas fa-circle-minus">{notInSystemLabel}</Chip>
        {/if}
        {#if member && difficultyBadge}
          <Chip
            tone="info"
            icon="fas fa-gauge-high"
            class="manager-component-difficulty-badge"
            title={difficultyBadgeTitle}
            data-component-difficulty
          >
            <span>{difficultyBadge}</span>
          </Chip>
        {/if}
      </span>
      <span class="manager-system-description" title={component?.description || noDescriptionText}>
        {component?.description || noDescriptionText}
      </span>
    </span>
  </button>

  {#if member}
    <span class="manager-component-row-meta">
      {#if essences.length > 0}
        <!-- Each badge is the shared `EssenceChip`, so a dot carries the colour the Essence Catalogue
           gave it and the chip owns the glyph fallback and the `{name} {quantity}` accessible name.
           The row keeps its own sheet hook and gains a per-essence one. -->
        <span class="manager-chip-row manager-component-essence-dots">
          {#each essences as essence (essence.id)}
            <EssenceChip
              {essence}
              class="manager-essence-compact-chip"
              data-component-essence={essence.id}
            />
          {/each}
        </span>
      {/if}
      <span class="manager-component-recipes-stat" data-component-recipes={recipesValue}>
        <span class="manager-component-recipes-value">{recipesValue}</span>
        <span class="manager-component-recipes-label">{recipesLabel}</span>
      </span>
    </span>
  {/if}

  <!-- The row's ONE action, in the cluster class the multi-select cases and the smoke walk name.
       A cluster of one rather than a bare button: the contract is "the selection box must not join
       the row's action cluster", which a vanished cluster would make unassertable. -->
  <span class="manager-action-group">
    {#if member}
      <ManagerButton
        class="manager-component-row-open"
        data-component-edit={component?.id}
        aria-label={editNamedLabel}
        title={editNamedLabel}
        onclick={() => onEdit(component?.id)}
      >
        <span>{editLabel}</span>
        <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
      </ManagerButton>
    {:else}
      <ManagerButton
        role="primary"
        class="manager-component-row-add"
        data-component-ghost-add={component?.id}
        aria-label={addNamedLabel}
        title={addNamedLabel}
        onclick={() => onAdd(component?.id)}
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{addLabel}</span>
      </ManagerButton>
    {/if}
  </span>
</li>
