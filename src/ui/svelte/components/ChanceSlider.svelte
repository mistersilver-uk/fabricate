<!-- Svelte 5 runes mode -->
<script>
  let {
    value = 0,
    min = 0,
    max = 100,
    step = 1,
    numberLabel = 'Percentage',
    rangeLabel = 'Percentage',
    unit = '%',
    resolveColor = () => 'var(--fab-mv2-accent)',
    controlClass = '',
    stopPropagation = false,
    numberInputProps = {},
    rangeInputProps = {},
    onChange = () => {},
  } = $props();

  function normalize(candidate) {
    const numeric = Number(candidate);
    const lower = Number.isFinite(Number(min)) ? Number(min) : 0;
    const upper = Number.isFinite(Number(max)) ? Number(max) : 100;
    const increment = Number.isFinite(Number(step)) && Number(step) > 0 ? Number(step) : 1;
    if (!Number.isFinite(numeric)) return lower;
    const stepped = lower + Math.round((numeric - lower) / increment) * increment;
    return Math.min(upper, Math.max(lower, stepped));
  }

  let localValue = $state(0);
  let lastExternalValue = $state();
  const currentColor = $derived(resolveColor(localValue));
  const percentage = $derived(
    Number(max) === Number(min)
      ? 0
      : ((localValue - Number(min)) / (Number(max) - Number(min))) * 100
  );

  $effect(() => {
    if (value === lastExternalValue) return;
    localValue = normalize(value);
    lastExternalValue = value;
  });

  function stop(event) {
    if (stopPropagation) event.stopPropagation();
  }

  function commit(candidate) {
    const next = normalize(candidate);
    localValue = next;
    onChange(next);
    return next;
  }

  function handleNumberInput(event) {
    stop(event);
    if (event.currentTarget.value === '') return;
    event.currentTarget.value = String(commit(event.currentTarget.valueAsNumber));
  }

  function handleNumberBlur(event) {
    if (event.currentTarget.value === '') {
      event.currentTarget.value = String(localValue);
      return;
    }
    event.currentTarget.value = String(commit(event.currentTarget.valueAsNumber));
  }

  function handleNumberKeydown(event) {
    stop(event);
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const direction = event.key === 'ArrowUp' ? 1 : -1;
    const inputValue = event.currentTarget.valueAsNumber;
    const current = Number.isFinite(inputValue) ? inputValue : localValue;
    event.currentTarget.value = String(commit(current + direction * Number(step)));
  }

  function handleRangeInput(event) {
    stop(event);
    commit(event.currentTarget.valueAsNumber);
  }
</script>

<span class="manager-chance-slider manager-drop-rate-value" data-chance-slider>
  <span class="manager-chance-slider-number manager-drop-rate-percent">
    <input
      {...numberInputProps}
      type="number"
      {min}
      {max}
      {step}
      value={localValue}
      aria-label={numberLabel}
      oninput={handleNumberInput}
      onblur={handleNumberBlur}
      onclick={stop}
      onkeydown={handleNumberKeydown}
    />
    {#if unit}<span aria-hidden="true">{unit}</span>{/if}
  </span>
  <span
    class={`manager-chance-slider-control manager-drop-rate-control ${controlClass}`}
    style={`--fab-drop-rate-value: ${percentage}%; --fab-drop-rate-color: ${currentColor};`}
  >
    <span class="manager-drop-rate-track" aria-hidden="true">
      <span class="manager-drop-rate-fill"></span>
    </span>
    <input
      {...rangeInputProps}
      type="range"
      {min}
      {max}
      {step}
      value={localValue}
      aria-label={rangeLabel}
      oninput={handleRangeInput}
      onclick={stop}
      onkeydown={stop}
    />
  </span>
</span>
