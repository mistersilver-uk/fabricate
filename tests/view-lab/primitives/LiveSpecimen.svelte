<!--
  One real component, standing where the library drew one (issue 1487).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `path` | repository-relative component path | `''` | Stamped as `data-primitive-lab-specimen`, one element per catalogue row. |
  | `component` | Svelte component | required | The component the row names. |
  | `props` | plain object | `{}` | Spread verbatim; specimens are not stateful. |
  | `content` | node array | `null` | The children snippet: a string, or `{tag, attrs, text, children}`; neither `text` nor `children` is a void element. |
  | `snippets` | `{actions?, body?, footer?, meta?}` of node arrays | `{}` | Named snippets, same node shape, each taking no argument; `specimenMount.js` refuses a name outside `SPECIMEN_SNIPPET_NAMES`. |
-->
<script>
  let { path = '', component: Specimen, props = {}, content = null, snippets = {} } = $props();

  /** The named snippets this row supplies, each one of the declared snippets below. */
  function supplied(declared) {
    return Object.fromEntries(Object.keys(snippets).map((name) => [name, declared[name]]));
  }
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

{#snippet actions()}{@render nodes(snippets.actions)}{/snippet}
{#snippet body()}{@render nodes(snippets.body)}{/snippet}
{#snippet footer()}{@render nodes(snippets.footer)}{/snippet}
{#snippet meta()}{@render nodes(snippets.meta)}{/snippet}

<div class="pl-specimen" data-primitive-lab-specimen={path}>
  {#if content}
    <Specimen {...props} {...supplied({ actions, body, footer, meta })}
      >{@render nodes(content)}</Specimen
    >
  {:else}
    <Specimen {...props} {...supplied({ actions, body, footer, meta })} />
  {/if}
</div>
