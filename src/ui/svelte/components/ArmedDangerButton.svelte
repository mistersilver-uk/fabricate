<!--
  Inline two-step confirmation for a high-frequency destructive ROW action: the first click arms the
  button, the second executes. It sits alongside `services.confirmDialog` for the heavyweight cases.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `token` | `<action>:<documentId>` | `''` | The stable arm token. See the invariants: NEVER a row index. |
  | `armed` | boolean | `false` | Whether THIS button holds the single armed token. Mutual exclusion is the owner's invariant. |
  | `idleLabel` / `armedLabel` / `busyLabel` / `idleIcon` / `armedIcon` / `busyIcon` | localized strings / Font Awesome classes | `''` / trash, triangle-exclamation, spinner | Button copy and glyph per face; `idleIcon=""` suppresses the IDLE glyph only. |
  | `idleAriaLabel` / `armedAriaLabel` / `describedBy` | consequence sentences / element id | `''` | Each sentence MUST contain its state's visible label; `describedBy` names an element describing the consequence and is omitted rather than emitted empty. |
  | `disabled` | boolean | `false` | Disables both arming and confirming. |
  | `busy` | boolean | `false` | An optional third face for a caller whose confirm starts a write it can await. Not a variant of `armed` — see the invariants. |
  | `showTitle` | boolean | `true` | Whether the accessible name is ALSO a hover `title`. |

  Callbacks:
  - `onArm(token)` / `onDisarm(token)` / `onConfirm(token)`.

  Exports:
  - `focus()` — puts the keyboard back after an awaited write REFUSED, since confirming disables the
    control, moving focus to `document.body`, and re-enabling does not bring it back.

  Invariants:
  - It is a real `<button type="button">`, and it WRITES THE FAMILY ROOT, `fabricate-button`, FIRST:
    it is a consumer of the `manager-button`
    CSS contract rather than of `ManagerButton.svelte` — a deferral
    `tests/manager-button-source-contract.test.js` pins — and a carrier spelling `manager-button`
    without the root matches nothing in the family. It is shared without being a family root of its
    own, which `openspec/specs/design-system/spec.md` admits.
  - It does NOT emit `data-keyboard-focus`, so it still lets Foundry's Space and arrow bindings fire
    while it holds focus. Adding it is a real behaviour change; its row stays in the formless-button
    ledger until the filed successor lands.
  - THE CALLER KEYS THE ARMED TOKEN ON THE TARGET DOCUMENT ID, NEVER A ROW INDEX, because a surface
    that re-projects rows asynchronously turns an index-keyed token into a destructive misfire: arm
    row 2, let another client delete row 0, re-project, and the second click hits a different copy.
  - THE ICON SWAPS AS WELL AS THE LABEL, so the armed state survives greyscale and does not rest on
    the danger fill; no caller may suppress the ARMED glyph. `aria-label` carries the full
    consequence sentence in both states, each containing that state's visible label, because WCAG
    2.5.3 Label in Name makes a control whose name omits the visible string unactivatable by speech.
  - DISARM IS THE OWNER'S JOB for character/tab/search/publish changes; this component reports only
    the local `Escape` and `blur` disarms plus the confirm.
  - THE BUSY FACE IS NOT DERIVED FROM `armed`, and reading "armed AND disabled" as "in flight" fails
    INVISIBLY: disabling a focused button fires blur in Chromium and Firefox, so the control disarms
    the moment the caller sets its in-flight flag and an `armed`-derived busy face drops back to the
    IDLE label for the whole write — and happy-dom does not fire that blur, so a mounted assertion
    passes on behaviour that does not hold in a browser. Hence `busy` is the caller's own flag,
    `faceOf` reads it FIRST, blur is a no-op while busy, and the busy face carries `data-busy` and
    `aria-busy` and no state class.
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
