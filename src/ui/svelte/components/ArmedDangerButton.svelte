<!--
  Inline two-step confirmation for a high-frequency destructive ROW action. The first click arms
  the button; the second executes. It sits alongside `services.confirmDialog` for the heavyweight
  cases.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `token` | `<action>:<documentId>` | `''` | The stable arm token. See the invariants: NEVER a row index. |
  | `armed` | boolean | `false` | Whether THIS button holds the single armed token. Mutual exclusion is the owner's invariant — one token exists at a time. |
  | `idleLabel` / `armedLabel` / `busyLabel` | localized string | `''` | Button copy per face. |
  | `idleIcon` / `armedIcon` / `busyIcon` | Font Awesome classes | trash / triangle-exclamation / spinner | Glyph per face. `idleIcon=""` suppresses the IDLE glyph only. |
  | `idleAriaLabel` / `armedAriaLabel` | consequence sentence | `''` | Each MUST contain its state's visible label. |
  | `describedBy` | element id | `''` | OPTIONAL id of an element describing the consequence — the bulk panels' impact list. A bare `aria-describedby=""` would point at nothing, which is what the `|| undefined` avoids. |
  | `disabled` | boolean | `false` | Disables both arming and confirming. |
  | `busy` | boolean | `false` | An OPTIONAL third face for a caller whose confirm starts a write it can await. Not a variant of `armed` — see the invariants. |
  | `showTitle` | boolean | `true` | Whether the accessible name is ALSO a hover `title`. Right for the ROW call sites, whose two-word label leaves the tooltip the only place a sighted mouse user reads what the button reaches. |

  Callbacks:
  - `onArm(token)` / `onDisarm(token)` / `onConfirm(token)`.

  Exports:
  - `focus()` — puts the keyboard back on the control after an awaited write REFUSED.

  Invariants:
  - It is a real `<button type="button">`. The reference prototype used a bare `<span>` with an
    inline click attribute, which is neither focusable nor keyboard-operable and MUST NOT be
    copied.
  - It WRITES THE FAMILY ROOT, `fabricate-button`, FIRST in its own class attribute. This
    component is a CONSUMER of the `manager-button` CSS contract and not of `ManagerButton.svelte`
    — a deferral `tests/manager-button-source-contract.test.js` still pins — and the contract is
    rooted at the class the primitive emits, so a carrier spelling `manager-button` without the
    root matches nothing in the family and renders as a bare Foundry `<button>`. It gained no
    root of its own when it moved under `components/`: a component may be shared without being
    the root of a family.
  - It does NOT emit `data-keyboard-focus`, which the two button primitives do, so unlike a
    primitive-rendered danger button this one still lets Foundry's Space and arrow bindings fire
    while it holds focus. Adding it is a real BEHAVIOUR change and is filed as a successor; this
    component's row stays in the formless-button ledger until that successor lands.
  - THE CALLER KEYS THE ARMED TOKEN ON THE TARGET DOCUMENT ID, NEVER A ROW INDEX. The Knowledge
    surface re-projects its rows asynchronously from actor/item hooks, so an index-keyed token is
    a destructive-misfire bug: arm row 2, let another client delete row 0, re-project, and the
    second click hits a different copy.
  - THE ICON SWAPS AS WELL AS THE LABEL, so the armed state survives greyscale and does not rest
    on the danger fill. No caller may suppress the ARMED glyph, which is where that guarantee
    earns its keep; exactly one suppresses the idle one, because its callout already leads with
    that same mark one column to the left.
  - `aria-label` CARRIES THE FULL CONSEQUENCE SENTENCE IN BOTH STATES, and each state's sentence
    must contain that state's visible label: WCAG 2.5.3 Label in Name makes a control whose name
    omits the visible string unactivatable by speech input. The busy face's accessible name IS
    its visible label, so it holds by construction rather than by a fourth string.
  - DISARM IS THE OWNER'S JOB for character/tab/search/publish changes; this component only
    reports the local `Escape` and `blur` disarms plus the confirm.
  - THE BUSY FACE IS NOT DERIVED FROM `armed`, and reading "armed AND disabled" as "in flight"
    fails INVISIBLY. `handleBlur` disarms on blur, and DISABLING A FOCUSED BUTTON FIRES BLUR in
    Chromium and Firefox, so the moment the caller sets its in-flight flag the control disarms and
    an `armed`-derived busy face drops back to the IDLE label for the whole write. happy-dom does
    NOT fire that blur, so a mounted assertion passes on behaviour that does not hold in a
    browser. Hence `busy` is the caller's own flag, `faceOf` reads it FIRST, and blur is a no-op
    while busy so an in-flight write cannot clear the owner's arm token underneath itself.
  - The busy face carries `data-busy` and `aria-busy` and NO state class. `data-busy` is the test
    hook; if it ever needs an appearance of its own, add the rule and the class together.
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

  // A guard chain rather than a nested ternary, which SonarCloud reports as a new code smell.
  function faceOf(busyFace, armedFace, idleFace) {
    if (busy === true) return busyFace;
    if (armed) return armedFace;
    return idleFace;
  }

  const label = $derived(faceOf(busyLabel, armedLabel, idleLabel));
  const icon = $derived(faceOf(busyIcon, armedIcon, idleIcon));
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

  /** Confirming disables the control, moving focus to `document.body`; re-enabling does not
   * bring it back. */
  export function focus() {
    element?.focus?.();
  }
</script>

<button
  bind:this={element}
  type="button"
  class="fabricate-button manager-button is-danger"
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
  {#if icon}<i class={icon} aria-hidden="true"></i>{/if}<span>{label}</span>
</button>
