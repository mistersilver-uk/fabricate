/** Scoped-component CSS for the real-browser computed-CSS gates (issue 883). */
import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';

/**
 * Compiles a `.svelte` file and returns its scoped CSS with the hash class Svelte generated.
 *
 * @param {string} componentPath absolute path to the component
 * @returns {{ css: string, hashClass: string }} the emitted CSS and its `svelte-<hash>` class
 */
export function scopedComponentCss(componentPath) {
  const source = readFileSync(componentPath, 'utf8');
  const { css } = compile(source, { filename: componentPath, css: 'external' });
  const code = css?.code || '';
  const hashClass = code.match(/\.(svelte-[a-z0-9]+)\b/)?.[1] || '';
  if (!code || !hashClass) {
    throw new Error(`${componentPath} emitted no scoped CSS — the gate would prove nothing`);
  }
  return { css: code, hashClass };
}

/**
 * Adds the scoping hash to every element in a fixture carrying `className`, so the fixture's
 * specificity matches what Svelte actually renders.
 *
 * @param {string} fixture the fixture HTML
 * @param {string} className the primitive's contract class, e.g. `manager-chip`
 * @param {string} hashClass the `svelte-<hash>` class from {@link scopedComponentCss}
 * @returns {string} the fixture with the hash applied
 */
export function withScopeHash(fixture, className, hashClass) {
  // Only `class="…"` attributes that carry the contract class as a whole token, so
  // `manager-chip-row` (a container, not a chip) is left alone.
  return fixture.replace(/class="([^"]*)"/g, (whole, value) =>
    value.split(/\s+/).includes(className) ? `class="${value} ${hashClass}"` : whole
  );
}
