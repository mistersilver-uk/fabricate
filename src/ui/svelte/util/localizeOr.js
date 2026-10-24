import { fill } from '../../../utils/fillPlaceholders.js';
import { localizeWith } from '../../../utils/localizeWithFallback.js';

import { localize } from './foundryBridge.js';

/**
 * `key` translated, else `fallback ?? key`, and `fallback ?? ''` for an empty key. With `data`, the
 * chosen template's `{name}` placeholders are filled by one replacer on either path and an unsupplied
 * one stays verbatim; without it the template is returned as written. Core `format` is never called.
 */
export function localizeOr(key, fallback, data = null) {
  const template = key ? localizeWith(localize, key, undefined, fallback ?? key) : (fallback ?? '');
  return data == null ? template : fill(template, data);
}

/**
 * A tab list for `EditorTabs` with each tab's `labelKey`, `ariaLabelKey` and `tooltipKey` resolved
 * by `localizeOr` over its `label`, `ariaLabel` and `tooltip`, and the keys dropped.
 */
export function localizeTabs(tabs) {
  return tabs.map(({ labelKey, ariaLabelKey, tooltipKey, ...tab }) => ({
    ...tab,
    label: localizeOr(labelKey, tab.label),
    ariaLabel: localizeOr(ariaLabelKey, tab.ariaLabel),
    tooltip: localizeOr(tooltipKey, tab.tooltip),
  }));
}

/**
 * An option list for `RadioCardGroup` with each option's `labelKey` and `descKey` resolved by
 * `localizeOr` over its `label || fallback` and `description || descFallback`, and the four keys
 * dropped.
 */
export function localizeOptions(options) {
  return options.map(({ labelKey, fallback, descKey, descFallback, ...option }) => ({
    ...option,
    label: localizeOr(labelKey, option.label || fallback),
    description: localizeOr(descKey, option.description || descFallback),
  }));
}
