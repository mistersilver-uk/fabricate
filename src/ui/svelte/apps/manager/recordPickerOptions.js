/**
 * A record picker's options — the `leading` clear option, then one per record, trailing
 * `disabledSuffix` unless `enabled` is true — and its trigger label: the leading label with no
 * `value`, else the chosen record's name, else `staleLabel` for an unknown or nameless record.
 */
export function recordPickerOptions({
  records,
  value,
  leading,
  recordIcon,
  disabledSuffix,
  staleLabel,
}) {
  const options = [
    { id: '', label: leading.label, icon: leading.icon },
    ...records.map((record) => ({
      id: record.id,
      label: record.name,
      icon: recordIcon,
      trailing: record.enabled ? '' : disabledSuffix,
    })),
  ];
  const selectedName = value
    ? records.find((record) => record.id === value)?.name || staleLabel
    : leading.label;
  return { options, selectedName };
}
