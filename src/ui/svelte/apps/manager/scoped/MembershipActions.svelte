<!-- Svelte 5 runes mode -->
<!--
  The per-`(entity, system)` membership action cluster shared by all six scoped-entity editors
  (issue 1362, epic 1357): add, remove, copy-from, and — for an enableable entity only — the
  enabled switch. `enableable` and whether removal CASCADES are both READ FROM THE DESCRIPTOR,
  never from a caller's flag, so the COMPONENT path cannot render a switch over a field its
  record does not carry. Removal is ARMED through `ArmedDangerButton`, whose token is keyed on
  the DOCUMENT ID pair rather than a row index; mutual exclusion of it is the OWNER's invariant.
  The switch passes an `ariaLabel`, unlike `InheritRow`'s: `compact` drops the visible reading
  and the inline reading is "On", which names the STATE and not the switch.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import ArmedDangerButton from '../../../components/ArmedDangerButton.svelte';
  import { scopedEnableable } from './scopedStudio.js';

  let {
    entityType = 'component',
    entityId = '',
    systemId = '',
    entityName = '',
    systemName = '',
    member = false,
    enabled = true,
    copyable = false,
    // Whether the non-member branch carries its explanatory line. DEFAULT ON. It is turned off
    // where the cluster is the TRAILING half of a one-line row, because there the sentence is
    // what decides the row's width and pushed a 300px panel's rows to four lines each.
    hint = true,
    // The CLUSTER'S DENSITY. `false` is the shipped inline form; `true` reduces the switch and
    // Remove to glyphs for a caller whose row is a line in a 300px inspector column. NEITHER
    // CONTROL LOSES ITS NAME: the switch gains an explicit `aria-label`, and Remove keeps its
    // consequence sentence and REGAINS a visible word the moment it is armed.
    compact = false,
    disabled = false,
    busy = false,
    armedToken = '',
    onArm = () => {},
    onDisarm = () => {},
    onAdd = () => {},
    onRemove = () => {},
    onCopyFrom = () => {},
    onToggleEnabled = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function formatted(key, fallback, data) {
    const template = localize(key);
    if (template && template !== key) return localize(key, data);
    return Object.entries(data).reduce(
      (copy, [name, value]) => copy.replace(`{${name}}`, String(value)),
      fallback
    );
  }

  const enableable = $derived(scopedEnableable(entityType));
  const removeToken = $derived(`scoped-membership-remove:${entityId}|${systemId}`);
  const toggleConsequence = $derived(
    formatted(
      enabled
        ? 'FABRICATE.Admin.Manager.Scoped.Membership.DisableIn'
        : 'FABRICATE.Admin.Manager.Scoped.Membership.EnableIn',
      enabled ? 'Disable {entity} in {system}' : 'Enable {entity} in {system}',
      { entity: entityName || entityId, system: systemName || systemId }
    )
  );
  // WHETHER REMOVAL CASCADES IS A PROPERTY OF THE ENTITY TYPE, so the sentence is READ FROM THE
  // DESCRIPTOR and never from a caller's flag. Only the COMPONENT path cascades:
  // `partComponentFromSystem` runs the in-system delete through `deleteComponents`, which repairs
  // references, disables recipes left unbuildable, cleans salvage and reconciles alchemy, while
  // the essence and tool verbs do neither.
  const removalCascades = $derived(entityType === 'component');
  const removeConsequence = $derived(
    removalCascades
      ? formatted(
          'FABRICATE.Admin.Manager.Scoped.Component.RemoveConsequence',
          'Remove {entity} from {system}. Removing it also rewrites every recipe in that system that names it, and disables any recipe left without a usable ingredient set or result. The world record is untouched, and no other system changes.',
          { entity: entityName || entityId, system: systemName || systemId }
        )
      : formatted(
          'FABRICATE.Admin.Manager.Scoped.Membership.RemoveConsequence',
          'Remove {entity} from {system}. Its overrides go with it; the world record and every other system are untouched.',
          { entity: entityName || entityId, system: systemName || systemId }
        )
  );
</script>

<div class="manager-scoped-membership-actions" data-scoped-membership-actions={entityType}>
  {#if member}
    {#if enableable}
      <StatusToggle
        on={enabled}
        label={compact
          ? ''
          : enabled
            ? text('FABRICATE.Admin.Manager.StatusOn', 'On')
            : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}
        ariaLabel={toggleConsequence}
        title={compact ? toggleConsequence : undefined}
        {disabled}
        data-scoped-membership-enabled=""
        onclick={() => onToggleEnabled(!enabled)}
      />
    {/if}
    {#if copyable}
      <ManagerButton {disabled} data-scoped-membership-copy onclick={() => onCopyFrom()}>
        <i class="fas fa-copy" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Scoped.Membership.CopyFrom', 'Copy from…')}</span>
      </ManagerButton>
    {/if}
    <ArmedDangerButton
      token={removeToken}
      armed={armedToken === removeToken}
      {disabled}
      {busy}
      idleLabel={compact ? '' : text('FABRICATE.Admin.Manager.Scoped.Membership.Remove', 'Remove')}
      armedLabel={text('FABRICATE.Admin.Manager.Scoped.Membership.RemoveConfirm', 'Confirm?')}
      idleAriaLabel={`${text('FABRICATE.Admin.Manager.Scoped.Membership.Remove', 'Remove')} — ${removeConsequence}`}
      armedAriaLabel={`${text('FABRICATE.Admin.Manager.Scoped.Membership.RemoveConfirm', 'Confirm?')} — ${removeConsequence}`}
      busyLabel={text('FABRICATE.Admin.Manager.Scoped.Membership.Removing', 'Removing…')}
      {onArm}
      {onDisarm}
      onConfirm={() => onRemove()}
    />
  {:else}
    <ManagerButton role="primary" {disabled} data-scoped-membership-add onclick={() => onAdd()}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Scoped.Membership.Add', 'Add to this system')}</span>
    </ManagerButton>
    {#if hint}
      <p class="manager-muted" data-scoped-membership-hint>
        {text(
          'FABRICATE.Admin.Manager.Scoped.Membership.AddHint',
          'It inherits every world default until you override a section.'
        )}
      </p>
    {/if}
  {/if}
</div>
