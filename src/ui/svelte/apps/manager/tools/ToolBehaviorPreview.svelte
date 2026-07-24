<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import {
    projectToolBehaviorFacts,
    toolDisplayImage,
    toolDisplayName,
    toolSourceUuid,
  } from './toolStudio.js';

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
</script>

<aside class="manager-tool-preview" data-tool-behavior-preview aria-label={text('FABRICATE.Admin.Manager.Tools.Preview', 'Live behavior preview')}>
  <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.PreviewKicker', 'How it behaves')}</p>
  <div class="manager-tool-preview-identity" data-tool-preview-identity>
    <img src={image} alt="" />
    <div>
      <h3 title={name}>{name}</h3>
      <p>{sourceContext}</p>
    </div>
    <span class={`manager-chip ${tool?.enabled === false ? 'is-neutral' : 'is-positive'}`}>
      <i class={tool?.enabled === false ? 'fas fa-circle-pause' : 'fas fa-circle-check'} aria-hidden="true"></i>
      {tool?.enabled === false ? text('FABRICATE.Admin.Manager.StatusOff', 'Off') : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
    </span>
    <div class="manager-tool-preview-chips">
      <span class="manager-chip is-neutral"><i class="fas fa-heart-crack" aria-hidden="true"></i>{breakageLabel}</span>
      <span class="manager-chip is-neutral"><i class="fas fa-plus-minus" aria-hidden="true"></i>{bonusValue}</span>
    </div>
  </div>
  <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.EffectiveRules', 'Effective rules')}</p>
  <ul class="manager-tool-preview-rules">
    {#each rules as rule (rule.id)}
      <li data-tool-preview-rule={rule.id}>
        <i class={rule.icon} aria-hidden="true"></i>
        <div>
          <strong
            data-tool-preview-breakage={rule.id === 'breakage' ? '' : undefined}
            data-tool-preview-on-break={rule.id === 'on-break' ? '' : undefined}
            data-tool-preview-prerequisites={rule.id === 'prerequisites' ? '' : undefined}
            data-tool-preview-bonus={rule.id === 'bonus' ? '' : undefined}
          >{rule.title}</strong>
          <small>{rule.subtitle}</small>
        </div>
      </li>
    {/each}
  </ul>
  <section class="manager-tool-how-it-works" data-tool-how-it-works>
    <h3><i class="fas fa-circle-question" aria-hidden="true"></i>{text('FABRICATE.Admin.Manager.Tools.Editor.HowToolsWorkTitle', 'How Tools work in Fabricate')}</h3>
    <ol>
      <li><i class="fas fa-link" aria-hidden="true"></i><span><strong>{text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceMadeFrom', 'Made from a game-world Item.')}</strong> {text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceMadeFromHint', 'Drag any Item into the Tool Studio to turn it into a Tool. The Item supplies the name, art, and description.')}</span></li>
      <li><i class="fas fa-list-check" aria-hidden="true"></i><span><strong>{text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceRequired', 'Required by recipes.')}</strong> {text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceRequiredHint', 'Recipes refer to this Tool’s library identity when they require it for crafting.')}</span></li>
      <li><i class="fas fa-recycle" aria-hidden="true"></i><span><strong>{text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceSalvage', 'Used when salvaging components.')}</strong> {text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceSalvageHint', 'Component salvage can require this Tool and apply its eligible check bonus.')}</span></li>
      <li><i class="fas fa-user-shield" aria-hidden="true"></i><span><strong>{text('FABRICATE.Admin.Manager.Tools.Editor.GuidancePrerequisites', 'Character prerequisites.')}</strong> {text('FABRICATE.Admin.Manager.Tools.Editor.GuidancePrerequisitesHint', 'Shared character prerequisites decide who can use the Tool or receive its bonus.')}</span></li>
      <li><i class="fas fa-plus-minus" aria-hidden="true"></i><span><strong>{text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceBonus', 'Check bonus.')}</strong> {text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceBonusHint', 'An enabled bonus adds its expression to eligible crafting checks.')}</span></li>
      <li><i class="fas fa-heart-crack" aria-hidden="true"></i><span><strong>{text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceWearOut', 'Breakage.')}</strong> {text('FABRICATE.Admin.Manager.Tools.Editor.GuidanceWearOutHint', 'Breakage controls decide when this Tool wears out and what happens next.')}</span></li>
    </ol>
    <a
      class="manager-button is-ghost manager-tool-docs-link"
      href="https://mistersilver-uk.github.io/fabricate/tools"
      target="_blank"
      rel="noreferrer"
    >
      <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Tools.Editor.ReadDocs', 'Read the docs')}</span>
    </a>
  </section>
  {#if activeTab === 'validation'}
    <aside class="manager-tool-preview-live" data-tool-preview-live-update><i class="fas fa-circle-check" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.Tools.Editor.LiveUpdate', 'This preview updates live as you change the controls on the left.')}</span></aside>
  {/if}
</aside>
