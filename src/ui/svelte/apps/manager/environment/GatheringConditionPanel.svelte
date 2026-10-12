<!-- Svelte 5 runes mode -->
<!--
  One Gathering Settings condition panel, Times of day or Weather conditions: the matching toggle,
  the current-value select, the add form it owns, and the editable value pills.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `kind` | `'timeOfDay'` \| `'weather'` | required | Which condition every callback names. |
  | `icon` | Font Awesome class | required | The title's glyph. |
  | `setting` | `{ enabled, current, values }` | required | The selected system's condition. |
  | `selectedSystemId` | string | `''` | Every write's system; the caller keys the panel on it. |
  | `services` | manager services or `null` | `null` | The time-of-day bar's world clock. |

  Callbacks:
  - `onUpdateGatheringConditions`, `onToggleGatheringConditionEnabled`,
    `onAddGatheringConditionValue`, `onUpdateGatheringConditionValue` and
    `onDeleteGatheringConditionValue` — the store's writes, forwarded with `kind` and the system.

  Invariants:
  - Times of day only: the time-of-day bar, a start-hour `Stepper` on each pill and on the add
    form, which the bar's rail seeds; the weather add still forwards exactly `{ label, icon }`.
  - The add form's draft is this panel's own, so the caller's `{#key selectedSystemId}` is what
    clears it on a system switch; `tests/components/gathering-condition-panel-characterization.test.js`.
-->
<script>
  import Field from '../../../components/Field.svelte';
  import Button from '../../../components/Button.svelte';
  import IconPicker from '../../../components/IconPicker.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import Select from '../../../components/Select.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import { localizeOr as text } from '../../../util/localizeOr.js';
  import TimeOfDayBar from './TimeOfDayBar.svelte';
  import {
    addStartDefault,
    hourText,
    lastHourOf,
    parseHourText,
    timeOfDayPeriods,
  } from './timeOfDayBandModel.js';

  let {
    kind,
    icon,
    setting,
    selectedSystemId = '',
    services = null,
    onUpdateGatheringConditions = () => {},
    onToggleGatheringConditionEnabled = () => {},
    onAddGatheringConditionValue = () => {},
    onUpdateGatheringConditionValue = () => {},
    onDeleteGatheringConditionValue = () => {},
  } = $props();

  let input = $state('');
  // A panel's kind never changes: the caller keys one instance per kind and system.
  // svelte-ignore state_referenced_locally
  let addIcon = $state(defaultConditionIcon(kind));
  let nameInput = $state(null);
  let components = $state(null);
  /** The add form's start hour once a GM sets or seeds it; `undefined` follows the default. */
  let addStartHour = $state(undefined);

  const isTimeOfDay = $derived(kind === 'timeOfDay');
  const lastHour = $derived(lastHourOf(components));
  const startHours = $derived(
    new Map(timeOfDayPeriods(conditionValues(setting)).map((p) => [p.id, p.startHour]))
  );
  const addDefault = $derived(addStartDefault({ values: conditionValues(setting), components }));
  const addStart = $derived(addStartHour === undefined ? addDefault : addStartHour);
  const startsAtLabels = $derived(
    stepperLabels(text('FABRICATE.Admin.Manager.Environment.Conditions.StartsAt'))
  );

  function seedAdd(hour) {
    addStartHour = hour;
    nameInput?.focus();
  }

  function setStartHour(valueId, startHour) {
    onUpdateGatheringConditionValue?.(kind, valueId, { startHour }, selectedSystemId);
  }

  function conditionTitle(kind) {
    return kind === 'timeOfDay'
      ? text('FABRICATE.Admin.Manager.Environment.Conditions.TimeOfDayTitle', 'Times of day')
      : text('FABRICATE.Admin.Manager.Environment.Conditions.WeatherTitle', 'Weather conditions');
  }

  function conditionCurrentLabel(kind) {
    return kind === 'timeOfDay'
      ? text(
          'FABRICATE.Admin.Manager.Environment.Conditions.CurrentTimeOfDay',
          'Current time of day'
        )
      : text('FABRICATE.Admin.Manager.Environment.Conditions.CurrentWeather', 'Current weather');
  }

  function conditionAddLabel(kind) {
    return kind === 'timeOfDay'
      ? text('FABRICATE.Admin.Manager.Environment.Conditions.AddTimeOfDay', 'Add time of day')
      : text('FABRICATE.Admin.Manager.Environment.Conditions.AddWeather', 'Add weather');
  }

  function conditionHint(kind) {
    return kind === 'timeOfDay'
      ? text(
          'FABRICATE.Admin.Manager.Environment.Conditions.TimeOfDayHint',
          'These values control current time matching for gathering tasks and events. Click the name of a time of day to edit it. Start hours place each one on the day; they never change the current time of day. The line marks the world clock; the dot is the current time of day, which you set by hand.'
        )
      : text(
          'FABRICATE.Admin.Manager.Environment.Conditions.WeatherHint',
          'These values control weather matching for gathering tasks and events. Click the name of a condition to edit it.'
        );
  }

  function conditionInputPlaceholder(kind) {
    return kind === 'timeOfDay'
      ? text('FABRICATE.Admin.Manager.Environment.Conditions.TimeOfDayPlaceholder', 'e.g. Midnight')
      : text('FABRICATE.Admin.Manager.Environment.Conditions.WeatherPlaceholder', 'e.g. Ashfall');
  }

  function submitConditionValue(event, kind) {
    event.preventDefault();
    const value = input.trim();
    if (!value) return;
    onAddGatheringConditionValue?.(
      kind,
      isTimeOfDay
        ? { label: value, icon: addIcon, startHour: addStart }
        : { label: value, icon: addIcon },
      selectedSystemId
    );
    input = '';
    addStartHour = undefined;
  }

  function updateCurrentCondition(kind, value) {
    onUpdateGatheringConditions?.({ [kind]: value, systemId: selectedSystemId });
  }

  function conditionId(option) {
    if (option && typeof option === 'object') return String(option.id || '').trim();
    return String(option || '').trim();
  }

  function conditionLabel(option) {
    if (option && typeof option === 'object') return String(option.label || option.id || '').trim();
    return String(option || '').trim();
  }

  function conditionIcon(option, kind) {
    if (option && typeof option === 'object' && option.icon) return option.icon;
    return defaultConditionIcon(kind);
  }

  function defaultConditionIcon(kind) {
    return kind === 'timeOfDay' ? 'fas fa-clock' : 'fas fa-cloud-sun';
  }

  function conditionValues(setting) {
    return Array.isArray(setting?.values) ? setting.values : [];
  }

  function conditionSelectOptions(setting) {
    return conditionValues(setting).map((option) => ({
      value: conditionId(option),
      label: conditionLabel(option),
    }));
  }

  const instanceId = $props.id();
