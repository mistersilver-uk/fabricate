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
  {#if activeTab === 'validation'}
    <aside class="manager-tool-preview-live" data-tool-preview-live-update><i class="fas fa-circle-check" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.Tools.Editor.LiveUpdate', 'This preview updates live as you change the controls on the left.')}</span></aside>
  {/if}
</aside>
