<!-- Svelte 5 runes mode -->
<!--
  World > Currency.

  The currency configuration is WORLD scope (issue 1278), not per crafting system: a world runs
  exactly one Foundry game system, so there is exactly one way actors store coins. Spend strategy,
  provider and the coin ladder therefore cannot meaningfully differ between two crafting systems,
  and this is the one place they are authored.

  What a crafting system still owns is a single boolean — whether it PARTICIPATES — which lives on
  its System Settings tab as the Currency toggle. That toggle gates authoring affordances, player
  display and engine consideration for that system; it does not gate this page, which stays
  reachable so a GM can configure the coins BEFORE any system opts in.

  This markup is the editor that used to live inside SystemEditView's Settings tab, moved
  wholesale rather than redesigned. GM-only by construction: the whole crafting manager is
  GM-scoped.
-->
<script>
  import Chip from '../Chip.svelte';
  import EmptyState from '../EmptyState.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { dragDrop } from '../../../actions/dragDrop.js';
  import { resolveDropData } from '../../../util/dropUtils.js';
  import IconPicker from '../../../components/IconPicker.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';

  let {
    currencyUnits = [],
    currencyPresetsSupported = false,
    currencySpendStrategy = 'actorProperty',
    currencyProviderId = '',
    currencyMacros = { canAfford: '', increment: '', decrement: '' },
    currencyProviderOptions = [],
    onAddCurrencyUnit = async () => null,
    onUpdateCurrencyUnit = async () => {},
    onDeleteCurrencyUnit = async () => {},
    onReorderCurrencyUnit = async () => {},
    onAddCurrencySubUnit = async () => {},
    onUpdateCurrencySubUnit = async () => {},
    onDeleteCurrencySubUnit = async () => {},
    onSeedCurrencyPresets = async () => {},
    onSetCurrencySpendStrategy = async () => {},
    onSetCurrencyProvider = async () => {},
    onSetCurrencyMacro = async () => {},
    onClearCurrencyMacro = async () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Manual reorder (issue 768). The Move up/down chevrons reflow the list, so without sight of
  // it the move is only observable through this polite live region — it travels with the list it
  // serves rather than staying behind on the Settings tab.
  let reorderAnnouncement = $state('');
  function announceReorder(name, position, total) {
    reorderAnnouncement = localize('FABRICATE.Admin.Manager.ListErgonomics.ReorderedAnnouncement', {
      name: String(name || '').trim(),
      position: String(position),
      total: String(total),
    });
    if (
      !reorderAnnouncement ||
      reorderAnnouncement === 'FABRICATE.Admin.Manager.ListErgonomics.ReorderedAnnouncement'
    ) {
      reorderAnnouncement = `Moved ${String(name || '').trim()} to position ${position} of ${total}.`;
    }
  }
  async function reorderList(reorderOp, index, delta, name, total) {
    const toIndex = index + delta;
    await reorderOp(index, toIndex);
    announceReorder(name, toIndex + 1, total);
  }

  const CURRENCY_SPEND_STRATEGY_OPTIONS = [
    {
      value: 'actorProperty',
      labelKey: 'FABRICATE.Admin.Manager.CurrencyUnits.SpendStrategyActorProperty',
      fallback: 'Actor data path',
      hintKey: 'FABRICATE.Admin.Manager.CurrencyUnits.SpendStrategyActorPropertyHint',
      hintFallback: 'Read and spend coins at a flat actor data path (e.g. dnd5e currency).',
    },
    {
      value: 'actorInventory',
      labelKey: 'FABRICATE.Admin.Manager.CurrencyUnits.SpendStrategyActorInventory',
      fallback: 'Actor inventory',
      hintKey: 'FABRICATE.Admin.Manager.CurrencyUnits.SpendStrategyActorInventoryHint',
      hintFallback:
        'Use a preconfigured provider that reads and spends coins from the actor inventory (e.g. pf2e).',
    },
    {
      value: 'macro',
      labelKey: 'FABRICATE.Admin.Manager.CurrencyUnits.SpendStrategyMacro',
      fallback: 'Macro',
      hintKey: 'FABRICATE.Admin.Manager.CurrencyUnits.SpendStrategyMacroHint',
      hintFallback:
        'Drive currency with your own macros; the macro receives the actor and does whatever it needs.',
    },
  ];
  const CURRENCY_MACRO_FIELDS = [
    {
      key: 'canAfford',
      labelKey: 'FABRICATE.Admin.Manager.CurrencyUnits.MacroCanAfford',
      labelFallback: 'Can afford macro',
      hintKey: 'FABRICATE.Admin.Manager.CurrencyUnits.MacroCanAffordHint',
      hintFallback:
        'Runs to gate the craft; return true (or { canAfford: true }) when the actor can pay.',
    },
    {
      key: 'increment',
      labelKey: 'FABRICATE.Admin.Manager.CurrencyUnits.MacroIncrement',
      labelFallback: 'Increment macro',
      hintKey: 'FABRICATE.Admin.Manager.CurrencyUnits.MacroIncrementHint',
      hintFallback: 'Reserved for a future refund flow — configured now but not yet invoked.',
    },
    {
      key: 'decrement',
      labelKey: 'FABRICATE.Admin.Manager.CurrencyUnits.MacroDecrement',
      labelFallback: 'Decrement macro',
      hintKey: 'FABRICATE.Admin.Manager.CurrencyUnits.MacroDecrementHint',
      hintFallback: 'Runs after a successful craft to spend the currency cost.',
    },
  ];

  // Resolve each configured macro UUID to a { name, img, missing } display, mirroring the
  // RecipeContextRail/EnvironmentSummaryInspector linked-document pattern.
  let currencyMacroDocs = $state({});

  function setCurrencyMacroDoc(key, doc) {
    currencyMacroDocs = { ...currencyMacroDocs, [key]: doc };
  }

  // Kick off async resolution for one macro field; returns the synchronous placeholder. The
  // async branches each live in their own callback so this helper stays shallow.
  function resolveMacroFieldDoc(key, uuid, isCancelled) {
    const placeholder = { uuid, name: '', img: '', missing: false };
    if (typeof globalThis.fromUuid !== 'function') {
      return { ...placeholder, missing: true };
    }
    Promise.resolve(globalThis.fromUuid(uuid))
      .then((doc) => {
        if (isCancelled()) return;
        setCurrencyMacroDoc(
          key,
          doc
            ? { uuid, name: String(doc.name || ''), img: String(doc.img || ''), missing: false }
            : { ...placeholder, missing: true }
        );
      })
      .catch(() => {
        if (!isCancelled()) setCurrencyMacroDoc(key, { ...placeholder, missing: true });
      });
    return placeholder;
  }

  $effect(() => {
    const macros = currencyMacros || {};
    const next = {};
    let cancelled = false;
    const isCancelled = () => cancelled;
    for (const field of CURRENCY_MACRO_FIELDS) {
      const uuid = String(macros[field.key] || '').trim();
      if (uuid) next[field.key] = resolveMacroFieldDoc(field.key, uuid, isCancelled);
    }
    currencyMacroDocs = next;
    return () => {
      cancelled = true;
    };
  });

  function currencyMacroDisplay(key) {
    return currencyMacroDocs[key] || null;
  }

  // Each empty macro drop zone needs a field-specific accessible name; otherwise the three zones
  // (canAfford/increment/decrement) expose an identical "Drag a macro here to link it." label and
  // are indistinguishable to assistive tech. Compose the visible field label with the drop hint.
  function currencyMacroDropZoneLabel(field) {
    const fieldLabel = text(field.labelKey, field.labelFallback);
    const composed = localize('FABRICATE.Admin.Manager.CurrencyUnits.MacroDropZoneLabel', {
      field: fieldLabel,
    });
    if (composed && composed !== 'FABRICATE.Admin.Manager.CurrencyUnits.MacroDropZoneLabel') {
      return composed;
    }
    return `${fieldLabel}: ${text('FABRICATE.Admin.Manager.CurrencyUnits.MacroDropHint', 'Drag a macro here to link it.')}`;
  }

  async function handleCurrencyMacroDrop(key, data) {
    const { uuid, type } = resolveDropData(data);
    if (type !== 'Macro' || !uuid) return;
    await onSetCurrencyMacro(key, uuid);
  }

  let currencyExpandedUnitId = $state('');
  let currencySubUnitSelections = $state({});

  const currencyHasProviders = $derived(currencyProviderOptions.length > 0);

  // Show the provider select only under the actorInventory strategy on a system that ships a
  // provider; otherwise the actorInventory branch renders the no-provider callout.
  const currencyShowProviderBranch = $derived(
    currencySpendStrategy === 'actorInventory' && currencyHasProviders
  );

  // Under the actorInventory strategy the selected provider owns the denomination ladder, so
  // currency units are provider-managed and read-only — editing them would desync the engine's
  // affordability/baseValue math from the system's real coin values. A no-provider system is never
  // read-only because its units stay GM-owned.
  const currencyUnitsReadOnly = $derived(currencyShowProviderBranch);

  // Under the macro strategy the configured macros own all conversion via unit abbreviations, so a
  // unit's `contains` breakdown is unused. The per-unit editor collapses to label/abbreviation/icon
  // and the whole sub-unit section (heading, add control, chips, warnings) is removed. Sub-units
  // only drive the engine under actorProperty (their `contains` feeds base-value and change-making).
  const currencyMacroMode = $derived(currencySpendStrategy === 'macro');

  function currencyProviderLabel() {
    const match = currencyProviderOptions.find((option) => option.id === currencyProviderId);
    return match?.label || text('FABRICATE.Admin.Manager.CurrencyUnits.Provider', 'Provider');
  }

  function currencyProviderManagedHint() {
    return localize('FABRICATE.Admin.Manager.CurrencyUnits.ProviderManagedHint', {
      provider: currencyProviderLabel(),
    });
  }

  // The strategy select renders one shared hint that reflects the selected strategy, so the GM
  // sees the actor-data-path / actor-inventory / macro guidance inline as they switch.
  function currencySpendStrategyHint() {
    const option =
      CURRENCY_SPEND_STRATEGY_OPTIONS.find((entry) => entry.value === currencySpendStrategy) ||
      CURRENCY_SPEND_STRATEGY_OPTIONS[0];
    return text(option.hintKey, option.hintFallback);
  }
  async function handleAddCurrencyUnit() {
    const unit = await onAddCurrencyUnit();
    if (unit?.id) currencyExpandedUnitId = unit.id;
  }

  async function handleDeleteCurrencyUnit(unitId) {
    await onDeleteCurrencyUnit(unitId);
    if (currencyExpandedUnitId === unitId) currencyExpandedUnitId = '';
  }

  function currencyUnitLabel(unitId) {
    const unit = currencyUnits.find((entry) => entry.id === unitId);
    return unit?.label || unit?.abbreviation || unitId;
  }

  function currencyUnitIcon(unitId) {
    const unit = currencyUnits.find((entry) => entry.id === unitId);
    return unit?.icon || 'fa-solid fa-coins';
  }

  // Mirror of canAddCurrencySubUnit in src/systems/currencyProfile.js: a unit (plus everything it
  // transitively contains) reachable from the parent and from the child must be disjoint, or adding
  // the edge would give the parent two conversion paths to some node.
  function currencyReachableUnitIds(startUnitId) {
    // Function-local graph-walk scratch, discarded when the function returns.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const reachable = new Set();
    const stack = [startUnitId];
    while (stack.length > 0) {
      const currentId = stack.pop();
      if (!currentId || reachable.has(currentId)) continue;
      reachable.add(currentId);
      const unit = currencyUnits.find((entry) => entry.id === currentId);
      for (const contained of unit?.contains || []) {
        stack.push(contained.unitId);
      }
    }
    return reachable;
  }

  function currencyCanAddSubUnit(parentUnitId, subUnitId) {
    if (!parentUnitId || !subUnitId || parentUnitId === subUnitId) return false;
    const parent = currencyUnits.find((entry) => entry.id === parentUnitId);
    const child = currencyUnits.find((entry) => entry.id === subUnitId);
    if (!parent || !child) return false;
    const parentReachable = currencyReachableUnitIds(parentUnitId);
    const childReachable = currencyReachableUnitIds(subUnitId);
    for (const id of childReachable) {
      if (parentReachable.has(id)) return false;
    }
    return true;
  }

  function currencyUnitSubUnitOptions(unitId) {
    return currencyUnits
      .filter((entry) => currencyCanAddSubUnit(unitId, entry.id))
      .map((entry) => ({
        id: entry.id,
        label: entry.label || entry.id,
        abbreviation: entry.abbreviation || '',
      }));
  }

  function currencySelectedSubUnit(unitId) {
    const options = currencyUnitSubUnitOptions(unitId);
    const selected = currencySubUnitSelections[unitId] || '';
    return options.some((option) => option.id === selected) ? selected : options[0]?.id || '';
  }

  function updateCurrencySubUnitSelection(unitId, value) {
    currencySubUnitSelections = { ...currencySubUnitSelections, [unitId]: value };
  }

  async function handleAddCurrencySubUnit(unitId) {
    const subUnitId = currencySelectedSubUnit(unitId);
    if (!subUnitId) return;
    await onAddCurrencySubUnit(unitId, subUnitId);
    updateCurrencySubUnitSelection(unitId, '');
  }

  $effect(() => {
    if (
      currencyExpandedUnitId &&
      !currencyUnits.some((unit) => unit.id === currencyExpandedUnitId)
    ) {
      currencyExpandedUnitId = '';
    }
  });
</script>

<div class="manager-world-currency" data-world-currency-page>
  <div class="visually-hidden" role="status" aria-live="polite" data-list-reorder-announcement>
    {reorderAnnouncement}
  </div>
  <!--
    No collapse toggle, unlike the card this replaced. On the Settings tab collapsing yielded
    space to the sibling cards below it; as a whole route there is nothing to make room for, so
    the same control would only blank the page.
  -->
  <section
    class="manager-edit-card manager-currency-unit-card"
    data-world-currency-units
    aria-label={text('FABRICATE.Admin.Manager.CurrencyUnits.Title', 'Currency units')}
  >
    <header class="manager-character-modifier-card-header">
      <div class="manager-character-modifier-card-header-copy">
        <h2 class="manager-card-title">
          <i class="fa-solid fa-coins" aria-hidden="true"></i>
          {text('FABRICATE.Admin.Manager.CurrencyUnits.Title', 'Currency units')}
        </h2>
        <p class="manager-muted">
          {text(
            'FABRICATE.Admin.Manager.CurrencyUnits.Hint',
            'Define the coins of your world, and how they break down. Every crafting system that enables currency shares them.'
          )}
        </p>
      </div>
      {#if !currencyUnitsReadOnly}
        <div class="manager-character-modifier-card-header-actions">
          <ManagerButton role="primary" data-add-currency-unit onclick={handleAddCurrencyUnit}>
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
            {text('FABRICATE.Admin.Manager.CurrencyUnits.Add', 'Add currency unit')}
          </ManagerButton>
          <ManagerButton
            data-seed-currency-presets
            disabled={!currencyPresetsSupported}
            data-tooltip={!currencyPresetsSupported
              ? text(
                  'FABRICATE.Admin.Manager.CurrencyUnits.SeedPresetsUnsupported',
                  'Preset seeding is only available for dnd5e or pf2e worlds.'
                )
              : null}
            onclick={onSeedCurrencyPresets}
          >
            <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
            {text('FABRICATE.Admin.Manager.CurrencyUnits.SeedPresets', 'Seed presets')}
          </ManagerButton>
        </div>
      {/if}
    </header>

    <div id="manager-section-body-currency" class="manager-section-body">
      <div class="manager-currency-strategy" data-world-currency-strategy>
        <label class="manager-field">
          <span
            >{text('FABRICATE.Admin.Manager.CurrencyUnits.SpendStrategy', 'Spend strategy')}</span
          >
          <select
            value={currencySpendStrategy}
            data-world-currency-strategy-select
            onchange={(event) => onSetCurrencySpendStrategy(event.currentTarget.value)}
          >
            {#each CURRENCY_SPEND_STRATEGY_OPTIONS as option (option.value)}
              <option value={option.value}>{text(option.labelKey, option.fallback)}</option>
            {/each}
          </select>
          <small data-world-currency-strategy-hint>{currencySpendStrategyHint()}</small>
        </label>

        {#if currencyShowProviderBranch}
          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.Provider', 'Provider')}</span>
            <select
              value={currencyProviderId}
              data-world-currency-provider-select
              onchange={(event) => onSetCurrencyProvider(event.currentTarget.value)}
            >
              {#each currencyProviderOptions as option (option.id)}
                <option value={option.id}>{option.label}</option>
              {/each}
            </select>
            <small
              >{text(
                'FABRICATE.Admin.Manager.CurrencyUnits.ProviderHint',
                'A preconfigured adapter that reads and spends coins from the actor inventory.'
              )}</small
            >
          </label>
        {:else if currencySpendStrategy === 'actorInventory'}
          <div class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.Provider', 'Provider')}</span>
            <div
              class="manager-currency-subunit-warning manager-environment-comp-callout"
              role="note"
              data-world-currency-no-provider
            >
              <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
              <span
                >{text(
                  'FABRICATE.Admin.Manager.CurrencyUnits.NoProviders',
                  'No preconfigured providers for this system — use the Macro strategy instead.'
                )}</span
              >
            </div>
          </div>
        {:else if currencyMacroMode}
          <div
            class="manager-currency-macro-zones manager-currency-macro-row"
            data-world-currency-macros
          >
            {#each CURRENCY_MACRO_FIELDS as field (field.key)}
              {@const macroDoc = currencyMacroDisplay(field.key)}
              <div class="manager-field manager-currency-macro-field">
                <span>{text(field.labelKey, field.labelFallback)}</span>
                {#if macroDoc}
                  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                  <div
                    class="manager-environment-scene-linked"
                    data-world-currency-macro={field.key}
                    role="group"
                    aria-label={text(field.labelKey, field.labelFallback)}
                    title={text(
                      'FABRICATE.Admin.Manager.CurrencyUnits.MacroReplaceHint',
                      'Drop a macro to replace it, or right-click to unlink.'
                    )}
                    use:dragDrop={{
                      onDrop: (data) => handleCurrencyMacroDrop(field.key, data),
                      activeClass: 'is-drop-active',
                    }}
                    oncontextmenu={(event) => {
                      event.preventDefault();
                      onClearCurrencyMacro(field.key);
                    }}
                    onmousedown={(event) => {
                      if (event.button === 2) {
                        event.preventDefault();
                        onClearCurrencyMacro(field.key);
                      }
                    }}
                  >
                    {#if macroDoc.missing}
                      <span
                        class="manager-environment-scene-thumb is-placeholder"
                        aria-hidden="true"><i class="fas fa-triangle-exclamation"></i></span
                      >
                      <span
                        class="manager-environment-scene-name manager-muted"
                        data-world-currency-macro-missing
                        >{text(
                          'FABRICATE.Admin.Manager.CurrencyUnits.MacroMissing',
                          'Macro unresolved'
                        )}</span
                      >
                    {:else}
                      {#if macroDoc.img}
                        <img class="manager-environment-scene-thumb" src={macroDoc.img} alt="" />
                      {:else}
                        <span
                          class="manager-environment-scene-thumb is-placeholder"
                          aria-hidden="true"><i class="fas fa-scroll"></i></span
                        >
                      {/if}
                      <span class="manager-environment-scene-name"
                        >{macroDoc.name || macroDoc.uuid}</span
                      >
                    {/if}
                    <button
                      type="button"
                      class="manager-icon-button is-danger"
                      aria-label={text(
                        'FABRICATE.Admin.Manager.CurrencyUnits.MacroUnlink',
                        'Unlink macro'
                      )}
                      title={text(
                        'FABRICATE.Admin.Manager.CurrencyUnits.MacroUnlink',
                        'Unlink macro'
                      )}
                      onclick={(event) => {
                        event.stopPropagation();
                        onClearCurrencyMacro(field.key);
                      }}><i class="fas fa-link-slash" aria-hidden="true"></i></button
                    >
                  </div>
                {:else}
                  <div
                    class="manager-component-source-drop-zone manager-currency-macro-drop-zone"
                    data-world-currency-macro-dropzone={field.key}
                    role="group"
                    aria-label={currencyMacroDropZoneLabel(field)}
                    use:dragDrop={{
                      onDrop: (data) => handleCurrencyMacroDrop(field.key, data),
                      activeClass: 'is-drop-active',
                    }}
                  >
                    <i class="fas fa-scroll" aria-hidden="true"></i>
                    <span
                      >{text(
                        'FABRICATE.Admin.Manager.CurrencyUnits.MacroDropHint',
                        'Drag a macro here to link it.'
                      )}</span
                    >
                  </div>
                {/if}
                <small>{text(field.hintKey, field.hintFallback)}</small>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      {#if currencyUnitsReadOnly}
        <div
          class="manager-currency-subunit-warning manager-environment-comp-callout manager-currency-provider-managed-callout"
          role="note"
          data-world-currency-provider-managed
        >
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          <div class="manager-currency-provider-managed-copy">
            <strong
              >{text(
                'FABRICATE.Admin.Manager.CurrencyUnits.ProviderManagedTitle',
                'Provider-managed denominations'
              )}</strong
            >
            <span>{currencyProviderManagedHint()}</span>
          </div>
        </div>
        {#if currencyUnits.length === 0}
          <EmptyState
            icon="fas fa-coins"
            title={text('FABRICATE.Admin.Manager.CurrencyUnits.Empty', 'No currency units yet.')}
            hint={text(
              'FABRICATE.Admin.Manager.CurrencyUnits.EmptyHint',
              'Add a coin, or seed the presets for your world, using the buttons above.'
            )}
          />
        {:else}
          <ul
            class="manager-character-modifier-list manager-currency-provider-managed-list manager-currency-provider-managed-grid"
          >
            {#each currencyUnits as unit (unit.id)}
              <li class="manager-character-modifier-row" data-world-currency-unit={unit.id}>
                <div class="manager-currency-provider-managed-summary">
                  <span class="manager-character-modifier-icon"
                    ><i class={unit.icon || 'fa-solid fa-coins'} aria-hidden="true"></i></span
                  >
                  <div class="manager-currency-readonly-fields">
                    <div class="manager-currency-readonly-field">
                      <span class="manager-currency-readonly-label"
                        >{text('FABRICATE.Admin.Manager.CurrencyUnits.Label', 'Label')}</span
                      >
                      <span
                        class="manager-currency-readonly-value"
                        data-world-currency-readonly-label>{unit.label || unit.id}</span
                      >
                    </div>
                    <div class="manager-currency-readonly-field">
                      <span class="manager-currency-readonly-label"
                        >{text(
                          'FABRICATE.Admin.Manager.CurrencyUnits.Abbreviation',
                          'Abbreviation'
                        )}</span
                      >
                      <span class="manager-currency-readonly-value" data-world-currency-abbreviation
                        >{unit.abbreviation || '—'}</span
                      >
                    </div>
                    <div class="manager-currency-readonly-field">
                      <span class="manager-currency-readonly-label"
                        >{text(
                          'FABRICATE.Admin.Manager.CurrencyUnits.Denomination',
                          'Coin denomination'
                        )}</span
                      >
                      <span class="manager-currency-readonly-value" data-world-currency-denomination
                        >{unit.denomination || unit.id}</span
                      >
                    </div>
                  </div>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      {:else if currencyUnits.length === 0}
        <EmptyState
          icon="fas fa-coins"
          title={text('FABRICATE.Admin.Manager.CurrencyUnits.Empty', 'No currency units yet.')}
          hint={text(
            'FABRICATE.Admin.Manager.CurrencyUnits.EmptyHint',
            'Add a coin, or seed the presets for your world, using the buttons above.'
          )}
        />
      {:else}
        <ul class="manager-character-modifier-list">
          {#each currencyUnits as unit, index (unit.id)}
            {@const expanded = currencyExpandedUnitId === unit.id}
            {@const subUnitOptions = currencyUnitSubUnitOptions(unit.id)}
            <li class="manager-character-modifier-row" data-world-currency-unit={unit.id}>
              {#if expanded}
                <div class="manager-character-modifier-editor">
                  <div class="manager-edit-grid manager-currency-edit-grid">
                    <label class="manager-field">
                      <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.Label', 'Label')}</span>
                      <input
                        type="text"
                        value={unit.label}
                        oninput={(event) =>
                          onUpdateCurrencyUnit(unit.id, {
                            label: event.currentTarget.value,
                          })}
                      />
                    </label>
                    <label class="manager-field">
                      <span
                        >{text(
                          'FABRICATE.Admin.Manager.CurrencyUnits.Abbreviation',
                          'Abbreviation'
                        )}</span
                      >
                      <input
                        type="text"
                        value={unit.abbreviation}
                        oninput={(event) =>
                          onUpdateCurrencyUnit(unit.id, {
                            abbreviation: event.currentTarget.value,
                          })}
                      />
                    </label>
                    <div class="manager-field">
                      <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.Icon', 'Icon')}</span>
                      <IconPicker
                        value={unit.icon || 'fa-solid fa-coins'}
                        buttonTitle={text(
                          'FABRICATE.Admin.Manager.CurrencyUnits.ChangeIcon',
                          'Change icon'
                        )}
                        onChange={(iconClass) => onUpdateCurrencyUnit(unit.id, { icon: iconClass })}
                      />
                    </div>
                  </div>

                  {#if currencyMacroMode}
                    <small
                      class="manager-currency-macro-note"
                      role="note"
                      data-world-currency-unit-macro-note
                      >{text(
                        'FABRICATE.Admin.Manager.CurrencyUnits.MacroConversionHint',
                        'Conversion between this unit and others is handled by your configured currency macros, matched by abbreviation.'
                      )}</small
                    >
                  {:else}
                    <div class="manager-edit-grid manager-currency-detail-grid">
                      <label class="manager-field">
                        <span
                          >{text(
                            'FABRICATE.Admin.Manager.CurrencyUnits.ActorPath',
                            'Actor data path'
                          )}</span
                        >
                        <input
                          type="text"
                          value={unit.actorPath}
                          placeholder="system.currency.gp"
                          oninput={(event) =>
                            onUpdateCurrencyUnit(unit.id, {
                              actorPath: event.currentTarget.value,
                            })}
                        />
                      </label>
                      {#if subUnitOptions.length > 0}
                        <div class="manager-currency-subunit-builder">
                          <label class="manager-field">
                            <span
                              >{text(
                                'FABRICATE.Admin.Manager.CurrencyUnits.AddSubUnit',
                                'Add sub-unit'
                              )}</span
                            >
                            <select
                              value={currencySelectedSubUnit(unit.id)}
                              onchange={(event) =>
                                updateCurrencySubUnitSelection(unit.id, event.currentTarget.value)}
                            >
                              {#each subUnitOptions as option (option.id)}
                                <option value={option.id}
                                  >{option.label}{option.abbreviation
                                    ? ` (${option.abbreviation})`
                                    : ''}</option
                                >
                              {/each}
                            </select>
                          </label>
                          <button
                            type="button"
                            class="manager-icon-button"
                            aria-label={text(
                              'FABRICATE.Admin.Manager.CurrencyUnits.AddSubUnit',
                              'Add sub-unit'
                            )}
                            onclick={() => handleAddCurrencySubUnit(unit.id)}
                          >
                            <i class="fa-solid fa-plus" aria-hidden="true"></i>
                          </button>
                        </div>
                      {:else}
                        <div class="manager-field">
                          <span
                            >{text(
                              'FABRICATE.Admin.Manager.CurrencyUnits.AddSubUnit',
                              'Add sub-unit'
                            )}</span
                          >
                          <div class="manager-currency-subunit-warning" role="note">
                            <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                            {#if currencyUnits.length <= 1}
                              <span
                                >{text(
                                  'FABRICATE.Admin.Manager.CurrencyUnits.NoOtherUnits',
                                  'Add another currency unit before defining a breakdown.'
                                )}</span
                              >
                            {:else}
                              <span
                                >{text(
                                  'FABRICATE.Admin.Manager.CurrencyUnits.NoEligibleSubUnits',
                                  'No eligible sub-units — every other unit already breaks down into this one.'
                                )}</span
                              >
                            {/if}
                          </div>
                        </div>
                      {/if}
                    </div>

                    <div class="manager-currency-subunit-section">
                      <p class="manager-card-title manager-currency-subunit-heading">
                        {text('FABRICATE.Admin.Manager.CurrencyUnits.SubUnits', 'Sub-units')}
                      </p>
                      {#if (unit.contains || []).length > 0}
                        <div
                          class="manager-availability-pill-row"
                          aria-label={text(
                            'FABRICATE.Admin.Manager.CurrencyUnits.SubUnits',
                            'Sub-units'
                          )}
                        >
                          {#each unit.contains as contained (contained.unitId)}
                            <span
                              class="manager-availability-pill is-currency"
                              data-world-currency-subunit={contained.unitId}
                            >
                              <i class={currencyUnitIcon(contained.unitId)} aria-hidden="true"></i>
                              <span>{currencyUnitLabel(contained.unitId)}</span>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                class="manager-availability-pill-amount"
                                value={contained.amount}
                                aria-label={`${currencyUnitLabel(contained.unitId)} ${text('FABRICATE.Admin.Manager.CurrencyUnits.SubUnitAmount', 'Sub-unit amount').toLowerCase()}`}
                                oninput={(event) =>
                                  onUpdateCurrencySubUnit(
                                    unit.id,
                                    contained.unitId,
                                    event.currentTarget.value
                                  )}
                              />
                              <button
                                type="button"
                                class="manager-availability-remove"
                                aria-label={`${text('FABRICATE.Admin.Manager.CurrencyUnits.RemoveSubUnit', 'Remove sub-unit')} (${currencyUnitLabel(contained.unitId)})`}
                                onclick={() => onDeleteCurrencySubUnit(unit.id, contained.unitId)}
                              >
                                <i class="fas fa-xmark" aria-hidden="true"></i>
                              </button>
                            </span>
                          {/each}
                        </div>
                      {:else}
                        <p class="manager-muted">
                          {text(
                            'FABRICATE.Admin.Manager.CurrencyUnits.NoSubUnits',
                            'This unit is a base denomination.'
                          )}
                        </p>
                      {/if}
                    </div>
                  {/if}

                  <div class="manager-character-modifier-actions">
                    <ManagerButton
                      data-currency-unit-done
                      onclick={() => (currencyExpandedUnitId = '')}
                      >{text('FABRICATE.Admin.Manager.Done', 'Done')}</ManagerButton
                    >
                    <ManagerButton
                      role="danger"
                      data-currency-unit-delete
                      onclick={() => handleDeleteCurrencyUnit(unit.id)}
                      >{text(
                        'FABRICATE.Admin.Manager.CurrencyUnits.Delete',
                        'Delete currency unit'
                      )}</ManagerButton
                    >
                  </div>
                </div>
              {:else}
                <div class="manager-character-modifier-summary">
                  <span class="manager-character-modifier-icon"
                    ><i class={unit.icon || 'fa-solid fa-coins'} aria-hidden="true"></i></span
                  >
                  <span class="manager-character-modifier-label">{unit.label || unit.id}</span>
                  <Chip
                    >{(unit.contains || []).length}
                    {text('FABRICATE.Admin.Manager.CurrencyUnits.SubUnitCount', 'sub-units')}</Chip
                  >
                  <button
                    type="button"
                    class="manager-icon-button"
                    aria-label={text('FABRICATE.Admin.Manager.ListErgonomics.MoveUp', 'Move up')}
                    data-tooltip={text('FABRICATE.Admin.Manager.ListErgonomics.MoveUp', 'Move up')}
                    data-move-currency-up={unit.id}
                    disabled={index === 0}
                    onclick={() =>
                      reorderList(
                        onReorderCurrencyUnit,
                        index,
                        -1,
                        unit.label || unit.id,
                        currencyUnits.length
                      )}
                  >
                    <i class="fa-solid fa-chevron-up" aria-hidden="true"></i>
                  </button>
                  <button
                    type="button"
                    class="manager-icon-button"
                    aria-label={text(
                      'FABRICATE.Admin.Manager.ListErgonomics.MoveDown',
                      'Move down'
                    )}
                    data-tooltip={text(
                      'FABRICATE.Admin.Manager.ListErgonomics.MoveDown',
                      'Move down'
                    )}
                    data-move-currency-down={unit.id}
                    disabled={index === currencyUnits.length - 1}
                    onclick={() =>
                      reorderList(
                        onReorderCurrencyUnit,
                        index,
                        1,
                        unit.label || unit.id,
                        currencyUnits.length
                      )}
                  >
                    <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
                  </button>
                  <button
                    type="button"
                    class="manager-icon-button"
                    aria-label={text(
                      'FABRICATE.Admin.Manager.CurrencyUnits.Edit',
                      'Edit currency unit'
                    )}
                    onclick={() => (currencyExpandedUnitId = unit.id)}
                  >
                    <i class="fa-solid fa-pen" aria-hidden="true"></i>
                  </button>
                  <button
                    type="button"
                    class="manager-icon-button is-danger"
                    aria-label={text(
                      'FABRICATE.Admin.Manager.CurrencyUnits.Delete',
                      'Delete currency unit'
                    )}
                    onclick={() => handleDeleteCurrencyUnit(unit.id)}
                  >
                    <i class="fa-solid fa-trash" aria-hidden="true"></i>
                  </button>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </section>
</div>
