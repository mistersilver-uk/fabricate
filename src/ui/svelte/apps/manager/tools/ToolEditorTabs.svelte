<!-- Svelte 5 runes mode -->
<!--
  The Tool Studio editor's tab strip — Overview / Breakage / Requirements / Validation.

  A thin caller of the promoted `EditorTabs` primitive (issue 1038): this file owns the tab
  list, the two badges, and this site's DOM contract — the `tool-tab-*` / `tool-panel-*` id
  stem whose panels `ToolEditView.svelte` renders, the `manager-tool-editor-tabs` container
  class that three rules in `styles/fabricate.css` are written against, and the strip's own
  aria-label.

  IT RENDERS NO `data-*` TAB HOOK, alone among the six callers, so it passes
  `hookAttribute=""`. Its mounted assertions reach the buttons by `role="tab"` and by
  `#tool-tab-<id>`, and adding a hook to satisfy the primitive's default would have been new
  markup in a conversion whose whole claim is that it changes none.
-->
<script>
  import EditorTabs from '../EditorTabs.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let {
    activeTab = 'overview',
    errorCount = 0,
    requirementCount = 0,
    onChange = () => {},
  } = $props();

  const TABS = [
    {
      id: 'overview',
      icon: 'fas fa-circle-info',
      labelKey: 'FABRICATE.Admin.Manager.Tools.Editor.TabOverview',
      label: 'Overview',
    },
    {
      id: 'breakage',
      icon: 'fas fa-heart-crack',
      labelKey: 'FABRICATE.Admin.Manager.Tools.Editor.TabBreakage',
      label: 'Breakage',
    },
    {
      id: 'requirements',
      icon: 'fas fa-user-shield',
      labelKey: 'FABRICATE.Admin.Manager.Tools.Editor.TabRequirements',
      label: 'Requirements',
    },
    {
      id: 'validation',
      icon: 'fas fa-clipboard-check',
      labelKey: 'FABRICATE.Admin.Manager.Tools.Editor.TabValidation',
      label: 'Validation',
    },
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

  // The Requirements count is suppressed at zero by the primitive's own badge rule. The
  // Validation badge is always present: a danger count, or the `is-valid` tick, whose
  // `ariaLabel` is its only readable name.
  const badges = $derived({
    requirements: requirementCount,
    validation:
      errorCount > 0
        ? { tone: 'danger', label: errorCount, ariaLabel: issueCountText(errorCount) }
        : {
            tone: 'positive',
            label: '✓',
            class: 'is-valid',
            ariaLabel: text('AllValid', 'All checks pass'),
          },
  });
</script>

<EditorTabs
  tabs={TABS}
  {activeTab}
  {badges}
  onSelect={onChange}
  ariaLabelKey="FABRICATE.Admin.Manager.Tools.Editor.Tabs"
  ariaLabel="Tool editor sections"
  idStem="tool"
  hookAttribute=""
  containerClass="manager-tool-editor-tabs manager-editor-tabs"
  danger
/>
