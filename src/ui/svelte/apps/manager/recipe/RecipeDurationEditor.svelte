<!-- Svelte 5 runes mode -->
<!--
  Inline duration editor for a crafting step's `timeRequirement`. The trigger
  reads "Add duration" when none is set and the formatted duration (e.g.
  "2 Hour 30 Minute") when set; clicking it opens a small popover with a number
  input per unit (minutes/hours/days/months/years). Editing emits
  `onChange(nextTimeRequirement | null)` — `null` when every field is 0 (clears
  the duration).

  The popover is portaled to the `.fabricate-manager` host so it escapes the
  manager panel's `overflow: hidden`, positioned with the shared icon-picker
  layout helper, and dismissed on outside click / Escape (mirroring
  SearchablePopover).

  Props:
    timeRequirement — `{ minutes, hours, days, months, years }` or null
    disabled        — disables the trigger
    onChange(next)  — called with the normalized requirement or null
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { dismissOnOutsideClick } from '../../../actions/dismissOnOutsideClick.js';
  import { portal } from '../../../actions/portal.js';
  import { computeIconPickerPopoverLayout } from '../../../util/iconPickerPopover.js';
  import { TIME_UNITS, formatTimeRequirement } from '../../../util/recipeDuration.js';

  let { timeRequirement = null, disabled = false, onChange = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  let open = $state(false);
  let pickerRoot = $state(null);
  let popoverRoot = $state(null);
  let triggerButton = $state(null);
  let popoverStyle = $state('');

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
      [unit]: value
    };
    const total = next.minutes + next.hours + next.days + next.months + next.years;
    onChange(total > 0 ? next : null);
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

  function getPopoverHost() {
    if (!pickerRoot || typeof document === 'undefined') return null;
    return pickerRoot.closest('.fabricate-manager');
  }

  function updatePosition() {
    if (!open || !triggerButton || typeof window === 'undefined') return;
    const host = getPopoverHost();
    const hostRect = host?.getBoundingClientRect?.() ?? {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight
    };
    const triggerRect = triggerButton.getBoundingClientRect();
    const layout = computeIconPickerPopoverLayout(
      {
        left: triggerRect.left - hostRect.left,
        right: triggerRect.right - hostRect.left,
        top: triggerRect.top - hostRect.top,
        bottom: triggerRect.bottom - hostRect.top,
        width: triggerRect.width,
        height: triggerRect.height
      },
      {
        width: hostRect.width || window.innerWidth,
        height: hostRect.height || window.innerHeight
      },
      { horizontalAlign: 'left', minWidth: 240, maxWidth: 300 }
    );
    if (!layout) {
      popoverStyle = '';
      return;
    }
    const vertical =
      layout.placement === 'top'
        ? `top: auto; bottom: ${layout.bottom}px;`
        : `top: ${layout.top}px; bottom: auto;`;
    popoverStyle = [
      `left: ${layout.left}px;`,
      'right: auto;',
      `width: ${layout.width}px;`,
      `max-height: ${layout.maxHeight}px;`,
      vertical
    ].join(' ');
  }

  $effect(() => {
    if (!open || typeof window === 'undefined' || typeof document === 'undefined') {
      popoverStyle = '';
      return;
    }
    updatePosition();
    if (typeof window.addEventListener !== 'function') return;
    const handleViewportChange = () => updatePosition();
    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('scroll', handleViewportChange, true);
    };
  });
</script>

<div
  class="manager-recipe-duration"
  bind:this={pickerRoot}
  use:dismissOnOutsideClick={{ enabled: open, onDismiss: close, additionalNodes: () => [popoverRoot] }}
>
  <button
    type="button"
    bind:this={triggerButton}
    class={`manager-chip manager-recipe-duration-trigger ${hasDuration ? '' : 'is-empty'}`}
    data-recipe-duration-trigger
    aria-haspopup="dialog"
    aria-expanded={open}
    {disabled}
    title={triggerLabel}
    aria-label={triggerLabel}
    onclick={toggle}
  >
    <i class="fa-solid fa-clock" aria-hidden="true"></i>
    <span>{triggerLabel}</span>
  </button>

  {#if open}
    <div
      bind:this={popoverRoot}
      class="manager-recipe-duration-popover"
      style={popoverStyle}
      role="dialog"
      tabindex="-1"
      aria-label={text('FABRICATE.Admin.Manager.Recipe.EditDuration', 'Edit duration')}
      use:portal={() => getPopoverHost()}
      onclick={stop}
      onkeydown={(event) => {
        if (event.key === 'Escape') {
          stop(event);
          close();
        }
      }}
    >
      <div class="manager-recipe-duration-grid">
        {#each TIME_UNITS as unit (unit)}
          <label class="manager-field manager-recipe-duration-field">
            <span>{text(`FABRICATE.Admin.Manager.Economy.Unit.${unit}`, unit)}</span>
            <input
              type="number"
              min="0"
              step="1"
              data-recipe-duration
              data-recipe-duration-unit={unit}
              value={unitValue(unit)}
              oninput={(event) => setUnit(unit, event.currentTarget.value)}
            />
          </label>
        {/each}
      </div>
    </div>
  {/if}
</div>
