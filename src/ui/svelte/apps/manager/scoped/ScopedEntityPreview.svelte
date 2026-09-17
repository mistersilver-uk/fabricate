<!-- Svelte 5 runes mode -->
<!--
  The player-preview shell shared by the scoped-entity editors (issue 1362, epic 1357): five
  regions in a fixed ORDER — kicker, identity block, live note, effective-rules list, explainer.
  What each holds is the caller's; this component resolves no value. `EssenceBehaviorPreview` is
  DEFERRED, because folding its different shape in would make this a union of two layouts.
  THE CLASS STEM IS A PROP, so a converted site keeps its rules; both stems live in
  `styles/fabricate.css` rather than a scoped block, since a DYNAMIC class cannot be proven used
  and Svelte would emit the warning `lint:svelte:warnings` fails on. `children` is a TRAILING
  snippet rendered INSIDE the aside, because a sibling of it would stop the rail being one column.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
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
    ruleTile = false,
    // THE HEAD BLOCK A CALLER DRAWS ITSELF. `identity` is a fixed anatomy and the reference's
    // world Component rail is a different one; `children` cannot serve either, because it
    // renders at the very END of the rail. A SNIPPET rather than another prop bag, because the
    // block is markup the caller owns. A caller passes `tile` or `identity`, never both.
    tile = undefined,
    // TWO INDEPENDENTLY KICKERED FACT GROUPS in place of one flat `rules` list, which could
    // express only the reference's first. `[{ kicker, rows, emptyNote, hookAttribute }]`; a group
    // with no rows draws its `emptyNote`, and `hookAttribute` NAMES THE GROUP, not its rows.
    factGroups = [],
    // A leading line under the head block, above the first fact group. Empty renders nothing.
    scopeNote = '',
    scopeNoteHook = '',
    explainer = null,
    children,
  } = $props();

  const asideAttributes = $derived(hookAttribute ? { [hookAttribute]: hookValue } : {});
  const identityAttributes = $derived(
    identity?.hookAttribute ? { [identity.hookAttribute]: true } : {}
  );
  const liveAttributes = $derived(liveNoteHook ? { [liveNoteHook]: true } : {});
  const scopeNoteAttributes = $derived(scopeNoteHook ? { [scopeNoteHook]: true } : {});

  /** One fact group's own hook, so a mounted assertion can name the group it means. */
  function groupAttributes(group) {
    return group?.hookAttribute ? { [group.hookAttribute]: true } : {};
  }

  function ruleAttributes(rule) {
    return ruleHookAttribute ? { [ruleHookAttribute]: rule.id } : {};
  }
</script>

<aside class={classPrefix} {...asideAttributes} aria-label={ariaLabel}>
  <p class="manager-kicker">{kicker}</p>
  {@render tile?.()}
  {#if scopeNote}
    <p class={`${classPrefix}-scope-note`} {...scopeNoteAttributes}>{scopeNote}</p>
  {/if}
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
          <!-- `density="rule"` IS THE VARIANT THIS ROW IS: `IconFactRow` publishes it for the
               reference's EFFECTIVE-RULES inset, and both callers of this shell ARE those rails.
               Stated here rather than made a prop, since it is a fact about the ROW. -->
          <IconFactRow
            icon={rule.icon}
            title={rule.title}
            subtitle={rule.subtitle}
            titleAttr={rule.titleAttr || ''}
            tile={ruleTile}
            density="rule"
          />
        </li>
      {/each}
    </ul>
  {/if}
  <!--
    THE KICKERED FACT GROUPS. The GROUP'S hook is on this wrapper, so `[hook]` means the group
    and `[hook] .manager-kicker` reaches its label. `display: contents` is why the wrapper costs
    nothing — the rail is a column flexbox, and a box would make each group one flex item — and
    it is INLINE because the class stem is a prop and any `<style>` here would restamp every
    element. One consequence: the rows are a GRANDCHILD of the hook, so `[hook] li`, not `>`.
  -->
  {#each factGroups as group, index (group.kicker || index)}
    <div style="display: contents" {...groupAttributes(group)}>
      <p class="manager-kicker">{group.kicker}</p>
      {#if (group.rows ?? []).length > 0}
        <ul class={`${classPrefix}-rules`}>
          {#each group.rows as row (row.id)}
            <li {...ruleHookAttribute ? { [ruleHookAttribute]: row.id } : {}}>
              <IconFactRow
                icon={row.icon}
                title={row.title}
                subtitle={row.subtitle}
                titleAttr={row.titleAttr || ''}
                badge={row.badge || ''}
                badgeTone={row.badgeTone || 'neutral'}
                tile={ruleTile}
                density="rule"
              />
            </li>
          {/each}
        </ul>
      {:else}
        <p class={`${classPrefix}-fact-empty`}>{group.emptyNote}</p>
      {/if}
    </div>
  {/each}
  {#if explainer}
    <ExplainerCard
      icon={explainer.icon}
      title={explainer.title}
      items={explainer.items}
      links={explainer.links}
      dataAttr={explainer.dataAttr}
    />
  {/if}
  {@render children?.()}
</aside>
