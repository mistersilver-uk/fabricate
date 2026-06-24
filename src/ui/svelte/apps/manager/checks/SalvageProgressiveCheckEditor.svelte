<!-- Svelte 5 runes mode -->
<!--
  Salvage progressive check editor (progressive salvage resolution mode).

  Unlike the crafting progressive check, the salvage check is macro-driven and has
  no roll-formula authoring here — the only authorable knob is the award mode, which
  decides how the check value is spent against each salvage result's difficulty
  (equal / partial / exceed). The award-mode selector is shared with the crafting
  progressive editor so the vocabulary stays one.

  Controlled component: renders `value` and emits the next value via `onChange`.
  `value` carries `{ awardMode, allowPlayerReorder }`; `allowPlayerReorder` is
  preserved across edits.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import CheckAwardMode from './CheckAwardMode.svelte';

  let { value = null, onChange = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function emit(patch) {
    onChange({ ...value, ...patch });
  }
</script>

<div class="manager-checks-editor" data-salvage-progressive-editor>
  <section class="manager-inspector-card" data-award-mode>
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Checks.Crafting.AwardModeTitle', 'Award mode')}</h3>
    <p class="manager-muted">
      {text(
        'FABRICATE.Admin.Manager.Checks.Salvage.ProgressiveLead',
        "Progressive salvage spends the check value against each salvage result's difficulty, in order. The award mode decides how that spend stops."
      )}
    </p>
    <CheckAwardMode
      value={value?.awardMode || 'equal'}
      name="salvage-progressive-award-mode"
      onChange={(awardMode) => emit({ awardMode })}
    />
  </section>
</div>
