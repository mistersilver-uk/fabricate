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

  == IT IS A THIN CALLER OF THE `EditorTabs` PRIMITIVE (issue 1038) ===========================
  This file owns the tab list, the two badges, and this site's DOM contract — the `tool-tab-*` /
  `tool-panel-*` id stem whose panels `ToolEditView.svelte` renders, the
  `manager-tool-editor-tabs` container class that three rules in `styles/fabricate.css` are
  written against, and the strip's own aria-label. Dropping `overview` is a change to the LIST,
  not to the strip's markup, so the conversion and the retirement compose exactly.

  IT RENDERS NO `data-*` TAB HOOK, alone among the six callers, so it passes
  `hookAttribute=""`. Its mounted assertions reach the buttons by `role="tab"` and by
  `#tool-tab-<id>`, and adding a hook to satisfy the primitive's default would have been new
  markup in a conversion whose whole claim is that it changes none.
-->
<script>
  import EditorTabs from '../EditorTabs.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let {
    activeTab = 'breakage',
    errorCount = 0,
    requirementCount = 0,
    onChange = () => {},
  } = $props();

  const TABS = [
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
  // `name` is its only readable name.
  const badges = $derived({
    requirements: requirementCount,
    validation:
      errorCount > 0
        ? { tone: 'danger', label: errorCount, name: issueCountText(errorCount) }
        : {
            tone: 'positive',
            label: '✓',
            class: 'is-valid',
            name: text('AllValid', 'All checks pass'),
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
