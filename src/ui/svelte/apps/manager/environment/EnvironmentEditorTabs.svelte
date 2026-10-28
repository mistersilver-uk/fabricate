<!-- Svelte 5 runes mode -->
<!--
  The environment editor's tab strip. A thin caller of the promoted `EditorTabs` primitive
  (issue 1362): this file owns the TAB LIST and this site's DOM contract — the
  `data-environment-tab-button` hook, the `environment-tab-*` / `environment-panel-*` id
  stem whose one panel `EnvironmentEditView.svelte` renders, and the strip's own aria-label —
  and nothing else.
-->
<script>
  import EditorTabs from '../../../components/EditorTabs.svelte';
  import { localizeOr, localizeTabs } from '../../../util/localizeOr.js';
  import { TAB_COUNT_UNITS, nameTabCounts } from '../../../util/tabCountMark.js';

  let { activeTab = 'overview', badges = {}, onSelect = () => {} } = $props();

  const COUNT_UNITS = { tasks: TAB_COUNT_UNITS.tasks, events: TAB_COUNT_UNITS.events };

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
  tabs={localizeTabs(TABS)}
  {activeTab}
  badges={nameTabCounts(badges, COUNT_UNITS)}
  {onSelect}
  ariaLabel={localizeOr(
    'FABRICATE.Admin.Manager.EnvironmentEditor.Tabs.Label',
    'Environment editor sections'
  )}
  idStem="environment"
  tabDataAttr="data-environment-tab-button"
  containerClass="manager-environment-tabs"
  buttonClass="manager-environment-tab-button"
  badgeClass="manager-environment-tab-badge"
  activePanelOnly
/>
