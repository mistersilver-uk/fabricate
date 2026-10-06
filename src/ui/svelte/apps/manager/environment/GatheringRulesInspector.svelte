<!-- Svelte 5 runes mode -->
<!--
  The Gathering Rules card: the ten rule selects and the two limit steppers the environments
  screen's settings tab inspects. Named for the aggregate, not the screen (issue 1707).

  `rules` is that aggregate and every control reads one of its fields; `onUpdate(patch)` persists
  one field, and the two steppers appear only under the `limitedDrops` modes.

  Invariants:
  - each trigger keeps its `manager-gathering-rule-*` id and is named by its row's caption, whose
    id is that stem plus `-caption` — `manager-environments-mounted.js`.
-->
<script>
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import Select from '../../../components/Select.svelte';
  import GatheringRuleLimitStepper from './GatheringRuleLimitStepper.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let { rules = {}, onUpdate = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  /**
   * One row per rule: `id` is the trigger's, written whole because the View Lab's selector guard
   * greps `src/` for it; `fallback` is what an unset field shows, `limit` the stepper its
   * `limitedDrops` mode reveals, and each option is `[value, key, fallback]`.
   */
  const RULES = [
    {
      field: 'rewardSelectionMode',
      id: 'manager-gathering-rule-rewards',
      icon: 'fa-gift',
      title: ['FABRICATE.Admin.Manager.Environment.Rules.Rewards', 'Rewards'],
      description: [
        'FABRICATE.Admin.Manager.Environment.Rules.RewardsDescription',
        'Choose how rewards are granted.',
      ],
      limit: 'rewardLimit',
      options: [
        [
          'highestRankedDrop',
          'FABRICATE.Admin.Manager.Environment.Rules.HighestRankedDrop',
          'Highest ranked successful drop',
        ],
        ['allDrops', 'FABRICATE.Admin.Manager.Environment.Rules.AllDrops', 'All successful drops'],
        [
          'limitedDrops',
          'FABRICATE.Admin.Manager.Environment.Rules.LimitedDrops',
          'Limit successful drops',
        ],
      ],
    },
    {
      field: 'dropModifierMode',
      id: 'manager-gathering-rule-drop-modifier-mode',
      icon: 'fa-percent',
      fallback: 'additive',
      title: ['FABRICATE.Admin.Manager.Environment.Rules.DropModifierMode', 'Modifier mode'],
      description: [
        'FABRICATE.Admin.Manager.Environment.Rules.DropModifierModeDescription',
        'Choose how all drop and event modifiers (character, weather, time of day, biome) adjust a chance. This applies system-wide and cannot be overridden per modifier.',
      ],
      options: [
        [
          'additive',
          'FABRICATE.Admin.Manager.Environment.Rules.DropModifierModeAdditive',
          'Additive (percentage points)',
        ],
        [
          'multiplicative',
          'FABRICATE.Admin.Manager.Environment.Rules.DropModifierModeMultiplicative',
          'Multiplicative (scale by percentage)',
        ],
      ],
    },
    {
      field: 'eventSelectionMode',
      id: 'manager-gathering-rule-events',
      icon: 'fa-masks-theater',
      title: ['FABRICATE.Admin.Manager.Environment.Rules.Events', 'Events'],
      description: [
        'FABRICATE.Admin.Manager.Environment.Rules.EventsDescription',
        'Choose how matching events are applied after a gathering roll.',
      ],
      limit: 'eventLimit',
      options: [
        [
          'highestRankedDrop',
          'FABRICATE.Admin.Manager.Environment.Rules.EventHighestRankedDrop',
          'Highest ranked triggered event',
        ],
        [
          'allDrops',
          'FABRICATE.Admin.Manager.Environment.Rules.EventAllDrops',
          'All triggered events',
        ],
        [
          'limitedDrops',
          'FABRICATE.Admin.Manager.Environment.Rules.EventLimitedDrops',
          'Limit triggered events',
        ],
      ],
    },
    {
      field: 'eventPolicy',
      id: 'manager-gathering-rule-outcome',
      icon: 'fa-scale-balanced',
      title: ['FABRICATE.Admin.Manager.Environment.Rules.EventOutcome', 'Event outcome'],
      description: [
        'FABRICATE.Admin.Manager.Environment.Rules.EventOutcomeDescription',
        'Decide whether rolling an event still allows the gathering attempt to succeed.',
      ],
      options: [
        [
          'successWithEvent',
          'FABRICATE.Admin.Manager.Environment.Rules.GatheringSucceeds',
          'Gathering succeeds',
        ],
        [
          'failureWithEvent',
          'FABRICATE.Admin.Manager.Environment.Rules.GatheringFails',
          'Gathering fails',
        ],
      ],
    },
    {
      field: 'eventVisibility',
      id: 'manager-gathering-rule-event-visibility',
      icon: 'fa-eye',
      fallback: 'encounterChance',
      title: ['FABRICATE.Admin.Manager.Environment.Rules.EventVisibility', 'Event visibility'],
      description: [
        'FABRICATE.Admin.Manager.Environment.Rules.EventVisibilityDescription',
        'Control how much event information players see.',
      ],
      options: [
        [
          'dangerLevelOnly',
          'FABRICATE.Admin.Manager.Environment.Rules.EventVisibilityDangerOnly',
          'Danger level only',
        ],
        [
          'encounterChance',
          'FABRICATE.Admin.Manager.Environment.Rules.EventVisibilityEncounter',
          'Encounter chance',
        ],
        ['full', 'FABRICATE.Admin.Manager.Environment.Rules.EventVisibilityFull', 'Full details'],
      ],
    },
    {
      field: 'toolBreakagePolicy',
      id: 'manager-gathering-rule-tool-breakage',
      icon: 'fa-screwdriver-wrench',
      fallback: 'failureOnBreak',
      title: [
        'FABRICATE.Admin.Manager.Environment.Rules.ToolBreakageOutcome',
        'Tool breakage outcome',
      ],
      description: [
        'FABRICATE.Admin.Manager.Environment.Rules.ToolBreakageDescription',
        'Decide whether a broken tool fails the gathering attempt or only reports the breakage.',
      ],
      options: [
        [
          'failureOnBreak',
          'FABRICATE.Admin.Manager.Environment.Rules.ToolFailureOnBreak',
          'Attempt fails on break',
        ],
        [
          'successDespiteBreak',
          'FABRICATE.Admin.Manager.Environment.Rules.ToolSuccessDespiteBreak',
          'Attempt succeeds despite break',
        ],
      ],
    },
    {
      field: 'biomeModifierAggregation',
      id: 'manager-gathering-rule-biome-aggregation',
      icon: 'fa-mountain-sun',
      fallback: 'strongestOfEach',
      title: ['FABRICATE.Admin.Manager.Environment.Rules.BiomeModifiers', 'Biome modifiers'],
      description: [
        'FABRICATE.Admin.Manager.Environment.Rules.BiomeModifiersDescription',
        'Decide how multiple matching biome modifiers combine into one drop-rate adjustment.',
      ],
      options: [
        [
          'strongestOfEach',
          'FABRICATE.Admin.Manager.Environment.Rules.BiomeAggregationStrongestOfEach',
          'Strongest of each',
        ],
        [
          'cumulative',
          'FABRICATE.Admin.Manager.Environment.Rules.BiomeAggregationCumulative',
          'Cumulative',
        ],
        [
          'dominant',
          'FABRICATE.Admin.Manager.Environment.Rules.BiomeAggregationDominant',
          'Dominant biome',
        ],
      ],
    },
    {
      field: 'blindCandidateGate',
      id: 'manager-gathering-rule-blind-gate',
      icon: 'fa-eye-slash',
      fallback: 'attemptableOnly',
      title: [
        'FABRICATE.Admin.Manager.Environment.Rules.BlindCandidateGate',
        'Blind candidate gate',
      ],
      description: [
        'FABRICATE.Admin.Manager.Environment.Rules.BlindCandidateGateDescription',
        'In blind mode, choose whether the generic gather only resolves to tasks the character can attempt, or to any matching task.',
      ],
      options: [
        [
          'attemptableOnly',
          'FABRICATE.Admin.Manager.Environment.Rules.BlindGateAttemptableOnly',
          'Only attemptable tasks',
        ],
        [
          'allMatching',
          'FABRICATE.Admin.Manager.Environment.Rules.BlindGateAllMatching',
          'Any matching task',
        ],
      ],
    },
    {
      field: 'revealPolicy',
      id: 'manager-gathering-rule-reveal-policy',
      icon: 'fa-wand-sparkles',
      fallback: 'never',
      title: ['FABRICATE.Admin.Manager.Environment.Rules.RevealPolicy', 'Blind reveal'],
      description: [
        'FABRICATE.Admin.Manager.Environment.Rules.RevealPolicyDescription',
        'Decide whether a blind task is revealed to the player after they attempt it.',
      ],
      options: [
        ['never', 'FABRICATE.Admin.Manager.Environment.Rules.RevealNever', 'Never reveal'],
        [
          'onSuccess',
          'FABRICATE.Admin.Manager.Environment.Rules.RevealOnSuccess',
          'Reveal on success',
        ],
        [
          'onAttempt',
          'FABRICATE.Admin.Manager.Environment.Rules.RevealOnAttempt',
          'Reveal on any attempt',
        ],
      ],
    },
    {
      field: 'revealScope',
      id: 'manager-gathering-rule-reveal-scope',
      icon: 'fa-users-viewfinder',
      fallback: 'actor',
      title: ['FABRICATE.Admin.Manager.Environment.Rules.RevealScope', 'Reveal scope'],
      description: [
        'FABRICATE.Admin.Manager.Environment.Rules.RevealScopeDescription',
        'Who learns the revealed task: just the actor, the controlling user, the party, or everyone.',
      ],
      options: [
        ['actor', 'FABRICATE.Admin.Manager.Environment.Rules.RevealScopeActor', 'Actor'],
        ['user', 'FABRICATE.Admin.Manager.Environment.Rules.RevealScopeUser', 'User'],
        ['party', 'FABRICATE.Admin.Manager.Environment.Rules.RevealScopeParty', 'Party'],
        ['global', 'FABRICATE.Admin.Manager.Environment.Rules.RevealScopeGlobal', 'Everyone'],
      ],
    },
  ].map((rule) => ({
    ...rule,
    title: text(...rule.title),
    description: text(...rule.description),
    options: rule.options.map(([value, key, fallback]) => ({ value, label: text(key, fallback) })),
  }));