</script>

<section
  class={`manager-condition-panel ${setting.enabled === false ? 'is-disabled' : ''}`}
  data-gathering-condition-panel={kind}
  aria-label={conditionTitle(kind)}
>
  <header class="manager-condition-panel-header">
    <span class="manager-condition-panel-title">
      <i class={icon} aria-hidden="true"></i>
      <span>{conditionTitle(kind)}</span>
    </span>
    <StatusToggle
      on={setting.enabled !== false}
      label={setting.enabled === false
        ? text('FABRICATE.Admin.Manager.StatusOff', 'Off')
        : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
      ariaLabel={setting.enabled === false
        ? text('FABRICATE.Admin.Manager.Environment.Conditions.EnableMatching', 'Enable matching')
        : text(
            'FABRICATE.Admin.Manager.Environment.Conditions.DisableMatching',
            'Disable matching'
          )}
      onclick={() =>
        onToggleGatheringConditionEnabled?.(kind, setting.enabled === false, selectedSystemId)}
    />
  </header>
  <p class="manager-condition-panel-hint">{conditionHint(kind)}</p>
  {#if isTimeOfDay}
    <TimeOfDayBar
      values={conditionValues(setting)}
      current={setting.current}
      {services}
      bind:components
      onSetStartHour={setStartHour}
      onSetCurrent={(id) => updateCurrentCondition(kind, id)}
      onSeed={seedAdd}
    />
  {/if}

  <!-- A div host: a label would forward a caption click into the trigger. The caption names
       it through its id, and the panel may grow past the form rung's 340px ceiling to
       follow a trigger that fills a one-column card up to the 1120px restack breakpoint
       (issue 1510). -->
  <Field as="div" class="manager-condition-current">
    <span id={`${instanceId}-condition-${kind}`}>{conditionCurrentLabel(kind)}</span>
    <Select
      value={setting.current}
      options={conditionSelectOptions(setting)}
      maxWidth={1120}
      ariaLabelledBy={`${instanceId}-condition-${kind}`}
      onChange={(next) => updateCurrentCondition(kind, next)}
    />
  </Field>

  <form
    class={['manager-condition-add', isTimeOfDay && 'manager-time-of-day-add']}
    onsubmit={(event) => submitConditionValue(event, kind)}
  >
    <IconPicker
      value={addIcon}
      iconOnly={true}
      ariaLabel={text('FABRICATE.Admin.Manager.Environment.Conditions.NewIcon', 'New value icon')}
      onChange={(next) => (addIcon = next)}
    />
    <Field as="label">
      <input
        bind:this={nameInput}
        value={input}
        aria-label={conditionAddLabel(kind)}
        placeholder={conditionInputPlaceholder(kind)}
        oninput={(event) => (input = event.currentTarget.value)}
      />
    </Field>
    {#if isTimeOfDay}
      <Stepper
        value={addStart}
        min={0}
        max={lastHour}
        allowUnset={addDefault === null}
        placeholder="--:--"
        formatValue={hourText}
        parseValue={parseHourText}
        ariaLabel={startsAtLabels.ariaLabel}
        decrementLabel={startsAtLabels.decrementLabel}
        incrementLabel={startsAtLabels.incrementLabel}
        onChange={(next) => (addStartHour = next)}
      />
    {/if}
    <Button
      role="primary"
      type="submit"
      class="manager-add-button"
      data-gathering-condition-add={kind}
      aria-label={conditionAddLabel(kind)}
      title={conditionAddLabel(kind)}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Environment.SettingsAdd', 'Add')}</span>
    </Button>
  </form>

  <div
    class={['manager-condition-pill-list', isTimeOfDay && 'is-time-of-day']}
    aria-label={text('FABRICATE.Admin.Manager.Environment.Conditions.Values', 'Condition values')}
  >
    {#each conditionValues(setting) as option (conditionId(option))}
      {@const valueId = conditionId(option)}
      <span
        class={['manager-condition-pill', isTimeOfDay && 'is-time-of-day']}
        data-gathering-condition-value={valueId}
      >
        <IconPicker
          value={conditionIcon(option, kind)}
          iconOnly={true}
          ariaLabel={text('FABRICATE.Admin.Manager.Environment.Conditions.EditIcon', 'Edit icon')}
          onChange={(nextIcon) =>
            onUpdateGatheringConditionValue?.(kind, valueId, { icon: nextIcon }, selectedSystemId)}
        />
        <input
          class="manager-condition-label-input"
          value={conditionLabel(option)}
          aria-label={text(
            'FABRICATE.Admin.Manager.Environment.Conditions.EditLabel',
            'Edit label'
          )}
          onblur={(event) =>
            onUpdateGatheringConditionValue?.(
              kind,
              valueId,
              { label: event.currentTarget.value },
              selectedSystemId
            )}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        {#if isTimeOfDay}
          {@const hourLabels = stepperLabels(
            text('FABRICATE.Admin.Manager.Environment.Conditions.StartHourOf', undefined, {
              value: conditionLabel(option),
            })
          )}
          <Stepper
            value={startHours.get(valueId) ?? null}
            min={0}
            max={lastHour}
            allowUnset
            placeholder="--:--"
            formatValue={hourText}
            parseValue={parseHourText}
            ariaLabel={hourLabels.ariaLabel}
            decrementLabel={hourLabels.decrementLabel}
            incrementLabel={hourLabels.incrementLabel}
            onChange={(next) => setStartHour(valueId, next)}
          />
        {/if}
        <button
          type="button"
          class="manager-condition-remove"
          data-keyboard-focus="true"
          aria-label={text(
            'FABRICATE.Admin.Manager.Environment.Conditions.RemoveValue',
            'Remove {value}'
          ).replace('{value}', conditionLabel(option))}
          title={text(
            'FABRICATE.Admin.Manager.Environment.Conditions.RemoveValue',
            'Remove {value}'
          ).replace('{value}', conditionLabel(option))}
          disabled={setting.enabled !== false && conditionValues(setting).length <= 1}
          onclick={() => onDeleteGatheringConditionValue?.(kind, valueId, selectedSystemId)}
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </span>
    {/each}
  </div>
</section>
