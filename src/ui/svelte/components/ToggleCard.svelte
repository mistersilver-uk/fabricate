<!--
  A labelled status card carrying an on/off switch: icon · title + sub-line · toggle. Its five
  classes' rules are rooted at `fabricate-toggle-card`, the class the root writes ahead of them, so
  the card paints the same in a bare `<div>` as in the manager; three CALLERS restate its metrics
  inside their own containers and stay application-rooted, because those rules are theirs. String
  props are PRE-LOCALIZED, which keeps this a presentational leaf.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `variant` | class string | `''` | A visual variant appended to the card class, toning it when on. |
  | `icon` | Font Awesome classes | `'fas fa-circle'` | `''` renders NO glyph slot at all rather than an empty one: a slot holding an empty `<i>` still reserves its column and left-indents the copy away from the cards above and below it. |
  | `title` / `sub` | pre-localized strings | `''` | The heading and its second line. |
  | `on` / `disabled` | booleans | `false` | The switch's state and whether it is operable. |
  | `toggleLabel` | pre-localized string | `''` | The switch's accessible name; falls back to the visible title. |
  | `toggleTitle` | pre-localized string | `''` | A tooltip for the SWITCH rather than the card — named so because `title` is already the card heading. It exists for the card whose conditional tooltip is the ONLY explanation a reader gets for why the switch is disabled. Emitted as `\|\| undefined`, because an empty string renders a present-but-blank tooltip. |
  | `section` / `field` / `subAttr` / `toggleAttr` | attribute names | `''` | Hooks on the card, the switch's field name, the sub-line and the switch itself. `field` stamps the recipe editor's own vocabulary, so a caller outside that editor names its switch through `toggleAttr` in its own. Each is absent when unset. |
  | `onToggle()` | function | no-op | The caller owns `on`. |

  Invariants:
  - THE MARKUP IS A BYTE-FAITHFUL EXTRACTION of the two shipped status cards — same element tree,
    same class names, same ARIA — so retrofitting those cards onto this component is a no-op DOM
    diff. Change the structure and that retrofit stops being a no-op, and this becomes a THIRD
    source of truth rather than the second being retired.
  - `aria-pressed` ON A PLAIN `<button>` IS THE HOUSE PATTERN. The repo uses `role="switch"`
    nowhere; do not introduce one here.
  - THE SWITCH ITSELF IS `<StatusToggle>`, a COMPOSITION rather than a competing primitive: this
    card owns icon, title, sub-line and the card's own state class, and the shared switch owns the
    track, the knob and the reading. It emits the identical tree, class string and `aria-pressed`;
    the one thing that differs is a comment anchor for its conditional reading, which this card
    never passes and which renders nothing.
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
    <!-- `''` not `true`: a bare attribute renders `=""`, which is the byte the shipped cards
         emit today, and the retrofit is a no-op DOM diff only if this matches exactly. -->
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
