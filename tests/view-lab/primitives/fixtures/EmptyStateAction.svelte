<!--
  An empty panel's way out, as the browsers wire it: the shipped `Button` inside the panel, in the
  verb role the caller picks. The row's `content` is the button's label.
-->
<script>
  import Button from '../../../../src/ui/svelte/components/Button.svelte';

  let { component: Specimen, props = {}, children, role } = $props();

  function ignore() {}
</script>

<Specimen {...props}>
  <Button {role} onclick={ignore}>{@render children?.()}</Button>
</Specimen>
