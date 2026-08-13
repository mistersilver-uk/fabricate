<!-- Svelte 5 runes mode -->
<!--
  Inline two-step confirmation for a high-frequency destructive ROW action (issue
  785). The first click arms the button; the second executes. It exists alongside
  `services.confirmDialog` (kept for the heavyweight cases) and alongside
  VocabularyPanel's expanding confirm strip, which is a different idiom by design:
  that one carries a reference-count sentence no two-word button label can hold.

  Contract notes that are NOT cosmetic:

  - It is a real `<button type="button">`. The reference prototype used a bare
    `<span>` with an inline click attribute, which is neither focusable nor
    keyboard-operable and MUST NOT be copied.
  - The caller keys the armed token on the TARGET DOCUMENT ID, never a row index.
    The Knowledge surface re-projects its rows asynchronously from actor/item
    hooks, so an index-keyed token is a destructive-misfire bug: arm row 2, let
    another client delete row 0, re-project, and the second click hits a different
    copy.
  - The ICON swaps as well as the label, so the armed state survives greyscale
    (design system "icon + word, always") and does not rest on the danger fill.
  - `aria-label` carries the full consequence sentence in both states.
  - Disarm is the OWNER's job for character/tab/search/publish changes; this
    component only reports the local `Escape` and `blur` disarms plus the confirm.

  Props:
   - token: stable arm token, `<action>:<documentId>`.
   - armed: whether THIS button holds the single armed token (mutual exclusion is
     the owner's invariant — one token exists at a time).
   - idleLabel / armedLabel: button copy per state.
   - idleIcon / armedIcon: Font Awesome classes per state.
   - idleAriaLabel / armedAriaLabel: consequence sentences per state. Each MUST contain
     its state's visible label, because WCAG 2.5.3 Label in Name makes a control whose
     name omits the visible string unactivatable by speech input.
   - describedBy: OPTIONAL id of an element describing the consequence — the bulk panels'
     impact list. Omitted by default, so the row call sites (Knowledge, the browsers)
     render exactly the markup they did before it existed; a bare `aria-describedby=""`
     would point at nothing and is what the `|| undefined` below avoids.
   - disabled: disables both arming and confirming.
   - busy / busyLabel / busyIcon: an OPTIONAL third face for a caller whose confirm starts a
     write it can await. See the note below — this is not a variant of `armed`.
   - showTitle: whether the accessible name is ALSO exposed as a hover `title`. Default true,
     which is right for the ROW call sites: those render a two-word label ("Delete",
     "Confirm?") while the accessible name names the target document, so the tooltip is the
     only place a sighted mouse user reads what the button reaches. `BulkDeleteCard` passes
     `false`, because there the consequence is already on screen as the impact list the
     control is `aria-describedby`-associated with — and the armed names it renders carry the
     "(s)" idiom, which is defensible for an AT-only string and reads as an un-interpolated
     template ("1 recipe(s)") the moment it becomes visible text.
   - onArm(token) / onDisarm(token) / onConfirm(token).

  ── THE BUSY FACE IS NOT DERIVED FROM `armed`, AND THAT IS THE WHOLE POINT ────────
  Without it a caller that awaits its write leaves the GM looking at a disabled, danger-filled
  `Confirm delete` — a control still asking for the click it has already had. The obvious repair,
  reading "armed AND disabled" as "in flight", does not work and fails INVISIBLY:

   - `handleBlur` below disarms on blur, and DISABLING A FOCUSED BUTTON FIRES BLUR in Chromium
     and Firefox. So the moment the caller sets its in-flight flag the control disarms, and an
     `armed`-derived busy face drops straight back to the IDLE label for the whole write —
     "Delete 3 recipes", beside a spinnerless disabled button, while the delete is running;
   - happy-dom does NOT fire that blur, so a mounted assertion passes on behaviour that does
     not hold in a browser.

  Hence `busy` is the caller's own flag, `faceOf` reads it FIRST so it wins over `armed`
  whichever way the disarm race lands, and blur is a no-op while busy so an in-flight write
  cannot clear the owner's arm token underneath itself.

  The busy face carries `data-busy` and `aria-busy` and NO state class. It briefly carried
  `class:is-busy`, which was the only occurrence of that name under `src/` or `styles/` — a
  class implying a treatment that does not exist. `data-busy` is the test hook; if the busy
  face ever needs an appearance of its own, add the rule and the class together.
-->
<script>
  let {
    token = '',
    armed = false,
    idleLabel = '',
    armedLabel = '',
    idleIcon = 'fas fa-trash',
    armedIcon = 'fas fa-triangle-exclamation',
    idleAriaLabel = '',
    armedAriaLabel = '',
    describedBy = '',
    disabled = false,
    busy = false,
    busyLabel = '',
    busyIcon = 'fas fa-spinner fa-spin',
    showTitle = true,
    onArm = () => {},
    onDisarm = () => {},
    onConfirm = () => {},
  } = $props();

  let element = $state(null);

  const inFlight = $derived(busy === true);
  // A guard chain rather than a nested ternary: three faces read as three `if`s, and the
  // SonarCloud quality gate reports a nested conditional as a new code smell.
  function faceOf(busyFace, armedFace, idleFace) {
    if (busy === true) return busyFace;
    if (armed) return armedFace;
    return idleFace;
  }

  const label = $derived(faceOf(busyLabel, armedLabel, idleLabel));
  const icon = $derived(faceOf(busyIcon, armedIcon, idleIcon));
  // The busy face's accessible name is its VISIBLE label, so WCAG 2.5.3 Label in Name holds
  // for it by construction rather than by a fourth string nobody would keep in step.
  const consequence = $derived(faceOf(busyLabel, armedAriaLabel, idleAriaLabel));
  const isInert = $derived(disabled === true || inFlight);

  function handleClick() {
    if (isInert) return;
    if (armed) {
      onConfirm(token);
      return;
    }
    onArm(token);
  }

  // Escape disarms without leaving the control, and is stopped here so it does not
  // also close an ancestor surface the GM did not mean to leave.
  function handleKeydown(event) {
    if (event.key !== 'Escape' || !armed || inFlight) return;
    event.preventDefault();
    event.stopPropagation();
    onDisarm(token);
  }

  function handleBlur() {
    if (inFlight) return;
    if (armed) onDisarm(token);
  }

  /**
   * Put focus back on this control. Exported so a caller can return the keyboard to the
   * button after a write it awaited REFUSED: confirming disables the control, which moves
   * focus to `document.body`, and re-enabling it does not bring focus back.
   */
  export function focus() {
    element?.focus?.();
  }
</script>

<button
  bind:this={element}
  type="button"
  class="manager-button is-danger"
  class:is-armed={armed}
  data-armed={armed ? 'true' : 'false'}
  data-busy={inFlight ? 'true' : 'false'}
  data-arm-token={token}
  aria-label={consequence}
  aria-describedby={describedBy || undefined}
  aria-busy={inFlight ? 'true' : undefined}
  title={showTitle ? consequence : undefined}
  disabled={isInert}
  onclick={handleClick}
  onkeydown={handleKeydown}
  onblur={handleBlur}
>
  <i class={icon} aria-hidden="true"></i>
  <span>{label}</span>
</button>
