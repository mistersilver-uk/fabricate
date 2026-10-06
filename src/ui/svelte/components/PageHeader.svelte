<!-- Svelte 5 runes mode -->
<!-- ratchet-exempt(design-system): <PageHeader> ships at target, because its two callers keep the Tool screens' shipped header geometry, which disagrees with the specimen's (issue 1777 decision E4; geometry converges in issue 1523) -->
<!--
  THE page header (`<PageHeader>`, `library.html`): a breadcrumb trail, an optional kicker, then a
  title and subtitle or a caller's `identity` snippet, with an `actions` snippet trailing.
  A crumb is `{ label, onSelect? }`: with `onSelect` it is a button called with no argument, and
  without it a span; any other key lands on that element as an attribute (a hook or a `title`).
  `class` is appended to `fabricate-page-header`; the rest spread lands on the root after it.
-->
<script>
  import Kicker from './Kicker.svelte';
  import { localizeOr } from '../util/localizeOr.js';

  let {
    breadcrumbs = [],
    kicker = '',
    title = '',
    subtitle = '',
    identity = undefined,
    actions = undefined,
    class: extraClass = '',
    ...rest
  } = $props();
</script>

<header class={['fabricate-page-header', extraClass]} {...rest}>
  <div class="manager-heading">
    {#if breadcrumbs.length > 0}
      <nav
        class="manager-breadcrumbs"
        aria-label={localizeOr('FABRICATE.Admin.Manager.Breadcrumbs', 'Breadcrumbs')}
      >
        {#each breadcrumbs as { label, onSelect, ...hooks }, index (index)}
          {#if index > 0}<i class="fas fa-chevron-right" aria-hidden="true"></i>{/if}
          {#if onSelect}
            <!-- ratchet-exempt(design-system): the crumb button moved unchanged from ToolEditView and ManagerPageHeader, which carried it undeclared at base -->
            <button type="button" {...hooks} onclick={() => onSelect()}>{label}</button>
          {:else}
            <span {...hooks}>{label}</span>
          {/if}
        {/each}
      </nav>
    {/if}
    {#if kicker}
      <div class="manager-page-kicker"><Kicker data-page-kicker="">{kicker}</Kicker></div>
    {/if}
    {#if identity}
      {@render identity()}
    {:else}
      {#if title}<h1 class="manager-title">{title}</h1>{/if}
      {#if subtitle}<p class="manager-subtitle">{subtitle}</p>{/if}
    {/if}
  </div>
  {@render actions?.()}
</header>
