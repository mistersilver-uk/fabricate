<!-- Svelte 5 runes mode -->
<!--
  THE container level below a card (`<Well>`, `library.html`): one nested geometry — a 1px border,
  radius 9 and `--fab-space-3` padding on `--fab-bg-1`, `--fab-bg-2` on a modal body — that no
  caller re-shapes.

  Props: `label` (the optional kicker at its head, which then names the well as a group), `tone`
  (`'warning'`, `'success'`, `'accent'` or `'info'`, the family's `-border` edge on its `-soft`
  fill, the label in the secondary ink and an inset second edge under forced colours, with no
  in-app caller, issue 2854; anything else draws none), `class` (an EXTRA class, appended to
  `fab-well`) and `children` (the body). The rest spread lands on the root after the naming, so a
  caller's `role`, `aria-*`, `id` and `data-*` win.
-->
<script>
  import Kicker from './Kicker.svelte';

  let { label = '', tone = '', class: extraClass = '', children = undefined, ...rest } = $props();

  const classes = $derived(['fab-well', extraClass].filter(Boolean).join(' '));
  const naming = $derived(label ? { role: 'group', 'aria-label': label } : {});
</script>

<div
  class={classes}
  class:is-tone-warning={tone === 'warning'}
  class:is-tone-success={tone === 'success'}
  class:is-tone-accent={tone === 'accent'}
  class:is-tone-info={tone === 'info'}
  {...naming}
  {...rest}
>
  {#if label}
    <div class="fab-well-label"><Kicker>{label}</Kicker></div>
  {/if}
  {@render children?.()}
</div>

<style>
  .fab-well {
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-1);
  }

  /* A modal body is itself `--fab-bg-1`, so a well on it takes the next level to separate. */
  :global(.fabricate-modal) .fab-well {
    background: var(--fab-bg-2);
  }

  /* Doubled, so a tone outranks the modal fill above whatever the order. */
  .fab-well.fab-well.is-tone-warning {
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }

  .fab-well.fab-well.is-tone-success {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
  }

  .fab-well.fab-well.is-tone-accent {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  .fab-well.fab-well.is-tone-info {
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
  }

  @media (forced-colors: active) {
    .fab-well.fab-well.is-tone-warning,
    .fab-well.fab-well.is-tone-success,
    .fab-well.fab-well.is-tone-accent,
    .fab-well.fab-well.is-tone-info {
      outline: 1px solid canvastext;
      outline-offset: -4px;
    }
  }

  .fab-well-label {
    margin-bottom: var(--fab-space-2);
  }

  /* The kicker's muted ink is under 4.5:1 on a toned fill, so a toned label takes the secondary. */
  .fab-well.fab-well.is-tone-warning > .fab-well-label > :global(.fab-kicker),
  .fab-well.fab-well.is-tone-success > .fab-well-label > :global(.fab-kicker),
  .fab-well.fab-well.is-tone-accent > .fab-well-label > :global(.fab-kicker),
  .fab-well.fab-well.is-tone-info > .fab-well-label > :global(.fab-kicker) {
    color: var(--fab-text-secondary);
  }
</style>
