<!-- Svelte 5 runes mode -->
<!--
  The recipe-row / inspector states, as one pill:

   - `subtle`  — Disabled (a recipe the GM switched off), and the inspector's Off state.
   - `success` — the inspector's On state (a dot + the word, mirroring the row's switch).
   - `accent`  — Locked (visible to players, GM-only to craft).
   - `danger`  — Can't enable (an activation blocker: enabling would be refused).
   - `warning` — Incomplete (a persistable authoring shell, not yet craftable).

  Import-free leaf (design-system §7): props only — no foundryBridge, no model or
  util imports. The caller resolves the localized `label` and the Font Awesome
  `icon` class, so nothing here reaches for `game.i18n`.

  Props:
   - tone: 'subtle' | 'success' | 'accent' | 'danger' | 'warning'.
   - icon: a Font Awesome class string (e.g. 'fas fa-lock'); omitted renders none.
   - label: the already-localized pill text.
   - title: optional hover text.
-->
<script>
  let { tone = 'subtle', icon = '', label = '', title = '' } = $props();
</script>

<span class={`fab-status-pill is-${tone}`} data-status-pill={tone} title={title || undefined}>
  {#if icon}<i class={icon} aria-hidden="true"></i>{/if}
  <span class="fab-status-pill-label">{label}</span>
</span>

<style>
  .fab-status-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-chip);
    padding: 1px var(--fab-space-1);
    border: 1px solid transparent;
    border-radius: 999px;
    font-size: 0.62rem;
    font-weight: 600;
    line-height: 1.5;
    white-space: nowrap;
  }

  .fab-status-pill i {
    font-size: 0.58rem;
  }

  .fab-status-pill.is-subtle {
    color: var(--fab-text-subtle);
    background: var(--fab-surface-raised);
  }

  .fab-status-pill.is-success {
    color: var(--fab-success-text);
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
  }

  /* The 6px status dot the inspector's On/Off pill leads with. */
  .fab-status-pill i.fa-circle {
    font-size: 0.36rem;
  }

  .fab-status-pill.is-accent {
    color: var(--fab-accent);
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  .fab-status-pill.is-danger {
    color: var(--fab-danger-text);
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  .fab-status-pill.is-warning {
    color: var(--fab-warning-text);
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }
</style>
