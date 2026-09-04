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
  `<prefix>-chips`, `<prefix>-live`, `<prefix>-rules`). Passing the stem rather than
  hard-coding one is what lets a converted site keep the rules that already target it:
  `ToolBehaviorPreview` passes `manager-tool-preview`, whose rules predate this shell, and a
  primitive that renamed them would strand every rule it did not also move.

  BOTH STEMS ARE DECLARED IN `styles/fabricate.css` — the tool site's, and the DEFAULT. The
  default shipped with no rules at all, so the shell rendered unstyled for any caller that did
  not bring its own; the six scoped editors PRs 6a-c and 7 build are exactly those callers, and
  `### GM World Scoped Entity Routes` requirement 7 closes that stylesheet to them. The rules
  are global rather than a scoped `<style>` here because the stem is a DYNAMIC class: Svelte
  cannot prove a scoped selector is used, and would emit the unused-selector warning
  `lint:svelte:warnings` fails on.

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
   - ruleTile: whether those rows draw `IconFactRow`'s bordered glyph tile. Opt-in and
     forwarded verbatim, for the reason that primitive's own docblock gives: the reference
     draws the tile on the Tool rails and a bare glyph one pane over, so it is a fact each
     caller asserts about its own surface rather than a default this shell picks for all of
     them.
   - explainer: the shared `ExplainerCard`'s props, or `null`.
   - children: a TRAILING snippet, rendered last inside the aside.

  ── WHY ONE TRAILING SNIPPET AND NOT THREE MORE REGIONS ─────────────────────────────────
  The world Tool entry and the Tool rules editor each own preview regions this shell has no
  vocabulary for (issue 1373): a player-inventory tile with its own broken-copy toggle, a
  `Preview as` actor selector with a resolved-prerequisite readout, and a `Required for`
  list of the recipes and gathering tasks that name the Tool. Every one of them resolves
  values, holds local state, or reads a corpus — precisely what the header above says this
  shell does NOT do. Growing three typed region props for two callers would make it the
  union of its callers, which is the failure the deferred `EssenceBehaviorPreview`
  conversion is already recorded against.

  It renders INSIDE the aside, not after it, because the rail is a grid item with its own
  scroll box, border and background; siblings of the aside would be siblings of that grid
  item and the rail would stop being one column. `ScopedValidationTab` already takes a
  trailing snippet for the same reason, so this is the shell family's existing answer
  rather than a new one. Absent by default, so every existing caller renders identically.
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
    ruleTile = false,
    // THE HEAD BLOCK A CALLER DRAWS ITSELF (issue 1371, maintainer parity round 4).
    //
    // `identity` is a fixed anatomy — art, name, context, chips — and the reference's world
    // Component rail is a different one: a 118px column holding a micro-label, an inventory TILE
    // with a quantity badge and a status badge, and the name under it, beside a second column
    // holding the resolved category, the effective tag chips and an art note. No arrangement of
    // `identity` produces that, and `children` cannot either, because `children` renders at the
    // very END of the rail, after the fact groups.
    //
    // A SNIPPET rather than another prop bag, because the block is markup the caller owns; the
    // shell owns only where it sits. A caller passes `tile` or `identity`, never both.
    tile = undefined,
    // TWO INDEPENDENTLY KICKERED FACT GROUPS, in place of one flat `rules` list.
    //
    // The reference draws `USED BY` and `PRODUCED BY` as two kickered lists in one rail, each
    // with its own empty sentence. `rulesKicker` + `rules` can express exactly one, so the second
    // group had nowhere to go and the whole `Produced by` half of the model was invisible.
    //
    // `[{ kicker, rows, emptyNote, hookAttribute }]`. Empty by default, so every shipped caller
    // keeps the single-list path above it untouched. A group with no rows draws its own
    // `emptyNote` rather than vanishing: an absent group and an empty one say different things,
    // and the reference writes a sentence for the empty one.
    factGroups = [],
    // A leading line under the head block, above the first fact group: the reference's
    // `Across every system that has rules for it.` Empty renders nothing.
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

  /**
   * One fact group's own hook, so a mounted assertion can name the group it means.
   *
   * @param {object} group
   * @returns {object}
   */
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
          <!-- `density="rule"` IS THE VARIANT THIS ROW IS, and it already shipped unasked-for
               (issue 1373). `IconFactRow` publishes it for exactly "the reference's
               EFFECTIVE-RULES inset on the two Tool inspector rails", and this shell has exactly
               two callers, both of which ARE those rails: the world Tool entry's and
               `tools/ToolBehaviorPreview`'s. Taking the default missed five of the six values
               `proto:2559` states - gap 10, padding 10/11, radius 10, an 11.5px/600 title and a
               9.5px `--fab-text-subtle` note - and missed the FILL by a rung, raising the inset
               where `proto:2014` recesses it below the aside that holds it.

               It is stated here rather than made a prop because it is a fact about the ROW, not
               about a caller's surface the way `tile` is: both callers draw the same effective-
               rules inset, so a prop would be one value passed twice. -->
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
    THE KICKERED FACT GROUPS. Each draws its own kicker, its own rows and — when it has none —
    its own sentence, because "no recipe requires it yet" and "this rail has no `Used by` group"
    are different claims and only the first is ever true here.
  -->
  {#each factGroups as group, index (group.kicker || index)}
    <p class="manager-kicker">{group.kicker}</p>
    {#if (group.rows ?? []).length > 0}
      <ul class={`${classPrefix}-rules`} {...groupAttributes(group)}>
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
      <p class={`${classPrefix}-fact-empty`} {...groupAttributes(group)}>{group.emptyNote}</p>
    {/if}
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
