<!-- Svelte 5 runes mode -->
<!--
  The manager's one bulk-delete card (issue 1132): the heading, the impact statement, the standing
  hint and the armed control that every studio's set delete renders.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `heading` | string | `''` | the card title, already localized |
  | `rows` | `Array<{ key, text, count? }>` | `[]` | the impact statement, in order; `text` is already localized and pluralized, and `key` becomes the VALUE of the per-row hook |
  | `standingHint` | string | `''` | an always-rendered sentence for a consequence that is a PROPERTY rather than a count |
  | `idleLabel` / `armedLabel` / `busyLabel` | string | | the control's three visible faces |
  | `idleAriaLabel` / `armedAriaLabel` | string | | consequence sentences; each MUST CONTAIN its face's visible label (WCAG 2.5.3 Label in Name) |
  | `armedAnnouncement` | string | | what the live region says once armed |
  | `disarmedAnnouncement` | string | `''` | what it says when an ARMED control is disarmed without confirming; omitted keeps the old silence |
  | `outcomeAnnouncement` | string | `''` | what it says when an awaited write came back and left the control live — a refused or no-op delete |
  | `token` | string | | the arm token, and the STEM OF BOTH GENERATED IDS |
  | `armed` / `busy` / `disabled` | boolean | `false` | `busy` is the caller's OWN in-flight flag and must never be derived from `armed` — see `ArmedDangerButton.svelte` for the blur race |
  | `cardAttr` / `impactAttr` / `rowAttr` / `announceAttr` | string | `''` | the four test and screenshot hook names |

  Callbacks:
  - `onArm(token)` / `onDisarm(token)` / `onConfirm(token)`.

  Invariants:
  - THE CARVE-OUT IS THE PAIR, NOT THE BUTTON. `AGENTS.md` reserves `services.confirmDialog` for
    bulk actions EXCEPT where the panel states the impact in view before the control is armed, so
    do not substitute a `confirmDialog` and do not render this card with an empty `rows`.
  - ZERO ROWS DO NOT RENDER, EXCEPT THE SUBJECT ROW. Row 1 is the count of things being deleted
    and always renders; rows 2..n are omitted when their `count` is 0, and a row with no `count`
    always renders. The gate is HERE so the three studios cannot disagree about it.
  - `standingHint` is NOT added to `aria-describedby`: that points at the impact list alone, and
    the hint's content belongs in the control's own accessible name.
  - `outcomeAnnouncement` also returns focus to the re-enabled control when focus is still on
    `<body>`, BEFORE the sentence is written, because a focus change cancels pending polite
    speech — the shared rule in `util/announceAfterFocus.js`. A SUCCESSFUL delete unmounts this
    card, so its outcome is the caller's toast and the manager-level live region instead.
  - `token` stems both generated ids, because a manager view can hold more than one card at once.
  - Two hand-maintained mirrors follow from this file sitting directly under `apps/manager/`:
    `scripts/lib/viewLabCases.js` must CLAIM it, or `view-lab-source-coverage.test.js` fails; and
    `scripts/ui-pr-screenshot-evidence.mjs` enumerates the shell's siblings BY NAME, since a file
    here falls through both studios' directory globs.
  - The appearance lives in the scoped `<style>` below and not in either caller: Svelte scoping is
    PER COMPONENT, so a caller's `.manager-*-bulk-delete` rule stops matching the moment this
    `<section>` renders from here.
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

  // The two ids are DERIVED, not literals: `aria-describedby` and a live region are both
  // document-global references, so two cards mounted at once with fixed ids would have the second
  // card's button describing the first card's list. Non-id characters fold to `-` so a token can
  // never produce a selector that fails to parse.
  const idStem = $derived(String(token || 'bulk-delete').replace(/[^a-zA-Z0-9_-]/g, '-'));
  const impactId = $derived(`${idStem}-impact`);
  const announceId = $derived(`${idStem}-announce`);

  const declaredRows = $derived(
    (Array.isArray(rows) ? rows : []).filter((row) => row && typeof row.key === 'string' && row.key)
  );
  // Index 0 is the SUBJECT row and is exempt: without the exemption a fully stale selection
  // renders a heading, no rows, and a disabled button with nothing explaining why.
  const visibleRows = $derived(
    declaredRows.filter(
      (row, index) => index === 0 || row.count === undefined || Number(row.count) > 0
    )
  );

  // WHAT THE LIVE REGION SAYS, AND WHEN. Three transitions, and the last two cannot be derived
  // from the props alone because "never armed" and "armed and then cancelled" are the same
  // `armed: false, busy: false` pair — so this is `$state` driven by an effect that watches the
  // transition rather than a `$derived`.
  //
  //  - ARMED: the consequence sentence, cleared while BUSY as well.
  //  - DISARMED WITHOUT CONFIRMING: `disarmedAnnouncement`, if the caller supplies one.
  //  - AN AWAITED WRITE LEFT THE CARD MOUNTED: `outcomeAnnouncement`.
  //
  // `wasArmed` is cleared on the BUSY edge, which is what stops a successful confirm reading as a
  // cancellation: confirm takes the control armed → busy → idle, and the trailing idle edge would
  // otherwise announce a cancellation over a delete that happened.
  //
  // Every path assigns, including the empty string: a region whose text does not change says
  // nothing, so re-arming after a cancellation still speaks.
  let announcement = $state('');
  let wasArmed = false;
  let announcedOutcome = '';
  let control = $state(null);

  // Only the OUTCOME sentence is spoken late, and a sentence still waiting on its timer must
  // never land on top of a transition that has since happened. Every assignment goes through
  // here, and the deferred one only speaks while it is still the most recent thing to say.
  let announcementTicket = 0;

  function say(next) {
    announcementTicket += 1;
    announcement = next;
  }

  /**
   * Restore focus to the control after an awaited write left the card mounted — ONLY when focus
   * is actually nowhere (issue 1157). `<body>` is where the confirm's own `disabled` left it, and
   * it is the only state worth rescuing; anything else is a place the GM chose.
   *
   * @returns {boolean} true only when focus actually moved, which decides whether the
   *   announcement has a focus utterance to queue behind. `ArmedDangerButton` exports `focus()`
   *   and not its element, so the move is observed as a CHANGE OF `activeElement` rather than by
   *   identity.
   */
  function restoreFocusToControl() {
    if (typeof document === 'undefined') return false;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected !== false) return false;
    control?.focus?.();
    return document.activeElement !== active;
  }

  /**
   * Announce an outcome, AFTER the focus restore rather than before it. Both halves are deferred
   * past this flush because the control is re-enabled in the same one and `focus()` on a
   * still-disabled button does nothing; the ORDER between them is the shared rule in
   * `util/announceAfterFocus.js`, since a focus change cancels pending `polite` speech.
   */
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

  // Spread because the attribute NAME is a parameter. The value is `''`, not `true` — Svelte
  // serializes `true` as `="true"` and these hooks shipped as bare attributes.
  const hook = (name, value = '') => (name ? { [name]: value } : {});
  const cardHook = $derived(hook(cardAttr));
  const impactHook = $derived(hook(impactAttr));
  const announceHook = $derived(hook(announceAttr));
  // The per-row hook is VALUED, not bare: it is queried BY KEY in four suites, so a
  // `rows: string[]` prop could not have emitted it.
  const rowHook = (key) => hook(rowAttr, key);
