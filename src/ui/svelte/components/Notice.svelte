<!--
  THE BAR THAT REPORTS WHAT JUST HAPPENED, OR WHAT IS WRONG RIGHT NOW. `library.html` states the
  routing rule: a CALLOUT is documentation — always true, stays put — while a NOTICE is state. The
  specimen states this component's API in full and it is followed VERBATIM. An import-free leaf.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `tone` | `'danger'` \| `'warning'` \| `'info'` \| `'success'` \| `'accent'` | `'danger'` | Changes the edge, the fill, the glyph's ink and the title's ink, NEVER the geometry or type scale. An unknown tone falls back to `danger`, the unmodified specimen. |
  | `title` / `detail` / `icon` | already-localized strings / Font Awesome classes | `''` | The sentence that names what happened, the optional second line saying what to do next, and a leading glyph whose per-tone default is used when unset. |
  | `action` | `{ label, onClick?, description? }` | `null` | Rendered as one button when its `label` is a string with non-blank text and there is a function to call, its own `onClick` or else `onAction`; an already-localized `description` becomes the button's accessible description. |
  | `dismissable` / `dismissLabel` / `blocking` | boolean / string / boolean | `false` / `''` / `false` | An opt-in dismiss control and its accessible name, where dismissal is this component's own state, final for the mount, and the notice leaves the DOM; and `role="alert"` when `blocking`, `role="status"` with `aria-live="polite"` otherwise. |

  Callbacks:
  - `onAction(event)` — called on each press of the action button when `action.onClick` is not a
    function, which wins when both are. The published seam passes it, because a function inside
    `action` is refused there.
  - `onDismiss()` — called once, with no argument, when the dismiss control is pressed: after
    `dismissed` is set and before the flush, so the control still holds focus and the caller can
    move it before the notice leaves the DOM. Optional, because an internal caller dismisses with
    none.

  Rest spread:
  - `{...rest}` lands on the root, written after `class`, and exists for test and screenshot hooks.
    One shipped caller carries two — its own name and the state it is reporting — and a wrapper
    invented to hold the second would be layout minted for a hook. A value is written as passed,
    per the `data-*` spelling rule in `openspec/specs/design-system/spec.md`.

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
  - It takes no `class` and no `style`; a caller that needs layout keeps its own wrapper, and a
    hook is not layout. `align-items: flex-start` is declared explicitly, because the specimen declares no
    `align-items` and renders top-aligned only through its glyph's fixed box and top margin.
  - `.fab-notice-hidden` restates the module's visually hidden set, because a companion's ancestor
    is not `.fabricate` — its clip, and the absence of `.visually-hidden`, are pinned by
    `tests/components/notice-mounted.test.js`.
  - `.fab-notice-button` restates the module's focus pair and three declarations an ApplicationV1
    host's `.app button` rule would otherwise set, for the same reason; the pair is held equal to
    the module ring by `tests/published-component-controls.test.js`.

  Nine recorded deviations from the specimen's stated API: `action.description` (issue 2006), for
  an action whose effect its verb alone does not state; the `accent` tone, whose title and glyph
  take `--fab-accent-text` because the accent itself measures 4.48:1 in `ironblood-forge`, under AA;
  `font-variant-numeric: tabular-nums` on the detail; `icon`, load-bearing because two shipped states
  resolve to the same tone; the rest spread, whose hooks carry no behaviour; the body's 12rem
  basis capped at its text, which wraps the action beneath it in a narrow host (issue 1773);
  `onAction`, a top-level callback beside `action.onClick` (issue 2452); the action button's
  default role at every tone, where the danger specimen draws the danger role (issue 2452); and
  `onDismiss` (issue 2452), because a dismissal that removes a focused control without telling the
  caller breaks the "Fabricate moves no focus" contract.
-->
<script>
  let {
    tone = 'danger',
    title = '',
    detail = '',
    icon = '',
    action = null,
    onAction = undefined,
    onDismiss = undefined,
    dismissable = false,
    dismissLabel = '',
    blocking = false,
    evidence = null,
    ...rest
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

  const uid = $props.id();
  const descriptionId = `${uid}-action-description`;

  const isLabel = (value) => typeof value === 'string' && value.trim() !== '';

  /** What a press calls: `onClick` when it is a function, else `fallback` when it is one. */
  const pressOf = (onClick, fallback) =>
    [onClick, fallback].find((candidate) => typeof candidate === 'function');

  /** One dismissal per mount: a second press before the flush calls nothing. */
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    onDismiss?.();
  }
</script>

{#if !dismissed}
  <div
    class="fab-notice is-{resolvedTone}"
    role={blocking ? 'alert' : 'status'}
    aria-live={blocking ? undefined : 'polite'}
    data-notice-tone={resolvedTone}
    {...rest}
  >
    <i class={resolvedIcon} aria-hidden="true"></i>
    <div class="fab-notice-body">
      <div class="fab-notice-title">{title}</div>
      {#if detail}<div class="fab-notice-detail">{detail}</div>{/if}
    </div>
    {#if isLabel(action?.label) && (typeof action.onClick === 'function' || typeof onAction === 'function')}
      <button
        type="button"
        class="fab-notice-button"
        data-keyboard-focus="true"
        data-notice-action
        aria-describedby={action.description ? descriptionId : undefined}
        onclick={(event) => pressOf(action.onClick, onAction)?.(event)}>{action.label}</button
      >
      {#if action.description}<span class="fab-notice-hidden" id={descriptionId}
          >{action.description}</span
        >{/if}
    {/if}
    {#if dismissable}
      <button
        type="button"
        class="fab-notice-button is-dismiss"
        data-keyboard-focus="true"
        data-notice-dismiss
        aria-label={dismissLabel || undefined}
        onclick={dismiss}
      >
        <i class="fas fa-xmark" aria-hidden="true"></i>
      </button>
    {/if}
    {#if evidence}<div class="fab-notice-evidence">{@render evidence()}</div>{/if}
  </div>
{/if}

<style>
  .fab-notice {
    box-sizing: border-box;
    display: flex;
    align-items: flex-start;
    /* Wrapping carries the evidence band, and the action once the body would fall under its
       12rem basis: the glyph and the controls are `flex: none`, so a wide notice keeps one
       row while a narrow one drops its action beneath the body (issues 1648, 1773). */
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

  /* The basis wraps the action once the body would fall under 12rem, or under its own text when
     that is shorter, so a short title in a shrink-wrapped notice keeps its one row; the action's
     auto margin keeps it at the trailing edge the growing body used to push it to. */
  .fab-notice-body {
    flex: 1 1 12rem;
    min-width: 0;
    max-width: max-content;
  }

  .fab-notice-body + .fab-notice-button {
    margin-left: auto;
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
    /* An ApplicationV1 host's `.app button` stretches a button and glows it under the pointer. */
    width: auto;
    margin: 0;
    box-shadow: none;
  }

  .fab-notice-button:hover {
    color: var(--fab-text);
    background: var(--fab-surface-raised);
  }

  .fab-notice-button.is-dismiss {
    width: 28px;
    padding: 0;
  }

  /* The module's focus pair, restated: under no `.fabricate` ancestor the host rings `button:focus`,
     a pointer press included. */
  .fab-notice-button:focus {
    outline: none;
    box-shadow: none;
  }

  .fab-notice-button:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .fab-notice-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
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
