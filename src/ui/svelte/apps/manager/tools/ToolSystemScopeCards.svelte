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

  == THE LABEL IS AN OVERRIDE, AND IT NOW SAYS SO IN THE SCREEN'S OWN IDIOM (issue 1373) =====
  It said it in a HELP SENTENCE and in nothing else. The card was the only overridable fact on
  the screen with no state pill, no world-default line and no globe row, and it wore the NAME
  FIELD treatment — a serif input pre-filled with the world Tool's own name as its placeholder,
  which is precisely how an editor draws a field that AUTHORS a name. Two readings of that
  screen were therefore available and both were wrong: that a crafting system names Tools (the
  page subtitle and `ToolEditorTabs` both say it does not), or that the blank field had lost
  the name it was showing.

  It is a `ToolInheritCard` now, like every other overridable fact here. Blank IS the inheriting
  state, so the switch is the two states rather than a fourth control: inheriting shows the
  world name on the globe row and no input at all; overriding seeds this system's own copy of
  that name into an ORDINARY text field and lets the GM edit it. The card is still the LAST
  thing on the tab's opening band, because a name override is the least of what this screen
  authors, not the first.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ToggleCard from '../ToggleCard.svelte';
  import ToolInheritCard from './ToolInheritCard.svelte';
  import { toolDisplayName } from './toolStudio.js';

  let {
    tool = null,
    managedItems = [],
    systemName = '',
    persisted = true,
    // Whether the world catalogue holds a record for this Tool. A pre-migration in-system Tool
    // has no world name to override, so the card renders its field with no switch and no pill,
    // exactly as every other card on this tab does in that state.
    member = false,
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

  // BLANK IS THE INHERITING STATE. There is no stored flag: `Tool#label` is either an override
  // or it is absent, and absent means "use the world Tool's name" everywhere that resolves a
  // display name (`resolveToolDisplayName`). The card reads that directly rather than through
  // the membership record's `inherit` map, which has no key for it — see `ToolInheritCard`.
  const worldName = $derived(toolDisplayName(tool, managedItems));
  const labelInherited = $derived(!String(tool?.label ?? '').trim());

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
    <ToolInheritCard
      section="label"
      title={text('FABRICATE.Admin.Manager.Tools.LabelField', 'Display label')}
      subtitle={text(
        'FABRICATE.Admin.Manager.Tools.Editor.LabelFallback',
        'The name this crafting system shows for the Tool.'
      )}
      inheritable={member}
      localInherit={labelInherited}
      lowercaseFact={false}
      fact={{ title: worldName, value: worldName }}
      toggleLabel={text(
        'FABRICATE.Admin.Manager.Tools.Editor.ToggleLabelOverride',
        'Give this crafting system its own display label'
      )}
      onToggle={(_section, nextInherit) => onPatch({ label: nextInherit ? '' : worldName })}
    >
      <!-- AN ORDINARY FIELD, NOT `manager-recipe-name-input`. That class is the editor's
           NAME-AUTHORING treatment — serif, oversized — and wearing it here was half of why
           this card read as though a crafting system named Tools. There is no placeholder
           either: the world value is stated on the card's own head, and repeating it as ghost
           text inside the override is what made a blank field look like a lost name. -->
      <label class="manager-tool-label-field"
        ><span class="manager-recipe-micro-label"
          >{text(
            'FABRICATE.Admin.Manager.Tools.Editor.LabelInThisSystem',
            'Name in this system'
          )}</span
        ><input
          type="text"
          data-tool-label
          value={tool?.label || ''}
          oninput={(event) => onPatch({ label: event.currentTarget.value })}
        /></label
      >
    </ToolInheritCard>
  </div>
</section>
