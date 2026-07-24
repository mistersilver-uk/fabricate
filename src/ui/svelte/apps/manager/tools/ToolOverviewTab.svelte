<!-- Svelte 5 runes mode -->
<script>
  import { dragDrop } from '../../../actions/dragDrop.js';
  import { localize } from '../../../util/foundryBridge.js';
  import { toolDisplayName, toolSourceSnapshot } from './toolStudio.js';
  import ToggleCard from '../ToggleCard.svelte';

  let {
    tool = null,
    worldItems = [],
    managedItems = [],
    onPatch = () => {},
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
    <div class="manager-tool-source-card" class:is-unlinked={!source.linked} data-tool-source-card data-tool-source-layout="compact" use:dragDrop={{ onDrop: onSourceDrop, activeClass: 'is-drop-active' }}>
      <img src={source.img} alt="" />
      <div class="manager-tool-source-copy">
        <strong>{source.name}</strong>
        <small data-tool-source-drop-hint>
          <i class="fas fa-arrow-down-to-line" aria-hidden="true"></i>
          {text('FABRICATE.Admin.Manager.Tools.Editor.SourceDropHint', 'Drop another Item here to replace the linked source.')}
        </small>
      </div>
      <div class="manager-tool-source-actions">
        {#if source.linked}
          <button type="button" class="manager-icon-button" data-tool-source-copy-uuid aria-label={text('FABRICATE.Admin.Manager.Tools.Editor.CopySourceUuid', 'Copy source UUID')} title={text('FABRICATE.Admin.Manager.Tools.Editor.CopySourceUuid', 'Copy source UUID')} onclick={() => onCopySourceUuid(source.uuid)}><i class="fas fa-copy" aria-hidden="true"></i></button>
          <button type="button" class="manager-icon-button is-danger" data-tool-source-unlink aria-label={text('FABRICATE.Admin.Manager.Tools.UnlinkItem', 'Unlink Item')} title={text('FABRICATE.Admin.Manager.Tools.UnlinkItem', 'Unlink Item')} onclick={onUnlinkSource}><i class="fas fa-link-slash" aria-hidden="true"></i></button>
        {/if}
      </div>
    </div>
  </section>

  <section class="manager-tool-how-it-works" data-tool-overview-region="guidance" data-tool-how-it-works>
    <h3><i class="fas fa-circle-question" aria-hidden="true"></i>{text('FABRICATE.Admin.Manager.Tools.Editor.HowToolsWorkTitle', 'How Tools work in Fabricate')}</h3>
    <ol>
      <li><i class="fas fa-link" aria-hidden="true"></i><span><strong>{text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceMadeFrom', 'Made from a game-world Item.')}</strong> {text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceMadeFromHint', 'Drag any Item into the Tool Studio to turn it into a Tool. The Item supplies the name, art, and description above.')}</span></li>
      <li><i class="fas fa-list-check" aria-hidden="true"></i><span><strong>{text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceRequired', 'Required by recipes.')}</strong> {text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceRequiredHint', 'Recipes refer to this Tool’s library identity when they require it for crafting.')}</span></li>
      <li><i class="fas fa-user-shield" aria-hidden="true"></i><span><strong>{text('FABRICATE.Admin.Manager.Tools.Editor.GuidancePrerequisites', 'Character prerequisites.')}</strong> {text('FABRICATE.Admin.Manager.Tools.Editor.GuidancePrerequisitesHint', 'Shared character prerequisites decide who can use the Tool or receive its bonus.')}</span></li>
      <li><i class="fas fa-plus-minus" aria-hidden="true"></i><span><strong>{text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceBonus', 'Check bonus.')}</strong> {text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceBonusHint', 'An enabled bonus adds its expression to eligible crafting checks.')}</span></li>
      <li><i class="fas fa-heart-crack" aria-hidden="true"></i><span><strong>{text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceWearOut', 'Breakage.')}</strong> {text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceWearOutHint', 'Breakage controls decide when this Tool wears out and what happens next.')}</span></li>
    </ol>
  </section>

  <section class="manager-tool-overview-fields" data-tool-overview-region="identity">
    <label class="manager-recipe-field"><span class="manager-recipe-micro-label">{text('FABRICATE.Admin.Manager.Tools.Editor.Name', 'Name')}</span><input class="manager-recipe-name-input" data-tool-name value={source.name} readonly /></label>
    <label class="manager-recipe-field"><span class="manager-recipe-micro-label">{text('FABRICATE.Admin.Manager.Tools.LabelField', 'Display label')}</span><input class="manager-recipe-name-input" data-tool-label value={tool?.label || ''} placeholder={toolDisplayName(tool, managedItems)} oninput={(event) => onPatch({ label: event.currentTarget.value })} /><small>{text('FABRICATE.Admin.Manager.Tools.Editor.LabelFallback', 'Leave blank to use the linked Item name.')}</small></label>
    <label class="manager-recipe-field"><span class="manager-recipe-micro-label">{text('FABRICATE.Admin.Manager.Tools.Editor.Description', 'Description')}</span><textarea class="manager-recipe-flavour-input" data-tool-description rows="2" readonly>{source.description || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}</textarea></label>
  </section>

  <section class="manager-tool-overview-enabled" data-tool-overview-region="enabled" data-tool-enabled>
    <ToggleCard
      variant="is-enabled"
      icon="fas fa-circle-check"
      title={text('FABRICATE.Admin.Manager.Tools.Editor.Enabled', 'Tool enabled')}
      sub={text('FABRICATE.Admin.Manager.Tools.Editor.EnabledHint', 'Recipes can require this Tool while it is enabled.')}
      on={tool?.enabled !== false}
      toggleLabel={text('FABRICATE.Admin.Manager.Tools.Editor.ToggleEnabled', 'Toggle Tool enabled')}
      section="tool-enabled"
      field="tool-enabled"
      onToggle={(enabled) => onPatch({ enabled })}
    />
  </section>
</div>
