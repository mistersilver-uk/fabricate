<!-- Svelte 5 runes mode -->
<!--
  Reusable input shell for "provider + expression OR macro UUID" tuples used by
  gathering character modifier authoring (library card, drop row override, and
  hazard override). Renders a provider select followed by either an expression
  text input (for non-macro providers) or a macro UUID text input (for macro).
  The hidden alternative stays mounted as aria-hidden so callers can keep
  controlled state on both fields without losing focus across provider swaps.
-->
<script>
  import { localize } from '../util/foundryBridge.js';

  let {
    provider = 'dnd5e',
    expression = '',
    macroUuid = '',
    onProviderChange = () => {},
    onExpressionChange = () => {},
    onMacroUuidChange = () => {},
    idPrefix = 'provider-expression',
    disabled = false,
    providerLabelKey = 'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Provider',
    providerLabelFallback = 'Provider',
    expressionLabelKey = 'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Expression',
    expressionLabelFallback = 'Expression',
    macroUuidLabelKey = 'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.MacroUuid',
    macroUuidLabelFallback = 'Macro UUID'
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const providerId = $derived(`${idPrefix}-provider`);
  const expressionId = $derived(`${idPrefix}-expression`);
  const macroUuidId = $derived(`${idPrefix}-macro-uuid`);
  const isMacro = $derived(provider === 'macro');
</script>

<div class="manager-provider-expression-input">
  <label class="manager-field" for={providerId}>
    <span>{text(providerLabelKey, providerLabelFallback)}</span>
    <select
      id={providerId}
      value={provider}
      disabled={disabled}
      onchange={(event) => onProviderChange(event.currentTarget.value)}
    >
      <option value="dnd5e">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.ProviderDnd5e', 'D&D 5e')}</option>
      <option value="pf2e">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.ProviderPf2e', 'Pathfinder 2e')}</option>
      <option value="macro">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.ProviderMacro', 'Macro')}</option>
    </select>
  </label>
  <label class="manager-field" for={expressionId} aria-hidden={isMacro ? 'true' : undefined} style={isMacro ? 'display:none;' : ''}>
    <span>{text(expressionLabelKey, expressionLabelFallback)}</span>
    <input
      type="text"
      id={expressionId}
      value={expression}
      disabled={disabled || isMacro}
      aria-describedby={providerId}
      oninput={(event) => onExpressionChange(event.currentTarget.value)}
    />
  </label>
  <label class="manager-field" for={macroUuidId} aria-hidden={isMacro ? undefined : 'true'} style={isMacro ? '' : 'display:none;'}>
    <span>{text(macroUuidLabelKey, macroUuidLabelFallback)}</span>
    <input
      type="text"
      id={macroUuidId}
      value={macroUuid}
      disabled={disabled || !isMacro}
      aria-describedby={providerId}
      oninput={(event) => onMacroUuidChange(event.currentTarget.value)}
    />
  </label>
</div>
