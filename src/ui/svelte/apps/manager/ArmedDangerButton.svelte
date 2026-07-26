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
   - idleAriaLabel / armedAriaLabel: consequence sentences per state.
   - disabled: disables both arming and confirming.
   - onArm(token) / onDisarm(token) / onConfirm(token).
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
    disabled = false,
    onArm = () => {},
    onDisarm = () => {},
    onConfirm = () => {},
  } = $props();

  const label = $derived(armed ? armedLabel : idleLabel);
  const icon = $derived(armed ? armedIcon : idleIcon);
  const consequence = $derived(armed ? armedAriaLabel : idleAriaLabel);

  function handleClick() {
    if (disabled) return;
    if (armed) {
      onConfirm(token);
      return;
    }
    onArm(token);
  }

  // Escape disarms without leaving the control, and is stopped here so it does not
  // also close an ancestor surface the GM did not mean to leave.
  function handleKeydown(event) {
    if (event.key !== 'Escape' || !armed) return;
    event.preventDefault();
    event.stopPropagation();
    onDisarm(token);
  }

  function handleBlur() {
    if (armed) onDisarm(token);
  }
</script>

<button
  type="button"
  class="manager-button is-danger"
  class:is-armed={armed}
  data-armed={armed ? 'true' : 'false'}
  data-arm-token={token}
  aria-label={consequence}
  title={consequence}
  {disabled}
  onclick={handleClick}
  onkeydown={handleKeydown}
  onblur={handleBlur}
>
  <i class={icon} aria-hidden="true"></i>
  <span>{label}</span>
</button>
