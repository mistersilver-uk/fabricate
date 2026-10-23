<!--
  A browse list's loading and error forms, drawn in place of the list's body beneath the list's own
  header, and the list's ready body when it holds neither (issue 2548).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `loading` | boolean | `false` | Masks `error` and the body. |
  | `loadingLabel` | string | `''` | Already localized, and required while `loading`: the status line states what is loading. |
  | `skeletonRows` | 1 to 6 | `3` | Any other value draws 3. |
  | `density` | `'default'` \| `'dense'` | `'default'` | The selectable ListRow density the rows preview; any other value reads `'default'`. |
  | `error` | string | `''` | The already-localized notice title; `''` is no error. |
  | `errorDetail` | string | `''` | Plain text beneath the title, rendered escaped. |
  | `loadingProps` / `errorProps` | `{ 'data-*': value }` | `{}` | Hooks on the loading region and the notice; a key not starting `data-`, or an error key starting `data-notice-`, is dropped, and `true` writes `""`. |

  Snippets:
  - `children` — the ready body, rendered with no element around it.

  Invariants:
  - No `class` and no rest spread, because the component has no single root.
  - Loading is a region carrying only `aria-busy`, holding a `role="status"` line over `aria-hidden`
    static rows with nothing focusable; the error is a non-blocking danger `Notice` — pinned by
    `tests/components/list-state-mounted.test.js`.
  - A skeleton row stands the selectable ListRow's border-box height at its density — pinned by
    `tests/components/list-state-rendered.test.js`.
-->
<script>
  import Notice from './Notice.svelte';

  let {
    loading = false,
    loadingLabel = '',
    skeletonRows = 3,
    density = 'default',
    error = '',
    errorDetail = '',
    loadingProps = {},
    errorProps = {},
    children = null,
  } = $props();

  /** `props`' `data-*` entries not under `reserved`: `true` writes `""`, false or null none. */
  const hooksOf = (props, reserved = null) =>
    Object.fromEntries(
      Object.entries(props ?? {})
        .filter(([key]) => key.startsWith('data-') && !(reserved && key.startsWith(reserved)))
        .filter(([, value]) => value != null && value !== false)
        .map(([key, value]) => [key, value === true ? '' : value])
    );

  const rowCount = $derived(
    Number.isInteger(skeletonRows) && skeletonRows >= 1 && skeletonRows <= 6 ? skeletonRows : 3
  );
  const rows = $derived(Array.from({ length: rowCount }, (_, index) => index));
  const dense = $derived(density === 'dense');
  const loadingHooks = $derived(hooksOf(loadingProps));
  const errorHooks = $derived(hooksOf(errorProps, 'data-notice-'));
</script>

{#if loading}
  <div {...loadingHooks} class="fabricate-list-state" aria-busy="true">
    <p class="fabricate-list-state-status" role="status">{loadingLabel}</p>
    <div class="fabricate-list-state-rows" class:is-dense={dense} aria-hidden="true">
      {#each rows as row (row)}
        <div class="fabricate-list-state-row" class:is-dense={dense}>
          <span class="fabricate-list-state-mark"></span>
          <span class="fabricate-list-state-bars">
            <span class="fabricate-list-state-bar is-name"></span>
            <span class="fabricate-list-state-bar is-meta"></span>
          </span>
        </div>
      {/each}
    </div>
  </div>
{:else if error}
  <!-- ratchet-exempt(design-system): errorProps is hook-only data-* attributes forwarded to the notice -->
  <Notice tone="danger" title={error} detail={errorDetail} {...errorHooks} />
{:else}
  {@render children?.()}
{/if}

<style>
  .fabricate-list-state {
    display: grid;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .fabricate-list-state-status {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 11.5px;
  }

  .fabricate-list-state-rows {
    display: grid;
    gap: var(--fab-space-2);
  }

  .fabricate-list-state-rows.is-dense {
    gap: var(--fab-space-chip);
  }

  /* The selectable ListRow's frame: its default inset, gap, edge, ground, corner and type. */
  .fabricate-list-state-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-3) var(--fab-space-4);
    border: 1px solid var(--fab-border);
    border-radius: 11px;
    background: var(--fab-bg-1);
    font-size: 10.5px;
    line-height: normal;
  }

  .fabricate-list-state-row.is-dense {
    gap: var(--fab-space-2);
    padding: var(--fab-space-1) var(--fab-space-2);
    border-radius: 9px;
  }

  .fabricate-list-state-mark {
    flex: none;
    width: 38px;
    height: 38px;
    border-radius: 9px;
    background: var(--fab-border-strong);
  }

  .fabricate-list-state-row.is-dense .fabricate-list-state-mark {
    width: 30px;
    height: 30px;
    border-radius: 7px;
  }

  .fabricate-list-state-bars {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  /* A bar stands one line box of the text it previews: the row name's face and size, then the meta's. */
  .fabricate-list-state-bar {
    display: block;
    height: 1lh;
    border-radius: 6px;
    background: var(--fab-border-strong);
  }

  .fabricate-list-state-bar.is-name {
    width: 40%;
    font-family: var(--font-primary, sans-serif);
    font-size: 12px;
  }

  .fabricate-list-state-bar.is-meta {
    width: 60%;
  }
</style>
