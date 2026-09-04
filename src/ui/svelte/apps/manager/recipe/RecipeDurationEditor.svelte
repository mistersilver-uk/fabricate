<!-- Svelte 5 runes mode -->
<!--
  Inline duration editor for a crafting step's `timeRequirement`. The trigger
  reads "Add duration" when none is set and the formatted duration (e.g.
  "2 Hour 30 Minute") when set; clicking it opens a small popover with a number
  input per unit (minutes/hours/days/months/years). Editing emits
  `onChange(nextTimeRequirement | null)` — `null` when every field is 0 (clears
  the duration).

  The popover is portaled to the nearest Fabricate application root so it escapes the
  manager panel's `overflow: hidden` and positioned with the shared
  `anchoredPopover` action over the icon-picker layout, and dismissed on outside
  click / Escape (mirroring SearchablePopover).

  Props:
    timeRequirement — `{ minutes, hours, days, months, years }` or null
    disabled        — disables the trigger
    onChange(next)  — called with the normalized requirement or null
-->
<script>
  import Chip from '../Chip.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { anchoredPopover, hostRelativePopoverLayout } from '../../../actions/anchoredPopover.js';
  import { dismissOnOutsideClick } from '../../../actions/dismissOnOutsideClick.js';
  import { computeIconPickerPopoverLayout } from '../../../util/iconPickerPopover.js';
  import {
    TIME_UNITS,
    formatTimeRequirement,
    durationUnitLabelSingular,
  } from '../../../util/recipeDuration.js';
  import Stepper from '../../../components/Stepper.svelte';

  const popoverLayout = hostRelativePopoverLayout(computeIconPickerPopoverLayout);

  let { timeRequirement = null, disabled = false, onChange = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  let open = $state(false);
  let pickerRoot = $state(null);
  let popoverRoot = $state(null);
  let triggerButton = $state(null);

  function unitValue(unit) {
    return Math.max(0, Number(timeRequirement?.[unit] || 0) || 0);
  }

  const hasDuration = $derived(!!formatTimeRequirement(timeRequirement));
  const triggerLabel = $derived(
    hasDuration
      ? formatTimeRequirement(timeRequirement)
      : text('FABRICATE.Admin.Manager.Recipe.AddDuration', 'Add duration')
  );

  // Rebuild the requirement from one edited unit, collapsing an all-zero result
  // to null so the duration clears rather than persisting empty fields.
  function setUnit(unit, raw) {
    const value = Math.max(0, Number(raw) || 0);
    const next = {
      minutes: unitValue('minutes'),
      hours: unitValue('hours'),
      days: unitValue('days'),
      months: unitValue('months'),
      years: unitValue('years'),
      [unit]: value,
    };
    const total = next.minutes + next.hours + next.days + next.months + next.years;
    onChange(total > 0 ? next : null);
  }

  // Right-clicking the trigger clears the whole duration (mirrors the recipe-item
  // right-click-to-unlink affordance).
  function clearDuration(event) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled || !hasDuration) return;
    onChange(null);
    close();
  }

  function close() {
    open = false;
  }

  function toggle(event) {
    event.stopPropagation();
    if (disabled) return;
    open = !open;
  }

  function stop(event) {
    event.stopPropagation();
  }
</script>

<div
  class="manager-recipe-duration"
  bind:this={pickerRoot}
  use:dismissOnOutsideClick={{
    enabled: open,
    onDismiss: close,
    additionalNodes: () => [popoverRoot],
  }}
>
  <Chip
    tag="button"
    bind:element={triggerButton}
    icon="fa-solid fa-clock"
    class={`manager-recipe-duration-trigger ${hasDuration ? '' : 'is-empty'}`}
    type="button"
    data-recipe-duration-trigger
    aria-haspopup="dialog"
    aria-expanded={open}
    {disabled}
    title={hasDuration
      ? `${triggerLabel} — ${text('FABRICATE.Admin.Manager.Recipe.DurationClearHint', 'Right-click to clear')}`
      : triggerLabel}
    aria-label={triggerLabel}
    onclick={toggle}
    oncontextmenu={clearDuration}
  >
    <span>{triggerLabel}</span>
  </Chip>

  {#if open}
    <div
      bind:this={popoverRoot}
      class="manager-recipe-duration-popover"
      role="dialog"
      tabindex="-1"
      data-keyboard-focus="true"
      aria-label={text('FABRICATE.Admin.Manager.Recipe.EditDuration', 'Edit duration')}
      use:anchoredPopover={{
        component: 'RecipeDurationEditor',
        trigger: triggerButton,
        layout: popoverLayout,
        // The popover sizes to its content (CSS `width: max-content`); this width band only
        // reserves horizontal room so the left-aligned popover stays clamped inside the host when
        // the trigger sits near the right edge, and `applyWidth: false` keeps the box itself free.
        layoutOptions: () => ({ horizontalAlign: 'left', minWidth: 340, maxWidth: 380 }),
        applyWidth: false,
      }}
      onclick={stop}
      onkeydown={(event) => {
        if (event.key === 'Escape') {
          stop(event);
          close();
        }
      }}
    >
      <!-- Each unit is the shared Stepper: a real, typeable input with the -/+ buttons
           as adjuncts. A click-only stepper would be a keyboard regression. -->
      <div class="manager-recipe-duration-row">
        {#each TIME_UNITS as unit (unit)}
          {@const unitLabel = durationUnitLabelSingular(unit)}
          <div class="manager-recipe-duration-stepper" data-recipe-duration-stepper={unit}>
            <span class="manager-recipe-duration-unit">{unitLabel}</span>
            <div class="manager-recipe-duration-field" data-recipe-duration-unit={unit}>
              <Stepper
                value={unitValue(unit)}
                min={0}
                ariaLabel={unitLabel}
                decrementLabel={`${text('FABRICATE.Admin.Manager.Recipe.DurationDecrease', 'Decrease')} ${unitLabel}`}
                incrementLabel={`${text('FABRICATE.Admin.Manager.Recipe.DurationIncrease', 'Increase')} ${unitLabel}`}
                onChange={(next) => setUnit(unit, next)}
              />
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
