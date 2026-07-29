<!-- Svelte 5 runes mode -->
<!--
  EssenceContribution is the "N Radiant" chip stating how much of one essence a
  carrier unit supplies (issue 917). It has three call sites — the essence pool's
  per-carrier facts, the pool's selection recap and the consumption plan's rows —
  which render the same `FABRICATE.App.Crafting.Pool.Contribution` sentence, so it
  is one component rather than three copies of one meaning.

  `required` marks an essence the open set actually needs. An essence the unit also
  carries but the set does not require still shows (the unit is spent either way)
  and stays muted, because it funds nothing here.

  THE TINT IS SCOPED TO THE GLYPH. The GM-authored colour paints the `<i>` only;
  the 10px/600 label text keeps the standard subtle body colour, because an
  authored palette colour behind small bold text is the one place a tag palette can
  cut contrast. That is the same scoping `Chip`, `EnvironmentCard` and
  `GatheringDetail` use.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { normalizeEssenceIcon } from '../../../util/essenceIcons.js';

  let {
    // The essence's authored Font Awesome class, normalized here so callers can
    // forward whatever their projection carries.
    icon = null,
    name = '',
    amount = 0,
    // Whether the open set requires this essence.
    required = false,
    // The essence's authored `--fab-tag-*` key, or null for the theme accent.
    colorToken = null,
  } = $props();

  const iconClass = $derived(normalizeEssenceIcon(icon));
  const tint = $derived(colorToken ? `--fab-chip-color: var(--fab-tag-${colorToken})` : '');
</script>

<span class="essence-contribution" class:is-required={required} style={tint}>
  <i class={iconClass} aria-hidden="true"></i>
  {localize('FABRICATE.App.Crafting.Pool.Contribution', { amount, name })}
</span>

<style>
  .essence-contribution {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 600;
    color: var(--fab-text-subtle);
  }

  .essence-contribution i {
    font-size: 8px;
  }

  /* Glyph only — see the header note. */
  .essence-contribution.is-required i {
    color: var(--fab-chip-color, var(--fab-accent));
  }
</style>
