<!-- Svelte 5 runes mode -->
<!-- ratchet-exempt(design-system): a composition of the DataTable and Chip members, shared by the live workpiece and its closed record rather than offered as a vocabulary member -->
<!-- The live step's Iterative Attempts (issue 3011, D-11), newest first, five a page: each one's
     session, action, check, what it paid and what it changed. The page returns to the first on a
     new session and on a change of run or step; a compacted log says how many are not listed. -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Chip from '../../../components/Chip.svelte';
  import DataTable from '../../../components/DataTable.svelte';

  const K = Object.freeze({
    heading: 'FABRICATE.App.Journal.Iterative.Sessions.Heading',
    number: 'FABRICATE.App.Journal.Iterative.Sessions.Number',
    action: 'FABRICATE.App.Journal.Iterative.Sessions.Action',
    check: 'FABRICATE.App.Journal.Iterative.Sessions.CheckColumn',
    paid: 'FABRICATE.App.Journal.Iterative.Sessions.Paid',
    changed: 'FABRICATE.App.Journal.Iterative.Sessions.Changed',
    free: 'FABRICATE.App.Journal.Iterative.Sessions.Free',
    other: 'FABRICATE.App.Journal.Iterative.Sessions.OtherWindow',
    empty: 'FABRICATE.App.Journal.Iterative.Sessions.Empty',
    earlierOne: 'FABRICATE.App.Journal.Iterative.Sessions.EarlierOne',
    earlierMany: 'FABRICATE.App.Journal.Iterative.Sessions.EarlierMany',
  });
  const PAGE_SIZES = [5, 10, 15];

  /** `scope` names the run and step the rows belong to; `isOtherWindow(row)` marks a foreign one. */
  let { sessions = [], compacted = 0, scope = '', isOtherWindow = () => false } = $props();

  let perPage = $state(PAGE_SIZES[0]);
  let paged = $state({ scope: '', newest: null, page: 0 });

  const newest = $derived(sessions[0]?.attempt ?? null);
  const page = $derived(paged.scope === scope && paged.newest === newest ? paged.page : 0);
  const rows = $derived(sessions.slice(page * perPage, (page + 1) * perPage));
  const columns = $derived([
    { key: 'session', label: localize(K.number), mono: true, width: '44px' },
    { key: 'action', label: localize(K.action), rowHeader: true },
    { key: 'check', label: localize(K.check) },
    { key: 'paid', label: localize(K.paid), mono: true },
    { key: 'changed', label: localize(K.changed), mono: true },
  ]);

  function turnTo(next) {
    paged = { scope, newest, page: next };
  }
</script>

{#snippet cell(row, column)}
  {#if column.key === 'session'}{row.sessionNumber ?? localize(K.free)}
  {:else if column.key === 'action'}{isOtherWindow(row)
      ? localize(K.other, { action: row.action })
      : row.action}
  {:else if column.key === 'check'}<Chip density="row" tone={row.check?.tone ?? ''}
      >{row.check?.text ?? ''}</Chip
    >
  {:else if column.key === 'paid'}{row.paidText}
  {:else}{row.changedText}{/if}
{/snippet}

{#snippet earlier()}
  <span class="workpiece-sessions-earlier"
    >{localize(compacted === 1 ? K.earlierOne : K.earlierMany, { n: compacted })}</span
  >
{/snippet}

<DataTable
  {columns}
  {rows}
  rowKey={(row) => row.attempt}
  heading={localize(K.heading)}
  count={sessions.length}
  {cell}
  {page}
  {perPage}
  perPageOptions={PAGE_SIZES}
  pagerDensity="compact"
  onPageChange={turnTo}
  onPerPageChange={(size) => {
    perPage = size;
    turnTo(0);
  }}
  empty={{ title: localize(K.empty) }}
  footer={compacted > 0 ? earlier : undefined}
  data-iterative-sessions=""
  data-iterative-rows={sessions.length}
/>

<style>
  .workpiece-sessions-earlier {
    font-size: 10.5px;
    color: var(--fab-text-muted);
  }
</style>
