<!-- Svelte 5 runes mode -->
<!--
  The manager's title band above the page header, on every route including the Tool routes: the
  PREMIUM mark and the selected system's resolution summary (issues 1185, 1373, 1777, 2420).

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
  - Renders `AppTitleBar` and none of its markup — pinned by
    `tests/components/manager-title-bar-mounted.test.js`.
  - With no `modeLabel` it hands no caption, whatever the tier count.
-->
<script>
  import AppTitleBar from '../../components/AppTitleBar.svelte';

  let { text, premiumInstalled = false, modeLabel = '', outcomeTierCount = 0 } = $props();

  function formatCount(keySingular, fallbackSingular, keyPlural, fallbackPlural, count) {
    const key = count === 1 ? keySingular : keyPlural;
    const fallback = count === 1 ? fallbackSingular : fallbackPlural;
    return `${count} ${text(key, fallback)}`;
  }

  const statusLabel = $derived.by(() => {
    if (!modeLabel) return '';
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
</script>

<AppTitleBar {premiumInstalled} {statusLabel} />
