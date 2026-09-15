<!--
  THE BAR THAT REPORTS WHAT JUST HAPPENED, OR WHAT IS WRONG RIGHT NOW. `library.html` states the
  routing rule: a CALLOUT is documentation — always true, stays put — while a NOTICE is state. The
  specimen states this component's API in full and it is followed VERBATIM. An import-free leaf.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `tone` | `'danger'` \| `'warning'` \| `'info'` \| `'success'` \| `'accent'` | `'danger'` | Changes the edge, the fill, the glyph's ink and the title's ink, NEVER the geometry or type scale. An unknown tone falls back to `danger`, the unmodified specimen. |
  | `title` / `detail` / `icon` | already-localized strings / Font Awesome classes | `''` | The sentence that names what happened, the optional second line saying what to do next, and a leading glyph whose per-tone default is used when unset. |
  | `action` | `{ label, onClick }` | `null` | Rendered as one button; the handler is called with the click event. |
  | `dismissable` / `dismissLabel` / `blocking` | boolean / string / boolean | `false` / `''` / `false` | An opt-in dismiss control and its accessible name, where dismissal is this component's own state and the notice leaves the DOM; and `role="alert"` when `blocking`, `role="status"` with `aria-live="polite"` otherwise. |
  | `dataAttr` / `dataValue` / `stateDataAttr` / `stateDataValue` | strings | `''` | TWO hook pairs on the same root, because one shipped caller carries two — its own name and the state it is reporting — and a wrapper invented to hold the second would be layout minted for a hook. Both are spread, so an unset hook is ABSENT, and both values pass through as written per the `data-*` spelling rule in `openspec/specs/design-system/spec.md`. |

  Invariants:
  - `dismissLabel` IS REQUIRED OF ANY CALLER THAT PASSES `dismissable`, because the control's only
    visible content is a glyph. It is nevertheless declared with an empty-string default and a
    guarded binding, the shape `IconButton.svelte` uses, for the empty-`aria-label` reason
    `openspec/specs/design-system/spec.md` states; every button this component emits also carries
    `data-keyboard-focus="true"`, per the same spec.
  - THE ROLE IS WHAT ANNOUNCES, NOT `aria-live` ALONE, because both shipped callers INSERT this
    component together with its text — again the same spec's rule. The PAGE-LEVEL arbitration the
    design system requires belongs to a shared region that has not shipped; this prop does not claim
    it.
  - IT TAKES NO `class`, NO `style` AND NO REST SPREAD; a caller that needs LAYOUT keeps its own
    wrapper. `align-items: flex-start` is declared explicitly, because the specimen declares no
    `align-items` and renders top-aligned only through its glyph's fixed box and top margin.

  Four recorded deviations from the specimen's stated API: the `accent` tone, whose title and glyph
  take `--fab-accent-text` because the accent itself measures 4.48:1 in `ironblood-forge`, under AA;
  `font-variant-numeric: tabular-nums` on the detail; `icon`, load-bearing because two shipped states
  resolve to the SAME tone; and the hook props, which carry no behaviour.
-->
<script>
  let {
    tone = 'danger',
    title = '',
    detail = '',
    icon = '',
    action = null,
    dismissable = false,
    dismissLabel = '',
    blocking = false,
    dataAttr = '',
    dataValue = '',
    stateDataAttr = '',
    stateDataValue = '',
  } = $props();

  const TONES = new Set(['danger', 'warning', 'info', 'success', 'accent']);

  const DEFAULT_ICONS = {
    danger: 'fas fa-triangle-exclamation',
    warning: 'fas fa-triangle-exclamation',
    info: 'fas fa-circle-info',
    success: 'fas fa-circle-check',
    accent: 'fas fa-circle-info',
  };

  const resolvedTone = $derived(TONES.has(tone) ? tone : 'danger');
  const resolvedIcon = $derived(icon || DEFAULT_ICONS[resolvedTone]);

  let dismissed = $state(false);

  const hookAttributes = $derived({
    ...(dataAttr ? { [dataAttr]: dataValue } : {}),
    ...(stateDataAttr ? { [stateDataAttr]: stateDataValue } : {}),
  });
</script>

{#if !dismissed}
  <div
    class="fab-notice is-{resolvedTone}"
    role={blocking ? 'alert' : 'status'}
    aria-live={blocking ? undefined : 'polite'}
    data-notice-tone={resolvedTone}
    {...hookAttributes}
  >
    <i class={resolvedIcon} aria-hidden="true"></i>
    <div class="fab-notice-body">
      <div class="fab-notice-title">{title}</div>
      {#if detail}<div class="fab-notice-detail">{detail}</div>{/if}
    </div>
    {#if action}
      <button
        type="button"
        class="fab-notice-button"
        data-keyboard-focus="true"
        data-notice-action
        onclick={(event) => action.onClick?.(event)}>{action.label}</button
      >
    {/if}
    {#if dismissable}
      <button
        type="button"
        class="fab-notice-button is-dismiss"
        data-keyboard-focus="true"
        data-notice-dismiss
        aria-label={dismissLabel || undefined}
        onclick={() => (dismissed = true)}
      >
        <i class="fas fa-xmark" aria-hidden="true"></i>
      </button>
    {/if}
  </div>
{/if}

<style>
  .fab-notice {
    box-sizing: border-box;
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-3);
    min-width: 0;
    margin: 0;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-danger-border);
    border-radius: 11px;
    background: var(--fab-danger-soft);
  }

  .fab-notice > i {
    flex: none;
    width: 13px;
    margin-top: var(--fab-space-2xs);
    color: var(--fab-danger-text);
    font-size: 13px;
    line-height: 1;
    text-align: center;
  }

  .fab-notice-body {
    flex: 1;
    min-width: 0;
  }

  .fab-notice-title {
    color: var(--fab-danger-text);
    font-size: 12px;
    font-weight: 600;
  }

  .fab-notice-detail {
    margin-top: var(--fab-space-2xs);
    color: var(--fab-text-muted);
    font-size: 11px;
    font-weight: 400;
    line-height: 1.55;
    font-variant-numeric: tabular-nums;
  }

  .fab-notice-button {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-chip);
    height: 28px;
    min-height: 28px;
    padding: 0 var(--fab-space-3);
    border: 1px solid transparent;
    border-radius: 7px;
    color: var(--fab-text-secondary);
    background: var(--fab-surface-soft);
    font-size: 12.5px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }

  .fab-notice-button:hover {
    color: var(--fab-text);
    background: var(--fab-surface-raised);
  }

  .fab-notice-button.is-dismiss {
    width: 28px;
    padding: 0;
  }

  .fab-notice.is-warning {
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }

  .fab-notice.is-warning > i,
  .fab-notice.is-warning .fab-notice-title {
    color: var(--fab-warning-text);
  }

  .fab-notice.is-info {
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
  }

  .fab-notice.is-info > i,
  .fab-notice.is-info .fab-notice-title {
    color: var(--fab-info-text);
  }

  .fab-notice.is-success {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
  }

  .fab-notice.is-success > i,
  .fab-notice.is-success .fab-notice-title {
    color: var(--fab-success-text);
  }

  .fab-notice.is-accent {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  .fab-notice.is-accent > i,
  .fab-notice.is-accent .fab-notice-title {
    color: var(--fab-accent-text);
  }
</style>
