<!--
  The gathering task editor's tab strip (issue 1522): a thin caller of `EditorTabs` owning the tab
  list, the `data-gathering-task-tab` hook and the `gathering-task-tab-*` / `gathering-task-panel-*`
  id stem whose one panel `GatheringTaskEditView` renders. The selection and the `badges` marks
  (`data-gathering-task-tab-badge`) are the caller's.
-->
<script>
  import EditorTabs from '../../../components/EditorTabs.svelte';

  let { activeTab = 'overview', badges = {}, onSelect = () => {} } = $props();

  const TABS = [
    {
      id: 'overview',
      icon: 'fas fa-circle-info',
      labelKey: 'FABRICATE.Admin.Manager.Environment.Tasks.Tabs.Overview',
      label: 'Overview',
    },
    {
      id: 'requirements',
      icon: 'fas fa-key',
      labelKey: 'FABRICATE.Admin.Manager.Environment.Tasks.Tabs.Requirements',
      label: 'Requirements',
    },
    {
      id: 'results',
      icon: 'fas fa-box-open',
      labelKey: 'FABRICATE.Admin.Manager.Environment.Tasks.Tabs.Results',
      label: 'Results',
    },
  ];
</script>

<EditorTabs
  tabs={TABS}
  {activeTab}
  {badges}
  {onSelect}
  ariaLabelKey="FABRICATE.Admin.Manager.Environment.Tasks.Tabs.Label"
  ariaLabel="Gathering task sections"
  idStem="gathering-task"
  tabDataAttr="data-gathering-task-tab"
  badgeDataAttr="data-gathering-task-tab-badge"
  activePanelOnly
/>
