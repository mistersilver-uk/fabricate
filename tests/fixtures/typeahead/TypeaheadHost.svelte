<!-- A caller binding `Typeahead`'s query, reporting every write the binding receives (issue 1782). -->
<script>
  import Typeahead from '../../../src/ui/svelte/components/Typeahead.svelte';

  let { onWrite = () => {}, initialQuery = '', ...props } = $props();
  // svelte-ignore state_referenced_locally
  let query = $state(initialQuery);
</script>

<Typeahead
  {...props}
  bind:query={
    () => query,
    (next) => {
      query = next;
      onWrite(next);
    }
  }
/>
<button type="button" data-outside>Elsewhere</button>
