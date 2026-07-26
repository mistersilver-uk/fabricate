<!-- Svelte 5 runes mode -->
<!--
  Post-import reference report (issue 492, restyled in issue 877).

  Until issue 877 this was a DialogV2 built from an HTML string, so it inherited
  Foundry's own defaults: serif headings sized like page titles, raw `<ul>` bullets and
  a full-width default footer button. It is now the same `ManagerModal` chrome the
  folder-mapping step uses, which is the other dialog in the very same import flow —
  one implementation of "manager modal dialog", not two technologies side by side.

  This component is a pure PRESENTER. Everything it renders comes pre-assembled and
  pre-localized from `buildImportReportContent` (`src/systems/importReportContent.js`);
  it holds no import knowledge and performs no lookups, which keeps report assembly
  unit-testable without a Foundry runtime and keeps the rendering testable without an
  importer.

  Each reference KIND is a bordered card carrying its own count, and each reference is
  a row of "owner" plus the raw reference value in a mono chip — the same card-row
  vocabulary as the mapping step's per-folder rows.
-->
<script>
  import EmptyState from './EmptyState.svelte';
  import ManagerModal from './ManagerModal.svelte';
  import { localize } from '../../util/foundryBridge.js';

  let {
    open = false,
    // The `buildImportReportContent` output; see that module for the shape.
    content = null,
    onClose = () => {},
  } = $props();

  function text(key, fallback) {
    if (!key) return fallback ?? '';
    const translated = localize(key);
    return translated && translated !== key ? translated : (fallback ?? key);
  }

  const groups = $derived(Array.isArray(content?.groups) ? content.groups : []);
  const hasReported = $derived(content?.hasReported === true);
  const handledCount = $derived(Number(content?.handledCount) || 0);

  // "Component: Iron Ore" when the owner is named, otherwise just its type. An
  // unnamed owner is normal (a drop row, an anonymous definition), so the colon is
  // dropped rather than left dangling.
  function ownerLabel(row) {
    const type = row?.ownerTypeLabel || '';
    const name = row?.ownerName || '';
    if (!name) return type;
    return `${type}: ${name}`;
  }
</script>

<ManagerModal
  {open}
  title={content?.title || text('FABRICATE.Admin.ImportReport.Title', 'Import report')}
  subtitle={content?.headline || ''}
  closeLabel={text('FABRICATE.Admin.ImportReport.Close', 'Close')}
  width="620px"
  rootAttributes={{ 'data-import-report': '' }}
  {onClose}
>
  {#snippet body()}
    {#if hasReported}
      <div class="manager-import-report-list">
        {#each groups as group (group.kind)}
          <section class="manager-import-report-group" data-import-report-group={group.kind}>
            <header class="manager-import-report-group-head">
              <h4 class="manager-import-report-kind">{group.kindLabel}</h4>
              <span class="manager-chip is-mono" data-import-report-count>{group.count}</span>
            </header>
            <ul class="manager-import-report-rows">
              {#each group.rows as row, index (`${group.kind}-${index}`)}
                <li class="manager-import-report-row" data-import-report-row>
                  <span class="manager-import-report-owner">{ownerLabel(row)}</span>
                  <span class="manager-chip is-mono manager-import-report-ref" data-import-report-ref>
                    {row.referenceValue}
                  </span>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
    {:else}
      <EmptyState
        compact
        icon="fas fa-circle-check"
        title={text('FABRICATE.Admin.ImportReport.EmptyStateTitle', 'Nothing needs attention')}
        hint={content?.emptyStateLabel || ''}
        dataAttr="data-import-report-empty"
      />
    {/if}

    {#if handledCount > 0}
      <p class="manager-muted manager-import-report-handled" data-import-report-handled>
        {content?.handledLine || ''}
      </p>
    {/if}
  {/snippet}

  {#snippet footer()}
    <button
      type="button"
      class="manager-button is-primary"
      data-import-report-close
      onclick={() => onClose()}
    >
      {text('FABRICATE.Admin.ImportReport.Close', 'Close')}
    </button>
  {/snippet}
</ManagerModal>

<style>
  .manager-import-report-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    overflow-y: auto;
    min-height: 0;
    flex: 1;
  }

  .manager-import-report-group {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 10px;
    background: var(--fab-surface-soft);
  }

  .manager-import-report-group-head {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .manager-import-report-kind {
    flex: 1;
    min-width: 0;
    margin: 0;
    color: var(--fab-text);
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .manager-import-report-rows {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .manager-import-report-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-import-report-owner {
    flex: 1;
    min-width: 0;
    color: var(--fab-text-secondary);
    font-size: 0.76rem;
    overflow-wrap: anywhere;
  }

  .manager-import-report-ref {
    overflow-wrap: anywhere;
    word-break: break-all;
  }

  .manager-import-report-handled {
    margin: 0;
  }
</style>
