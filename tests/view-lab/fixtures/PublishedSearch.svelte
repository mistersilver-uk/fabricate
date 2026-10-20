<!--
  A View Lab specimen, not a Fabricate surface (issue 2453). It mounts three `SearchField`s through
  the page-session seam `game.fabricate.api.ui` binds, as a companion does, each named by the
  visible text the companion draws above it, so a case's steps type into what the fixture
  mounts. Every word is a companion's final text, so none is localized.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-search` only.

  `empty` shows its placeholder; `filled` keeps what is typed; `transform` passes back what is
  typed trimmed and in lower case from inside its `onValueChange`. Each section records the value
  its last `onValueChange` passed back as `data-lab-value`, empty until the first call. Each
  target is `display: flex`, so the field fills it.

  The ground is one 320px column on `--fab-bg-1`, and sets the azure tag ink, so an ink the field
  fails to state shows in the frame. A case addresses the ground by `data-lab-search-ground` and
  each section by its `data-lab-search` key.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each field's key in fixture order, its heading, its placeholder, and whether it transforms. */
  const FIELDS = Object.freeze([
    ['empty', { label: 'Search recipes', placeholder: 'Name or tag' }],
    ['filled', { label: 'Search components', placeholder: 'Name or essence' }],
    ['transform', { label: 'Search tags', placeholder: 'Any tag', transforms: true }],
  ]);

  const targets = $state([]);
  const lab = $state(FIELDS.map(() => ({ value: '' })));

  function mountFields(mount) {
    const handles = [];
    /** One field's props; its `onValueChange` records the value, transformed where it transforms. */
    const props = (index, value) => {
      const [, { label, placeholder, transforms }] = FIELDS[index];
      return {
        value,
        placeholder,
        ariaLabel: label,
        onValueChange: (next) => {
          const kept = transforms ? next.trim().toLowerCase() : next;
          lab[index].value = kept;
          if (kept !== next) handles[index].update(props(index, kept));
        },
      };
    };
    for (const [index] of FIELDS.entries()) {
      handles[index] = mount('SearchField', { target: targets[index], props: props(index, '') });
    }
    return handles;
  }

  $effect(() => {
    if (FIELDS.some((_, index) => !targets[index])) return undefined;
    const handles = mountFields(publishedComponentSeam.publicApi.mount);
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-search-ground" data-lab-search-ground>
  {#each FIELDS as [key, { label }], index (key)}
    <section data-lab-search={key} data-lab-value={lab[index].value}>
      <p class="search-heading">{label}</p>
      <div class="search-target" bind:this={targets[index]}></div>
    </section>
  {/each}
</div>

<style>
  .published-search-ground {
    box-sizing: border-box;
    display: grid;
    gap: var(--fab-space-3);
    width: 320px;
    padding: var(--fab-space-3);
    color: var(--fab-tag-azure);
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
