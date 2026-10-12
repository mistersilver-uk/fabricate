<!-- Svelte 5 runes mode -->
<!--
  The Times of day panel's time-of-day bar: the shared range bar over one calendar day, its
  dividers writing start hours, a fixed world-clock line, the current time of day as a draggable
  dot, and a rail that seeds the add form. Non-tiling hours draw the range bar's fallback note.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `values` / `current` | condition values / id | `[]` / `''` | The selected system's time of day. |
  | `services` | manager services or `null` | `null` | Read for `getWorldTimeComponents()`; absent means no clock line and a 24-hour day. |
  | `components` | calendar components or `null` | bindable | The world clock's last reading, re-read on `updateWorldTime`, so the caller's steppers share its day length. |

  Callbacks:
  - `onSetStartHour(id, hour)` — a divider's committed stop, as the clock hour of the period
    beginning there.
  - `onSetCurrent(id)` — the dot's committed period.
  - `onSeed(hour)` — a rail add's start hour; the caller seeds its add form and creates nothing.

  Invariants:
  - A drag draws from a local draft and writes only on its commit; a draft lasts until `values` or
    `current` is replaced, so keyed commits against a deferred store still step from the last one;
    `tests/components/time-of-day-bar-mounted.test.js`.
-->
<script>
  import ThresholdBandStrip from '../../../components/ThresholdBandStrip.svelte';
  import { formatList, subscribeWorldTime } from '../../../util/foundryBridge.js';
  import { localizeOr as text } from '../../../util/localizeOr.js';
  import { hourText, shortHourText, timeOfDayBar, unrotateHour } from './timeOfDayBandModel.js';

  let {
    values = [],
    current = '',
    services = null,
    components = $bindable(null),
    onSetStartHour = () => {},
    onSetCurrent = () => {},
    onSeed = () => {},
  } = $props();

  let drafts = $state.raw({ against: null, hours: {} });
  let currentDraft = $state.raw({ against: null, id: '' });
  let committedCurrent = $state.raw({ against: null, id: '' });

  function readClock() {
    try {
      return services?.getWorldTimeComponents?.() ?? null;
    } catch {
      return null;
    }
  }

  $effect(() => {
    components = readClock();
    return subscribeWorldTime(() => {
      components = readClock();
    });
  });

  const idOf = (value) => String(value && typeof value === 'object' ? value.id : value).trim();

  const draftHours = $derived(drafts.against === values ? drafts.hours : {});
  const drafted = $derived(
    (Array.isArray(values) ? values : []).map((value) => {
      const id = idOf(value);
      if (!Object.hasOwn(draftHours, id)) return value;
      const record = value && typeof value === 'object' ? value : { id, label: id };
      return { ...record, startHour: draftHours[id] };
    })
  );
  const shownCurrent = $derived(currentDraft.against === current ? currentDraft.id : current);
  const bar = $derived(timeOfDayBar({ values: drafted, current: shownCurrent, components }));

  const bands = $derived(
    bar.bands.map((band) => ({
      id: band.id,
      name: band.name,
      color: band.color,
      ink: band.ink,
      from: band.from,
      index: band.index,
      range: text('FABRICATE.Admin.Manager.Environment.Conditions.TimeOfDayBar.Range', undefined, {
        start: shortHourText(band.start),
        end: shortHourText(band.end),
      }),
    }))
  );

  const markers = $derived([
    ...(bar.clock === null
      ? []
      : [
          {
            id: 'clock',
            value: bar.clock,
            label: text('FABRICATE.Admin.Manager.Environment.Conditions.TimeOfDayBar.WorldClock'),
            valueText: bar.clockText,
          },
        ]),
    ...(bar.current === null
      ? []
      : [
          {
            id: 'current',
            value: bar.current,
            label: text('FABRICATE.Admin.Manager.Environment.Conditions.CurrentTimeOfDay'),
            draggable: true,
            snap: 'band',
          },
        ]),
  ]);

  const bandAt = (index) => bar.bands.find((band) => band.index === index);

  function changeDivider(patch, { phase }) {
    const band = bandAt(patch.index);
    if (!band) return;
    const hour = unrotateHour(patch.start, bar.hoursPerDay);
    const hours = drafts.against === values ? drafts.hours : {};
    drafts = { against: values, hours: { ...hours, [band.id]: hour } };
    if (phase === 'commit') onSetStartHour(band.id, hour);
  }

  function changeCurrent({ index }, { phase }) {
    const band = bandAt(index);
    if (!band) return;
    currentDraft = { against: current, id: band.id };
    if (phase !== 'commit') return;
    const persisted = committedCurrent.against === current ? committedCurrent.id : current;
    if (band.id === persisted) return;
    committedCurrent = { against: current, id: band.id };
    onSetCurrent(band.id);
  }

  function addLabel(row) {
    const seed = bar.bands.find((band) => band.id === row.id)?.seed ?? 0;
    return text(
      'FABRICATE.Admin.Manager.Environment.Conditions.TimeOfDayBar.AddWithin',
      undefined,
      { time: hourText(seed), value: row.name }
    );
  }
</script>

{#if bar.status === 'bar'}
  <ThresholdBandStrip
    binding="start"
    {bands}
    min={bar.min}
    max={bar.max}
    step={1}
    ticks={false}
    rangeSublabels
    addable
    {markers}
    ariaLabel={text('FABRICATE.Admin.Manager.Environment.Conditions.TimeOfDayBar.Label')}
    boundaryLabel={(_band, next) =>
      text('FABRICATE.Admin.Manager.Environment.Conditions.TimeOfDayBar.Boundary', undefined, {
        value: next?.name,
      })}
    railLabel={text('FABRICATE.Admin.Manager.Environment.Conditions.TimeOfDayBar.Rail')}
    {addLabel}
    formatValue={(value) => hourText(unrotateHour(value, bar.hoursPerDay))}
    onChange={changeDivider}
    onMarkerChange={changeCurrent}
    onAdd={({ value }) => onSeed(unrotateHour(value, bar.hoursPerDay))}
    class="manager-time-of-day-bar"
    data-time-of-day-bar
  />
{:else if bar.status === 'fallback'}
  <ThresholdBandStrip
    binding="start"
    bands={[]}
    fallbackNote={text(
      'FABRICATE.Admin.Manager.Environment.Conditions.TimeOfDayBar.Fallback',
      undefined,
      {
        hours: bar.hoursPerDay,
        values: formatList(bar.unplaced),
      }
    )}
    class="manager-time-of-day-bar"
    data-time-of-day-fallback
  />
{/if}
