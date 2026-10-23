<!--
  A routing overview's call site: the change handler the recipe routing card passes, a gap row's
  action, the scope's adders and its note, each word from the row's `data`.
-->
<script>
  import Button from '../../../../src/ui/svelte/components/Button.svelte';
  import Callout from '../../../../src/ui/svelte/components/Callout.svelte';

  let {
    component: Specimen,
    props = {},
    actionLabel = '',
    adders = [],
    scopeNote = null,
  } = $props();

  function change() {}
</script>

{#snippet gapAction()}
  <Button role="ghost">{actionLabel}</Button>
{/snippet}

{#snippet adderRow()}
  {#each adders as adder, index (index)}
    <Button role={adder.role}>{adder.label}</Button>
  {/each}
{/snippet}

{#snippet noteAbove()}
  <Callout tone={scopeNote.tone} title={scopeNote.title} text={scopeNote.text} />
{/snippet}

<Specimen
  {...props}
  onChange={change}
  rowAction={actionLabel ? gapAction : undefined}
  actions={adders.length > 0 ? adderRow : undefined}
  note={scopeNote ? noteAbove : undefined}
/>
