<!-- Run actions use caller-owned eligibility and a deliberate two-step cancellation. -->
<script>
  import SegmentedControl from './SegmentedControl.svelte';
  import IconButton from './IconButton.svelte';
  import ManagerButton from './ManagerButton.svelte';

  let {
    run = {},
    runLabel = '',
    primary,
    begin = null,
    pause = {},
    resume = {},
    cancel = {},
    completion = false,
    onPrimary = () => {},
    onBegin = () => {},
    onPause = () => {},
    onResume = () => {},
    onCancel = () => {},
    armed = $bindable(false),
  } = $props();

  let armedRunId = $state('');

  $effect(() => {
    const nextRunId = run?.id ?? '';
    if (armedRunId && armedRunId !== nextRunId) armed = false;
    armedRunId = nextRunId;
  });

  const paused = $derived(run?.paused === true || Boolean(run?.pauseState));
  const busy = $derived(primary?.busy === true || run?.busy === true);
  const primaryEnabled = $derived(primary?.enabled === true && !busy);
  const primaryLabel = $derived(busy ? primary?.busyLabel || primary?.label : primary?.label);
  const pauseEnabled = $derived(pause?.enabled !== false && !busy);
  const beginEnabled = $derived(begin?.enabled === true && !busy);

  function confirmCancel() {
    onCancel();
    armed = false;
  }

  // Arming REPLACES the control row, so a keyboard user was dropped onto `<body>` and a screen
  // reader was told nothing (issue 1648, UX2-7). Focus lands on the NON-destructive default and
  // the pair announces itself as a group; `Escape` disarms, as it does for any confirmation. The
  // handler is on the two BUTTONS rather than on the group: focus is always on one of them while
  // the confirmation is up, and a keydown listener on a non-interactive div is an a11y defect.
  let keepControl = $state(null);
  $effect(() => {
    if (armed) keepControl?.focus?.();
  });
  function disarmOnEscape(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    armed = false;
  }
</script>

