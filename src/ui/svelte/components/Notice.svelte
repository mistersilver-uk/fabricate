<!--
  THE BAR THAT REPORTS WHAT JUST HAPPENED, OR WHAT IS WRONG RIGHT NOW. `library.html` states the
  routing rule: a CALLOUT is documentation — always true, stays put — while a NOTICE is state: it
  just happened, and it goes away. The specimen states this component's API in full and it is
  followed VERBATIM, including its spellings. An IMPORT-FREE LEAF, for `InspectorCard.svelte`'s
  reason.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `tone` | `'danger'` \| `'warning'` \| `'info'` \| `'success'` \| `'accent'` | `'danger'` | Changes the edge, the fill, the glyph's ink and the title's ink. NEVER the geometry or the type scale. An unknown tone falls back to `danger`, which is the unmodified specimen. |
  | `title` / `detail` | already-localized strings | `''` | The sentence that names what happened, and the optional second line saying what to do next. |
  | `icon` | Font Awesome classes | `''` | A per-tone default is used when unset. |
  | `action` | `{ label, onClick }` | `null` | Rendered as one button; the handler is called with the click event. |
  | `dismissable` / `dismissLabel` | boolean / string | `false` / `''` | An opt-in dismiss control and its accessible name. Dismissal is this component's own state — the notice leaves the DOM. |
  | `blocking` | boolean | `false` | `role="alert"` when true, `role="status"` with `aria-live="polite"` otherwise. |
  | `dataAttr` / `dataValue` / `stateDataAttr` / `stateDataValue` | strings | `''` | TWO hook pairs on the same root, because one shipped caller carries two — its own name and, beside it, the state it is reporting. A wrapper invented to hold the second would be layout minted for a hook. Both are spread, so an unset hook is ABSENT rather than an empty attribute a selector would still match, and both values are passed through AS WRITTEN, so a hook written bare on the element this replaces still renders `=""` rather than the `="true"` a bare attribute on a component tag produces. |

  Invariants:
  - `dismissLabel` IS REQUIRED OF ANY CALLER THAT PASSES `dismissable`: the control's only visible
    content is a glyph, and `spec.md`'s icon-only scenario makes such a control's accessible name a
    required prop. It is nevertheless declared with an empty-string default and a guarded binding,
    the shape `IconButton.svelte` uses, because an empty `aria-label` SUPPRESSES an element's name
    rather than falling back to its content — so an unset label must OMIT the attribute. The
    default is the failure mode's mitigation, not permission to leave the control unnamed.
  - EVERY BUTTON THIS COMPONENT EMITS CARRIES `data-keyboard-focus="true"`, so Foundry's
    `KeyboardManager#hasFocus` sees the focus and Space does not pause the game behind the open
    application.
  - THE ROLE IS WHAT ANNOUNCES, NOT `aria-live` ALONE. Both shipped callers INSERT this component
    together with its text, and a live region created in the same mutation as its content is not
    announced — only its later updates are — while a live-region ROLE is recognised on insertion.
    The PAGE-LEVEL arbitration the design system requires, one blocking bar at a time with the rest
    stacking beneath it, belongs to a shared region that has not shipped; this prop does not claim
    it.
  - IT TAKES NO `class`, NO `style` AND NO REST SPREAD. A caller that needs LAYOUT keeps its own
    wrapper and nests this inside it.
  - `align-items: flex-start` IS DECLARED EXPLICITLY. The specimen declares no `align-items` at all
    and renders top-aligned only because its glyph is a fixed box with a top margin, so attributing
    `flex-start` to it would be wrong.

  Four recorded deviations from the specimen's stated API: `tone` also accepts `accent`, whose
  title AND glyph take `--fab-accent-text` rather than `--fab-accent`, because inking an accent
  band with the accent itself measures 4.48:1 in `ironblood-forge`, under AA;
  `font-variant-numeric: tabular-nums` on the detail, so a live count sentence does not jitter;
  `icon`, which is load-bearing rather than a convenience, because two shipped states resolve to
  the SAME tone and no per-tone default can express them; and the hook props, which are
  attribute-only and carry no behaviour.
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
    evidence = null,
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
    {#if evidence}<div class="fab-notice-evidence">{@render evidence()}</div>{/if}
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
  /* THEME-ROOT TOKENS ONLY. No scoped `<style>` may reference `--fab-manager-*`, or any other
     property `styles/fabricate.css` declares inside `.fabricate-manager`, from ANY directory: a
     component is placed in a directory, not in a DOM subtree, so its scoped CSS cannot guarantee
     where its host renders. `tests/token-generation-gate.test.js` reds the reference. */
  .fab-notice {
    box-sizing: border-box;
    display: flex;
    align-items: flex-start;
    /* Wrapping carries the evidence band only: the glyph is `flex: none`, the body is
       `flex: 1` (basis 0) and the controls are `flex: none`, so line breaking sees a row
       that fits until it genuinely cannot (issue 1648). */
    flex-wrap: wrap;
    gap: var(--fab-space-3);
    /* The specimen's gap is BETWEEN THE COLUMNS, so the band keeps the space-2 it
       shipped with and this moves its left edge and nothing else. */
    row-gap: var(--fab-space-2);
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

  /* A BAND, NOT A COLUMN (issue 1648). Evidence is a grid of rows, and inside
     `.fab-notice-body` it began after the glyph column and its gap, so a "Run completed"
     card indented its consumed/produced lists while the stage card beside it did not. It
     is a flex sibling now, with a 100% basis that wraps it onto its own line at the
     notice's own padding box. */
  .fab-notice-evidence {
    display: grid;
    flex: 1 1 100%;
    min-width: 0;
    gap: var(--fab-space-2);
    font-family: var(--fab-font-mono);
    font-size: 11px;
    color: var(--fab-text-secondary);
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
