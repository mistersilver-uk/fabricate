<!--
  THE TWO THINGS A CRAFTING SYSTEM AUTHORS ABOUT A TOOL THAT ARE NOT RULES: the per-system enable
  switch and the per-system display-label override. They are what survived the `Overview` tab,
  whose other two controls were IDENTITY and moved to world scope — which is why the design's
  system rules editor has no Overview tab at all. BOTH SIT AT THE TOP OF `Breakage`, because that
  is where the design puts the one it draws: `Enabled in <System>` is not a breakage control
  either; it opens that tab because the tab is "this Tool, in this system".

  THE LABEL IS AN OVERRIDE, AND IT NOW SAYS SO IN THE SCREEN'S OWN IDIOM. It said it in a HELP
  SENTENCE and nothing else, while wearing the NAME FIELD treatment — a serif input pre-filled with
  the world Tool's name as its placeholder, which is how an editor draws a field that AUTHORS a
  name. Two readings were available and both were wrong: that a crafting system names Tools, or
  that the blank field had lost the name it was showing. It is a `ToolInheritCard` now, and blank
  IS the inheriting state, so the switch is the two states rather than a fourth control.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ToggleCard from '../../../components/ToggleCard.svelte';
  import ToolInheritCard from './ToolInheritCard.svelte';
  import { toolDisplayName } from './toolStudio.js';

  let {
    tool = null,
    managedItems = [],
    systemName = '',
    persisted = true,
    // Whether the world catalogue holds a record for this Tool: a pre-migration in-system Tool has
    // no world name to override, so the card renders its field with no switch and no pill.
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

  // BLANK IS THE INHERITING STATE, with no stored flag: `Tool#label` is either an override or
  // absent, and absent means "use the world Tool's name" everywhere a display name resolves. Read
  // directly rather than through the `inherit` map, which has no key for it.
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
      <!-- AN ORDINARY FIELD, NOT the editor's serif NAME-AUTHORING treatment, which was half of
           why this card read as though a crafting system named Tools. No placeholder either: the
           world value is on the card's own head, and ghost text made a blank field look lost. -->
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
