<!--
  THE manager's on/off switch: a track, a knob and an optional reading beside them. An import-free
  leaf taking already-localized strings.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `as` | `'button'` \| `'indicator'` \| `'checkbox'` | `'button'` | A CLOSED set, and each is a different THING rather than a variant of the first; see the invariants. An unrecognised value renders the `button` host. |
  | `on` | boolean | `false` | The state. Drives `is-on`/`is-off`, `aria-pressed` and the knob's travel. |
  | `label` / `ariaLabel` | pre-localized strings | `''` | The reading beside the switch and the accessible name, each dropped when empty. A site naming its switch through `aria-labelledby` passes that attribute through the rest spread. |
  | `disabled` | boolean | `false` | The `button` host's own attribute and the `checkbox` host's `<input>` attribute; meaningless on `indicator`. |
  | `onclick` / `onChange(checked)` / `trailing` | functions / snippet | no-op / no-op / `undefined` | The `button` host's handler, forwarded verbatim; the `checkbox` host's, named for the value because the `<input>` is an implementation detail of that host; and content rendered after the label. |
  | `class` | class string | `''` | An EXTRA class, appended to the primitive's own, never a replacement. |

  Rest spread:
  - `{...rest}` lands on THE HOST'S INTERACTIVE ELEMENT — the `<button>`, the indicator `<span>`, or
    the checkbox's `<input>`. The input rather than its `<label>` is not a detail:
    `tests/components/tool-studio-mounted.test.js` resolves a hook there and walks
    `.closest('.manager-status-toggle')`, and `scripts/foundry-test-run.mjs` pointer-hit-tests it
    against the transparent input that receives the click. `class` is a named prop, and
    `data-keyboard-focus="true"` is written on the button host only and before the spread; both
    rules are `openspec/specs/design-system/spec.md`'s.

  Invariants:
  - THE THREE HOSTS ARE THREE THINGS. `button` is the pressable switch, with `aria-pressed` on a
    plain `<button>` as the house pattern — this repository uses `role="switch"` nowhere;
    `indicator` is a locked activation READING, a `<span role="img">`, deliberately not a disabled
    button because there is nothing to press; and `checkbox` is a real `<input type="checkbox">`
    inside a `<label>`, made invisible and laid over the track.
  - EACH HOST'S EXTRA CLASS IS EMITTED HERE rather than remembered per call site, because both are
    load-bearing for the HOST: the sheet's hover rule excludes `.is-locked` by name, since
    `:disabled` cannot match a span, and the checkbox host's own class gives the label the box its
    absolutely positioned input is measured against.
  - THE FAMILY ROOT LEADS THE `classes` ARRAY and `HOST_CLASSES` stays a named map outside it:
    `tests/components/searchable-popover-area-scope.test.js` reads the array up to the first `]` and
    through the `classMaps` field, and a parity harness scrapes the array's literals into
    computed-style probes.
  - THE FACE SNIPPET'S WHITESPACE IS LOAD-BEARING: every tag hugs its neighbour and the one space
    sits INSIDE the `{#if label}` block, because written the natural way the compiler emits a
    trailing whitespace text node inside every host. That space is the `SPACE` constant, because a
    literal space starting an `{#if}` block is trimmed by the compiler and `{' '}` is what
    `svelte/no-useless-mustaches` exists to flag.
  - No scoped `<style>`: every rule that paints this switch is rooted at `fabricate-toggle`, and
    this family has no application-rooted residue.
-->
<script>
  let {
    as = 'button',
    on = false,
    label = '',
    ariaLabel = '',
    disabled = false,
    onclick = () => {},
    onChange = () => {},
    trailing = undefined,
    class: extraClass = '',
    ...rest
  } = $props();

  const HOST_CLASSES = Object.freeze({
    indicator: 'is-locked',
    checkbox: 'manager-tool-setting-toggle',
  });

  const HOSTS = Object.freeze(['button', 'indicator', 'checkbox']);

  const host = $derived(HOSTS.includes(as) ? as : 'button');
  const isCheckbox = $derived(host === 'checkbox');
  const isIndicator = $derived(host === 'indicator');

  const STATE_CLASSES = Object.freeze({ on: 'is-on', off: 'is-off' });

  const classes = $derived(
    [
      'fabricate-toggle',
      'manager-status-toggle',
      HOST_CLASSES[host] ?? '',
      extraClass,
      on ? STATE_CLASSES.on : STATE_CLASSES.off,
    ]
      .filter(Boolean)
      .join(' ')
  );

  const SPACE = ' ';

  const accessibleName = $derived(ariaLabel || undefined);
</script>

{#snippet face()}
  <span class="manager-status-toggle-track" aria-hidden="true"
    ><span class="manager-status-toggle-knob"></span></span
  >{#if label}{SPACE}<span class="manager-status-toggle-label">{label}</span
    >{/if}{#if trailing}{SPACE}{@render trailing()}{/if}
{/snippet}

{#if isCheckbox}
  <label class={classes}>
    <input
      class="manager-tool-setting-toggle-input"
      type="checkbox"
      checked={on}
      {disabled}
      aria-label={accessibleName}
      onchange={(event) => onChange(event.currentTarget.checked)}
      {...rest}
    />
    {@render face()}
  </label>
{:else if isIndicator}
  <span class={classes} role="img" aria-label={accessibleName} {...rest}>
    {@render face()}
  </span>
{:else}
  <button
    type="button"
    class={classes}
    data-keyboard-focus="true"
    aria-pressed={on}
    aria-label={accessibleName}
    {disabled}
    {onclick}
    {...rest}
  >
    {@render face()}
  </button>
{/if}
