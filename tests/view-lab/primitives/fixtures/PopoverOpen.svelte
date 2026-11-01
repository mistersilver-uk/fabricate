<!--
  A popover open on its anchor. The anchor is the shipped `Button`, carrying the id the row's
  `anchorId` names and drawn before the popover, which is placed under it; the title snippet draws
  the row's `title` word.
-->
<script>
  import Button from '../../../../src/ui/svelte/components/Button.svelte';

  let { component: Specimen, props = {}, anchorLabel = '', heading = '', body } = $props();

  function close() {}
  function press() {}
</script>

{#snippet title()}{heading}{/snippet}

<Button id={props.anchorId} onclick={press}>{anchorLabel}</Button>
<Specimen {...props} {title} {body} onClose={close} />
