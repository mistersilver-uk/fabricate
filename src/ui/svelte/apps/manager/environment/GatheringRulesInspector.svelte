<!-- Svelte 5 runes mode -->
<!--
  The Gathering Rules card: the ten rule selects and the two limit steppers the environments
  screen's settings tab inspects. Named for the aggregate, not the screen (issue 1707).

  `rules` is that aggregate and every control reads one of its fields; `onUpdate(patch)` persists
  one field, and the two steppers appear only under the `limitedDrops` modes.
-->
<script>
  import GatheringRuleLimitStepper from './GatheringRuleLimitStepper.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let { rules = {}, onUpdate = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
</script>

<section
  class="fabricate-card manager-inspector-card manager-gathering-rules-card"
  data-gathering-inspector-rules
>
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
    <div class="manager-rule-row">
      <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-gift"></i></span>
      <label class="manager-rule-copy" for="manager-gathering-rule-rewards">
        <strong>{text('FABRICATE.Admin.Manager.Environment.Rules.Rewards', 'Rewards')}</strong>
        <span
          >{text(
            'FABRICATE.Admin.Manager.Environment.Rules.RewardsDescription',
            'Choose how rewards are granted.'
          )}</span
        >
      </label>
      <span class="manager-rule-field">
        <select
          id="manager-gathering-rule-rewards"
          value={rules.rewardSelectionMode}
          onchange={(event) => onUpdate({ rewardSelectionMode: event.target.value })}
        >
          <option value="highestRankedDrop"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.HighestRankedDrop',
              'Highest ranked successful drop'
            )}</option
          >
          <option value="allDrops"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.AllDrops',
              'All successful drops'
            )}</option
          >
          <option value="limitedDrops"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.LimitedDrops',
              'Limit successful drops'
            )}</option
          >
        </select>
      </span>
    </div>
    {#if rules.rewardSelectionMode === 'limitedDrops'}
      <GatheringRuleLimitStepper
        rule="rewardLimit"
        value={rules.rewardLimit}
        onChange={(rewardLimit) => onUpdate({ rewardLimit })}
      />
    {/if}

    <div class="manager-rule-row">
      <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-percent"></i></span>
      <label class="manager-rule-copy" for="manager-gathering-rule-drop-modifier-mode">
        <strong
          >{text(
            'FABRICATE.Admin.Manager.Environment.Rules.DropModifierMode',
            'Modifier mode'
          )}</strong
        >
        <span
          >{text(
            'FABRICATE.Admin.Manager.Environment.Rules.DropModifierModeDescription',
            'Choose how all drop and event modifiers (character, weather, time of day, biome) adjust a chance. This applies system-wide and cannot be overridden per modifier.'
          )}</span
        >
      </label>
      <span class="manager-rule-field">
        <select
          id="manager-gathering-rule-drop-modifier-mode"
          value={rules.dropModifierMode ?? 'additive'}
          onchange={(event) => onUpdate({ dropModifierMode: event.target.value })}
        >
          <option value="additive"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.DropModifierModeAdditive',
              'Additive (percentage points)'
            )}</option
          >
          <option value="multiplicative"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.DropModifierModeMultiplicative',
              'Multiplicative (scale by percentage)'
            )}</option
          >
        </select>
      </span>
    </div>

    <div class="manager-rule-row">
      <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-masks-theater"></i></span>
      <label class="manager-rule-copy" for="manager-gathering-rule-events">
        <strong>{text('FABRICATE.Admin.Manager.Environment.Rules.Events', 'Events')}</strong>
        <span
          >{text(
            'FABRICATE.Admin.Manager.Environment.Rules.EventsDescription',
            'Choose how matching events are applied after a gathering roll.'
          )}</span
        >
      </label>
      <span class="manager-rule-field">
        <select
          id="manager-gathering-rule-events"
          value={rules.eventSelectionMode}
          onchange={(event) => onUpdate({ eventSelectionMode: event.target.value })}
        >
          <option value="highestRankedDrop"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.EventHighestRankedDrop',
              'Highest ranked triggered event'
            )}</option
          >
          <option value="allDrops"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.EventAllDrops',
              'All triggered events'
            )}</option
          >
          <option value="limitedDrops"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.EventLimitedDrops',
              'Limit triggered events'
            )}</option
          >
        </select>
      </span>
    </div>
    {#if rules.eventSelectionMode === 'limitedDrops'}
      <GatheringRuleLimitStepper
        rule="eventLimit"
        value={rules.eventLimit}
        onChange={(eventLimit) => onUpdate({ eventLimit })}
      />
    {/if}

    <div class="manager-rule-row">
      <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-scale-balanced"></i></span
      >
      <label class="manager-rule-copy" for="manager-gathering-rule-outcome">
        <strong
          >{text('FABRICATE.Admin.Manager.Environment.Rules.EventOutcome', 'Event outcome')}</strong
        >
        <span
          >{text(
            'FABRICATE.Admin.Manager.Environment.Rules.EventOutcomeDescription',
            'Decide whether rolling an event still allows the gathering attempt to succeed.'
          )}</span
        >
      </label>
      <span class="manager-rule-field">
        <select
          id="manager-gathering-rule-outcome"
          value={rules.eventPolicy}
          onchange={(event) => onUpdate({ eventPolicy: event.target.value })}
        >
          <option value="successWithEvent"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.GatheringSucceeds',
              'Gathering succeeds'
            )}</option
          >
          <option value="failureWithEvent"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.GatheringFails',
              'Gathering fails'
            )}</option
          >
        </select>
      </span>
    </div>

    <div class="manager-rule-row">
      <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-eye"></i></span>
      <label class="manager-rule-copy" for="manager-gathering-rule-event-visibility">
        <strong
          >{text(
            'FABRICATE.Admin.Manager.Environment.Rules.EventVisibility',
            'Event visibility'
          )}</strong
        >
        <span
          >{text(
            'FABRICATE.Admin.Manager.Environment.Rules.EventVisibilityDescription',
            'Control how much event information players see.'
          )}</span
        >
      </label>
      <span class="manager-rule-field">
        <select
          id="manager-gathering-rule-event-visibility"
          value={rules.eventVisibility ?? 'encounterChance'}
          onchange={(event) => onUpdate({ eventVisibility: event.target.value })}
        >
          <option value="dangerLevelOnly"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.EventVisibilityDangerOnly',
              'Danger level only'
            )}</option
          >
          <option value="encounterChance"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.EventVisibilityEncounter',
              'Encounter chance'
            )}</option
          >
          <option value="full"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.EventVisibilityFull',
              'Full details'
            )}</option
          >
        </select>
      </span>
    </div>

    <div class="manager-rule-row">
      <span class="manager-rule-icon" aria-hidden="true"
        ><i class="fas fa-screwdriver-wrench"></i></span
      >
      <label class="manager-rule-copy" for="manager-gathering-rule-tool-breakage">
        <strong
          >{text(
            'FABRICATE.Admin.Manager.Environment.Rules.ToolBreakageOutcome',
            'Tool breakage outcome'
          )}</strong
        >
        <span
          >{text(
            'FABRICATE.Admin.Manager.Environment.Rules.ToolBreakageDescription',
            'Decide whether a broken tool fails the gathering attempt or only reports the breakage.'
          )}</span
        >
      </label>
      <span class="manager-rule-field">
        <select
          id="manager-gathering-rule-tool-breakage"
          value={rules.toolBreakagePolicy ?? 'failureOnBreak'}
          onchange={(event) => onUpdate({ toolBreakagePolicy: event.target.value })}
        >
          <option value="failureOnBreak"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.ToolFailureOnBreak',
              'Attempt fails on break'
            )}</option
          >
          <option value="successDespiteBreak"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.ToolSuccessDespiteBreak',
              'Attempt succeeds despite break'
            )}</option
          >
        </select>
      </span>
    </div>

    <div class="manager-rule-row">
      <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-mountain-sun"></i></span>
      <label class="manager-rule-copy" for="manager-gathering-rule-biome-aggregation">
        <strong
          >{text(
            'FABRICATE.Admin.Manager.Environment.Rules.BiomeModifiers',
            'Biome modifiers'
          )}</strong
        >
        <span
          >{text(
            'FABRICATE.Admin.Manager.Environment.Rules.BiomeModifiersDescription',
            'Decide how multiple matching biome modifiers combine into one drop-rate adjustment.'
          )}</span
        >
      </label>
      <span class="manager-rule-field">
        <select
          id="manager-gathering-rule-biome-aggregation"
          value={rules.biomeModifierAggregation ?? 'strongestOfEach'}
          onchange={(event) =>
            onUpdate({
              biomeModifierAggregation: event.target.value,
            })}
        >
          <option value="strongestOfEach"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.BiomeAggregationStrongestOfEach',
              'Strongest of each'
            )}</option
          >
          <option value="cumulative"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.BiomeAggregationCumulative',
              'Cumulative'
            )}</option
          >
          <option value="dominant"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.BiomeAggregationDominant',
              'Dominant biome'
            )}</option
          >
        </select>
      </span>
    </div>

    <div class="manager-rule-row">
      <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-eye-slash"></i></span>
      <label class="manager-rule-copy" for="manager-gathering-rule-blind-gate">
        <strong
          >{text(
            'FABRICATE.Admin.Manager.Environment.Rules.BlindCandidateGate',
            'Blind candidate gate'
          )}</strong
        >
        <span
          >{text(
            'FABRICATE.Admin.Manager.Environment.Rules.BlindCandidateGateDescription',
            'In blind mode, choose whether the generic gather only resolves to tasks the character can attempt, or to any matching task.'
          )}</span
        >
      </label>
      <span class="manager-rule-field">
        <select
          id="manager-gathering-rule-blind-gate"
          value={rules.blindCandidateGate ?? 'attemptableOnly'}
          onchange={(event) => onUpdate({ blindCandidateGate: event.target.value })}
        >
          <option value="attemptableOnly"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.BlindGateAttemptableOnly',
              'Only attemptable tasks'
            )}</option
          >
          <option value="allMatching"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.BlindGateAllMatching',
              'Any matching task'
            )}</option
          >
        </select>
      </span>
    </div>

    <div class="manager-rule-row">
      <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-wand-sparkles"></i></span>
      <label class="manager-rule-copy" for="manager-gathering-rule-reveal-policy">
        <strong
          >{text('FABRICATE.Admin.Manager.Environment.Rules.RevealPolicy', 'Blind reveal')}</strong
        >
        <span
          >{text(
            'FABRICATE.Admin.Manager.Environment.Rules.RevealPolicyDescription',
            'Decide whether a blind task is revealed to the player after they attempt it.'
          )}</span
        >
      </label>
      <span class="manager-rule-field">
        <select
          id="manager-gathering-rule-reveal-policy"
          value={rules.revealPolicy ?? 'never'}
          onchange={(event) => onUpdate({ revealPolicy: event.target.value })}
        >
          <option value="never"
            >{text('FABRICATE.Admin.Manager.Environment.Rules.RevealNever', 'Never reveal')}</option
          >
          <option value="onSuccess"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.RevealOnSuccess',
              'Reveal on success'
            )}</option
          >
          <option value="onAttempt"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.RevealOnAttempt',
              'Reveal on any attempt'
            )}</option
          >
        </select>
      </span>
    </div>

    <div class="manager-rule-row">
      <span class="manager-rule-icon" aria-hidden="true"
        ><i class="fas fa-users-viewfinder"></i></span
      >
      <label class="manager-rule-copy" for="manager-gathering-rule-reveal-scope">
        <strong
          >{text('FABRICATE.Admin.Manager.Environment.Rules.RevealScope', 'Reveal scope')}</strong
        >
        <span
          >{text(
            'FABRICATE.Admin.Manager.Environment.Rules.RevealScopeDescription',
            'Who learns the revealed task: just the actor, the controlling user, the party, or everyone.'
          )}</span
        >
      </label>
      <span class="manager-rule-field">
        <select
          id="manager-gathering-rule-reveal-scope"
          value={rules.revealScope ?? 'actor'}
          onchange={(event) => onUpdate({ revealScope: event.target.value })}
        >
          <option value="actor"
            >{text('FABRICATE.Admin.Manager.Environment.Rules.RevealScopeActor', 'Actor')}</option
          >
          <option value="user"
            >{text('FABRICATE.Admin.Manager.Environment.Rules.RevealScopeUser', 'User')}</option
          >
          <option value="party"
            >{text('FABRICATE.Admin.Manager.Environment.Rules.RevealScopeParty', 'Party')}</option
          >
          <option value="global"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Rules.RevealScopeGlobal',
              'Everyone'
            )}</option
          >
        </select>
      </span>
    </div>
  </div>
</section>
