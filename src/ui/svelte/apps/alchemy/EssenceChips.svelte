<!-- Svelte 5 runes mode -->
<!--
  EssenceChips — a compact, presentational row of essence icon+count chips shared
  by the Alchemy component inventory rows, the workbench bench chips, and the
  Produces preview. Mirrors the essence-pip pattern used on InventoryItemCard /
  IoTable (FA icon + count), themed with `--fab-*` tokens. Prop-driven; renders
  nothing when there are no essences, so callers can drop it in unconditionally.

  Each essence is `{ id, name, icon, quantity, colorToken }`; `icon` falls back to the
  shared default essence glyph (matching InventoryItemCard's inline fallback) when the
  essence definition carries none, and `colorToken` (issue 917) is the GM-authored
  `--fab-tag-*` key. An essence with no authored colour keeps the accent chip every
  essence renders as today.
-->
<script>
  let { essences = [], size = 'sm' } = $props();

  const DEFAULT_ESSENCE_ICON = 'fas fa-mortar-pestle';

  const rows = $derived(
    Array.isArray(essences) ? essences.filter((entry) => entry && entry.quantity > 0) : []
  );

  function tintStyle(colorToken) {
    const token =
      typeof colorToken === 'string' ? colorToken.trim().replace(/^--fab-tag-/, '') : '';
    return token ? `--alchemy-essence-color: var(--fab-tag-${token})` : '';
  }
</script>

{#if rows.length > 0}
  <span class="alchemy-essences alchemy-essences-{size}" data-alchemy-essences>
    {#each rows as essence (essence.id)}
      <span
        class="alchemy-essence-chip"
        class:is-tinted={Boolean(tintStyle(essence.colorToken))}
        style={tintStyle(essence.colorToken)}
        data-alchemy-essence={essence.id}
        title={`${essence.name} ×${essence.quantity}`}
        aria-label={`${essence.name} ×${essence.quantity}`}
      >
        <i class={essence.icon || DEFAULT_ESSENCE_ICON} aria-hidden="true"></i>
        <span class="alchemy-essence-count">×{essence.quantity}</span>
      </span>
    {/each}
  </span>
{/if}

<style>
  .alchemy-essences {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .alchemy-essence-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 5px;
    border-radius: 999px;
    background: var(--fab-accent-soft);
    border: 1px solid var(--fab-accent-border);
    color: var(--fab-accent);
    font-size: 9px;
    font-weight: 600;
    line-height: 1.4;
    white-space: nowrap;
  }

  /* The repo's tinted-surface contract: 16% fill / 50% border against the raised
     surface the chip sits on, with the tint scoped to the GLYPH so label text keeps
     the standard body colour and an authored colour can never reduce its contrast. */
  .alchemy-essence-chip.is-tinted {
    background: color-mix(in srgb, var(--alchemy-essence-color) 16%, var(--fab-surface-raised));
    border-color: color-mix(in srgb, var(--alchemy-essence-color) 50%, transparent);
    color: var(--fab-text);
  }

  .alchemy-essence-chip.is-tinted i {
    color: var(--alchemy-essence-color);
  }

  .alchemy-essences-md .alchemy-essence-chip {
    font-size: 10px;
    padding: 2px 7px;
  }

  .alchemy-essence-chip i {
    font-size: 9px;
  }

  .alchemy-essences-md .alchemy-essence-chip i {
    font-size: 10px;
  }

  .alchemy-essence-count {
    font-variant-numeric: tabular-nums;
  }
</style>
