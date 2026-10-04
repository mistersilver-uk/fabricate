import { fill } from '../../../utils/fillPlaceholders.js';
import { localizeWith } from '../../../utils/localizeWithFallback.js';

import { localize } from './foundryBridge.js';

/**
 * `key` translated, else `fallback ?? key`, and `fallback ?? ''` for an empty key. With `data`, the
 * chosen template's `{name}` placeholders are filled by one replacer on either path and an unsupplied
 * one stays verbatim; without it the template is returned as written. Core `format` is never called.
 */
export function localizeOr(key, fallback, data) {
  const template = key ? localizeWith(localize, key, undefined, fallback ?? key) : (fallback ?? '');
  return data == null ? template : fill(template, data);
}
