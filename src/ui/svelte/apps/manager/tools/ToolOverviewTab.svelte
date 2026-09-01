<!-- Svelte 5 runes mode -->
<!--
  The SYSTEM Tool editor's Overview tab.

  == THE LINKED-ITEM CARD IS GONE, AND ITS ABSENCE IS THE POINT (issue 1373) ================
  This tab used to open with a `LINKED ITEM` drop zone carrying a copy-uuid action, an unlink
  action and the linked Item's description — the full identity card. That let a CRAFTING SYSTEM
  re-point which game-world Item a Tool IS, which the model forbids: a Tool is one world record
  every system adopts, its identity is world-scoped, and `## Scoped Entity Definitions` prohibits
  one field authored at two places. The design's own system rules editor has no Overview tab at
  all for the same reason, and states `identity comes from the world Tool` in its header instead.

  The capability was not deleted. It MOVED, whole, to `scoped/WorldToolEntryPage`, which is the
  scope that owns identity and which previously could not link an Item at all.

  What is left here is what a system genuinely authors about a Tool: the per-system display-label
  OVERRIDE, and whether the Tool is enabled in this system.

  == THE LABEL IS AN OVERRIDE, AND THE COPY NOW SAYS SO ====================================
  The maintainer's ruling is that BOTH fields ship: the world authors the shared name and a system
  may override it locally. The two scopes used to carry contradictory help text — the world said
  it was the name every system shows, this said blank falls back to the linked Item — so neither
  named the other. Each names the other now.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { toolDisplayName } from './toolStudio.js';
  import ToggleCard from '../ToggleCard.svelte';

  let {
    tool = null,
    managedItems = [],
    persisted = true,
    onPatch = () => {},
    onToggleEnabled = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
</script>

<div class="manager-tool-tab-stack" data-tool-overview-tab>
  <section class="manager-tool-overview-fields" data-tool-overview-region="identity">
    <label class="manager-recipe-field"
      ><span class="manager-recipe-micro-label"
        >{text('FABRICATE.Admin.Manager.Tools.LabelField', 'Display label')}</span
      ><input
        class="manager-recipe-name-input"
        data-tool-label
        value={tool?.label || ''}
        placeholder={toolDisplayName(tool, managedItems)}
        oninput={(event) => onPatch({ label: event.currentTarget.value })}
      /><small
        >{text(
          'FABRICATE.Admin.Manager.Tools.Editor.LabelFallback',
          'Overrides the world Tool name in this crafting system only. Leave blank to use the world Tool name.'
        )}</small
      ></label
    >
  </section>

  <section
    class="manager-tool-overview-enabled"
    data-tool-overview-region="enabled"
    data-tool-enabled
  >
    <ToggleCard
      variant="is-enabled"
      icon="fas fa-power-off"
      title={text('FABRICATE.Admin.Manager.Tools.Editor.Enabled', 'Tool enabled')}
      sub={text(
        'FABRICATE.Admin.Manager.Tools.Editor.EnabledHint',
        'Recipes can require this Tool while it is enabled.'
      )}
      on={tool?.enabled !== false}
      disabled={!persisted}
      toggleLabel={text(
        'FABRICATE.Admin.Manager.Tools.Editor.ToggleEnabled',
        'Toggle Tool enabled'
      )}
      toggleTitle={!persisted
        ? text(
            'FABRICATE.Admin.Manager.Tools.Editor.EnabledRequiresSave',
            'Save this Tool before changing its enabled state.'
          )
        : ''}
      section="tool-enabled"
      field="tool-enabled"
      onToggle={onToggleEnabled}
    />
  </section>
</div>
