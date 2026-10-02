<!-- Svelte 5 runes mode -->
<!--
  A counting pool's `Allow players to roll additional dice` group (issue 2008): the toggle at the
  group's head, then what pays for the dice — a stored path on the crafting character or a
  read/spend macro pair — the Resource name and the most dice per roll.

  Props: `additionalDice` (the normalized record) and `character` (the Preview-as
  `previewCharacter`, or null). `onChange(record)` receives the whole record with one key changed,
  so turning the toggle off or switching the source keeps every other key.
-->
<script>
  import {
    MACRO_DROP_REJECTED_NOT_SCRIPT,
    evaluateMacroDrop,
    resolveMacroName,
  } from '../../../../model/macroReference.js';
  import Field from '../../../components/Field.svelte';
  import ItemDropZone from '../../../components/ItemDropZone.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { resolveDropUuid } from '../../../util/dropUtils.js';
  import { localize, notifyError, notifyInfo, notifyWarn } from '../../../util/foundryBridge.js';
  import CheckCharacterValueField from './CheckCharacterValueField.svelte';
  import CheckOptionGroup from './CheckOptionGroup.svelte';

  let { additionalDice, character = null, onChange = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const rule = $derived(additionalDice);
  const uid = $props.id();
  const regionId = `${uid}-additional-dice-fields`;
  const labelHintId = `${uid}-additional-dice-label-hint`;

  function write(key, next) {
    if (rule[key] === next) return;
    onChange({ ...rule, [key]: next });
  }

  const titles = $derived({
    toggle: text(
      'FABRICATE.Admin.Manager.Checks.AdditionalDice.Toggle',
      'Allow players to roll additional dice'
    ),
    source: text('FABRICATE.Admin.Manager.Checks.AdditionalDice.SourceTitle', 'Paid for by'),
    path: text(
      'FABRICATE.Admin.Manager.Checks.AdditionalDice.PathTitle',
      'Path on the crafting character'
    ),
    label: text('FABRICATE.Admin.Manager.Checks.AdditionalDice.LabelTitle', 'Resource name'),
    max: text(
      'FABRICATE.Admin.Manager.Checks.AdditionalDice.MaxTitle',
      'Most additional dice per roll'
    ),
  });

  const SOURCE_OPTIONS = [
    {
      value: 'path',
      labelKey: 'FABRICATE.Admin.Manager.Checks.AdditionalDice.SourcePath',
      fallback: 'Value on the crafting character',
    },
    {
      value: 'macro',
      labelKey: 'FABRICATE.Admin.Manager.Checks.AdditionalDice.SourceMacro',
      fallback: 'Read and spend macros',
    },
  ];

  const pathCopy = $derived({
    empty: text(
      'FABRICATE.Admin.Manager.Checks.AdditionalDice.PathEmpty',
      'No source set. Players cannot be offered additional dice until one is.'
    ),
    unresolved: text(
      'FABRICATE.Admin.Manager.Checks.AdditionalDice.PathUnresolved',
      '{actor} has no stored number at {path}, so they could not buy additional dice.'
    ),
    overridden: text(
      'FABRICATE.Admin.Manager.Checks.AdditionalDice.PathOverridden',
      "An active effect changes {actor}'s {path}, so spending it would not lower it. Use a stored value."
    ),
  });

  const macroSlots = $derived([
    {
      key: 'readMacroUuid',
      slot: 'read',
      kind: 'additional-dice-read-macro',
      hook: 'data-check-additional-dice-read-macro',
      target: 'checks-additional-dice-read-macro',
      title: text('FABRICATE.Admin.Manager.Checks.AdditionalDice.ReadMacro', 'Read macro'),
      hint: text(
        'FABRICATE.Admin.Manager.Checks.AdditionalDice.ReadMacroHint',
        'Returns what the character can spend'
      ),
      copy: text(
        'FABRICATE.Admin.Manager.Checks.AdditionalDice.CopyReadMacro',
        'Copy read macro uuid'
      ),
      unlink: text(
        'FABRICATE.Admin.Manager.Checks.AdditionalDice.UnlinkReadMacro',
        'Unlink read macro'
      ),
    },
    {
      key: 'spendMacroUuid',
      slot: 'spend',
      kind: 'additional-dice-spend-macro',
      hook: 'data-check-additional-dice-spend-macro',
      target: 'checks-additional-dice-spend-macro',
      title: text('FABRICATE.Admin.Manager.Checks.AdditionalDice.SpendMacro', 'Spend macro'),
      hint: text(
        'FABRICATE.Admin.Manager.Checks.AdditionalDice.SpendMacroHint',
        'Deducts what was spent'
      ),
      copy: text(
        'FABRICATE.Admin.Manager.Checks.AdditionalDice.CopySpendMacro',
        'Copy spend macro uuid'
      ),
      unlink: text(
        'FABRICATE.Admin.Manager.Checks.AdditionalDice.UnlinkSpendMacro',
        'Unlink spend macro'
      ),
    },
  ]);

  let macroStates = $state({ readMacroUuid: null, spendMacroUuid: null });
  const trackMacro = (key) =>
    resolveMacroName(rule[key], (resolved) => {
      macroStates[key] = resolved;
    });
  $effect(() => trackMacro('readMacroUuid'));
  $effect(() => trackMacro('spendMacroUuid'));

  function macroName(key) {
    if (macroStates[key]?.missing) {
      return text('FABRICATE.Admin.Manager.Checks.Crafting.MacroMissing', 'Linked macro not found');
    }
    return macroStates[key]?.name || rule[key];
  }

  // `evaluateMacroDrop` is the type check a drop payload cannot carry: only a script macro links.
  async function dropMacro(key, data) {
    const result = await evaluateMacroDrop(resolveDropUuid(data));
    if (result.accepted) return write(key, result.uuid);
    notifyWarn(
      result.reason === MACRO_DROP_REJECTED_NOT_SCRIPT
        ? text(
            'FABRICATE.Admin.Manager.Checks.AdditionalDice.MacroNotScript',
            'That macro is not a script macro, so Fabricate cannot run it. Change its type to Script and drop it again.'
          )
        : text(
            'FABRICATE.Admin.Manager.Checks.AdditionalDice.MacroUnresolved',
            'That macro could not be found. Drop a macro from this world or an installed compendium.'
          )
    );
  }

  async function copyUuid(uuid) {
    try {
      await globalThis.navigator.clipboard.writeText(uuid);
      notifyInfo(
        text('FABRICATE.Admin.Manager.Checks.AdditionalDice.MacroCopied', 'Copied the macro UUID.')
      );
    } catch {
      notifyError(
        text(
          'FABRICATE.Admin.Manager.Checks.AdditionalDice.MacroCopyFailed',
          'Could not copy the macro UUID.'
        )
      );
    }
  }
</script>

{#snippet toggle()}
  <StatusToggle
    on={rule.enabled}
    ariaLabel={titles.toggle}
    aria-controls={rule.enabled ? regionId : undefined}
    data-check-additional-dice=""
    data-validation-target="checks-additional-dice"
    onclick={() => write('enabled', !rule.enabled)}
  />
{/snippet}

{#snippet macroZone(slot)}
  <Field
    as="div"
    class="manager-checks-difficulty-field"
    tabindex="-1"
    data-keyboard-focus="true"
    data-validation-target={slot.target}
    data-check-additional-dice-macro-field={slot.slot}
  >
    <span class="manager-checks-difficulty-label">{slot.title}</span>
    <ItemDropZone
      kind={slot.kind}
      hookAttrs={{ root: { [slot.hook]: '' } }}
      documentType="Macro"
      item={rule[slot.key] ? { name: macroName(slot.key) } : null}
      state={macroStates[slot.key]?.missing ? 'missing' : 'linked'}
      title={text('FABRICATE.Admin.Manager.Checks.AdditionalDice.MacroEmpty', 'Drop a macro here')}
      hint={rule[slot.key] ? '' : slot.hint}
      uuid={rule[slot.key]}
      emptyIcon={rule[slot.key] ? 'fas fa-file-code' : 'fas fa-link'}
      copyLabel={slot.copy}
      unlinkLabel={slot.unlink}
      onCopy={() => copyUuid(rule[slot.key])}
      onUnlink={() => write(slot.key, '')}
      onDrop={(data) => dropMacro(slot.key, data)}
    />
  </Field>
{/snippet}

{#snippet fields()}
  <div class="manager-checks-additional-dice" id={regionId} data-check-additional-dice-fields>
    <div class="manager-checks-difficulty-field" data-check-additional-dice-source-field>
      <span class="manager-checks-difficulty-label">{titles.source}</span>
      <span class="manager-checks-additional-dice-source">
        <SegmentedControl
          fill
          density="field"
          options={SOURCE_OPTIONS}
          value={rule.source}
          groupName={`${uid}-additional-dice-source`}
          ariaLabel={titles.source}
          dataAttr="data-check-additional-dice-source"
          optionDataAttr="data-check-additional-dice-source-option"
          onChange={(next) => write('source', next)}
        />
      </span>
    </div>
    {#if rule.source === 'macro'}
      <div class="manager-checks-additional-dice-macros" data-check-additional-dice-macros>
        {#each macroSlots as slot (slot.key)}
          {@render macroZone(slot)}
        {/each}
      </div>
    {:else}
      <Field
        as="div"
        class="manager-checks-difficulty-field"
        data-check-additional-dice-path-field=""
      >
        <span class="manager-checks-difficulty-label">{titles.path}</span>
        <CheckCharacterValueField
          value={rule.path}
          {character}
          label={titles.path}
          hooks={{
            expression: 'data-check-additional-dice-path',
            resolution: 'data-check-additional-dice-path-line',
          }}
          inputAttrs={{ 'data-validation-target': 'checks-additional-dice-path' }}
          placeholder="system.resources.momentum.value"
          documentPath={pathCopy}
          onChange={(next) => write('path', next)}
        />
      </Field>
    {/if}
    <div class="manager-checks-additional-dice-name" data-check-additional-dice-label-field>
      <Field as="label" class="manager-checks-difficulty-field">
        <span class="manager-checks-difficulty-label">{titles.label}</span>
        <input
          type="text"
          data-check-additional-dice-label
          aria-describedby={labelHintId}
          value={rule.label}
          oninput={(event) => write('label', event.currentTarget.value)}
        />
      </Field>
      <p class="manager-checks-additional-dice-hint" id={labelHintId}>
        {text(
          'FABRICATE.Admin.Manager.Checks.AdditionalDice.LabelHint',
          'What players see this resource called. Leave it blank to show the amount alone.'
        )}
      </p>
    </div>
    <div class="manager-checks-additional-dice-line" data-check-additional-dice-max-row>
      <span class="manager-checks-additional-dice-max">{titles.max}</span>
      <Stepper
        density="comfortable"
        min={1}
        max={20}
        value={rule.max}
        ariaLabel={titles.max}
        decrementLabel={text(
          'FABRICATE.Admin.Manager.Checks.AdditionalDice.MaxDecrease',
          'Decrease most additional dice'
        )}
        incrementLabel={text(
          'FABRICATE.Admin.Manager.Checks.AdditionalDice.MaxIncrease',
          'Increase most additional dice'
        )}
        inputProps={{
          'data-check-additional-dice-max': '',
          'data-validation-target': 'checks-additional-dice-max',
        }}
        onChange={(next) => write('max', next)}
      />
    </div>
  </div>
{/snippet}

<CheckOptionGroup
  title={titles.toggle}
  action={toggle}
  children={rule.enabled ? fields : undefined}
  data-check-additional-dice-group=""
/>

<style>
  .manager-checks-additional-dice {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }

  .manager-checks-additional-dice-source {
    width: 340px;
    max-width: 100%;
  }

  /* The prototype's two macro wells, side by side until either would fall under 220px. */
  .manager-checks-additional-dice-macros {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--fab-space-2);
  }

  .manager-checks-additional-dice-hint {
    margin: var(--fab-space-1) 0 0;
    color: var(--fab-text-subtle);
    font-size: 10px;
    line-height: 1.45;
  }

  .manager-checks-additional-dice-line {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
  }

  .manager-checks-additional-dice-max {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--fab-text-secondary);
    font-size: 11px;
    font-weight: 500;
  }
</style>
