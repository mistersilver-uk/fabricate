<!--
  A flush card whose body is a well, as the library's collapsible card draws it: the row's `content`
  is the card's head, and the shipped `Well` sits under it with its kicker. The well's inset is the
  row's `data` style, because a flush card's body insets itself.
-->
<script>
  import Well from '../../../../src/ui/svelte/components/Well.svelte';

  let { component: Specimen, props = {}, children, wellLabel, wellStyle } = $props();
</script>

<Specimen {...props}>
  {@render children?.()}
  <Well label={wellLabel} style={wellStyle} />
</Specimen>
