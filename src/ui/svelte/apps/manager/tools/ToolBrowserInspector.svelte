<!-- Svelte 5 runes mode -->
<script>
  import EmptyState from '../EmptyState.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import {
    projectToolBehaviorFacts,
    projectToolRow,
  } from './toolStudio.js';

  let {
    tool = null,
    managedItems = [],
    authority = 'toolSpecific',
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
  function formattedText(key, data, fallback) {
    const template = localize(key);
    if (template && template !== key) return localize(key, data);
    return Object.entries(data).reduce(
      (copy, [name, value]) => copy.replace(`{${name}}`, String(value)),
      fallback
    );
  }

  const row = $derived(tool ? projectToolRow(tool, managedItems, authority) : null);
  const facts = $derived(projectToolBehaviorFacts(tool, authority, text, formattedText));

  function validationContext() {
    if (row.validation.errorCount === 1) {
      return text('FABRICATE.Admin.Manager.Tools.ValidationIssue', '1 issue');
    }
    return text('FABRICATE.Admin.Manager.Tools.ValidationIssues', '{count} issues').replace(
      '{count}',
      row.validation.errorCount
    );
  }

</script>

{#if row}
  <section class="manager-inspector-card manager-tool-browser-inspector" data-tool-browser-inspector>
    <div class="manager-tool-inspector-hero">
      <img src={row.img} alt="" />
      <div>
        <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.InspectorKicker', 'Tool page')}</p>
        <h2 title={row.name}>{row.name}</h2>
        <span class={`manager-chip ${row.enabled ? 'is-positive' : 'is-neutral'}`}>
          <i class={row.enabled ? 'fas fa-circle-check' : 'fas fa-circle-pause'} aria-hidden="true"></i>
          {row.enabled ? text('FABRICATE.Admin.Manager.StatusOn', 'On') : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}
        </span>
        {#if !row.validation.valid}
          <span class="manager-chip is-danger" data-tool-validation-status="needs-attention">
            <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
            {text('FABRICATE.Admin.Manager.Tools.ValidationNeedsAttention', 'Needs attention')}
          </span>
        {/if}
      </div>
    </div>
    <p class="manager-muted" data-tool-inspector-description>{row.description || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}</p>
    {#if !row.validation.valid}
      <p class="manager-muted is-danger" data-tool-inspector-validation>
        <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
        {validationContext()}
      </p>
    {/if}
    <div class="manager-tool-inspector-sections">
      {#each facts as fact (fact.id)}
        <section data-tool-inspector-rule={fact.id}>
          <p class="manager-kicker manager-tool-inspector-section-kicker">{fact.heading}</p>
          <div class="manager-tool-inspector-rule-card">
            <i class={fact.icon} aria-hidden="true"></i>
            <span><strong>{fact.title}</strong><small>{fact.subtitle}</small></span>
          </div>
        </section>
      {/each}
    </div>
  </section>
{:else}
  <!-- The inspector's no-selection state is the shared primitive at the sidebar scale.
       It used to re-derive the panel by hand through
       `.manager-tool-browser-inspector.is-empty`, which cancelled the dashed panel
       (padding 0, border 0) and gave this ONE screen a 2rem glyph in a 46px tile and a
       1.2rem title — a per-screen exception to the tile/type scale the primitive exists
       to hold. `contextClass` keeps only the container concern: fill the inspector
       column. -->
  <EmptyState
    compact
    icon="fas fa-screwdriver-wrench"
    title={text('FABRICATE.Admin.Manager.Tools.SelectTitle', 'Select a Tool')}
    hint={text('FABRICATE.Admin.Manager.Tools.SelectHint', 'Choose a Tool to inspect its behavior.')}
    contextClass="manager-tool-browser-inspector-empty"
    dataAttr="data-tool-browser-inspector-empty"
  />
{/if}
