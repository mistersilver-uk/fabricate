<!-- Svelte 5 runes mode -->
<!--
  One row of the GM component library (issue 676).

  A card row has no columns, so it is an `<li>` inside the browser's `<ul role="list">`,
  carrying `aria-current` for the selected row — NOT a `<div>` with table/row/cell ARIA.
  `.manager-component-row` survives — the smoke harness and `managerLayoutGuards` both
  probe it.

  The row shows a DESCRIPTION LINE, mirroring the Recipe Studio. It shows NO tag chips:
  tags are many-valued and were reading as category-like next to nothing that grouped;
  `category` is the grouping axis now, and tags are edited only in the editor.

  ── ONE ACTION, NOT THREE ────────────────────────────────────────────────────────
  The row's single affordance is Edit, a `fa-pen` matching the recipe row and the Books
  & Scrolls row. Copy-source-UUID and Delete live in the browser INSPECTOR: three ghost
  icons on every row turned it into a toolbar and truncated the description, which is
  the finding the Recipe Studio already recorded and ruling 1 makes binding here.

  Strings arrive pre-localized — this is a presentational leaf.
-->
<script>
  import Medallion from '../../../components/Medallion.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';

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
    originTone = 'subtle',
    originIcon = '',
    editLabel = '',
    editTitle = '',
    noDescriptionText = '',
    onSelect = () => {},
    onEdit = () => {}
  } = $props();

  const essences = $derived(Array.isArray(component?.essences) ? component.essences : []);
</script>

<li
  class={`manager-component-row ${selected ? 'is-selected' : ''}`}
  data-component-id={component?.id}
  aria-current={selected ? 'true' : undefined}
>
  <button
    type="button"
    class="manager-component-identity"
    onclick={() => onSelect(component?.id)}
  >
    <!-- The shared Medallion, as the recipe row uses: a flat fill on the surface ramp
         with a real glyph fallback, rather than a hand-rolled chip whose fallback was a
         private `icons/svg/item-bag.svg` path. Gradients stay forbidden. -->
    <Medallion src={component?.img} icon="fas fa-cube" size={40} />
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
    <!-- Source origin is a real STATE, so it wears the shared StatusPill the recipe row's
         states use, not a raw chip. -->
    <StatusPill tone={originTone} icon={originIcon} label={originLabel} />
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
    <button
      type="button"
      class="manager-icon-button manager-component-edit"
      data-component-edit={component?.id}
      aria-label={editLabel}
      title={editTitle}
      onclick={() => onEdit(component?.id)}
    >
      <i class="fas fa-pen" aria-hidden="true"></i>
    </button>
  </span>
</li>
