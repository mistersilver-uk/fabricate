<!-- Svelte 5 runes mode -->
<!--
  The per-`(entity, system)` membership action cluster shared by all six scoped-entity
  editors (issue 1362, epic 1357): add, remove, copy-from, and — for an enableable entity
  only — the enabled switch.

  `enableable` IS READ FROM THE DESCRIPTOR, never from a caller's flag, so the COMPONENT
  path structurally cannot render an enabled switch. A component membership record carries no
  `enabled` field at all (`resolveComponent` omits the key and `normalizeMembership` drops
  it), so a switch here would write a value that vanishes on the next `load()` while reading
  back as an authored choice. A caller that passed `enabled` anyway is simply ignored.

  ADDING inherits every section, and the copy says so. REMOVING deletes only this record and
  its overrides; the world entity and every other system are untouched. Removal is ARMED
  rather than confirmed by a dialog, through the shipped `ArmedDangerButton`, whose token is
  keyed on the DOCUMENT ID pair rather than a row index — a re-projected list must not be
  able to arm one row and delete another.

  Mutual exclusion of the armed token is the OWNER's invariant, exactly as it is at every
  other `ArmedDangerButton` call site, so `armedToken` / `onArm` / `onDisarm` are threaded
  through rather than held here.

  THE ENABLED SWITCH WAS HAND-ROLLED AND IS NOW `<StatusToggle>` (issue 1040), as is the inherit
  switch in `InheritRow.svelte`. The shared primitive owns the `.manager-status-toggle` element
  and its `-track` / `-knob` / `-label` children, so this cluster states only the switch's state,
  its disabled flag, its `data-*` hook and its handler. Like the inherit row it passes no
  `ariaLabel`: the visible On/Off reading is the switch's name.

  Props:
   - entityType: `component`, `essence` or `tool`.
   - entityId / systemId: the pair these actions address, and the arm token's two halves.
   - entityName / systemName: for the consequence sentence on the armed control.
   - member: whether a membership record exists.
   - enabled: the record's flag; read only when the entity type is enableable.
   - copyable: whether any other system has a record to copy from.
   - disabled / busy: while the editor is saving.
   - armedToken / onArm(token) / onDisarm(token): the owner's single-armed-token invariant.
   - onAdd() / onRemove() / onCopyFrom() / onToggleEnabled(next).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import ArmedDangerButton from '../ArmedDangerButton.svelte';
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
  const removeConsequence = $derived(
    formatted(
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
        label={enabled
          ? text('FABRICATE.Admin.Manager.StatusOn', 'On')
          : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}
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
      idleLabel={text('FABRICATE.Admin.Manager.Scoped.Membership.Remove', 'Remove')}
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
    <p class="manager-muted" data-scoped-membership-hint>
      {text(
        'FABRICATE.Admin.Manager.Scoped.Membership.AddHint',
        'It inherits every world default until you override a section.'
      )}
    </p>
  {/if}
</div>
