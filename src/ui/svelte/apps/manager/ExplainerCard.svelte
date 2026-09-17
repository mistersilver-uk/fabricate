<!--
  The manager's ONE "how this surface works" explainer card: a glyph-led uppercase title, a list of
  glyph-led guidance rows (each an optional bold lead-in plus prose), and an optional trailing row of
  docs links, built because the same explanation had been built three ways (issue 881). The SHELL is
  not re-derived — the root wears `.manager-inspector-card` and the title `.manager-card-title` — so
  this file owns only the title's glyph alignment, the rows and the link. `items` is
  `[{ icon, lead, text }]`; `links` is `[{ href, label, icon }]`, each needing BOTH, and is a LIST
  because a one-link cap is the incompatibility that keeps a hand-rolled card alive (issue 883).
-->
<script>
  import ManagerButton from '../../components/ManagerButton.svelte';
  import InspectorCard from '../../components/InspectorCard.svelte';

  const DEFAULT_LINK_ICON = 'fas fa-arrow-up-right-from-square';

  let { icon = '', title = '', items = [], links = [], dataAttr = '', dataValue = '' } = $props();

  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});
  const rows = $derived(Array.isArray(items) ? items : []);
  const docsLinks = $derived(
    (Array.isArray(links) ? links : []).filter((link) => link?.href && link?.label)
  );
</script>

<InspectorCard class="manager-explainer-card" {...hookAttributes}>
  <h3 class="manager-card-title manager-explainer-card-title">
    {#if icon}
      <i class={icon} aria-hidden="true"></i>
    {/if}
    <span>{title}</span>
  </h3>
  <ul class="manager-explainer-card-list">
    {#each rows as row, index (row.text || index)}
      <li class:is-glyphless={!row.icon}>
        {#if row.icon}
          <i class={row.icon} aria-hidden="true"></i>
        {/if}
        <!--
          `{' '}` is an expression, not a literal space: Svelte trims block-trailing whitespace,
          so a literal ran the lead-in into the prose (issue 881). This comment stays GLUED to the
          directives after it, or it adds a second whitespace text node between glyph and prose;
          and `prettier-ignore` must be the LAST comment before the element, because Prettier
          splits a `<span>` holding an `{#if}` and would move the mustache off the line
          `eslint-disable-next-line` anchors to (issue 923).
        --><!-- eslint-disable-next-line svelte/no-useless-mustaches --><!-- prettier-ignore -->
        <span>{#if row.lead}<strong>{row.lead}</strong>{' '}{/if}{row.text}</span>
      </li>
    {/each}
  </ul>
  <!-- `.manager-setup-links` is the wrapping card-link row contract; the docs class is a hook. -->
  {#if docsLinks.length > 0}
    <div class="manager-setup-links">
      {#each docsLinks as link (link.href)}
        <ManagerButton
          role="ghost"
          tag="a"
          class="manager-explainer-card-docs"
          href={link.href}
          target="_blank"
        >
          <i class={link.icon || DEFAULT_LINK_ICON} aria-hidden="true"></i>
          <span>{link.label}</span>
        </ManagerButton>
      {/each}
    </div>
  {/if}
</InspectorCard>

<style>
  /* Theme-root tokens ONLY, per `openspec/specs/design-system/spec.md`'s "The token namespace is
     one generation and names its purpose". The title's type is `.manager-card-title`'s; the rule
     below adds only the glyph alignment. */
  .manager-explainer-card-title {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-explainer-card-title > span {
    min-width: 0;
    overflow-wrap: break-word;
  }

  .manager-explainer-card-list {
    display: grid;
    gap: 11px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .manager-explainer-card-list > li {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    align-items: start;
    gap: var(--fab-space-2);
    color: var(--fab-text-muted);
    font-size: 0.6875rem;
    line-height: 1.5;
  }

  .manager-explainer-card-list > li.is-glyphless {
    grid-template-columns: minmax(0, 1fr);
  }

  .manager-explainer-card-list > li > i {
    margin-top: 0.2em;
    color: var(--fab-accent);
    text-align: center;
  }

  .manager-explainer-card-list > li > span {
    min-width: 0;
    overflow-wrap: break-word;
  }

  /* No rule for the docs links: their row is the global sheet's card-link-row contract. */
</style>
