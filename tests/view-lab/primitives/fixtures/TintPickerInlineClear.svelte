<!-- The essence editor's colour strip, as `EssenceIdentityTab` wires it: the No-colour cell on. -->
<script>
  import { localize } from '../fixtureActs.js';

  let { component: Specimen, props = {}, presetsKey, noneKey } = $props();

  function ignore() {}
</script>

<Specimen
  {...props}
  allowNone
  customColor=""
  presetGridLabel={localize(presetsKey)}
  noneLabel={localize(noneKey)}
  onClear={ignore}
  onChange={ignore}
/>
