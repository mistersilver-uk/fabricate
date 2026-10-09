<!-- Svelte 5 runes mode -->
<!--
  The player Crafting tab's requirement surface: a header with "Pick for me", the shared
  requirement chooser over the set's slots, and the rail's own live region.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `slots` | `buildRequirementSlots` output | `[]` | The set's slots in author order. |
  | `openSlotId` | slot id | `null` | Resolved and re-validated by the store; the rail never remembers it. |
  | `readOnly` | boolean | `false` | True when the displayed step is not the step the engine would execute, or its time gate is armed. |
  | `announcement` | localized string | `''` | Wins over the open-chooser sentence in the live region. |
  | `panelId` | DOM id | `null` | The id the open slot's panel takes. |
  | `choices` | craftability `ingredientChoices` | `[]` | A group's `option` entry becomes its slot's alternatives; other kinds are ignored here. |

  Snippets:
  - `chooser(slot)` — the open slot's panel content beneath its alternatives; omitted when it has none.

  Callbacks:
  - `onOpenSlot(slotId)` — a selectable tile was pressed; the store opens or closes it.
  - `onChooseOption(groupId, { optionIndex })` — an alternative was pressed.
  - `onPickForMe()` — the wand was pressed.

  Invariants:
  - The wand lives here, not in the app footer: the rail renders inside step and routed bodies.
  - Auto-advance announces through this component's own live region, never the progressive stage
    list's reorder region, because a progressive recipe renders both at once.
  - Pinned by `tests/components/requirement-rail-mounted.test.js`.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { resolveCraftingArt } from '../../../util/craftingArtResolution.js';
  import { normalizeEssenceIcon } from '../../../util/essenceIcons.js';
  import { SLOT_KIND, SLOT_STATE } from '../../../util/requirementSlots.js';
  import { haveOfNeedText } from '../../../util/craftingQuantityReading.js';
  import Button from '../../../components/Button.svelte';
  import RequirementChooser from '../../../components/RequirementChooser.svelte';
  import Kicker from '../../../components/Kicker.svelte';

  let {
    slots = [],
    openSlotId = null,
    readOnly = false,
    announcement = '',
    panelId = null,
    choices = [],
    onOpenSlot = null,
    onChooseOption = null,
    onPickForMe = null,
    chooser = null,
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

  // A currency slot's state is binary and it has no have/need ratio to announce (issue 1493),
  // so it takes its own whole keys rather than the ratio sentences above.
  const CURRENCY_LABEL_KEYS = {
    [SLOT_STATE.MET]: 'FABRICATE.App.Crafting.Slots.TileCurrencyMet',
    [SLOT_STATE.SHORT]: 'FABRICATE.App.Crafting.Slots.TileCurrencyShort',
  };

  // A cost the world's configuration cannot resolve is not a shortfall, so it is named by its
  // reason through a key of its own; the joining sentence is copy a translator must reach.
  function currencyTileLabel(slot) {
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

  // The currency reason belongs to the world's configuration, not to one requirement, so it
  // renders once for the rail. It arrives composed in English from the affordance layer.
  const currencyIssue = $derived(items.find((slot) => slot.isCurrency && slot.issue)?.issue ?? '');

  // Plurals are two whole literal keys: a concatenated suffix strands the leaf under the
  // lang-key orphan guard.
  function optionsLabel(count) {
    return count === 1
      ? localize('FABRICATE.App.Crafting.Slots.OptionsOne', { count })
      : localize('FABRICATE.App.Crafting.Slots.OptionsMany', { count });
  }

  // A choice the player has not picked from and whose default falls short is a to-do.
  function unchosen(slot) {
    return slot.kind === SLOT_KIND.CHOICE && slot.state === SLOT_STATE.PARTIAL;
  }

  // A slot with alternatives states their count whichever kind of option is chosen. A choice the
  // player has not picked from states the to-do instead: its tile differs from a short one by
  // ink alone.
  function disclosureText(slot) {
    if (slot.choiceCount > 1) {
      return unchosen(slot)
        ? localize('FABRICATE.App.Crafting.Slots.ChooseOne', { count: slot.choiceCount })
        : optionsLabel(slot.choiceCount);
    }
    if (slot.kind === SLOT_KIND.ESSENCE) {
      return slot.have > 0
        ? localize('FABRICATE.App.Crafting.Slots.EditPool')
        : localize('FABRICATE.App.Crafting.Slots.AddItems');
    }
    return localize('FABRICATE.App.Crafting.Slots.Change');
  }

  // A slot and an option share the art fields.
  function tileArt(entry) {
    if (entry.isEssence) {
      return { art: '', icon: normalizeEssenceIcon(entry.icon), tint: entry.colorToken || '' };
    }
    return resolveCraftingArt(entry.img, 'fa-solid fa-cube');
  }

  const optionChoices = $derived(
    new Map(
      (Array.isArray(choices) ? choices : [])
        .filter((choice) => choice?.kind === 'option' && Array.isArray(choice.options))
        .map((choice) => [choice.groupId, choice])
    )
  );

  // A met alternative names its held-against-needed pair; a short one is named plainly, because
  // its shortfall is the visible sentence that describes it. The `wrapperProps` are the smoke harness's.
  function alternativeOf(slot, choice, option) {
    const short = option.isCurrency ? option.affordable === false : option.satisfied !== true;
    const keys = option.isCurrency ? CURRENCY_LABEL_KEYS : STATE_LABEL_KEYS;
    const words = { name: option.name, have: option.have, need: option.need };
    return {
      ...tileArt(option),
      id: String(option.optionIndex),
      optionIndex: option.optionIndex,
      name: option.name,
      label: short
        ? localize('FABRICATE.App.Crafting.Io.ChooseOption', { name: option.name })
        : localize(keys[SLOT_STATE.MET], words),
      reading: short ? localize(keys[SLOT_STATE.SHORT], words) : '',
      pip: option.isCurrency ? option.costLabel || '' : haveOfNeedText(option.have, option.need),
      short,
      selected: option.optionIndex === choice.selectedOptionIndex && !unchosen(slot),
      wrapperProps: { class: 'crafting-alt-option', 'data-option-index': option.optionIndex },
    };
  }

  function alternativesOf(slot) {
    const choice = slot.slotId ? optionChoices.get(slot.slotId) : null;
    return choice ? choice.options.map((option) => alternativeOf(slot, choice, option)) : [];
  }

  // A currency slot draws no pip: its `need` is a price and its `have` is always 0.
  function chooserSlot(slot) {
    return {
      ...tileArt(slot),
      key: slot.key,
      slotId: slot.slotId,
      kind: slot.kind,
      state: slot.state,
      name: slot.name,
      label: tileLabel(slot),
      description: slot.description,
      pip: slot.isCurrency ? '' : `${slot.have}/${slot.need}`,
      affordance: disclosureText(slot),
      tileId: `fabricate-slot-${slot.key}`,
      alternatives: alternativesOf(slot),
    };
  }

  const chooserSlots = $derived(items.map(chooserSlot));

  // Auto-advance moves the open chooser without moving focus, so the change is spoken; naming
  // the open slot makes the text change exactly when the open chooser does.
  const openSlot = $derived(
    items.find((slot) => slot.interactive && slot.slotId === openSlotId) ?? null
  );
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
        <!-- No aria-label: the visible span names the button and `title` carries the hint, so
             the accessible name contains the visible label (WCAG 2.5.3). -->
        <Button
          role="ghost"
          class="requirement-rail-wand"
          data-requirement-pick-for-me=""
          title={localize('FABRICATE.App.Crafting.Slots.PickForMeHint')}
          onclick={() => onPickForMe?.()}
        >
          <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
          <span>{localize('FABRICATE.App.Crafting.Slots.PickForMe')}</span>
        </Button>
      {/if}
    </div>

    {#if readOnly}
      <p class="requirement-rail-hint" data-requirement-rail-readonly>
        {localize('FABRICATE.App.Crafting.Slots.ReadOnly')}
      </p>
    {:else}
      <p class="requirement-rail-hint">{localize('FABRICATE.App.Crafting.Slots.Hint')}</p>
    {/if}

    <!-- Before the tiles, so assistive tech reaches the cause before the requirements it
         explains. Reason and directive are one paragraph: the reason alone names nobody who
         can fix it. -->
    {#if currencyIssue}
      <p class="requirement-rail-issue" data-requirement-rail-issue>
        {currencyIssue}
        {localize('FABRICATE.App.Crafting.Slots.CurrencySetupDirective')}
      </p>
    {/if}

    <RequirementChooser
      slots={chooserSlots}
      {openSlotId}
      {readOnly}
      {panelId}
      ariaLabel={localize('FABRICATE.App.Crafting.Slots.Title')}
      alternativesLabel={localize('FABRICATE.App.Crafting.Io.AlternativesTitle')}
      panel={chooser}
      onToggle={(slotId) => onOpenSlot?.(slotId)}
      onChoose={(slot, alternative) =>
        onChooseOption?.(slot.slotId, { optionIndex: alternative.optionIndex })}
      data-requirement-rail-slots
    />

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

  .requirement-rail-hint {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  /* Warning, not danger (issue 1493): an unfinished currency setup is not the player's fault,
     and red on this surface already means "you cannot afford this". */
  .requirement-rail-issue {
    margin: 0;
    font-size: 12px;
    color: var(--fab-warning-text);
  }

  .requirement-rail-live {
    margin: 0;
    font-size: 11px;
    color: var(--fab-text-muted);
  }
</style>
