<!-- Svelte 5 runes mode -->
<!--
  One member row on a World > Parties card, plus the move drawer that expands INSIDE
  it.

  The drawer is deliberately NOT a `SearchablePopover` (the shipped picker this row
  used before): it expands under a `border-top` and grows the card, which a portaled
  popover cannot express. It is also the surface that EXPLAINS a one-party world —
  the old control was merely disabled, which says nothing about why.

  The meta slot renders the FIRST applicable of travel-actor, stale, or
  multi-membership and is omitted entirely when none applies, rather than rendering an
  empty line. Fabricate's actor projection carries no class or level, so the
  prototype's "Wizard 6" has no equivalent here.

  DELIBERATE NON-REUSE of `Medallion`: it is a BORDERED `--fab-bg-3` tile at radius 9
  carrying an accent glyph, and none of this pane's three tiles is that — the card head's
  is unbordered on `--fab-bg-0` (`tpl:1469`), this member tile is radius 7 with a MUTED
  glyph (`tpl:1482`), and the travel-actor portrait sits on `--fab-surface-soft` mirroring
  `EmptyState`'s compact tile. Routing them through it would mean parameterising away the
  border, the fill, the radius and the glyph tone — everything the primitive asserts —
  across every one of its shipped call sites, to reach three tiles that would then share
  nothing but a `<span>`.

  Props:
   - member: a projected member card `{ uuid, name, img, stale }`.
   - isTravelActor: this member is also the party's travel actor.
   - alsoInCount: how many OTHER parties also list this actor.
   - moveTargets: `[{ id, name, memberCount, enabled, alreadyMember }]`, resolved by
     the card so the row never walks the party list itself.
   - moving: the drawer is open for this row (lifted, so a page change can close it).
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    member = null,
    isTravelActor = false,
    alsoInCount = 0,
    moveTargets = [],
    saving = false,
    moving = false,
    onToggleMove = () => {},
    onMove = () => {},
    onRemove = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const displayName = $derived(
    member?.stale
      ? text('FABRICATE.Admin.Manager.World.Parties.Members.Stale', 'Stale member')
      : member?.name || ''
  );

  // FIRST applicable, or nothing. An empty string renders no element at all.
  const meta = $derived.by(() => {
    if (isTravelActor)
      return text('FABRICATE.Admin.Manager.World.Parties.Members.TravelActor', 'Travel actor');
    if (member?.stale)
      return text('FABRICATE.Admin.Manager.World.Parties.Members.Stale', 'Stale member');
    if (alsoInCount === 1)
      return text(
        'FABRICATE.Admin.Manager.World.Parties.Members.AlsoInOne',
        'Also in 1 other party'
      );
    if (alsoInCount > 1)
      return text(
        'FABRICATE.Admin.Manager.World.Parties.Members.AlsoIn',
        'Also in {count} other parties'
      ).replace('{count}', String(alsoInCount));
    return '';
  });

  const moveLabel = $derived(
    text(
      'FABRICATE.Admin.Manager.World.Parties.Members.Move',
      'Move {name} to another party'
    ).replace('{name}', displayName)
  );
  const removeLabel = $derived(
    text(
      'FABRICATE.Admin.Manager.World.Parties.Members.Remove',
      'Remove {name} from this party'
    ).replace('{name}', displayName)
  );
  const moveHeading = $derived(
    text('FABRICATE.Admin.Manager.World.Parties.Members.MoveHeading', 'Move {name} to').replace(
      '{name}',
      displayName
    )
  );

  function targetMeta(target) {
    const count =
      target.memberCount === 1
        ? text('FABRICATE.Admin.Manager.World.Parties.Members.MoveTargetMetaOne', '1 member')
        : text(
            'FABRICATE.Admin.Manager.World.Parties.Members.MoveTargetMeta',
            '{count} members'
          ).replace('{count}', String(target.memberCount ?? 0));
    const disabledSuffix = target.enabled
      ? ''
      : text('FABRICATE.Admin.Manager.World.Parties.Members.MoveTargetDisabled', ' · disabled');
    const memberSuffix = target.alreadyMember
      ? text(
          'FABRICATE.Admin.Manager.World.Parties.Members.MoveTargetAlreadyMember',
          ' · already a member'
        )
      : '';
    return `${count}${disabledSuffix}${memberSuffix}`;
  }
</script>

