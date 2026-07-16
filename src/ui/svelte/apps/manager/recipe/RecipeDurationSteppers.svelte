<!-- Svelte 5 runes mode -->
<!--
  Always-visible inline duration editor: a row of five unit columns
  (Year / Month / Day / Hour / Minute), each an up-chevron / big mono value /
  down-chevron built on the shared Stepper, plus an optional compact mono label
  pill ("2 hr", "30 min", "1 day", "Instant"). Used by the Overview tab's Duration
  card (single-step) and each multi-step step card — the popover is no longer the
  sole path to editing a duration (issue 643 §10).

  Editing emits `onChange(nextTimeRequirement | null)` — `null` when every field is
  0, so an all-zero duration clears rather than persisting empty fields.

  Props:
    timeRequirement — `{ minutes, hours, days, months, years }` or null
    disabled        — disables every stepper
    showLabel       — render the compact mono label pill (default true)
    onChange(next)  — called with the normalized requirement or null
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import {
    TIME_UNITS,
    durationUnitLabelSingular,
    formatTimeRequirementCompact
  } from '../../../util/recipeDuration.js';
  import Stepper from '../../../components/Stepper.svelte';

  let {
    timeRequirement = null,
    disabled = false,
    showLabel = true,
    onChange = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function unitValue(unit) {
    return Math.max(0, Number(timeRequirement?.[unit] || 0) || 0);
  }

  const compactLabel = $derived(formatTimeRequirementCompact(timeRequirement));

  // Rebuild the requirement from one edited unit, collapsing an all-zero result to
  // null so the duration clears rather than persisting empty fields.
  function setUnit(unit, raw) {
    const value = Math.max(0, Number(raw) || 0);
    const next = {
      minutes: unitValue('minutes'),
      hours: unitValue('hours'),
      days: unitValue('days'),
      months: unitValue('months'),
      years: unitValue('years'),
      [unit]: value
    };
    const total = next.minutes + next.hours + next.days + next.months + next.years;
    onChange(total > 0 ? next : null);
  }
</script>

<div class="manager-recipe-duration-steppers" data-recipe-duration-steppers>
  {#if showLabel}
    <span class="manager-recipe-duration-label" data-recipe-duration-label>{compactLabel}</span>
  {/if}
  <div class="manager-recipe-duration-columns">
    {#each TIME_UNITS as unit (unit)}
      {@const unitLabel = durationUnitLabelSingular(unit)}
      <div class="manager-recipe-duration-column" data-recipe-duration-unit={unit}>
        <span class="manager-recipe-duration-column-label">{unitLabel}</span>
        <Stepper
          value={unitValue(unit)}
          min={0}
          {disabled}
          orientation="vertical"
          ariaLabel={unitLabel}
          decrementLabel={`${text('FABRICATE.Admin.Manager.Recipe.DurationDecrease', 'Decrease')} ${unitLabel}`}
          incrementLabel={`${text('FABRICATE.Admin.Manager.Recipe.DurationIncrease', 'Increase')} ${unitLabel}`}
          onChange={(next) => setUnit(unit, next)}
        />
      </div>
    {/each}
  </div>
</div>
