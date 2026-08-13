<!-- Svelte 5 runes mode -->
<!--
  The manager's ONE bulk-delete card (issue 1132): the heading, the impact statement, the
  standing hint and the armed control that every studio's set delete renders.

  It is the extraction `ComponentBulkEditPanel`'s own `<style>` block names as "the honest
  extraction" and defers. Two copies had already diverged — the Essence Studio renders its
  three impact rows unconditionally while the Component Studio gates the zero ones, and only
  one of the two associates the list with the control or announces the arm — so a hand-built
  third copy would have been three independent implementations of zero-row gating, the
  description association, the live region, the label-in-name rule and the busy state.

  It lives under `apps/manager/` rather than in either studio's folder, beside
  `BulkEditPanelShell`, for that file's reason: `--fab-mv2-*` is declared on
  `.fabricate-manager` and staying here keeps it in scope. Two consequences of that placement
  are load-bearing and both are hand-maintained mirrors:

   - `scripts/lib/viewLabCases.js` must CLAIM this file, or `view-lab-source-coverage.test.js`
     fails: a component a mounted window renders that no case claims does not produce no
     evidence, it produces someone else's frame presented as evidence of this change;
   - `scripts/ui-pr-screenshot-evidence.mjs` enumerates the shell's siblings BY NAME, since a
     file directly under `apps/manager/` falls through both studios' directory globs.

  ── THE SCOPED CSS BELOW IS THE POINT OF THE MOVE, NOT A DETAIL ───────────────────
  Svelte scoping is PER COMPONENT. The moment this `<section>` renders from here, the callers'
  `.manager-essence-bulk-delete :global(.manager-button)` and `.manager-*-bulk-impact` rules
  stop matching — they are compiled against a scope hash this markup does not carry. Dropping
  them rather than moving them re-ships the issue 1036 defect in every studio at once: the
  danger button reverts from 34px/0.72rem/700 to the app's body size, and the impact list
  loses its indent, its colour and its weight. Nothing in a source review sees that.

  So both rules moved HERE, under one shared `.fab-bulk-delete-card` root, and the per-studio
  `manager-essence-bulk-delete` / `manager-component-bulk-delete` classes are retired rather
  than kept as dead selectors. They are NOT in `styles/fabricate.css`: a global rule re-routes
  every future edit to the broad `theme-or-global-ui` recipe in
  `scripts/ui-pr-screenshot-evidence.mjs`, which is the exact outcome the block comment at the
  top of every scoped `<style>` in this directory exists to prevent.

  ── THE CARVE-OUT IS THE PAIR, NOT THE BUTTON ─────────────────────────────────────
  `AGENTS.md` reserves `services.confirmDialog` for bulk actions EXCEPT where the panel states
  the impact of the pending action in view before the control is armed. This card is what makes
  that true, so it arms. Do not substitute a `confirmDialog`, and do not render this card with
  an empty `rows` — an arm with no statement is outside the carve-out entirely.

  Props:
   - heading: the card title, already localized.
   - rows: `Array<{ key, text, count? }>` — the impact statement, in order. `key` is the row's
     machine-readable identity and becomes the VALUE of the per-row hook (see `rowAttr`);
     `text` is already localized and already pluralized by the caller.
     ZERO ROWS DO NOT RENDER, EXCEPT THE SUBJECT ROW. Row 1 is the count of things being
     deleted and always renders: it is the statement of what the button does, and a card that
     states nothing has lost the pairing the arm depends on. Rows 2..n are consequence rows and
     are omitted when their `count` is 0, because "0 recipes will be rewritten." is noise on
     the commonest selection there is and it buries the one number that always matters. A row
     with no `count` at all always renders, so a caller that has already filtered its own zeros
     needs no change. The gate is HERE and not in the callers precisely so the three studios
     cannot disagree about it.
   - standingHint: an OPTIONAL always-rendered sentence for a consequence that is a PROPERTY
     rather than a count — irreversibility, say — which no row can carry because it has no
     number. It is also what stops the card degrading to a bare heading and an arm when every
     consequence row is gated away. It is NOT added to `aria-describedby`: that points at the
     impact list alone, and the hint's content belongs in the control's own accessible name,
     where the caller puts it.
   - idleLabel / armedLabel / busyLabel: the control's three visible faces.
   - idleAriaLabel / armedAriaLabel: consequence sentences. Each MUST CONTAIN its face's
     visible label (WCAG 2.5.3 Label in Name) — a speech-input user says what they can read, so
     "Confirm deleting 3 …" is unactivatable beside a button reading "Confirm delete". The busy
     face needs no third string: its accessible name IS its visible label.
   - armedAnnouncement: what the live region says once armed.
   - token: the arm token, and the STEM OF BOTH GENERATED IDS. One component now renders in
     three panels and a manager view can hold more than one at a time, so hardcoding
     `id="bulk-delete-impact"` would collide the moment it does.
   - armed / busy / disabled: `busy` is the caller's OWN in-flight flag and must never be
     derived from `armed`; see the note in `ArmedDangerButton.svelte` for the blur race that
     makes an `armed`-derived busy face silently wrong in a browser and silently right in
     happy-dom.
   - cardAttr / impactAttr / rowAttr / announceAttr: the four test and screenshot hook names,
     defaulted to nothing so a caller that omits one emits no attribute rather than a wrong
     one. Same override idiom `BulkEditPanelShell` uses for `panelAttr` / `clearAttr`.
   - onArm(token) / onDisarm(token) / onConfirm(token).
