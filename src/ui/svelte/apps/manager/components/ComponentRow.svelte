<!-- Svelte 5 runes mode -->
<!--
  One row of the GM component library (issue 676).

  Deliberately carries NO table/row/cell ARIA: the rebuilt browser is a LIST of rows,
  not a grid, and the old table scaffolding is dropped rather than left orphaned on a
  non-table structure. `.manager-component-row` survives — the smoke harness and
  `managerLayoutGuards` both probe it.

  The row shows a DESCRIPTION LINE, mirroring the Recipe Studio. It shows NO tag chips:
  tags are many-valued and were reading as category-like next to nothing that grouped;
  `category` is the grouping axis now, and tags are edited only in the editor.

  Strings arrive pre-localized — this is a presentational leaf.
-->
<script>
  let {
    component = null,
    selected = false,
    categoryBadge = '',
    // Pre-localized progressive-difficulty badge text, or '' to omit. The old browser
    // carried this as its own COLUMN (issue 651), shown only for progressive systems.
    // The rebuilt list has no columns, so it lands in the badge run rather than being
    // dropped — the read-only parity it gives the GM is the whole reason it exists.
    difficultyBadge = '',
    originLabel = '',
    originClass = '',
    editLabel = '',
    editTitle = '',
    deleteLabel = '',
    deleteTitle = '',
    copyLabel = '',
    noDescriptionText = '',
    onSelect = () => {},
    onEdit = () => {},
    onDelete = () => {},
    onCopySourceUuid = () => {}
  } = $props();

  const image = $derived(component?.img || 'icons/svg/item-bag.svg');
  const essences = $derived(Array.isArray(component?.essences) ? component.essences : []);
</script>

<div
  class={`manager-component-row ${selected ? 'is-selected' : ''}`}
  data-component-id={component?.id}
>
  <button
    type="button"
    class="manager-component-identity"
    onclick={() => onSelect(component?.id)}
  >
    <!-- A FLAT fill on the existing surface ramp, not the prototype's decorative
         two-stop diagonal gradient: gradients are forbidden on product UI surfaces
         (the exception is only for full-track semantic value scales), and the
         prototype itself already renders its smaller salvage-yield chips flat. -->
    <span class="manager-component-chip" aria-hidden="true">
      <img class="manager-component-thumb" src={image} alt="" />
    </span>
    <span class="manager-system-copy">
      <span class="manager-system-name" title={component?.name}>{component?.name}</span>
      <span class="manager-system-description" title={component?.description || noDescriptionText}>
        {component?.description || noDescriptionText}
      </span>
    </span>
  </button>

  <span class="manager-component-row-meta">
    {#if categoryBadge}
      <!-- Suppressed for `general` by the caller: no redundant "General" chip, mirroring
           the Recipe Studio's badge-vs-filter asymmetry. `general` stays a FILTER option. -->
      <span class="manager-chip manager-component-category-badge" data-component-category={categoryBadge}>{categoryBadge}</span>
    {/if}
    {#if difficultyBadge}
      <span class="manager-chip is-info manager-component-difficulty-badge" data-component-difficulty>
        <i class="fas fa-gauge-high" aria-hidden="true"></i>
        <span>{difficultyBadge}</span>
      </span>
    {/if}
    <span class={`manager-chip ${originClass}`}>{originLabel}</span>
    {#if essences.length > 0}
      <span class="manager-chip-row manager-component-essence-dots">
        {#each essences as essence (essence.id)}
          <span
            class="manager-chip manager-essence-compact-chip"
            title={`${essence.name || essence.id} ${essence.quantity}`}
            aria-label={`${essence.name || essence.id} ${essence.quantity}`}
          >
            <i class={essence.icon || 'fas fa-mortar-pestle'} aria-hidden="true"></i>{essence.quantity}
          </span>
        {/each}
      </span>
    {/if}
  </span>

  <span class="manager-action-group">
    {#if component?.hasRegisteredItemUuid}
      <button
        type="button"
        class="manager-icon-button"
        aria-label={copyLabel}
        title={component?.registeredItemUuidDisplay}
        onclick={() => onCopySourceUuid(component?.registeredItemUuidDisplay)}
      >
        <i class="fas fa-copy" aria-hidden="true"></i>
      </button>
    {/if}
    <button
      type="button"
      class="manager-icon-button"
      aria-label={editLabel}
      title={editTitle}
      onclick={() => onEdit(component?.id)}
    >
      <i class="fas fa-edit" aria-hidden="true"></i>
    </button>
    <button
      type="button"
      class="manager-icon-button is-danger"
      aria-label={deleteLabel}
      title={deleteTitle}
      onclick={() => onDelete(component?.id)}
    >
      <i class="fas fa-trash" aria-hidden="true"></i>
    </button>
  </span>
</div>
