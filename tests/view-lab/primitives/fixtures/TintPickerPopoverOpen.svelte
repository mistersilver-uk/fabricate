<!--
  The tint popover open, as the New-biome swatch opens it (issue 2459): the specimen's trigger
  snippet is a `Button` the row names, the panel is open from the start, and No colour is offered
  with a handler, so the frame draws the whole panel the library's shipped unit draws.
-->
<script>
  import Button from '../../../../src/ui/svelte/components/Button.svelte';

  let { component: Specimen, props = {}, triggerIcon = '', triggerLabel = '' } = $props();

  let open = $state(true);

  function ignore() {}
</script>

<Specimen {...props} bind:open allowNone onClear={ignore} onChange={ignore}>
  {#snippet trigger({ attributes })}
    <Button icon={triggerIcon} aria-label={triggerLabel} {...attributes} />
  {/snippet}
</Specimen>