</script>

<InspectorCard class="fab-bulk-delete-card" {...cardHook}>
  <div class="manager-edit-card-heading">
    <h3 class="manager-card-title">{heading}</h3>
  </div>

  <!-- Stated BEFORE the action is armed, and recomputed from the selection because the caller
       re-derives `rows` whenever the selected set changes. -->
  <ul id={impactId} class="fab-bulk-delete-impact" {...impactHook}>
    {#each visibleRows as row (row.key)}
      <li {...rowHook(row.key)}>{row.text}</li>
    {/each}
  </ul>

  {#if standingHint}
    <p class="fab-bulk-delete-hint">{standingHint}</p>
  {/if}

  <!-- The impact list is the button's DESCRIPTION, not merely adjacent to it: `aria-describedby`
       is what makes a screen-reader user hear the consequence when they arrive at the control. -->
  <!-- `showTitle={false}`: the accessible name is not also a hover tooltip here. The armed names
       the three studios pass carry the count-neutral "(s)" idiom, which is defensible for an
       AT-only string and reads as an un-interpolated template the moment it becomes visible text.
       Every count in those names is in the impact list this control is associated with. The ROW
       call sites keep the tooltip. -->
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

  <!-- Arming changes the button's label and its accessible name WHILE IT HOLDS FOCUS, and a name
       change under focus is not reliably announced. The state change is announced in its own
       polite region instead — rendered empty on mount and OUTSIDE the control, because a region
       inserted together with its text is not announced by most screen readers. -->
  <p id={announceId} class="visually-hidden" aria-live="polite" {...announceHook}>
    {announcement}
  </p>
</InspectorCard>

<style>
  /* Theme-root tokens only — design-system spec, *The token namespace is one generation and names
     its purpose*, gated by `tests/token-generation-gate.test.js`. This appearance lives here
     rather than in `styles/fabricate.css` so `VIEW_RECIPES` in
     `scripts/ui-pr-screenshot-evidence.mjs` routes a change to the studios that render it.

     The card's own flex column is deliberately NOT restated: it is a verbatim duplicate of
     `.fabricate-card.manager-inspector-card` in `styles/fabricate.css`, which this card carries. */

  /* The card is the first thing under `BulkEditPanelShell`'s sticky Apply dock, whose negative
     bottom margin consumes the inspector's own gap exactly, so the card's border would meet the
     dock's hairline across an opaque strip. Margins do not collapse in that flex column, so the
     gap is restored here as the same token the rail's gap uses.

     `:global()` AND CHAINED (issue 1427). The card shell is an `<InspectorCard>`, so
     `fab-bulk-delete-card` rides the `class` prop onto an element this component does not write.
     This rule went dead SILENTLY rather than being pruned: a class living only on a component tag
     is normally pruned behind a `css_unused_selector` warning, but this component spreads
     attributes onto three regular elements, and one such spread makes every class selector in the
     block possibly-matching. `ui-integration/spec.md` records the measured matrix. Chained onto
     `.manager-inspector-card` so the selector stays at (0,2,0), where the scoped form put it. */
  :global(.manager-inspector-card.fab-bulk-delete-card) {
    margin-top: var(--fab-space-3);
  }

  /* The armed danger button reads at the shared inspector-action label size (issue 1036).
     `ArmedDangerButton` renders a bare `.manager-button`, which carries no font-size and so
     inherited the app's body size. Scoped to this card, so row-level `ArmedDangerButton` uses
     elsewhere are untouched, and only the type scale changes. It must also hold for the BUSY
     face, which would otherwise re-type the button mid-write.

     WHOLLY `:global()` (issue 1427): the ancestor half stopped matching for the reason above, so
     the whole rule had to move inside it. `.manager-inspector-card` is chained for the
     specificity, leaving this at (0,3,0) exactly as before. */
  :global(.manager-inspector-card.fab-bulk-delete-card .manager-button) {
    min-height: 34px;
    padding: 0 var(--fab-space-3);
    font-size: 0.72rem;
    font-weight: 700;
  }

  /* WEIGHT, not size. This is the sentence the GM is asked to act on and it sits under a louder
     warning `Callout`; it keeps the small type — the card is a rail, not a dialog — and gains the
     secondary ink and a heavier face so it reads as a statement rather than a footnote. */
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

  /* The standing hint is a PROPERTY of the action rather than one of its counts, so it carries no
     list marker or indent: it must not read as a fourth thing being counted. */
  .fab-bulk-delete-hint {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 0.66rem;
    font-weight: 600;
    line-height: 1.35;
  }
</style>
