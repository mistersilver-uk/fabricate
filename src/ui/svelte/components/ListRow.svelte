<!-- Dense, read-only ListRow. The caller supplies entitled display strings, including quantity. -->
<script>
  import Medallion from './Medallion.svelte';

  let {
    name = '',
    art = '',
    icon = 'fas fa-box',
    tint = '',
    quantity = null,
    detail = '',
    tone = 'neutral',
    muted = false,
    trailing = null,
  } = $props();
</script>

<div
  class="fabricate-list-row"
  class:is-positive={tone === 'positive'}
  class:is-muted={muted}
  data-list-row="dense"
>
  <Medallion {art} {icon} {tint} alt="" size={22} />
  <span class="fabricate-list-row-name" title={name}>{name}</span>
  {#if detail}<span class="fabricate-list-row-detail">{detail}</span>{/if}
  {#if quantity != null}<span class="fabricate-list-row-quantity">{quantity}</span>{/if}
  {#if trailing}{@render trailing()}{/if}
</div>
