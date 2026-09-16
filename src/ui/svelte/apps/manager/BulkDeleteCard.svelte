<!--
  The manager's one bulk-delete card (issue 1132): the heading, the impact statement, the standing
  hint and the armed control that every studio's set delete renders.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `heading` / `rows` / `standingHint` | string, `Array<{ key, text, count? }>`, string | `''`, `[]`, `''` | the title; the impact statement in order, already localized and pluralized, with `key` becoming the per-row hook's VALUE; and an always-rendered sentence for a consequence that is a PROPERTY rather than a count. `standingHint` is NOT in `aria-describedby`, which points at the impact list alone. |
  | the three face labels, the two accessible names, and `armedAnnouncement` / `disarmedAnnouncement` / `outcomeAnnouncement` | string | `''` | each accessible name MUST CONTAIN its face's visible label (WCAG 2.5.3 Label in Name). `outcomeAnnouncement` also returns focus to the re-enabled control when focus is on `<body>`, BEFORE the sentence — `util/announceAfterFocus.js`'s rule — and a SUCCESSFUL delete unmounts this card, so its outcome is the caller's toast instead. |
  | `token`, `armed` / `busy` / `disabled`, `onArm` / `onDisarm` / `onConfirm`, and the four `*Attr` hook names | | `false` / `''` | `token` is the arm token and the STEM OF BOTH GENERATED IDS, since a view can hold more than one card; `busy` is the caller's OWN in-flight flag and must never be derived from `armed` — see `ArmedDangerButton.svelte` for the blur race. |

  Invariants:
  - THE CARVE-OUT IS THE PAIR, NOT THE BUTTON. `AGENTS.md` reserves `services.confirmDialog` for
    bulk actions EXCEPT where the panel states the impact in view before the control is armed, so do
    not substitute one and do not render this card with an empty `rows`.
  - ZERO ROWS DO NOT RENDER, EXCEPT THE SUBJECT ROW, which is row 1; rows 2..n are omitted at
    `count` 0, and a row with no `count` always renders. The gate is HERE so the three studios
    cannot disagree. The appearance is scoped below, not in a caller, because Svelte scoping is PER
    COMPONENT; and sitting directly under `apps/manager/` gives it two hand-maintained mirrors, in
    `scripts/lib/viewLabCases.js` and `scripts/ui-pr-screenshot-evidence.mjs`.
-->
<script>
  import ArmedDangerButton from '../../components/ArmedDangerButton.svelte';
  import InspectorCard from '../../components/InspectorCard.svelte';
  import { announceAfterFocusMove } from '../../util/announceAfterFocus.js';

  let {
    heading = '',
    rows = [],
    standingHint = '',
    idleLabel = '',
    armedLabel = '',
    busyLabel = '',
    idleAriaLabel = '',
    armedAriaLabel = '',
    armedAnnouncement = '',
    disarmedAnnouncement = '',
    outcomeAnnouncement = '',
    token = '',
    armed = false,
    busy = false,
    disabled = false,
    cardAttr = '',
    impactAttr = '',
    rowAttr = '',
    announceAttr = '',
    onArm = () => {},
    onDisarm = () => {},
    onConfirm = () => {},
  } = $props();

  // DERIVED, not literal: both references are document-global, so two cards would cross-wire.
  const idStem = $derived(String(token || 'bulk-delete').replace(/[^a-zA-Z0-9_-]/g, '-'));
  const impactId = $derived(`${idStem}-impact`);
  const announceId = $derived(`${idStem}-announce`);

  const declaredRows = $derived(
    (Array.isArray(rows) ? rows : []).filter((row) => row && typeof row.key === 'string' && row.key)
  );
  // Index 0 is exempt, or a fully stale selection renders a heading and no rows at all.
  const visibleRows = $derived(
    declaredRows.filter(
      (row, index) => index === 0 || row.count === undefined || Number(row.count) > 0
    )
  );

  // `$state` driven by an effect rather than `$derived`, because "never armed" and "armed then
  // cancelled" are the same `armed: false, busy: false` pair. `wasArmed` is cleared on the BUSY
  // edge, or a confirm's trailing idle edge reads as a cancellation.
  let announcement = $state('');
  let wasArmed = false;
  let announcedOutcome = '';
  let control = $state(null);

  let announcementTicket = 0;

  function say(next) {
    announcementTicket += 1;
    announcement = next;
  }

  /** Restore focus after an awaited write left the card mounted, ONLY when focus is nowhere (1157);
      returns whether it MOVED, which decides whether the announcement queues behind it. */
  function restoreFocusToControl() {
    if (typeof document === 'undefined') return false;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected !== false) return false;
    control?.focus?.();
    return document.activeElement !== active;
  }

  /** Deferred past this flush: the control is re-enabled in it, and focusing it disabled is a no-op. */
  function speakOutcome(outcome) {
    announcementTicket += 1;
    const ticket = announcementTicket;
    announceAfterFocusMove(restoreFocusToControl, () => {
      if (ticket === announcementTicket) announcement = outcome;
    });
  }

  $effect(() => {
    const outcome = String(outcomeAnnouncement || '');
    if (busy === true) {
      wasArmed = false;
      announcedOutcome = '';
      say('');
      return;
    }
    if (armed === true) {
      wasArmed = true;
      announcedOutcome = '';
      say(armedAnnouncement);
      return;
    }
    if (outcome && outcome !== announcedOutcome) {
      announcedOutcome = outcome;
      wasArmed = false;
      speakOutcome(outcome);
      return;
    }
    if (outcome) return;
    announcedOutcome = '';
    const cancelled = wasArmed === true;
    wasArmed = false;
    say(cancelled ? disarmedAnnouncement : '');
  });

  const hook = (name, value = '') => (name ? { [name]: value } : {});
  const cardHook = $derived(hook(cardAttr));
  const impactHook = $derived(hook(impactAttr));
  const announceHook = $derived(hook(announceAttr));
  const rowHook = (key) => hook(rowAttr, key);
