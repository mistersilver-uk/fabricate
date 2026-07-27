<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Chip from '../Chip.svelte';
  import ExplainerCard from '../ExplainerCard.svelte';
  import IconFactRow from '../IconFactRow.svelte';
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

  let { tool = null, authority = 'toolSpecific', managedItems = [], activeTab = 'overview' } = $props();
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
  const name = $derived(toolDisplayName(tool, managedItems, text('FABRICATE.Admin.Manager.Tools.Untitled', 'Untitled Tool')));
  const image = $derived(toolDisplayImage(tool, managedItems));
  const sourceContext = $derived(
    toolSourceUuid(tool) || tool?.componentId
      ? text('FABRICATE.Admin.Manager.Tools.Editor.HeaderLinked', 'Linked game-world Item')
      : text('FABRICATE.Admin.Manager.Tools.Editor.HeaderUnlinked', 'Unlinked Tool')
  );
  const rules = $derived(projectToolBehaviorFacts(tool, authority, text, formattedText));
  const breakageLabel = $derived(rules.find((rule) => rule.id === 'breakage')?.title || '');
  const bonusValue = $derived(rules.find((rule) => rule.id === 'bonus')?.title || '');
  // The standing explanation of what a Tool is. Each row is a glyph, a bold lead-in and
  // its prose, rendered through the shared explainer card.
  const howToolsWorkItems = $derived([
    {
      icon: 'fas fa-link',
      lead: text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceMadeFrom', 'Made from a game-world Item.'),
      text: text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceMadeFromHint', 'Drag any Item into the Tool Studio to turn it into a Tool. The Item supplies the name, art, and description.'),
    },
    {
      icon: 'fas fa-list-check',
      lead: text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceRequired', 'Required by recipes.'),
      text: text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceRequiredHint', 'Recipes refer to this Tool’s library identity when they require it for crafting.'),
    },
    {
      icon: 'fas fa-recycle',
      lead: text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceSalvage', 'Used when salvaging components.'),
      text: text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceSalvageHint', 'Component salvage can require this Tool and apply its eligible check bonus.'),
    },
    {
      icon: 'fas fa-user-shield',
      lead: text('FABRICATE.Admin.Manager.Tools.Editor.GuidancePrerequisites', 'Character prerequisites.'),
      text: text('FABRICATE.Admin.Manager.Tools.Editor.GuidancePrerequisitesHint', 'Shared character prerequisites decide who can use the Tool or receive its bonus.'),
    },
    {
      icon: 'fas fa-plus-minus',
      lead: text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceBonus', 'Check bonus.'),
      text: text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceBonusHint', 'An enabled bonus adds its expression to eligible crafting checks.'),
    },
    {
      icon: 'fas fa-heart-crack',
      lead: text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceWearOut', 'Breakage.'),
      text: text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceWearOutHint', 'Breakage controls decide when this Tool wears out and what happens next.'),
    },
  ]);
</script>

<aside class="manager-tool-preview" data-tool-behavior-preview aria-label={text('FABRICATE.Admin.Manager.Tools.Preview', 'Live behavior preview')}>
  <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.PreviewKicker', 'How it behaves')}</p>
  <div class="manager-tool-preview-identity" data-tool-preview-identity>
    <img src={image} alt="" />
    <div>
      <h3 title={name}>{name}</h3>
      <p>{sourceContext}</p>
    </div>
    <Chip
      tone={tool?.enabled === false ? 'neutral' : 'positive'}
      icon={tool?.enabled === false ? 'fas fa-circle-pause' : 'fas fa-circle-check'}
    >
      {tool?.enabled === false ? text('FABRICATE.Admin.Manager.StatusOff', 'Off') : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
    </Chip>
    <div class="manager-tool-preview-chips">
      <Chip tone="neutral" icon="fas fa-heart-crack">{breakageLabel}</Chip>
      <Chip tone="neutral" icon="fas fa-plus-minus">{bonusValue}</Chip>
    </div>
  </div>
  <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.EffectiveRules', 'Effective rules')}</p>
  <ul class="manager-tool-preview-rules">
    {#each rules as rule (rule.id)}
      <li data-tool-preview-rule={rule.id}>
        <IconFactRow
          icon={rule.icon}
          title={rule.title}
          subtitle={rule.subtitle}
          titleAttr={RULE_TITLE_HOOKS[rule.id] || ''}
        />
      </li>
    {/each}
  </ul>
  <ExplainerCard
    icon="fas fa-circle-question"
    title={text('FABRICATE.Admin.Manager.Tools.Editor.HowToolsWorkTitle', 'How Tools work in Fabricate')}
    items={howToolsWorkItems}
    docsHref="https://mistersilver-uk.github.io/fabricate/tools"
    docsLabel={text('FABRICATE.Admin.Manager.Tools.Editor.ReadDocs', 'Read the docs')}
    dataAttr="data-tool-how-it-works"
  />
  {#if activeTab === 'validation'}
    <aside class="manager-tool-preview-live" data-tool-preview-live-update><i class="fas fa-circle-check" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.Tools.Editor.LiveUpdate', 'This preview updates live as you change the controls on the left.')}</span></aside>
  {/if}
</aside>
