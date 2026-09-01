<!-- Svelte 5 runes mode -->
<!--
  The essence editor's tab strip (issue 1036) — `Essence rules` and `Validation` for an essence
  the world catalogue holds, and the shipped `Identity, On craft, Validation` for a CREATE draft,
  which has no shared definition to contradict. The SET is the caller's, passed as `tabs`; this
  file owns the strip, its keyboard model and its badges.

  It is the EIGHTH `{activeTab, badges, onSelect}` strip in the manager and it is authored
  in the same shape as the other seven rather than extracted into a shared `EditorTabs`
  primitive. That is a recorded decision, not an oversight: the extraction obligation is to
  convert every existing site in the same change, and seven sites is the whole argument. A
  follow-up issue owns the extraction.

  ── THE TAB IDS ARE LITERALS, TWICE ───────────────────────────────────────────────
  `id={`essence-tab-${tab.id}`}` is an interpolation, so the View Lab's source-coverage scan
  cannot credit the ids it produces. The ids are therefore ALSO present as literals in
  `ESSENCE_EDITOR_TABS` and `ESSENCE_RULES_TABS` in `essenceStudio.js` — and the scan reads the
  literals `'identity'`, `'oncraft'`, `'rules'` and `'validation'` there.

  ── THE ON-CRAFT BADGE COUNTS CONFIGURED BEHAVIOURS ───────────────────────────────
  0, 1 or 2 — a linked source and a linked property macro — following
  `ToolEditorTabs.requirementCount`. It never counted EFFECTS, so dropping the prototype's
  invented "2 effects" number does not delete it.
-->
<script>
  import Chip from '../Chip.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { ESSENCE_EDITOR_TABS } from './essenceStudio.js';

  let {
    // The SET, supplied by the caller: `ESSENCE_RULES_TABS` for an essence with a shared world
    // definition, `ESSENCE_EDITOR_TABS` for a create draft. Defaulted to the shipped three so a
    // caller that passes none renders exactly what it always did.
    tabs = ESSENCE_EDITOR_TABS,
    activeTab = 'identity',
    onCraftCount = 0,
    blockingCount = 0,
    warningCount = 0,
    onChange = () => {},
  } = $props();

  const TAB_LABEL_KEYS = {
    identity: 'FABRICATE.Admin.Manager.Essence.Tabs.Identity',
    oncraft: 'FABRICATE.Admin.Manager.Essence.Tabs.OnCraft',
    rules: 'FABRICATE.Admin.Manager.Essence.Tabs.Rules',
    validation: 'FABRICATE.Admin.Manager.Essence.Tabs.Validation',
  };

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function tabLabel(tab) {
    return text(TAB_LABEL_KEYS[tab.id], tab.fallback);
  }

  function issueCountLabel(count) {
    if (count === 1) return text('FABRICATE.Admin.Manager.Essence.ValidationIssue', '1 issue');
    return text('FABRICATE.Admin.Manager.Essence.ValidationIssues', '{count} issues').replace(
      '{count}',
      String(count)
    );
  }

  // Blocking outranks warning, and a clean tab shows a tick rather than a zero: a badge
  // reading `0` is indistinguishable at a glance from a badge reading `8`.
  const validationBadge = $derived(validationBadgeFor(blockingCount, warningCount));

  function validationBadgeFor(blocking, warnings) {
    if (blocking > 0)
      return { tone: 'danger', label: String(blocking), aria: issueCountLabel(blocking) };
    if (warnings > 0)
      return { tone: 'warning', label: String(warnings), aria: issueCountLabel(warnings) };
    // NEUTRAL, not green. The reference draws its clear tab badge in the recessive
    // `surface-soft` / `border` / `text2` treatment (`proto:4566`); a green tick claims a result
    // where the reference states an absence of findings. `WorldEssenceEntryPage` states the same
    // pair, so the two essence editors' strips cannot disagree about what "clear" looks like.
    return {
      tone: 'neutral',
      label: '✓',
      aria: text('FABRICATE.Admin.Manager.Essence.ValidationAllValid', 'All checks pass'),
    };
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
    const nextTab = tabs[nextIndex].id;
    onChange(nextTab);
    event.currentTarget
      .closest('[role="tablist"]')
      ?.querySelector(`#essence-tab-${nextTab}`)
      ?.focus();
  }
</script>

<div
  class="manager-essence-editor-tabs manager-editor-tabs"
  role="tablist"
  aria-label={text('FABRICATE.Admin.Manager.Essence.Tabs.Label', 'Essence editor sections')}
>
  {#each tabs as tab, index (tab.id)}
    <button
      type="button"
      role="tab"
      id={`essence-tab-${tab.id}`}
      data-essence-tab={tab.id}
      aria-selected={activeTab === tab.id}
      aria-controls={`essence-panel-${tab.id}`}
      tabindex={activeTab === tab.id ? 0 : -1}
      data-keyboard-focus="true"
      class="manager-editor-tab-button"
      class:is-active={activeTab === tab.id}
      class:is-danger={tab.id === 'validation' && blockingCount > 0}
      onclick={() => onChange(tab.id)}
      onkeydown={(event) => handleKeydown(event, index)}
    >
      <i class={tab.icon} aria-hidden="true"></i>
      <span>{tabLabel(tab)}</span>
      {#if tab.id === 'oncraft' && onCraftCount > 0}
        <Chip tone="neutral" class="manager-editor-tab-badge">{onCraftCount}</Chip>
      {:else if tab.id === 'validation'}
        <Chip
          tone={validationBadge.tone}
          class="manager-editor-tab-badge"
          aria-label={validationBadge.aria}>{validationBadge.label}</Chip
        >
      {/if}
    </button>
  {/each}
</div>
