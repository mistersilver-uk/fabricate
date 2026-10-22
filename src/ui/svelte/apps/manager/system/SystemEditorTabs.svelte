<!-- Svelte 5 runes mode -->
<!--
  Full-width tab bar for the System Overview page. Two tabs: Settings (the system settings
  form) and Validation (the kind-grouped validation issue list). The Validation tab carries
  a danger/warning badge of open issues.

  A thin caller of the promoted `EditorTabs` primitive (issue 1362): this file owns the tab
  list and this site's DOM contract — the `data-system-tab` hook, the `system-tab-*` /
  `system-panel-*` id stem whose one panel `SystemEditView.svelte` renders, and the strip's own
  aria-label. It passes `manager-environment-tabs`, `manager-system-tabs` and the
  `manager-environment-tab-button` / `-badge` classes as the hooks its mounted suite selects on.
-->
<script>
  import EditorTabs from '../../../components/EditorTabs.svelte';
  import { localizeOr, localizeTabs } from '../../../util/localizeOr.js';

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
  tabs={localizeTabs(TABS)}
  {activeTab}
  {badges}
  {onSelect}
  ariaLabel={localizeOr(
    'FABRICATE.Admin.Manager.SystemEdit.Tabs.Label',
    'System overview sections'
  )}
  idStem="system"
  tabDataAttr="data-system-tab"
  containerClass="manager-environment-tabs manager-system-tabs"
  buttonClass="manager-environment-tab-button"
  badgeClass="manager-environment-tab-badge"
  activePanelOnly
/>
