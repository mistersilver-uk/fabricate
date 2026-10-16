<!--
  A paged, sorted history table: the chip column as `IoTable` renders its availability, the search as
  `GatheringTaskDropsCard` compacts it. No shipped caller sorts, so the sort is the table's own contract.
-->
<script>
  import Chip from '../../../../src/ui/svelte/components/Chip.svelte';
  import SearchField from '../../../../src/ui/svelte/components/SearchField.svelte';
  import { statusChipTone } from '../../../../src/ui/svelte/util/statusChipTone.js';
  import { localize } from '../fixtureActs.js';

  let { component: Specimen, props = {}, badgeColumnId, searchKey, placeholder } = $props();

  const rowKey = (row) => row.id;

  function ignore() {}
</script>

{#snippet cell(row, column)}
  {#if column.key === badgeColumnId}
    <Chip density="list" tone={statusChipTone(row.tone)} icon={row.icon}>{row[column.key]}</Chip>
  {:else}{row[column.key]}{/if}
{/snippet}

{#snippet search()}
  <SearchField density="compact" {placeholder} ariaLabel={localize(searchKey)} />
{/snippet}

<Specimen
  {...props}
  {rowKey}
  {cell}
  {search}
  onSort={ignore}
  onSelectRow={ignore}
  onPageChange={ignore}
  onPerPageChange={ignore}
/>
