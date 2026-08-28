<!-- Svelte 5 runes mode -->
<!--
  The player-preview shell shared by the scoped-entity editors (issue 1362, epic 1357).

  Five regions in a fixed order — kicker, identity block, live-update note, effective-rules
  list, standing explainer — because that ORDER is the shared pattern. What each region holds
  is the caller's: this component resolves no value, reads no scope and knows nothing about
  sections. `tools/ToolBehaviorPreview` is converted onto it here and keeps every one of its
  `data-tool-*` hooks and every one of its classes.

  `EssenceBehaviorPreview` is DEFERRED, and the reason is stated rather than left implicit:
  it composes `InventoryItemCard` + `StatusPill` + `buildEssencePreviewRow` into a genuinely
  different shape — a real inventory tile with a per-essence row builder, not an identity
  block with fact rows — so folding it in would mean widening this shell until it is a union
  of two layouts rather than one pattern.

  ── THE CLASS STEM IS A PROP ────────────────────────────────────────────────────────────
  `classPrefix` derives the five class names (`<prefix>`, `<prefix>-identity`,
  `<prefix>-chips`, `<prefix>-live`, `<prefix>-rules`), all of which are declared in
  `styles/fabricate.css`. Passing the stem rather than hard-coding one is what lets a
  converted site keep the rules that already target it: only this PR may edit that stylesheet,
  so a primitive that renamed them would strand every rule it did not also move.

  Props:
   - classPrefix: the site's class stem.
   - hookAttribute / hookValue: the aside's own `data-*` hook; `hookValue` may be `true`.
   - ariaLabel / kicker / rulesKicker: copy, already localized by the caller.
   - identity: `{name, image, context, hookAttribute}`.
   - statusChip: `{tone, icon, label}`, or `null` for a site with no on/off state.
   - chips: `{tone, icon, label}[]` beside the status chip.
   - liveNote / liveNoteHook: the "updates live" strip.
   - rules: `{id, icon, title, subtitle, titleAttr}[]`, rendered through the shared
     `IconFactRow`; `ruleHookAttribute` names the per-row `data-*` carrying the rule id.
   - explainer: the shared `ExplainerCard`'s props, or `null`.
-->
<script>
  import Chip from '../Chip.svelte';
  import ExplainerCard from '../ExplainerCard.svelte';
  import IconFactRow from '../IconFactRow.svelte';

  let {
    classPrefix = 'manager-scoped-preview',
    hookAttribute = '',
    hookValue = true,
    ariaLabel = '',
    kicker = '',
    identity = null,
    statusChip = null,
    chips = [],
    liveNote = '',
    liveNoteHook = '',
    rulesKicker = '',
    rules = [],
    ruleHookAttribute = '',
    explainer = null,
  } = $props();

  const asideAttributes = $derived(hookAttribute ? { [hookAttribute]: hookValue } : {});
  const identityAttributes = $derived(
    identity?.hookAttribute ? { [identity.hookAttribute]: true } : {}
  );
  const liveAttributes = $derived(liveNoteHook ? { [liveNoteHook]: true } : {});

  function ruleAttributes(rule) {
    return ruleHookAttribute ? { [ruleHookAttribute]: rule.id } : {};
  }
</script>

<aside class={classPrefix} {...asideAttributes} aria-label={ariaLabel}>
  <p class="manager-kicker">{kicker}</p>
  {#if identity}
    <div class={`${classPrefix}-identity`} {...identityAttributes}>
      <img src={identity.image} alt="" />
      <div>
        <h3 title={identity.name}>{identity.name}</h3>
        <p>{identity.context}</p>
      </div>
      {#if statusChip}
        <Chip tone={statusChip.tone} icon={statusChip.icon}>{statusChip.label}</Chip>
      {/if}
      {#if chips.length > 0}
        <div class={`${classPrefix}-chips`}>
          {#each chips as chip, index (`${chip.label}-${index}`)}
            <Chip tone={chip.tone} icon={chip.icon}>{chip.label}</Chip>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
  {#if liveNote}
    <aside class={`${classPrefix}-live`} {...liveAttributes}>
      <i class="fas fa-circle-check" aria-hidden="true"></i><span>{liveNote}</span>
    </aside>
  {/if}
  {#if rulesKicker}
    <p class="manager-kicker">{rulesKicker}</p>
  {/if}
  {#if rules.length > 0}
    <ul class={`${classPrefix}-rules`}>
      {#each rules as rule (rule.id)}
        <li {...ruleAttributes(rule)}>
          <IconFactRow
            icon={rule.icon}
            title={rule.title}
            subtitle={rule.subtitle}
            titleAttr={rule.titleAttr || ''}
          />
        </li>
      {/each}
    </ul>
  {/if}
  {#if explainer}
    <ExplainerCard
      icon={explainer.icon}
      title={explainer.title}
      items={explainer.items}
      links={explainer.links}
      dataAttr={explainer.dataAttr}
    />
  {/if}
</aside>