<div class="fab-run-action-bar" data-run-action-bar aria-busy={busy || undefined}>
  {#if armed}
    <div
      class="fab-run-cancel-decision"
      data-run-cancel-decision
      role="group"
      aria-label={cancel.confirmLabel}
    >
      <ManagerButton
        role="danger"
        class="fab-run-action-control"
        data-run-action="cancel-confirm"
        onkeydown={disarmOnEscape}
        onclick={confirmCancel}
      >
        <i class={cancel.icon || 'fas fa-ban'} aria-hidden="true"></i>
        {cancel.confirmLabel}
      </ManagerButton>
      <ManagerButton
        class="fab-run-action-control"
        data-run-action="cancel-keep"
        bind:element={keepControl}
        onkeydown={disarmOnEscape}
        onclick={() => (armed = false)}>{cancel.keepLabel}</ManagerButton
      >
    </div>
    <!-- Same shape as the begin side: the prompt is a SIBLING of the decision, rendered after
         it. Inside the decision the sentence wrapped ABOVE the two buttons and left them
         left-aligned under it, which the maintainer rejected on both sides of the bar
         (issue 1648, M16 then M26). -->
    {#if cancel.prompt}
      <p class="fab-run-cancel-prompt" data-run-cancel-prompt>{cancel.prompt}</p>
    {/if}
  {:else}
    <IconButton
      class="fab-run-action-control fab-run-action-cancel"
      ariaLabel={cancel.ariaLabel || runLabel}
      disabled={busy || cancel.disabled === true}
      data-run-action="cancel-arm"
      title={cancel.title || undefined}
      onclick={() => (armed = true)}
    >
      <i class={cancel.icon || 'fas fa-ban'} aria-hidden="true"></i>
    </IconButton>

    {#if paused}
      <ManagerButton
        class="fab-run-action-control is-resume"
        data-run-action="resume"
        aria-label={resume.ariaLabel || undefined}
        title={resume.title || undefined}
        disabled={busy || resume.disabled === true}
        onclick={onResume}
      >
        <i class={resume.icon || 'fas fa-play'} aria-hidden="true"></i>
        {resume.label}
      </ManagerButton>
    {:else}
      <ManagerButton
        class="fab-run-action-control"
        data-run-action="pause"
        aria-label={pause.ariaLabel || undefined}
        title={pause.reason || pause.title || undefined}
        disabled={!pauseEnabled}
        onclick={onPause}
      >
        <i class={pause.icon || 'fas fa-pause'} aria-hidden="true"></i>
        {pause.label}
      </ManagerButton>

      {#if completion}
        <div class="fab-run-action-completion" data-run-completion>
          {#if completion.label}<span class="fab-run-action-kicker">{completion.label}</span>{/if}
          <SegmentedControl
            options={completion.options ?? []}
            value={completion.value}
            onChange={completion.onChange}
            groupName={completion.groupName || `run-completion-${run?.id || 'run'}`}
            ariaLabel={completion.ariaLabel || runLabel}
            dataAttr="data-run-completion-switch"
          />
        </div>
      {/if}

      {#if begin}
        <div class="fab-run-begin-decision" data-run-begin>
          <ManagerButton
            role={beginEnabled ? 'primary' : 'neutral'}
            class="fab-run-action-control fab-run-action-primary"
            data-run-action="begin"
            aria-busy={busy || undefined}
            title={beginEnabled ? begin.prompt : begin.reason || undefined}
            disabled={!beginEnabled}
            onclick={onBegin}
          >
            <i class={begin.icon || 'fas fa-play'} aria-hidden="true"></i>
            {busy ? begin.busyLabel || begin.label : begin.label}
          </ManagerButton>
        </div>
        <!-- The prompt is a SIBLING of the decision, not a child of it. Inside the decision it
             wrapped above the button and left the controls bunched at the left; as its own
             full-width row it reads as a callout under a single line of controls, which is
             where an irreversible act should explain itself (issue 1648, M16). -->
        {#if begin.prompt}
          <p class="fab-run-begin-prompt" data-run-begin-prompt>{begin.prompt}</p>
        {/if}
      {:else}
        <ManagerButton
          role={primaryEnabled ? 'primary' : 'neutral'}
          class="fab-run-action-control fab-run-action-primary"
          data-run-action="primary"
          aria-busy={busy || undefined}
          title={primaryEnabled ? primary?.title : primary?.reason || primary?.title || undefined}
          disabled={!primaryEnabled}
          onclick={onPrimary}
        >
          {#if primary?.icon}<i class={primary.icon} aria-hidden="true"></i>{/if}
          {primaryLabel}
        </ManagerButton>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .fab-run-action-bar,
  .fab-run-begin-decision,
  .fab-run-cancel-decision {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
  }

  .fab-run-action-bar {
    min-width: 0;
  }

  :global(.fab-run-action-control) {
    height: 34px;
    min-height: 34px;
    border-radius: 9px;
    flex: 0 0 auto;
  }

  :global(.fab-run-action-cancel) {
    width: 34px;
  }

  :global(.fab-run-action-control.is-resume) {
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
    color: var(--fab-warning-text);
  }

  :global(.fab-run-action-primary:not(:disabled)) {
    border-color: var(--fab-success-border);
    background: var(--fab-success);
    color: var(--fab-on-accent);
  }

  .fab-run-action-completion {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .fab-run-action-kicker {
    color: var(--fab-text-subtle);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .fab-run-action-completion :global(.manager-segmented) {
    box-sizing: border-box;
    min-height: 34px;
    padding: var(--fab-space-1);
    border-radius: 9px;
  }

  .fab-run-action-completion :global(.manager-segment) {
    box-sizing: border-box;
    min-height: 26px;
    padding-block: 0;
  }

  /* An irreversible control sits at the FAR RIGHT of the single control line: the run's other
     controls read left to right and the irreversible one is the end of that sentence.
     `margin-left: auto` eats the free space rather than a spacer element, so the row still
     collapses correctly when the bar is narrow. Both decisions take it, so beginning and
     cancelling read the same way (issue 1648, M16 and M26). */
  .fab-run-begin-decision,
  .fab-run-cancel-decision {
    margin-left: auto;
  }

  /* A callout UNDER the controls. It carries a long, localizable sentence, so it must never
     participate in sizing the control row — `flex-basis: 100%` puts it on its own line at every
     width, and a translation 1.4x longer cannot push the buttons around. */
  .fab-run-begin-prompt,
  .fab-run-cancel-prompt {
    box-sizing: border-box;
    flex: 1 1 100%;
    margin: 0;
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-1);
    color: var(--fab-text-subtle);
    font-size: 10.5px;
  }

  @media (prefers-reduced-motion: reduce) {
    .fab-run-action-bar :global(*) {
      transition: none;
    }
  }
</style>
