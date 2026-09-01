<!-- Svelte 5 runes mode -->
<!--
  The recipe-row / inspector states, as one pill:

   - `subtle`  — Disabled (a recipe the GM switched off), and the inspector's Off state.
   - `success` — the inspector's On state (a dot + the word, mirroring the row's switch).
   - `accent`  — Locked (visible to players, GM-only to craft).
   - `danger`  — Can't enable (an activation blocker: enabling would be refused).
   - `warning` — Incomplete (a persistable authoring shell, not yet craftable).
   - `info`    — In progress / not yet resolved: an outcome that is neither a
                 success nor a failure and needs no action from the player (the
                 bulk salvage report's time-gated "Started — finishes when time
                 passes" row, issue 859). ADDED, not repurposed: every existing
                 consumer computes its tone from a closed set that excludes
                 `info`, so no shipped pixel changes.

  These five — now six — are the WHOLE ramp. A new state belongs on one of them;
  adding a seventh means the state genuinely is not any of the six, which has not
  happened yet.

  Import-free leaf (design-system §7): props only — no foundryBridge, no model or
  util imports. The caller resolves the localized `label` and the Font Awesome
  `icon` class, so nothing here reaches for `game.i18n`.

  ── AN UNRECOGNISED TONE FALLS BACK; IT DOES NOT RENDER UNSTYLED (issue 1372) ─────

  Every tone rule below is a THREE-property block — colour, border-colour, fill — over a base
  that declares `border: 1px solid transparent` and no background at all. So a caller naming a
  tone this component does not have got a pill with no fill and no edge: a bare glyph and some
  small text, which reads as a deliberately quieter treatment rather than as a mistake. Four
  essence call sites shipped `neutral` and `positive` — neither is in the ramp — and the result
  was two visibly different status treatments one click apart on the same state, which survived
  three review rounds because nothing anywhere fails on it.

  `Chip` already settles this the same way for the same reason ("a typo shows up as the
  recessive default instead of as nothing at all"), so this is that rule applied to the second
  pill rather than a new idea. `data-status-pill` reports the RESOLVED tone, so a test can see
  the fallback happen.

  Props:
   - tone: 'subtle' | 'success' | 'accent' | 'danger' | 'warning' | 'info'; anything else
     resolves to 'subtle'.
   - icon: a Font Awesome class string (e.g. 'fas fa-lock'); omitted renders none.
   - label: the already-localized pill text.
   - title: optional hover text.
-->
<script>
  let { tone = 'subtle', icon = '', label = '', title = '' } = $props();

  /** The whole ramp, closed. @type {ReadonlySet<string>} */
  const TONES = new Set(['subtle', 'success', 'accent', 'danger', 'warning', 'info']);

  const resolvedTone = $derived(TONES.has(tone) ? tone : 'subtle');
</script>

<span
  class={`fab-status-pill is-${resolvedTone}`}
  data-status-pill={resolvedTone}
  title={title || undefined}
>
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

  .fab-status-pill.is-info {
    color: var(--fab-info-text);
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
  }
</style>
