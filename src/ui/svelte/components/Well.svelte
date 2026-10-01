<!-- Svelte 5 runes mode -->
<!--
  THE container level below a card (`<Well>`, `library.html`): one nested geometry — a 1px border,
  radius 9 and `--fab-space-3` padding on `--fab-bg-1` — that no caller re-shapes.

  Props: `label` (the optional kicker at its head, which then names the well as a group),
  `class` (an EXTRA class, appended to `fab-well`) and `children` (the body). The rest spread lands
  on the root after the naming, so a caller's `role`, `aria-*`, `id` and `data-*` win.
-->
<script>
  import Kicker from './Kicker.svelte';

  let { label = '', class: extraClass = '', children = undefined, ...rest } = $props();

  const classes = $derived(['fab-well', extraClass].filter(Boolean).join(' '));
  const naming = $derived(label ? { role: 'group', 'aria-label': label } : {});
</script>

<div class={classes} {...naming} {...rest}>
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

  .fab-well-label {
    margin-bottom: var(--fab-space-2);
  }
</style>
