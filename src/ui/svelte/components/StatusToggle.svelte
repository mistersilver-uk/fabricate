<!-- Svelte 5 runes mode -->
<!--
  THE manager's on/off switch (issue 1040).

  ── WHY IT EXISTS ─────────────────────────────────────────────────────────────────
  Before this component the switch was a CSS CONVENTION plus a memorised element tree:
  write `class="manager-status-toggle is-on|is-off"`, then remember to nest
  `<span class="manager-status-toggle-track"><span class="manager-status-toggle-knob">`
  inside it, then remember `aria-pressed`, then optionally add a
  `manager-status-toggle-label` span. 37 sites across 26 components wrote that tree out
  by hand. `scoped/InheritRow.svelte` and `scoped/MembershipActions.svelte` each carry a
  paragraph in their own docblocks recording that they had to hand-roll it because no
  primitive existed to call — the debt was visible at the site before it was payable.

  The tree is what makes a convention here worse than the `manager-button` one it
  follows. A forgotten `is-primary` renders the wrong colour; a forgotten `-knob` span
  renders a track with NO KNOB, which is a switch that cannot show its own state, and
  nothing but a screenshot says so.

  ── THE THREE HOSTS, AND WHY THE SET IS CLOSED ────────────────────────────────────
  The census found three element shapes, not one, and each is a different thing rather
  than a variant of the first:

   - `button` (32 of the 37) — the pressable switch. `aria-pressed` on a plain
     `<button>` is the HOUSE PATTERN and this repository uses `role="switch"` NOWHERE;
     `ToggleCard.svelte` records that rule and this component does not introduce one.
   - `indicator` (1) — `checks/ChecksRightMenu.svelte`'s locked activation READING. A
     routed or progressive check cannot be switched off, so the control is replaced by
     a `<span role="img">` that draws the same track and knob and announces itself as
     one labelled image. It is deliberately NOT a disabled button: nothing is disabled,
     because there is nothing to press, and a GM must not keep trying. `is-locked` is
     emitted by the host rather than passed as a class, because the sheet's hover rule
     excludes `.is-locked` BY NAME (`:disabled` cannot match a span) and a caller who
     forgot the class would get a span that lights up under the pointer like a switch.
   - `checkbox` (2) — `tools/ToolRequirementsTab.svelte`'s two card-heading switches,
     which are a real `<input type="checkbox">` inside a `<label>`, made invisible with
     `opacity: 0` and laid over the track. Its two classes are host STRUCTURE — the
     label positions the input over the track and the input is what a pointer actually
     hits — so they are emitted here rather than remembered per call site, even though
     `manager-tool-setting-toggle` is named for the screen that first wrote it. Renaming
     that pair onto the primitive's own vocabulary is a stylesheet change with no visual
     consequence and is deliberately NOT folded into a 37-site conversion whose whole
     acceptance bar is that no frame moves.

  An unrecognised `as` renders the `button` host, so a typo is a working switch rather
  than an unstyled span.

  ── WHAT THIS COMPONENT DOES NOT OWN ──────────────────────────────────────────────
  It has no scoped `<style>`, for `ManagerButton.svelte`'s reason: the switch is painted
  by `styles/fabricate.css` under `.fabricate-manager`, and a scoped block here would be
  a second source of truth for the same control and would begin to disagree with the
  sheet. The consequence is the same one the button carries — this is a MANAGER
  primitive, not an app-agnostic one, and dropped into `.fabricate-app` it renders as an
  unstyled row.

  It is also an IMPORT-FREE LEAF, exactly like `Stepper.svelte`: props only, no
  `foundryBridge`, no util imports. Callers pass ALREADY-LOCALIZED strings. One util
  import inside a leaf propagates a required raw-module entry into every mount harness
  that compiles anything rendering it, and a missing entry HANGS that suite as
  `# cancelled` rather than failing it — and this leaf is rendered by 25 components.

  ── CLASS ORDER IS DELIBERATE ─────────────────────────────────────────────────────
  `manager-status-toggle`, then the host's own class, then the caller's extra, then the
  state. That is not an aesthetic choice: it is the order all 37 hand-rolled sites
  already wrote (`manager-status-toggle manager-environment-override-toggle is-on`,
  `manager-status-toggle is-locked is-on`), so every converted site emits a
  byte-identical class attribute and the conversion is a no-op in the DOM as well as on
  screen. Class order changes no cascade; reproducing it is what makes the diff
  reviewable.

  Props:
   - as: `'button'` (default), `'indicator'` or `'checkbox'`. A CLOSED set — see above.
   - on: the state. Drives `is-on`/`is-off`, `aria-pressed` and the knob's travel.
   - label: the pre-localized reading beside the switch ("On"/"Off", "Overridden", a
     whole sentence in the Checks activation card). Omitted entirely when empty, which
     is the track-only form the browser filter rows and row-status cells use.
   - ariaLabel: the pre-localized accessible name, emitted as `aria-label` and dropped
     when empty. A site that names its switch through `aria-labelledby` instead passes
     that attribute through the rest spread; a site whose visible `label` IS the name
     passes neither, which is what four shipped sites do.
   - disabled: the `button` host's own attribute, and the `checkbox` host's `<input>`
     attribute. Meaningless on `indicator`, which has no control to disable.
   - onclick: the `button` host's handler, forwarded verbatim so a call site keeps its
     `event.stopPropagation()`.
   - onChange(checked): the `checkbox` host's handler, called with the input's new
     checked state. Named for the value rather than the event because the `<input>` is
     an implementation detail of that host.
   - trailing: a snippet rendered after the label — the Checks Studio's padlock glyph,
     and nothing else today.
   - class: an EXTRA class, appended to the primitive's own, never a replacement. It has
     to be a named prop rather than a rest key, because the rest spread lands after
     `class={classes}` and a `class` passed through it would REPLACE the whole string.

     Before writing a rule against it, read `ManagerButton.svelte`'s note on the same
     prop: a scoped `<style>` rule in the CALLING component stops reaching the element
     the moment that site converts, because Svelte stamps its `svelte-<hash>` onto the
     elements the component itself writes and a `class` handed to a child is forwarded
     verbatim. `RecipeItemEditor.svelte` shipped exactly one such rule and carries the
     `:global(...)` repair.

  Every other attribute — `data-*` hooks, `aria-labelledby`, `title`, `onkeydown` — is
  forwarded through the rest spread onto THE HOST'S INTERACTIVE ELEMENT: the `<button>`,
  the indicator `<span>`, or the checkbox's `<input>`. The input rather than its
  `<label>` is not a detail: `tests/components/tool-studio-mounted.test.js` resolves
  `[data-tool-prerequisites-enabled]` and then walks `.closest('.manager-status-toggle')`
  to reach the wrapper, and `scripts/foundry-test-run.mjs` pointer-hit-tests the same
  attribute against the transparent input that actually receives the click.
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
    // An EXTRA class, appended to the primitive's own — never a replacement for it. It has to
    // be a named prop rather than a rest key: the rest spread lands after `class={…}` in the
    // markup, so a `class` passed through it would REPLACE `manager-status-toggle is-on`
    // outright and silently unstyle the switch while every `data-*` selector kept resolving.
    class: extraClass = '',
    ...rest
  } = $props();

  // The host vocabulary, and the class each host emits BESIDES `manager-status-toggle`. The
  // `button` host is in no way absent from the set — it is the EMPTY MODIFIER, which is why it
  // has no entry here, exactly as `ManagerButton`'s `neutral` role has none.
  //
  // `is-locked` and `manager-tool-setting-toggle` are here rather than at their call sites
  // because both are load-bearing for the HOST rather than decorative for the SCREEN: the
  // sheet's hover rule excludes `.is-locked` by name because `:disabled` cannot match a span,
  // and `.manager-tool-setting-toggle` is what gives the label the 34px box its absolutely
  // positioned input is measured against.
  const HOST_CLASSES = Object.freeze({
    indicator: 'is-locked',
    checkbox: 'manager-tool-setting-toggle',
  });

  const HOSTS = Object.freeze(['button', 'indicator', 'checkbox']);

  // `includes` over a frozen array rather than an object index, for the reason
  // `ManagerButton.svelte` states about `Object.hasOwn`: a plain index reads INHERITED members
  // too, so an `as` of `toString` would resolve to something. An unrecognised host renders the
  // pressable switch, which is the working control rather than an unstyled element.
  const host = $derived(HOSTS.includes(as) ? as : 'button');
  const isCheckbox = $derived(host === 'checkbox');
  const isIndicator = $derived(host === 'indicator');

  // Hoisted out of the `classes` array so the array's own literals stay the one unconditional
  // token. Nothing reads this file that way TODAY, so the reason is borrowed rather than
  // local: `ManagerButton.svelte` keeps the same shape because `tests/helpers/`'s
  // `manager-button-cascade.js` scrapes its array's string literals into computed-style
  // probes, and an inline conditional there puts BOTH branches' tokens into every probe — so a
  // parity harness over this control finds what it expects instead of a shape that has to be
  // rearranged before it can be measured.
  const STATE_CLASSES = Object.freeze({ on: 'is-on', off: 'is-off' });

  const classes = $derived(
    [
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
   * A named constant rather than a literal, and neither choice here is cosmetic. A literal
   * space at the START of an `{#if}` block is trimmed by the compiler, so the space has to be
   * an expression to survive at all; and `{' '}`, the idiomatic spelling of that expression, is
   * exactly what `svelte/no-useless-mustaches` exists to flag — correctly almost everywhere,
   * and wrongly here. Naming it states the intent at the one place it is true instead of
   * suppressing a rule that is doing its job for every other site in the repository.
   */
  const SPACE = ' ';

  const accessibleName = $derived(ariaLabel || undefined);
</script>

<!-- The switch face: track, knob, and the optional reading beside them. Declared ONCE and
     rendered by all three hosts, so the tree that a missing `-knob` span would break cannot be
     spelled three ways.

     THE WHITESPACE IS LOAD-BEARING AND IS WHY THIS READS SO TIGHTLY. Every `{#if}` and every
     tag hugs its neighbour, and the ONE space that separates the track from the reading sits
     INSIDE the `{#if label}` block. Written the natural way — each block on its own line — the
     compiler emits a trailing whitespace text node inside every host, so a track-only switch
     (`ToggleCard`, `EssenceRow`, both browser filter rows) would gain a text node it does not
     have today. Nothing would look different, because a whitespace-only run between flex items
     produces no flex item at all, but `ToggleCard.svelte`'s docblock records that its markup is
     a BYTE-FAITHFUL extraction whose planned retrofit is a no-op DOM diff, and a conversion
     that quietly widens that diff is the thing that stops being true.

     What this cannot reproduce is the comment anchor Svelte writes for a block in client mode.
     A primitive that renders its reading conditionally has one; the hand-rolled sites, which
     wrote the reading inline or not at all, do not. A comment node renders nothing and is not
     a flex item, and `ManagerButton.svelte` already carries the same property through its
     `{@render children?.()}`. -->
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
    aria-pressed={on}
    aria-label={accessibleName}
    {disabled}
    {onclick}
    {...rest}
  >
    {@render face()}
  </button>
{/if}
