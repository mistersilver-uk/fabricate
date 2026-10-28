<!-- Svelte 5 runes mode -->
<!--
  The manager's title band (`<AppTitleBar>`, `library.html`): the PREMIUM mark while a companion
  is installed, then a caller's status caption.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `premiumInstalled` | `boolean` | `false` | draws the PREMIUM mark while a companion is installed |
  | `statusLabel` | `string` | `''` | composed and localized by the caller, drawn verbatim as the caption and its `title`; empty draws no status line |

  Invariants:
  - No element has a role, so none carries `aria-label`; each name is `.visually-hidden` text
    (issue 2257 D4) — pinned by `tests/components/app-title-bar-mounted.test.js`.
  - The PREMIUM mark is a bare span on the shared gold badge rule, not a `Chip` — pinned by the same file.
  - The family stays `manager-titlebar`, rooted at `.fabricate-manager`, so the band is the manager's alone.
-->
<script>
  import { localizeOr } from '../util/localizeOr.js';

  let { premiumInstalled = false, statusLabel = '' } = $props();

  const premiumStatus = localizeOr(
    'FABRICATE.Admin.Manager.Titlebar.PremiumStatus',
    'Fabricate Premium is installed and connected'
  );
</script>

<div class="manager-titlebar" data-manager-titlebar>
  {#if premiumInstalled}
    <span class="manager-titlebar-badge" data-manager-titlebar-premium title={premiumStatus}
      ><span aria-hidden="true"
        >{localizeOr('FABRICATE.Admin.Manager.Titlebar.Premium', 'PREMIUM')}</span
      ><span class="visually-hidden">{premiumStatus}</span></span
    >
  {/if}
  {#if statusLabel}
    <span class="manager-titlebar-status" data-manager-titlebar-status title={statusLabel}>
      <span class="visually-hidden"
        >{localizeOr(
          'FABRICATE.Admin.Manager.Titlebar.Status',
          'Selected system resolution:'
        )}</span
      >
      <!-- An information glyph, because the line is a caption, not a dice-roll control (issue 1373). -->
      <i class="fas fa-circle-info manager-titlebar-status-icon" aria-hidden="true"></i>
      <span class="manager-titlebar-status-text">{statusLabel}</span>
    </span>
  {/if}
</div>
