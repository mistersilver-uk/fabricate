<!--
  One row of the system Component Rules list. A card row has no columns, so it is an `<li>` inside
  the browser's `<ul role="list">` carrying `aria-current`, NOT a `<div>` with table/row/cell ARIA.
  `.manager-component-row` survives, because the smoke harness and `managerLayoutGuards` probe it.

  Left to right: the bulk-selection box LEADING; the `Medallion`, tinted by the component's own
  colour; the copy column — the name with a `Salvage` pill beside it over one ellipsised description
  line; and the trailing cluster of essence dots, the `Recipes` stat and ONE labelled control. There
  is no category chip (the group header's job here) and no source-origin pill (the world
  catalogue's), and the open control is a LABELLED `Edit rules ↗` rather than a pen icon.

  ONE ROW COMPONENT DRAWS BOTH COHORTS. `member={false}` is the GHOST row — a world component this
  system has no rules for — drawn as THIS row, dimmed and stated, rather than a two-line stub.
  Everything stays and the caller supplies the four differences: the name-line pill, the WORLD
  description, no essence dots, and an em-dash `Recipes` value beside a dashed `+ Add to system`. A
  second component would be a second row anatomy to keep in step, which is what produced the stub.

  THE PROGRESSIVE-DC BADGE IS SUBJECT-ONLY AND IS RETAINED: it has no counterpart in the reference's
  system row, but it is a shipped read-only parity affordance with its own re-gate test and is not
  in the audit's removal set. It renders on the NAME LINE beside `Salvage`, the row's pill run.

  Strings arrive pre-localized — this is a presentational leaf.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import EssenceChip from './EssenceChip.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import SelectionCheckbox from '../../../components/SelectionCheckbox.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';

  let {
    component = null,
    // Whether this system has a rules record for the component. `false` is the ghost cohort.
    member = true,
    selected = false,
    // Pre-localized progressive-difficulty badge text, or '' to omit. See the header note.
    difficultyBadge = '',
    // The badge's own text is the VALUE alone, so the thing it measures is named here instead.
    difficultyBadgeTitle = '',
    // The `Salvage` name-line pill's label, or '' when this component does not salvage here.
    salvageLabel = '',
    // The ghost row's own name-line pill.
    notInSystemLabel = '',
    // The `Recipes` stat: the value (already an em dash for a ghost row) over its micro-label.
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
  <!-- LEADING. `SelectionCheckbox` renders NO `<button>`, which is load-bearing: the smoke walk
       reaches the row's open control through a `.manager-component-row … button` selector and must
       not start matching this box. The `<li>` is not a label context, so the primitive brings one.

       A GHOST ROW CARRIES NONE, mechanically: the browser's prune effect drops every selected id
       the system has no component for, so a ticked ghost would vanish on the next render with
       nothing explaining why. It is a knowing divergence from the reference's ghost-row anatomy. -->
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
          <!-- `subtle` is the reference's own paint for this pill: the soft surface, the
               hairline and the disabled ink (`proto:4997`). -->
          <Chip tone="subtle">{notInSystemLabel}</Chip>
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
    <!-- Drawn on BOTH cohorts: a ghost row's em dash says "no rules here, so no number", where an
         omitted column would move every row beside it and say nothing. -->
    <span class="manager-component-recipes-stat" data-component-recipes={recipesValue}>
      <span class="manager-component-recipes-value">{recipesValue}</span>
      <span class="manager-component-recipes-label">{recipesLabel}</span>
    </span>
  </span>

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
      <!-- DASHED, not filled: adopting a world component is an offer, not the row's primary act. -->
      <ManagerButton
        role="dashed"
        class="manager-component-row-open"
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