</script>

<InspectorCard class="manager-gathering-rules-card" data-gathering-inspector-rules="">
  <div class="manager-inspector-title-row">
    <span class="manager-inspector-icon" aria-hidden="true">
      <i class="fas fa-scale-balanced"></i>
    </span>
    <div class="manager-inspector-copy">
      <p class="manager-kicker">
        {text('FABRICATE.Admin.Manager.Environment.Rules.Kicker', 'Gathering rules')}
      </p>
      <h2 class="manager-inspector-name">
        {text('FABRICATE.Admin.Manager.Environment.Rules.Title', 'Rules')}
      </h2>
    </div>
  </div>

  <div class="fab-stack" data-gap="2">
    {#each RULES as rule (rule.field)}
      {@const value = rules[rule.field] ?? rule.fallback ?? null}
      <div class="manager-rule-row">
        <span class="manager-rule-icon" aria-hidden="true"><i class={`fas ${rule.icon}`}></i></span>
        <!-- The caption's click focuses its trigger, a pointer convenience; the trigger is the keyboard path. -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="manager-rule-copy"
          id={`${rule.id}-caption`}
          onclick={() => document.getElementById(rule.id)?.focus()}
        >
          <strong>{rule.title}</strong>
          <span>{rule.description}</span>
        </div>
        <div class="manager-rule-field">
          <Select
            id={rule.id}
            {value}
            options={rule.options}
            triggerTitle={rule.options.find((option) => option.value === value)?.label ?? ''}
            ariaLabelledBy={`${rule.id}-caption`}
            onChange={(next) => onUpdate({ [rule.field]: next })}
          />
        </div>
      </div>
      {#if rule.limit && rules[rule.field] === 'limitedDrops'}
        <GatheringRuleLimitStepper
          rule={rule.limit}
          value={rules[rule.limit]}
          onChange={(next) => onUpdate({ [rule.limit]: next })}
        />
      {/if}
    {/each}
  </div>
</InspectorCard>
