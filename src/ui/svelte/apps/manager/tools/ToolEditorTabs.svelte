<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { activeTab = 'overview', errorCount = 0, requirementCount = 0, onChange = () => {} } = $props();
  const tabs = [
    ['overview', 'Overview', 'fas fa-circle-info'],
    ['breakage', 'Breakage', 'fas fa-heart-crack'],
    ['requirements', 'Requirements', 'fas fa-user-shield'],
    ['validation', 'Validation', 'fas fa-clipboard-check'],
  ];

  function text(id, fallback, data = null) {
    const key = `FABRICATE.Admin.Manager.Tools.Editor.${id}`;
    const translated = localize(key);
    const value = translated && translated !== key ? translated : fallback;
    if (!data) return value;
    return Object.entries(data).reduce(
      (result, [name, replacement]) => result.replace(`{${name}}`, String(replacement)),
      value
    );
  }

  function handleKeydown(event, index) {
    const lastIndex = tabs.length - 1;
    let nextIndex = null;
    if (event.key === 'ArrowRight') nextIndex = index === lastIndex ? 0 : index + 1;
    if (event.key === 'ArrowLeft') nextIndex = index === 0 ? lastIndex : index - 1;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = lastIndex;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex][0];
    onChange(nextTab);
    event.currentTarget
      .closest('[role="tablist"]')
      ?.querySelector(`#tool-tab-${nextTab}`)
      ?.focus();
  }
</script>

<div class="manager-tool-editor-tabs" role="tablist" aria-label={text('Tabs', 'Tool editor sections')}>
  {#each tabs as tab (tab[0])}
    <button
      type="button"
      role="tab"
      id={`tool-tab-${tab[0]}`}
      aria-selected={activeTab === tab[0]}
      aria-controls={activeTab === tab[0] ? `tool-panel-${tab[0]}` : undefined}
      tabindex={activeTab === tab[0] ? 0 : -1}
      class:is-active={activeTab === tab[0]}
      class:is-danger={tab[0] === 'validation' && errorCount > 0}
      onclick={() => onChange(tab[0])}
      onkeydown={(event) => handleKeydown(event, tabs.indexOf(tab))}
    >
      <i class={tab[2]} aria-hidden="true"></i>
      {text(`Tab${tab[0][0].toUpperCase()}${tab[0].slice(1)}`, tab[1])}
      {#if tab[0] === 'requirements' && requirementCount > 0}
        <span>{requirementCount}</span>
      {:else if tab[0] === 'validation'}
        <span class:is-valid={errorCount === 0} aria-label={errorCount > 0 ? text('ErrorCount', '{count} errors', { count: errorCount }) : text('AllValid', 'All checks pass')}>{errorCount > 0 ? errorCount : '✓'}</span>
      {/if}
    </button>
  {/each}
</div>
