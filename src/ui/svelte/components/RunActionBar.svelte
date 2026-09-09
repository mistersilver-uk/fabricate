<!-- Svelte 5 runes mode -->
<script>
  import SegmentedControl from '../apps/manager/SegmentedControl.svelte';
  import IconButton from './IconButton.svelte';
  import ManagerButton from './ManagerButton.svelte';

  let {
    run = {},
    runLabel = '',
    primary,
    pause = {},
    resume = {},
    cancel = {},
    completion = false,
    onPrimary = () => {},
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

  function confirmCancel() {
    onCancel();
    armed = false;
  }
</script>

<div class="fab-run-action-bar" data-run-action-bar aria-busy={busy || undefined}>
  {#if armed}
    <div class="fab-run-cancel-decision" data-run-cancel-decision>
      {#if cancel.prompt}<span class="fab-run-cancel-prompt">{cancel.prompt}</span>{/if}
      <ManagerButton
        role="danger"
        class="fab-run-action-control"
        data-run-action="cancel-confirm"
        title={cancel.confirmTitle || undefined}
        onclick={confirmCancel}
      >
        <i class={cancel.icon || 'fas fa-ban'} aria-hidden="true"></i>
        {cancel.confirmLabel}
      </ManagerButton>
      <ManagerButton
        class="fab-run-action-control"
        data-run-action="cancel-keep"
        aria-label={cancel.keepAriaLabel || undefined}
        onclick={() => (armed = false)}>{cancel.keepLabel}</ManagerButton
      >
    </div>
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
</div>

<style>
  .fab-run-action-bar,
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

  .fab-run-cancel-prompt {
    color: var(--fab-text-subtle);
    font-size: 10.5px;
  }

  @media (prefers-reduced-motion: reduce) {
    .fab-run-action-bar :global(*) {
      transition: none;
    }
  }
</style>
