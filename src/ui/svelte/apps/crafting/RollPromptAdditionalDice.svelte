<!--
  The roll prompt's additional-dice control (issue 2008, frame 31): the title, the resource and
  spend line, the shared `Stepper` at the row's end and the one message beneath, framed by the
  shared `<Well>`. A view with no lines (a batch whose rows pay differently) draws the title and
  its message alone.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `view` | `describeAdditionalDice`'s result | none | The prepared lines, message and `disabled`. |
  | `labels` | the view's `labels.additionalDice` | none | Title and the stepper's localized names. |
  | `value` / `limit` | integers | none | The chosen dice and the most that may be bought. |
  | `onChange(value)` | function | no-op | The stepper's clamped value. |
-->
<script>
  import Notice from '../../components/Notice.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import Well from '../../components/Well.svelte';

  let { view, labels, value, limit, onChange = () => {} } = $props();
  const instanceId = $props.id();
  const lineId = `${instanceId}-line`;
  const messageId = `${instanceId}-message`;
</script>

<Well data-roll-prompt-additional-dice-group="">
  <div class="additional-dice">
    <div class="additional-dice-row">
      <div class="additional-dice-text">
        <p class="additional-dice-title" data-roll-prompt-additional-dice-title>{labels.title}</p>
        {#if view.resourceLine}
          <p class="additional-dice-line" id={lineId} data-roll-prompt-additional-dice-line>
            <span data-roll-prompt-additional-dice-resource>{view.resourceLine}</span> ·
            <span data-roll-prompt-additional-dice-spend>{view.spendLine}</span>
          </p>
        {/if}
      </div>
      {#if view.resourceLine}
        <span class="additional-dice-stepper" data-roll-prompt-additional-dice-stepper>
          <Stepper
            density="comfortable"
            min={0}
            max={limit}
            {value}
            disabled={view.disabled}
            ariaLabel={labels.title}
            decrementLabel={labels.decrease}
            incrementLabel={labels.increase}
            inputProps={{
              name: 'additionalDice',
              'data-roll-prompt-additional-dice': '',
              'aria-describedby': view.message ? `${lineId} ${messageId}` : lineId,
            }}
            {onChange}
          />
        </span>
      {/if}
    </div>
    {#if view.message}
      <div id={messageId}>
        <Notice
          tone={view.message.tone}
          title={view.message.text}
          dataAttr="data-roll-prompt-additional-dice-message"
        />
      </div>
    {/if}
  </div>
</Well>

<style>
  .additional-dice {
    display: grid;
    gap: var(--fab-space-2);
  }
  .additional-dice-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
  }
  .additional-dice-text {
    flex: 1 1 auto;
    min-width: 0;
  }
  .additional-dice-stepper {
    display: inline-flex;
    flex: none;
  }
  .additional-dice-title {
    margin: 0;
    color: var(--fab-text);
    font-size: 11.5px;
    font-weight: 600;
    line-height: normal;
  }
  .additional-dice-line {
    margin: var(--fab-space-2xs) 0 0;
    color: var(--fab-text-muted);
    font-size: 10.5px;
    font-weight: 500;
    line-height: normal;
    overflow-wrap: anywhere;
  }
</style>
