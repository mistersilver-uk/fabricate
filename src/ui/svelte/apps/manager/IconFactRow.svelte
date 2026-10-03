<!--
  The manager's ONE icon fact row: a bordered well holding a leading accent glyph, a bold one-line
  statement, and a muted qualifying line under it — a side panel's single derived fact about the
  selected thing. It exists because the Tool Studio shipped one meaning as two geometries off one
  projection (issue 881); the geometry kept is the behaviour preview's.

  `icon` / `title` / `subtitle` are the row (omit `icon` to release the glyph column); `titleAttr`,
  `metaAttr`, `metaValue` are hooks; `badge` / `badgeTone` draw a trailing chip; `class` is appended
  to the root's own and `{...rest}` lands on the root after it, carrying the caller's `data-*` hook. `tile`, `density="rule"` and `density="line"` (one line, the subtitle trailing as mono
  meta) are OPT-IN, because the design distinguishes them and the call sites were not all in the
  parity pass. `tone="info"` marks a value that came from SOMEWHERE ELSE, on the theme's own
  `--fab-info`; `success|danger|warning|neutral|muted` ink the glyph by what the row states, each
  from its token and never a literal. The row owns only its own well; how a container
  STACKS rows stays with the container, and a caller override is not available either —
  `manager-layout.test.js` fails on this row's class token appearing in any other manager `.svelte`.
-->
<script>
  import Chip from '../../components/Chip.svelte';
  let {
    icon = '',
    title = '',
    subtitle = '',
    titleAttr = '',
    metaAttr = '',
    metaValue = '',
    tile = false,
    density = 'default',
    tone = 'accent',
    // A TRAILING BADGE naming WHAT a reference is (issue 1371): without it the preview rail's two
    // groups are indistinguishable. Rendered through the manager's ONE chip, empty by default.
    badge = '',
    badgeTone = 'neutral',
    class: extraClass = '',
    ...rest
  } = $props();

  // Spread, so an unset hook is absent rather than an empty attribute a selector would match.
  const titleAttributes = $derived(titleAttr ? { [titleAttr]: true } : {});
  const metaAttributes = $derived(metaAttr ? { [metaAttr]: metaValue || true } : {});
</script>

<div
  class={['manager-icon-fact-row', extraClass]}
  class:is-badged={Boolean(badge)}
  class:is-glyphless={!icon}
  class:is-tiled={tile}
  class:is-rule={density === 'rule'}
  class:is-line={density === 'line'}
  class:is-info={tone === 'info'}
  class:is-tone-success={tone === 'success'}
  class:is-tone-danger={tone === 'danger'}
  class:is-tone-warning={tone === 'warning'}
  class:is-tone-neutral={tone === 'neutral'}
  class:is-tone-muted={tone === 'muted'}
  {...rest}
>
  {#if icon}
    <i class={icon} aria-hidden="true"></i>
  {/if}
  <span>
    <strong {...titleAttributes}>{title}</strong>
    {#if subtitle}
      <small {...metaAttributes}>{subtitle}</small>
    {/if}
  </span>
  {#if badge}
    <Chip tone={badgeTone} data-icon-fact-badge={badge}>{badge}</Chip>
  {/if}
</div>

<style>
  /* Theme-root tokens ONLY, per `openspec/specs/design-system/spec.md`'s "The token namespace is
     one generation and names its purpose": a scoped `<style>` may not reach an area-scoped property. */
  .manager-icon-fact-row {
    /* Area-agnostic, so the padding model is declared rather than inherited from the manager. */
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
    padding: 9px 11px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-bg-1);
  }

  /* A third column as its own rule: an always-present `max-content` track would consume the gap. */
  .manager-icon-fact-row.is-badged {
    grid-template-columns: 28px minmax(0, 1fr) max-content;
  }

  .manager-icon-fact-row.is-badged.is-glyphless {
    grid-template-columns: minmax(0, 1fr) max-content;
  }

  /* A glyph-less row releases the column instead of holding 28px of empty space. */
  .manager-icon-fact-row.is-glyphless {
    grid-template-columns: minmax(0, 1fr);
  }

  .manager-icon-fact-row > i {
    color: var(--fab-accent);
    text-align: center;
  }

  /* Read by its BORDER, not a fill step; the glyph COLUMN is there either way. */
  .manager-icon-fact-row.is-tiled > i {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    font-size: 0.7rem;
  }

  .manager-icon-fact-row.is-info > i {
    color: var(--fab-info);
  }

  /* A small mark inks with its family's `-text` token, per the design system's token rule. */
  .manager-icon-fact-row.is-tone-success > i {
    color: var(--fab-success-text);
  }

  .manager-icon-fact-row.is-tone-danger > i {
    color: var(--fab-danger-text);
  }

  .manager-icon-fact-row.is-tone-warning > i {
    color: var(--fab-warning-text);
  }

  .manager-icon-fact-row.is-tone-neutral > i {
    color: var(--fab-text-muted);
  }

  .manager-icon-fact-row.is-tone-muted > i {
    color: var(--fab-text-disabled);
  }

  .manager-icon-fact-row > span {
    display: grid;
    gap: var(--fab-space-2xs);
    min-width: 0;
  }

  /* `overflow-wrap: anywhere`: a fact is often a generated value with no break opportunity. */
  .manager-icon-fact-row strong {
    font-size: 0.76rem;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .manager-icon-fact-row small {
    color: var(--fab-text-muted);
    font-size: 0.64rem;
    line-height: 1.3;
  }

  /* THE `rule` DENSITY (issue 1373), written after every rule above so what it restates wins on
     source order. THE FILL IS NOT A TWEAK: the design recesses this inset a rung below its aside,
     and our ramp is shifted one rung against the design's, so its `--bg1` is `--fab-bg-0` here. */
  .manager-icon-fact-row.is-rule {
    gap: var(--fab-space-3);
    padding: var(--fab-space-3);
    border-radius: 10px;
    background: var(--fab-bg-0);
  }

  .manager-icon-fact-row.is-rule strong {
    font-size: 11.5px;
    font-weight: 600;
  }

  .manager-icon-fact-row.is-rule small {
    color: var(--fab-text-subtle);
    font-size: 9.5px;
  }

  /* THE `line` DENSITY (issue 2080): the Checks simulator's "What happens" row, one line with the
     subtitle trailing as mono meta. Snapped to the spacing scale; its `--bg1` is `--fab-bg-0`. */
  .manager-icon-fact-row.is-line {
    grid-template-columns: 13px minmax(0, 1fr);
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
    border-radius: 9px;
    background: var(--fab-bg-0);
  }

  .manager-icon-fact-row.is-line.is-glyphless {
    grid-template-columns: minmax(0, 1fr);
  }

  .manager-icon-fact-row.is-line > i {
    font-size: 10.5px;
  }

  .manager-icon-fact-row.is-line > span {
    display: flex;
    align-items: baseline;
    gap: var(--fab-space-2);
  }

  .manager-icon-fact-row.is-line strong {
    flex: 1;
    min-width: 0;
    color: var(--fab-text-secondary);
    font-size: 10.5px;
    font-weight: 500;
  }

  .manager-icon-fact-row.is-line small {
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 10px;
    font-weight: 500;
    white-space: nowrap;
  }
</style>
