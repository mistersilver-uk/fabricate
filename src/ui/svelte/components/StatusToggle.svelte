<!--
  THE manager's on/off switch: a track, a knob and an optional reading beside them. Before this it
  was a CSS convention plus a memorised element tree at 37 sites, and a forgotten `-knob` span
  renders a track with NO KNOB — a switch that cannot show its own state, which nothing but a
  screenshot reports. An IMPORT-FREE LEAF taking ALREADY-LOCALIZED strings: one util import inside a
  leaf propagates a required raw-module entry into every mount harness that compiles anything
  rendering it, and a missing entry HANGS that suite as `# cancelled` rather than failing it.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `as` | `'button'` \| `'indicator'` \| `'checkbox'` | `'button'` | A CLOSED set, and each is a different THING rather than a variant of the first. `button` is the pressable switch, with `aria-pressed` on a plain `<button>` as the HOUSE PATTERN — this repository uses `role="switch"` NOWHERE. `indicator` is a locked activation READING, a `<span role="img">` drawing the same track and knob: deliberately NOT a disabled button, because nothing is disabled — there is nothing to press. `checkbox` is a real `<input type="checkbox">` inside a `<label>`, made invisible and laid over the track. An unrecognised value renders the `button` host, so a typo is a working switch rather than an unstyled span. Each host's extra class is emitted HERE rather than remembered per call site, because both are load-bearing for the HOST rather than decorative for the SCREEN: the sheet's hover rule excludes `.is-locked` BY NAME, since `:disabled` cannot match a span, so a caller that forgot it would get a span lighting up under the pointer like a switch; and the checkbox host's own class is what gives the label the box its absolutely positioned input is measured against. |
  | `on` | boolean | `false` | The state. Drives `is-on`/`is-off`, `aria-pressed` and the knob's travel. |
  | `label` | pre-localized string | `''` | The reading beside the switch. Omitted entirely when empty, which is the track-only form the browser filter rows use. |
  | `ariaLabel` | pre-localized string | `''` | The accessible name, dropped when empty. A site naming its switch through `aria-labelledby` passes that attribute through the rest spread; a site whose visible `label` IS the name passes neither. |
  | `disabled` | boolean | `false` | The `button` host's own attribute and the `checkbox` host's `<input>` attribute. Meaningless on `indicator`, which has no control to disable. |
  | `onclick` | function | no-op | The `button` host's handler, forwarded verbatim so a call site keeps its `event.stopPropagation()`. |
  | `onChange(checked)` | function | no-op | The `checkbox` host's handler, named for the value rather than the event because the `<input>` is an implementation detail of that host. |
  | `trailing` | snippet | `undefined` | Rendered after the label — the Checks Studio's padlock glyph, and nothing else today. |
  | `class` | class string | `''` | An EXTRA class, appended to the primitive's own, never a replacement. A named prop rather than a rest key, because the spread lands after `class={classes}` and would REPLACE the whole string. Before writing a rule against it, read `ManagerButton.svelte`'s canonical scoped-class account. |

  Rest spread:
  - `{...rest}` lands on THE HOST'S INTERACTIVE ELEMENT — the `<button>`, the indicator `<span>`,
    or the checkbox's `<input>`. The input rather than its `<label>` is not a detail:
    `tests/components/tool-studio-mounted.test.js` resolves a hook there and walks
    `.closest('.manager-status-toggle')`, and `scripts/foundry-test-run.mjs` pointer-hit-tests the
    same attribute against the transparent input that actually receives the click.

  Invariants:
  - NO SCOPED `<style>`, for the reason `ManagerButton.svelte`'s header states in full. Every rule
    that paints this switch is rooted at `fabricate-toggle`, so it paints wherever it renders, and
    measured over the whole sheet this family has NO residue — unlike `ManagerSearchField`'s two
    `@container fabricate-manager` rules.
  - `data-keyboard-focus="true"` IS ON THE BUTTON HOST ONLY, and on the SAME SIDE of the rest
    spread as `class={classes}`, because a spread landing later wins. The indicator is a
    `<span role="img">` and the checkbox host renders a native `<input>`, which Foundry's
    `KeyboardManager#hasFocus` already treats as focused. While a button-hosted switch outside a
    `<form>` holds focus, Foundry's Space/arrow/Tab bindings stop firing — the intended change.
  - CLASS ORDER IS DELIBERATE: the family root, `manager-status-toggle`, the host's own class, the
    caller's extra, then the state. Everything after the root is the order all 37 hand-rolled
    sites already wrote, so a converted site emits the same attribute with one token PREPENDED.
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

  // The host vocabulary, and the class each host emits BESIDES `manager-status-toggle`. The
  // `button` host is the EMPTY MODIFIER, which is why it has no entry. The area-scope gate reads
  // this map through its `classMaps` field, because `manager-tool-setting-toggle` reaches the DOM
  // from here rather than from the `classes` array, and two shipped rules name it.
  const HOST_CLASSES = Object.freeze({
    indicator: 'is-locked',
    checkbox: 'manager-tool-setting-toggle',
  });

  const HOSTS = Object.freeze(['button', 'indicator', 'checkbox']);

  // `includes` over a frozen array rather than an object index: a plain index reads INHERITED
  // members too, so an `as` of `toString` would resolve to something.
  const host = $derived(HOSTS.includes(as) ? as : 'button');
  const isCheckbox = $derived(host === 'checkbox');
  const isIndicator = $derived(host === 'indicator');

  // Hoisted out of the `classes` array so its literals stay unconditional: a parity harness
  // scrapes them into computed-style probes, and an inline conditional puts BOTH branches' tokens
  // into every probe. The family root MUST LEAD that array, because
  // `searchable-popover-area-scope.test.js` reads it up to the first `]` — here
  // `HOST_CLASSES[host]`'s own — so a root below that expression reads as unemitted.
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

  /**
   * The ONE space that separates the track from the reading beside it.
   *
   * A named constant rather than a literal, and neither choice is cosmetic: a literal space at
   * the START of an `{#if}` block is trimmed by the compiler, so it has to be an expression to
   * survive, and `{' '}` is exactly what `svelte/no-useless-mustaches` exists to flag — correctly
   * almost everywhere and wrongly here.
   */
  const SPACE = ' ';

  const accessibleName = $derived(ariaLabel || undefined);
</script>

<!-- The switch face, declared ONCE and rendered by all three hosts, so the tree a missing `-knob`
     span would break cannot be spelled three ways.

     THE WHITESPACE IS LOAD-BEARING: every tag hugs its neighbour and the one space sits INSIDE the
     `{#if label}` block, because written the natural way the compiler emits a trailing whitespace
     text node inside every host, and a track-only switch would gain a node it does not have
     today. What this cannot reproduce is the comment anchor Svelte writes for a block in client
     mode; a comment node renders nothing and is not a flex item. -->
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
