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
  import { managerColorTokenLabel } from '../../../util/managerColorTokens.js';
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
  const colourName = $derived(
    colorToken
      ? managerColorTokenLabel(colorToken, localize)
      : text('FABRICATE.Admin.Manager.Essence.Colour.None', 'No colour')
  );
</script>

<div class="manager-essence-tab-stack" data-essence-tab-panel="identity">
  <section class="manager-edit-card">
    <div class="manager-essence-edit-grid">
      <div class="manager-essence-icon-panel">
        <span class="manager-essence-field-label"
          >{text('FABRICATE.Admin.Manager.Essence.Icon', 'Icon')}</span
        >
        <!-- The large tile. It carries the essence's own colour, so the GM sees the choice
             they just made rather than a preview in the theme accent. -->
        <Medallion icon={normalizedIcon} tint={colorToken || ''} size={96} />
        <div class="manager-essence-icon-actions">
          <IconPicker
            value={icon}
            disabled={saving}
            buttonTitle={text('FABRICATE.Admin.Manager.Essence.ChangeIcon', 'Change icon')}
            onChange={(iconClass) => onIconChange(iconClass)}
          />
          <button
            type="button"
            class="manager-button"
            data-essence-icon-reset
            disabled={saving || normalizedIcon === DEFAULT_ESSENCE_ICON}
            onclick={() => onIconChange(DEFAULT_ESSENCE_ICON)}
          >
            <i class="fas fa-undo" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Essence.ClearIcon', 'Clear icon')}</span>
          </button>
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
    <p
      class="manager-muted manager-essence-colour-state"
      data-essence-colour-state={colorToken || 'none'}
    >
      <strong>{colourName}</strong>
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

  .manager-essence-icon-panel {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--fab-space-2);
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
