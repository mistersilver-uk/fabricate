<!-- Svelte 5 runes mode -->
<!--
  RequirementRail is the player Crafting tab's single requirement surface (issue
  917): the set's fixed, choice and essence requirements as ONE wrapping row of
  slot tiles, with at most one chooser open at a time and a "Pick for me" wand in
  its own header.

  The wand lives HERE rather than in the app footer because the rail renders inside
  step and routed bodies while Craft sits in a fixed footer outside the scrolling
  body — a footer control could not be scoped to the set the rail is showing.

  Auto-advance announces through this component's OWN live region, never the
  progressive stage list's reorder region: a progressive recipe can render both
  surfaces at once and a shared region would have them overwrite each other.

  The rail renders read-only whenever the displayed step is not the step the engine
  would execute, or while that step's time gate is armed — what is shown then does
  not drive the craft the button fires.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { normalizeEssenceIcon } from '../../../util/essenceIcons.js';
  import { SLOT_KIND, SLOT_STATE } from '../../../util/requirementSlots.js';
  import RequirementTile from './RequirementTile.svelte';
  import Kicker from '../../../components/Kicker.svelte';

  let {
    slots = [],
    openSlotId = null,
    readOnly = false,
    // Live-region text for auto-advance and "Pick for me".
    announcement = '',
    // DOM id of the panel the open slot controls, for `aria-controls`.
    panelId = null,
    onOpenSlot = null,
    onPickForMe = null,
  } = $props();

  const items = $derived(Array.isArray(slots) ? slots : []);
  const canPickForMe = $derived(
    !readOnly && items.some((slot) => slot.interactive && slot.state !== SLOT_STATE.MET)
  );

  const STATE_LABEL_KEYS = {
    [SLOT_STATE.MET]: 'FABRICATE.App.Crafting.Slots.TileMet',
    [SLOT_STATE.PARTIAL]: 'FABRICATE.App.Crafting.Slots.TilePartial',
    [SLOT_STATE.SHORT]: 'FABRICATE.App.Crafting.Slots.TileShort',
  };

  // A currency requirement has no have/need ratio to announce (issue 1493). The shared
  // TileMet/TileShort keys interpolate BOTH — so leaving currency on them announced
  // "100 gp needs 1 and you have 0", which is the very defect the pip was removed for,
  // surviving in the one place a screen-reader user actually receives it (the pip is
  // aria-hidden, and a fixed slot's `role="img"` exposes no inner text at all). Two whole
  // literal keys mirroring STATE_LABEL_KEYS above, because a currency slot's state is
  // binary by construction — `satisfied === true ? MET : SHORT`.
  const CURRENCY_LABEL_KEYS = {
    [SLOT_STATE.MET]: 'FABRICATE.App.Crafting.Slots.TileCurrencyMet',
    [SLOT_STATE.SHORT]: 'FABRICATE.App.Crafting.Slots.TileCurrencyShort',
  };

  function currencyTileLabel(slot) {
    // A cost the world's configuration cannot resolve is NOT a shortfall, and announcing
    // "you cannot afford this" to a player carrying ten times the price is the original
    // defect in a new voice. Keyed like the other two rather than composed: both halves
    // arrive non-localized (the caption from `formatCurrencyRequirement`, the reason from
    // the affordance layer), but the SENTENCE that joins them is copy, and a composed one
    // is the single accessible name on this path that a translator cannot reach.
    //
    // No English fallback behind any of the three (issue 1493). All of them ship in
    // `lang/en.json` in this same change, and Foundry already merges `en` under every
    // other language, so a fallback here could only ever mirror the shipped copy — a
    // second wording of the same sentence that nothing forces to agree with the first.
    if (slot.issue) {
      return localize('FABRICATE.App.Crafting.Slots.TileCurrencyUnavailable', {
        name: slot.name,
        issue: slot.issue,
      });
    }
    const key = CURRENCY_LABEL_KEYS[slot.state] ?? CURRENCY_LABEL_KEYS[SLOT_STATE.SHORT];
    return localize(key, { name: slot.name });
  }

  function tileLabel(slot) {
    if (slot.isCurrency) return currencyTileLabel(slot);
    const key = STATE_LABEL_KEYS[slot.state] ?? STATE_LABEL_KEYS[SLOT_STATE.SHORT];
    return localize(key, { name: slot.name, have: slot.have, need: slot.need });
  }

  // The world's currency configuration reason, rendered ONCE for the whole rail.
  //
  // It is a property of the WORLD's currency configuration, not of any one requirement,
  // so per-tile rendering would assert it as a property of each and repeat it verbatim
  // for a set with two currency options. It also cannot live in the tile: the column is
  // 80px with no wrapping siblings, so a sentence there wraps to roughly ten lines and
  // doubles the tile height — and a fixed currency tile renders the `role="img"` branch,
  // inside which text is not exposed at all.
  //
  // Not localized, deliberately: it is composed in English by the affordance layer, as
  // are every other currency sentence on this path and the cost caption beside it.
  const currencyIssue = $derived(items.find((slot) => slot.isCurrency && slot.issue)?.issue ?? '');

  // Plurals are TWO whole literal keys chosen by a ternary. A concatenated suffix
  // credits only the prefix under the lang-key orphan guard and strands the leaf.
  function optionsLabel(count) {
    return count === 1
      ? localize('FABRICATE.App.Crafting.Slots.OptionsOne', { count })
      : localize('FABRICATE.App.Crafting.Slots.OptionsMany', { count });
  }

  function disclosureText(slot) {
    if (slot.kind === SLOT_KIND.ESSENCE) {
      return slot.have > 0
        ? localize('FABRICATE.App.Crafting.Slots.EditPool')
        : localize('FABRICATE.App.Crafting.Slots.AddItems');
    }
    if (slot.choiceCount > 1) return optionsLabel(slot.choiceCount);
    return localize('FABRICATE.App.Crafting.Slots.Change');
  }

  function tileDomId(slot) {
    return `fabricate-slot-${slot.key}`;
  }

  function isOpen(slot) {
    return slot.interactive && slot.slotId === openSlotId;
  }

  // Auto-advance moves which chooser is OPEN without moving focus, so the change has
  // to be spoken rather than shown. Naming the open slot here means the region's text
  // changes exactly when the open chooser does — whether the rail advanced by itself
  // or the player clicked — and an explicit `announcement` ("Pick for me") wins.
  const openSlot = $derived(items.find(isOpen) ?? null);
  const liveText = $derived.by(() => {
    if (announcement) return announcement;
    if (readOnly || !openSlot) return '';
    return localize('FABRICATE.App.Crafting.Slots.NowShowing', { name: openSlot.name });
  });
