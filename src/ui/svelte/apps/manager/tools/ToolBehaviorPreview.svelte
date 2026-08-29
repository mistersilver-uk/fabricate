<!-- Svelte 5 runes mode -->
<!--
  The Tool editor's player preview. A caller of the shared `ScopedEntityPreview` shell
  (issue 1362): the five regions and their order come from there, while every value, every
  class (`manager-tool-preview*`) and every `data-tool-*` hook stays here. Nothing rendered
  changed in the conversion.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ScopedEntityPreview from '../scoped/ScopedEntityPreview.svelte';
  import {
    projectToolBehaviorFacts,
    toolDisplayImage,
    toolDisplayName,
    toolSourceUuid,
  } from './toolStudio.js';

  // Per-fact hooks the Tool Studio suite reads to assert ONE named rule's rendered value.
  // They belong on the row's <strong>, so they are handed to the shared row rather than
  // written into its markup, which every other consumer would then inherit as dead
  // attributes.
  const RULE_TITLE_HOOKS = {
    breakage: 'data-tool-preview-breakage',
    'on-break': 'data-tool-preview-on-break',
    prerequisites: 'data-tool-preview-prerequisites',
    bonus: 'data-tool-preview-bonus',
  };

  // No `activeTab`: the live-update note used to render only on the Validation tab, which
  // was this prop's sole consumer. The note now stands on every tab (issue 883) — the
  // preview updates live regardless of which tab you are editing, so gating the statement
  // on one tab understated it — and the prop went with the condition.
  let { tool = null, authority = 'toolSpecific', managedItems = [] } = $props();
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
  const name = $derived(
    toolDisplayName(
      tool,
      managedItems,
      text('FABRICATE.Admin.Manager.Tools.Untitled', 'Untitled Tool')
    )
  );
  const image = $derived(toolDisplayImage(tool, managedItems));
  const sourceContext = $derived(
    toolSourceUuid(tool) || tool?.componentId
      ? text('FABRICATE.Admin.Manager.Tools.Editor.HeaderLinked', 'Linked game-world Item')
      : text('FABRICATE.Admin.Manager.Tools.Editor.HeaderUnlinked', 'Unlinked Tool')
  );
  const rules = $derived(projectToolBehaviorFacts(tool, authority, text, formattedText));
  // The per-fact title hook is attached HERE rather than inside the shared shell, so no other
  // consumer of that shell inherits four dead attributes.
  const previewRules = $derived(
    rules.map((rule) => ({ ...rule, titleAttr: RULE_TITLE_HOOKS[rule.id] || '' }))
  );
  const breakageLabel = $derived(rules.find((rule) => rule.id === 'breakage')?.title || '');
  const bonusValue = $derived(rules.find((rule) => rule.id === 'bonus')?.title || '');
  // The standing explanation of what a Tool is. Each row is a glyph, a bold lead-in and
  // its prose, rendered through the shared explainer card.
  const howToolsWorkItems = $derived([
    {
      icon: 'fas fa-link',
      lead: text(
        'FABRICATE.Admin.Manager.Tools.Editor.GuidanceMadeFrom',
        'Made from a game-world Item.'
      ),
      text: text(
        'FABRICATE.Admin.Manager.Tools.Editor.GuidanceMadeFromHint',
        'Drag any Item into the Tool Studio to turn it into a Tool. The Item supplies the name, art, and description.'
      ),
    },
    {
      icon: 'fas fa-list-check',
      lead: text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceRequired', 'Required by recipes.'),
      text: text(
        'FABRICATE.Admin.Manager.Tools.Editor.GuidanceRequiredHint',
        'Recipes refer to this Tool’s library identity when they require it for crafting.'
      ),
    },
    {
      icon: 'fas fa-recycle',
      lead: text(
        'FABRICATE.Admin.Manager.Tools.Editor.GuidanceSalvage',
        'Used when salvaging components.'
      ),
      text: text(
        'FABRICATE.Admin.Manager.Tools.Editor.GuidanceSalvageHint',
        'Component salvage can require this Tool and apply its eligible check bonus.'
      ),
    },
    {
      icon: 'fas fa-user-shield',
      lead: text(
        'FABRICATE.Admin.Manager.Tools.Editor.GuidancePrerequisites',
        'Character prerequisites.'
      ),
      text: text(
        'FABRICATE.Admin.Manager.Tools.Editor.GuidancePrerequisitesHint',
        'Shared character prerequisites decide who can use the Tool or receive its bonus.'
      ),
    },
    {
      icon: 'fas fa-plus-minus',
      lead: text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceBonus', 'Check bonus.'),
      text: text(
        'FABRICATE.Admin.Manager.Tools.Editor.GuidanceBonusHint',
        'An enabled bonus adds its expression to eligible crafting checks.'
      ),
    },
    {
      icon: 'fas fa-heart-crack',
      lead: text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceWearOut', 'Breakage.'),
      text: text(
        'FABRICATE.Admin.Manager.Tools.Editor.GuidanceWearOutHint',
        'Breakage controls decide when this Tool wears out and what happens next.'
      ),
    },
  ]);
</script>

<ScopedEntityPreview
  classPrefix="manager-tool-preview"
  hookAttribute="data-tool-behavior-preview"
  ariaLabel={text('FABRICATE.Admin.Manager.Tools.Preview', 'Live behavior preview')}
  kicker={text('FABRICATE.Admin.Manager.Tools.Editor.PreviewKicker', 'How it behaves')}
  identity={{
    name,
    image,
    context: sourceContext,
    hookAttribute: 'data-tool-preview-identity',
  }}
  statusChip={{
    tone: tool?.enabled === false ? 'neutral' : 'positive',
    icon: tool?.enabled === false ? 'fas fa-circle-pause' : 'fas fa-circle-check',
    label:
      tool?.enabled === false
        ? text('FABRICATE.Admin.Manager.StatusOff', 'Off')
        : text('FABRICATE.Admin.Manager.StatusOn', 'On'),
  }}
  chips={[
    { tone: 'neutral', icon: 'fas fa-heart-crack', label: breakageLabel },
    { tone: 'neutral', icon: 'fas fa-plus-minus', label: bonusValue },
  ]}
  liveNote={text(
    'FABRICATE.Admin.Manager.Tools.Editor.LiveUpdate',
    'This preview updates live as you change the controls on the left.'
  )}
  liveNoteHook="data-tool-preview-live-update"
  rulesKicker={text('FABRICATE.Admin.Manager.Tools.Editor.EffectiveRules', 'Effective rules')}
  rules={previewRules}
  ruleHookAttribute="data-tool-preview-rule"
  explainer={{
    icon: 'fas fa-circle-question',
    title: text(
      'FABRICATE.Admin.Manager.Tools.Editor.HowToolsWorkTitle',
      'How Tools work in Fabricate'
    ),
    items: howToolsWorkItems,
    links: [
      {
        href: 'https://mistersilver-uk.github.io/fabricate/tools',
        label: text('FABRICATE.Admin.Manager.Tools.Editor.ReadDocs', 'Read the docs'),
      },
    ],
    dataAttr: 'data-tool-how-it-works',
  }}
/>