</script>

<InspectorCard class="fab-bulk-delete-card" {...cardHook}>
  <div class="manager-edit-card-heading">
    <h3 class="manager-card-title">{heading}</h3>
  </div>

  <ul id={impactId} class="fab-bulk-delete-impact" {...impactHook}>
    {#each visibleRows as row (row.key)}
      <li {...rowHook(row.key)}>{row.text}</li>
    {/each}
  </ul>

  {#if standingHint}
    <p class="fab-bulk-delete-hint">{standingHint}</p>
  {/if}

  <!-- The impact list is the button's DESCRIPTION, which makes a screen reader speak it. -->
  <!-- `showTitle={false}`: the armed names carry the "(s)" idiom, wrong as visible text. -->
  <ArmedDangerButton
    bind:this={control}
    {token}
    {armed}
    {busy}
    {busyLabel}
    {disabled}
    {idleLabel}
    {armedLabel}
    {idleAriaLabel}
    {armedAriaLabel}
    describedBy={impactId}
    showTitle={false}
    {onArm}
    {onDisarm}
    {onConfirm}
  />

  <!-- Arming changes the accessible name WHILE THE BUTTON HOLDS FOCUS, which is not reliably
       announced, so a polite region says it — empty on mount, and OUTSIDE the control. -->
  <p id={announceId} class="visually-hidden" aria-live="polite" {...announceHook}>
    {announcement}
  </p>
</InspectorCard>

<style>
  /* Theme-root tokens only, per the design-system spec; scoped here so `VIEW_RECIPES` routes. */

  /* The Apply dock above consumes the inspector's gap with a negative margin, and margins do not
     collapse in that flex column. `:global()` AND CHAINED (issue 1427): the class rides the `class`
     prop onto an element this component does not write. */
  :global(.manager-inspector-card.fab-bulk-delete-card) {
    margin-top: var(--fab-space-3);
  }

  /* The armed button reads at the shared inspector-action label size (1036), BUSY face included. */
  :global(.manager-inspector-card.fab-bulk-delete-card .manager-button) {
    min-height: 34px;
    padding: 0 var(--fab-space-3);
    font-size: 0.72rem;
    font-weight: 700;
  }

  .fab-bulk-delete-impact {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    margin: 0;
    padding-left: var(--fab-space-4);
    color: var(--fab-text-secondary);
    font-size: 0.72rem;
    font-weight: 600;
  }

  .fab-bulk-delete-hint {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 0.66rem;
    font-weight: 600;
    line-height: 1.35;
  }
</style>
