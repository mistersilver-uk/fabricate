<!--
  THE STANDING STATEMENT: a leading semantic glyph beside a note that is always true, in a rounded
  strip. A CALLOUT is documentation — always true, stays put — while a NOTICE is state that just
  happened and goes away; `components/Notice.svelte` is the other one. It exists because two tabs of
  one screen had drifted into two of it (issue 785).

  `tone` (`neutral` by default, plus `info`, `accent`, `warning`, `success`, `danger`) repaints the
  edge, the fill, the GLYPH's ink and the TITLE's ink, and nothing else; an unknown value falls back
  to neutral. `info` is reserved for a note about LIVE state and `warning` for a hazard the reader
  can still avoid, since a screen that paints its permanent hint in `warning` has spent the colour
  meant to make the hazard stand out. At `accent` the ink is `--fab-accent-text`, not `--fab-accent`,
  which measures 4.48:1 in `ironblood-forge` and fails AA. `title`, `text`, `icon`, an `actions`
  snippet drawn inside the strip so a note and the control answering it are one object, and a
  `dataAttr`/`dataValue` hook are the rest.

  The geometry is the specimen's and the QUIET treatment is the DEFAULT (issue 1505), with
  `tone="info"` opt-in; there is deliberately no `quiet` prop, because a second geometry is the drift
  this component removes. Its CSS is scoped here rather than in `styles/fabricate.css`, so
  `VIEW_RECIPES` in `scripts/ui-pr-screenshot-evidence.mjs` maps a change to the views that render it.
-->
<script>
  let {
    tone = 'neutral',
    title = '',
    text = '',
    icon = '',
    actions = undefined,
    dataAttr = '',
    dataValue = '',
  } = $props();

  const TONES = new Set(['neutral', 'info', 'accent', 'warning', 'success', 'danger']);

  const DEFAULT_ICONS = {
    neutral: 'fas fa-circle-info',
    info: 'fas fa-circle-info',
    accent: 'fas fa-circle-info',
    warning: 'fas fa-triangle-exclamation',
    success: 'fas fa-circle-check',
    danger: 'fas fa-circle-exclamation',
  };

  const resolvedTone = $derived(TONES.has(tone) ? tone : 'neutral');
  const resolvedIcon = $derived(icon || DEFAULT_ICONS[resolvedTone]);

  // A `<p>` cannot legally contain a heading-shaped child or a button, so the root follows content.
  const structured = $derived(Boolean(title) || Boolean(actions));

  // Spread, so an unset hook is absent rather than an empty attribute a selector would match.
  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});
</script>

<svelte:element
  this={structured ? 'div' : 'p'}
  role={structured ? 'note' : undefined}
  class="manager-callout"
  class:is-info={resolvedTone === 'info'}
  class:is-accent={resolvedTone === 'accent'}
  class:is-warning={resolvedTone === 'warning'}
  class:is-success={resolvedTone === 'success'}
  class:is-danger={resolvedTone === 'danger'}
  data-callout-tone={resolvedTone}
  {...hookAttributes}
>
  <i class={resolvedIcon} aria-hidden="true"></i>
  <span class="manager-callout-body">
    {#if title}<span class="manager-callout-title">{title}</span>{/if}
    <span class="manager-callout-text">{text}</span>
  </span>
  {#if actions}<span class="manager-callout-actions">{@render actions()}</span>{/if}
</svelte:element>

<style>
  /* Theme-root tokens ONLY, per `openspec/specs/design-system/spec.md`'s "The token namespace is
     one generation and names its purpose": a scoped `<style>` may not reach an area-scoped property. */
  .manager-callout {
    /* Area-agnostic, so the padding model is declared rather than inherited from the manager. */
    box-sizing: border-box;
    display: flex;
    /* DECLARED: the specimen's glyph is a fixed box, so attributing this to it would be wrong. */
    align-items: flex-start;
    gap: var(--fab-space-3);
    min-width: 0;
    margin: 0;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 11px;
    color: var(--fab-text-muted);
    background: var(--fab-surface-soft);
    font-size: 11.5px;
    font-weight: 400;
    line-height: 1.6;
  }

  /* `.k-callout .i`'s fixed 13px box, so a wide glyph cannot widen the leading column. */
  .manager-callout > i {
    flex: none;
    width: 13px;
    margin-top: var(--fab-space-2xs);
    color: var(--fab-text-subtle);
    font-size: 13px;
    line-height: 1;
    text-align: center;
  }

  .manager-callout-body {
    flex: 1;
    min-width: 0;
  }

  /* `.k-notice .ttl`'s own metrics — see the header for why the title borrows them whole. */
  .manager-callout-title {
    display: block;
    color: var(--fab-text);
    font-size: 12px;
    font-weight: 600;
  }

  .manager-callout-text {
    display: block;
  }

  /* `.k-notice .det`'s 2px, and only where there is a title for the body to sit under. */
  .manager-callout-title + .manager-callout-text {
    margin-top: var(--fab-space-2xs);
  }

  .manager-callout-actions {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  /* The body stays `--fab-text-muted` at every tone, as the specimen has it. */
  .manager-callout.is-info {
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
  }

  .manager-callout.is-info > i,
  .manager-callout.is-info .manager-callout-title {
    color: var(--fab-info-text);
  }

  /* `--fab-accent-text`, not `--fab-accent` — see the header for the contrast measurement. */
  .manager-callout.is-accent {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  .manager-callout.is-accent > i,
  .manager-callout.is-accent .manager-callout-title {
    color: var(--fab-accent-text);
  }

  .manager-callout.is-warning {
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }

  .manager-callout.is-warning > i,
  .manager-callout.is-warning .manager-callout-title {
    color: var(--fab-warning-text);
  }

  .manager-callout.is-success {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
  }

  .manager-callout.is-success > i,
  .manager-callout.is-success .manager-callout-title {
    color: var(--fab-success-text);
  }

  .manager-callout.is-danger {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  .manager-callout.is-danger > i,
  .manager-callout.is-danger .manager-callout-title {
    color: var(--fab-danger-text);
  }
</style>
