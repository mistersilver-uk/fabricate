<!-- Svelte 5 runes mode -->
<!--
  The SYSTEM Tool rules editor's tab strip: `Breakage · Requirements · Validation`.

  == THERE IS NO `Overview` TAB, AND ITS ABSENCE IS THE CONTRACT (issue 1373) ================
  The design ships TWO Tool editors. The WORLD one — `scoped/WorldToolEntryPage` — opens on an
  Overview tab, because identity is what world scope authors: the linked Item, the description,
  the shared display label, the world enable switch. THIS editor is the SYSTEM one, and a
  crafting system authors no identity at all; its header says so in as many words
  (`identity comes from the world Tool`). An Overview tab here is a tab with nothing at system
  scope to put on it, and everything that was on it was either world-scoped (the linked-Item
  card, the description) or belongs beside the rules it qualifies (the per-system display-label
  override and the per-system enable switch, both now on Breakage).

  `breakage` IS THEREFORE THE DEFAULT and the first tab. Every caller that used to open this
  editor on `overview` opens it here instead; there is no fallback that quietly maps the retired
  name onto a tab, because a stale caller must fail loudly rather than land on a tab the design
  does not have.
-->
<script>
  import Chip from '../Chip.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let {
    activeTab = 'breakage',
    errorCount = 0,
    requirementCount = 0,
    onChange = () => {},
  } = $props();
  const tabs = [
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

  function issueCountText(count) {
    const key = `FABRICATE.Admin.Manager.Tools.${count === 1 ? 'ValidationIssue' : 'ValidationIssues'}`;
    const translated = localize(key);
    let fallback = '{count} issues';
    if (count === 1) fallback = '1 issue';
    let value = fallback;
    if (translated && translated !== key) value = translated;
    return value.replace('{count}', String(count));
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
    event.currentTarget.closest('[role="tablist"]')?.querySelector(`#tool-tab-${nextTab}`)?.focus();
  }
</script>

<div
  class="manager-tool-editor-tabs manager-editor-tabs"
  role="tablist"
  aria-label={text('Tabs', 'Tool editor sections')}
>
  {#each tabs as tab (tab[0])}
    <button
      type="button"
      role="tab"
      id={`tool-tab-${tab[0]}`}
      aria-selected={activeTab === tab[0]}
      aria-controls={`tool-panel-${tab[0]}`}
      tabindex={activeTab === tab[0] ? 0 : -1}
      data-keyboard-focus="true"
      class="manager-editor-tab-button"
      class:is-active={activeTab === tab[0]}
      class:is-danger={tab[0] === 'validation' && errorCount > 0}
      onclick={() => onChange(tab[0])}
      onkeydown={(event) => handleKeydown(event, tabs.indexOf(tab))}
    >
      <i class={tab[2]} aria-hidden="true"></i>
      <span>{text(`Tab${tab[0][0].toUpperCase()}${tab[0].slice(1)}`, tab[1])}</span>
      {#if tab[0] === 'requirements' && requirementCount > 0}
        <Chip tone="neutral" class="manager-editor-tab-badge">{requirementCount}</Chip>
      {:else if tab[0] === 'validation'}
        <Chip
          tone={errorCount > 0 ? 'danger' : 'positive'}
          class={`manager-editor-tab-badge ${errorCount > 0 ? '' : 'is-valid'}`}
          aria-label={errorCount > 0
            ? issueCountText(errorCount)
            : text('AllValid', 'All checks pass')}>{errorCount > 0 ? errorCount : '✓'}</Chip
        >
      {/if}
    </button>
  {/each}
</div>
