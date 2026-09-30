/**
 * Escape text destined for HTML so user-authored names cannot inject markup. It deliberately does
 * not escape `'`, so every attribute a card writes is double-quoted. A leaf, so the die tiles'
 * renderer and the result cards share it without importing one another.
 */
export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
