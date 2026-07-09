<!-- Svelte 5 runes mode -->
<!--
  A name + generic icon + grant-toggle row for the Access rosters (who may see /
  read a recipe item). Purely presentational: it renders one roster entry and
  reports a toggle intent. No class, colour, or seat concept — just a name, an
  optional subtitle, and an On/Off grant toggle (reusing `.manager-status-toggle`).

  Props:
   - name: the entry's display name (serif via the inherited `--font-primary`).
   - subtitle?: optional secondary line (e.g. a role or hint).
   - icon: leading Font Awesome icon class (default 'fas fa-user').
   - granted: whether access is currently granted (drives the toggle state).
   - onToggle(next): called with the next granted boolean when the toggle fires.
   - ariaLabel: accessible name for the toggle button.
   - dataAttr?: optional data-* attribute name stamped `true` on the row (host/test hook).
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    name = '',
    subtitle = '',
    icon = 'fas fa-user',
    iconColor = '',
    granted = false,
    onToggle = () => {},
    ariaLabel = '',
    dataAttr = ''
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
</script>

<div class="manager-roster-row" {...dataAttr ? { [dataAttr]: true } : {}}>
  <span class="manager-roster-icon" aria-hidden="true"><i class={icon} style={iconColor ? `color: ${iconColor}` : undefined}></i></span>
  <div class="manager-roster-copy">
    <span class="manager-roster-name">{name}</span>
    {#if subtitle}<span class="manager-roster-subtitle">{subtitle}</span>{/if}
  </div>
  <button
    type="button"
    class={`manager-status-toggle ${granted ? 'is-on' : 'is-off'}`}
    aria-pressed={granted}
    aria-label={ariaLabel || undefined}
    onclick={() => onToggle(!granted)}
  >
    <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
    <span class="manager-status-toggle-label">{granted
      ? text('FABRICATE.Admin.Manager.SystemEdit.FeatureOn', 'On')
      : text('FABRICATE.Admin.Manager.SystemEdit.FeatureOff', 'Off')}</span>
  </button>
</div>

<style>
  .manager-roster-row {
    display: flex;
    gap: var(--fab-space-3);
    align-items: center;
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 10px;
    background: var(--fab-surface-soft);
  }

  .manager-roster-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    border-radius: 8px;
    background: var(--fab-bg-3);
    color: var(--fab-text-secondary);
    font-size: 0.78rem;
  }

  .manager-roster-copy {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    flex: 1;
    min-width: 0;
  }

  .manager-roster-name {
    font-weight: 600;
    font-size: 0.82rem;
    color: var(--fab-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-roster-subtitle {
    font-size: 0.68rem;
    color: var(--fab-text-subtle);
  }
</style>
