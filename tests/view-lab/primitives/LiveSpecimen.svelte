<!--
  One real component, standing where the library drew one (issue 1487).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `path` | repository-relative component path | `''` | Stamped as `data-primitive-lab-specimen`, one element per catalogue row. |
  | `component` | Svelte component | required | The component the row names. |
  | `props` | plain object | `{}` | Spread verbatim; specimens are not stateful. |
  | `content` | node array | `null` | The children snippet: a string, or `{tag, attrs, text, children}`; neither `text` nor `children` is a void element. |
  | `snippets` | `{body?, footer?}` of node arrays | `{}` | Named snippets, same node shape; `specimenMount.js` refuses a name outside `SPECIMEN_SNIPPET_NAMES`. |
-->
<script>
  let { path = '', component: Specimen, props = {}, content = null, snippets = {} } = $props();
</script>

{#snippet nodes(list)}
  {#each list as node, index (index)}
    {#if typeof node === 'string'}
      {node}
    {:else if node.text === undefined && node.children === undefined}
      <svelte:element this={node.tag} {...node.attrs ?? {}} />
    {:else}
      <svelte:element this={node.tag} {...node.attrs ?? {}}>
        {#if node.text !== undefined}{node.text}{/if}
        {#if node.children !== undefined}{@render nodes(node.children)}{/if}
      </svelte:element>
    {/if}
  {/each}
{/snippet}

{#snippet body()}{@render nodes(snippets.body)}{/snippet}
{#snippet footer()}{@render nodes(snippets.footer)}{/snippet}

<div class="pl-specimen" data-primitive-lab-specimen={path}>
  {#if content}
    <Specimen {...props} {...snippets.body ? { body } : {}} {...snippets.footer ? { footer } : {}}
      >{@render nodes(content)}</Specimen
    >
  {:else}
    <Specimen
      {...props}
      {...snippets.body ? { body } : {}}
      {...snippets.footer ? { footer } : {}}
    />
  {/if}
</div>
