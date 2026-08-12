<!-- Svelte 5 runes mode -->
<!--
  Unified per-check trigger editor (issue 419 recombine).

  One trigger list per check, ALWAYS rendered. Each trigger pairs an expressive
  dice-matching CONDITION with three effects:
    - `outcome` — force the check to an Automatic success / Automatic failure, or
      leave it (No effect). For a progressive check the success/failure labels read
      Award all / Award none. Forcing applies under BOTH tool-breakage authorities.
    - `breakTools` — break every required tool for the attempt. Authored (and applied)
      ONLY under `checkDriven` authority: the per-trigger break pill is shown/enabled
      only when `showBreakTools` is true, and under `toolSpecific` a check never breaks
      tools.
    - `tierStep` (issue 975) — move the rolled outcome tier: target a named tier, or
      step it up/down by N. Routed only (there are no tiers to step otherwise), and
      deliberately NOT gated on `showBreakTools`: stepping is not a breakage concept
      and does not belong to the tool-breakage authority.

  An `outcomeTier` condition (routed only) cannot force an outcome — the routed tier
  is resolved AFTER the forced outcome would run, so the outcome segments are pinned to
  No effect and disabled for it (such a trigger may still break tools, evaluated at
  the engine seam where the tier is known). It CAN step, though: a step reads the
  rolled tier and produces the final one, so there is no circularity to prevent.

  Controlled component mirroring the prior editors' `{ value, rollFormula, onChange }`
  pattern: reads the `{ triggers[] }` block + the roll formula and emits the next
  block via onChange. Dice groups are enumerated from the formula via parseDiceGroups
  so a `diceGroup` trigger targets a group by its evaluated-term index (groupId);
  duplicate `NdS` groups are disambiguated `#1`/`#2`.

  `kind` selects which condition types are offered: `progressive` adds the
  progressiveValue condition; `routed` adds the outcomeTier condition (which reads
  `outcomeOptions`).
