<!--
  The manager's inline two-step destructive control: the first press arms it and the second
  confirms. It is a caller of `Button` at `role="danger"`; `services.confirmDialog` owns the
  heavyweight cases.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `token` | `<action>:<documentId>` | `''` | The arm token, keyed on the target document id and never a row index, because a surface that re-projects its rows turns an index into a misfire on another record. |
  | `armed` | boolean | `false` | Whether this control holds the owner's single armed token; mutual exclusion is the owner's invariant. |
  | `idleLabel` / `armedLabel` / `busyLabel` / `idleIcon` / `armedIcon` / `busyIcon` | localized strings / Font Awesome classes | `''` / trash, triangle-exclamation, spinner | Copy and glyph per face; `idleIcon=""` drops the idle glyph only, and no caller may suppress the armed glyph. |
  | `idleAriaLabel` / `armedAriaLabel` / `ariaDescribedBy` | consequence sentences / element id | `''` | Each sentence contains its face's visible label (WCAG 2.5.3 Label in Name), and the busy face's name is `busyLabel`; `ariaDescribedBy` is omitted rather than emitted empty. |
  | `disabled` | boolean | `false` | Native, and refuses arming and confirming. Disabling a focused button fires blur in Chromium and Firefox and leaves the keyboard on `document.body`, which happy-dom never reproduces. |
  | `busy` | boolean | `false` | The caller's own in-flight flag, never derived from `armed`. It is `Button`'s `busy`: `aria-busy` and `aria-disabled` and never `disabled`, so the control keeps focus and refuses the press. |
  | `showTitle` | boolean | `true` | Whether the accessible name is also a hover `title`. |
  | `size` | `''` \| `'38'` | `''` | `Button`'s rung: `'38'` stands it among the page header's 38px actions, and anything else draws 34. |

  Callbacks:
  - `onArm(token)` / `onDisarm(token)` / `onConfirm(token)` — `onDisarm` reports only the local
    Escape and blur disarms; every other disarm is the owner's.

  Exports:
  - `focus()` — puts the keyboard back on the control when the caller's native `disabled`
    dropped it to the document body.

  Invariants:
  - The glyph swaps with the label, so the armed face survives greyscale.
  - `faceOf` reads `busy` first, and Escape and blur disarm only while armed and not busy, so a
    blur during the write cannot clear the owner's token — pinned by `bulk-delete-card-mounted`.
  - The busy face carries `data-busy` and never `is-armed`.
-->
<script>
  import Button from './Button.svelte';

  let {
    token = '',
    armed = false,
    idleLabel = '',
    armedLabel = '',
    idleIcon = 'fas fa-trash',
    armedIcon = 'fas fa-triangle-exclamation',
    idleAriaLabel = '',
    armedAriaLabel = '',
    ariaDescribedBy = '',
    disabled = false,
    busy = false,
    busyLabel = '',
    busyIcon = 'fas fa-spinner fa-spin',
    showTitle = true,
    size = '',
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
  const atRung38 = $derived(String(size ?? '') === '38');

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

<Button
  role="danger"
  size={atRung38 ? '38' : ''}
  {icon}
  busy={inFlight}
  disabled={disabled === true}
  class={armed && !inFlight ? 'is-armed' : ''}
  bind:element
  data-armed={armed ? 'true' : 'false'}
  data-busy={inFlight ? 'true' : 'false'}
  data-arm-token={token}
  aria-label={consequence}
  aria-describedby={ariaDescribedBy || undefined}
  title={showTitle ? consequence : undefined}
  onclick={handleClick}
  onkeydown={handleKeydown}
  onblur={handleBlur}><span>{label}</span></Button
>
