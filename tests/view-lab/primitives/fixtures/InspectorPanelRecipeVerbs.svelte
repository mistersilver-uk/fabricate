<!-- The recipe inspector's three record verbs in the panel's foot, as `RecipeBrowserInspector` renders them. -->
<script>
  import Button from '../../../../src/ui/svelte/components/Button.svelte';

  let { component: Specimen, props = {}, children = undefined, duplicate, edit, remove } = $props();

  function ignore() {}
</script>

<Specimen {...props}>
  {@render children?.()}
  {#snippet foot()}
    <Button fullWidth onclick={ignore}>{duplicate}</Button>
    <Button role="primary" fullWidth onclick={ignore}>{edit}</Button>
    <Button role="danger" fullWidth onclick={ignore}>{remove}</Button>
  {/snippet}
</Specimen>