</script>

{#if items.length > 0}
  <section class="requirement-rail" data-recipe-section="requirement-rail">
    <div class="requirement-rail-header">
      <Kicker as="p">
        {localize('FABRICATE.App.Crafting.Slots.Title')}
      </Kicker>
      {#if canPickForMe}
        <!-- NO aria-label. The visible label is "Pick for me" and the hint is a whole
             sentence, so labelling the button with the hint would leave an accessible
             name that does not contain its visible text: speech activation by the
             visible label then fails (WCAG 2.5.3 Label in Name). The `<span>` names the
             button; `title` carries the hint for everyone. -->
        <button
          type="button"
          class="requirement-rail-wand"
          data-requirement-pick-for-me
          title={localize('FABRICATE.App.Crafting.Slots.PickForMeHint')}
          onclick={() => onPickForMe?.()}
        >
          <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
          <span>{localize('FABRICATE.App.Crafting.Slots.PickForMe')}</span>
        </button>
      {/if}
    </div>

    {#if readOnly}
      <p class="requirement-rail-hint" data-requirement-rail-readonly>
        {localize('FABRICATE.App.Crafting.Slots.ReadOnly')}
      </p>
    {:else}
      <p class="requirement-rail-hint">{localize('FABRICATE.App.Crafting.Slots.Hint')}</p>
    {/if}

    <!-- Before the tiles, so assistive tech reaches the cause in document order rather
         than after every requirement it explains.

         The reason and the DIRECTIVE are one paragraph, because to this reader they are
         one statement (issue 1493). The reason alone is an engine sentence — the shipped
         "Currency unit Gold is missing an actor data path" means nothing to a player, who has no
         idea what an actor data path is, whether it is their fault, or what to do about
         it. This is the primary pre-craft discovery surface, so it names the person who
         can fix it and where they fix it. The reason stays unlocalized (the affordance
         layer composes it in English); the directive is copy and is keyed. -->
    {#if currencyIssue}
      <p class="requirement-rail-issue" data-requirement-rail-issue>
        {currencyIssue}
        {localize('FABRICATE.App.Crafting.Slots.CurrencySetupDirective')}
      </p>
    {/if}

    <div class="requirement-rail-slots" data-requirement-rail-slots>
      {#each items as slot (slot.key)}
        <RequirementTile
          {slot}
          {readOnly}
          iconClass={slot.isEssence ? normalizeEssenceIcon(slot.icon) : ''}
          open={isOpen(slot)}
          label={tileLabel(slot)}
          caption={slot.name}
          disclosure={disclosureText(slot)}
          tileId={tileDomId(slot)}
          controlsId={isOpen(slot) ? panelId : null}
          onOpen={(slotId) => onOpenSlot?.(slotId)}
        />
      {/each}
    </div>

    <!-- Auto-advance never steals focus, so the change of open chooser is announced
         here instead. Its own region: ProgressiveStageList owns the reorder one. -->
    <p class="requirement-rail-live" role="status" aria-live="polite" data-requirement-rail-live>
      {liveText}
    </p>
  </section>
{/if}

<style>
  .requirement-rail {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .requirement-rail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
  }

  /* Foundry's global button chrome pins a fixed height and centres content; reset it
     the same way the shipped .crafting-alt-option does. */
  .requirement-rail-wand {
    appearance: none;
    -webkit-appearance: none;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: auto;
    min-height: 26px;
    padding: 2px var(--fab-space-2);
    border: 1px solid var(--fab-accent-border);
    border-radius: 999px;
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
    cursor: pointer;
  }

  .requirement-rail-wand:hover {
    background: var(--fab-surface-active);
  }

  .requirement-rail-wand i {
    font-size: 10px;
  }

  .requirement-rail-hint {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  /* Same shape as the hint above it, in the warning-TEXT token rather than the base
     `--fab-warning` fill hue: this is a sentence, not a fill.
     WARNING, not danger (issue 1493): the world's currency setup is unfinished, which is
     not the player's fault and not something they can act on beyond asking their GM. Red
     here reads as "you have done something wrong" on the one surface whose red already
     means "you cannot afford this". */
  .requirement-rail-issue {
    margin: 0;
    font-size: 12px;
    color: var(--fab-warning-text);
  }

  /* Slots WRAP rather than shrink: below the tile's minimum the artwork and the pip
     stop being legible, so a narrow app gets more rows, not smaller tiles. */
  .requirement-rail-slots {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
  }

  .requirement-rail-live {
    margin: 0;
    font-size: 11px;
    color: var(--fab-text-muted);
  }
</style>
