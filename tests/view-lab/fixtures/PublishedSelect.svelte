<!--
  A View Lab specimen, not a Fabricate surface (issue 2454). It mounts two `Select`s through the
  page-session seam `game.fabricate.api.ui` binds, as a companion does, each named by the visible
  text the companion draws above it, so a case's steps open and choose from what the fixture
  mounts. Every word is a companion's final text, so none is localized.
  `tests/view-lab/mount.js` mounts it for `?specimen=published-select` only.

  `hosted` passes the ground as its `overlayHost`, so its list is drawn inside the ground; `layer`
  passes none, and the manager window's frame carries `.fabricate` and no app root, so its list is
  drawn on the standalone layer on `document.body`. Each section records the value its last
  `onChange` passed and the fixture passed back as `value`, as `data-lab-value`, empty until the
  first call. Each target is `display: flex`.

  The ground is one positioned 320px column on `--fab-bg-1` and sets the azure tag ink, so an ink
  the select fails to state shows in the frame. A case addresses the ground by
  `data-lab-select-ground` and each section by its `data-lab-select` key.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each select's key in fixture order, its heading, its options, its size and its initial value. */
  const SELECTS = Object.freeze([
    [
      'hosted',
      {
        label: 'Rows per page',
        size: 'inline',
        value: 10,
        options: [
          { value: 10, label: '10' },
          { value: 25, label: '25' },
          { value: 'all', label: 'All' },
        ],
      },
    ],
    [
      'layer',
      {
        label: 'Sort recipes by',
        size: 'form',
        value: null,
        placeholder: 'Choose an order',
        options: [
          { value: 'name', label: 'Name' },
          { value: 'tier', label: 'Tier' },
          { value: 'recent', label: 'Most recently crafted' },
        ],
      },
    ],
  ]);

  let ground = $state(null);
  const targets = $state([]);
  const lab = $state(SELECTS.map(() => ({ value: '' })));

  function mountSelects(mount) {
    const handles = [];
    /** One select's props at `value`; its `onChange` records the choice and passes it back. */
    const props = (index, value) => {
      const [, { label, size, options, placeholder }] = SELECTS[index];
      return {
        options,
        value,
        size,
        placeholder,
        ariaLabel: label,
        onChange: (next) => {
          lab[index].value = String(next);
          handles[index].update(props(index, next));
        },
      };
    };
    for (const [index, [key, { value }]] of SELECTS.entries()) {
      const overlayHost = key === 'hosted' ? ground : undefined;
      handles[index] = mount('Select', {
        target: targets[index],
        props: props(index, value),
        overlayHost,
      });
    }
    return handles;
  }

  $effect(() => {
    if (!ground || SELECTS.some((_, index) => !targets[index])) return undefined;
    const handles = mountSelects(publishedComponentSeam.publicApi.mount);
    return () => {
      for (const handle of handles) handle.destroy();
    };
  });
</script>

<div class="published-select-ground" data-lab-select-ground bind:this={ground}>
  {#each SELECTS as [key, { label }], index (key)}
    <section data-lab-select={key} data-lab-value={lab[index].value}>
      <p class="select-heading">{label}</p>
      <div class="select-target" bind:this={targets[index]}></div>
    </section>
  {/each}
</div>

<style>
  .published-select-ground {
    position: relative;
    box-sizing: border-box;
    display: grid;
    gap: var(--fab-space-3);
    width: 320px;
    min-height: 300px;
    align-content: start;
    padding: var(--fab-space-3);
    color: var(--fab-tag-azure);
    background: var(--fab-bg-1);
  }

  /* Room for the hosted list, three 30px rows in a 98px panel opened 6px below the trigger, so it ends above the next section. */
  .published-select-ground > section:first-child {
    min-height: 160px;
  }

  .select-heading {
    margin: 0 0 var(--fab-space-1);
    color: var(--fab-text);
    font-size: 12px;
    font-weight: 600;
  }

  .select-target {
    display: flex;
  }
</style>
