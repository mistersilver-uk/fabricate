<!-- Svelte 5 runes mode -->
<!--
  The environment editor's tab strip. A thin caller of the promoted `EditorTabs` primitive
  (issue 1362): this file owns the TAB LIST and this site's DOM contract — the
  `data-environment-tab-button` hook, the `environment-tab-*` / `environment-panel-*` id
  stem whose panels `EnvironmentEditView.svelte` renders, and the strip's own aria-label —
  and nothing else. No rendered id, `aria-controls`, `data-*` attribute or class changed in
  the conversion.
-->
<script>
  import EditorTabs from '../EditorTabs.svelte';

  let { activeTab = 'overview', badges = {}, onSelect = () => {} } = $props();

  const TABS = [
    {
      id: 'overview',
      icon: 'fas fa-circle-info',
      labelKey: 'FABRICATE.Admin.Manager.EnvironmentEditor.Tabs.Overview',
      label: 'Overview',
    },
    {
      id: 'tasks',
      icon: 'fas fa-clipboard-list',
      labelKey: 'FABRICATE.Admin.Manager.EnvironmentEditor.Tabs.Tasks',
      label: 'Tasks',
    },
    {
      id: 'events',
      icon: 'fas fa-masks-theater',
      labelKey: 'FABRICATE.Admin.Manager.EnvironmentEditor.Tabs.Events',
      label: 'Events',
    },
    {
      id: 'validation',
      icon: 'fas fa-clipboard-check',
      labelKey: 'FABRICATE.Admin.Manager.EnvironmentEditor.Tabs.Validation',
      label: 'Validation',
    },
  ];
</script>

<EditorTabs
  tabs={TABS}
  {activeTab}
  {badges}
  {onSelect}
  ariaLabelKey="FABRICATE.Admin.Manager.EnvironmentEditor.Tabs.Label"
  ariaLabel="Environment editor sections"
  idStem="environment"
  hookAttribute="data-environment-tab-button"
  containerClass="manager-environment-tabs"
  buttonClass="manager-environment-tab-button"
  badgeClass="manager-environment-tab-badge"
/>
