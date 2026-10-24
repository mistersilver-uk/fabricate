<!--
  A View Lab specimen, not a Fabricate surface (issue 2646). It mounts two `Pagination`s through
  the page-session seam `game.fabricate.api.ui` binds, as a companion does: a reagent browse bar of
  60 records at 25 a page on its second page, at the default density; and a compact reagent rail of
  40 records at 10 a page. The browse bar's `onPageChange` passes the reached page back in its own
  `update`, before it returns, and writes its index on the ground's
  `data-lab-pagination-page`; the rail's `onPageSizeChange` passes the chosen size back with the
  first page, and writes it on `data-lab-pagination-size`. Nothing else writes either. Every word
  is a companion's final text, so none is localized. `tests/view-lab/mount.js` mounts it for
  `?specimen=published-pagination` only.

  Each ground is a 600px column on `--fab-bg-2`; each target is a plain block. A case addresses a
  ground by `data-lab-pagination` and a target by `data-lab-pagination-target`, each naming its
  pager.
-->
<script>
  import { publishedComponentSeam } from '../../../src/ui/publishedComponentSeam.js';

  /** Each pager's props but its callbacks, by the key its ground and target name. */
  const PAGERS = Object.freeze({
    browse: {
      totalCount: 60,
      pageSize: 25,
      pageIndex: 1,
      pageSizeOptions: [10, 25, 50],
      ariaLabel: 'Reagent pages',
      navLabel: 'Reagent page navigation',
      previousLabel: 'Previous reagents page',
      nextLabel: 'Next reagents page',
      perPageLabel: 'Per page',
      rangeTemplate: '{first}–{last} of {total} reagents',
      pageTemplate: 'Page {page} of {total}',
    },
    compact: {
      totalCount: 40,
      pageSize: 10,
      pageIndex: 0,
      pageSizeOptions: [10, 25],
      density: 'compact',
      ariaLabel: 'Reagent rail pages',
      navLabel: 'Reagent rail page navigation',
      previousLabel: 'Previous reagent rail page',
      nextLabel: 'Next reagent rail page',
      perPageLabel: 'Per page',
      rangeTemplate: '{first}–{last} of {total} reagents',
      pageTemplate: 'Page {page} of {total}',
    },
  });

  const targets = $state({ browse: null, compact: null });
  const pages = $state({ browse: undefined, compact: undefined });
  const sizes = $state({ browse: undefined, compact: undefined });

  for (const key of Object.keys(PAGERS)) {
    $effect(() => {
      const target = targets[key];
      if (!target) return undefined;
      const { mount } = publishedComponentSeam.publicApi;
      // The pager's own copy of its window, so the effect reads no other state.
      let { pageIndex, pageSize } = PAGERS[key];
      const props = () => ({
        ...PAGERS[key],
        pageIndex,
        pageSize,
        onPageChange: (next) => {
          pageIndex = next;
          pager.update(props());
          pages[key] = next;
        },
        onPageSizeChange: (next) => {
          pageSize = next;
          pageIndex = 0;
          pager.update(props());
          sizes[key] = next;
        },
      });
      const pager = mount('Pagination', { target, props: props() });
      return () => pager.destroy();
    });
  }
</script>

<div class="published-pagination-lab">
  {#each Object.keys(PAGERS) as key (key)}
    <div
      class="published-pagination-ground"
      data-lab-pagination={key}
      data-lab-pagination-page={pages[key]}
      data-lab-pagination-size={sizes[key]}
    >
      <div bind:this={targets[key]} data-lab-pagination-target={key}></div>
    </div>
  {/each}
</div>

<style>
  .published-pagination-lab {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }

  .published-pagination-ground {
    box-sizing: border-box;
    width: 600px;
    padding: var(--fab-space-3);
    background: var(--fab-bg-2);
  }
</style>
