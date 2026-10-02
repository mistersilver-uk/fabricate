/**
 * `{token}` substitution for a localized template. One pass over the template, so a value that
 * itself contains `{token}` text is inserted literally and never substituted again; an unknown
 * token is left as written.
 */
export function fill(template, values) {
  return String(template ?? '').replaceAll(/\{(\w+)\}/g, (whole, token) =>
    Object.hasOwn(values, token) ? String(values[token]) : whole
  );
}
