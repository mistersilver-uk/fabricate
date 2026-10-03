<!-- Svelte 5 runes mode -->
<!--
  The Tasks/Events tab strip of the player gathering centre column, drawn by the shared `EditorTabs`.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `activeTab` | `'tasks'` \| `'events'` | `'tasks'` | The selected tab. The caller renders its one panel as `gathering-detail-panel-<id>`. |
  | `onSelect(tabId)` | function | no-op | Selection by click or arrow key; the strip holds no state. |
-->
<script>
  import EditorTabs from '../../components/EditorTabs.svelte';

  let { activeTab = 'tasks', onSelect = () => {} } = $props();

  const TABS = [
    {
      id: 'tasks',
      icon: 'fas fa-clipboard-list',
      labelKey: 'FABRICATE.App.Gathering.Detail.Tabs.Tasks',
      label: 'Tasks',
    },
    {
      id: 'events',
      icon: 'fas fa-masks-theater',
      labelKey: 'FABRICATE.App.Gathering.Detail.Tabs.Events',
      label: 'Events',
    },
  ];
</script>

<EditorTabs
  tabs={TABS}
  {activeTab}
  {onSelect}
  ariaLabelKey="FABRICATE.App.Gathering.Detail.Tabs.Label"
  idStem="gathering-detail"
  activePanelOnly
  tabDataAttr="data-gathering-detail-tab"
/>