{#if member}
  <li
    class="manager-party-member-row"
    class:is-stale={member.stale}
    class:is-moving={moving}
    data-member-uuid={member.uuid}
  >
    <div class="manager-party-member-main">
      <span class="manager-party-member-tile" aria-hidden="true">
        {#if member.img}<img src={member.img} alt="" />{:else}<i class="fas fa-user"></i>{/if}
      </span>
      <div class="manager-party-member-copy">
        <div class="manager-party-member-name">{displayName}</div>
        {#if meta}
          <div class="manager-party-member-meta">{meta}</div>
        {/if}
      </div>
      {#if !member.stale}
        <button
          type="button"
          class="manager-party-member-move"
          class:is-open={moving}
          aria-label={moveLabel}
          aria-expanded={moving}
          title={moveLabel}
          disabled={saving}
          onclick={() => onToggleMove(member.uuid)}
        >
          <i class="fas fa-right-left" aria-hidden="true"></i>
        </button>
      {/if}
      <button
        type="button"
        class="manager-party-member-remove"
        aria-label={removeLabel}
        title={removeLabel}
        disabled={saving}
        onclick={() => onRemove(member.uuid)}
      >
        <i class="fas fa-xmark" aria-hidden="true"></i>
      </button>
    </div>

    {#if moving}
      <div class="manager-party-move-drawer" data-manager-party-move-drawer={member.uuid}>
        <div class="manager-party-move-eyebrow">{moveHeading}</div>
        {#each moveTargets as target (target.id)}
          <button
            type="button"
            class="manager-party-move-target"
            disabled={saving}
            onclick={() => onMove(target.id, member.uuid)}
          >
            <!-- `fa-users`, as every other party glyph in this pane is: the card head's
                 icon tile and the pane's own empty state both use it, and a move target
                 IS a party. -->
            <i class="fas fa-users" aria-hidden="true"></i>
            <span class="manager-party-move-target-name">{target.name}</span>
            <span class="manager-party-move-target-meta">{targetMeta(target)}</span>
          </button>
        {:else}
          <div class="manager-party-move-none">
            {text(
              'FABRICATE.Admin.Manager.World.Parties.Members.NoMoveTargets',
              'No other party to move them to. Create one first.'
            )}
          </div>
        {/each}
        <button
          type="button"
          class="manager-party-move-cancel"
          onclick={() => onToggleMove(member.uuid)}
        >
          {text('FABRICATE.Admin.Manager.World.Parties.Members.MoveCancel', 'Cancel')}
        </button>
      </div>
    {/if}
  </li>
{/if}

<style>
  /* Theme-ROOT tokens only (`--fab-mv2-*` is declared on `.fabricate-manager` and is
     not in scope for an area-agnostic block). Geometry is the prototype's:
     radius 9, `--fab-bg-1` fill, 26px tiles, 8px/10px row padding. */
  .manager-party-member-row {
    list-style: none;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-1);
  }

  .manager-party-member-row.is-stale {
    border-color: var(--fab-warning-border);
  }

  .manager-party-member-row.is-moving {
    border-color: var(--fab-accent-border);
  }

  .manager-party-member-main {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
  }

  .manager-party-member-tile {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 7px;
    color: var(--fab-text-muted);
    background: var(--fab-bg-3);
    font-size: 11px;
    overflow: hidden;
  }

  .manager-party-member-tile img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .manager-party-member-copy {
    flex: 1;
    min-width: 0;
  }

  .manager-party-member-name {
    overflow: hidden;
    color: var(--fab-text);
    font-family: var(--font-primary);
    font-size: 12px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-party-member-meta {
    margin-top: 1px;
    overflow: hidden;
    color: var(--fab-text-subtle);
    font-family: var(--font-primary);
    font-size: 9.5px;
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-party-member-move,
  .manager-party-member-remove {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: var(--fab-surface-soft);
  }

  .manager-party-member-move {
    color: var(--fab-text-subtle);
    font-size: 10px;
  }

  .manager-party-member-move.is-open {
    border-color: var(--fab-accent-border);
    color: var(--fab-accent);
    background: var(--fab-accent-soft);
  }

  .manager-party-member-remove {
    color: var(--fab-danger-text);
    font-size: 9px;
  }

  .manager-party-move-drawer {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 8px 10px;
    border-top: 1px solid var(--fab-border);
  }

  .manager-party-move-eyebrow {
    color: var(--fab-text-subtle);
    font-family: var(--font-primary);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .manager-party-move-target {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 9px;
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: var(--fab-bg-2);
    text-align: left;
  }

  .manager-party-move-target:hover {
    border-color: var(--fab-accent-border);
    background: var(--fab-surface-soft);
  }

  .manager-party-move-target > i {
    flex: 0 0 auto;
    width: 13px;
    color: var(--fab-accent);
    font-size: 10px;
  }

  .manager-party-move-target-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--fab-text);
    font-family: var(--font-primary);
    font-size: 11px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-party-move-target-meta {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-family: var(--font-primary);
    font-size: 9.5px;
    font-weight: 400;
  }

  .manager-party-move-none {
    color: var(--fab-text-subtle);
    font-family: var(--font-primary);
    font-size: 10px;
    font-weight: 400;
  }

  .manager-party-move-cancel {
    align-self: flex-start;
    padding: 0;
    border: 0;
    color: var(--fab-text-subtle);
    background: none;
    font-family: var(--font-primary);
    font-size: 10px;
    font-weight: 600;
  }
</style>
