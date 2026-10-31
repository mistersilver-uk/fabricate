<!--
  A View Lab specimen, not a Fabricate surface (issue 2849). It mounts three `SearchField`s through
  the page-session seam `game.fabricate.api.ui` binds, as a companion does, one at each published
  `density`, each holding a query and a trailing `countLabel`, and named by the visible text the
  companion draws above it. Every word is a companion's final text, so none is localized.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-search-forms` only.

  The ground is one 320px column on `--fab-bg-1`, and each target is `display: flex`, so the field
  fills it. A case addresses the ground by `data-lab-search-forms` and each section by its
  `data-lab-search-form` key.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each section's key, its heading, and its field's density, query and count. */
  const FORMS = Object.freeze([
    ['default', 'Search recipes', { density: 'default', value: 'tonic', countLabel: '12 found' }],
    ['toolbar', 'Search components', { density: 'toolbar', value: 'iron', countLabel: '3 chosen' }],
    ['inline', 'Search tags', { density: 'inline', value: 'ore', countLabel: '1 found' }],
  ]);

  const targets = $state([]);

  $effect(() => {
    if (FORMS.some((_, index) => !targets[index])) return undefined;
    const { mount } = publishedComponentSeam.publicApi;
    const handles = FORMS.map(([, label, props], index) =>
      mount('SearchField', { target: targets[index], props: { ariaLabel: label, ...props } })
    );
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-search-forms-ground" data-lab-search-forms>
  {#each FORMS as [key, label], index (key)}
    <section data-lab-search-form={key}>
      <p class="search-heading">{label}</p>
      <div class="search-target" bind:this={targets[index]}></div>
    </section>
  {/each}
</div>

<style>
  .published-search-forms-ground {
    box-sizing: border-box;
    display: grid;
    gap: var(--fab-space-3);
    width: 320px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-1);
  }

  .search-heading {
    margin: 0 0 var(--fab-space-1);
    color: var(--fab-text);
    font-size: 12px;
    font-weight: 600;
  }

  .search-target {
    display: flex;
  }
</style>
