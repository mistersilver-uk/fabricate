<!--
  One real component, standing where the library drew one.

  ── IT RENDERS PROPS AND CONTENT, AND NOTHING ELSE ──────────────────────────────────────────────

  No knobs, no story matrix, no event log, no theme row, no invocation codegen. A catalogue row is
  a component path, a plain props object and — for the primitives that take one — the children a
  call site would put inside it. That is the complete vocabulary, and the shortness is the feature:
  the reader is looking at the LIBRARY, and a control panel beside every entry is the thing that
  turned the last version of this page from reference material into a workbench.

  Specimens are deliberately NOT stateful. Their props are fixed, so a Stepper's `+` reports
  through `onChange` and the value does not move — exactly as the library's own `readonly` inputs
  do not move. What IS live is everything a drawing could never show: real geometry from
  `styles/fabricate.css`, real `:hover` and `:focus-visible` from the shipped rules, real font
  metrics, and the real element tree a screen reader would walk. Adding write-back would mean
  declaring per row which prop an event feeds, which is a knob under another name.

  ── `content` IS A NODE TREE RATHER THAN MARKUP ─────────────────────────────────────────────────

  `{@html}` would be one line shorter and would put an unparsed markup string in a JSON file, where
  a typo renders as a broken box and nothing says so. The node form — a string, or
  `{tag, attrs, text, children}` — is checked by the compiler at every level, escapes its own text,
  and reads in the catalogue as what it is: the markup a CALL SITE supplies to a container
  primitive, not library content being re-authored here.

  ── AND IT CARRIES THE ONE IDENTITY ATTRIBUTE THE SMOKE READS ───────────────────────────────────

  `data-primitive-lab-specimen`, valued with the catalogue row's `path`, on exactly one element per
  ROW. `scripts/primitive-lab-smoke.mjs` collects every element carrying it and compares the result
  against the paths `scripts/lib/primitiveLabSmoke.js` reads off the catalogue files, so the
  invariant to preserve if this component ever gains a second call site is one element per row,
  page-wide. A path appearing many times is expected and correct — `<Button>` alone stands in
  eleven places — because that comparison is by membership on the set and by EQUALITY on the count.

  The attribute name is spelled here rather than imported: `scripts/lib/primitiveLabSmoke.js` reads
  `node:fs` and this file is a browser bundle, so there is no constant the two halves can share.
  What catches a drift between them is `npm run lab:check` itself, and loudly — rename either half
  and the smoke finds zero specimens against a non-empty catalogue and reports every row as never
  mounted.
-->
<script>
  let { path = '', component: Specimen, props = {}, content = null } = $props();
</script>

{#snippet nodes(list)}
  {#each list as node, index (index)}
    {#if typeof node === 'string'}
      {node}
    {:else if node.text === undefined && node.children === undefined}
      <!-- A void element — `input`, `br`, `img`. Svelte refuses children on one, and this branch
           is what keeps the catalogue from having to know that. -->
      <svelte:element this={node.tag} {...node.attrs ?? {}} />
    {:else}
      <svelte:element this={node.tag} {...node.attrs ?? {}}>
        {#if node.text !== undefined}{node.text}{/if}
        {#if node.children !== undefined}{@render nodes(node.children)}{/if}
      </svelte:element>
    {/if}
  {/each}
{/snippet}

<!--
  `display: contents` in `page.css`, so the component's own root is what the library's layout lays
  out and the specimen sits exactly where the drawing sat.
-->
<div class="pl-specimen" data-primitive-lab-specimen={path}>
  {#if content}
    <Specimen {...props}>{@render nodes(content)}</Specimen>
  {:else}
    <Specimen {...props} />
  {/if}
</div>
