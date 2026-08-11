<!-- Svelte 5 runes mode -->
<!--
  The product's ONE row disclosure: the chevron that expands a single labelled ROW into its
  detail, carrying `aria-expanded`, `aria-controls` and an accessible name.

  It is deliberately NOT `CollapsibleGroupHeader`. That component is a GROUP header — it
  owns a heading, a count and the whole header band above a set of rows — and pressing a
  collapsed trigger card open is not the same act as collapsing a section of the page. Two
  "labelled regions that expand" landing in one change must either share an implementation
  or name the behavioural mismatch that forbids it; this is the shared implementation.

  ITS SHIPPED CONSUMER IS THE CHECKS RIGHT RAIL, whose simulator and odds panels each collapse
  to it at the existing ≤1320 breakpoint. The collapsed TRIGGER card is not a second consumer:
  issue 1096 left the trigger cards rendering expanded, so the prototype's summary row —
  condition sentence, effect chip, disclosure — is still to be built. It is recorded here
  rather than claimed, because a primitive justified by a site that does not exist is a
  justification nobody can check. When that row is built it adopts this control.

  It renders a real `<button>` and therefore must not be placed INSIDE another button.
  Converting a `role="button"` wrapper into a `<button>` around it would nest buttons and
  land invalid DOM that `createElement` accepts and no mounted test notices, so a caller
  nests this control beside the row's own content rather than wrapping it.

  Props:
   - expanded: whether the controlled region is open.
   - controls: the `id` of the region this discloses. Required for `aria-controls` to mean
     anything; a caller with no stable id has a layout problem, not an ARIA one.
   - label: the accessible name. It names the ROW, not the action — "Trigger 1: on a
     natural 1" reads correctly under both states because `aria-expanded` supplies the rest.
   - side: 'trailing' (default) or 'leading', which only decides which way the collapsed
     chevron points.
   - dataAttr / dataValue: an optional test/screenshot hook.
-->
<script>
  let {
    expanded = false,
    controls = '',
    label = '',
    side = 'trailing',
    disabled = false,
    dataAttr = '',
    dataValue = '',
    onToggle = () => {},
  } = $props();

  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});
  const collapsedIcon = $derived(
    side === 'leading' ? 'fas fa-chevron-right' : 'fas fa-chevron-down'
  );
  const icon = $derived(expanded ? 'fas fa-chevron-up' : collapsedIcon);
</script>

<button
  type="button"
  class="fab-row-disclosure"
  class:is-expanded={expanded}
  aria-expanded={expanded}
  aria-controls={controls || undefined}
  aria-label={label}
  {disabled}
  {...hookAttributes}
  onclick={() => onToggle(!expanded)}
>
  <i class={icon} aria-hidden="true"></i>
</button>

<style>
  /* Carries the Foundry `<button>` reset itself: the host sheet centres button content and
     pins a fixed height, which would otherwise stretch this control out of its row. */
  .fab-row-disclosure {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 24px;
    height: 24px;
    min-height: 24px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--fab-text-muted);
    background: transparent;
    line-height: 1;
    cursor: pointer;
  }

  .fab-row-disclosure:hover:not(:disabled) {
    border-color: var(--fab-border);
    color: var(--fab-text);
    background: var(--fab-surface-raised);
  }

  .fab-row-disclosure:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 1px;
  }

  .fab-row-disclosure:disabled {
    color: var(--fab-text-disabled);
    cursor: default;
  }

  .fab-row-disclosure > i {
    font-size: 0.72rem;
  }
</style>
