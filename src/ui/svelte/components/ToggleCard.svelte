<!--
  A labelled status card carrying an on/off switch: icon · title + sub-line · toggle. Its five
  classes' rules are rooted at `fabricate-toggle-card`, so the card paints the same in a bare
  `<div>` as in the manager. String props are PRE-LOCALIZED, which keeps this a presentational leaf.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `variant` | class string | `''` | A visual variant appended to the card class, toning it when on. |
  | `icon` | Font Awesome classes | `'fas fa-circle'` | `''` renders NO glyph slot at all: a slot holding an empty `<i>` still reserves its column and left-indents the copy away from the cards around it. |
  | `title` / `sub` / `toggleLabel` | pre-localized strings | `''` | The heading, its second line, and the switch's accessible name, which falls back to the visible title. |
  | `on` / `disabled` | booleans | `false` | The switch's state and whether it is operable. |
  | `toggleTitle` | pre-localized string | `''` | A tooltip for the SWITCH rather than the card, and often the only explanation of why the switch is disabled. Emitted as `\|\| undefined`, because an empty string renders a present-but-blank tooltip. |
  | `section` / `field` / `subAttr` / `toggleAttr` | attribute names | `''` | Hooks on the card, the switch's field name, the sub-line and the switch. Each is absent when unset, and each is rendered with an empty-string value per the `data-*` spelling rule in `openspec/specs/design-system/spec.md`. |
  | `onToggle()` | function | no-op | The caller owns `on`. |

  Invariants:
  - THE MARKUP IS A BYTE-FAITHFUL EXTRACTION of the two shipped status cards — same element tree,
    same class names, same ARIA — so retrofitting those cards onto this component is a no-op DOM
    diff, and changing the structure makes this a THIRD source of truth rather than retiring the
    second. `aria-pressed` on a plain `<button>` is the house pattern; the repository uses
    `role="switch"` nowhere.
  - THE SWITCH ITSELF IS `<StatusToggle>`, a composition rather than a competing primitive: this
    card owns icon, title, sub-line and the card's own state class, and the shared switch owns the
    track, the knob and the reading.
-->
<script>
  import StatusToggle from './StatusToggle.svelte';

  let {
    variant = '',
    icon = 'fas fa-circle',
    title = '',
    sub = '',
    on = false,
    disabled = false,
    toggleLabel = '',
    toggleTitle = '',
    section = '',
    field = '',
    subAttr = '',
    toggleAttr = '',
    onToggle = () => {},
  } = $props();
</script>

<div
  class={`fabricate-toggle-card manager-recipe-status-card ${variant} ${on ? 'is-on' : 'is-off'}`}
  data-recipe-section={section || undefined}
>
  {#if icon}
    <span class="manager-recipe-status-icon" aria-hidden="true"><i class={icon}></i></span>
  {/if}
  <div class="manager-recipe-status-copy">
    <p class="manager-recipe-status-title">{title}</p>
    <p class="manager-recipe-status-sub manager-muted" {...subAttr ? { [subAttr]: '' } : {}}>
      {sub}
    </p>
  </div>
  <StatusToggle
    {on}
    {disabled}
    ariaLabel={toggleLabel || title}
    data-recipe-field={field || undefined}
    title={toggleTitle || undefined}
    {...toggleAttr ? { [toggleAttr]: '' } : {}}
    onclick={() => onToggle(!on)}
  />
</div>
