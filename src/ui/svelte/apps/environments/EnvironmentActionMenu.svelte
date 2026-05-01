<!-- Svelte 5 runes mode -->
<script module>
  let nextActionListId = 0;
</script>

<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    actions = [],
    triggerLabel = localize('FABRICATE.Admin.Environments.Actions'),
    openUpThreshold = 180
  } = $props();

  let open = $state(false);
  let openUp = $state(false);
  let triggerNode = $state(null);
  const actionListId = `environment-action-list-${++nextActionListId}`;
  const menuActions = $derived((Array.isArray(actions) ? actions : []).filter(Boolean));

  function closeMenu({ returnFocus = false } = {}) {
    open = false;
    if (returnFocus) {
      triggerNode?.focus?.({ preventScroll: true });
    }
  }

  function clippingBounds(node) {
    const documentRef = globalThis.document;
    const windowRef = globalThis.window || globalThis;
    const viewportTop = 0;
    const viewportBottom = Number(globalThis.innerHeight || windowRef.innerHeight) || documentRef?.documentElement?.clientHeight || 0;
    let parent = node?.parentElement;

    while (parent && parent !== documentRef?.documentElement) {
      const style = globalThis.getComputedStyle?.(parent);
      const overflow = `${style?.overflow || ''} ${style?.overflowY || ''} ${style?.overflowX || ''}`;
      if (/(auto|scroll|hidden|clip)/.test(overflow)) {
        const rect = parent.getBoundingClientRect?.();
        if (rect) {
          return {
            top: Math.max(viewportTop, rect.top),
            bottom: Math.min(viewportBottom || rect.bottom, rect.bottom)
          };
        }
      }
      parent = parent.parentElement;
    }

    return { top: viewportTop, bottom: viewportBottom };
  }

  function updateOpenDirection(node) {
    const rect = node?.getBoundingClientRect?.();
    if (!rect) {
      openUp = false;
      return;
    }

    const bounds = clippingBounds(node);
    const spaceBelow = bounds.bottom - rect.bottom;
    const spaceAbove = rect.top - bounds.top;
    openUp = spaceBelow < openUpThreshold && spaceAbove > spaceBelow;
  }

  function toggleMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!open) {
      triggerNode = event.currentTarget;
      updateOpenDirection(event.currentTarget);
      open = true;
      return;
    }
    closeMenu({ returnFocus: false });
  }

  function selectAction(action, event) {
    event.preventDefault();
    event.stopPropagation();
    if (action.disabled) return;
    closeMenu();
    action.onSelect?.();
  }

  function dismissMenuAction(node) {
    const documentRef = globalThis.document;
    if (!documentRef) {
      return { destroy() {} };
    }

    const closeIfOutside = (event) => {
      if (!(event.target instanceof Node)) return;
      if (!node.contains(event.target)) {
        closeMenu();
      }
    };

    const closeOnEscape = (event) => {
      if (open && event.key === 'Escape') {
        event.preventDefault();
        closeMenu({ returnFocus: true });
      }
    };

    documentRef.addEventListener('mousedown', closeIfOutside, true);
    documentRef.addEventListener('keydown', closeOnEscape, true);

    return {
      destroy() {
        documentRef.removeEventListener('mousedown', closeIfOutside, true);
        documentRef.removeEventListener('keydown', closeOnEscape, true);
      }
    };
  }
</script>

<div class="environment-action-menu" class:open class:open-up={openUp} data-open-direction={openUp ? 'up' : 'down'} use:dismissMenuAction>
  <button
    type="button"
    class="environment-action-menu-trigger btn-icon"
    aria-expanded={open ? 'true' : 'false'}
    aria-controls={open ? actionListId : undefined}
    aria-label={triggerLabel}
    title={triggerLabel}
    onclick={toggleMenu}
  >
    <i class="fas fa-ellipsis-v"></i>
  </button>

  {#if open}
    <div class="environment-action-menu-list" id={actionListId} aria-label={triggerLabel}>
      {#each menuActions as action}
        <button
          type="button"
          class="environment-action-menu-item"
          class:danger={action.danger}
          disabled={action.disabled}
          data-environment-action={action.key}
          onclick={(event) => selectAction(action, event)}
        >
          {#if action.icon}
            <i class={action.icon}></i>
          {/if}
          <span>{action.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