-->
<script>
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { parseDiceGroups } from '../../../../../utils/craftingCheckExpression.js';
  import { interpolate } from './checksCopy.js';
  import { buildPresetTrigger, checkTriggerPresets } from './checkTriggerPresets.js';
  import { summariseCondition, summariseEffect, summariseHeadline } from './checkTriggerSummary.js';
  import SegmentedControl from '../SegmentedControl.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import ToggleCard from '../ToggleCard.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';

  let {
    value = null,
    rollFormula = '',
    kind = 'simple',
    outcomeOptions = [],
    showBreakTools = false,
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function newId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function' ? random() : Math.random().toString(36).slice(2, 12);
  }

  const triggers = $derived(Array.isArray(value?.triggers) ? value.triggers : []);

  // Dice groups in evaluated-term order. groupId is the index (matching the engine's
  // roll.dice term index); duplicate NdS labels are disambiguated by an occurrence
  // counter so `1d20 + 1d20` reads `1d20 #1` / `1d20 #2`.
  const diceGroups = $derived(
    (() => {
      const parsed = parseDiceGroups(rollFormula);
      // Function-local counters, discarded when the $derived IIFE returns.
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const seen = new Map();
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const counts = new Map();
      for (const group of parsed) counts.set(group.raw, (counts.get(group.raw) || 0) + 1);
      return parsed.map((group, groupId) => {
        const occurrence = (seen.get(group.raw) || 0) + 1;
        seen.set(group.raw, occurrence);
        const duplicated = (counts.get(group.raw) || 0) > 1;
        const label = duplicated
          ? text('FABRICATE.Admin.Manager.Checks.Breakage.GroupOrdinal', '{die} #{n}')
              .replace('{die}', group.raw)
              .replace('{n}', String(occurrence))
          : group.raw;
        return { groupId, raw: group.raw, count: group.count, sides: group.sides, label };
      });
    })()
  );

  const firstD20GroupId = $derived(diceGroups.find((group) => group.sides === 20)?.groupId ?? null);

  // The comparison a GM reads, not the symbol the model stores. `==` in a sentence-shaped row
  // (`WHEN dice group IS ==`) is the operator restated as code; the prototype spells all six of
  // its own in words, and five of them are the five this model persists. Ordered as the
  // prototype orders them rather than as the stored values happen to sort.
  const OPERATORS = [
    {
      value: '==',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OpSelectExactly',
      fallback: 'is exactly',
    },
    {
      value: '>=',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OpSelectAtLeast',
      fallback: 'is at least',
    },
    {
      value: '<=',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OpSelectAtMost',
      fallback: 'is at most',
    },
    {
      value: '>',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OpSelectOver',
      fallback: 'is more than',
    },
    {
      value: '<',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OpSelectUnder',
      fallback: 'is less than',
    },
  ];
  const AGGREGATES = [
    {
      value: 'total',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.AggregateTotal',
      fallback: 'Group total',
    },
    {
      value: 'anyDie',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.AggregateAnyDie',
      fallback: 'Any die',
    },
    {
      value: 'allDice',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.AggregateAllDice',
      fallback: 'All dice',
    },
    {
      value: 'lowestDie',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.AggregateLowestDie',
      fallback: 'Lowest die',
    },
    {
      value: 'highestDie',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.AggregateHighestDie',
      fallback: 'Highest die',
    },
  ];

  // Condition types offered for this editor kind. progressiveValue is meaningful
  // only on progressive checks; outcomeTier only on routed checks.
  const conditionTypes = $derived(
    [
      {
        value: 'rollTotal',
        labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TypeRollTotal',
        fallback: 'Roll total',
      },
      kind === 'progressive'
        ? {
            value: 'progressiveValue',
            labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TypeProgressiveValue',
            fallback: 'Awarded value',
          }
        : null,
      {
        value: 'diceGroup',
        labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TypeDiceGroup',
        fallback: 'Dice group',
      },
      kind === 'routed'
        ? {
            value: 'outcomeTier',
            labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TypeOutcomeTier',
            fallback: 'Outcome tier',
          }
        : null,
    ].filter(Boolean)
  );

  // Outcome toggle segments, ordered as a good→neutral→bad spectrum
  // (success | no effect | failure) so the neutral default sits in the middle.
  // Progressive checks relabel success/failure to award all/none (they have no
  // pass/fail, only a numeric value), reusing the existing AwardAll/AwardNone keys.
  const outcomeChoices = $derived(
    kind === 'progressive'
      ? [
          {
            value: 'success',
            variant: 'success',
            labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.AwardAll',
            fallback: 'Award all',
          },
          {
            value: 'none',
            variant: 'neutral',
            labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OutcomeForceNone',
            fallback: 'No effect',
          },
          {
            value: 'failure',
            variant: 'danger',
            labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.AwardNone',
            fallback: 'Award none',
          },
        ]
      : [
          {
            value: 'success',
            variant: 'success',
            labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OutcomeForceSuccess',
            fallback: 'Automatic success',
          },
          {
            value: 'none',
            variant: 'neutral',
            labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OutcomeForceNone',
            fallback: 'No effect',
          },
          {
            value: 'failure',
            variant: 'danger',
            labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OutcomeForceFailure',
            fallback: 'Automatic failure',
          },
        ]
  );

  // The forcing segments are DISABLED (on the radio itself, not merely dimmed) for an
  // outcomeTier condition — that pin is what keeps forcing non-circular.
  function outcomeSegments(isOutcomeTier) {
    return outcomeChoices.map((option) => ({
      ...option,
      disabled: isOutcomeTier && option.value !== 'none',
    }));
  }

  // The tier-step effect's four modes. `none` is inert; `up`/`down` take a count;
  // `target` names a tier. Rendered for routed checks only — there is nothing to
  // step on a simple or progressive check.
  const TIER_STEP_MODES = [
    {
      value: 'none',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TierStepModeNone',
      fallback: 'No step',
    },
    {
      value: 'up',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TierStepModeUp',
      fallback: 'Step up',
    },
    {
      value: 'down',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TierStepModeDown',
      fallback: 'Step down',
    },
    {
      value: 'target',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TierStepModeTarget',
      fallback: 'Target tier',
    },
  ];

  const tierStepLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Breakage.TierStep', 'Tier step')
  );
  const tierStepModeLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Breakage.TierStepMode', 'Tier step mode')
  );

  // The tier-step operand's ONLY name is "Steps up" / "Steps down", so parametrizing the
  // shared adjunct strings with it reads as "Decrease Steps up". Its adjuncts take the
  // row's own label — "Tier step" — instead, which is both grammatical and the name this
  // surface already gives the control the operand belongs to. So the shared derivation is
  // spread from `tierStepLabel` and only `ariaLabel` is overridden after it, at the tag.
  const tierStepAdjunctLabels = $derived(stepperLabels(tierStepLabel));
  const conditionValueLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Breakage.Value', 'Value')
  );

  // The expanded body's micro-labels. `TierStep`/`OutcomeColumn` stay the CONTROL's own
  // accessible names — "Tier step", "Outcome" — because a radiogroup announced as "And the
  // tier moves" reads as a fragment; these are the visible headings the prototype writes over
  // each group, which is a different job from naming the control.
  const conditionLegend = $derived(
    text('FABRICATE.Admin.Manager.Checks.Breakage.ConditionLegend', 'Condition')
  );
  const outcomeLegend = $derived(
    text('FABRICATE.Admin.Manager.Checks.Breakage.OutcomeLegend', 'And the outcome')
  );
  const tierStepLegend = $derived(
    text('FABRICATE.Admin.Manager.Checks.Breakage.TierStepLegend', 'And the tier moves')
  );
  const tierStepAmountLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Breakage.TierStepAmount', 'By how many')
  );

  // ── THE LIST COLLAPSES (issue 1096) ─────────────────────────────────────────────────
  //
  // At most ONE trigger is open, and none is open on arrival: a check with three triggers
  // used to draw three full editors, which is taller than the pane and is why authoring a
  // preset looked like it did nothing — the new card landed below the fold of a list the GM
  // could not see the end of. So a new trigger OPENS and is SCROLLED TO, which is the other
  // half of that fix; without the scroll the accordion just moves the invisible card.
  let expandedId = $state(null);
  // Element per trigger, for the scroll. `$state` rather than a plain object: `bind:this` into
  // a plain object's member warns `binding_property_non_reactive` at runtime, and the warning is
  // the truth — the effect below has to notice the node arriving.
  const triggerNodes = $state({});
  // The id this component has already scrolled to, so re-rendering a still-expanded trigger
  // (every keystroke in its value field re-renders it) does not yank the pane back.
  let scrolledTo = null;

  $effect(() => {
    // Read the list as well as the node map: `expandedId` is set BEFORE the parent has emitted
    // the longer list back down, so the effect has to re-run once the card actually exists.
    void triggers.length;
    const id = expandedId;
    if (!id || scrolledTo === id) return;
    const node = triggerNodes[id];
    if (!node) return;
    scrolledTo = id;
    // `nearest` so expanding an already-visible card does not move the pane at all; happy-dom
    // does not implement it, hence the optional call.
    node.scrollIntoView?.({ block: 'nearest' });
  });

  function toggleExpanded(id) {
    expandedId = expandedId === id ? null : id;
  }

  function emit(nextTriggers) {
    onChange({ triggers: Array.isArray(nextTriggers) ? nextTriggers : [] });
  }

  function defaultConditionFor(type) {
    if (type === 'rollTotal') return { type, operator: '<=', value: 1 };
    if (type === 'progressiveValue') return { type, operator: '>=', value: 1 };
    if (type === 'outcomeTier') return { type, tierIds: [], outcomeKeys: [] };
    return {
      type: 'diceGroup',
      groupId: firstD20GroupId ?? diceGroups[0]?.groupId ?? 0,
      aggregate: 'anyDie',
      operator: '==',
      value: 1,
    };
  }

  function addTrigger() {
    const type = conditionTypes[0]?.value || 'rollTotal';
    const id = newId();
    expandedId = id;
    emit([
      ...triggers,
      {
        id,
        condition: defaultConditionFor(type),
        outcome: 'none',
        // Default a new trigger to breaking tools only where that effect is reachable.
        breakTools: showBreakTools === true,
        // Authored here rather than left to the normalizer so a freshly added trigger
        // and a saved-then-reloaded one are the same object — no round trip needed for
        // the editor and the normalizer to agree.
        tierStep: { mode: 'none', steps: 1, tierId: null },
      },
    ]);
  }

  function updateTrigger(id, patch) {
    emit(triggers.map((trigger) => (trigger.id === id ? { ...trigger, ...patch } : trigger)));
  }

  function updateCondition(id, patch) {
    emit(
      triggers.map((trigger) =>
        trigger.id === id
          ? { ...trigger, condition: { ...(trigger.condition || {}), ...patch } }
          : trigger
      )
    );
  }

  function setConditionType(id, type) {
    // Switching to an outcomeTier condition cannot force an outcome → pin to none.
    const patch = { condition: defaultConditionFor(type) };
    if (type === 'outcomeTier') patch.outcome = 'none';
    updateTrigger(id, patch);
  }

  function removeTrigger(id) {
    if (expandedId === id) expandedId = null;
    emit(triggers.filter((trigger) => trigger.id !== id));
  }

  function outcomeFor(trigger) {
    const current = trigger?.outcome;
    return current === 'success' || current === 'failure' ? current : 'none';
  }

  function isOutcomeSelected(condition, id) {
    return Array.isArray(condition?.tierIds) && condition.tierIds.includes(id);
  }

  // The trigger's tierStep effect, read defensively: a trigger authored before issue
  // 975 (or hand-edited) may carry none at all. Flat rather than a discriminated
  // union so switching mode never destroys the other mode's operand.
  function tierStepFor(trigger) {
    const source =
      trigger?.tierStep && typeof trigger.tierStep === 'object' ? trigger.tierStep : {};
    const steps = Number(source.steps);
    const tierId = typeof source.tierId === 'string' ? source.tierId.trim() : '';
    return {
      mode: ['none', 'target', 'up', 'down'].includes(source.mode) ? source.mode : 'none',
      steps: Number.isFinite(steps) ? Math.max(1, Math.trunc(steps)) : 1,
      tierId: tierId || null,
    };
  }

  function updateTierStep(id, patch) {
    const trigger = triggers.find((entry) => entry.id === id);
    updateTrigger(id, { tierStep: { ...tierStepFor(trigger), ...patch } });
  }

  // A target naming no tier on the ACTIVE list. Reachable by design and not only by
  // import: the relative↔fixed type switch swaps the whole tier list, dangling every
  // authored tierId at once.
  function isDanglingTarget(step) {
    return Boolean(step.tierId) && !outcomeOptions.some((option) => option.id === step.tierId);
  }

  function toggleOutcomeTier(id, optionId) {
    const trigger = triggers.find((entry) => entry.id === id);
    const current = Array.isArray(trigger?.condition?.tierIds) ? trigger.condition.tierIds : [];
    const next = current.includes(optionId)
      ? current.filter((value) => value !== optionId)
      : [...current, optionId];
    updateCondition(id, { tierIds: next });
  }

  // ── What each trigger says about itself (issue 1096) ─────────────────────────────
  //
  // The card used to be headed by the word `When` — the label of its first `<select>` — so a
  // list of three triggers read `When`, `When`, `When`. The sentence is composed by the pure
  // `checkTriggerSummary` module; this is only the localization bridge, which is why a
  // fragment arrives as `{ key, fallback }` and is resolved here.
  const tierNames = $derived(
    Object.fromEntries((outcomeOptions ?? []).map((option) => [option.id, option.name || '']))
  );

  /** Resolve one fragment, filling any nested fragment in its data first. */
  function phrase(fragment) {
    const data = Object.fromEntries(
      Object.entries(fragment.data ?? {}).map(([key, entry]) => [
        key,
        entry && typeof entry === 'object' ? text(entry.key, entry.fallback) : entry,
      ])
    );
    return interpolate(text(fragment.key, fragment.fallback), data);
  }

  function conditionSummary(trigger) {
    return phrase(summariseCondition(trigger?.condition ?? {}, { diceGroups, tierNames }));
  }

  /** The collapsed head's glyph tile, tone and result chip. */
  function headlineFor(trigger) {
    return summariseHeadline(trigger, {
      tierNames,
      progressive: kind === 'progressive',
      showBreakTools,
    });
  }

  function effectSentence(trigger) {
    const clauses = summariseEffect(trigger, {
      tierNames,
      progressive: kind === 'progressive',
      showBreakTools,
    }).map((clause) => phrase(clause));
    const joined = clauses.join(
      text('FABRICATE.Admin.Manager.Checks.Breakage.SummaryJoin', ', and ')
    );
    return interpolate(
      text(
        'FABRICATE.Admin.Manager.Checks.Breakage.SummarySentence',
        'When {condition}, {effect}.'
      ),
      { condition: conditionSummary(trigger).toLowerCase(), effect: joined }
    );
  }

  // ── The preset row (issue 1096) ──────────────────────────────────────────────────
  //
  // Withheld entirely when the formula rolls no dice: a `Natural 20 on 1d20` preset offered
  // against a formula with no die would author a condition pointing at a group that does not
  // exist. `checkTriggerPresets` decides that, not this component.
  const presets = $derived(checkTriggerPresets({ kind, diceGroups }));

  function addPreset(presetId) {
    const trigger = buildPresetTrigger({
      presetId,
      kind,
      diceGroups,
      showBreakTools,
      newId,
    });
    if (!trigger) return;
    // Open and scroll to it for the same reason `addTrigger` does, and MORE so: a preset is
    // one click from the top of the pane, and the card it authors lands at the foot of a list
    // that is routinely taller than the pane. Before this, clicking a preset looked inert.
    expandedId = trigger.id;
    emit([...triggers, trigger]);
  }
