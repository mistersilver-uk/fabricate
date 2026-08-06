<!-- Svelte 5 runes mode -->
<!--
  The essence editor's IDENTITY tab (issue 1036): icon, name, description, colour palette,
  and the Enabled row.

  ── THE COLOUR PALETTE IS INLINE, AND IT HAS A NO-COLOUR CELL ─────────────────────
  The shipped editor reached "no colour" only through a separate Clear button beside a
  popover TRIGGER. The prototype shows the palette itself, inline — so it is rendered
  through `ManagerColorPopover`'s gated `layout="inline"` mode with `allowNone`, because an
  inline palette WITHOUT that cell would be a one-way door: once a colour is chosen there
  would be no route back to the accent default. Both props are off by default, so the
  environments biome popover and the character-modifier picker are untouched.

  Unset is a FIRST-CLASS state, not a failure. An essence with no colour renders in the
  theme accent, which is what every essence rendered as before issue 917, so the palette
  marks the No-colour cell rather than falsely marking Sage.

  ── THE ENABLED ROW IS `ToggleCard` ───────────────────────────────────────────────
  Its shape is exactly icon · title · sub-line · switch, which is this row. A blocking
  validation issue does NOT disable the switch: the prototype's subtitle asserts a gate this
  change does not implement, and that copy is dropped.
-->
<script>
  import IconPicker from '../../../components/IconPicker.svelte';
  import ManagerColorPopover from '../../../components/ManagerColorPopover.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import ToggleCard from '../ToggleCard.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { DEFAULT_ESSENCE_ICON, normalizeEssenceIcon } from '../../../util/essenceIcons.js';

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
      <div class="manager-essence-icon-panel">
        <span class="manager-essence-field-label"
          >{text('FABRICATE.Admin.Manager.Essence.Icon', 'Icon')}</span
        >
        <!-- The large tile. It carries the essence's own colour, so the GM sees the choice
             they just made rather than a preview in the theme accent.

             SQUARE, not block (issue 1036, maintainer round 3). The round-2 `block` filled
             the column WIDTH and kept `size` only as its height, so a widened column
             stretched the tile into a rectangle. The maintainer's note is that the icon must
             read as a square: `size={124}` alone sets both dimensions, and the column below
             is narrowed to that same 124px (`--fab-mv2-essence-icon-column`) so the picker
             row shrinks to fit beneath the tile rather than hanging past it. `glyph`
             stays: at the shared 0.9rem (~14px) default the flame was a speck in a 124px
             tile, and the prototype's flame fills roughly a third of the tile's edge.

             The RESET is an OVERLAY on the tile now (maintainer feedback), not a second
             control beside the picker: `Medallion` is a closed leaf with no slot, so this
             wrapper gives the reset something to position against. It is invisible until the
             tile is hovered or the button itself takes keyboard focus — `:focus-visible`
             keeps it keyboard-reachable independent of hover, which a hover-only reveal would
             have made unreachable without a pointer. -->
        <div class="manager-essence-icon-tile">
          <Medallion icon={normalizedIcon} tint={colorToken || ''} size={124} glyph={44} />
          <button
            type="button"
            class="manager-icon-button manager-essence-icon-reset"
            data-essence-icon-reset
            disabled={saving || normalizedIcon === DEFAULT_ESSENCE_ICON}
            aria-label={text('FABRICATE.Admin.Manager.Essence.ClearIcon', 'Clear icon')}
            title={text('FABRICATE.Admin.Manager.Essence.ClearIcon', 'Clear icon')}
            onclick={() => onIconChange(DEFAULT_ESSENCE_ICON)}
          >
            <i class="fas fa-undo" aria-hidden="true"></i>
          </button>
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
        <label class="manager-field" for="manager-essence-edit-name">
          <span>{text('FABRICATE.Admin.Manager.Essence.Name', 'Name')}</span>
          <input
            id="manager-essence-edit-name"
            type="text"
            value={name}
            oninput={(event) => onNameChange(event.currentTarget.value)}
            placeholder={text('FABRICATE.Admin.Manager.Essence.NamePlaceholder', 'Essence name')}
            disabled={saving}
            required
          />
        </label>

        <label class="manager-field" for="manager-essence-edit-description">
          <span>{text('FABRICATE.Admin.Manager.Essence.Description', 'Description')}</span>
          <textarea
            id="manager-essence-edit-description"
            rows="5"
            value={description}
            oninput={(event) => onDescriptionChange(event.currentTarget.value)}
            placeholder={text(
              'FABRICATE.Admin.Manager.Essence.DescriptionPlaceholder',
              'Description'
            )}
            disabled={saving}></textarea>
        </label>
      </div>
    </div>
  </section>

  <section class="manager-edit-card" data-manager-essence-colour>
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
    <!-- No colour-NAME copy here (maintainer feedback): naming the swatch was overhead the
         palette already carries visually, across every theme and colour combination. The
         Authored/Unset sentence stays — it names no colour, only whether one is set. -->
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

  /* The ONLY definition of this block. A global twin declared the same properties at equal
     specificity, which makes which one wins a cascade coin-toss rather than a decision, so
     it was retired and its `min-width: 0` folded in here.

     `align-items: stretch` (issue 1036). The tile is now a fixed 124px SQUARE and the column
     is narrowed to that same 124px, so stretch makes the actions row beneath fill the
     column too — the picker shrinks to the tile's width and shares its edges rather than
     the picker's natural width hanging off the right of the narrower tile. */
  .manager-essence-icon-panel {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* The tile wrapper `Medallion` needs because it is a closed leaf with no slot (maintainer
     feedback): the reset now overlays the tile instead of sitting beside the picker as a
     second control, and `position: relative` is what an absolutely-positioned overlay
     positions against. */
  .manager-essence-icon-tile {
    position: relative;
  }

  /* Hidden by default. Revealed on tile HOVER and on button FOCUS independently — never
     folded into one `:hover, :focus` rule — because a hover-only reveal is unreachable
     without a pointer and `:focus-visible` (not `:focus`) keeps a stray mouse-click focus
     from pinning it open outside keyboard use. Hidden with `opacity` + `pointer-events`,
     NOT `visibility: hidden`: `visibility: hidden` removes the button from the tab order, so
     a keyboard user could never focus it and the `:focus-visible` reveal below could never
     fire — the exact catch-22 this design exists to avoid. `opacity: 0` keeps it focusable;
     `pointer-events: none` stops the invisible corner intercepting a click until revealed. */
  .manager-essence-icon-tile .manager-essence-icon-reset {
    position: absolute;
    top: var(--fab-space-1);
    right: var(--fab-space-1);
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease;
  }

  .manager-essence-icon-tile:hover .manager-essence-icon-reset,
  .manager-essence-icon-tile .manager-essence-icon-reset:focus-visible {
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
