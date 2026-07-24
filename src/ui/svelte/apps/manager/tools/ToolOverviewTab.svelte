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
    onOpenTab = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
  const source = $derived(toolSourceSnapshot(tool, worldItems, managedItems));
  const compactSourceId = $derived(
    String(source.uuid || '')
      .split('.')
      .filter(Boolean)
      .at(-1) || text('FABRICATE.Admin.Manager.Tools.Editor.NoSource', 'No Item linked')
  );

  function pickSource(event) {
    const item = worldItems.find((entry) => entry.uuid === event.currentTarget.value);
    if (item) onStageSource(item.uuid, item);
    event.currentTarget.value = '';
  }
</script>

<div class="manager-tool-tab-stack" data-tool-overview-tab>
  <section class="manager-tool-overview-source" data-tool-overview-region="source">
    <div class="manager-tool-editor-card-heading">
      <div><p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.Source', 'Linked game-world Item')}</p></div>
    </div>
    <div class="manager-tool-source-card" class:is-unlinked={!source.linked} data-tool-source-card data-tool-source-layout="compact" use:dragDrop={{ onDrop: onSourceDrop, activeClass: 'is-drop-active' }}>
      <img src={source.img} alt="" />
      <div class="manager-tool-source-copy"><strong>{source.name}</strong><code title={source.uuid || ''}>{compactSourceId}</code></div>
      <div class="manager-tool-source-actions">
        {#if source.linked}<button type="button" class="manager-icon-button is-danger" data-tool-source-unlink aria-label={text('FABRICATE.Admin.Manager.Tools.UnlinkItem', 'Unlink Item')} title={text('FABRICATE.Admin.Manager.Tools.UnlinkItem', 'Unlink Item')} onclick={onUnlinkSource}><i class="fas fa-link-slash" aria-hidden="true"></i></button>{/if}
        <details class="manager-tool-source-replace">
          <summary aria-label={source.linked ? text('FABRICATE.Admin.Manager.Tools.Editor.ReplaceItem', 'Replace linked Item') : text('FABRICATE.Admin.Manager.Tools.LinkItem', 'Link Item')} title={source.linked ? text('FABRICATE.Admin.Manager.Tools.Editor.ReplaceItem', 'Replace linked Item') : text('FABRICATE.Admin.Manager.Tools.LinkItem', 'Link Item')}><i class="fas fa-arrow-right-arrow-left" aria-hidden="true"></i><span class="sr-only">{source.linked ? text('FABRICATE.Admin.Manager.Tools.Editor.ReplaceItem', 'Replace linked Item') : text('FABRICATE.Admin.Manager.Tools.LinkItem', 'Link Item')}</span></summary>
          <label class="manager-tool-source-picker"><span>{text('FABRICATE.Admin.Manager.Tools.SelectItem', 'Select an Item')}</span><select value="" data-tool-source-picker onchange={pickSource}><option value="">{text('FABRICATE.Admin.Manager.Tools.SelectItem', 'Select an Item')}</option>{#each worldItems as item (item.uuid)}<option value={item.uuid}>{item.name}</option>{/each}</select></label>
        </details>
      </div>
    </div>
  </section>

  <section class="manager-tool-how-it-works" data-tool-overview-region="guidance" data-tool-how-it-works>
    <h3><i class="fas fa-circle-question" aria-hidden="true"></i>{text('FABRICATE.Admin.Manager.Tools.Editor.HowToolsWorkTitle', 'How Tools work in Fabricate')}</h3>
    <ol>
      <li><i class="fas fa-link" aria-hidden="true"></i><span><strong>{text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceMadeFrom', 'Made from a game-world Item.')}</strong> {text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceMadeFromHint', 'Drag any Item into the Tool Studio to turn it into a Tool. The Item supplies the name, art, and description above.')}</span></li>
      <li><i class="fas fa-list-check" aria-hidden="true"></i><span><strong>{text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceRequired', 'Required by recipes.')}</strong> {text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceRequiredHint', 'A recipe lists the tools a crafter must have on hand. Whether a character holds the Item — hand-held gear, a fixed station like a forge, or an environmental source like a ley-line — is resolved against their inventory and surroundings.')}</span><button type="button" data-tool-guidance-tab="requirements" onclick={() => onOpenTab('requirements')}>{text('FABRICATE.Admin.Manager.Tools.Editor.TabRequirements', 'Requirements')}</button></li>
      <li><i class="fas fa-heart-crack" aria-hidden="true"></i><span><strong>{text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceWearOut', 'Can wear out.')}</strong> {text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceWearOutHint', 'Set how this Tool breaks and what happens when it does on the Breakage tab; gate who may wield it under Requirements.')}</span><button type="button" data-tool-guidance-tab="breakage" onclick={() => onOpenTab('breakage')}>{text('FABRICATE.Admin.Manager.Tools.Editor.TabBreakage', 'Breakage')}</button></li>
    </ol>
  </section>

  <section class="manager-tool-overview-fields" data-tool-overview-region="identity">
    <label><span>{text('FABRICATE.Admin.Manager.Tools.Editor.Name', 'Name')}</span><input data-tool-name value={source.name} readonly /></label>
    <label><span>{text('FABRICATE.Admin.Manager.Tools.LabelField', 'Display label')}</span><input data-tool-label value={tool?.label || ''} placeholder={toolDisplayName(tool, managedItems)} oninput={(event) => onPatch({ label: event.currentTarget.value })} /><small>{text('FABRICATE.Admin.Manager.Tools.Editor.LabelFallback', 'Leave blank to use the linked Item name.')}</small></label>
    <label><span>{text('FABRICATE.Admin.Manager.Tools.Editor.Description', 'Description')}</span><textarea data-tool-description rows="2" readonly>{source.description || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}</textarea></label>
  </section>

  <section class="manager-tool-overview-enabled" data-tool-overview-region="enabled">
    <div><strong>{text('FABRICATE.Admin.Manager.Tools.Editor.Enabled', 'Enabled')}</strong><small>{text('FABRICATE.Admin.Manager.Tools.Editor.EnabledHint', 'Recipes can require this Tool while it is enabled.')}</small></div>
    <label class="manager-toggle-field"><input type="checkbox" data-tool-enabled checked={tool?.enabled !== false} onchange={(event) => onPatch({ enabled: event.currentTarget.checked })} /><span>{tool?.enabled !== false ? text('FABRICATE.Admin.Manager.StatusOn', 'On') : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</span></label>
  </section>
</div>
