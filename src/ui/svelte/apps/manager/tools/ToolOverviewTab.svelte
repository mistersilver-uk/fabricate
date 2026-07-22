<!-- Svelte 5 runes mode -->
<script>
  import { dragDrop } from '../../../actions/dragDrop.js';
  import { localize } from '../../../util/foundryBridge.js';
  import { toolDisplayName, toolSourceSnapshot } from './toolStudio.js';

  let {
    tool = null,
    worldItems = [],
    managedItems = [],
    onPatch = () => {},
    onStageSource = () => {},
    onSourceDrop = () => {},
    onUnlinkSource = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
  const source = $derived(toolSourceSnapshot(tool, worldItems, managedItems));

  function pickSource(event) {
    const item = worldItems.find((entry) => entry.uuid === event.currentTarget.value);
    if (item) onStageSource(item.uuid, item);
    event.currentTarget.value = '';
  }
</script>

<div class="manager-tool-tab-stack" data-tool-overview-tab>
  <section class="manager-tool-editor-card">
    <div class="manager-tool-editor-card-heading">
      <div><p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.Source', 'Linked Item')}</p><h3>{source.linked ? source.name : text('FABRICATE.Admin.Manager.Tools.Editor.NoSource', 'No Item linked')}</h3></div>
      {#if source.linked}<button type="button" class="manager-icon-button is-danger" data-tool-source-unlink aria-label={text('FABRICATE.Admin.Manager.Tools.UnlinkItem', 'Unlink Item')} title={text('FABRICATE.Admin.Manager.Tools.UnlinkItem', 'Unlink Item')} onclick={onUnlinkSource}><i class="fas fa-link-slash" aria-hidden="true"></i></button>{/if}
    </div>
    <div class="manager-tool-source-card" class:is-unlinked={!source.linked} data-tool-source-card use:dragDrop={{ onDrop: onSourceDrop, activeClass: 'is-drop-active' }}>
      <img src={source.img} alt="" />
      <div><strong>{source.name}</strong><code>{source.uuid || text('FABRICATE.Admin.Manager.Tools.Editor.DropItem', 'Drop an Item or choose one below')}</code><p>{source.description || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}</p></div>
    </div>
    <label class="manager-tool-source-picker"><span>{source.linked ? text('FABRICATE.Admin.Manager.Tools.Editor.ReplaceItem', 'Replace linked Item') : text('FABRICATE.Admin.Manager.Tools.LinkItem', 'Link Item')}</span><select value="" data-tool-source-picker onchange={pickSource}><option value="">{text('FABRICATE.Admin.Manager.Tools.SelectItem', 'Select an Item')}</option>{#each worldItems as item (item.uuid)}<option value={item.uuid}>{item.name}</option>{/each}</select></label>
  </section>

  <section class="manager-tool-editor-card manager-tool-overview-fields">
    <label><span>{text('FABRICATE.Admin.Manager.Tools.LabelField', 'Display label')}</span><input data-tool-label value={tool?.label || ''} placeholder={toolDisplayName(tool, managedItems)} oninput={(event) => onPatch({ label: event.currentTarget.value })} /><small>{text('FABRICATE.Admin.Manager.Tools.Editor.LabelFallback', 'Leave blank to use the linked Item name.')}</small></label>
    <label class="manager-toggle-field"><input type="checkbox" data-tool-enabled checked={tool?.enabled !== false} onchange={(event) => onPatch({ enabled: event.currentTarget.checked })} /><span>{text('FABRICATE.Admin.Manager.Tools.Editor.Enabled', 'Tool enabled')}</span></label>
  </section>

  <aside class="manager-tool-info-strip"><i class="fas fa-lightbulb" aria-hidden="true"></i><p>{text('FABRICATE.Admin.Manager.Tools.Editor.HowToolsWork', 'Tasks require Tools by library identity. The linked Item defines what actors must carry; the display label only changes authoring copy.')}</p></aside>
</div>
