<!--
  A browse row with badges, a status switch and a row menu: the chips as `RunCard` renders its
  status, the switch and the kebab as `SystemsBrowserView` wires its status cell and row menu. No
  shipped `ListRow` caller has this trailing.
-->
<script>
  import ActionMenu from '../../../../src/ui/svelte/components/ActionMenu.svelte';
  import Chip from '../../../../src/ui/svelte/components/Chip.svelte';
  import StatusToggle from '../../../../src/ui/svelte/components/StatusToggle.svelte';
  import { statusChipTone } from '../../../../src/ui/svelte/util/statusChipTone.js';
  import { format, localize } from '../fixtureActs.js';

  let {
    component: Specimen,
    props = {},
    meta,
    chips = [],
    on = false,
    statusKey,
    toggleKey,
    items = [],
    menuForKey,
    menuKey,
  } = $props();

  const menuItems = $derived(items.map((item) => ({ ...item, label: localize(item.labelKey) })));

  function ignore() {}
</script>

{#snippet badges()}
  {#each chips as chip, index (index)}
    <Chip density="list" tone={statusChipTone(chip.tone)} icon={chip.icon}>{chip.label}</Chip>
  {/each}
{/snippet}

{#snippet controls()}
  <StatusToggle
    {on}
    label={localize(statusKey)}
    ariaLabel={format(toggleKey, { name: props.name })}
    onclick={ignore}
  />
  <ActionMenu
    items={menuItems}
    ariaLabel={format(menuForKey, { name: props.name })}
    triggerTitle={localize(menuKey)}
    onSelect={ignore}
  />
{/snippet}

<Specimen {...props} onOpen={ignore} {badges} {meta} trailing={controls} />
