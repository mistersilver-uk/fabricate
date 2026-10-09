<!-- Svelte 5 runes mode -->
<!--
  The manager's title band above the page header, on every route including the Tool routes: the
  PREMIUM mark and the selected system's resolution summary (issues 1185, 1373, 1777).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `text` | the shell's localizer | — | `(key, fallback)` |
  | `premiumInstalled` | `boolean` | `false` | a companion is registered on any surface; the shell derives it |
  | `modeLabel` | `string` | `''` | the selected system's resolution mode; empty draws no status line |
  | `outcomeTierCount` | `number` | `0` | appended to the mode when positive |

  Invariants:
  - The only caller is `CraftingSystemManagerRoot.svelte`, which renders none of this markup —
    pinned by `tests/components/manager-title-bar-mounted.test.js`.
  - The PREMIUM mark is a bare span sharing the rail's gold badge rule, not a `Chip`.
  - No element here has a role, so none carries `aria-label`; each name is `.visually-hidden`
    text, absolutely positioned so the band does not move (issue 2257 D4) — pinned by
    `tests/components/manager-title-bar-mounted.test.js`.
-->
<script>
  let { text, premiumInstalled = false, modeLabel = '', outcomeTierCount = 0 } = $props();

  function formatCount(keySingular, fallbackSingular, keyPlural, fallbackPlural, count) {
    const key = count === 1 ? keySingular : keyPlural;
    const fallback = count === 1 ? fallbackSingular : fallbackPlural;
    return `${count} ${text(key, fallback)}`;
  }

  const statusLabel = $derived.by(() => {
    if (outcomeTierCount <= 0) return modeLabel;
    const tiers = formatCount(
      'FABRICATE.Admin.Manager.Titlebar.OutcomeTier',
      'outcome tier',
      'FABRICATE.Admin.Manager.Titlebar.OutcomeTiers',
      'outcome tiers',
      outcomeTierCount
    );
    return `${modeLabel} · ${tiers}`;
  });

  const premiumStatus = $derived(
    text(
      'FABRICATE.Admin.Manager.Titlebar.PremiumStatus',
      'Fabricate Premium is installed and connected'
    )
  );
</script>

<div class="manager-titlebar" data-manager-titlebar>
  {#if premiumInstalled}
    <span class="manager-titlebar-badge" data-manager-titlebar-premium title={premiumStatus}
      ><span aria-hidden="true">{text('FABRICATE.Admin.Manager.Titlebar.Premium', 'PREMIUM')}</span
      ><span class="visually-hidden">{premiumStatus}</span></span
    >
  {/if}
  {#if modeLabel}
    <span class="manager-titlebar-status" data-manager-titlebar-status title={statusLabel}>
      <span class="visually-hidden"
        >{text('FABRICATE.Admin.Manager.Titlebar.Status', 'Selected system resolution')}</span
      >
      <!-- An information glyph, because the line is a caption, not a dice-roll control (issue 1373). -->
      <i class="fas fa-circle-info manager-titlebar-status-icon" aria-hidden="true"></i>
      <span class="manager-titlebar-status-text">{statusLabel}</span>
    </span>
  {/if}
</div>
