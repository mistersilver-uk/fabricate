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

  ADDING inherits every section, and the copy says so. WHAT REMOVING DOES DEPENDS ON THE ENTITY
  TYPE, and so does the sentence the armed control announces: an essence or tool removal drops
  this record and its overrides and touches nothing else, while a COMPONENT removal runs the
  in-system delete cascade and disables the recipes it leaves unbuildable. That answer is read
  from the descriptor beside `enableable` rather than taken from a caller — see its derivation.
  Removal is ARMED
  rather than confirmed by a dialog, through the shipped `ArmedDangerButton`, whose token is
  keyed on the DOCUMENT ID pair rather than a row index — a re-projected list must not be
  able to arm one row and delete another.

  Mutual exclusion of the armed token is the OWNER's invariant, exactly as it is at every
  other `ArmedDangerButton` call site, so `armedToken` / `onArm` / `onDisarm` are threaded
  through rather than held here.

  THE ENABLED SWITCH WAS HAND-ROLLED AND IS NOW `<StatusToggle>` (issue 1040), as is the inherit
  switch in `InheritRow.svelte`. The shared primitive owns the `.manager-status-toggle` element
  and its `-track` / `-knob` / `-label` children, so this cluster states only the switch's state,
  its reading, its accessible name, its disabled flag, its `data-*` hook and its handler.

  IT DOES PASS AN `ariaLabel`, WHICH IS THE ONE PLACE THIS SITE PARTS FROM THE INHERIT ROW, and
  it is a ruling of issue 1372 rather than a variation on 1040's conversion. `compact` drops the
  visible reading entirely, so in that form there would otherwise be NO name at all; and in the
  inline form the visible reading is the single word "On", which names the switch's STATE and
  not the switch. `toggleConsequence` — "Disable {entity} in {system}" — names the control and
  the pair it addresses in both forms, so the two forms announce identically and the name does
  not appear and disappear with the density. `title` is added only in `compact`, where the
  sentence is the sole way to recover the words the row no longer draws.

  Props:
   - entityType: `component`, `essence` or `tool`.
   - entityId / systemId: the pair these actions address, and the arm token's two halves.
   - entityName / systemName: for the consequence sentence on the armed control.
   - member: whether a membership record exists.
   - enabled: the record's flag; read only when the entity type is enableable.
   - copyable: whether any other system has a record to copy from.
   - hint / compact: the non-member explanatory line, and the cluster's density. Both default to
     the shipped inline form; see their declarations.
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
    // Whether the non-member branch carries its explanatory line. DEFAULT ON, so every shipped
    // site renders unchanged. It is turned off where the cluster is the TRAILING half of a
    // one-line row — the catalogue inspector's system list — because there the sentence is not a
    // hint under a button, it is the thing that decides the row's width, and it pushed a 300px
    // panel's rows to four lines each. The same words stay reachable: the entry editor states
    // them in full beside the same Add.
    hint = true,
    // The CLUSTER'S DENSITY. `false` is the shipped inline form: a switch captioned On/Off and a
    // labelled Remove. `true` reduces both to their glyphs for a caller whose row is a line in a
    // 300px inspector column — the catalogue's system list — where the two captions are about
    // 60px of a 258px row and were enough to wrap every row onto three lines.
    //
    // NEITHER CONTROL LOSES ITS NAME. The switch gains an explicit `aria-label` it never had
    // (it relied on a visible caption plus `aria-pressed`), and Remove keeps its full consequence
    // sentence in `aria-label` and `title` and REGAINS a visible word the moment it is armed:
    // arming is the point at which "what am I about to do" has to be readable, and an armed
    // control that is still a bare glyph is the one state this cluster must not have.
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
  // DESCRIPTOR and never from a caller's flag — the same rule this cluster already applies to
  // `enableable`, and for the same reason: a caller's opinion cannot make a store do something.
  //
  // Only the COMPONENT path cascades. `partComponentFromSystem` runs the in-system delete through
  // `deleteComponents`, which repairs every reference, disables the recipes left without a usable
  // ingredient set or result, cleans up salvage and reconciles alchemy. `partEssenceFromSystem`
  // filters `essenceDefinitions` and writes — no reference repair, no recipe disable — and the
  // tool path is the generic verb, which does neither either.
  //
  // Revision 9 disclosed the cascade on the SHARED key, which this one cluster renders for all
  // three types, so every essence and tool row began announcing a repair its own store never
  // performs. That is the same class of defect as asserting the unconsumed half of the tag merge.
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
