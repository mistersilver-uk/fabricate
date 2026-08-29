<!-- Svelte 5 runes mode -->
<!--
  Full-width tab bar for the System Overview page. Two tabs: Settings (the system settings
  form) and Validation (the kind-grouped validation issue list). The Validation tab carries
  a danger/warning badge of open issues.

  A thin caller of the promoted `EditorTabs` primitive (issue 1362): this file owns the tab
  list and this site's DOM contract — the `data-system-tab` hook, the `system-tab-*` /
  `system-panel-*` id stem whose panels `SystemEditView.svelte` renders, and the strip's own
  aria-label. It keeps `manager-environment-tabs` alongside `manager-system-tabs` and the
  `manager-environment-tab-button` / `-badge` classes, so no shipped rule stops matching.
-->
<script>
  import EditorTabs from '../EditorTabs.svelte';

  let { activeTab = 'settings', badges = {}, onSelect = () => {} } = $props();

  const TABS = [
    {
      id: 'settings',
      icon: 'fas fa-sliders',
      labelKey: 'FABRICATE.Admin.Manager.SystemEdit.Tabs.Settings',
      label: 'Settings',
    },
    {
      id: 'validation',
      icon: 'fas fa-clipboard-check',
      labelKey: 'FABRICATE.Admin.Manager.SystemEdit.Tabs.Validation',
      label: 'Validation',
    },
  ];
</script>

<EditorTabs
  tabs={TABS}
  {activeTab}
  {badges}
  {onSelect}
  ariaLabelKey="FABRICATE.Admin.Manager.SystemEdit.Tabs.Label"
  ariaLabel="System overview sections"
  idStem="system"
  hookAttribute="data-system-tab"
  containerClass="manager-environment-tabs manager-system-tabs"
  buttonClass="manager-environment-tab-button"
  badgeClass="manager-environment-tab-badge"
/>
