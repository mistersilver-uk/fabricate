<!-- Svelte 5 runes mode -->
<!--
  The Premium crafting-icons advert in the page header's action group: six icons, the title and its
  gold badge, one line of copy, the Patreon link and the dismiss control
  (`ui-extension-points/spec.md` §Premium Crafting Icons Advert).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `text` | the shell's localizer | — | `(key, fallback)` |

  Callbacks:
  - `onDismiss()` — the × was pressed; the caller hides the advert and persists the dismissal.

  Invariants:
  - Focus leaves the × for the next control in the group, else the first in `.manager-main`, before
    `onDismiss` runs, so it never falls to `body` — pinned by
    `tests/components/manager-header-mounted.js`.
  - The tiles are decorative backgrounds whose images live in `styles/fabricate.css`, so no icon is
    addressable as art; the strip compacts below 1180px of manager width and is withheld below 980.
-->
<script>
  import Button from '../../components/Button.svelte';
  import IconButton from '../../components/IconButton.svelte';
  import { PREMIUM_PATREON_URL } from './premiumIconsAdModel.js';

  let { text = () => '', onDismiss = () => {} } = $props();

  const ICON_CLASSES = [
    'is-relic-stone',
    'is-relic-blood',
    'is-relic-entropy',
    'is-relic-verdant',
    'is-relic-catalyst',
    'is-relic-formula',
  ];

  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const title = $derived(text('FABRICATE.Admin.Manager.PremiumIconsAd.Title', 'Crafting icons'));
  const hideLabel = $derived(
    text('FABRICATE.Admin.Manager.PremiumIconsAd.Hide', 'Hide Premium suggestion')
  );

  function focusTargetAfter(strip) {
    for (let sibling = strip.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
      const found = sibling.matches(FOCUSABLE) ? sibling : sibling.querySelector(FOCUSABLE);
      if (found) return found;
    }
    const root = strip.closest('.fabricate-manager');
    return (
      root?.querySelector('.manager-main')?.querySelector(FOCUSABLE) ??
      root?.querySelector(FOCUSABLE)
    );
  }

  function dismiss(event) {
    const strip = event.currentTarget.closest('[data-premium-icons-ad]');
    if (strip) focusTargetAfter(strip)?.focus();
    onDismiss();
  }
</script>

<div class="manager-premium-icons-ad" role="group" aria-label={title} data-premium-icons-ad>
  <div class="manager-premium-icons-ad-icons" aria-hidden="true">
    {#each ICON_CLASSES as iconClass (iconClass)}
      <span class="manager-premium-icons-ad-icon {iconClass}"></span>
    {/each}
  </div>
  <div class="manager-premium-icons-ad-copy">
    <div class="manager-premium-icons-ad-heading">
      <span class="manager-premium-icons-ad-title">{title}</span>
      <span class="manager-premium-icons-ad-badge"
        >{text('FABRICATE.Admin.Manager.PremiumIconsAd.Badge', 'PREMIUM')}</span
      >
    </div>
    <span class="manager-premium-icons-ad-subline">
      {text(
        'FABRICATE.Admin.Manager.PremiumIconsAd.Subline',
        'For components and essences, with Downtime'
      )}
    </span>
  </div>
  <Button
    tag="a"
    href={PREMIUM_PATREON_URL}
    target="_blank"
    rel="noopener noreferrer"
    title={text(
      'FABRICATE.Admin.Manager.PremiumIconsAd.SeePremiumHint',
      'Opens Fabricate Premium on Patreon in a new tab'
    )}
    data-premium-icons-ad-link
  >
    <span>{text('FABRICATE.Admin.Manager.PremiumIconsAd.SeePremium', 'See Premium')}</span>
    <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
  </Button>
  <IconButton
    size={24}
    class="is-ghost"
    ariaLabel={hideLabel}
    title={hideLabel}
    onclick={dismiss}
    data-premium-icons-ad-dismiss=""
  >
    <i class="fas fa-xmark" aria-hidden="true"></i>
  </IconButton>
</div>

<style>
  .manager-premium-icons-ad {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-2) var(--fab-space-2) var(--fab-space-2) var(--fab-space-3);
    border: 1px solid color-mix(in srgb, var(--fab-badge-gold) 42%, transparent);
    border-radius: 11px;
    background-color: var(--fab-bg-1);
  }

  /* On Component Rules the strip leads `Add from catalogue`, 24px from it with the group's gap. */
  .manager-premium-icons-ad:not(:last-child) {
    margin-inline-end: var(--fab-space-4);
  }

  .manager-premium-icons-ad-icons {
    display: flex;
    gap: var(--fab-space-1);
  }

  .manager-premium-icons-ad-icon {
    display: block;
    width: 30px;
    height: 30px;
    border-radius: 7px;
    background-color: var(--fab-bg-3);
    background-position: center;
    background-size: cover;
  }

  /* The copy gives before the strip grows, so a long translation cannot squeeze the title. */
  .manager-premium-icons-ad-copy {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    min-width: 0;
    max-width: 15rem;
  }

  .manager-premium-icons-ad-heading {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .manager-premium-icons-ad-title {
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--fab-text);
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
  }

  .manager-premium-icons-ad-badge {
    display: inline-flex;
    align-items: center;
    height: 16px;
    padding: 0 var(--fab-space-chip);
    border-radius: 6px;
    font-size: 8.5px;
    letter-spacing: 0.1em;
    white-space: nowrap;
  }

  .manager-premium-icons-ad-subline {
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--fab-text-muted);
    font-size: 11px;
    white-space: nowrap;
  }

  @container fabricate-manager (max-width: 1179px) {
    .manager-premium-icons-ad-icon:nth-child(n + 4),
    .manager-premium-icons-ad-subline {
      display: none;
    }
  }

  @container fabricate-manager (max-width: 979px) {
    .manager-premium-icons-ad {
      display: none;
    }
  }
</style>