</script>

<!-- ADD A COMMON TRIGGER. Its own card above the list, as the prototype has it: it is not
     part of the trigger editor, it is the shortcut past having to learn the editor first.
     A preset authors an ORDINARY trigger — no marker field, nothing downstream treats it
     differently — which is what keeps it a shortcut rather than a second kind of trigger. -->
{#if presets.length > 0}
  <section class="manager-inspector-card manager-checks-card" data-check-trigger-presets>
    <div class="manager-checks-card-head">
      <div>
        <h3 class="manager-checks-card-title">
          {text('FABRICATE.Admin.Manager.Checks.Breakage.PresetsTitle', 'Add a common trigger')}
        </h3>
        <p class="manager-checks-card-description">
          {text(
            'FABRICATE.Admin.Manager.Checks.Breakage.PresetsLead',
            'One click for the conditions almost every system writes.'
          )}
        </p>
      </div>
    </div>
    <div class="manager-checks-card-body">
      <div class="manager-checks-trigger-presets">
        {#each presets as preset (preset.id)}
          <ManagerButton
            role="dashed"
            data-add-trigger-preset={preset.id}
            onclick={() => addPreset(preset.id)}
          >
            <i class={preset.icon} aria-hidden="true"></i>
            <span>{phrase(preset)}</span>
          </ManagerButton>
        {/each}
      </div>
    </div>
  </section>
{/if}

<!-- THE TRIGGER LIST IS NOT A CARD. Its members are, one per trigger, sitting directly in the
     pane exactly as the prototype draws them — this wrapper carries the route's hooks and the
     stacking gutter and paints nothing. The `Check triggers` card that used to sit around the
     whole list was invented here: it gave the screen a title and a description the design never
     wrote, and the structural parity pass reported it as an EXTRA CARD for that reason. The
     section head above the pane already names the section and leads it. -->
<div class="manager-checks-trigger-route" data-check-triggers>
  {#if triggers.length === 0}
    <p class="manager-muted" data-triggers-empty>
      {text(
        'FABRICATE.Admin.Manager.Checks.Breakage.Empty',
        'No triggers yet. Add one to force an outcome or break tools on this check.'
      )}
    </p>
  {:else}
    <div class="manager-checks-trigger-list" role="list">
      {#each triggers as trigger (trigger.id)}
        {@const condition = trigger.condition || {}}
        {@const isOutcomeTier = condition.type === 'outcomeTier'}
        {@const selectedOutcome = isOutcomeTier ? 'none' : outcomeFor(trigger)}
        {@const expanded = expandedId === trigger.id}
        {@const headline = headlineFor(trigger)}
        <div
          class="manager-checks-breakage-trigger"
          class:is-expanded={expanded}
          role="listitem"
          data-trigger={trigger.id}
          bind:this={triggerNodes[trigger.id]}
        >
          <div class="manager-checks-trigger-head">
            <!-- The WHOLE head is the disclosure, glyph tile to chevron, because the chevron
                 alone is a 10px target for the commonest action on this screen. The delete
                 button is its SIBLING, never its child: a `<button>` inside a `<button>` is
                 invalid, and the DOM the browser builds from it is not the one written here.

                 The title is a `<span>`, not the `<h4>` it was, for the same reason: a heading
                 is not phrasing content and may not sit inside a button. It is still read as a
                 title by the structural parity pass, which classifies presentationally at
                 12.5px/600 — which is exactly what the prototype's own card title measures,
                 since the prototype has no heading elements at all. -->
            <button
              type="button"
              class="manager-checks-trigger-disclosure"
              data-trigger-disclosure={trigger.id}
              aria-expanded={expanded}
              aria-controls={`fab-trigger-body-${trigger.id}`}
              onclick={() => toggleExpanded(trigger.id)}
            >
              <span class={`manager-checks-trigger-glyph is-${headline.tone}`} aria-hidden="true">
                <i class={headline.glyph}></i>
              </span>
              <span class="manager-checks-trigger-headline">
                <span class="manager-checks-trigger-title" data-trigger-summary={trigger.id}>
                  {conditionSummary(trigger)}
                </span>
                <span class="manager-checks-trigger-lead" data-trigger-effect={trigger.id}>
                  {effectSentence(trigger)}
                </span>
              </span>
              {#if headline.chip}
                <span
                  class={`manager-checks-trigger-chip is-${headline.tone}`}
                  data-trigger-chip={trigger.id}
                >
                  {phrase(headline.chip)}
                </span>
              {/if}
              <i
                class={`fas ${expanded ? 'fa-chevron-up' : 'fa-chevron-down'} manager-checks-trigger-chevron`}
                aria-hidden="true"
              ></i>
              <!-- The accessible name of the disclosure, which its visible content does not
                   supply: the title reads as a condition and the chevron is decorative. -->
              <span class="visually-hidden">
                {expanded
                  ? text(
                      'FABRICATE.Admin.Manager.Checks.Breakage.CollapseTrigger',
                      "Hide this trigger's settings"
                    )
                  : text(
                      'FABRICATE.Admin.Manager.Checks.Breakage.ExpandTrigger',
                      "Show this trigger's settings"
                    )}
              </span>
            </button>

            <button
              type="button"
              class="manager-icon-button is-danger manager-checks-trigger-remove"
              data-remove-trigger
              aria-label={text(
                'FABRICATE.Admin.Manager.Checks.Breakage.RemoveTrigger',
                'Remove trigger'
              )}
              onclick={() => removeTrigger(trigger.id)}
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
          </div>

          {#if expanded}
            <div
              class="manager-checks-trigger-body"
              id={`fab-trigger-body-${trigger.id}`}
              data-trigger-body={trigger.id}
            >
              <p class="manager-checks-trigger-legend">{conditionLegend}</p>
              <div class="manager-checks-breakage-condition">
                <label class="manager-field">
                  <span
                    >{text('FABRICATE.Admin.Manager.Checks.Breakage.ConditionType', 'When')}</span
                  >
                  <select
                    data-trigger-condition-type
                    value={condition.type || 'rollTotal'}
                    onchange={(event) => setConditionType(trigger.id, event.currentTarget.value)}
                  >
                    {#each conditionTypes as option (option.value)}
                      <option value={option.value}>{text(option.labelKey, option.fallback)}</option>
                    {/each}
                  </select>
                </label>

                {#if condition.type === 'diceGroup'}
                  <label class="manager-field">
                    <span>{text('FABRICATE.Admin.Manager.Checks.Breakage.Group', 'Group')}</span>
                    <select
                      data-trigger-group
                      value={String(condition.groupId ?? '')}
                      onchange={(event) =>
                        updateCondition(trigger.id, { groupId: Number(event.currentTarget.value) })}
                    >
                      {#each diceGroups as group (group.groupId)}
                        <option value={String(group.groupId)}>{group.label}</option>
                      {/each}
                    </select>
                  </label>
                  <label class="manager-field">
                    <span
                      >{text('FABRICATE.Admin.Manager.Checks.Breakage.Aggregate', 'Measure')}</span
                    >
                    <select
                      data-trigger-aggregate
                      value={condition.aggregate || 'anyDie'}
                      onchange={(event) =>
                        updateCondition(trigger.id, { aggregate: event.currentTarget.value })}
                    >
                      {#each AGGREGATES as option (option.value)}
                        <option value={option.value}
                          >{text(option.labelKey, option.fallback)}</option
                        >
                      {/each}
                    </select>
                  </label>
                {/if}

                {#if isOutcomeTier}
                  <div
                    class="manager-checks-breakage-tiers"
                    role="group"
                    aria-label={text(
                      'FABRICATE.Admin.Manager.Checks.Breakage.Tiers',
                      'Outcome tiers'
                    )}
                  >
                    {#if outcomeOptions.length === 0}
                      <p class="manager-muted" data-trigger-no-tiers>
                        {text(
                          'FABRICATE.Admin.Manager.Checks.Breakage.NoTiers',
                          'Add named outcome tiers to target them.'
                        )}
                      </p>
                    {:else}
                      {#each outcomeOptions as option (option.id)}
                        <button
                          type="button"
                          class={`manager-checks-state-pill ${isOutcomeSelected(condition, option.id) ? 'is-positive' : 'is-negative'}`}
                          data-trigger-tier={option.id}
                          aria-pressed={isOutcomeSelected(condition, option.id)}
                          onclick={() => toggleOutcomeTier(trigger.id, option.id)}
                        >
                          {option.name ||
                            text(
                              'FABRICATE.Admin.Manager.Checks.Breakage.UnnamedTier',
                              'Unnamed tier'
                            )}
                        </button>
                      {/each}
                    {/if}
                  </div>
                {:else}
                  <label class="manager-field">
                    <span>{text('FABRICATE.Admin.Manager.Checks.Breakage.Operator', 'Is')}</span>
                    <select
                      data-trigger-operator
                      value={condition.operator || '=='}
                      onchange={(event) =>
                        updateCondition(trigger.id, { operator: event.currentTarget.value })}
                    >
                      {#each OPERATORS as operator (operator.value)}
                        <option value={operator.value}
                          >{text(operator.labelKey, operator.fallback)}</option
                        >
                      {/each}
                    </select>
                  </label>
                  <!-- A PLAIN NUMBER FIELD, not the stepper it was. A threshold is typed, not
                       walked to: reaching 20 from 1 is nineteen clicks, and the prototype draws
                       one input here. `Stepper` still owns the tier-step operand below, which is
                       a magnitude of one or two and is genuinely stepped. -->
                  <label class="manager-field manager-checks-trigger-value">
                    <span>{conditionValueLabel}</span>
                    <input
                      type="number"
                      data-trigger-value
                      value={condition.value ?? 0}
                      oninput={(event) =>
                        updateCondition(trigger.id, {
                          value: Number(event.currentTarget.value) || 0,
                        })}
                    />
                  </label>
                {/if}
              </div>

              <!-- THE FORCED OUTCOME. The prototype never modelled it — its mockup check has no
                   such control at all — so it is styled as its neighbours are and placed where
                   the prototype's own effect groups read as a sequence: the condition, then what
                   it does to the outcome, then what it does to the tier. -->
              <div class="manager-checks-trigger-effect-row">
                <div class="manager-field manager-checks-trigger-outcome">
                  <span>{outcomeLegend}</span>
                  <SegmentedControl
                    density="field"
                    options={outcomeSegments(isOutcomeTier)}
                    value={selectedOutcome}
                    groupName={`outcome-${trigger.id}`}
                    ariaLabel={text(
                      'FABRICATE.Admin.Manager.Checks.Breakage.OutcomeColumn',
                      'Outcome'
                    )}
                    optionDataAttr="data-trigger-outcome"
                    onChange={(next) => updateTrigger(trigger.id, { outcome: next })}
                  />
                </div>
              </div>

              {#if kind === 'routed'}
                {@const step = tierStepFor(trigger)}
                {@const dangling = isDanglingTarget(step)}
                <!-- Its OWN row, not a third field in the bottom row: at the pinned 1280
               manager geometry the outcome toggle plus the break pill already spend
               most of the trigger card's width, and a four-segment control plus an
               operand does not fit what is left. -->
                <div class="manager-checks-trigger-effect-row" data-trigger-tier-step>
                  <div class="manager-field manager-checks-trigger-step-mode">
                    <span>{tierStepLegend}</span>
                    <SegmentedControl
                      density="field"
                      options={TIER_STEP_MODES}
                      value={step.mode}
                      groupName={`tierstep-${trigger.id}`}
                      ariaLabel={tierStepModeLabel}
                      optionDataAttr="data-trigger-tier-step-mode"
                      onChange={(mode) => updateTierStep(trigger.id, { mode })}
                    />
                  </div>

                  <!-- The operand slot is ALWAYS present at one pinned width and only its
                 contents swap, so changing mode never moves the control out from
                 under the pointer in this wrapping row. -->
                  <div
                    class={`manager-field manager-checks-trigger-step-operand ${dangling ? 'is-invalid' : ''}`}
                  >
                    <span>{tierStepAmountLabel}</span>
                    {#if step.mode === 'up' || step.mode === 'down'}
                      <!-- `fill` is what keeps the canonical no-movement guarantee (ui-integration
                     spec, "a stable operand slot at one pinned width"): the slot stays
                     pinned at 160px and the primitive stretches into it, so swapping mode
                     between this stepper, the tier `<select>` and the inert placeholder
                     leaves the control's POSITION and BOX SIZE unchanged — which is the
                     guarantee the spec actually makes, and all the no-movement rule needs.
                     Radius and fill still differ (the stepper paints 8px /
                     `--fab-surface-soft`, a `.manager-field` control 6px / `--fab-mv2-bg`);
                     claiming otherwise was an overclaim corrected alongside the spec text.
                     `data-trigger-tier-step-steps` rides `inputProps` onto the real
                     `<input>` — the smoke harness calls Playwright's `fill()` and
                     `inputValue()` on it, and neither resolves against a wrapper `<div>`.
                     `Math.trunc` stays: `Stepper` clamps but does not truncate. -->
                      <Stepper
                        fill
                        value={step.steps}
                        min={1}
                        {...tierStepAdjunctLabels}
                        ariaLabel={step.mode === 'up'
                          ? text(
                              'FABRICATE.Admin.Manager.Checks.Breakage.TierStepStepsUp',
                              'Steps up'
                            )
                          : text(
                              'FABRICATE.Admin.Manager.Checks.Breakage.TierStepStepsDown',
                              'Steps down'
                            )}
                        inputProps={{ 'data-trigger-tier-step-steps': '' }}
                        onChange={(next) =>
                          updateTierStep(trigger.id, { steps: Math.max(1, Math.trunc(next)) })}
                      />
                    {:else if step.mode === 'target' && outcomeOptions.length > 0}
                      <!-- A <select> whose value matches no option renders its FIRST option as
                     selected, so a null tierId would show a real tier the check has not
                     persisted. The disabled placeholder is what makes "nothing chosen"
                     read as nothing chosen. -->
                      <select
                        data-trigger-tier-step-target
                        aria-label={text(
                          'FABRICATE.Admin.Manager.Checks.Breakage.TierStepTier',
                          'Tier'
                        )}
                        value={step.tierId ?? ''}
                        onchange={(event) =>
                          updateTierStep(trigger.id, { tierId: event.currentTarget.value || null })}
                      >
                        <option value="" disabled
                          >{text(
                            'FABRICATE.Admin.Manager.Checks.Breakage.TierStepChoose',
                            'Choose a tier…'
                          )}</option
                        >
                        {#each outcomeOptions as option (option.id)}
                          <option value={option.id}
                            >{option.name ||
                              text(
                                'FABRICATE.Admin.Manager.Checks.Breakage.UnnamedTier',
                                'Unnamed tier'
                              )}</option
                          >
                        {/each}
                        {#if dangling}
                          <option value={step.tierId} disabled
                            >{text(
                              'FABRICATE.Admin.Manager.Checks.Breakage.TierStepMissingTier',
                              'Missing tier'
                            )}</option
                          >
                        {/if}
                      </select>
                    {:else}
                      <input type="text" value="" disabled aria-hidden="true" tabindex="-1" />
                    {/if}
                  </div>

                  {#if step.mode === 'target' && outcomeOptions.length === 0}
                    <!-- Its own hook, distinct from the outcomeTier condition's: a trigger that
                   is both outcomeTier-conditioned and target-stepping on a tier-less check
                   would otherwise carry two identically-hooked nodes in one card. -->
                    <p
                      class="manager-muted manager-checks-trigger-step-hint"
                      data-trigger-step-no-tiers
                    >
                      {text(
                        'FABRICATE.Admin.Manager.Checks.Breakage.TierStepNoTiers',
                        'Add named outcome tiers to step to one.'
                      )}
                    </p>
                  {/if}
                </div>
              {/if}

              <!-- BREAKING THE TOOLS IS ITS OWN CARD, as the prototype draws it: a hazard with a
                   glyph, a title and a sentence, not a two-word pill in a row of toggles. It
                   renders the manager's shared `ToggleCard`, which is this exact shape — icon,
                   title, sub-line, switch — and which the On failure screen's own two flags
                   already use. -->
              {#if showBreakTools}
                <ToggleCard
                  icon="fas fa-hammer"
                  section="trigger-break-tools"
                  toggleAttr="data-trigger-break"
                  title={text(
                    'FABRICATE.Admin.Manager.Checks.Breakage.BreakToolsCardTitle',
                    'Break the required tools'
                  )}
                  sub={text(
                    'FABRICATE.Admin.Manager.Checks.Breakage.BreakToolsCardDesc',
                    'When this trigger fires, the tools break regardless of the failure policy.'
                  )}
                  toggleLabel={text(
                    'FABRICATE.Admin.Manager.Checks.Crafting.OutcomeBreak',
                    'Break tools'
                  )}
                  on={trigger.breakTools === true}
                  onToggle={(next) => updateTrigger(trigger.id, { breakTools: next })}
                />
              {:else}
                <!-- WHY THERE IS NO BREAK CARD. This sentence used to head the whole list, on a
                     card the prototype does not have; it belongs where the missing control is,
                     which is the only place a GM asks the question. -->
                <p class="manager-muted manager-checks-trigger-hint" data-trigger-break-unavailable>
                  {text(
                    'FABRICATE.Admin.Manager.Checks.Breakage.LeadOutcomeOnly',
                    'Each trigger can force the check outcome. Switch the tool-breakage authority to check-driven to let triggers break tools.'
                  )}
                </p>
              {/if}

              <!-- The rule restated in prose, as the prototype closes every expanded trigger:
                   the controls above are the parts, and this is what they add up to. -->
              <p class="manager-checks-trigger-quote" data-trigger-quote={trigger.id}>
                <i class="fas fa-quote-left" aria-hidden="true"></i>
                <span>{effectSentence(trigger)}</span>
              </p>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- The prototype extends the list with a full-width dashed control UNDER it, not a
       button in a card head: the action that grows the list belongs at the end of the list
       it grows. -->
  <ManagerButton role="dashed" data-add-trigger onclick={addTrigger}>
    <i class="fas fa-plus" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Checks.Breakage.AddTrigger', 'Add trigger')}</span>
  </ManagerButton>
</div>
