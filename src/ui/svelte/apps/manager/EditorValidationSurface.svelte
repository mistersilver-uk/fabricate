<!-- Svelte 5 runes mode -->
<script>
  import Chip from './Chip.svelte';

  let {
    title = 'Validation',
    intro = '',
    summary = {},
    counts = { passing: 0, warnings: 0, blocking: 0 },
    countLabels = { passing: 'Passing', warnings: 'Warnings', blocking: 'Blocking' },
    groups = [],
    statusLabels = { pass: 'PASS', warn: 'WARNING', block: 'BLOCKS ENABLE' },
    rowDataAttr = '',
    onSelectIssue = () => {},
  } = $props();

  const statusIcons = {
    pass: 'fas fa-circle-check',
    warn: 'fas fa-triangle-exclamation',
    block: 'fas fa-circle-exclamation',
  };
</script>

<section class="manager-recipe-tab manager-recipe-validation manager-editor-validation-surface" data-editor-validation-surface>
  <div class="manager-recipe-tab-intro">
    <h2 class="manager-recipe-tab-title">{title}</h2>
    {#if intro}<p class="manager-muted">{intro}</p>{/if}
  </div>
  <section class="manager-recipe-validation-summary-row">
    <div class={`manager-recipe-rail-summary is-${summary.status || 'pass'}`} data-editor-validation-summary={summary.status || 'pass'}>
      <span class="manager-recipe-rail-summary-medallion" aria-hidden="true"><i class={summary.icon || statusIcons[summary.status] || statusIcons.pass}></i></span>
      <span class="manager-recipe-rail-summary-copy">
        <span class="manager-recipe-rail-summary-title">{summary.title}</span>
        <span class="manager-recipe-rail-summary-sub manager-muted">{summary.sub}</span>
      </span>
    </div>
    <ul class="manager-recipe-rail-counts" data-editor-validation-counts>
      {#each ['passing', 'warnings', 'blocking'] as count (count)}
        <li class={`manager-recipe-rail-count is-${count === 'warnings' ? 'warning' : count}`}>
          <i class={count === 'passing' ? 'fas fa-circle-check' : count === 'warnings' ? 'fas fa-triangle-exclamation' : 'fas fa-circle-xmark'} aria-hidden="true"></i>
          <span class="manager-recipe-rail-count-label">{countLabels[count]}</span>
          <span class="manager-recipe-rail-count-value" data-editor-validation-count={count}>{counts[count] || 0}</span>
        </li>
      {/each}
    </ul>
  </section>
  {#each groups as group (group.id)}
    <div class="manager-recipe-val-group" data-validation-group={group.id}>
      <p class="manager-recipe-val-group-label"><i class={group.icon} aria-hidden="true"></i><span>{group.label}</span></p>
      <ul class="manager-recipe-val-rows">
        {#each group.rows as row, index (`${group.id}-${row.id || index}`)}
          <li
            class={`manager-recipe-val-row is-${row.status}`}
            class:is-invalid={row.status === 'block'}
            data-check={row.id || undefined}
            {...{ [rowDataAttr]: rowDataAttr ? row.id : undefined }}
          >
            <i class={`manager-recipe-val-status ${statusIcons[row.status] || statusIcons.pass}`} aria-hidden="true"></i>
            <div class="manager-recipe-val-copy">
              <span class="manager-recipe-val-title">{row.title}</span>
              {#if row.detail}<span class="manager-recipe-val-detail manager-muted">{row.detail}</span>{/if}
            </div>
            {#if row.target}
              <button type="button" class="manager-button is-ghost manager-recipe-val-view" onclick={() => onSelectIssue(row.target)}>View</button>
            {/if}
            <Chip class={`manager-recipe-val-pill is-${row.status}`}>{statusLabels[row.status]}</Chip>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</section>
