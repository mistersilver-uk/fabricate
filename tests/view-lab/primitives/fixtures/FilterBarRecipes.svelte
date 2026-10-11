<!--
  The recipe browser's filter bar, as `RecipesBrowserView` wires its controls: the search, a scope
  switch, the sort select and its direction button, with the row's count as the bar's last child.
-->
<script>
  import Button from '../../../../src/ui/svelte/components/Button.svelte';
  import SearchField from '../../../../src/ui/svelte/components/SearchField.svelte';
  import SegmentedControl from '../../../../src/ui/svelte/components/SegmentedControl.svelte';
  import Select from '../../../../src/ui/svelte/components/Select.svelte';
  import { localize } from '../fixtureActs.js';

  let {
    component: Specimen,
    props = {},
    children,
    searchLabel = '',
    scopes = [],
    scope = '',
    scopeLabel = '',
    sorts = [],
    sort = '',
    sortSize,
    sortLabelKey,
    directionKey,
    directionLabelKey,
    class: directionClass = '',
  } = $props();

  function ignore() {}
</script>

<Specimen {...props}>
  <SearchField placeholder={searchLabel} ariaLabel={searchLabel} onChange={ignore} />
  <SegmentedControl options={scopes} value={scope} ariaLabel={scopeLabel} onChange={ignore} />
  <Select
    size={sortSize}
    value={sort}
    options={sorts}
    ariaLabel={localize(sortLabelKey)}
    onChange={ignore}
  />
  <Button class={directionClass} aria-label={localize(directionLabelKey)} onclick={ignore}
    >{localize(directionKey)}</Button
  >
  {@render children?.()}
</Specimen>
