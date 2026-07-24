<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { toolDisplayName, toolSourceSnapshot } from './toolStudio.js';
  import ItemDropZone from '../ItemDropZone.svelte';
  import ToggleCard from '../ToggleCard.svelte';

  let {
    tool = null,
    worldItems = [],
    managedItems = [],
    persisted = true,
    onPatch = () => {},
    onToggleEnabled = () => {},
    onSourceDrop = () => {},
    onCopySourceUuid = () => {},
    onUnlinkSource = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
  const source = $derived(toolSourceSnapshot(tool, worldItems, managedItems));
</script>

<div class="manager-tool-tab-stack" data-tool-overview-tab>
  <section class="manager-tool-overview-source" data-tool-overview-region="source">
    <div class="manager-tool-editor-card-heading">
      <div><p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.Source', 'Linked game-world Item')}</p></div>
    </div>
    <ItemDropZone
      kind="tool-source"
      item={source.linked ? source : null}
      title={source.name}
      hint={source.linked
        ? text('FABRICATE.Admin.Manager.Tools.Editor.SourceDropHint', 'Drop another Item here to replace the linked source.')
        : text('FABRICATE.Admin.Manager.Tools.Editor.SourceEmptyDropHint', 'Drop an Item here to link this Tool.')}
      onDrop={onSourceDrop}
      copyLabel={text('FABRICATE.Admin.Manager.Tools.Editor.CopySourceUuid', 'Copy source UUID')}
      unlinkLabel={text('FABRICATE.Admin.Manager.Tools.UnlinkItem', 'Unlink Item')}
      onCopy={source.linked ? () => onCopySourceUuid(source.uuid) : null}
      onUnlink={source.linked ? onUnlinkSource : null}
    />
    <div class="manager-tool-source-description" data-tool-description>
      {source.description || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
    </div>
  </section>

  <section class="manager-tool-overview-fields" data-tool-overview-region="identity">
    <label class="manager-recipe-field"><span class="manager-recipe-micro-label">{text('FABRICATE.Admin.Manager.Tools.LabelField', 'Display label')}</span><input class="manager-recipe-name-input" data-tool-label value={tool?.label || ''} placeholder={toolDisplayName(tool, managedItems)} oninput={(event) => onPatch({ label: event.currentTarget.value })} /><small>{text('FABRICATE.Admin.Manager.Tools.Editor.LabelFallback', 'Leave blank to use the linked Item name.')}</small></label>
  </section>

  <section class="manager-tool-overview-enabled" data-tool-overview-region="enabled" data-tool-enabled>
    <ToggleCard
      variant="is-enabled"
      icon="fas fa-power-off"
      title={text('FABRICATE.Admin.Manager.Tools.Editor.Enabled', 'Tool enabled')}
      sub={text('FABRICATE.Admin.Manager.Tools.Editor.EnabledHint', 'Recipes can require this Tool while it is enabled.')}
      on={tool?.enabled !== false}
      disabled={!persisted}
      toggleLabel={text('FABRICATE.Admin.Manager.Tools.Editor.ToggleEnabled', 'Toggle Tool enabled')}
      toggleTitle={!persisted ? text('FABRICATE.Admin.Manager.Tools.Editor.EnabledRequiresSave', 'Save this Tool before changing its enabled state.') : ''}
      section="tool-enabled"
      field="tool-enabled"
      onToggle={onToggleEnabled}
    />
  </section>
</div>
