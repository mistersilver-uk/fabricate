<!-- Svelte 5 runes mode -->
<!--
  THE TWO THINGS A CRAFTING SYSTEM AUTHORS ABOUT A TOOL THAT ARE NOT RULES (issue 1373).

  == WHERE THIS CAME FROM ====================================================================
  It is what survived the `Overview` tab. That tab held four controls: a linked-Item drop card,
  the linked Item's description, a display-label field and an enable switch. The first two are
  IDENTITY, which is world scope's — they moved to `scoped/WorldToolEntryPage`, and the design's
  system rules editor has no Overview tab at all for exactly that reason. The other two are
  genuinely per-system, so they stay, and the design's own opening card
  (`Enabled in <System>`) is one of them.

  == WHY BOTH SIT AT THE TOP OF `Breakage` ===================================================
  Because that is where the design puts the one it draws. `Enabled in <System>` is not a
  breakage control either; it opens that tab because the tab is "this Tool, in this system",
  with breakage as its bulk. The display-label OVERRIDE is the same kind of fact and has no
  other tab it could belong to — `Requirements` is character gates and `Validation` states
  results — so it sits beside it rather than reviving a tab to hold one input.

  THE LABEL IS AN OVERRIDE AND THE COPY SAYS SO. The world Tool authors the shared name; this
  field replaces it in this crafting system only, and blank falls back. The two scopes used to
  carry contradictory help text, so neither named the other; each names the other now.

  Props are all pre-resolved by the caller.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ToggleCard from '../ToggleCard.svelte';
  import { toolDisplayName } from './toolStudio.js';

  let {
    tool = null,
    managedItems = [],
    systemName = '',
    persisted = true,
    onPatch = () => {},
    onToggleEnabled = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
  function formattedText(key, data, fallback) {
    const template = localize(key);
    if (template && template !== key) return localize(key, data);
    return Object.entries(data).reduce(
      (copy, [name, value]) => copy.replace(`{${name}}`, String(value)),
      fallback
    );
  }

  const enabledTitle = $derived(
    systemName
      ? formattedText(
          'FABRICATE.Admin.Manager.Tools.Editor.EnabledInSystem',
          { system: systemName },
          'Enabled in {system}'
        )
      : text('FABRICATE.Admin.Manager.Tools.Editor.Enabled', 'Tool enabled')
  );
</script>

<section class="manager-tool-system-scope" data-tool-system-scope>
  <div class="manager-tool-system-enabled" data-tool-overview-region="enabled" data-tool-enabled>
    <ToggleCard
      variant="is-enabled"
      icon=""
      title={enabledTitle}
      sub={text(
        'FABRICATE.Admin.Manager.Tools.Editor.EnabledInSystemHint',
        'Recipes and salvage in this system can require it.'
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
  </div>

  <div class="manager-tool-system-label" data-tool-overview-region="identity">
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
  </div>
</section>
