<!--
  The essence editor's IDENTITY tab: icon, name, description, colour palette and the Enabled row.

  THE COLOUR PALETTE IS INLINE AND HAS A NO-COLOUR CELL, rendered through
  `ManagerColorPopover`'s gated `layout="inline"` with `allowNone`, because an inline palette
  without that cell is a one-way door: once a colour is chosen there is no route back to the accent
  default. Both props are off by default, so the biome popover and the modifier picker are
  untouched. Unset is a FIRST-CLASS state, not a failure — an essence with no colour renders in the
  theme accent — so the palette marks the No-colour cell rather than falsely marking a hue.

  THE ENABLED ROW IS `ToggleCard`, whose shape is exactly icon · title · sub-line · switch. A
  blocking validation issue does NOT disable the switch: that gate is not implemented here.
-->
<script>
  import Field from '../../../components/Field.svelte';
  import IconPicker from '../../../components/IconPicker.svelte';
  import ManagerColorPopover from '../../../components/ManagerColorPopover.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import ToggleCard from '../../../components/ToggleCard.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { DEFAULT_ESSENCE_ICON, normalizeEssenceIcon } from '../../../util/essenceIcons.js';
  import IconButton from '../../../components/IconButton.svelte';

  let {
    name = '',
    description = '',
    icon = DEFAULT_ESSENCE_ICON,
    colorToken = '',
    enabled = true,
    saving = false,
    onNameChange = () => {},
    onDescriptionChange = () => {},
    onIconChange = () => {},
    onColourChange = () => {},
    onEnabledChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const normalizedIcon = $derived(normalizeEssenceIcon(icon));
</script>

<div class="manager-essence-tab-stack" data-essence-tab-panel="identity">
  <section class="manager-edit-card">
    <div class="manager-essence-edit-grid">
      <!-- THE CONTROL HALF of the validation row action. Two controls change the glyph — the
           tile's reset overlay and the picker — so the PANEL is the destination. A panel is not
           natively focusable, so it declares the tabindex that makes focus real AND the attribute
           telling Foundry the window is focused; without the second, Space pauses the game. -->
      <div
        class="manager-essence-icon-panel"
        data-validation-target="essence-icon"
        tabindex="-1"
        data-keyboard-focus="true"
      >
        <span class="manager-essence-field-label"
          >{text('FABRICATE.Admin.Manager.Essence.Icon', 'Icon')}</span
        >
        <!-- The large tile, carrying the essence's own colour so the GM sees the choice they made
             rather than a preview in the theme accent.

             SQUARE, not block: `block` filled the column WIDTH and kept `size` as its height, so a
             widened column stretched the tile into a rectangle. `size` alone sets both dimensions,
             and the column below is narrowed to match so the picker row shrinks to fit beneath it.
             `glyph` stays, because at the shared default the flame was a speck in a 124px tile.

             The RESET is an OVERLAY on the tile, not a second control beside the picker, and this
             wrapper is what it positions against, `Medallion` being a closed leaf with no slot. It
             is invisible until the tile is hovered or the button takes keyboard focus —
             `:focus-visible` keeps it reachable without a pointer. -->
        <div class="manager-essence-icon-tile">
          <Medallion icon={normalizedIcon} tint={colorToken || ''} size={124} glyph={44} />
          <IconButton
            class="manager-essence-icon-reset"
            data-essence-icon-reset=""
            disabled={saving || normalizedIcon === DEFAULT_ESSENCE_ICON}
            ariaLabel={text('FABRICATE.Admin.Manager.Essence.ClearIcon', 'Clear icon')}
            title={text('FABRICATE.Admin.Manager.Essence.ClearIcon', 'Clear icon')}
            onclick={() => onIconChange(DEFAULT_ESSENCE_ICON)}
          >
            <i class="fas fa-undo" aria-hidden="true"></i>
          </IconButton>
        </div>
        <div class="manager-essence-icon-actions">
          <IconPicker
            value={icon}
            disabled={saving}
            buttonTitle={text('FABRICATE.Admin.Manager.Essence.ChangeIcon', 'Change icon')}
            onChange={(iconClass) => onIconChange(iconClass)}
          />
        </div>
      </div>

      <div class="manager-essence-core-fields">
        <Field as="label" for="manager-essence-edit-name">
          <span>{text('FABRICATE.Admin.Manager.Essence.Name', 'Name')}</span>
          <!-- The CONTROL half of the validation row action: the `name` blocker addresses this
               input by this exact value, which `validationFocus.js` resolves and focuses. -->
          <input
            id="manager-essence-edit-name"
            data-validation-target="essence-name"
            type="text"
            value={name}
            oninput={(event) => onNameChange(event.currentTarget.value)}
            placeholder={text('FABRICATE.Admin.Manager.Essence.NamePlaceholder', 'Essence name')}
            disabled={saving}
            required
          />
        </Field>

        <Field as="label" for="manager-essence-edit-description">
          <span>{text('FABRICATE.Admin.Manager.Essence.Description', 'Description')}</span>
          <textarea
            id="manager-essence-edit-description"
            data-validation-target="essence-description"
            rows="5"
            value={description}
            oninput={(event) => onDescriptionChange(event.currentTarget.value)}
            placeholder={text(
              'FABRICATE.Admin.Manager.Essence.DescriptionPlaceholder',
              'Description'
            )}
            disabled={saving}></textarea>
        </Field>
      </div>
    </div>
  </section>

  <!-- THE CONTROL HALF for the `colour` row. The palette is a grid of swatches rather than one
       control, so the CARD is the destination, by the same rule the icon panel follows. -->
  <section
    class="manager-edit-card"
    data-manager-essence-colour
    data-validation-target="essence-colour"
    tabindex="-1"
    data-keyboard-focus="true"
  >
    <div class="manager-edit-card-heading">
      <h3 class="manager-card-title">
        {text('FABRICATE.Admin.Manager.Essence.Colour.Label', 'Colour')}
      </h3>
      <span class="manager-muted manager-essence-colour-hint"
        >{text(
          'FABRICATE.Admin.Manager.Essence.Colour.Hint',
          'Tints the icon and every chip that carries this essence.'
        )}</span
      >
    </div>
    <ManagerColorPopover
      layout="inline"
      allowNone
      allowCustom={false}
      manageDismiss={false}
      colorToken={colorToken || ''}
      unset={!colorToken}
      customColor=""
      presetGridLabel={text(
        'FABRICATE.Admin.Manager.Essence.Colour.Presets',
        'Essence colour presets'
      )}
      noneLabel={text('FABRICATE.Admin.Manager.Essence.Colour.None', 'No colour')}
      onClear={() => onColourChange('')}
      onChange={(next) => onColourChange(next?.colorToken || '')}
    />
    <!-- No colour-NAME copy: naming the swatch is overhead the palette already carries visually.
         The Authored/Unset sentence stays, naming only whether a colour is set. -->
    <p
      class="manager-muted manager-essence-colour-state"
      data-essence-colour-state={colorToken || 'none'}
    >
      <span
        >{colorToken
          ? text(
              'FABRICATE.Admin.Manager.Essence.Colour.Authored',
              'This essence renders in its own colour.'
            )
          : text(
              'FABRICATE.Admin.Manager.Essence.Colour.Unset',
              'This essence renders in the theme accent.'
            )}</span
      >
    </p>
  </section>

  <ToggleCard
    icon="fas fa-power-off"
    title={text('FABRICATE.Admin.Manager.Essence.Enabled', 'Enabled')}
    sub={text(
      'FABRICATE.Admin.Manager.Essence.EnabledHint',
      'A disabled essence still counts and is consumed, but carries no effects or macro onto a crafted result.'
    )}
    on={enabled !== false}
    disabled={saving}
    section="enabled"
    field="essence-enabled"
    subAttr="data-essence-enabled-state"
    toggleLabel={enabled !== false
      ? text('FABRICATE.Admin.Manager.Essence.DisableThis', 'Disable this essence')
      : text('FABRICATE.Admin.Manager.Essence.EnableThis', 'Enable this essence')}
    onToggle={(next) => onEnabledChange(next)}
  />
</div>

<style>
  .manager-essence-tab-stack {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }

  /* The ONLY definition of this block: a global twin declared the same properties at equal
     specificity, making the winner a coin-toss rather than a decision.

     `align-items: stretch`, because the tile is a fixed square and the column is narrowed to
     match, so the actions row fills the column instead of hanging off the tile's right. */
  .manager-essence-icon-panel {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* The wrapper `Medallion` needs, being a closed leaf with no slot: `position: relative` is what
     the reset overlay positions against. */
  .manager-essence-icon-tile {
    position: relative;
  }

  /* Hidden by default, revealed on tile HOVER and on button FOCUS independently — never folded
     into one rule — because a hover-only reveal is unreachable without a pointer, and
     `:focus-visible` rather than `:focus` keeps a stray click from pinning it open. Hidden with
     `opacity` + `pointer-events`, NOT `visibility: hidden`, which removes the button from the tab
     order so the `:focus-visible` reveal could never fire.

     The reset is an `<IconButton>`, so the CHILD half of each selector is `:global` while the tile
     keeps its scoping — globalising both would let these rules escape to any component drawing a
     tile. Specificity is unchanged, because Svelte compiles a scoped descendant with `:where()`. */
  .manager-essence-icon-tile :global(.manager-essence-icon-reset) {
    position: absolute;
    top: var(--fab-space-1);
    right: var(--fab-space-1);
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease;
  }

  .manager-essence-icon-tile:hover :global(.manager-essence-icon-reset),
  .manager-essence-icon-tile :global(.manager-essence-icon-reset:focus-visible) {
    opacity: 1;
    pointer-events: auto;
  }

  .manager-essence-colour-hint {
    font-size: 0.7rem;
  }

  .manager-essence-colour-state {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
    margin: 0;
    font-size: 0.7rem;
  }
</style>
