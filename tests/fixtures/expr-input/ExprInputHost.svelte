<!-- A caller holding the expression field's value, reporting every write it receives (issue 2465). -->
<script>
  import RollDataExpressionInput from '../../../src/ui/svelte/components/RollDataExpressionInput.svelte';

  let {
    initialValue = '',
    tokens = [],
    shell = false,
    disabled = false,
    resolve = undefined,
    echo = (next) => next,
    onWrite = () => {},
  } = $props();
  // svelte-ignore state_referenced_locally
  let value = $state(initialValue);

  function write(next) {
    value = echo(next);
    onWrite(next);
  }
</script>

<button type="button" data-before>Before the field</button>
<div class={shell ? 'fabricate-field' : ''} data-host>
  <span id="expr-input-caption">Expression</span>
  <RollDataExpressionInput
    aria-labelledby="expr-input-caption"
    {value}
    {tokens}
    {disabled}
    tokensLabel="Add a term"
    {resolve}
    unresolvedLabel="Unresolved"
    onChange={write}
  />
</div>