-->
<script>
  import ArmedDangerButton from './ArmedDangerButton.svelte';

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
  // document-global references, so two cards mounted at once with fixed ids would have the
  // second card's button describing the first card's list. Non-id characters are folded to
  // `-` so a token can never produce a selector that fails to parse.
  const idStem = $derived(String(token || 'bulk-delete').replace(/[^a-zA-Z0-9_-]/g, '-'));
  const impactId = $derived(`${idStem}-impact`);
  const announceId = $derived(`${idStem}-announce`);

  const declaredRows = $derived(
    (Array.isArray(rows) ? rows : []).filter((row) => row && typeof row.key === 'string' && row.key)
  );
  // Index 0 is the SUBJECT row and is exempt. Without the exemption a fully stale selection —
  // every consequence zero — renders a heading, no rows, and a disabled button with nothing
  // on screen explaining why, on any studio that carries no `standingHint`.
  const visibleRows = $derived(
    declaredRows.filter(
      (row, index) => index === 0 || row.count === undefined || Number(row.count) > 0
    )
  );

  // Cleared while busy as well as while idle. The armed sentence says "activate again to
  // delete", which is no longer true once the write has started; emptying is also what makes a
  // RE-arm announce at all, since a live region re-inserting identical text says nothing.
  const announcement = $derived(busy === true || armed !== true ? '' : armedAnnouncement);

  // Spread, following `BulkEditPanelShell`'s hook idiom: the attribute NAME is a parameter, so
  // it cannot be written literally in the markup. The value is `''`, not `true` — Svelte
  // serializes `true` as `="true"` and these hooks shipped as BARE attributes.
  const hook = (name, value = '') => (name ? { [name]: value } : {});
  const cardHook = $derived(hook(cardAttr));
  const impactHook = $derived(hook(impactAttr));
  const announceHook = $derived(hook(announceAttr));
  // The per-row hook is VALUED, not bare: `data-essence-bulk-impact-row="components"` is
  // queried BY KEY in four suites, so a `rows: string[]` prop could not have emitted it.
  const rowHook = (key) => hook(rowAttr, key);
</script>

<section class="manager-inspector-card fab-bulk-delete-card" {...cardHook}>
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
       is what makes a screen-reader user hear the consequence when they arrive at the control,
       rather than only if they happened to read the list on the way past. -->
  <ArmedDangerButton
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
    {onArm}
    {onDisarm}
    {onConfirm}
  />

  <!-- Arming changes the button's label and its accessible name WHILE IT HOLDS FOCUS, and a
       name change under focus is not reliably announced. So the state change is announced in
       its own polite region instead — rendered empty on mount and OUTSIDE the control, because
       a region inserted into the DOM together with its text is not announced by most screen
       readers, and a region inside a control whose own name is changing is unreliable. -->
  <p id={announceId} class="visually-hidden" aria-live="polite" {...announceHook}>
    {announcement}
  </p>
</section>

<style>
  /* Manager-scoped by PLACEMENT — this component lives under `apps/manager/`, so
     `--fab-mv2-*` (declared on `.fabricate-manager`) is in scope. Its appearance lives HERE
     rather than in `styles/fabricate.css` so `VIEW_RECIPES` in
     `scripts/ui-pr-screenshot-evidence.mjs` routes a change to the studios that actually
     render it instead of matching the broad `theme-or-global-ui` recipe.

     `display: flex; flex-direction: column; gap: var(--fab-space-2)` is deliberately NOT
     restated. Both retired per-studio blocks declared it, and it is a verbatim duplicate of
     `.fabricate-manager .manager-inspector-card` in `styles/fabricate.css`, which this card
     still carries. */

  /* The card is the first thing under `BulkEditPanelShell`'s sticky Apply dock, and the dock's
     `margin-bottom: calc(-1 * var(--fab-space-3))` consumes the inspector's own
     `gap: var(--fab-space-3)` exactly — measured, the dock's border-box bottom and this card's
     top land on the same y coordinate, so the card's border meets the dock's `border-top`
     hairline across an opaque strip. Margins do not collapse in that flex column, so the gap is
     restored here as the same token the rail's gap uses, and the two cannot drift apart. */
  .fab-bulk-delete-card {
    margin-top: var(--fab-space-3);
  }

  /* The armed danger button reads at the shared inspector-action label size (issue 1036,
     maintainer round). `ArmedDangerButton` renders a bare `.manager-button`, which carries no
     font-size of its own and so inherited the app's body size — visibly chunkier than every
     other right-rail control, `InspectorActionButton`'s `.fab-inspector-action` (0.72rem)
     included. Scoped to this card, so the row-level `ArmedDangerButton` uses elsewhere in the
     manager are untouched, and the danger/armed colour treatment from `styles/fabricate.css` is
     untouched too — only the type scale changes.

     It must also hold for the BUSY face, which no frame had ever shown before this card
     existed: a face that missed this rule would re-type the button mid-write. */
  .fab-bulk-delete-card :global(.manager-button) {
    min-height: 34px;
    padding: 0 var(--fab-space-3);
    font-size: 0.72rem;
    font-weight: 700;
  }

  /* WEIGHT, not size. This is the sentence the GM is asked to act on and it sits under a
     louder warning `Callout`; at the muted tone it was the quietest thing on a destructive
     card. It keeps the small type — the card is a rail, not a dialog — and gains the secondary
     text colour and a heavier face so it reads as a statement rather than a footnote. */
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

  /* The standing hint is a PROPERTY of the action rather than one of its counts, so it is
     deliberately quieter than the numbered rows and carries no list marker or indent: it must
     not read as a fourth thing being counted. */
  .fab-bulk-delete-hint {
    margin: 0;
    color: var(--fab-mv2-text-muted);
    font-size: 0.66rem;
    font-weight: 600;
    line-height: 1.35;
  }
</style>
